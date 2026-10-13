// Lagkamp: a team quiz for one phone. Pure engine: a frozen question set built from
// the family's ratings and photos, the phases of a question, locked answers, and
// scores derived from the event log. No DOM, no network, no storage.
// Randomness is injected (rng) so the unit tests are deterministic.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DR_LAGKAMP = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SCHEMA = 1;
  const TYPES = ["photoDrink", "photoOwner", "whoWrote", "whoRated", "familyAverage"];
  const RESERVE = "menuReserve";
  const ORDER = [...TYPES, RESERVE]; // order inside a round: the drink is guessed before anything names it
  const TYPE_NAMES = {
    photoDrink: "Gjett drinken fra bildet", photoOwner: "Hvem lastet opp bildet?", whoWrote: "Hvem skrev det?",
    whoRated: "Hvem ga karakteren?", familyAverage: "Familiens favoritt", menuReserve: "Menyhint",
  };
  const COUNTS = [5, 10, 15];
  const LIMITS = { minTeams: 2, maxTeams: 4, name: 24, perRound: 3, reason: 120 };
  const OPTION_IDS = ["a", "b", "c", "d"];
  const PHASES = ["intro", "handoff", "answering", "ready", "reveal", "roundEnd", "finished"];

  // A person's identity: case and spacing do not matter, letters do (Åse is not Ase).
  const key = (s) => String(s ?? "").normalize("NFC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ").trim();
  // Looser match for comment texts and drink names: accents ignored as well.
  const loose = (s) => key(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
  const andList = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const uniqBy = (xs, f) => { const seen = new Set(); return xs.filter((x) => !seen.has(f(x)) && seen.add(f(x))); };

  // ── Teams ──────────────────────────────────────────────────
  // teams: [{ name, members: [{ name, guest }] }]. family: the real accounts.
  function checkTeams(teams, family = []) {
    const errors = [];
    const familyKeys = new Set(family.map(key));
    if (!Array.isArray(teams) || teams.length < LIMITS.minTeams || teams.length > LIMITS.maxTeams) {
      errors.push(`Velg mellom ${LIMITS.minTeams} og ${LIMITS.maxTeams} lag.`);
      return errors;
    }
    const names = new Map(), members = new Map();
    teams.forEach((t, i) => {
      const label = String(t.name || "").trim() || `Lag ${i + 1}`;
      const name = String(t.name || "").trim();
      if (!name) errors.push(`Lag ${i + 1} mangler navn.`);
      else if ([...name].length > LIMITS.name) errors.push(`Navnet på ${label} er for langt (maks ${LIMITS.name} tegn).`);
      else if (names.has(key(name))) errors.push(`To lag heter «${name}». Gi dem ulike navn.`);
      names.set(key(name), true);
      if (!t.members || !t.members.length) errors.push(`${label} trenger minst én deltaker.`);
      for (const m of t.members || []) {
        const n = String(m.name || "").trim();
        if (!n) { errors.push(`${label} har en deltaker uten navn.`); continue; }
        if ([...n].length > LIMITS.name) errors.push(`Gjestenavnet «${n.slice(0, 12)}…» er for langt (maks ${LIMITS.name} tegn).`);
        if (m.guest && familyKeys.has(key(n))) errors.push(`${n} finnes i familien. Velg personen i lista i stedet for å legge til en gjest.`);
        if (members.has(key(n))) errors.push(`${n} er med to ganger. En deltaker kan bare være på ett lag.`);
        members.set(key(n), true);
      }
    });
    return [...new Set(errors)];
  }

  // ── Snapshot: what the questions are built from ────────────
  // ratings: [{ drink, name, score, comment }], photos: [{ mediaId, drink, name }] that were
  // checked to display, family: names, drinks: the menu. Invalid entries are dropped.
  function snapshot({ ratings = [], photos = [], family = [], drinks = [], at = null }) {
    const known = new Set(drinks.map((d) => d.id));
    const people = new Map();
    const person = (n) => {
      const k = key(n);
      if (!k) return null;
      if (!people.has(k)) people.set(k, String(n).trim().replace(/\s+/g, " "));
      return people.get(k);
    };
    family.forEach(person);
    const out = [], ids = new Set();
    let rejected = 0;
    for (const r of ratings) {
      if (!r || !known.has(r.drink) || !Number.isInteger(r.score) || r.score < 1 || r.score > 10 || !key(r.name)) { rejected++; continue; }
      const name = person(r.name), id = `${key(name)}|${r.drink}`;
      if (ids.has(id)) { rejected++; continue; } // one current rating per person and drink
      ids.add(id);
      out.push({ drink: r.drink, name, score: r.score, comment: typeof r.comment === "string" ? r.comment.trim() : "" });
    }
    // A photo belongs to a rating: the account it was uploaded from is the rating's person.
    const pics = uniqBy(photos.filter((p) => p && p.mediaId && known.has(p.drink) && ids.has(`${key(p.name)}|${p.drink}`)), (p) => p.mediaId)
      .map((p) => ({ mediaId: p.mediaId, drink: p.drink, name: people.get(key(p.name)) }));
    return { at, people: [...people.values()], ratings: out, photos: pics, rejected };
  }

  // ── Candidates ─────────────────────────────────────────────
  function context(snap, drinks, settings) {
    const menu = new Map(drinks.map((d) => [d.id, d]));
    const fits = (id) => {
      const d = menu.get(id);
      return !!d && (!settings.cat || settings.cat === "all" || d.cat === settings.cat) &&
        (!settings.bar || settings.bar === "all" || (d.bars || []).includes(settings.bar));
    };
    const byDrink = new Map();
    const slot = (id) => byDrink.get(id) || byDrink.set(id, { drink: id, ratings: [], photos: [] }).get(id);
    for (const r of snap.ratings) if (fits(r.drink)) slot(r.drink).ratings.push(r);
    for (const p of snap.photos) if (fits(p.drink)) slot(p.drink).photos.push(p);
    const names = snap.people.map(loose).filter((n) => n.length >= 2);
    const namesSomeone = (t) => names.some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(n)}($|[^\\p{L}\\p{N}])`, "u").test(loose(t)));
    const avg = (id) => {
      const rs = (byDrink.get(id) || { ratings: [] }).ratings;
      return rs.length < 2 ? null : { sum: rs.reduce((s, r) => s + r.score, 0), n: rs.length };
    };
    return { menu, fits, byDrink, people: snap.people, namesSomeone, avg, enabled: new Set(settings.types || TYPES) };
  }
  const dname = (cx, id) => cx.menu.get(id).name;

  // Three different people: one right answer and the rest wrong, the wrong ones preferably
  // people who could plausibly be it. When there are too few wrong ones, more right ones
  // fill up; every right one shown counts. Never only right answers.
  function personOptions(cx, accepted, prefer, rng) {
    const ok = new Set(accepted.map(key));
    const wrong = uniqBy([...shuffle(prefer, rng), ...shuffle(cx.people, rng)].filter((n) => !ok.has(key(n))), key).slice(0, 2);
    if (!wrong.length) return null;
    const right = shuffle(accepted, rng);
    const names = shuffle([right[0], ...wrong, ...right.slice(1, 1 + 2 - wrong.length)], rng);
    if (names.length < 2) return null;
    return {
      options: names.map((n, i) => ({ optionId: OPTION_IDS[i], label: n })),
      accepted: names.map((n, i) => (ok.has(key(n)) ? OPTION_IDS[i] : null)).filter(Boolean),
    };
  }
  // The right drink and up to two other real drinks, preferably from the same category.
  function drinkOptions(cx, right, rng, n = 3) {
    const d = cx.menu.get(right);
    const seen = new Set([loose(d.name)]);
    const all = [...cx.menu.values()].filter((o) => o.id !== right);
    const wrong = [];
    for (const o of [...shuffle(all.filter((o) => o.cat === d.cat), rng), ...shuffle(all.filter((o) => o.cat !== d.cat), rng)]) {
      if (wrong.length >= n - 1) break;
      if (seen.has(loose(o.name))) continue;
      seen.add(loose(o.name));
      wrong.push(o.id);
    }
    if (!wrong.length) return null;
    const ids = shuffle([right, ...wrong], rng);
    return { options: ids.map((id, i) => ({ optionId: OPTION_IDS[i], label: cx.menu.get(id).name, drink: id })), accepted: [OPTION_IDS[ids.indexOf(right)]] };
  }

  // Every candidate says which facts it needs hidden and which it gives away, so a round
  // can be checked before it is used. Rating facts are "person|drink".
  function candidates(cx, slot, photo, type) {
    const D = slot.drink;
    if (type === "photoDrink" && photo) {
      return [{ type, photo, answerKeys: [], needsHidden: [`photo:${photo.mediaId}`], reveals: [`photo:${photo.mediaId}`, `drink:${D}`],
        build: (rng) => {
          const o = drinkOptions(cx, D, rng);
          return o && { ...o, prompt: { title: "Hvilken drink er dette?" }, reveal: { lines: [`Riktig svar: ${dname(cx, D)}`] } };
        } }];
    }
    if (type === "photoOwner" && photo) {
      return [{ type, photo, answerKeys: [`${key(photo.name)}|${D}`], needsHidden: [`owner:${photo.mediaId}`], reveals: [`owner:${photo.mediaId}`],
        build: (rng) => {
          const raters = slot.ratings.map((r) => r.name);
          const o = personOptions(cx, [photo.name], raters, rng);
          return o && { ...o, prompt: { title: "Hvem lastet opp dette bildet?", note: "Svaret er kontoen bildet ble lastet opp fra – ikke nødvendigvis den som tok det." },
            reveal: { lines: [`Bildet ble lastet opp av ${photo.name}.`] } };
        } }];
    }
    if (type === "whoWrote") {
      const groups = new Map();
      for (const r of slot.ratings) {
        if (r.comment.length < 2 || cx.namesSomeone(r.comment)) continue;
        const k = loose(r.comment);
        (groups.get(k) || groups.set(k, { text: r.comment, authors: [] }).get(k)).authors.push(r.name);
      }
      return [...groups].map(([k, g]) => ({
        type, fact: `comment:${k}`, answerKeys: g.authors.map((n) => `${key(n)}|${D}`), needsHidden: [], reveals: [],
        build: (rng) => {
          const o = personOptions(cx, g.authors, slot.ratings.map((r) => r.name), rng);
          return o && { ...o, prompt: { title: `Hvem skrev dette om ${dname(cx, D)}?`, quote: g.text },
            reveal: { lines: [`Skrevet av ${andList(g.authors)}.`] } };
        },
      }));
    }
    if (type === "whoRated") {
      const groups = new Map();
      for (const r of slot.ratings) (groups.get(r.score) || groups.set(r.score, []).get(r.score)).push(r.name);
      return [...groups].map(([score, names]) => ({
        type, fact: `rated:${D}|${score}`, answerKeys: names.map((n) => `${key(n)}|${D}`), needsHidden: [], reveals: [],
        build: (rng) => {
          const others = slot.ratings.filter((r) => r.score !== score).map((r) => r.name);
          const o = personOptions(cx, names, others, rng);
          return o && { ...o, prompt: { title: `Hvem ga ${dname(cx, D)} ${score}/10?` },
            reveal: { lines: [`${andList(names)} ga ${dname(cx, D)} ${score}/10.`] } };
        },
      }));
    }
    if (type === "familyAverage") {
      const a = cx.avg(D);
      if (!a) return [];
      const partners = [...cx.byDrink.keys()].filter((id) => {
        const b = id !== D && cx.avg(id);
        // Equal (or equal-looking) averages would need a coin toss: leave those pairs out.
        return b && a.sum * b.n !== b.sum * a.n && fmt1(a.sum / a.n) !== fmt1(b.sum / b.n);
      });
      return partners.map((P) => ({
        type, fact: `pair:${[D, P].sort().join("|")}`, answerKeys: [], needsHidden: [], reveals: [],
        build: (rng) => {
          const b = cx.avg(P);
          const ids = shuffle([D, P], rng);
          const best = a.sum / a.n > b.sum / b.n ? D : P;
          const row = (id) => { const x = cx.avg(id); return `${dname(cx, id)}: snitt ${fmt1(x.sum / x.n)} (${x.sum} poeng / ${x.n} karakterer)`; };
          return { options: ids.map((id, i) => ({ optionId: OPTION_IDS[i], label: dname(cx, id), drink: id })), accepted: [OPTION_IDS[ids.indexOf(best)]],
            prompt: { title: "Hvilken drink har høyest snitt i familien?", note: "Vanlig gjennomsnitt av familiens karakterer da kampen startet." },
            reveal: { lines: [`${dname(cx, best)} har høyest snitt.`, row(ids[0]), row(ids[1])] } };
        },
      }));
    }
    return [];
  }

  // Menu fallback: a real, unique menu description that does not contain the drink's name.
  function menuCandidates(cx) {
    const count = new Map();
    for (const d of cx.menu.values()) count.set(loose(d.desc), (count.get(loose(d.desc)) || 0) + 1);
    return [...cx.menu.values()].filter((d) => cx.fits(d.id) && loose(d.desc).length >= 12 && count.get(loose(d.desc)) === 1 && !loose(d.desc).includes(loose(d.name)))
      .map((d) => ({ type: RESERVE, drink: d.id, fact: `menu:${d.id}`, answerKeys: [], needsHidden: [`drink:${d.id}`], reveals: [`drink:${d.id}`],
        build: (rng) => {
          const o = drinkOptions(cx, d.id, rng);
          return o && o.options.length === 3 && { ...o, prompt: { title: "Hvilken drink har denne menybeskrivelsen?", quote: d.desc }, reveal: { lines: [`Riktig svar: ${d.name}`] } };
        } }));
  }

  const usable = (c, seen) => !(c.fact && seen.facts.has(c.fact)) &&
    !c.answerKeys.some((k) => seen.revealed.has(`rating:${k}`)) && !c.needsHidden.some((f) => seen.revealed.has(f));
  function use(c, seen) {
    if (c.fact) seen.facts.add(c.fact);
    for (const k of c.answerKeys) seen.revealed.add(`rating:${k}`);
    for (const f of c.reveals) seen.revealed.add(f);
  }

  // One round: one drink and its photo, up to `want` questions of different types, in an
  // order where no question gives away a later answer. Types used least so far go first,
  // and among candidates the people who have been the answer least often.
  function composeRound(cx, slot, want, ctx, rng) {
    const photos = shuffle(slot.photos, rng).sort((a, b) => (ctx.people[key(a.name)] || 0) - (ctx.people[key(b.name)] || 0));
    const photo = photos[0] || null;
    const lists = {};
    for (const t of TYPES) if (cx.enabled.has(t)) {
      const load = (c) => c.answerKeys.reduce((s, k) => s + (ctx.people[k.split("|")[0]] || 0), 0);
      lists[t] = shuffle(candidates(cx, slot, photo, t), rng).sort((a, b) => load(a) - load(b)).filter((c) => usable(c, ctx));
    }
    const prefs = shuffle(Object.keys(lists).filter((t) => lists[t].length), rng).sort((a, b) => (ctx.types[a] || 0) - (ctx.types[b] || 0));
    const attempt = (types) => {
      const seen = { facts: new Set(ctx.facts), revealed: new Set(ctx.revealed) };
      const out = [];
      for (const t of [...types].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
        let made = null;
        for (const c of lists[t]) {
          if (!usable(c, seen)) continue;
          const q = c.build(rng);
          if (q) { made = { c, q }; break; }
        }
        if (!made) return null;
        use(made.c, seen);
        out.push(made);
      }
      return { out, seen };
    };
    let best = { out: [], seen: null };
    const chosen = [];
    for (const t of prefs) {
      if (chosen.length >= want) break;
      const r = attempt([...chosen, t]);
      if (r) { chosen.push(t); best = r; }
    }
    if (!best.out.length) return [];
    ctx.facts = best.seen.facts;
    ctx.revealed = best.seen.revealed;
    for (const { c } of best.out) {
      ctx.types[c.type] = (ctx.types[c.type] || 0) + 1;
      for (const k of c.answerKeys) ctx.people[k.split("|")[0]] = (ctx.people[k.split("|")[0]] || 0) + 1;
    }
    return best.out.map(({ c, q }) => ({ ...q, type: c.type, drink: slot.drink, answerKeys: c.answerKeys, mediaId: c.photo ? c.photo.mediaId : null }));
  }

  // The whole question set for one game, frozen at the start.
  // settings: { count, types, menuReserve, cat, bar }
  function buildDeck(snap, drinks, settings, rng = Math.random) {
    const target = COUNTS.includes(settings.count) ? settings.count : 10;
    const cx = context(snap, drinks, settings);
    const ctx = { facts: new Set(), revealed: new Set(), types: {}, people: {} };
    const slots = shuffle([...cx.byDrink.values()], rng);
    const photoSlots = slots.filter((s) => s.photos.length && (cx.enabled.has("photoDrink") || cx.enabled.has("photoOwner")));
    const rest = slots.filter((s) => !photoSlots.includes(s));
    const ordered = [];
    for (let i = 0; i < Math.max(photoSlots.length, rest.length); i++) {
      if (photoSlots[i]) ordered.push(photoSlots[i]);
      if (rest[i]) ordered.push(rest[i]);
    }
    const rounds = [];
    let total = 0;
    for (const slot of ordered) {
      if (total >= target) break;
      const qs = composeRound(cx, slot, Math.min(LIMITS.perRound, target - total), ctx, rng);
      if (!qs.length) continue;
      rounds.push(qs);
      total += qs.length;
    }
    let reserve = 0;
    if (total < target && settings.menuReserve) {
      const named = new Set(rounds.flat().map((q) => q.drink));
      for (const c of shuffle(menuCandidates(cx), rng)) {
        if (total >= target) break;
        if (named.has(c.drink) || !usable(c, ctx)) continue;
        const q = c.build(rng);
        if (!q) continue;
        use(c, ctx);
        rounds.push([{ ...q, type: RESERVE, drink: c.drink, answerKeys: [], mediaId: null }]);
        total++; reserve++;
      }
    }
    const questions = {}, order = [];
    const deckRounds = rounds.map((qs, ri) => {
      const roundId = `r${ri + 1}`;
      const ids = qs.map((q) => {
        const questionId = `q${order.length + 1}`;
        order.push(questionId);
        questions[questionId] = {
          questionId, roundId, type: q.type, mediaId: q.mediaId, prompt: q.prompt, options: q.options,
          accepted: q.accepted, multi: q.accepted.length > 1, reveal: q.reveal, scoringRule: "correctOnePoint",
          source: { drink: q.drink, answerKeys: q.answerKeys }, // frozen facts behind the answer; never shown before the reveal
        };
        return questionId;
      });
      return { roundId, questionIds: ids, mediaId: qs.find((q) => q.mediaId)?.mediaId || null };
    });
    const byType = {};
    for (const id of order) byType[questions[id].type] = (byType[questions[id].type] || 0) + 1;
    const missing = [...cx.enabled].filter((t) => TYPES.includes(t) && ![...cx.byDrink.values()].some((s) =>
      candidates(cx, s, s.photos[0] || null, t).some((c) => c.build(seeded(1)))));
    return { rounds: deckRounds, questions, order, total, target, short: total < target, byType, missing, reserve,
      media: [...new Set(deckRounds.map((r) => r.mediaId).filter(Boolean))] };
  }

  // ── Session and phases ─────────────────────────────────────
  function newSession({ sessionId, ownerKey, teams, settings, deck, snapshotAt, now = Date.now(), appVersion = "" }) {
    return {
      schemaVersion: SCHEMA, appVersion, sessionId, ownerKey, revision: 1, createdAt: now, updatedAt: now, snapshotAt,
      status: "active", endedEarly: false, settings: clone(settings),
      teams: teams.map((t) => ({ teamId: t.teamId, name: String(t.name).trim(), mark: t.mark, members: t.members.map((m) => ({ memberId: m.memberId, name: String(m.name).trim(), guest: !!m.guest })) })),
      rounds: clone(deck.rounds), questions: clone(deck.questions), order: [...deck.order],
      cursor: { index: 0, phase: deck.order.length ? "intro" : "finished", turn: 0 }, events: [],
    };
  }
  const qAt = (s, i = s.cursor.index) => s.questions[s.order[i]] || null;
  const roundOf = (s, qid) => s.rounds.find((r) => r.questionIds.includes(qid));
  // Who answers first rotates from question to question.
  function turnOrder(s, index = s.cursor.index) {
    const n = s.teams.length, k = index % n;
    return [...s.teams.slice(k), ...s.teams.slice(0, k)].map((t) => t.teamId);
  }
  const currentTeam = (s) => ["handoff", "answering"].includes(s.cursor.phase) ? turnOrder(s)[s.cursor.turn] : null;

  // Locked answers for a question: teamId → optionId (null = pass).
  function answers(s, qid) {
    const out = new Map();
    for (const e of s.events) {
      if (e.questionId !== qid) continue;
      if (e.type === "lock") out.set(e.teamId, e.optionId);
      if (e.type === "unlock") out.delete(e.teamId);
    }
    return out;
  }
  function autoTeams(s, qid) {
    const q = s.questions[qid], a = answers(s, qid);
    return s.teams.map((t) => t.teamId).filter((id) => a.has(id) && a.get(id) !== null && q.accepted.includes(a.get(id)));
  }
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  // What a question ended as. Corrections replace the automatic result; they never add to it.
  function outcome(s, qid) {
    let status = "pending", auto = [];
    const stack = [], log = [];
    for (const e of s.events) {
      if (e.questionId !== qid) continue;
      if (e.type === "skip") status = "skipped";
      if (e.type === "reveal") { status = "revealed"; auto = e.auto; }
      if (e.type === "correct") { stack.push(e); log.push(e); }
      if (e.type === "uncorrect" && stack.length && stack[stack.length - 1].eventId === e.undoes) { stack.pop(); log.push(e); }
    }
    const teams = status !== "revealed" ? [] : stack.length ? stack[stack.length - 1].teams : auto;
    return { status, auto, teams, corrected: status === "revealed" && !sameSet(teams, auto), corrections: stack.length, log };
  }

  function results(s) {
    const ids = s.teams.map((t) => t.teamId);
    const zero = () => Object.fromEntries(ids.map((id) => [id, 0]));
    const totals = zero();
    const winnersOf = (pts) => {
      const max = Math.max(0, ...Object.values(pts));
      return { max, winners: max > 0 ? ids.filter((id) => pts[id] === max) : [] };
    };
    const rounds = s.rounds.map((r) => {
      const points = zero();
      let done = true;
      for (const qid of r.questionIds) {
        const o = outcome(s, qid);
        if (o.status === "pending") done = false;
        for (const id of o.teams) { points[id]++; totals[id]++; }
      }
      return { roundId: r.roundId, points, done, ...winnersOf(points) };
    });
    const list = s.order.map((qid) => ({ questionId: qid, ...outcome(s, qid) }));
    return { totals, rounds, ...winnersOf(totals), answered: list.filter((x) => x.status === "revealed").length,
      skipped: list.filter((x) => x.status === "skipped").length, corrected: list.filter((x) => x.corrected).length };
  }

  function advance(n) {
    const q = qAt(n), r = roundOf(n, q.questionId);
    const lastInRound = r.questionIds[r.questionIds.length - 1] === q.questionId;
    n.cursor = lastInRound ? { index: n.cursor.index, phase: "roundEnd", turn: 0 } : { index: n.cursor.index + 1, phase: "intro", turn: 0 };
  }

  // Every change goes through here. `expect` must match the state the button was drawn
  // for, so a stale or doubled tap does nothing; an actionId is never used twice.
  function apply(s, a, now = Date.now()) {
    const fail = (error) => ({ ok: false, error, session: s });
    if (!s || !a || !a.actionId) return fail("bad-action");
    if (s.events.some((e) => e.actionId === a.actionId)) return fail("duplicate");
    const ex = a.expect || {};
    if (ex.sessionId !== undefined && ex.sessionId !== s.sessionId) return fail("other-session");
    if (ex.revision !== undefined && ex.revision !== s.revision) return fail("stale");
    if (ex.phase !== undefined && ex.phase !== s.cursor.phase) return fail("phase");
    const q = qAt(s);
    if (ex.questionId !== undefined && ex.questionId !== (q && q.questionId)) return fail("question");
    if (ex.teamId !== undefined && ex.teamId !== currentTeam(s)) return fail("team");
    const fixing = a.type === "correct" || a.type === "uncorrect";
    if (s.status === "abandoned" || (s.status === "finished" && !fixing)) return fail("over");
    if (s.status === "paused" && !["resume", "finish"].includes(a.type)) return fail("paused");
    const n = clone(s);
    const ph = n.cursor.phase, order = turnOrder(n);
    const ev = { eventId: `e${n.events.length + 1}`, actionId: a.actionId, type: a.type, at: now };
    switch (a.type) {
      case "begin":
        if (ph !== "intro") return fail("phase");
        n.cursor = { ...n.cursor, phase: "handoff", turn: 0 };
        break;
      case "ready": // the team holding the phone opens its own answer screen
        if (ph !== "handoff") return fail("phase");
        n.cursor.phase = "answering";
        Object.assign(ev, { questionId: q.questionId, teamId: order[n.cursor.turn] });
        break;
      case "lock": {
        if (ph !== "answering") return fail("phase");
        const opt = a.optionId === null ? null : q.options.some((o) => o.optionId === a.optionId) ? a.optionId : undefined;
        if (opt === undefined) return fail("option");
        Object.assign(ev, { questionId: q.questionId, teamId: order[n.cursor.turn], optionId: opt });
        n.cursor = n.cursor.turn + 1 < order.length ? { ...n.cursor, phase: "handoff", turn: n.cursor.turn + 1 } : { ...n.cursor, phase: "ready" };
        break;
      }
      case "unlock": { // only the team that locked last, and only before the next team has opened its screen
        const lastTurn = ph === "ready" ? order.length - 1 : n.cursor.turn - 1;
        if (!(ph === "ready" || (ph === "handoff" && n.cursor.turn > 0))) return fail("phase");
        const teamId = order[lastTurn];
        if (!answers(n, q.questionId).has(teamId)) return fail("nothing");
        Object.assign(ev, { questionId: q.questionId, teamId });
        n.cursor = { ...n.cursor, phase: "handoff", turn: lastTurn };
        break;
      }
      case "reveal":
        if (ph !== "ready") return fail("phase");
        if (answers(n, q.questionId).size !== order.length) return fail("missing-answers");
        Object.assign(ev, { questionId: q.questionId, auto: autoTeams(n, q.questionId) });
        n.cursor.phase = "reveal";
        break;
      case "skip": // the whole question is void for everyone, also after some teams answered
        if (!["intro", "handoff", "answering", "ready"].includes(ph)) return fail("phase");
        Object.assign(ev, { questionId: q.questionId, answeredBefore: answers(n, q.questionId).size });
        n.events.push(ev);
        advance(n);
        n.revision++; n.updatedAt = now;
        return { ok: true, session: n };
      case "next":
        if (ph === "reveal") { advance(n); break; }
        if (ph !== "roundEnd") return fail("phase");
        if (n.cursor.index + 1 >= n.order.length) { n.cursor = { index: n.cursor.index, phase: "finished", turn: 0 }; n.status = "finished"; }
        else n.cursor = { index: n.cursor.index + 1, phase: "intro", turn: 0 };
        break;
      case "correct": { // after the reveal: choose which teams get this question's one point
        const qid = a.questionId;
        if (!n.questions[qid]) return fail("question");
        const o = outcome(n, qid);
        if (o.status !== "revealed") return fail("not-revealed");
        const ids = n.teams.map((t) => t.teamId);
        const teams = a.mode === "auto" ? o.auto : ids.filter((id) => (a.teams || []).includes(id));
        if ((a.teams || []).some((id) => !ids.includes(id))) return fail("team");
        if (sameSet(teams, o.teams)) return fail("unchanged");
        const reason = String(a.reason || "").trim().slice(0, LIMITS.reason);
        if (a.mode !== "auto" && !sameSet(teams, o.auto) && !reason) return fail("reason");
        Object.assign(ev, { questionId: qid, teams, before: o.teams, reason, mode: a.mode === "auto" ? "auto" : "manual" });
        break;
      }
      case "uncorrect": {
        const qid = a.questionId;
        const stack = [];
        for (const e of n.events) {
          if (e.questionId !== qid) continue;
          if (e.type === "correct") stack.push(e);
          if (e.type === "uncorrect" && stack.length && stack[stack.length - 1].eventId === e.undoes) stack.pop();
        }
        if (!stack.length) return fail("nothing");
        Object.assign(ev, { questionId: qid, undoes: stack[stack.length - 1].eventId });
        break;
      }
      case "pause":
        if (n.status !== "active") return fail("status");
        n.status = "paused";
        break;
      case "resume":
        if (n.status !== "paused") return fail("status");
        n.status = "active";
        break;
      case "finish": // ended by the players before the last question
        n.status = "finished";
        n.endedEarly = ph !== "finished";
        n.cursor = { ...n.cursor, phase: "finished", turn: 0 };
        break;
      default:
        return fail("bad-action");
    }
    n.events.push(ev);
    n.revision++;
    n.updatedAt = now;
    return { ok: true, session: n };
  }

  // ── What the screen may show ───────────────────────────────
  // Only public fields: never the accepted answers or another team's choice before the reveal.
  function publicQuestion(s, q) {
    const r = roundOf(s, q.questionId);
    return { questionId: q.questionId, type: q.type, typeName: TYPE_NAMES[q.type], prompt: q.prompt, multi: q.multi,
      mediaId: q.mediaId || r.mediaId || null, options: q.options.map((o) => ({ optionId: o.optionId, label: o.label, drink: o.drink || null })) };
  }
  function revealOf(s, qid) {
    const q = s.questions[qid], o = outcome(s, qid);
    if (o.status !== "revealed") return null;
    const a = answers(s, qid);
    return { accepted: [...q.accepted], lines: q.reveal.lines, outcome: o,
      teams: s.teams.map((t) => ({ teamId: t.teamId, optionId: a.has(t.teamId) ? a.get(t.teamId) : null, right: a.get(t.teamId) != null && q.accepted.includes(a.get(t.teamId)), point: o.teams.includes(t.teamId) })) };
  }
  function view(s) {
    const q = qAt(s), ph = s.cursor.phase, order = turnOrder(s);
    const r = q && roundOf(s, q.questionId);
    const ri = r ? s.rounds.indexOf(r) : -1;
    const a = q ? answers(s, q.questionId) : new Map();
    const lastLocked = ph === "ready" ? order[order.length - 1] : ph === "handoff" && s.cursor.turn > 0 ? order[s.cursor.turn - 1] : null;
    return {
      status: s.status, phase: ph, endedEarly: s.endedEarly, index: s.cursor.index, total: s.order.length,
      roundNo: ri + 1, roundCount: s.rounds.length, inRound: r ? r.questionIds.indexOf(q.questionId) + 1 : 0, roundSize: r ? r.questionIds.length : 0,
      lastInRound: !!r && r.questionIds[r.questionIds.length - 1] === q.questionId, lastRound: ri === s.rounds.length - 1,
      teamId: currentTeam(s), order, answeredCount: a.size,
      canUnlock: !!lastLocked && a.has(lastLocked), lastLocked,
      question: q && ph !== "finished" ? publicQuestion(s, q) : null,
      reveal: q && ph === "reveal" ? revealOf(s, q.questionId) : null,
      round: r && ph === "roundEnd" ? results(s).rounds[ri] : null,
    };
  }
  // Finished questions only (revealed or skipped): the history never opens a future answer.
  function history(s) {
    return s.order.map((qid, i) => ({ qid, i, o: outcome(s, qid) })).filter((x) => x.o.status !== "pending").map(({ qid, i, o }) => {
      const q = s.questions[qid];
      return { questionId: qid, index: i, roundNo: s.rounds.indexOf(roundOf(s, qid)) + 1, status: o.status,
        question: publicQuestion(s, q), reveal: o.status === "revealed" ? revealOf(s, qid) : null, log: o.log };
    });
  }

  // A stored game must be whole before it is trusted. Returns an error text or "".
  function check(s) {
    try {
      if (!s || typeof s !== "object") return "ingen data";
      if (s.schemaVersion !== SCHEMA) return `ukjent versjon (${s.schemaVersion})`;
      if (typeof s.sessionId !== "string" || typeof s.ownerKey !== "string" || !Number.isInteger(s.revision)) return "mangler id";
      if (!["active", "paused", "finished", "abandoned"].includes(s.status)) return "ukjent status";
      if (!Array.isArray(s.teams) || s.teams.length < LIMITS.minTeams || s.teams.length > LIMITS.maxTeams) return "lagene mangler";
      if (s.teams.some((t) => !t.teamId || !Array.isArray(t.members) || !t.members.length)) return "lag uten deltakere";
      if (!Array.isArray(s.order) || !Array.isArray(s.rounds) || !s.questions) return "spørsmålene mangler";
      if (s.order.some((id) => { const q = s.questions[id]; return !q || !Array.isArray(q.options) || !Array.isArray(q.accepted) || !q.accepted.length; })) return "ødelagt spørsmål";
      if (s.rounds.flatMap((r) => r.questionIds).join() !== s.order.join()) return "rundene stemmer ikke";
      const c = s.cursor;
      if (!c || !PHASES.includes(c.phase) || !Number.isInteger(c.index) || c.index < 0 || (s.order.length && c.index >= s.order.length)) return "ugyldig posisjon";
      if (!Number.isInteger(c.turn) || c.turn < 0 || c.turn >= s.teams.length) return "ugyldig tur";
      if (!Array.isArray(s.events) || s.events.some((e) => !e || !e.type || (e.questionId && !s.questions[e.questionId]))) return "ødelagt logg";
      const ids = new Set(s.teams.map((t) => t.teamId));
      if (s.events.some((e) => (e.teamId && !ids.has(e.teamId)) || (e.teams && e.teams.some((id) => !ids.has(id))))) return "ukjent lag i loggen";
      return "";
    } catch (e) { return "kunne ikke leses"; }
  }

  return { SCHEMA, TYPES, RESERVE, TYPE_NAMES, COUNTS, LIMITS, key, fmt1, andList, seeded, shuffle,
    checkTeams, snapshot, buildDeck, newSession, apply, turnOrder, answers, outcome, results, view, history, check };
});
