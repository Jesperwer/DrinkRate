const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../site/lagkamp.js");

// Synthetic menu and family. No real family data.
const drink = (id, cat = "cocktail", extra = {}) => ({ id, name: id.replace(/-/g, " "), desc: `Menu text for ${id} with lime`, cat, bars: ["amph"], ...extra });
const DRINKS = [
  ...Array.from({ length: 24 }, (_, i) => drink(`cocktail-${i}`)),
  ...Array.from({ length: 6 }, (_, i) => drink(`juice-${i}`, "free")),
];
const FAMILY = ["Ada", "Bo", "Cy", "Di", "Eli"];
const r = (name, drinkId, score, comment = "") => ({ name, drink: drinkId, score, comment });

// A rich synthetic family: every drink rated by three or four people, comments, photos.
function rich() {
  const ratings = [], photos = [];
  DRINKS.slice(0, 20).forEach((d, i) => {
    const raters = FAMILY.filter((_, j) => (i + j) % 5 !== 0);
    raters.forEach((name, j) => ratings.push(r(name, d.id, 1 + ((i * 3 + j * 4) % 10), j % 2 ? `Comment ${i}-${j} sour and sweet` : "")));
    if (i < 12) photos.push({ mediaId: `m${i}`, drink: d.id, name: raters[i % raters.length] });
  });
  return L.snapshot({ ratings, photos, family: FAMILY, drinks: DRINKS, at: "2026-10-13T20:00:00Z" });
}
const ALL = { count: 10, types: L.TYPES, menuReserve: false, cat: "all", bar: "all" };

function teams(n = 2) {
  return Array.from({ length: n }, (_, i) => ({ teamId: `t${i + 1}`, name: `Lag ${i + 1}`, mark: i, members: [{ memberId: `m${i}`, name: FAMILY[i] }] }));
}
function game(n = 2, settings = ALL, seed = 7) {
  const deck = L.buildDeck(rich(), DRINKS, settings, L.seeded(seed));
  return L.newSession({ sessionId: "s1", ownerKey: "ada", teams: teams(n), settings, deck, snapshotAt: "x", now: 1 });
}
let ids = 0;
function act(s, type, extra = {}) {
  const res = L.apply(s, { type, actionId: `a${++ids}`, expect: { revision: s.revision }, ...extra }, 100 + ids);
  assert.ok(res.ok, `${type} failed: ${res.error}`);
  return res.session;
}
const q = (s) => s.questions[s.order[s.cursor.index]];
const wrongOf = (qq) => qq.options.find((o) => !qq.accepted.includes(o.optionId)).optionId;
// Play the current question: picks[i] is "right", "wrong" or "pass" for the i-th team in turn order.
function play(s, picks) {
  s = act(s, "begin");
  for (const p of picks) {
    s = act(s, "ready");
    const qq = q(s);
    s = act(s, "lock", { optionId: p === "pass" ? null : p === "right" ? qq.accepted[0] : wrongOf(qq) });
  }
  return act(s, "reveal");
}

test("teams: 2–4 teams, a member on one team only, no empty team, guests apart from the family", () => {
  const t = (...members) => ({ name: `Lag ${members[0]}`, members: members.map((name) => ({ name })) });
  for (const n of [2, 3, 4]) assert.deepEqual(L.checkTeams(Array.from({ length: n }, (_, i) => t(FAMILY[i])), FAMILY), []);
  assert.match(L.checkTeams([t("Ada")], FAMILY)[0], /mellom 2 og 4/);
  assert.match(L.checkTeams([t("Ada"), t("Bo"), t("Cy"), t("Di"), t("Eli")], FAMILY)[0], /mellom 2 og 4/);
  assert.match(L.checkTeams([t("Ada"), { name: "Tomt", members: [] }], FAMILY).join(), /minst én deltaker/);
  assert.match(L.checkTeams([t("Ada", "Bo"), t("Cy", "bo ")], FAMILY).join(), /Bo er med to ganger|bo er med to ganger/);
  assert.match(L.checkTeams([t("Ada"), { name: "Gjester", members: [{ name: "ada", guest: true }] }], FAMILY).join(), /finnes i familien/);
  assert.match(L.checkTeams([t("Ada"), { name: "x".repeat(25), members: [{ name: "Bo" }] }], FAMILY).join(), /for langt/);
  assert.match(L.checkTeams([{ name: "Blå", members: [{ name: "Ada" }] }, { name: " blå ", members: [{ name: "Bo" }] }], FAMILY).join(), /To lag heter/);
  // Norwegian letters are not folded into others: Åse and Ase are two different guests.
  assert.deepEqual(L.checkTeams([{ name: "A", members: [{ name: "Åse", guest: true }] }, { name: "B", members: [{ name: "Ase", guest: true }] }], FAMILY), []);
});

