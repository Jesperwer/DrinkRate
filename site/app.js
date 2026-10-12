(() => {
  "use strict";

  const CFG = window.DR_CONFIG || {};
  const FAMILY = CFG.family || [];
  const BARS = window.BARS;
  const DRINKS = window.DRINKS;
  const BAR = Object.fromEntries(BARS.map((b) => [b.id, b]));
  const DRINK = Object.fromEntries(DRINKS.map((d) => [d.id, d]));
  const INS = window.DR_INSIGHTS;
  const QZ = window.DR_QUIZ;
  // Holiday features are off unless switched on in config.js.
  const on = (f) => !!(CFG.features && CFG.features[f]);
  const BDAY = CFG.birthday || null;
  const known = (id) => !!DRINK[id];
  const CAT = {
    cocktail: { name: "Cocktails", e: "🍹" },
    free: { name: "Alkoholfritt", e: "🥤" },
    beer: { name: "Øl", e: "🍺" },
    wine: { name: "Vin & bobler", e: "🍷" },
    spirit: { name: "Brennevin & likør", e: "🥃" },
    coffee: { name: "Kaffe & te", e: "☕" },
  };
  const CAT_ORDER = Object.keys(CAT);
  const SCORE_WORDS = ["", "Uff", "Dårlig", "Svak", "Så som så", "Helt ok", "Grei", "God", "Veldig god", "Nydelig", "Perfekt!"];
  const AVATAR_COLORS = ["#e2553f", "#0d7a96", "#e39b21", "#4f9a62", "#8a5cb8", "#d0507f", "#3d7fd1", "#a0703c"];
  const LS_KEY = "drinkrate.session";

  const root = document.getElementById("root");
  const toastEl = document.getElementById("toast");

  // ── Helpers ────────────────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const initial = (name) => esc((name || "?").trim().charAt(0).toUpperCase());
  const colorFor = (name) => {
    const i = FAMILY.findIndex((n) => norm(n) === norm(name));
    if (i >= 0) return AVATAR_COLORS[i % AVATAR_COLORS.length];
    let h = 0;
    for (const ch of norm(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
  const barNames = (ids) => ids.map((id) => BAR[id].name).join(" · ");
  // 1 → warm red, 10 → fresh green
  const scoreColor = (v) => `hsl(${Math.round(4 + ((v - 1) / 9) * 136)} 70% 46%)`;
  const avatar = (name, cls = "") => `<span class="avatar ${cls}" style="--av:${colorFor(name)}">${initial(name)}</span>`;
  const isMe = (name) => norm(name) === norm(state.session?.name);

  function drinkEmoji(d) {
    const n = norm(d.name + " " + d.desc);
    if (d.cat === "coffee") return /iced|freddo|frapp/.test(n) ? "🧋" : /tea/.test(n) ? "🍵" : /chocolate/.test(n) ? "🍫" : "☕";
    if (d.cat === "beer") return "🍺";
    if (d.cat === "wine") return /champagne|prosecco|sparkling|perignon|ruinart|drappier/.test(n) ? "🍾" : /rose/.test(n) ? "🌸" : /^white|xynisteri|pinot grigio|chablis|sancerre|soave|lugana|chardonnay|sauvignon blanc/.test(norm(d.desc + " " + d.name)) ? "🥂" : "🍷";
    if (d.cat === "spirit") return /liqueur|cream|amaretto|limoncello/.test(n) ? "🍶" : "🥃";
    if (/^strawberry/.test(n)) return "🍓";
    if (/^mango/.test(n)) return "🥭";
    if (/^passion fruit/.test(n)) return "🌺";
    if (/^chocolate milkshake/.test(n)) return "🍫";
    if (/^peach/.test(n)) return "🍑";
    if (d.cat === "free") {
      if (/smoothie|acai/.test(n)) return "🥤";
      if (/milkshake/.test(n)) return "🥛";
      if (/water|perrier|pellegrino/.test(n)) return "💧";
      if (/slush/.test(n)) return "🧊";
      if (/juice|zinger|carrot|ginger|lemon/.test(n)) return "🧃";
      if (/colada/.test(n)) return "🥥";
      if (/mojito/.test(n)) return "🌿";
      return "🫧";
    }
    if (/frozen/.test(n)) return "🧊";
    if (/colada|coconut/.test(n)) return "🥥";
    if (/mojito|basil|mint leaves/.test(n)) return "🌿";
    if (/martini|cosmopolitan|manhattan|negroni/.test(n)) return "🍸";
    if (/spritz|hugo|sparkling wine|prosecco/.test(n)) return "🥂";
    if (/margarita|rita|paloma|tequila/.test(n)) return "🌵";
    if (/sour|lemon/.test(n)) return "🍋";
    if (/berry|strawberr|raspberr/.test(n)) return "🍓";
    if (/peach/.test(n)) return "🍑";
    if (/orange|sunrise/.test(n)) return "🍊";
    if (/tonic|gin/.test(n)) return "🫒";
    return "🍹";
  }

  const ICONS = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14l-7 8z"/><path d="M12 12v7M8 20h8"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/></svg>',
    swipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7-.3 2-1.3 3.3-2.5 4 .3-3.5-1.5-7-4.5-9 .3 3-1.2 5.3-2.8 7C4.4 11.4 5 13 5 15c0 4.3 3 7 7 7z"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };
  const TABS = [["list", "Drinker"], ["swipe", "Swipe"], ["top", "Toppliste"], ["family", "Familien"], ["me", "Meg"]];

  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(s)) return "";
    if (s < 60) return "akkurat nå";
    if (s < 3600) return `${Math.floor(s / 60)} min siden`;
    if (s < 86400) return `${Math.floor(s / 3600)} t siden`;
    if (s < 172800) return "i går";
    return new Date(iso).toLocaleDateString("no-NO", { day: "numeric", month: "short" });
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // ── Easter eggs ────────────────────────────────────────────
  function rain(emojis, n = 26) {
    return Array.from({ length: n }, (_, i) => {
      const x = (Math.random() * 2 - 1) * 48;
      const y = -(20 + Math.random() * 60);
      const r = Math.round(Math.random() * 720 - 360);
      const e = emojis[i % emojis.length];
      return `<i style="--x:${x.toFixed(1)}vw;--y:${y.toFixed(1)}vh;--r:${r}deg;animation-delay:${(Math.random() * 0.3).toFixed(2)}s">${e}</i>`;
    }).join("");
  }
  let fxTimer;
  function showFx(cls, inner, ms = 3000) {
    document.querySelector(".fx")?.remove();
    const el = document.createElement("div");
    el.className = `fx ${cls}`;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = inner;
    el.addEventListener("click", () => el.remove());
    document.body.appendChild(el);
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => el.remove(), ms);
  }
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* not supported */ } };

  // Per-person memory on this phone: wish list, skipped swipes and found stickers.
  const store = {
    key: (k) => `drinkrate.${norm(state.session?.name)}.${k}`,
    get(k, def) { try { return JSON.parse(localStorage.getItem(this.key(k))) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // hint: shown when you tap a sticker you have not found yet.
  const STICKERS = [
    { id: "miranda", e: "👑", name: "Miranda", hint: "Et visst navn gjør magi i søkefeltet." },
    { id: "six7", e: "🫴", name: "6-7", hint: "To tall som etter hverandre gjør ungdommen gal." },
    { id: "perfect", e: "💯", name: "Perfekt 10", hint: "Gi en drink den aller høyeste karakteren." },
    { id: "yuck", e: "🤢", name: "Uff", hint: "Gi en drink den aller laveste karakteren." },
    { id: "agree", e: "🙌", name: "Enige", hint: "Gi en drink samme karakter som noen andre i familien." },
    { id: "match", e: "💘", name: "Match", hint: "Sveip til høyre på noe familien elsker." },
    { id: "cheers", e: "🥂", name: "Skål", hint: "Si skål – i søkefeltet." },
    { id: "disco", e: "🪩", name: "Disco", hint: "Tittelen øverst tåler mer enn ett trykk …" },
  ];
  // Anne's birthday sticker stays in the book after the day, so earned ones keep showing.
  if (BDAY && BDAY.id) {
    const [y, m, d] = BDAY.date.split("-").map(Number);
    const day = `${d}. ${["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"][m - 1]} ${y}`;
    STICKERS.push({ id: BDAY.id, e: "🎂", name: `${BDAY.name} ${y}`, bday: true,
      hint: () => (INS.dateIn(BDAY.tz) > BDAY.date ? `Ble delt ut på ${BDAY.name}s bursdag ${day}.` : `Kommer på ${BDAY.name}s bursdag ${day}. Se etter banneret!`) });
  }
  function award(id, quiet) {
    if (!state.session || !STICKERS.some((st) => st.id === id)) return;
    const have = store.get("stickers", []);
    if (have.includes(id)) return;
    store.set("stickers", [...have, id]);
    (serverStickers[norm(state.session.name)] ||= new Set()).add(id);
    rpc("dr_award", { p_token: state.session.token, p_sticker: id }).catch(() => { /* synced on next refresh */ });
    if (quiet) return;
    const st = STICKERS.find((x) => x.id === id);
    setTimeout(() => {
      document.querySelector(".sticker-pop")?.remove();
      const el = document.createElement("div");
      el.className = "sticker-pop";
      el.innerHTML = `<span class="sticker s-${st.id}"><span>${st.e}</span><b>${esc(st.name)}</b></span><small>Nytt klistremerke!</small>`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2800);
    }, document.querySelector(".fx") ? 2200 : 0);
  }

  const discoBall = (size) => `<div class="ball ${size}"><span class="tiles"></span><span class="shine"></span><span class="glint g1">✦</span><span class="glint g2">✦</span></div>`;

  const EGGS = {
    sixSeven() {
      showFx("six7", `<div class="fx-burst">${rain(["🟥", "🟨", "🟦", "🟩", "🟪"], 30)}</div>
        <div class="six7-nums"><b class="n6">6</b><b class="n7">7</b></div>
        <div class="six7-hands"><span class="h1">🫴</span><span class="h2">🫴</span></div>
        <div class="fx-text shake">SIX SEVEN!</div>`, 3200);
      vibrate([60, 80, 60, 80, 60]);
    },
    perfect(name) {
      showFx("perfect", `<div class="fx-burst">${rain(["🎉", "✨", "⭐", "🍹", "🥳"], 34)}</div>
        <div class="fx-big">10</div><div class="fx-text">PERFEKT!</div><div class="fx-sub">${esc(name)} er en vinner</div>`, 2600);
      vibrate([40, 40, 120]);
    },
    yuck() {
      document.body.classList.add("quake");
      setTimeout(() => document.body.classList.remove("quake"), 650);
      showFx("yuck", `<div class="fx-big">🤢</div><div class="fx-text">UFF!</div><div class="fx-sub">Den går rett i vasken</div>`, 1900);
      vibrate([200]);
    },
    cheers() {
      showFx("cheers", `<div class="fx-burst">${rain(["🫧", "✨", "🫧"], 22)}</div>
        <div class="clink"><span class="g1">🥂</span><span class="g2">🥂</span></div><div class="fx-text">SKÅL!</div>`, 2600);
      vibrate([30, 60, 30]);
    },
    miranda() {
      showFx("miranda-fx", `<div class="fx-burst">${rain(["✨", "💖", "⭐", "💅"], 28)}</div>
        <div class="mega-sticker"><span class="holo"></span><span class="ms-e">👑</span><b>MIRANDA</b><small>Limited edition</small></div>`, 3400);
      vibrate([30, 30, 30, 30, 120]);
    },
    agree(names) {
      showFx("agree-fx", `<div class="fx-burst">${rain(["🙌", "✨", "🤝"], 20)}</div>
        <div class="fx-big">🙌</div><div class="fx-text">ENIGE!</div><div class="fx-sub">Samme karakter som ${esc(names.join(" og "))}</div>`, 2400);
      vibrate([40, 60, 40]);
    },
    match(d, s) {
      showFx("match-fx", `<div class="fx-burst">${rain(["💘", "💖", "✨", "💕"], 30)}</div>
        <div class="fx-text match-title">It's a match!</div>
        <div class="match-pair"><span class="mp">${avatar(state.session.name, "xl")}</span><span class="mp mp-d">${drinkEmoji(d)}</span></div>
        <div class="fx-sub">${esc(d.name)} · familien gir den ${fmt(s.avg)}</div>`, 3000);
      vibrate([60, 40, 60]);
    },
    disco() {
      // A mirror ball drops in, then hangs over the page while the lights spin.
      document.querySelector(".disco-hang")?.remove();
      document.body.classList.add("disco");
      showFx("disco-fx", `<div class="fx-burst">${rain(["✨", "💃", "🕺", "✨", "🎶"], 24)}</div>
        <div class="ball-drop"><i class="string"></i>${discoBall("big")}</div>
        <div class="fx-text">DISCO!</div>`, 2600);
      const hang = document.createElement("div");
      hang.className = "disco-hang";
      hang.setAttribute("aria-hidden", "true");
      hang.innerHTML = `<i class="string"></i>${discoBall("")}<div class="spots">${Array.from({ length: 14 }, (_, i) =>
        `<b style="--a:${i * 26}deg;--d:${(i % 5) * 0.4}s;--c:${["#ff5ea8", "#5ee7ff", "#ffe45e", "#9d7bff", "#5eff9a"][i % 5]}"></b>`).join("")}</div>`;
      hang.addEventListener("click", () => { hang.remove(); document.body.classList.remove("disco"); });
      setTimeout(() => document.body.appendChild(hang), 2300);
      setTimeout(() => { hang.remove(); document.body.classList.remove("disco"); }, 11000);
      vibrate([40, 40, 40, 40, 40, 40]);
    },
    birthday() {
      showFx("bday-fx", `<div class="fx-burst">${rain(["🎉", "🎂", "🎈", "✨", "🥳"], 34)}</div>
        <div class="fx-big">🎂</div><div class="fx-text">GRATULERER!</div><div class="fx-sub">${esc(BDAY.name)} har bursdag i dag</div>`, 3000);
      vibrate([40, 40, 120]);
    },
  };
  // Every egg also hands out its sticker.
  const STICKER_FOR = { sixSeven: "six7", perfect: "perfect", yuck: "yuck", cheers: "cheers", disco: "disco", miranda: "miranda", agree: "agree", match: "match", birthday: BDAY && BDAY.id };
  for (const k of Object.keys(EGGS)) {
    const f = EGGS[k];
    EGGS[k] = (...a) => { f(...a); award(STICKER_FOR[k], k === "miranda"); };
  }
  const SEARCH_EGGS = [
    [/\bmiranda\b/, "miranda"],
    [/6\s*-?\s*7/, "sixSeven"],
    [/\b(skal|skaal|cheers|yamas|prost|salud)\b/, "cheers"],
    [/\bdisco\b/, "disco"],
  ];
  const fired = { q: "", comment: "" };
  function checkEggs(field, value) {
    const v = norm(value);
    const hit = SEARCH_EGGS.find(([re]) => re.test(v));
    const key = hit ? hit[1] : "";
    if (key && fired[field] !== key) EGGS[key]();
    fired[field] = key;
  }

  // ── API ────────────────────────────────────────────────────
  const ERR = {
    BAD_NAME: "Ugyldig navn.",
    BAD_PIN: "Feil PIN-kode. Prøv igjen.",
    NO_USER: "Du har ikke valgt PIN-kode ennå. Velg en nå.",
    NAME_TAKEN: "Du har allerede en PIN-kode. Logg inn med den.",
    LOCKED: "For mange forsøk. Vent 5 minutter og prøv igjen.",
    NETWORK: "Får ikke kontakt. Sjekk nettet og prøv igjen.",
    REGISTRATION_CLOSED: "Nye brukere er stengt. Ta kontakt med Jesper.",
  };
  // Only reads are retried automatically. A write that timed out may still
  // have reached the database, so saveRating checks before sending again.
  const READS = new Set(["dr_list_users", "dr_get_ratings", "dr_get_stickers", "dr_drink_photos", "dr_photo", "dr_recent_photos"]);

  async function rpc(fn, args, attempt = 0) {
    const headers = { "Content-Type": "application/json", apikey: CFG.key };
    if (String(CFG.key).startsWith("eyJ")) headers.Authorization = "Bearer " + CFG.key;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${CFG.url.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
        method: "POST", headers, body: JSON.stringify(args || {}), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt < 1 && READS.has(fn)) return rpc(fn, args, attempt + 1);
      const err = new Error("NETWORK");
      err.cause = e;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── State ──────────────────────────────────────────────────
  const state = {
    session: loadSession(), // { token, name }
    users: [],
    ratings: [], // { drink, name, score, bar, comment, at }
    loaded: false,
    tab: "list",
    bar: "all",
    cat: "all",
    aiOnly: false,
    q: "",
    topCat: "all",
    sheet: null, // drink id | "menu" | "person:<name>"
    draft: null, // { score, bar, comment, photo, ... } for the open drink
    saving: false,
    loadError: false, // the first load failed: show "try again", not an empty family
    lastSync: null, // time of the last successful load
    stale: false, // a later reload failed; showing data from lastSync
    quiz: null, // the running quiz round
  };
  // True while `token` is still the logged-in session, so answers that arrive
  // after logging out or switching person are dropped.
  const current = (token) => !!state.session && state.session.token === token;

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
  }
  function saveSession(s) {
    state.session = s;
    try { s ? localStorage.setItem(LS_KEY, JSON.stringify(s)) : localStorage.removeItem(LS_KEY); } catch { /* private mode */ }
  }

  // Everyone's stickers. Ones found on this phone before stickers were shared
  // (or while offline) are sent up here.
  let serverStickers = {};
  let stickersShared = false;
  async function loadStickers() {
    const token = state.session.token;
    try {
      const res = await rpc("dr_get_stickers", { p_token: token });
      if (!Array.isArray(res) || !current(token)) return;
      const map = {};
      for (const x of res) (map[norm(x.name)] ||= new Set()).add(x.sticker);
      serverStickers = map;
      stickersShared = true;
      const mine = map[norm(state.session.name)] || new Set();
      for (const id of [...store.get("stickers", []), ...earnedFromRatings(state.session.name)]) {
        if (!mine.has(id) && STICKERS.some((st) => st.id === id)) {
          mine.add(id);
          rpc("dr_award", { p_token: state.session.token, p_sticker: id }).catch(() => {});
        }
      }
      map[norm(state.session.name)] = mine;
    } catch { /* stickers.sql not run yet: own stickers still show from this phone */ }
  }
  // Stickers that follow from the ratings themselves, so they show for
  // everyone no matter which phone the person used.
  function earnedFromRatings(name) {
    const out = [];
    const mine = personRatings(name);
    if (mine.some((r) => r.score === 10)) out.push("perfect");
    if (mine.some((r) => r.score === 1)) out.push("yuck");
    const { byDrink } = derived();
    if (mine.some((r) => (byDrink[r.drink] || []).some((o) => norm(o.name) !== norm(name) && o.score === r.score))) out.push("agree");
    return out;
  }
  function stickersOf(name) {
    const set = new Set(serverStickers[norm(name)] || []);
    for (const id of earnedFromRatings(name)) set.add(id);
    if (isMe(name)) for (const id of store.get("stickers", [])) set.add(id);
    return STICKERS.filter((st) => set.has(st.id)).map((st) => st.id);
  }
  // Fresh stickers when looking at the family, without reloading everything.
  let stickersAt = 0;
  function freshStickers() {
    if (Date.now() - stickersAt < 8000) return;
    stickersAt = Date.now();
    loadStickers().then(() => { if (state.tab === "family" || String(state.sheet).startsWith("person:")) render(); });
  }

  async function refresh() {
    if (!state.session) return;
    const token = state.session.token;
    try {
      const [data] = await Promise.all([rpc("dr_get_ratings", { p_token: token }), loadStickers()]);
      if (!current(token)) return;
      if (data.error === "BAD_TOKEN") { logout(); return; }
      if (!Array.isArray(data.ratings)) throw new Error(data.error || "BAD_ANSWER");
      state.ratings = data.ratings.filter((r) => DRINK[r.drink]);
      if (data.me && data.me !== state.session.name) saveSession({ ...state.session, name: data.me });
      const wasLoaded = state.loaded && !state.loadError;
      Object.assign(state, { loaded: true, loadError: false, stale: false, lastSync: new Date() });
      // Do not rebuild the page under someone who is typing.
      const typing = document.activeElement?.name;
      if (wasLoaded && typing === "q") updateResults();
      else if (!(wasLoaded && typing === "comment")) render();
    } catch {
      if (!current(token)) return;
      if (!state.loaded || state.loadError) { Object.assign(state, { loaded: true, loadError: true }); render(); return; }
      if (!state.stale) { state.stale = true; if (!state.sheet) render(); }
      toast(ERR.NETWORK);
    }
  }

  function logout() {
    saveSession(null);
    state.ratings = [];
    state.sheet = null;
    state.draft = null;
    state.saving = false;
    // Nothing from this person may show for the next one on this phone.
    for (const k of Object.keys(photoCache)) delete photoCache[k];
    recentPhotos = null;
    serverStickers = {};
    stickersShared = false;
    stickersAt = 0;
    lastSwipe = null;
    Object.assign(session, { swipes: 0, likes: [] });
    document.body.style.overflow = "";
    Object.assign(state, { tab: "list", bar: "all", cat: "all", aiOnly: false, q: "", topCat: "all",
      loaded: false, loadError: false, stale: false, lastSync: null, quiz: null, pick: null });
    renderLogin();
  }

  // ── Derived data ───────────────────────────────────────────
  let cache = { ratings: null };
  function derived() {
    if (cache.ratings === state.ratings) return cache;
    const byDrink = {};
    const byPerson = {};
    for (const r of state.ratings) {
      (byDrink[r.drink] ||= []).push(r);
      (byPerson[norm(r.name)] ||= []).push(r);
    }
    for (const list of Object.values(byDrink)) list.sort((a, b) => b.score - a.score);
    cache = { ratings: state.ratings, byDrink, byPerson };
    return cache;
  }
  function summary(list) {
    if (!list || !list.length) return null;
    return { avg: list.reduce((s, r) => s + r.score, 0) / list.length, n: list.length };
  }
  const myRating = (list) => (list || []).find((r) => isMe(r.name)) || null;
  const personRatings = (name) => derived().byPerson[norm(name)] || [];
  const people = () => {
    const names = [...FAMILY];
    for (const r of state.ratings) if (!names.some((n) => norm(n) === norm(r.name))) names.push(r.name);
    return names;
  };

  // ── Login screen ───────────────────────────────────────────
  const login = { mode: "pick", name: "", error: "", busy: false, ready: false };
  const isRegistered = (name) => state.users.some((u) => norm(u) === norm(name));

  async function renderLogin() {
    if (!CFG.url || !CFG.key) {
      root.innerHTML = `<div class="wrap login">${brand()}<div class="panel"><h2>Nesten klar</h2>
        <p class="hint">Siden er ikke koblet til databasen ennå. Legg inn Supabase-adressen og nøkkelen i <b>config.js</b>.</p></div></div>`;
      return;
    }
    login.ready = false;
    drawLogin();
    try {
      state.users = await rpc("dr_list_users", {});
      login.ready = true;
      login.error = "";
    } catch {
      login.error = ERR.NETWORK;
    }
    if (!state.session) drawLogin();
  }

  function brand() {
    return `<div class="brand"><img class="brand-mark" src="icon-192.png" alt="">
      <h1>DrinkRate</h1><p>Familiens drinkguide fra ferien</p></div>`;
  }

  function pinField(name, label, autocomplete) {
    return `<label class="field"><span>${label}</span>
      <input class="input pin" name="${name}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${autocomplete}" required></label>`;
  }

  function drawLogin() {
    let body;
    const names = FAMILY.length ? FAMILY : state.users;
    if (login.mode === "pick") {
      body = `<h2>Hvem er du?</h2>
        <div class="people">
          ${names.map((n) => `<button class="person" data-pick="${esc(n)}" ${login.ready ? "" : "disabled"}>
            ${avatar(n, "sm")}${esc(n)}</button>`).join("")}
        </div>
        <p class="error">${esc(login.error)}</p>
        ${!login.ready && login.error ? `<button class="btn" data-act="retry">Prøv igjen</button>` : ""}`;
    } else if (login.mode === "pin") {
      body = `<h2>Hei, ${esc(login.name)}!</h2>
        <form data-form="login">
          ${pinField("pin", "Din PIN-kode", "current-password")}
          <p class="error">${esc(login.error)}</p>
          <button class="btn" ${login.busy ? "disabled" : ""}>Logg inn</button>
        </form>
        <button class="link" data-act="back">Ikke deg? Velg et annet navn</button>`;
    } else {
      body = `<h2>Velkommen, ${esc(login.name)}!</h2>
        <p class="hint" style="margin-top:0">Velg en PIN-kode på 4 tall. Du bruker den når du logger inn på en ny telefon.</p>
        <form data-form="register">
          ${pinField("pin", "Velg PIN-kode", "new-password")}
          ${pinField("pin2", "Gjenta PIN-koden", "new-password")}
          <p class="error">${esc(login.error)}</p>
          <button class="btn coral" ${login.busy ? "disabled" : ""}>Kom i gang</button>
        </form>
        <button class="link" data-act="back">Ikke deg? Velg et annet navn</button>`;
    }
    root.innerHTML = `<div class="sky"></div><div class="wrap login">${brand()}<div class="panel">${body}</div></div>`;
    root.querySelector("input[name=pin]")?.focus();
  }

  async function submitLogin(form, kind) {
    const pin = form.pin.value.trim();
    if (!/^\d{4}$/.test(pin)) { login.error = "PIN-koden må være 4 tall."; drawLogin(); return; }
    if (kind === "register" && form.pin2.value.trim() !== pin) { login.error = "PIN-kodene er ikke like."; drawLogin(); return; }
    login.busy = true; login.error = ""; drawLogin();
    try {
      const res = await rpc(kind === "register" ? "dr_register" : "dr_login", { p_name: login.name, p_pin: pin });
      login.busy = false;
      // Someone else set this person up meanwhile, or the list was stale.
      if (res.error === "NAME_TAKEN") { state.users.push(login.name); login.mode = "pin"; }
      if (res.error === "NO_USER") login.mode = "new";
      if (res.error) { login.error = ERR[res.error] || "Noe gikk galt. Prøv igjen."; drawLogin(); return; }
      saveSession({ token: res.token, name: res.name });
      Object.assign(login, { mode: "pick", name: "", error: "" });
      startApp();
    } catch {
      login.busy = false; login.error = ERR.NETWORK; drawLogin();
    }
  }

  // ── Main app ───────────────────────────────────────────────
  function startApp() {
    state.loaded = false;
    render();
    refresh();
  }

  function render() {
    if (!state.session) return renderLogin();
    const scrollY = window.scrollY;
    const sheetScroll = root.querySelector(".sheet")?.scrollTop || 0;
    let content;
    if (!state.loaded) content = `<div class="loading"><span class="spin">🍹</span>Henter vurderinger …</div>`;
    else if (state.loadError) content = `<div class="empty load-error"><b>Får ikke hentet vurderingene</b>Sjekk nettet. Ingenting er borte – det er bare ikke lastet inn ennå.
      <button class="btn" data-act="reload">Prøv igjen</button></div>`;
    else if (state.tab === "list") content = viewList();
    else if (state.tab === "swipe") content = viewSwipe();
    else if (state.tab === "top") content = viewTop();
    else if (state.tab === "family") content = viewFamily();
    else content = viewMe();

    const title = TABS.find(([id]) => id === state.tab)[1];
    root.innerHTML = `<div class="sky"></div>
      <header class="top"><div class="wrap top-row">
        <h1 data-act="logo">${state.tab === "list" ? "DrinkRate" : title}</h1>
        <button class="me-btn" data-act="menu" aria-label="Meny">${avatar(state.session.name)}</button>
      </div></header>
      <main class="wrap tab-${state.tab}">${state.stale && state.loaded && !state.loadError ? staleNote() : ""}${content}</main>
      <nav class="nav"><div class="nav-in">
        ${TABS.map(([id, label]) =>
          `<button class="tab ${state.tab === id ? "on" : ""}" data-tab="${id}">${ICONS[id]}<span>${label}</span></button>`).join("")}
      </div></nav>
      ${state.sheet ? sheetHtml() : ""}`;

    window.scrollTo(0, scrollY);
    const sheet = root.querySelector(".sheet");
    if (sheet) {
      if (state.sheetOpened) state.sheetOpened = false;
      else { sheet.classList.add("still"); root.querySelector(".backdrop").classList.add("still"); sheet.scrollTop = sheetScroll; }
      // Bring news inside the sheet (the reveal, a photo that still needs sending) into view.
      if (state.scrollTo) { sheet.querySelector(state.scrollTo)?.scrollIntoView({ block: "center" }); state.scrollTo = null; }
    }
    onScroll();
  }

  const clock = (d) => d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
  const staleNote = () => `<button class="stale" data-act="reload">⚠️ Ikke oppdatert siden kl. ${clock(state.lastSync)}. Trykk for å prøve igjen.</button>`;

  function chips(items, active, attr, extraCls = "") {
    return `<div class="chips ${extraCls}">${items.map((it) =>
      `<button class="chip ${active === it.id ? "on" : ""}" data-${attr}="${it.id}">${it.e ? `<em>${it.e}</em>` : ""}${esc(it.name)}</button>`).join("")}</div>`;
  }

  function ring(s, size = "") {
    if (!s) return `<div class="ring none ${size}"><b>–</b></div>`;
    return `<div class="ring ${size}" style="--p:${(s.avg / 10) * 100}%;--rc:${scoreColor(s.avg)}"><b>${fmt(s.avg)}</b></div>`;
  }

  function raters(list) {
    if (!list || !list.length) return "";
    const shown = list.slice(0, 5);
    return `<span class="raters">${shown.map((r) =>
      `<span class="rater ${isMe(r.name) ? "is-me" : ""}" style="--av:${colorFor(r.name)}" title="${esc(r.name)}: ${r.score}">${initial(r.name)}<small>${r.score}</small></span>`).join("")}${list.length > 5 ? `<span class="rater more">+${list.length - 5}</span>` : ""}</span>`;
  }

  function priceTag(d) {
    if (d.ai.length) return `<span class="tag ai">Inkl.</span>`;
    return d.price ? `<span class="tag paid">${esc(d.price)}</span>` : "";
  }

  function drinkRow(d, lead = "") {
    const list = derived().byDrink[d.id];
    const s = summary(list);
    const mine = myRating(list);
    return `<button class="drink ${mine ? "tasted" : ""}" data-drink="${d.id}">
      ${lead}
      <span class="emoji cat-${d.cat}">${drinkEmoji(d)}</span>
      <span class="drink-main">
        <span class="drink-name">${esc(d.name)}</span>
        ${d.desc ? `<span class="drink-desc">${esc(d.desc)}</span>` : ""}
        <span class="drink-meta">${priceTag(d)}${list ? raters(list) : `<span class="where-small">${esc(barNames(d.bars))}</span>`}${list && list.some((r) => r.photo) ? `<span class="tag photo">📷 ${list.filter((r) => r.photo).length}</span>` : ""}</span>
      </span>
      <span class="score">${ring(s)}<small>${s ? `${s.n} ${s.n === 1 ? "stemme" : "stemmer"}` : "ingen ennå"}</small></span>
    </button>`;
  }

  function greeting() {
    const h = new Date().getHours();
    const name = esc(state.session.name);
    if (h < 5) return `Fortsatt våken, ${name}? 🦉`;
    if (h < 11) return `God morgen, ${name} ☀️`;
    if (h < 17) return `God ettermiddag, ${name} 🏖️`;
    if (h < 22) return `God kveld, ${name} 🌅`;
    return `Sen kveld, ${name} 🌙`;
  }

  function hero() {
    const mine = personRatings(state.session.name).length;
    const pct = Math.round((mine / DRINKS.length) * 100);
    const h = new Date().getHours();
    const tip = h < 5 ? "Husk et glass vann også 💧" : `Familien har gitt ${state.ratings.length} karakterer så langt`;
    return `<section class="hero">
      <div class="hero-glow"></div>
      <p class="hero-hi">${greeting()}</p>
      <p class="hero-sub">${tip}</p>
      <div class="hero-row">
        <div class="hero-prog">
          <div class="bar"><i style="width:${Math.max(pct, 2)}%"></i></div>
          <span>Du har smakt <b>${mine}</b> av ${DRINKS.length}</span>
        </div>
        <button class="dice" data-act="surprise">🎲 Overrask meg</button>
      </div>
    </section>`;
  }

  // Only on the birthday itself (date in BDAY.tz). The confetti starts when you tap.
  function birthdayBanner() {
    if (!on("birthday") || !BDAY || !INS.isEventDay(BDAY)) return "";
    const st = STICKERS.find((x) => x.id === BDAY.id);
    const hers = isMe(BDAY.name);
    const got = stickersOf(state.session.name).includes(BDAY.id);
    return `<section class="bday">
      <span class="bday-cake" aria-hidden="true">🎂</span>
      <div class="bday-main"><b>Gratulerer med dagen, ${esc(BDAY.name)}!</b>
        <p>${hers ? "Hele familien skåler for deg i dag 🥂" : `${esc(BDAY.name)} har bursdag i dag. Trykk for konfetti og bursdagsklistremerket.`}</p>
        ${got ? `<small>${st.e} ${esc(st.name)}-klistremerket er ditt</small>` : ""}</div>
      <button class="bday-btn" data-act="bday">🎉 ${hers ? "Feir!" : "Gratulerer!"}</button>
    </section>`;
  }

  function viewList() {
    const cats = [{ id: "all", name: "Alle" }, ...CAT_ORDER.map((id) => ({ id, name: CAT[id].name, e: CAT[id].e }))];
    return `${birthdayBanner()}${hero()}
      <div class="search">${ICONS.search}<input class="input" name="q" type="search" placeholder="Søk blant ${DRINKS.length} drinker" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search"></div>
      ${chips(cats, state.cat, "cat")}
      <div class="chips">
        <button class="chip toggle ${state.aiOnly ? "on" : ""}" data-act="aionly"><em>✦</em>Kun all inclusive</button>
        ${[{ id: "all", name: "Alle barer" }, ...BARS].map((b) =>
          `<button class="chip ${state.bar === b.id ? "on" : ""}" data-bar="${b.id}">${esc(b.name)}</button>`).join("")}
      </div>
      <div id="results">${listResults()}</div>`;
  }

  function filtered() {
    const q = norm(state.q);
    return DRINKS.filter((d) =>
      (state.bar === "all" || d.bars.includes(state.bar)) &&
      (state.cat === "all" || d.cat === state.cat) &&
      (!state.aiOnly || (state.bar === "all" ? d.ai.length : d.ai.includes(state.bar))) &&
      (!q || norm(d.name + " " + d.desc).includes(q)));
  }

  function listResults() {
    const hits = filtered();
    if (!hits.length) return `<div class="empty"><b>Ingen treff</b>Prøv et annet søk eller filter.</div>`;
    let html = "";
    for (const cat of CAT_ORDER) {
      const rows = hits.filter((d) => d.cat === cat);
      if (!rows.length) continue;
      html += `<div class="section-title"><h2>${CAT[cat].e} ${CAT[cat].name}</h2><small>${rows.length}</small></div>
        <div class="list">${rows.map((d) => drinkRow(d)).join("")}</div>`;
    }
    return html;
  }

  // Leaderboard score: the average pulled towards the family's overall average
  // by PRIOR imaginary votes, so more votes count for more (3 × 8 beats 2 × 8,5).
  // A drink needs MIN_VOTES votes to be ranked at all.
  const MIN_VOTES = 2;
  const PRIOR = 2;
  function weighted(s) {
    const all = state.ratings;
    const mean = all.length ? all.reduce((a, r) => a + r.score, 0) / all.length : 7;
    return (PRIOR * mean + s.avg * s.n) / (PRIOR + s.n);
  }
  function ranked(cat, withPending) {
    const { byDrink } = derived();
    const rows = DRINKS
      .filter((d) => cat === "all" || d.cat === cat)
      .map((d) => ({ d, s: summary(byDrink[d.id]) }))
      .filter((x) => x.s)
      .map((x) => ({ ...x, w: weighted(x.s) }));
    const top = rows.filter((x) => x.s.n >= MIN_VOTES)
      .sort((a, b) => b.w - a.w || b.s.n - a.s.n || a.d.name.localeCompare(b.d.name));
    if (!withPending) return top;
    const pending = rows.filter((x) => x.s.n < MIN_VOTES)
      .sort((a, b) => b.s.avg - a.s.avg || a.d.name.localeCompare(b.d.name));
    return { top, pending };
  }

  function viewTop() {
    const cats = [{ id: "all", name: "Alle" }, ...CAT_ORDER.map((id) => ({ id, name: CAT[id].name, e: CAT[id].e }))];
    const { top: list, pending } = ranked(state.topCat, true);
    let html = chips(cats, state.topCat, "topcat") +
      `<p class="hint rank-note">Rangert etter snitt veid med antall stemmer. Minst ${MIN_VOTES} stemmer for å komme på lista.</p>`;
    const pendingHtml = pending.length ? `<div class="section-title"><h2>⏳ Trenger flere stemmer</h2><small>${pending.length}</small></div>
      <p class="hint" style="margin:-4px 2px 10px">Bare én har smakt disse. Én stemme til, så er de med i konkurransen.</p>
      <div class="list">${pending.map((x) => drinkRow(x.d)).join("")}</div>` : "";
    if (!list.length) {
      return html + `<div class="empty"><b>Ingen drinker med ${MIN_VOTES} stemmer ennå</b>Smak det de andre har smakt, så fylles lista opp.</div>` + pendingHtml;
    }
    const podium = list.slice(0, 3);
    const order = [podium[1], podium[0], podium[2]].filter(Boolean);
    html += `<div class="podium">${order.map((x) => {
      const place = podium.indexOf(x) + 1;
      return `<button class="pod p${place}" data-drink="${x.d.id}">
        <span class="pod-medal">${["🥇", "🥈", "🥉"][place - 1]}</span>
        <span class="pod-emoji">${drinkEmoji(x.d)}</span>
        <span class="pod-name">${esc(x.d.name)}</span>
        <span class="pod-score" style="color:${scoreColor(x.s.avg)}">${fmt(x.s.avg)}</span>
        <span class="pod-n">${x.s.n} ${x.s.n === 1 ? "stemme" : "stemmer"}</span>
        <span class="pod-step">${place}</span>
      </button>`;
    }).join("")}</div>`;
    const rest = list.slice(3);
    if (rest.length) html += `<div class="list">${rest.map((x, i) => drinkRow(x.d, `<span class="rank">${i + 4}</span>`)).join("")}</div>`;
    return html + pendingHtml;
  }

  function awards() {
    const stats = people()
      .map((name) => {
        const rs = personRatings(name);
        return { name, n: rs.length, avg: rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : 0 };
      })
      .filter((p) => p.n);
    const out = [];
    if (stats.length) {
      const thirsty = [...stats].sort((a, b) => b.n - a.n)[0];
      out.push({ e: "🏆", t: "Mest tørst", name: thirsty.name, v: `${thirsty.n} smakt` });
    }
    const judged = stats.filter((p) => p.n >= 3);
    if (judged.length >= 2) {
      const kind = [...judged].sort((a, b) => b.avg - a.avg)[0];
      const strict = [...judged].sort((a, b) => a.avg - b.avg)[0];
      out.push({ e: "😇", t: "Mest raus", name: kind.name, v: `snitt ${fmt(kind.avg)}` });
      out.push({ e: "🧐", t: "Strengeste dommer", name: strict.name, v: `snitt ${fmt(strict.avg)}` });
    }
    const tens = stats.map((p) => ({ ...p, t: personRatings(p.name).filter((r) => r.score === 10).length })).sort((a, b) => b.t - a.t)[0];
    if (tens && tens.t) out.push({ e: "💯", t: "Flest tiere", name: tens.name, v: `${tens.t} stk` });
    const best = ranked("all")[0];
    if (best) out.push({ e: "👑", t: "Familiens favoritt", drink: best.d, v: fmt(best.s.avg) });
    const collector = people().map((name) => ({ name, n: stickersOf(name).length })).sort((a, b) => b.n - a.n)[0];
    if (collector && collector.n) out.push({ e: "🏅", t: "Flest klistremerker", name: collector.name, v: `${collector.n} av ${STICKERS.length}` });
    return out;
  }

  function viewFamily() {
    const aw = awards();
    let html = "";
    if (aw.length) {
      html += `<div class="awards">${aw.map((a) => `<div class="award">
        <span class="award-e">${a.e}</span><span class="award-t">${a.t}</span>
        ${a.drink ? `<b>${esc(a.drink.name)}</b>` : `<b>${avatar(a.name, "xs")} ${esc(a.name)}</b>`}
        <small>${a.v}</small></div>`).join("")}</div>`;
    }
    html += controversySection();
    if (on("quiz")) html += `<button class="game-btn" data-act="quiz"><span>🎲</span><span><b>Familiespill</b><small>Hvem skrev det? · Gjett karakteren</small></span></button>`;
    html += `<div class="section-title"><h2>Smakerne</h2><small>Trykk for å se alt</small></div><div class="people-list">`;
    for (const name of people()) {
      const rs = personRatings(name);
      const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : 0;
      const fav = [...rs].sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)))[0];
      html += `<button class="pcard" data-person="${esc(name)}">
        ${avatar(name, "lg")}
        <span class="pcard-main"><b>${esc(name)}${isMe(name) ? " <em>(deg)</em>" : ""}</b>
          <small>${rs.length ? `${rs.length} smakt · favoritt: ${esc(DRINK[fav.drink].name)}` : "Har ikke smakt noe ennå"}</small></span>
        ${stickersOf(name).length ? `<span class="pcard-stickers" title="Klistremerker">${stickersOf(name).slice(0, 3).map((id) => STICKERS.find((st) => st.id === id).e).join("")}<small>${stickersOf(name).length}</small></span>` : ""}
        ${rs.length ? `<span class="pcard-avg" style="--rc:${scoreColor(avg)}">${fmt(avg)}</span>` : ""}
      </button>`;
    }
    html += `</div>`;
    const feed = [...state.ratings].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 25);
    if (recentPhotos === null) loadRecentPhotos();
    if (recentPhotos && recentPhotos.length) {
      html += `<div class="section-title"><h2>📸 Bilder</h2><small>${recentPhotos.length}</small></div>
        <div class="gallery">${recentPhotos.map((p) => `<button class="g-item" data-photo="${p.drink}" data-who="${esc(p.name)}">
          <img alt="${esc(DRINK[p.drink].name)}" src="${p.thumb}" loading="lazy"><span>${avatar(p.name, "xs")} ${esc(DRINK[p.drink].name)}</span></button>`).join("")}</div>`;
    }
    html += `<div class="section-title"><h2>Siste smaksprøver</h2></div>`;
    html += feed.length ? `<div class="feed">${feed.map((r) => `<button class="feed-item" data-drink="${r.drink}">
        ${avatar(r.name, "sm")}
        <span class="feed-main"><span><b>${esc(r.name)}</b> ga <b>${esc(DRINK[r.drink].name)}</b>${r.bar && BAR[r.bar] ? ` <small>på ${esc(BAR[r.bar].name)}</small>` : ""}</span>
          ${r.comment ? `<q>${esc(r.comment)}</q>` : ""}<small class="when">${ago(r.at)}</small></span>
        <span class="badge" style="--rc:${scoreColor(r.score)}">${r.score}</span>
      </button>`).join("")}</div>` : `<div class="empty"><b>Stille her ennå</b>Første karakter blir historisk.</div>`;
    return html;
  }

  // Up to three drinks the family disagrees most about.
  function controversySection() {
    if (!on("controversy")) return "";
    const rows = INS.controversial(state.ratings, { known }).slice(0, 3);
    const title = `<div class="section-title"><h2>🔥 Mest omdiskutert</h2><small>størst sprik</small></div>`;
    if (!rows.length) return title + `<div class="empty small"><b>Ingen store sprik i vurderingene ennå.</b>Når minst tre har smakt samme drink og er uenige, dukker den opp her.</div>`;
    return title + `<div class="hot">${rows.map((x) => {
      const d = DRINK[x.drink];
      return `<button class="hot-card" data-drink="${d.id}">
        <span class="hot-head"><span class="emoji cat-${d.cat}">${drinkEmoji(d)}</span><b>${esc(d.name)}</b>${x.shared ? `<em>delt ${x.place}. plass</em>` : ""}</span>
        <span class="hot-range"><b style="color:${scoreColor(x.min)}">${x.min}</b> til <b style="color:${scoreColor(x.max)}">${x.max}</b><small>sprik ${x.spread} · ${x.n} personer</small></span>
        <span class="hot-votes">${x.votes.map((v) => `<span class="hv">${avatar(v.name, "xs")}${esc(v.name)} <b>${v.score}</b></span>`).join("")}</span>
      </button>`;
    }).join("")}</div>`;
  }

  function twinsSection() {
    if (!on("twins")) return "";
    const { twins } = INS.twins(state.ratings, state.session.name, { known });
    const title = `<div class="section-title"><h2>👯 Smakstvillinger</h2><small>minst forskjell = mest lik</small></div>`;
    if (!twins.length) return title + `<div class="empty small"><b>For få felles vurderinger ennå</b>Du må ha minst 3 drinker felles med noen før dere kan sammenlignes.</div>`;
    const best = twins.filter((t) => t.place === 1);
    return title + `<p class="twin-best">${best.length > 1 ? "Dine smakstvillinger er" : "Din smakstvilling er"} <b>${best.map((t) => esc(t.name)).join(" og ")}</b></p>
      <div class="twins">${twins.map((t) => `<button class="twin-row" data-twin="${esc(t.name)}">${avatar(t.name, "sm")}
        <span class="twin-main"><b>Du og ${esc(t.name)}</b><small>skiller i snitt ${fmt(t.dist)} poeng på ${t.common} felles drinker</small></span>
        <span class="twin-dist">${fmt(t.dist)}</span></button>`).join("")}</div>`;
  }

  function twinHtml(name) {
    const t = INS.twins(state.ratings, state.session.name, { known }).twins.find((x) => norm(x.name) === norm(name));
    const head = `<div class="sheet-head"><div class="sheet-title">${avatar(name, "lg")}<div><h2>Du og ${esc(name)}</h2>
      <div class="where">${t ? `skiller i snitt ${fmt(t.dist)} poeng på ${t.common} felles drinker` : "For få felles vurderinger ennå"}</div></div></div>${closeBtn}</div>`;
    if (!t) return sheetWrap(head, name);
    return sheetWrap(head + `<div class="list twin-list">${t.drinks.map((x) => {
      const d = DRINK[x.drink];
      return `<button class="drink compact" data-drink="${d.id}"><span class="emoji cat-${d.cat}">${drinkEmoji(d)}</span>
        <span class="drink-main"><span class="drink-name">${esc(d.name)}</span><span class="drink-desc">${x.mine === x.theirs ? "Helt enige 🙌" : `${Math.abs(x.mine - x.theirs)} poeng forskjell`}</span></span>
        <span class="twin-pair"><span class="badge" style="--rc:${scoreColor(x.mine)}" title="Du">${x.mine}</span><span class="badge" style="--rc:${scoreColor(x.theirs)}" title="${esc(name)}">${x.theirs}</span></span>
      </button>`;
    }).join("")}</div><p class="hint center">Du til venstre, ${esc(name)} til høyre.</p>`, name);
  }

  function personBody(name) {
    const rs = [...personRatings(name)].sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)));
    const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : 0;
    const tens = rs.filter((r) => r.score === 10).length;
    let html = `<div class="stats">
        <div class="stat"><b>${rs.length}</b><span>smakt</span></div>
        <div class="stat"><b>${rs.length ? fmt(avg) : "–"}</b><span>snitt</span></div>
        <div class="stat"><b>${tens}</b><span>tiere</span></div>
      </div>`;
    if (!rs.length) return html + `<div class="empty"><b>Ingen karakterer ennå</b>${isMe(name) ? "Trykk på en drink under «Drinker» for å gi karakter." : "Kanskje på tide med en drink?"}</div>`;
    html += `<div class="list">${rs.map((r) => {
      const d = DRINK[r.drink];
      return `<button class="drink compact" data-drink="${d.id}">
        <span class="emoji cat-${d.cat}">${drinkEmoji(d)}</span>
        <span class="drink-main"><span class="drink-name">${esc(d.name)}</span>
          ${r.comment ? `<q class="drink-desc">${esc(r.comment)}</q>` : `<span class="drink-desc">${r.bar && BAR[r.bar] ? `på ${esc(BAR[r.bar].name)}` : esc(CAT[d.cat].name)}</span>`}</span>
        <span class="badge big" style="--rc:${scoreColor(r.score)}">${r.score}</span>
      </button>`;
    }).join("")}</div>`;
    return html;
  }

  function viewMe() {
    return `<div class="me-head">${avatar(state.session.name, "xl")}<div><h2>${esc(state.session.name)}</h2><p class="hint">Din side</p></div></div>
      ${stickerBook()}
      ${on("postcard") ? `<button class="game-btn" data-act="postcard"><span>💌</span><span><b>Feriepostkort</b><small>Et minne fra turen – hittil</small></span></button>` : ""}
      ${twinsSection()}
      ${wishSection()}
      <div class="section-title"><h2>Dine karakterer</h2></div>
      ${personBody(state.session.name)}
      <div class="me-actions">
        <p class="hint">Tips: I nettleseren, trykk Del → «Legg til på Hjem-skjerm», så åpner DrinkRate som en app.</p>
        <p class="hint secret">Psst … det finnes noen hemmeligheter gjemt her 🤫</p>
        <button class="btn ghost wide" data-act="logout">Logg ut</button>
      </div>`;
  }

  // ── Photos ─────────────────────────────────────────────────
  // Shrunk on the phone to a JPEG data URL before upload: a full image for
  // viewing and a small thumbnail for lists.
  async function shrink(file, max, quality) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function preparePhoto(file) {
    let data = await shrink(file, 1280, 0.78);
    if (data.length > 650000) data = await shrink(file, 1000, 0.68);
    if (data.length > 650000) data = await shrink(file, 800, 0.6);
    const thumb = await shrink(file, 360, 0.7);
    return { data, thumb };
  }

  const photoCache = {}; // drink id → [{ name, thumb, at }]
  async function loadPhotos(id, force) {
    const list = derived().byDrink[id] || [];
    if (!list.some((r) => r.photo)) { photoCache[id] = []; return; }
    if (photoCache[id] && !force) return;
    const token = state.session.token;
    try {
      const res = await rpc("dr_drink_photos", { p_token: token, p_drink: id });
      if (!current(token)) return;
      if (Array.isArray(res)) photoCache[id] = res;
      if (state.sheet === id) render();
    } catch { /* photos are a bonus; the rating still works */ }
  }
  const thumbOf = (id, name) => (photoCache[id] || []).find((p) => norm(p.name) === norm(name))?.thumb;

  let recentPhotos = null;
  let recentLoading = false;
  async function loadRecentPhotos() {
    if (recentLoading) return;
    recentLoading = true;
    const token = state.session.token;
    try {
      const res = await rpc("dr_recent_photos", { p_token: token });
      if (Array.isArray(res) && current(token)) {
        recentPhotos = res.filter((p) => DRINK[p.drink]);
        if ((state.tab === "family" && !state.sheet) || state.sheet === "postcard") render();
      }
    } catch { /* not set up yet */ }
    recentLoading = false;
  }

  async function openLightbox(drink, name, thumb) {
    document.querySelector(".lightbox")?.remove();
    const r = (derived().byDrink[drink] || []).find((x) => norm(x.name) === norm(name));
    const el = document.createElement("div");
    el.className = "lightbox";
    el.innerHTML = `<img alt="" src="${thumb || thumbOf(drink, name) || ""}">
      <div class="lb-cap">${avatar(name, "sm")}<span><b>${esc(name)}</b> · ${esc(DRINK[drink].name)}${r ? ` · ${r.score}/10` : ""}</span></div>
      <button class="lb-close" aria-label="Lukk">${ICONS.close}</button>`;
    el.addEventListener("click", () => el.remove());
    document.body.appendChild(el);
    try {
      const res = await rpc("dr_photo", { p_token: state.session.token, p_drink: drink, p_name: name });
      if (res.data && el.isConnected) el.querySelector("img").src = res.data;
    } catch { /* keep the thumbnail */ }
  }

  // ── Sheet ──────────────────────────────────────────────────
  function openDrink(id) {
    const mine = myRating(derived().byDrink[id]);
    const d = DRINK[id];
    state.sheet = id;
    state.sheetOpened = true;
    const kept = keptDraft(id);
    state.draft = {
      score: kept ? kept.score : mine?.score || 0,
      bar: kept ? kept.bar : mine ? mine.bar || "" : (state.bar !== "all" && d.bars.includes(state.bar) ? state.bar : ""),
      comment: kept ? kept.comment : mine?.comment || "",
      restored: !!kept,
      // "Rate first": hide the family's scores until your own is saved.
      blind: on("blindRating") && !mine && store.get("blind", false),
    };
    lastTaps = [];
    fired.comment = "";
    document.body.style.overflow = "hidden";
    render();
    loadPhotos(id, true);
  }
  function openSheet(kind) {
    state.sheet = kind;
    state.sheetOpened = true;
    document.body.style.overflow = "hidden";
    render();
  }
  function closeSheet() {
    if (state.sheet === "quiz") state.quiz = null;
    state.sheet = null;
    state.draft = null;
    document.body.style.overflow = "";
    render();
  }

  const sheetWrap = (inner, label = "") => `<div class="backdrop" data-act="close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="wrap">
      <div class="grab"></div>${inner}</div></div>`;
  const closeBtn = `<button class="close" data-act="close" aria-label="Lukk">${ICONS.close}</button>`;

  function sheetHtml() {
    if (state.sheet === "menu") {
      return sheetWrap(`<div class="sheet-head"><div class="sheet-title">${avatar(state.session.name, "lg")}<h2>${esc(state.session.name)}</h2></div>${closeBtn}</div>
        <p class="hint">Tips: Legg siden til på hjemskjermen (Del → «Legg til på Hjem-skjerm»), så åpner den som en app.</p>
        ${state.lastSync ? `<p class="hint">Sist oppdatert kl. ${clock(state.lastSync)}</p>` : ""}
        <button class="btn" data-act="refresh">Oppdater</button>
        <button class="btn ghost wide" data-act="logout">Logg ut</button>`, "Meny");
    }
    if (state.sheet === "pick") return pickHtml();
    if (state.sheet === "quiz") return quizHtml();
    if (state.sheet === "postcard") return postcardHtml();
    if (state.sheet.startsWith("twin:")) return twinHtml(state.sheet.slice(5));
    if (state.sheet.startsWith("person:")) {
      const name = state.sheet.slice(7);
      return sheetWrap(`<div class="sheet-head"><div class="sheet-title">${avatar(name, "lg")}<div><h2>${esc(name)}</h2><div class="where">Alle karakterer</div></div></div>${closeBtn}</div>
        ${stickerBook(name)}
        <div class="section-title"><h2>Karakterer</h2></div>
        ${personBody(name)}`, name);
    }

    const d = DRINK[state.sheet];
    const list = derived().byDrink[d.id] || [];
    const s = summary(list);
    const mine = myRating(list);
    const sc = state.draft.score;
    const barOpts = [{ id: "", name: "Ikke valgt" }, ...d.bars.map((id) => BAR[id])];
    const aiText = d.ai.length
      ? `<span class="tag ai">✦ All inclusive</span> <span>${d.ai.length === d.bars.length ? (d.bars.length > 1 ? "på alle barene som har den" : "") : `på ${esc(barNames(d.ai))}`}</span>`
      : `<span class="tag paid">Ikke inkludert${d.price ? ` · ${esc(d.price)}` : ""}</span>`;

    const fam = people().map((name) => ({ name, r: list.find((x) => norm(x.name) === norm(name)) }))
      .sort((a, b) => (b.r ? b.r.score : -1) - (a.r ? a.r.score : -1));
    const dist = Array.from({ length: 10 }, (_, i) => list.filter((r) => r.score === i + 1).length);
    const maxDist = Math.max(1, ...dist);

    return sheetWrap(`
      <div class="sheet-head">
        <div class="sheet-title"><span class="emoji big cat-${d.cat}">${drinkEmoji(d)}</span>
          <div><h2>${esc(d.name)}</h2><div class="where">${esc(barNames(d.bars))}</div></div></div>
        <div class="head-btns"><button class="round-btn wish-btn ${wished(d.id) ? "on" : ""}" data-act="wish" aria-label="Vil smake">${wished(d.id) ? "♥" : "♡"}</button>${closeBtn}</div>
      </div>
      ${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ""}
      ${d.flav ? `<p class="flav">Smaker: ${esc(d.flav)}</p>` : ""}
      <p class="ai-line">${aiText}</p>

      <div class="rate-box">
        ${state.draft.restored ? `<p class="draft-note">↩️ Ulagret kladd hentet tilbake</p>` : ""}
        ${on("blindRating") && (!mine || state.draft.blind) && !state.draft.revealed ? `<button class="chip toggle blind-toggle ${state.draft.blind ? "on" : ""}" data-act="blind"><em>🙈</em>Vurder først, se familien etterpå</button>` : ""}
        <h3>${mine ? "Din karakter" : "Hva syns du?"}</h3>
        <div class="scores" role="radiogroup" aria-label="Karakter fra 1 til 10">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
            `<button class="sc ${n === sc ? "on" : ""} ${n < sc ? "fill" : ""}" style="--rc:${scoreColor(n)}" data-score="${n}" role="radio" aria-checked="${n === sc}">${n}</button>`).join("")}
        </div>
        <div class="star-label">${sc ? `${sc}/10 · ${SCORE_WORDS[sc]}` : "&nbsp;"}</div>
        ${d.bars.length > 1 ? `<div class="bar-pick"><span>Hvor smakte du den? <em>(valgfritt)</em></span>
          <div class="chips tight">${barOpts.map((b) =>
            `<button class="chip ${state.draft.bar === b.id ? "on" : ""}" data-pickbar="${b.id}">${esc(b.name)}</button>`).join("")}</div></div>` : ""}
        <textarea class="input" name="comment" maxlength="300" placeholder="Kommentar (valgfritt)">${esc(state.draft.comment)}</textarea>
        ${photoPicker(d)}
        ${state.draft.error ? `<p class="error save-error">${esc(state.draft.error)}</p>` : ""}
        ${state.draft.photoFailed ? `<div class="save-status"><b>✅ Karakter lagret – 📷 bilde gjenstår</b>
          <div class="row">
            <button class="btn ghost" data-act="skipphoto" ${state.saving ? "disabled" : ""}>Fortsett uten nytt bilde</button>
            <button class="btn coral" data-act="retryphoto" ${state.saving ? "disabled" : ""}>${state.saving ? "Sender …" : "Prøv bildet igjen"}</button>
          </div></div>` : `<div class="row">
          ${mine ? `<button class="btn ghost" data-act="remove" ${state.saving ? "disabled" : ""}>Fjern</button>` : ""}
          <button class="btn coral" data-act="save" ${!sc || state.saving || state.draft.photoBusy ? "disabled" : ""}>${state.saving ? "Lagrer …" : mine ? "Oppdater" : "Lagre"}</button>
        </div>`}
      </div>
      ${state.draft.revealed && mine ? revealHtml(list, mine) : ""}

      ${state.draft.blind && !state.draft.revealed ? `<div class="family blind-note"><span>🙈</span>Familiens karakterer vises når du har lagret din.</div>` : `<div class="family">
        <div class="family-head"><h3>Familien</h3>${s ? `<span class="fam-avg">${ring(s, "sm")}<small>${s.n} av ${people().length}</small></span>` : ""}</div>
        ${list.length > 1 ? `<div class="dist">${dist.map((n, i) => `<span style="--h:${(n / maxDist) * 100}%;--rc:${scoreColor(i + 1)}" title="${i + 1}: ${n}"><i></i><small>${i + 1}</small></span>`).join("")}</div>` : ""}
        ${fam.map(({ name, r }) => r ? `<div class="review">
            ${avatar(name)}
            <div class="review-body">
              <div class="review-top"><span>${esc(name)}${isMe(name) ? " <em>(deg)</em>" : ""}${r.bar && BAR[r.bar] && d.bars.length > 1 ? ` <small>på ${esc(BAR[r.bar].name)}</small>` : ""}</span><span class="badge" style="--rc:${scoreColor(r.score)}">${r.score}</span></div>
              ${r.comment ? `<p>${esc(r.comment)}</p>` : ""}
              ${r.photo ? (thumbOf(d.id, name) ? `<button class="review-photo" data-photo="${d.id}" data-who="${esc(name)}"><img alt="Bilde fra ${esc(name)}" src="${thumbOf(d.id, name)}"></button>` : `<span class="review-photo loading">📷</span>`) : ""}
              <small class="when">${ago(r.at)}</small>
            </div></div>`
          : `<div class="review muted">${avatar(name)}<div class="review-body"><div class="review-top"><span>${esc(name)}</span><span class="not-yet">ikke smakt</span></div></div></div>`).join("")}
      </div>`}`, d.name);
  }

  // After a saved "rate first": your score next to everyone else's.
  function revealHtml(list, mine) {
    const others = list.filter((r) => !isMe(r.name));
    const s = summary(others);
    const diff = s ? mine.score - s.avg : 0;
    const verdict = !s ? "Du er den første i familien som har smakt den!"
      : Math.abs(diff) < 0.5 ? "Helt på linje med familien 🤝"
      : diff > 0 ? `Du likte den ${fmt(diff)} poeng bedre enn familien 😋` : `Du likte den ${fmt(-diff)} poeng dårligere enn familien 🤔`;
    return `<div class="reveal"><span class="reveal-k">Avsløring!</span>
      <div class="reveal-row"><span><small>Du</small><b style="color:${scoreColor(mine.score)}">${mine.score}</b></span>
        <span><small>Familien${s ? ` (${s.n})` : ""}</small><b style="${s ? `color:${scoreColor(s.avg)}` : ""}">${s ? fmt(s.avg) : "–"}</b></span></div>
      <p>${verdict}</p><button class="btn ghost wide" data-act="close">Ferdig</button></div>`;
  }

  function photoPicker(d) {
    const dr = state.draft;
    const preview = dr.photo ? dr.photo.thumb : dr.photo === null ? null : thumbOf(d.id, state.session.name);
    return `<div class="photo-pick">
      ${preview ? `<div class="photo-prev"><img alt="Ditt bilde" src="${preview}"><button class="photo-rm" data-act="rmphoto" aria-label="Fjern bildet">${ICONS.close}</button></div>` : ""}
      <label class="photo-btn ${dr.photoBusy ? "busy" : ""}"><input type="file" accept="image/*" name="photo" hidden>
        ${dr.photoBusy ? "Klargjør bilde …" : preview ? "📷 Bytt bilde" : "📷 Legg til bilde"}</label>
    </div>`;
  }

  // Unsaved text is kept on this phone for a few days if saving fails, per person and drink.
  const DRAFT_MS = 3 * 864e5;
  function keptDraft(id) {
    const d = store.get("drafts", {})[id];
    return d && Date.now() - d.t < DRAFT_MS ? d : null;
  }
  function keepDraft(id, d) {
    const all = Object.fromEntries(Object.entries(store.get("drafts", {})).filter(([, x]) => Date.now() - x.t < DRAFT_MS));
    all[id] = { score: d.score, bar: d.bar, comment: d.comment, t: Date.now() };
    store.set("drafts", all);
  }
  function dropDraft(id) {
    const all = store.get("drafts", {});
    if (all[id]) { delete all[id]; store.set("drafts", all); }
  }

  // After a timeout the write may still have reached the database: look before saying it failed.
  async function landed(token, id, score, bar, comment) {
    try {
      const data = await rpc("dr_get_ratings", { p_token: token });
      if (!current(token) || !Array.isArray(data.ratings)) return false;
      const r = data.ratings.find((x) => x.drink === id && isMe(x.name));
      if (score === null) return !r;
      return !!r && r.score === score && (r.bar || null) === (bar || null) && (r.comment || "") === (comment || "").slice(0, 300);
    } catch { return false; }
  }

  async function sendPhoto(token, id, photo) {
    try {
      const pr = await rpc("dr_set_photo", { p_token: token, p_drink: id, p_thumb: photo?.thumb ?? null, p_data: photo?.data ?? null });
      if (pr.error || !current(token)) return false;
      photoCache[id] = (photoCache[id] || []).filter((p) => !isMe(p.name));
      if (photo) photoCache[id].unshift({ name: state.session.name, thumb: photo.thumb, at: new Date().toISOString() });
      recentPhotos = null;
      state.ratings = state.ratings.map((r) => (r.drink === id && isMe(r.name) ? { ...r, photo: !!photo } : r));
      return true;
    } catch { return false; }
  }

  // Saves the open drink. Everything is copied before the first await, so
  // switching drink or person while it runs cannot mix things up, and the lock
  // (state.saving) holds through both the rating and the photo.
  async function saveRating(remove) {
    if (state.saving || !state.draft || !DRINK[state.sheet]) return;
    const draft = state.draft;
    const id = state.sheet;
    const d = DRINK[id];
    const token = state.session.token;
    const score = remove ? null : draft.score;
    const bar = remove ? null : draft.bar || (d.bars.length === 1 ? d.bars[0] : null);
    const comment = remove ? null : draft.comment.trim();
    const photo = remove ? undefined : draft.photo;
    const hadPhoto = !!(myRating(derived().byDrink[id]) || {}).photo;
    if (!remove && !score) return;
    state.saving = true;
    draft.error = "";
    render();
    const open = () => state.draft === draft && state.sheet === id;
    try {
      let res;
      try {
        res = await rpc("dr_rate", { p_token: token, p_drink: id, p_score: score, p_bar: bar, p_comment: comment });
      } catch (e) {
        if (!current(token) || !(await landed(token, id, score, bar, comment))) throw e;
        res = { ok: true };
      }
      if (!current(token)) return;
      if (res.error === "BAD_TOKEN") { logout(); return; }
      if (res.error) throw new Error(res.error);

      // The rating is saved: from here on, only the photo can still fail.
      dropDraft(id);
      draft.restored = false;
      state.ratings = state.ratings.filter((r) => !(r.drink === id && isMe(r.name)));
      if (remove) {
        photoCache[id] = (photoCache[id] || []).filter((p) => !isMe(p.name));
        state.saving = false;
        if (open()) closeSheet(); else render();
        toast("Vurdering fjernet");
        refresh();
        return;
      }
      state.ratings = [{ drink: id, name: state.session.name, score, bar, comment: comment || null, photo: hadPhoto, at: new Date().toISOString() }, ...state.ratings];
      const photoOk = photo === undefined || (await sendPhoto(token, id, photo));
      if (!current(token)) return;
      state.saving = false;
      draft.revealed = draft.blind;
      draft.photoFailed = !photoOk;
      if (photoOk) draft.photo = undefined;
      if (open() && (draft.revealed || draft.photoFailed)) { state.scrollTo = draft.photoFailed ? ".save-status" : ".reveal"; render(); }
      else if (open()) closeSheet();
      else render();
      if (!photoOk && !open()) toast("Karakteren er lagret, men bildet kom ikke med.");
      else if (photoOk) toast(`Lagret: ${score}/10 for ${d.name}`);
      const twins = (derived().byDrink[id] || []).filter((r) => !isMe(r.name) && r.score === score);
      if (score === 10) EGGS.perfect(d.name);
      else if (score === 1) EGGS.yuck();
      else if (twins.length) EGGS.agree(twins.map((r) => r.name));
      refresh();
    } catch (e) {
      if (!current(token)) return;
      state.saving = false;
      if (!remove) keepDraft(id, { score, bar: draft.bar, comment: draft.comment });
      const msg = e.message === "NETWORK" ? "Ikke lagret – får ikke kontakt. Kommentaren er tatt vare på, prøv igjen." : "Ikke lagret. Prøv igjen.";
      if (open()) { draft.error = msg; render(); } else toast(msg);
    } finally {
      if (current(token)) state.saving = false;
    }
  }

  // Sends only the photo again; the rating is already saved.
  async function retryPhoto() {
    const draft = state.draft;
    if (state.saving || !draft || !draft.photoFailed) return;
    const id = state.sheet;
    const token = state.session.token;
    state.saving = true;
    render();
    const ok = await sendPhoto(token, id, draft.photo);
    if (!current(token)) return;
    state.saving = false;
    const open = state.draft === draft && state.sheet === id;
    if (!ok) { if (open) render(); toast("Bildet kom fortsatt ikke med. Prøv igjen om litt."); return; }
    draft.photoFailed = false;
    draft.photo = undefined;
    if (open && !draft.revealed) closeSheet(); else render();
    toast("📷 Bildet er lagret");
    refresh();
  }
  function skipPhoto() {
    if (!state.draft || state.saving) return;
    state.draft.photoFailed = false;
    state.draft.photo = undefined;
    if (state.draft.revealed) render(); else closeSheet();
  }

  // Slot-machine pick of a drink you have not tasted yet.
  function surprise() {
    const btn = root.querySelector("[data-act=surprise]");
    const pool = DRINKS.filter((d) => !myRating(derived().byDrink[d.id]) && (state.aiOnly ? d.ai.length : true) && d.cat !== "coffee");
    const from = pool.length ? pool : DRINKS;
    const pick = from[Math.floor(Math.random() * from.length)];
    if (!btn) { openDrink(pick.id); return; }
    btn.disabled = true;
    let i = 0;
    const steps = 14;
    const spin = () => {
      const r = from[Math.floor(Math.random() * from.length)];
      btn.textContent = `${drinkEmoji(r)} ${r.name}`;
      if (++i < steps) setTimeout(spin, 40 + i * 12);
      else { btn.textContent = `${drinkEmoji(pick)} ${pick.name}`; vibrate(30); setTimeout(() => openDrink(pick.id), 380); }
    };
    spin();
  }

  // ── Swipe ──────────────────────────────────────────────────
  const swipeSeed = Math.random();
  function jitter(id) {
    let h = Math.floor(swipeSeed * 1e9);
    for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    return (h % 1000) / 1000;
  }
  const wished = (id) => store.get("wish", []).includes(id);
  const wishCount = () => { const { byDrink } = derived(); return store.get("wish", []).filter((id) => DRINK[id] && !myRating(byDrink[id])).length; };
  function toggleWish(id) {
    const w = store.get("wish", []);
    store.set("wish", w.includes(id) ? w.filter((x) => x !== id) : [id, ...w]);
    toast(w.includes(id) ? "Fjernet fra «Vil smake»" : "💚 Lagt til i «Vil smake»");
  }

  // Untasted drinks, best bets first: what the family loves, what is included,
  // what matches your own taste, plus a little luck.
  function deck() {
    const { byDrink } = derived();
    const wish = new Set(store.get("wish", []));
    const skip = new Set(store.get("skip", []));
    const cats = {};
    for (const r of personRatings(state.session.name)) (cats[DRINK[r.drink].cat] ||= []).push(r.score);
    // Your taste per category, trusted more the more you have rated in it.
    const pref = (c) => (cats[c] ? ((cats[c].reduce((a, b) => a + b, 0) / cats[c].length) - 6) * Math.min(cats[c].length, 3) / 3 + 6 : 6);
    return DRINKS
      .filter((d) => !myRating(byDrink[d.id]) && !wish.has(d.id) && !skip.has(d.id) && (!state.aiOnly || d.ai.length))
      .map((d) => {
        const s = summary(byDrink[d.id]);
        const score = (s ? s.avg * 1.2 + Math.min(s.n, 4) * 0.4 : 5.5) + (d.ai.length ? 2.5 : 0) +
          (pref(d.cat) - 6) * 0.6 + (d.cat === "coffee" ? -2 : 0) + (d.cat === "spirit" && !d.ai.length ? -1.5 : 0) + jitter(d.id) * 3.5;
        return { d, s, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  function reasons(x) {
    const out = [];
    const list = derived().byDrink[x.d.id];
    if (x.s && x.s.avg >= 8) out.push(`🔥 Familien gir den ${fmt(x.s.avg)}`);
    else if (list && list.length) out.push(`${esc(list[0].name)} ga den ${list[0].score}`);
    else out.push("🧭 Ingen har smakt den ennå");
    out.push(x.d.ai.length ? `✦ Inkludert${x.d.ai.length < x.d.bars.length ? ` på ${esc(barNames(x.d.ai))}` : ""}` : `💶 ${esc(x.d.price || "Ikke inkludert")}`);
    return out;
  }

  function viewSwipe() {
    const all = deck();
    const cards = all.slice(0, 3);
    let html = `<div class="swipe-wrap">
      <div class="swipe-bar">
        <button class="chip toggle ${state.aiOnly ? "on" : ""}" data-act="aionly"><em>✦</em>Kun all inclusive</button>
        <small>${all.length} igjen å sveipe</small>
      </div>
      ${wishCount() ? `<button class="pick-btn" data-act="pick">🎯 Hva bør jeg gå for nå?</button>` : ""}`;
    if (!cards.length) {
      html += `<div class="empty swipe-empty"><b>Du har sveipet gjennom alt! 🎉</b>Smak noe fra lista di, eller start på nytt.
        <button class="btn" data-act="resetskip">Vis de jeg sa nei til igjen</button></div>`;
    } else {
      html += `<div class="deck">${cards.map((x, i) => `<div class="swipe-card ${i === 0 ? "is-top" : ""}" data-swipe="${x.d.id}" style="--i:${i}">
          <span class="stamp like">VIL SMAKE</span><span class="stamp nope">NEI TAKK</span>
          <div class="sc-top cat-${x.d.cat}"><span class="sc-emoji">${drinkEmoji(x.d)}</span><span class="sc-cat">${CAT[x.d.cat].e} ${CAT[x.d.cat].name}</span></div>
          <div class="sc-body">
            <h2>${esc(x.d.name)}</h2>
            ${x.d.desc ? `<p>${esc(x.d.desc)}</p>` : ""}
            <div class="sc-why">${reasons(x).map((r) => `<span>${r}</span>`).join("")}</div>
            <div class="sc-bars">📍 ${esc(barNames(x.d.bars))}</div>
          </div>
        </div>`).reverse().join("")}</div>
        <div class="swipe-actions">
          <button class="sa undo" data-act="undo" aria-label="Angre" ${lastSwipe ? "" : "disabled"}>↩</button>
          <button class="sa nope" data-act="nope" aria-label="Nei takk">✕</button>
          <button class="sa now" data-act="tastenow" aria-label="Gi karakter nå">⭐</button>
          <button class="sa like" data-act="like" aria-label="Vil smake">♥</button>
        </div>
        <p class="hint center">Sveip ➡️ for «vil smake», ⬅️ for «nei takk». Trykk på kortet for detaljer.</p>`;
    }
    return html + `</div>${wishSection()}`;
  }

  function wishSection() {
    const { byDrink } = derived();
    const list = store.get("wish", []).filter((id) => DRINK[id] && !myRating(byDrink[id]));
    if (!list.length) return "";
    return `<div class="section-title"><h2>💚 Vil smake</h2><small>${list.length}</small></div>
      <div class="list">${list.map((id) => drinkRow(DRINK[id])).join("")}</div>`;
  }

  function stickerBook(name = state.session.name) {
    const have = stickersOf(name);
    if (!isMe(name) && !stickersShared) return "";
    return `<div class="section-title"><h2>Klistremerker</h2><small>${have.length} av ${STICKERS.length} funnet</small></div>
      <div class="stickers">${STICKERS.map((st) => have.includes(st.id)
        ? `<span class="sticker s-${st.id}" title="${esc(st.name)}"><span>${st.e}</span><b>${esc(st.name)}</b></span>`
        : isMe(name) ? `<button class="sticker locked" data-hint="${st.id}" aria-label="Hint"><span>?</span><b>???</b></button>`
        : `<span class="sticker locked"><span>?</span><b>???</b></span>`).join("")}</div>
      ${isMe(name) && have.length < STICKERS.length ? `<p class="hint sticker-tip">Trykk på et «?» for et hint.</p>` : ""}`;
  }
  function showHint(id) {
    const st = STICKERS.find((x) => x.id === id);
    if (st) toast(`💡 ${typeof st.hint === "function" ? st.hint() : st.hint}`);
  }

  // ── Quiz ───────────────────────────────────────────────────
  // Questions are made once when the round starts, from the ratings loaded then.
  const QUIZ_NAMES = { who: "Hvem skrev det?", score: "Gjett karakteren" };
  function startQuiz(kind) {
    const qs = kind === "who"
      ? QZ.whoRound({ ratings: state.ratings, people: people(), drinks: DRINKS, known })
      : QZ.guessScore(state.ratings, state.session.name, { known });
    if (!qs.length) { toast("Ikke nok karakterer fra de andre til dette spillet ennå"); return; }
    state.quiz = QZ.newRound(kind, qs);
    render();
  }
  const quizBest = (kind) => store.get(`quizbest.v1.${kind}`, null);
  function quizNext() {
    const r = state.quiz;
    if (!r || !QZ.next(r)) return;
    if (r.done) {
      const best = quizBest(r.kind);
      const c = QZ.correct(r);
      if (!best || c / r.questions.length > best.c / best.n) store.set(`quizbest.v1.${r.kind}`, { c, n: r.questions.length });
    }
    render();
  }

  function quizHtml() {
    const head = `<div class="sheet-head"><div class="sheet-title"><h2>🎲 Familiespill</h2></div>${closeBtn}</div>`;
    const r = state.quiz;
    if (!r) {
      return sheetWrap(head + `<p class="hint">Spill sammen rundt bordet. Ingen trenger å bestille noe – poengene gjelder bare denne telefonen.</p>
        <div class="game-modes">
          <button class="game-mode" data-quiz="who"><span>🕵️</span><span><b>${QUIZ_NAMES.who}</b><small>Hvem i familien skrev kommentaren? Fylles opp med menyspørsmål.</small></span></button>
          <button class="game-mode" data-quiz="score"><span>🔢</span><span><b>${QUIZ_NAMES.score}</b><small>Hvilken karakter ga de andre?</small></span></button>
        </div>`, "Familiespill");
    }
    if (r.done) {
      const c = QZ.correct(r);
      const best = quizBest(r.kind);
      return sheetWrap(head + `<div class="quiz-done">
        <span class="quiz-big">${c === r.questions.length ? "🏆" : c ? "🎉" : "🙈"}</span>
        <h3>Du fikk ${c} av ${r.questions.length} riktige</h3>
        ${best ? `<p class="hint">Rekord på denne telefonen: ${best.c} av ${best.n}</p>` : ""}
        <button class="btn coral" data-quiz="${r.kind}">Ny runde</button>
        <button class="btn ghost wide" data-act="quizmenu">Bytt spill</button></div>`, "Familiespill");
    }
    const q = r.questions[r.i];
    const picked = r.picks[r.i];
    const d = DRINK[q.drink];
    const prompt = q.type === "who" ? `Hvem skrev dette om ${esc(d.name)}?`
      : q.type === "menu" ? "Menyquiz: Hvilken drink er dette?"
      : `Hvilken karakter ga ${esc(q.name)} til ${esc(d.name)}?`;
    const quote = q.type === "score" ? "" : `<blockquote class="quiz-q">${esc(q.text)}</blockquote>`;
    const opts = q.options.map((o, i) => {
      const cls = picked === undefined ? "" : i === q.answer ? "right" : i === picked ? "wrong" : "dim";
      const label = q.type === "who" ? `${avatar(o, "sm")}${esc(o)}` : q.type === "score" ? `<b class="quiz-num">${esc(o)}</b>` : esc(o);
      return `<button class="quiz-opt ${cls}" data-qa="${i}" ${picked === undefined ? "" : "disabled"}>${label}</button>`;
    }).join("");
    const last = r.i === r.questions.length - 1;
    return sheetWrap(head + `<p class="quiz-step">${QUIZ_NAMES[r.kind]} · spørsmål ${r.i + 1} av ${r.questions.length}</p>
      <p class="quiz-prompt">${prompt}</p>${quote}
      <div class="quiz-opts ${q.type === "score" ? "nums" : ""}">${opts}</div>
      ${picked === undefined ? "" : `<p class="quiz-fb">${picked === q.answer ? "Riktig! 🎉" : `Feil – riktig svar er ${esc(q.options[q.answer])}`}</p>
        <button class="btn coral" data-act="qnext">${last ? "Se resultatet" : "Neste"}</button>`}`, "Familiespill");
  }

  // ── Holiday postcard ───────────────────────────────────────
  // A screenshot-friendly summary. Nothing is uploaded or shared automatically.
  function postcardHtml() {
    const me = state.session.name;
    const fav = INS.favorite(state.ratings, me, { known });
    const top = ranked("all").slice(0, 3);
    const hot = on("controversy") ? INS.controversial(state.ratings, { known })[0] : null;
    if (recentPhotos === null) loadRecentPhotos();
    const pics = recentPhotos || [];
    const photo = pics.find((p) => isMe(p.name)) || pics[0] || null;
    const today = new Date().toLocaleDateString("no-NO", { day: "numeric", month: "long" });
    return sheetWrap(`<div class="sheet-head"><div class="sheet-title"><h2>💌 Feriepostkort</h2></div>${closeBtn}</div>
      <p class="hint">Ta et skjermbilde for å dele det. Kortet viser navnet ditt${photo ? ` og et bilde fra ${esc(photo.name)}` : ""}; du velger selv hvem som får det.</p>
      <div class="postcard">
        <div class="pc-top"><span class="pc-stamp">🏝️</span><div><small>Hilsen fra ferien · hittil (${esc(today)})</small><b>${esc(me)}</b></div></div>
        ${photo ? `<figure class="pc-fig"><img class="pc-photo" alt="Bilde av ${esc(DRINK[photo.drink].name)}" src="${photo.thumb}"><figcaption>📷 ${esc(photo.name)} · ${esc(DRINK[photo.drink].name)}</figcaption></figure>` : ""}
        <div class="pc-block"><small>Min favoritt</small>${fav
          ? `<p class="pc-line"><span>${drinkEmoji(DRINK[fav.drink])} ${esc(DRINK[fav.drink].name)}</span><b>${fav.score}/10</b></p>`
          : `<p class="pc-empty">Ingen karakterer ennå</p>`}</div>
        <div class="pc-block"><small>Familiens topp 3</small>${top.length
          ? `<ol>${top.map((x) => `<li class="pc-line"><span>${drinkEmoji(x.d)} ${esc(x.d.name)}</span><b>${fmt(x.s.avg)}</b></li>`).join("")}</ol>`
          : `<p class="pc-empty">Ingen drinker med ${MIN_VOTES} stemmer ennå</p>`}</div>
        ${hot ? `<div class="pc-block"><small>Mest omdiskutert</small><p class="pc-line"><span>🔥 ${esc(DRINK[hot.drink].name)}</span><b>${hot.min}–${hot.max}</b></p></div>` : ""}
        <p class="pc-foot">${state.ratings.length} karakterer fra familien så langt · DrinkRate</p>
      </div>`, "Feriepostkort");
  }

  let lastSwipe = null;
  function fling(card, dir) {
    if (card.dataset.flung) return;
    card.dataset.flung = "1";
    const x = dir === "like" ? 1 : -1;
    card.style.transition = "transform .32s ease-in, opacity .32s ease-in";
    card.style.setProperty("--like", dir === "like" ? 1 : 0);
    card.style.setProperty("--nope", dir === "nope" ? 1 : 0);
    card.style.transform = `translate(${x * 130}vw, -40px) rotate(${x * 28}deg)`;
    card.style.opacity = "0";
    vibrate(15);
    setTimeout(() => commitSwipe(card.dataset.swipe, dir), 260);
  }
  // After PICK_AFTER swipes (with at least one like), or PICK_LIKES likes,
  // the app picks the one you should go for.
  const PICK_AFTER = 10;
  const PICK_LIKES = 4;
  const session = { swipes: 0, likes: [] };
  function commitSwipe(id, dir) {
    const key = dir === "like" ? "wish" : "skip";
    store.set(key, [id, ...store.get(key, []).filter((x) => x !== id)]);
    lastSwipe = { id, key };
    session.swipes++;
    if (dir === "like") session.likes.push(id);
    render();
    let celebrated = false;
    if (dir === "like") {
      const s = summary(derived().byDrink[id]);
      if (s && s.avg >= 8) { EGGS.match(DRINK[id], s); celebrated = true; }
      else toast(`💚 ${DRINK[id].name} lagt til i «Vil smake»`);
    }
    if ((session.swipes >= PICK_AFTER && session.likes.length) || session.likes.length >= PICK_LIKES) {
      const ids = [...session.likes];
      session.swipes = 0;
      session.likes = [];
      setTimeout(() => showPick(ids), celebrated ? 3100 : 450);
    }
  }

  function timeOfDay() {
    const h = new Date().getHours();
    if (h >= 6 && h < 11) return { key: "morning", text: "Perfekt til frokosten ☕", fits: (d) => d.cat === "coffee" || d.cat === "free" };
    if (h >= 11 && h < 17) return { key: "day", text: "Perfekt i sola ☀️", fits: (d) => d.cat === "free" || d.cat === "beer" || /frozen|colada|spritz|hugo|mojito|daiquiri|cooler|pimm/i.test(d.name) };
    if (h >= 17 && h < 23) return { key: "evening", text: "Perfekt til kvelden 🌅", fits: (d) => d.cat === "cocktail" || d.cat === "wine" };
    return { key: "night", text: "En natt-drink 🌙", fits: (d) => d.cat === "spirit" || /sour|martini|russian|negroni|manhattan/i.test(d.name) };
  }

  // Best of the candidates: family verdict, included, time of day, your taste.
  function bestPick(ids) {
    const { byDrink } = derived();
    const tod = timeOfDay();
    const cats = {};
    for (const r of personRatings(state.session.name)) (cats[DRINK[r.drink].cat] ||= []).push(r.score);
    return ids.filter((id) => DRINK[id] && !myRating(byDrink[id]))
      .map((id) => {
        const d = DRINK[id];
        const s = summary(byDrink[id]);
        const mine = cats[d.cat] ? cats[d.cat].reduce((a, b) => a + b, 0) / cats[d.cat].length : null;
        const score = (s ? weighted(s) : 6.5) + (d.ai.length ? 1.5 : 0) + (tod.fits(d) ? 1.5 : 0) + (mine ? (mine - 6) * 0.3 : 0) + jitter(id);
        return { d, s, score, tod: tod.fits(d) ? tod.text : "", mine };
      })
      .sort((a, b) => b.score - a.score)[0];
  }

  function showPick(ids) {
    const pick = bestPick(ids);
    if (!pick) { toast("Sveip til høyre på noe du vil smake først 💚"); return; }
    state.pick = { id: pick.d.id, ids };
    openSheet("pick");
    vibrate([30, 50, 30]);
  }

  function pickHtml() {
    const pick = bestPick(state.pick.ids) || { d: DRINK[state.pick.id], s: summary(derived().byDrink[state.pick.id]), tod: "" };
    const d = pick.d;
    const why = [];
    if (pick.s) why.push(`👨‍👩‍👧‍👦 Familien gir den ${fmt(pick.s.avg)} (${pick.s.n} ${pick.s.n === 1 ? "stemme" : "stemmer"})`);
    else why.push("🧭 Ingen har smakt den ennå. Du blir den første!");
    if (d.ai.length) why.push(`✦ Inkludert på ${esc(barNames(d.ai))}`);
    else if (d.price) why.push(`💶 ${esc(d.price)}`);
    if (pick.tod) why.push(pick.tod);
    if (pick.mine && pick.mine >= 7.5) why.push(`😋 Du liker ${CAT[d.cat].name.toLowerCase()}`);
    const others = state.pick.ids.filter((id) => id !== d.id && DRINK[id]).length;
    return sheetWrap(`
      <div class="pick">
        <div class="pick-burst">${rain(["✨", "🎯", "💚", "⭐"], 18)}</div>
        <p class="pick-kicker">Basert på sveipene dine</p>
        <h2 class="pick-title">Gå for denne!</h2>
        <div class="pick-emoji cat-${d.cat}">${drinkEmoji(d)}</div>
        <h3 class="pick-name">${esc(d.name)}</h3>
        ${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ""}
        <ul class="pick-why">${why.map((w) => `<li>${w}</li>`).join("")}</ul>
        <p class="hint">📍 ${esc(barNames(d.bars))}${others ? ` · valgt blant ${others + 1} du likte` : ""}</p>
        <button class="btn coral" data-drink="${d.id}">⭐ Jeg har smakt den – gi karakter</button>
        <button class="btn ghost wide" data-act="close">Fortsett å sveipe</button>
      </div>`, "Anbefaling");
  }

  function undoSwipe() {
    if (!lastSwipe) return;
    store.set(lastSwipe.key, store.get(lastSwipe.key, []).filter((x) => x !== lastSwipe.id));
    session.swipes = Math.max(0, session.swipes - 1);
    session.likes = session.likes.filter((x) => x !== lastSwipe.id);
    lastSwipe = null;
    render();
  }

  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".swipe-card.is-top");
    if (!card || card.dataset.flung) return;
    drag = { card, x: e.clientX, y: e.clientY, dx: 0, dy: 0, pid: e.pointerId };
    try { card.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    card.classList.add("dragging");
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    const c = drag.card;
    c.style.transform = `translate(${drag.dx}px, ${drag.dy * 0.25}px) rotate(${drag.dx / 14}deg)`;
    c.style.setProperty("--like", Math.max(0, Math.min(1, drag.dx / 100)).toFixed(2));
    c.style.setProperty("--nope", Math.max(0, Math.min(1, -drag.dx / 100)).toFixed(2));
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.card.classList.remove("dragging");
    if (Math.abs(d.dx) > 90) fling(d.card, d.dx > 0 ? "like" : "nope");
    else {
      d.card.style.transform = "";
      d.card.style.setProperty("--like", 0);
      d.card.style.setProperty("--nope", 0);
      if (e.type === "pointerup" && Math.abs(d.dx) < 6 && Math.abs(d.dy) < 6) openDrink(d.card.dataset.swipe);
    }
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  // ── Events ─────────────────────────────────────────────────
  let lastTaps = []; // score taps, to catch a quick 6 → 7
  let logoTaps = [];

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, .backdrop, [data-act=logo]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.pick) {
      Object.assign(login, { mode: isRegistered(ds.pick) ? "pin" : "new", name: ds.pick, error: "" });
      drawLogin();
      return;
    }
    if (ds.tab === "family") freshStickers();
    if (ds.tab) { state.tab = ds.tab; state.sheet = null; document.body.style.overflow = ""; render(); window.scrollTo(0, 0); return; }
    if (ds.bar) { state.bar = ds.bar; render(); return; }
    if (ds.cat) { state.cat = ds.cat; render(); return; }
    if (ds.topcat) { state.topCat = ds.topcat; render(); return; }
    if (ds.drink) { openDrink(ds.drink); return; }
    if (ds.person) { openSheet("person:" + ds.person); freshStickers(); return; }
    if (ds.twin) { openSheet("twin:" + ds.twin); return; }
    if (ds.hint) { showHint(ds.hint); return; }
    if (ds.quiz) { if (state.sheet !== "quiz") openSheet("quiz"); startQuiz(ds.quiz); return; }
    if (ds.qa !== undefined) { if (state.quiz && QZ.answer(state.quiz, Number(ds.qa))) render(); return; }
    if (ds.photo) {
      const thumb = (recentPhotos || []).find((p) => p.drink === ds.photo && norm(p.name) === norm(ds.who))?.thumb;
      openLightbox(ds.photo, ds.who, thumb);
      return;
    }
    if (ds.score) {
      const n = Number(ds.score);
      state.draft.score = n;
      render();
      const now = Date.now();
      lastTaps = [...lastTaps.filter((x) => now - x.t < 2000), { n, t: now }].slice(-2);
      if (lastTaps.length === 2 && lastTaps[0].n === 6 && lastTaps[1].n === 7) { lastTaps = []; EGGS.sixSeven(); }
      return;
    }
    if (ds.pickbar !== undefined) { state.draft.bar = ds.pickbar; render(); return; }
    switch (ds.act) {
      case "retry": login.error = ""; renderLogin(); break;
      case "back": Object.assign(login, { mode: "pick", error: "" }); drawLogin(); break;
      case "menu": openSheet("menu"); break;
      case "close": closeSheet(); break;
      case "save": saveRating(false); break;
      case "remove": saveRating(true); break;
      case "retryphoto": retryPhoto(); break;
      case "skipphoto": skipPhoto(); break;
      case "blind": state.draft.blind = !state.draft.blind; store.set("blind", state.draft.blind); render(); break;
      case "refresh": closeSheet(); refresh().then(() => { if (!state.stale && !state.loadError) toast("Oppdatert"); }); break;
      case "reload": if (state.loadError) { state.loaded = false; render(); } refresh(); break;
      case "logout": logout(); break;
      case "wish": toggleWish(state.sheet); render(); break;
      case "rmphoto": state.draft.photo = null; render(); break;
      case "like": case "nope": { const c = root.querySelector(".swipe-card.is-top"); if (c) fling(c, ds.act); break; }
      case "tastenow": { const c = root.querySelector(".swipe-card.is-top"); if (c) openDrink(c.dataset.swipe); break; }
      case "undo": undoSwipe(); break;
      case "pick": showPick(store.get("wish", [])); break;
      case "resetskip": store.set("skip", []); render(); break;
      case "aionly": state.aiOnly = !state.aiOnly; render(); break;
      case "surprise": surprise(); break;
      case "bday": EGGS.birthday(); setTimeout(render, 50); break;
      case "quiz": state.quiz = null; openSheet("quiz"); break;
      case "quizmenu": state.quiz = null; render(); break;
      case "qnext": quizNext(); break;
      case "postcard": openSheet("postcard"); break;
      case "logo": {
        const now = Date.now();
        logoTaps = [...logoTaps.filter((x) => now - x < 1500), now];
        if (logoTaps.length >= 5) { logoTaps = []; EGGS.disco(); }
        break;
      }
    }
  });

  root.addEventListener("error", (e) => { if (e.target.classList?.contains("pc-photo")) e.target.closest(".pc-fig")?.remove(); }, true);

  root.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    submitLogin(form, form.dataset.form);
  });

  root.addEventListener("change", async (e) => {
    if (e.target.name !== "photo" || !state.draft) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const draft = state.draft;
    draft.photoBusy = true;
    render();
    try {
      draft.photo = await preparePhoto(file);
    } catch {
      toast("Klarte ikke å lese bildet. Prøv et annet.");
    }
    draft.photoBusy = false;
    if (state.draft === draft) render();
  });

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.name === "pin" || el.name === "pin2") { el.value = el.value.replace(/\D/g, "").slice(0, 4); return; }
    if (el.name === "q") { state.q = el.value; updateResults(); }
    else if (el.name === "comment" && state.draft) state.draft.comment = el.value;
    else return;
    checkEggs(el.name, el.value);
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.sheet) closeSheet(); });

  function updateResults() {
    const el = document.getElementById("results");
    if (el) el.innerHTML = listResults();
  }

  function onScroll() {
    root.querySelector(".top")?.classList.toggle("scrolled", window.scrollY > 4);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Keep everyone's ratings fresh without a manual reload.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.sheet) refresh(); });
  setInterval(() => { if (!document.hidden && !state.sheet && state.session) refresh(); }, 60000);

  if (state.session && CFG.url && CFG.key) startApp();
  else renderLogin();
})();
