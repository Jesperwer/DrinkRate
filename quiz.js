// The family quiz: question builders and round state. No network, no DOM.
// Randomness is injected (rng) so the unit tests are deterministic.
// Every question is { type, options: [3 strings], answer: index, key, ... }.
(function (root) {
  "use strict";

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ROUND = 5;

  function shuffle(list, rng) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const uniqNames = (names) => {
    const seen = new Set();
    return names.filter((n) => n && !seen.has(norm(n)) && seen.add(norm(n)));
  };
  function withOptions(q, right, wrong, rng) {
    const options = shuffle([right, ...wrong], rng);
    return { ...q, options, answer: options.indexOf(right) };
  }

  // "Who wrote this comment?" from real comments. Leaves out comments that name
  // someone in the family and texts that more than one person wrote. Needs
  // comments from at least two people and three people to choose between.
  function whoWrote(ratings, people, { rng = Math.random, max = ROUND, known } = {}) {
    const cast = uniqNames(people);
    if (cast.length < 3) return [];
    const names = cast.map(norm);
    const namesSomeone = (t) => names.some((n) => new RegExp(`(^|[^a-z0-9])${escRe(n)}($|[^a-z0-9])`).test(norm(t)));
    const byText = new Map();
    for (const r of ratings || []) {
      const text = String((r && r.comment) || "").trim();
      if (text.length < 2 || !r.name || (known && !known(r.drink)) || namesSomeone(text)) continue;
      const g = byText.get(norm(text)) || [];
      g.push({ ...r, text });
      byText.set(norm(text), g);
    }
    const ok = [...byText.values()].filter((g) => new Set(g.map((r) => norm(r.name))).size === 1).map((g) => g[0]);
    if (new Set(ok.map((r) => norm(r.name))).size < 2) return [];
    return shuffle(ok, rng).slice(0, max).map((r) => {
      const right = cast.find((n) => norm(n) === norm(r.name)) || r.name;
      const wrong = shuffle(cast.filter((n) => norm(n) !== norm(r.name)), rng).slice(0, 2);
      return withOptions({ type: "who", text: r.text, drink: r.drink, key: `${norm(r.name)}|${r.drink}` }, right, wrong, rng);
    });
  }

  // Menu quiz straight from drinks.js: which drink has this description?
  // Only descriptions that are unique and do not contain the drink's name.
  function menu(drinks, { rng = Math.random, n = ROUND, cats = ["cocktail", "free"] } = {}) {
    const descCount = new Map();
    for (const d of drinks) descCount.set(norm(d.desc), (descCount.get(norm(d.desc)) || 0) + 1);
    const pool = drinks.filter((d) => cats.includes(d.cat) && norm(d.desc).length >= 12 &&
      descCount.get(norm(d.desc)) === 1 && !norm(d.desc).includes(norm(d.name)));
    return shuffle(pool, rng).slice(0, n).map((d) => {
      const wrong = shuffle(pool.filter((o) => o.cat === d.cat && norm(o.name) !== norm(d.name)), rng)
        .filter((o, i, a) => a.findIndex((x) => norm(x.name) === norm(o.name)) === i).slice(0, 2).map((o) => o.name);
      return withOptions({ type: "menu", text: d.desc, drink: d.id, key: `menu|${d.id}` }, d.name, wrong, rng);
    }).filter((q) => q.options.length === 3);
  }

  // A "who wrote it" round, topped up with menu questions when there are too
  // few usable comments.
  function whoRound({ ratings, people, drinks, rng = Math.random, known }) {
    const qs = whoWrote(ratings, people, { rng, known });
    const used = new Set(qs.map((q) => q.drink));
    return [...qs, ...menu(drinks.filter((d) => !used.has(d.id)), { rng, n: ROUND - qs.length })];
  }

  // "Guess the score": a real rating by someone else, three different numbers 1–10.
  function guessScore(ratings, me, { rng = Math.random, max = ROUND, known } = {}) {
    const seen = new Set();
    const pool = (ratings || []).filter((r) => r && r.name && norm(r.name) !== norm(me) &&
      Number.isInteger(r.score) && r.score >= 1 && r.score <= 10 && (!known || known(r.drink)) &&
      !seen.has(`${norm(r.name)}|${r.drink}`) && seen.add(`${norm(r.name)}|${r.drink}`));
    return shuffle(pool, rng).slice(0, max).map((r) => {
      const near = shuffle([-3, -2, -1, 1, 2, 3].map((x) => r.score + x).filter((x) => x >= 1 && x <= 10), rng).slice(0, 2);
      return withOptions({ type: "score", name: r.name, drink: r.drink, key: `${norm(r.name)}|${r.drink}` },
        String(r.score), near.map(String), rng);
    });
  }

  // Round state. The first tap on an answer counts; later taps are ignored.
  const newRound = (kind, questions) => ({ kind, questions, i: 0, picks: [], done: !questions.length });
  function answer(round, idx) {
    if (round.done || round.picks[round.i] !== undefined) return false;
    round.picks[round.i] = idx;
    return true;
  }
  function next(round) {
    if (round.done || round.picks[round.i] === undefined) return false;
    round.i++;
    if (round.i >= round.questions.length) round.done = true;
    return true;
  }
  const correct = (round) => round.picks.filter((p, i) => p === round.questions[i].answer).length;

  const api = { whoWrote, menu, whoRound, guessScore, newRound, answer, next, correct, ROUND };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DR_QUIZ = api;
})(typeof window !== "undefined" ? window : globalThis);
