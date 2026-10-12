const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const Q = require("../../site/quiz.js");

// drinks.js is a browser script; run it with a fake window.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../site/drinks.js"), "utf8"), sandbox);
const DRINKS = sandbox.window.DRINKS;
const DRINK = Object.fromEntries(DRINKS.map((d) => [d.id, d]));

// Small deterministic random generator.
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const FAMILY = ["Luise", "Jesper", "Jakob", "Astri", "Ingvild", "Anne", "Julie"];
const c = (name, drink, comment, score = 7) => ({ name, drink, comment, score });

const valid = (q) => q.options.length === 3 && new Set(q.options).size === 3 && q.answer >= 0 && q.answer < 3;

test("who wrote: nothing to ask without comments, or from only one person", () => {
  assert.deepEqual(Q.whoWrote([], FAMILY, { rng: seeded(1) }), []);
  assert.deepEqual(Q.whoWrote([c("Jesper", "mojito", "Sterk!")], FAMILY, { rng: seeded(1) }), []);
  assert.deepEqual(Q.whoWrote([c("Jesper", "mojito", "Sterk!"), c("Jesper", "gin-fizz", "Frisk")], FAMILY, { rng: seeded(1) }), []);
});

test("who wrote: real comments, three different family names, one right answer", () => {
  const qs = Q.whoWrote([c("Jesper", "mojito", "Sterk!"), c("Astri", "gin-fizz", "Frisk og god")], FAMILY, { rng: seeded(2) });
  assert.equal(qs.length, 2);
  for (const q of qs) {
    assert.ok(valid(q));
    assert.ok(q.options.every((o) => FAMILY.includes(o)));
    assert.equal(q.options[q.answer], q.text === "Sterk!" ? "Jesper" : "Astri");
  }
});

test("who wrote: leaves out names in the text, shared texts and blanks; keeps HTML as text", () => {
  const qs = Q.whoWrote([
    c("Jesper", "mojito", "Anne ville likt denne"),
    c("Jesper", "gin-fizz", "Nam"), c("Astri", "summer-smash", "nam"),
    c("Jakob", "berry-collins", "   "),
    c("Jakob", "mojito", "Beste <b>hittil</b>"),
    c("Luise", "gin-fizz", "Søt"),
  ], FAMILY, { rng: seeded(3) });
  assert.deepEqual(qs.map((q) => q.text).sort(), ["Beste <b>hittil</b>", "Søt"]);
});

test("who wrote: at most five unique questions", () => {
  const many = FAMILY.flatMap((n, i) => [c(n, DRINKS[i].id, `Kommentar ${i} a`), c(n, DRINKS[i + 10].id, `Kommentar ${i} b`)]);
  const qs = Q.whoWrote(many, FAMILY, { rng: seeded(4) });
  assert.equal(qs.length, 5);
  assert.equal(new Set(qs.map((q) => q.key)).size, 5);
});

test("menu quiz: answers checked against drinks.js", () => {
  const qs = Q.menu(DRINKS, { rng: seeded(5), n: 5 });
  assert.equal(qs.length, 5);
  for (const q of qs) {
    assert.ok(valid(q));
    const d = DRINK[q.drink];
    assert.equal(q.options[q.answer], d.name);
    assert.equal(q.text, d.desc);
    assert.ok(!q.text.toLowerCase().includes(d.name.toLowerCase()));
    // The description fits only the right answer
    assert.equal(DRINKS.filter((x) => q.options.includes(x.name) && x.desc === q.text).length, 1);
  }
});

test("who round: topped up with menu questions to five", () => {
  const qs = Q.whoRound({ ratings: [c("Jesper", "mojito", "Sterk!"), c("Astri", "gin-fizz", "Frisk")], people: FAMILY, drinks: DRINKS, rng: seeded(6) });
  assert.equal(qs.length, 5);
  assert.equal(qs.filter((q) => q.type === "who").length, 2);
  assert.ok(qs.every(valid));
  assert.equal(new Set(qs.map((q) => q.drink)).size, 5);
});

test("guess the score: someone else's real score among three numbers 1–10", () => {
  const ratings = [c("Jesper", "mojito", null, 1), c("Astri", "gin-fizz", null, 10), c("Ingvild", "mojito", null, 6), c("Me", "x", null, 5)];
  const qs = Q.guessScore(ratings, "me", { rng: seeded(7) });
  assert.equal(qs.length, 3);
  for (const q of qs) {
    assert.ok(valid(q));
    assert.notEqual(q.name, "Me");
    assert.ok(q.options.every((o) => Number(o) >= 1 && Number(o) <= 10));
    const real = ratings.find((r) => r.name === q.name && r.drink === q.drink).score;
    assert.equal(q.options[q.answer], String(real));
  }
});

test("round: first tap counts, double taps ignored, summary counts right answers", () => {
  const qs = Q.whoRound({ ratings: [], people: FAMILY, drinks: DRINKS, rng: seeded(8) });
  const round = Q.newRound("who", qs);
  assert.equal(Q.next(round), false, "cannot skip without answering");
  assert.equal(Q.answer(round, qs[0].answer), true);
  assert.equal(Q.answer(round, (qs[0].answer + 1) % 3), false);
  assert.equal(round.picks[0], qs[0].answer);
  for (let i = 1; i < qs.length; i++) { Q.next(round); Q.answer(round, (qs[i].answer + 1) % 3); }
  Q.next(round);
  assert.equal(round.done, true);
  assert.equal(Q.correct(round), 1);
  assert.equal(Q.answer(round, 0), false);
  assert.equal(Q.newRound("who", []).done, true);
});