test("snapshot keeps only valid ratings and photos that belong to a rating", () => {
  const s = L.snapshot({ family: ["Ada", "Bo"], drinks: DRINKS, ratings: [
    r("Ada", "cocktail-0", 8), r("ada", "cocktail-0", 3), r("Bo", "nope", 5), r("Bo", "cocktail-1", 11), r("Bo", "cocktail-1", 7.5), r("", "cocktail-1", 4), r("Bo", "cocktail-2", 6),
  ], photos: [{ mediaId: "m1", drink: "cocktail-0", name: "ADA" }, { mediaId: "m2", drink: "cocktail-1", name: "Bo" }, { mediaId: "m3", drink: "cocktail-2", name: "Bo" }] });
  assert.equal(s.ratings.length, 2);
  assert.equal(s.rejected, 5);
  assert.deepEqual(s.photos.map((p) => [p.mediaId, p.name]), [["m1", "Ada"], ["m3", "Bo"]]);
});

test("5/10/15 questions in rounds of 1–3 with every type, real options and at least one wrong option", () => {
  for (const count of L.COUNTS) {
    const deck = L.buildDeck(rich(), DRINKS, { ...ALL, count }, L.seeded(count));
    assert.equal(deck.total, count);
    assert.equal(deck.order.length, count);
    assert.equal(deck.short, false);
    for (const round of deck.rounds) assert.ok(round.questionIds.length >= 1 && round.questionIds.length <= 3);
    for (const id of deck.order) {
      const qq = deck.questions[id];
      assert.ok(qq.options.length >= 2 && qq.options.length <= 3, `${qq.type} has ${qq.options.length} options`);
      assert.equal(new Set(qq.options.map((o) => o.label.toLowerCase())).size, qq.options.length, "no duplicate options");
      assert.ok(qq.accepted.length >= 1 && qq.accepted.every((a) => qq.options.some((o) => o.optionId === a)));
      assert.ok(qq.options.some((o) => !qq.accepted.includes(o.optionId)), "never only right answers");
      if (qq.type === "familyAverage") assert.equal(qq.options.length, 2);
    }
    if (count === 15) assert.deepEqual(Object.keys(deck.byType).sort(), [...L.TYPES].sort());
  }
});

test("a round never gives away a later answer, and no answer fact is used twice", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const deck = L.buildDeck(rich(), DRINKS, { ...ALL, count: 15 }, L.seeded(seed));
    const seen = new Set();
    for (const round of deck.rounds) {
      const qs = round.questionIds.map((id) => deck.questions[id]);
      // The drink is guessed from the photo before any prompt names it.
      const pd = qs.findIndex((x) => x.type === "photoDrink");
      if (pd >= 0) assert.equal(pd, 0, `seed ${seed}: photo question first`);
      assert.equal(new Set(qs.map((x) => x.source.drink)).size, 1, "one drink per round");
      for (const x of qs) for (const k of x.source.answerKeys) {
        assert.ok(!seen.has(k), `seed ${seed}: rating ${k} answered twice`);
        seen.add(k);
      }
    }
    assert.equal(new Set(deck.rounds.map((rd) => deck.questions[rd.questionIds[0]].source.drink)).size, deck.rounds.length, "no drink twice as a round");
  }
});

