// Menu filters and one-phone table games. No accounts, ratings or network writes.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DR_GAMES = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function filterDrinks(drinks, opts = {}, rated = new Set()) {
    const { bar = "all", cat = "all", aiOnly = false, untestedOnly = false, q = "" } = opts;
    return drinks.filter((d) =>
      (bar === "all" || d.bars.includes(bar)) &&
      (cat === "all" || d.cat === cat) &&
      (!aiOnly || (bar === "all" ? d.ai.length > 0 : d.ai.includes(bar))) &&
      (!untestedOnly || !rated.has(d.id)) &&
      (!q || norm(d.name + " " + d.desc).includes(norm(q))));
  }
  function shuffled(items, rng = Math.random) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const ids = (drinks, rng) => shuffled([...new Set(drinks.map((d) => d.id))], rng);
  const duelSize = (n) => n >= 8 ? 8 : n >= 4 ? 4 : n >= 2 ? 2 : 0;
  function newDuel(drinks, rng) {
    const deck = ids(drinks, rng), size = duelSize(deck.length);
    if (!size) return null;
    return { kind: "duel", size, round: deck.slice(0, size), reserve: deck.slice(size),
      next: [], match: 0, choice: null, history: [], done: false, winner: null };
  }
  const pair = (g) => g && !g.done ? g.round.slice(g.match * 2, g.match * 2 + 2) : [];
  function choose(g, id) {
    if (!g || g.done || g.choice !== null || !pair(g).includes(id)) return false;
    g.choice = id;
    return true;
  }
  function replace(g, id) {
    if (!g || g.done || g.choice !== null || g.round.length !== g.size || !pair(g).includes(id) || !g.reserve.length) return false;
    g.round[g.round.indexOf(id)] = g.reserve.shift();
    return true;
  }
  function advance(g) {
    if (!g || g.done || g.choice === null) return false;
    g.history.push({ pair: pair(g), winner: g.choice });
    g.next.push(g.choice);
    g.choice = null;
    g.match++;
    if (g.match * 2 === g.round.length) {
      if (g.next.length === 1) { g.winner = g.next[0]; g.done = true; }
      else { g.round = g.next; g.next = []; g.match = 0; }
    }
    return true;
  }
  function newPitch(drinks, players, rng) {
    const names = [...new Set(players)], deck = ids(drinks, rng);
    if (names.length < 2 || deck.length < names.length) return null;
    return { kind: "pitch", players: names, i: 0, done: false, phase: "ready",
      remaining: 20000, endsAt: null, votes: null, reserve: deck.slice(names.length),
      turns: names.map((name, i) => ({ name, target: names[(i + 1) % names.length], drink: deck[i], votes: null, skipped: false })) };
  }
  const timeLeft = (g, now = Date.now()) => g.phase === "speaking" ? Math.max(0, g.endsAt - now) : g.remaining;
  function startTimer(g, now = Date.now()) {
    if (!g || g.done || !["ready", "paused"].includes(g.phase)) return false;
    g.endsAt = now + g.remaining;
    g.phase = "speaking";
    return true;
  }
  function pauseTimer(g, now = Date.now()) {
    if (!g || g.done || g.phase !== "speaking") return false;
    g.remaining = timeLeft(g, now);
    g.endsAt = null;
    g.phase = g.remaining > 0 ? "paused" : "voting";
    return true;
  }
  function finishSpeech(g) {
    if (!g || g.done || !["ready", "speaking", "paused"].includes(g.phase)) return false;
    g.phase = "voting"; g.remaining = 0; g.endsAt = null;
    return true;
  }
  function replacePitch(g) {
    if (!g || g.done || g.phase !== "ready" || !g.reserve.length) return false;
    g.turns[g.i].drink = g.reserve.shift();
    return true;
  }
  function scorePitch(g, votes, skip = false) {
    if (!g || g.done || g.phase === "scored" || (!skip && g.phase !== "voting")) return false;
    if (!Number.isInteger(votes) || votes < 0 || votes >= g.players.length) return false;
    Object.assign(g.turns[g.i], { votes: skip ? 0 : votes, skipped: skip });
    g.phase = "scored"; g.endsAt = null;
    return true;
  }
  function nextPitch(g) {
    if (!g || g.done || g.phase !== "scored") return false;
    if (++g.i === g.turns.length) g.done = true;
    else { g.phase = "ready"; g.remaining = 20000; g.endsAt = null; g.votes = null; }
    return true;
  }
  return { filterDrinks, duelSize, newDuel, pair, choose, replace, advance,
    newPitch, timeLeft, startTimer, pauseTimer, finishSpeech, replacePitch, scorePitch, nextPitch };
});
