// Pure calculations on the family's ratings: no network, no DOM.
// Used by app.js (window.DR_INSIGHTS) and by the unit tests (require).
// A rating is { drink, name, score, bar, comment, at }.
(function (root) {
  "use strict";

  const key = (s) => String(s || "").trim().toLowerCase();
  const EPS = 1e-9;

  // One valid rating per person and drink (the newest wins if there are two).
  // known(drinkId) filters out drinks that are no longer in the menu.
  function clean(ratings, known) {
    const seen = new Map();
    for (const r of ratings || []) {
      if (!r || typeof r.drink !== "string" || typeof r.name !== "string" || !r.name.trim()) continue;
      if (!Number.isInteger(r.score) || r.score < 1 || r.score > 10) continue;
      if (known && !known(r.drink)) continue;
      const k = key(r.name) + "|" + r.drink;
      const prev = seen.get(k);
      if (!prev || String(r.at || "") > String(prev.at || "")) seen.set(k, r);
    }
    return [...seen.values()];
  }

  // Equal results share a place; `same(a, b)` says when two rows are equal.
  function places(rows, same) {
    rows.forEach((x, i) => { x.place = i && same(rows[i - 1], x) ? rows[i - 1].place : i + 1; });
    rows.forEach((x) => { x.shared = rows.some((y) => y !== x && y.place === x.place); });
    return rows;
  }

  // Drinks the family disagrees most about: at least minRaters people and a
  // spread (highest minus lowest score) of at least minSpread.
  function controversial(ratings, { minRaters = 3, minSpread = 3, known } = {}) {
    const by = {};
    for (const r of clean(ratings, known)) (by[r.drink] ||= []).push(r);
    const rows = [];
    for (const [drink, list] of Object.entries(by)) {
      if (list.length < minRaters) continue;
      const scores = list.map((r) => r.score);
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      if (max - min < minSpread) continue;
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
      const votes = [...list].sort((a, b) => b.score - a.score || key(a.name).localeCompare(key(b.name)))
        .map((r) => ({ name: r.name, score: r.score }));
      rows.push({ drink, spread: max - min, min, max, n: list.length, sd, votes });
    }
    rows.sort((a, b) => b.spread - a.spread || b.sd - a.sd || b.n - a.n || (a.drink < b.drink ? -1 : 1));
    return places(rows, (a, b) => a.spread === b.spread && Math.abs(a.sd - b.sd) < EPS && a.n === b.n);
  }

  // How close `me` is to everyone else: the average score difference on the
  // drinks both have rated. Needs at least minCommon shared drinks.
  function twins(ratings, me, { minCommon = 3, known } = {}) {
    const all = clean(ratings, known);
    const mine = new Map(all.filter((r) => key(r.name) === key(me)).map((r) => [r.drink, r.score]));
    const others = new Map();
    for (const r of all) {
      if (key(r.name) === key(me)) continue;
      const o = others.get(key(r.name)) || { name: r.name, list: [] };
      o.list.push(r);
      others.set(key(r.name), o);
    }
    const rows = [];
    const tooFew = [];
    for (const { name, list } of others.values()) {
      const drinks = list.filter((r) => mine.has(r.drink))
        .map((r) => ({ drink: r.drink, mine: mine.get(r.drink), theirs: r.score }))
        .sort((a, b) => (a.drink < b.drink ? -1 : 1));
      if (drinks.length < minCommon) { tooFew.push({ name, common: drinks.length }); continue; }
      const dist = drinks.reduce((s, x) => s + Math.abs(x.mine - x.theirs), 0) / drinks.length;
      rows.push({ name, dist, common: drinks.length, drinks });
    }
    rows.sort((a, b) => a.dist - b.dist || b.common - a.common || key(a.name).localeCompare(key(b.name)));
    return { twins: places(rows, (a, b) => Math.abs(a.dist - b.dist) < EPS), tooFew };
  }

  // Someone's favourite: highest score, newest first on a tie.
  function favorite(ratings, name, { known } = {}) {
    return clean(ratings, known).filter((r) => key(r.name) === key(name))
      .sort((a, b) => b.score - a.score || String(b.at || "").localeCompare(String(a.at || "")))[0] || null;
  }

  // The calendar date ("YYYY-MM-DD") in a time zone, whatever zone the phone is in.
  function dateIn(timeZone, now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const isEventDay = (event, now) => !!event && dateIn(event.tz, now) === event.date;

  const api = { clean, controversial, twins, favorite, dateIn, isEventDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DR_INSIGHTS = api;
})(typeof window !== "undefined" ? window : globalThis);