test("the same person's photo, comment and score on one drink: a valid combination or a smaller round", () => {
  const snap = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [r("Ada", "cocktail-0", 3, "Too sweet for me")],
    photos: [{ mediaId: "m1", drink: "cocktail-0", name: "Ada" }] });
  for (let seed = 1; seed <= 20; seed++) {
    const deck = L.buildDeck(snap, DRINKS, { ...ALL, count: 5 }, L.seeded(seed));
    const types = deck.order.map((id) => deck.questions[id].type);
    assert.ok(types.length >= 1 && types.length <= 2, types.join());
    assert.equal(types.filter((t) => ["photoOwner", "whoWrote", "whoRated"].includes(t)).length, 1, `seed ${seed}: ${types}`);
    if (types.includes("photoDrink")) assert.equal(types[0], "photoDrink");
  }
});

test("several people with the same score or text: everyone who fits is accepted", () => {
  const snap = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [
    r("Ada", "cocktail-0", 7, "Nice and fresh"), r("Bo", "cocktail-0", 7, "nice  and FRESH"), r("Cy", "cocktail-0", 2), r("Di", "cocktail-0", 5),
  ] });
  for (const type of ["whoRated", "whoWrote"]) {
    for (let seed = 1; seed <= 15; seed++) {
      const deck = L.buildDeck(snap, DRINKS, { ...ALL, count: 5, types: [type] }, L.seeded(seed));
      const qq = Object.values(deck.questions).find((x) => x.prompt.title.includes(type === "whoRated" ? "7/10" : "skrev"));
      if (!qq) continue;
      const shown = qq.options.filter((o) => ["Ada", "Bo"].includes(o.label)).map((o) => o.optionId).sort();
      assert.deepEqual([...qq.accepted].sort(), shown, `${type}: every right name shown is accepted`);
      assert.equal(qq.multi, shown.length > 1);
      if (type === "whoWrote") assert.match(qq.reveal.lines[0], /Ada og Bo|Bo og Ada/);
    }
  }
});

test("comments that name someone in the family are never used", () => {
  const snap = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [r("Ada", "cocktail-0", 7, "Bo would love this"), r("Bo", "cocktail-0", 3), r("Cy", "cocktail-1", 4)] });
  const deck = L.buildDeck(snap, DRINKS, { ...ALL, types: ["whoWrote"] }, L.seeded(1));
  assert.equal(deck.total, 0);
  assert.deepEqual(deck.missing, ["whoWrote"]);
});

test("family average: plain arithmetic mean, at least two ratings, no ties", () => {
  const snap = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [
    r("Ada", "cocktail-0", 9), r("Bo", "cocktail-0", 6), r("Cy", "cocktail-0", 6), // 7,0 (21/3)
    r("Ada", "cocktail-1", 8), r("Bo", "cocktail-1", 6), // 7,0 (14/2): a tie with cocktail-0
    r("Ada", "cocktail-2", 10), r("Bo", "cocktail-2", 5), // 7,5 (15/2)
    r("Ada", "cocktail-3", 10), // one rating only
  ] });
  const pairs = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const deck = L.buildDeck(snap, DRINKS, { ...ALL, count: 5, types: ["familyAverage"] }, L.seeded(seed));
    for (const qq of Object.values(deck.questions)) {
      const labels = qq.options.map((o) => o.drink).sort();
      pairs.add(labels.join("+"));
      const right = qq.options.find((o) => o.optionId === qq.accepted[0]).drink;
      assert.equal(right, "cocktail-2");
      assert.ok(qq.reveal.lines.some((l) => l.includes("snitt 7,5 (15 poeng / 2 karakterer)")));
      assert.ok(qq.reveal.lines.some((l) => /snitt 7,0 \((21 poeng \/ 3|14 poeng \/ 2) karakterer\)/.test(l)));
    }
  }
  assert.deepEqual([...pairs].sort(), ["cocktail-0+cocktail-2", "cocktail-1+cocktail-2"]);
});

