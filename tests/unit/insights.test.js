const test = require("node:test");
const assert = require("node:assert");
const I = require("../../site/insights.js");

const r = (name, drink, score, at = "2026-10-12T10:00:00Z", extra = {}) => ({ name, drink, score, at, ...extra });

test("controversial: two raters are not enough", () => {
  assert.deepEqual(I.controversial([r("A", "x", 1), r("B", "x", 10)]), []);
});

test("controversial: 2/8/9 gives a spread of 7", () => {
  const [top] = I.controversial([r("A", "x", 2), r("B", "x", 8), r("C", "x", 9)]);
  assert.equal(top.drink, "x");
  assert.equal(top.spread, 7);
  assert.equal(top.n, 3);
  assert.deepEqual(top.votes.map((v) => v.score), [9, 8, 2]);
});

test("controversial: identical or close scores are no conflict", () => {
  assert.deepEqual(I.controversial([r("A", "x", 7), r("B", "x", 7), r("C", "x", 7)]), []);
  assert.deepEqual(I.controversial([r("A", "x", 6), r("B", "x", 7), r("C", "x", 8)]), []);
});

test("controversial: editing and removing recalculates", () => {
  const base = [r("A", "x", 2), r("B", "x", 8), r("C", "x", 9)];
  // A edits to 8 (newer rating wins)
  assert.deepEqual(I.controversial([...base, r("A", "x", 8, "2026-10-12T12:00:00Z")]), []);
  // C removes theirs
  assert.deepEqual(I.controversial(base.filter((x) => x.name !== "C")), []);
});

test("controversial: unknown drinks and bad data are ignored without crashing", () => {
  const known = (id) => id !== "gone";
  const rows = I.controversial([r("A", "gone", 1), r("B", "gone", 10), r("C", "gone", 5),
    { name: "A" }, null, r("A", "x", 11), r("", "x", 3)], { known });
  assert.deepEqual(rows, []);
});

test("controversial: sorted by spread, equal results share a place", () => {
  const rows = I.controversial([
    r("A", "a", 1), r("B", "a", 9), r("C", "a", 5),
    r("A", "b", 1), r("B", "b", 9), r("C", "b", 5),
    r("A", "c", 4), r("B", "c", 8), r("C", "c", 6),
  ]);
  assert.deepEqual(rows.map((x) => [x.drink, x.place, x.shared]), [["a", 1, true], ["b", 1, true], ["c", 3, false]]);
});

test("twins: [8,7,9] vs [7,7,8] is 2/3 point apart", () => {
  const { twins } = I.twins([r("Me", "a", 8), r("Me", "b", 7), r("Me", "c", 9), r("X", "a", 7), r("X", "b", 7), r("X", "c", 8)], "Me");
  assert.equal(twins.length, 1);
  assert.equal(twins[0].name, "X");
  assert.equal(twins[0].common, 3);
  assert.ok(Math.abs(twins[0].dist - 2 / 3) < 1e-9);
  assert.equal((Math.round(twins[0].dist * 10) / 10).toFixed(1).replace(".", ","), "0,7");
});

test("twins: identical scores give 0, ties share a place, never compared with yourself", () => {
  const data = ["a", "b", "c"].flatMap((d) => [r("Me", d, 6), r("X", d, 6), r("Y", d, 6)]);
  const { twins } = I.twins(data, "me");
  assert.deepEqual(twins.map((t) => [t.name, t.dist, t.place]), [["X", 0, 1], ["Y", 0, 1]]);
  assert.ok(twins.every((t) => t.shared));
});

test("twins: fewer than three shared drinks gives no twin", () => {
  const { twins, tooFew } = I.twins([r("Me", "a", 8), r("Me", "b", 7), r("X", "a", 8), r("X", "b", 7), r("X", "c", 1)], "Me");
  assert.deepEqual(twins, []);
  assert.deepEqual(tooFew, [{ name: "X", common: 2 }]);
});

test("twins: removing a rating updates the result", () => {
  const data = [r("Me", "a", 8), r("Me", "b", 7), r("Me", "c", 9), r("X", "a", 7), r("X", "b", 7), r("X", "c", 8)];
  assert.equal(I.twins(data.slice(0, 5), "Me").twins.length, 0);
});

test("favorite: highest score, newest on a tie", () => {
  const f = I.favorite([r("Me", "a", 9, "2026-10-12T10:00:00Z"), r("Me", "b", 9, "2026-10-12T11:00:00Z"), r("Me", "c", 4), r("X", "d", 10)], "me");
  assert.equal(f.drink, "b");
  assert.equal(I.favorite([], "me"), null);
});

test("birthday: date in Asia/Nicosia, not the phone's zone or UTC", () => {
  const ev = { date: "2026-10-13", tz: "Asia/Nicosia" };
  assert.equal(I.isEventDay(ev, new Date("2026-10-12T12:00:00Z")), false);
  assert.equal(I.isEventDay(ev, new Date("2026-10-12T20:59:00Z")), false); // 23:59 in Cyprus
  assert.equal(I.isEventDay(ev, new Date("2026-10-12T21:30:00Z")), true); // 00:30 on the 13th in Cyprus, still the 12th in UTC
  assert.equal(I.isEventDay(ev, new Date("2026-10-13T12:00:00Z")), true);
  assert.equal(I.isEventDay(ev, new Date("2026-10-13T21:30:00Z")), false); // 00:30 on the 14th in Cyprus
  assert.equal(I.isEventDay(ev, new Date("2026-10-14T12:00:00Z")), false);
  assert.equal(I.isEventDay(null, new Date()), false);
});
