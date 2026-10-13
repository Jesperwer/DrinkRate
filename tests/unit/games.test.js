const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../site/games.js");
const drink = (id, extra = {}) => ({ id, name: id, desc: "Lime and mint", cat: "cocktail", bars: ["amph", "cap"], ai: ["amph"], ...extra });
const menu = Array.from({ length: 20 }, (_, i) => drink(`drink-${i}`));
const rng = () => 0.5;

test("untested is independent of bar, category, all-inclusive and search", () => {
  const ds = [drink("mojito"), drink("berry", { ai: ["cap"] }), drink("tea", { cat: "coffee" }), drink("cafe", { name: "Café crème", desc: "Coffee", cat: "coffee" })];
  const rated = new Set(["mojito"]);
  assert.deepEqual(G.filterDrinks(ds, { untestedOnly: true }, rated).map((d) => d.id), ["berry", "tea", "cafe"]);
  assert.deepEqual(G.filterDrinks(ds, { bar: "cap", cat: "cocktail", aiOnly: true, untestedOnly: true, q: "mint" }, rated).map((d) => d.id), ["berry"]);
  assert.equal(G.filterDrinks(ds, { bar: "cap", cat: "coffee", aiOnly: true }).length, 0);
  assert.equal(G.filterDrinks(ds, { q: "CAFE CREME" })[0].id, "cafe");
  assert.equal(G.filterDrinks(ds, { untestedOnly: false }, rated).length, ds.length);
});
test("different users and newly added/removed ratings change only their own untested list", () => {
  const rated = new Set(["drink-0"]);
  assert.equal(G.filterDrinks(menu, { untestedOnly: true }, rated).length, 19);
  assert.equal(G.filterDrinks(menu, { untestedOnly: true }, new Set()).length, 20);
  rated.add("drink-1");
  assert.equal(G.filterDrinks(menu, { untestedOnly: true }, rated).length, 18);
  rated.delete("drink-0");
  assert.ok(G.filterDrinks(menu, { untestedOnly: true }, rated).some((d) => d.id === "drink-0"));
});
test("duel uses complete brackets even for small pools and ignores duplicate ids", () => {
  for (const [n, size] of [[0, 0], [1, 0], [2, 2], [3, 2], [4, 4], [7, 4], [8, 8], [20, 8]]) {
    assert.equal(G.newDuel(menu.slice(0, n), rng)?.size || 0, size);
  }
  assert.equal(G.newDuel([menu[0], menu[0]]), null);
});
test("eight-drink duel takes seven decisions, locks each choice, and returns the actual winner", () => {
  const g = G.newDuel(menu, rng), original = [...g.round];
  let count = 0;
  while (!g.done) {
    const p = G.pair(g);
    assert.equal(p.length, 2);
    assert.equal(G.advance(g), false);
    assert.equal(G.choose(g, "missing"), false);
    assert.equal(G.choose(g, p[0]), true);
    assert.equal(G.choose(g, p[1]), false);
    assert.equal(G.advance(g), true);
    count++;
  }
  assert.equal(count, 7);
  assert.equal(g.winner, original[0]);
  assert.equal(g.history.length, 7);
  assert.equal(G.advance(g), false);
  assert.equal(G.choose(g, g.winner), false);
  assert.deepEqual(menu.map((d) => d.id), Array.from({ length: 20 }, (_, i) => `drink-${i}`));
});
test("replacing a candidate never repeats a drink and is limited to the opening round", () => {
  const g = G.newDuel(menu, rng), seen = new Set(g.round);
  while (g.reserve.length) {
    const old = G.pair(g)[0];
    assert.ok(G.replace(g, old));
    const next = G.pair(g)[0];
    assert.ok(!seen.has(next)); seen.add(next);
  }
  assert.equal(G.replace(g, G.pair(g)[0]), false);
  for (let i = 0; i < 4; i++) { G.choose(g, G.pair(g)[0]); G.advance(g); }
  g.reserve.push("extra");
  assert.equal(G.replace(g, G.pair(g)[0]), false);
});
test("pitch requires two unique players and enough distinct drinks", () => {
  assert.equal(G.newPitch(menu, ["A", "A"]), null);
  assert.equal(G.newPitch(menu.slice(0, 1), ["A", "B"]), null);
  const g = G.newPitch(menu, ["A", "B", "C"], rng);
  assert.deepEqual(g.turns.map((t) => t.target), ["B", "C", "A"]);
  assert.equal(new Set(g.turns.map((t) => t.drink)).size, 3);
  const old = g.turns[0].drink;
  assert.ok(G.replacePitch(g));
  assert.notEqual(g.turns[0].drink, old);
  G.startTimer(g, 1000);
  assert.equal(G.replacePitch(g), false);
});
test("pitch timer measures elapsed time, pauses and resumes without resetting", () => {
  const g = G.newPitch(menu, ["A", "B"], rng);
  assert.ok(G.startTimer(g, 1000));
  assert.equal(G.startTimer(g, 2000), false);
  assert.equal(G.timeLeft(g, 6000), 15000);
  assert.ok(G.pauseTimer(g, 6000));
  assert.equal(G.timeLeft(g, 90000), 15000);
  assert.ok(G.startTimer(g, 90000));
  assert.equal(G.timeLeft(g, 95000), 10000);
  assert.equal(G.timeLeft(g, 110000), 0);
  assert.ok(G.pauseTimer(g, 110000));
  assert.equal(g.phase, "voting");
});
test("pitch scores each turn once, supports zero and skip, and ends after every player", () => {
  const g = G.newPitch(menu, ["A", "B", "C"], rng);
  assert.equal(G.scorePitch(g, 1), false);
  assert.equal(G.nextPitch(g), false);
  G.finishSpeech(g);
  for (const invalid of [null, -1, 3, 1.5]) assert.equal(G.scorePitch(g, invalid), false);
  assert.ok(G.scorePitch(g, 0));
  assert.equal(G.scorePitch(g, 2), false);
  assert.ok(G.nextPitch(g));
  assert.equal(g.remaining, 20000);
  assert.equal(G.nextPitch(g), false);
  assert.ok(G.scorePitch(g, 0, true));
  assert.ok(G.nextPitch(g));
  G.startTimer(g, 1000); G.finishSpeech(g);
  assert.ok(G.scorePitch(g, 2)); G.nextPitch(g);
  assert.equal(g.done, true);
  assert.deepEqual(g.turns.map((t) => t.votes), [0, 0, 2]);
  assert.equal(g.turns[1].skipped, true);
  assert.equal(G.nextPitch(g), false);
});