test("little data: an honest shorter game, menu fallback only when allowed, nothing invented", () => {
  const empty = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [] });
  const none = L.buildDeck(empty, DRINKS, ALL, L.seeded(1));
  assert.equal(none.total, 0);
  assert.equal(none.short, true);
  assert.deepEqual(none.missing.sort(), [...L.TYPES].sort());
  const reserve = L.buildDeck(empty, DRINKS, { ...ALL, count: 5, menuReserve: true }, L.seeded(1));
  assert.equal(reserve.total, 5);
  assert.equal(reserve.reserve, 5);
  for (const qq of Object.values(reserve.questions)) {
    const d = DRINKS.find((x) => x.id === qq.source.drink);
    assert.equal(qq.prompt.quote, d.desc);
    assert.equal(qq.options.length, 3);
  }
  const few = L.snapshot({ family: FAMILY, drinks: DRINKS, ratings: [r("Ada", "cocktail-0", 4), r("Bo", "cocktail-1", 9)] });
  const short = L.buildDeck(few, DRINKS, ALL, L.seeded(2));
  assert.ok(short.total > 0 && short.total < 10);
  assert.equal(short.short, true);
});

test("phases: everyone answers before the reveal, a locked answer stays hidden, repeats count once", () => {
  let s = game(3);
  const order = L.turnOrder(s);
  assert.equal(L.apply(s, { type: "reveal", actionId: "x1" }).error, "phase");
  s = act(s, "begin");
  assert.equal(L.view(s).teamId, order[0]);
  assert.equal(L.apply(s, { type: "ready", actionId: "x2", expect: { teamId: order[1] } }).error, "team");
  s = act(s, "ready");
  const qq = q(s);
  const lockAction = { type: "lock", actionId: "dup", optionId: qq.accepted[0], expect: { revision: s.revision, phase: "answering" } };
  s = L.apply(s, lockAction).session;
  assert.equal(L.apply(s, lockAction).error, "duplicate");
  assert.equal(L.apply(s, { ...lockAction, actionId: "dup2" }).error, "stale");
  // The next team sees no trace of the first team's choice.
  const v = L.view(s);
  assert.equal(v.phase, "handoff");
  assert.equal(v.reveal, null);
  const text = JSON.stringify(v);
  for (const hidden of ["accepted", "source", "reveal\":{", "\"point\"", "\"right\""]) assert.ok(!text.includes(hidden), `view leaks ${hidden}`);
  assert.deepEqual(Object.keys(v.question.options[0]).sort(), ["drink", "label", "optionId"]);
  s = act(s, "ready");
  s = act(s, "lock", { optionId: null }); // pass
  assert.equal(L.view(s).phase, "handoff");
  assert.equal(L.apply(s, { type: "reveal", actionId: "x3" }).error, "phase");
  s = act(s, "ready");
  s = act(s, "lock", { optionId: wrongOf(qq) });
  assert.equal(L.view(s).phase, "ready");
  s = act(s, "reveal");
  assert.equal(L.apply(s, { type: "reveal", actionId: "x4" }).error, "phase");
  const rv = L.view(s).reveal;
  assert.deepEqual(rv.teams.map((t) => t.point), s.teams.map((t) => t.teamId === order[0]));
  assert.deepEqual(L.results(s).totals, Object.fromEntries(s.teams.map((t) => [t.teamId, t.teamId === order[0] ? 1 : 0])));
});

test("undo a locked answer only for the last team and only before the next team opens its screen", () => {
  let s = act(game(2), "begin");
  assert.equal(L.apply(s, { type: "unlock", actionId: "u0" }).error, "phase");
  s = act(s, "ready");
  s = act(s, "lock", { optionId: wrongOf(q(s)) });
  assert.ok(L.view(s).canUnlock);
  s = act(s, "unlock");
  assert.equal(L.view(s).phase, "handoff");
  assert.equal(L.view(s).teamId, L.turnOrder(s)[0]);
  assert.equal(L.answers(s, q(s).questionId).size, 0);
  s = act(s, "ready");
  s = act(s, "lock", { optionId: q(s).accepted[0] });
  s = act(s, "ready"); // the next team opened its screen: too late to undo
  assert.equal(L.apply(s, { type: "unlock", actionId: "u1" }).error, "phase");
  s = act(s, "lock", { optionId: q(s).accepted[0] });
  assert.ok(L.view(s).canUnlock); // ready: the last team may still fix a mistap
  s = act(s, "reveal");
  assert.equal(L.apply(s, { type: "unlock", actionId: "u2" }).error, "phase");
});

