// Lagkamp storage on this phone: one IndexedDB database with games and the photos
// frozen into them. Every write checks the stored revision in the same transaction,
// so two tabs cannot silently overwrite each other. Errors are passed on, never
// swallowed: the game must not say "saved" when it is not.
(function (root) {
  "use strict";
  const NAME = "drinkrate-lagkamp";
  const VERSION = 1;
  const BUDGET = 10 * 1024 * 1024; // photos per game; far above what 15 thumbnails need
  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error("NO_STORAGE")); return; }
      let req;
      try { req = root.indexedDB.open(NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "sessionId" }).createIndex("owner", "ownerKey");
        if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "key" }).createIndex("session", "sessionId");
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error("OPEN_FAILED"));
      req.onblocked = () => reject(new Error("BLOCKED"));
    });
    opening.catch(() => { opening = null; });
    return opening;
  }

  // Runs `work(tx, done)` in one transaction. Resolves with what `done` was given once
  // the transaction has committed; rejects if it aborts (quota, a thrown error, …).
  function run(stores, mode, work) {
    return open().then((db) => new Promise((resolve, reject) => {
      let tx, result;
      try { tx = db.transaction(stores, mode); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error("ABORTED"));
      const fail = (e) => { try { tx.abort(); } catch { /* already finished */ } reject(e); };
      try { work(tx, (r) => { result = r; }, fail); } catch (e) { fail(e); }
    }));
  }
  const mediaKey = (sessionId, mediaId) => `${sessionId}/${mediaId}`;

  // All games stored for one person (raw; the caller checks them).
  function list(ownerKey) {
    return run(["sessions"], "readonly", (tx, done) => {
      tx.objectStore("sessions").index("owner").getAll(ownerKey).onsuccess = (e) => done(e.target.result || []);
    });
  }

  // A new game with its photos, in one go. Refused if this person already has a game in progress.
  function create(session, media) {
    const size = media.reduce((n, m) => n + m.data.byteLength, 0);
    if (size > BUDGET) return Promise.reject(Object.assign(new Error("BUDGET"), { size }));
    return run(["sessions", "media"], "readwrite", (tx, done, fail) => {
      const sessions = tx.objectStore("sessions");
      sessions.index("owner").getAll(session.ownerKey).onsuccess = (e) => {
        const busy = (e.target.result || []).find((s) => s && s.sessionId !== session.sessionId && (s.status === "active" || s.status === "paused"));
        if (busy) { done({ ok: false, conflict: true, latest: busy }); return; }
        try {
          sessions.add(session);
          const store = tx.objectStore("media");
          for (const m of media) store.put({ key: mediaKey(session.sessionId, m.mediaId), sessionId: session.sessionId, type: m.type, data: m.data });
          done({ ok: true });
        } catch (err) { fail(err); }
      };
    });
  }

  // Saves a newer state of a game that was last stored at revision `expected`.
  function save(session, expected) {
    return run(["sessions"], "readwrite", (tx, done, fail) => {
      const sessions = tx.objectStore("sessions");
      sessions.get(session.sessionId).onsuccess = (e) => {
        const cur = e.target.result;
        if (!cur) { done({ ok: false, missing: true }); return; }
        if (cur.revision !== expected) { done({ ok: false, conflict: true, latest: cur }); return; }
        try { sessions.put(session); done({ ok: true }); } catch (err) { fail(err); }
      };
    });
  }

  function media(sessionId, mediaId) {
    return run(["media"], "readonly", (tx, done) => {
      tx.objectStore("media").get(mediaKey(sessionId, mediaId)).onsuccess = (e) => {
        const m = e.target.result;
        done(m && m.data ? new Blob([m.data], { type: m.type || "image/jpeg" }) : null);
      };
    });
  }

  function removeIn(tx, sessionId) {
    tx.objectStore("sessions").delete(sessionId);
    const store = tx.objectStore("media");
    store.index("session").getAllKeys(sessionId).onsuccess = (e) => { for (const k of e.target.result || []) store.delete(k); };
  }
  function remove(sessionId) {
    return run(["sessions", "media"], "readwrite", (tx, done) => { removeIn(tx, sessionId); done(true); });
  }

  // Keeps at most one game in progress and the newest finished one per person. Games
  // that cannot be read are left alone until the person chooses to start over.
  function prune(ownerKey, isValid) {
    return run(["sessions", "media"], "readwrite", (tx, done) => {
      tx.objectStore("sessions").index("owner").getAll(ownerKey).onsuccess = (e) => {
        const all = (e.target.result || []).filter((s) => isValid(s));
        const live = all.filter((s) => s.status === "active" || s.status === "paused").sort((a, b) => b.updatedAt - a.updatedAt);
        const done1 = all.filter((s) => s.status === "finished").sort((a, b) => b.updatedAt - a.updatedAt);
        const keep = new Set([live[0], done1[0]].filter(Boolean).map((s) => s.sessionId));
        const gone = all.filter((s) => !keep.has(s.sessionId));
        for (const s of gone) removeIn(tx, s.sessionId);
        done(gone.length);
      };
    });
  }

  root.DR_LAGKAMP_STORE = { open, list, create, save, media, remove, prune, BUDGET };
})(typeof window !== "undefined" ? window : globalThis);