test("answer order rotates so no team always starts", () => {
  let s = game(3);
  const firsts = [];
  for (let i = 0; i < 3; i++) {
    firsts.push(L.turnOrder(s)[0]);
    s = play(s, ["wrong", "wrong", "wrong"]);
    s = act(s, "next");
    if (L.view(s).phase === "roundEnd") s = act(s, "next");
  }
  assert.deepEqual(firsts, ["t1", "t2", "t3"]);
});

test("scoring: right, wrong, pass, several right, all wrong", () => {
  let s = game(4);
  s = play(s, ["right", "wrong", "pass", "right"]);
  const o = L.turnOrder(s);
  assert.deepEqual(L.outcome(s, q(s).questionId).teams.sort(), [o[0], o[3]].sort());
  s = act(s, "next");
  if (L.view(s).phase === "roundEnd") s = act(s, "next");
  s = play(s, ["wrong", "wrong", "pass", "wrong"]);
  const res = L.results(s);
  assert.equal(Object.values(res.totals).reduce((a, b) => a + b, 0), 2);
  assert.equal(res.answered, 2);
});

test("skip voids the whole question, also after one answer; earlier points stay", () => {
  let s = play(game(2), ["right", "right"]);
  s = act(s, "next");
  if (L.view(s).phase === "roundEnd") s = act(s, "next");
  const before = L.results(s).totals;
  s = act(s, "begin");
  s = act(s, "ready");
  s = act(s, "lock", { optionId: q(s).accepted[0] });
  const skipped = q(s).questionId;
  s = act(s, "skip");
  assert.equal(L.outcome(s, skipped).status, "skipped");
  assert.deepEqual(L.results(s).totals, before);
  assert.equal(L.results(s).skipped, 1);
  assert.equal(L.history(s).find((h) => h.questionId === skipped).reveal, null, "a skipped question shows no answer");
  assert.notEqual(L.view(s).question?.questionId, skipped);
});

test("corrections replace the automatic point, need a reason, can be reset and undone", () => {
  let s = play(game(3), ["right", "wrong", "wrong"]);
  const qid = q(s).questionId, [a, b, c] = L.turnOrder(s);
  assert.equal(L.apply(s, { type: "correct", actionId: "c0", questionId: qid, teams: [a, b] }).error, "reason");
  s = act(s, "correct", { questionId: qid, teams: [a, b], reason: "Uklart bilde" });
  assert.deepEqual(L.outcome(s, qid).teams, [a, b].sort((x, y) => s.teams.findIndex((t) => t.teamId === x) - s.teams.findIndex((t) => t.teamId === y)));
  assert.equal(Object.values(L.results(s).totals).reduce((x, y) => x + y, 0), 2, "no extra point on top");
  s = act(s, "correct", { questionId: qid, teams: [a, b, c], reason: "Alle" });
  s = act(s, "correct", { questionId: qid, teams: [], reason: "Ingen" });
  assert.equal(Object.values(L.results(s).totals).reduce((x, y) => x + y, 0), 0);
  s = act(s, "uncorrect", { questionId: qid });
  assert.equal(L.outcome(s, qid).teams.length, 3);
  s = act(s, "correct", { questionId: qid, mode: "auto" });
  assert.deepEqual(L.outcome(s, qid).teams, [a]);
  assert.equal(L.outcome(s, qid).corrected, false);
  assert.equal(L.apply(s, { type: "correct", actionId: "c9", questionId: qid, mode: "auto" }).error, "unchanged");
  const log = L.outcome(s, qid).log;
  assert.deepEqual(log.map((e) => e.type), ["correct", "correct", "correct", "uncorrect", "correct"]);
  assert.equal(log[0].reason, "Uklart bilde");
  assert.deepEqual(log[0].before, [a]);
  // A pending question cannot be corrected.
  assert.equal(L.apply(s, { type: "correct", actionId: "c10", questionId: s.order[s.order.length - 1], teams: [a], reason: "x" }).error, "not-revealed");
});

test("round and final winners: shared wins, no bonus, no winner when nobody scored", () => {
  let s = game(2, { ...ALL, count: 5 }, 3);
  const firstRound = s.rounds[0].questionIds.length;
  for (let i = 0; i < firstRound; i++) {
    // Order rotates: the first team in turn is t1 for question 1 and t2 for question 2.
    s = play(s, i < 2 ? ["right", "wrong"] : ["wrong", "wrong"]);
    s = act(s, "next");
  }
  assert.equal(L.view(s).phase, "roundEnd");
  const round = L.view(s).round;
  if (firstRound >= 2) assert.deepEqual(round.winners.sort(), ["t1", "t2"]);
  assert.equal(Object.values(round.points).reduce((a, b) => a + b, 0), Math.min(firstRound, 2));
  s = act(s, "finish");
  assert.equal(s.status, "finished");
  assert.equal(s.endedEarly, true);
  const res = L.results(s);
  if (firstRound >= 2) { assert.deepEqual(res.winners.sort(), ["t1", "t2"]); assert.equal(res.max, 1); }
  let z = play(game(2), ["wrong", "pass"]);
  z = act(z, "finish");
  assert.deepEqual(L.results(z).winners, []);
  assert.equal(L.results(z).max, 0);
});

test("a whole game to the end, a correction of an earlier question updates rounds and totals", () => {
  let s = game(2, { ...ALL, count: 5 }, 11);
  while (s.status !== "finished") {
    const v = L.view(s);
    if (v.phase === "intro") s = play(s, ["right", "wrong"]);
    else s = act(s, "next");
  }
  assert.equal(s.endedEarly, false);
  const res = L.results(s);
  assert.equal(res.answered, 5);
  const first = s.order[0], firstTeam = L.turnOrder(s, 0)[0];
  const before = res.totals[firstTeam];
  assert.ok(before >= 1);
  // The table can still fix a point on the final screen; the totals follow.
  s = act(s, "correct", { questionId: first, teams: [], reason: "Feiltrykk" });
  assert.equal(L.results(s).totals[firstTeam], before - 1);
  assert.equal(L.apply(s, { type: "next", actionId: "late" }).error, "over");
});

test("pause blocks play until resumed; the view after loading shows no answers", () => {
  let s = act(game(2), "begin");
  s = act(s, "ready");
  s = act(s, "pause");
  assert.equal(L.apply(s, { type: "lock", actionId: "p1", optionId: "a" }).error, "paused");
  s = act(s, "resume");
  s = act(s, "lock", { optionId: "a" });
  const stored = JSON.parse(JSON.stringify(s));
  assert.equal(L.check(stored), "");
  assert.equal(L.view(stored).reveal, null);
  assert.equal(L.view(stored).phase, "handoff");
});

test("a stored game is checked before it is trusted", () => {
  const s = game(2);
  assert.equal(L.check(s), "");
  assert.match(L.check({ ...s, schemaVersion: 99 }), /ukjent versjon/);
  assert.match(L.check({ ...s, teams: [s.teams[0]] }), /lagene/);
  assert.match(L.check({ ...s, order: [...s.order, "q999"] }), /spørsmål/);
  assert.match(L.check({ ...s, cursor: { index: 999, phase: "intro", turn: 0 } }), /posisjon/);
  assert.match(L.check({ ...s, events: [{ type: "lock", questionId: "zzz" }] }), /logg/);
  assert.match(L.check({ ...s, events: [{ type: "lock", questionId: s.order[0], teamId: "ukjent" }] }), /ukjent lag/);
  assert.match(L.check(null), /ingen data/);
});

test("new games get new ids and start at zero; the old result stays as it was", () => {
  let a = play(game(2), ["right", "right"]);
  a = act(a, "finish");
  const b = L.newSession({ sessionId: "s2", ownerKey: "ada", teams: teams(2).map((t) => ({ ...t, teamId: `x-${t.teamId}` })), settings: ALL,
    deck: L.buildDeck(rich(), DRINKS, ALL, L.seeded(99)), snapshotAt: "y", now: 2 });
  assert.deepEqual(Object.values(L.results(b).totals), [0, 0]);
  assert.notEqual(b.sessionId, a.sessionId);
  assert.equal(Object.values(L.results(a).totals).reduce((x, y) => x + y, 0), 2);
});
