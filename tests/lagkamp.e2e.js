// Lagkamp end-to-end test against the mock server and the local test database.
// Usage: PORT=8787 node tests/lagkamp.e2e.js <screenshot dir>
// Seeds its own synthetic ratings, comments and photos through the real database
// functions (local only), then plays whole games on an iPhone-sized Chromium.
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const OUT = process.argv[2] || ".";
const PORT = Number(process.env.PORT || 8787);
const BASE = `http://localhost:${PORT}/`;
const FAMILY = ["Luise", "Jesper", "Jakob", "Astri", "Ingvild", "Anne", "Julie"];
const CONFIG = `window.DR_CONFIG={url:"http://localhost:${PORT}",key:"sb_publishable_test",family:${JSON.stringify(FAMILY)},
  features:{quiz:true,tableGames:true,teamGame:true},birthday:null};`;
const PINS = { Jesper: "1234", Astri: "4321", Ingvild: "5555", Anne: "2222" };
const WRITES = ["dr_rate", "dr_set_photo", "dr_register"];

async function rpc(fn, args) {
  const res = await fetch(`http://localhost:${PORT}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: "test", "Content-Type": "application/json" }, body: JSON.stringify(args) });
  return res.json();
}

// Synthetic family data: four people, ten drinks, comments, scores and photos.
const DRINKS = ["summer-smash", "berry-collins", "gin-fizz", "gin-cooler", "gin-basil-smash", "tom-collins", "singapore-sling", "peach-shrub", "aged-negroni", "virgin-mojito"];
const TEXTS = ["Frisk og syrlig", "Altfor søt", "Smaker sommer", "Kjedelig", "Beste på turen", "Litt bitter", "Som saft", "Perfekt etter stranda", "Mye is", "Overraskende god"];
async function seed(browser) {
  const p = await browser.newPage();
  const thumbs = await p.evaluate(() => ["#e2553f", "#0d7a96", "#f2b134", "#4f9a62", "#8a5cb8"].map((c, i) => {
    const cv = document.createElement("canvas"); cv.width = 160; cv.height = 120;
    const g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 160, 120); g.fillStyle = "#fff"; g.fillRect(20 + i * 20, 30, 40, 60);
    return cv.toDataURL("image/jpeg", 0.8);
  }));
  await p.close();
  const tokens = {};
  for (const [name, pin] of Object.entries(PINS)) tokens[name] = (await rpc("dr_login", { p_name: name, p_pin: pin })).token;
  const names = Object.keys(PINS);
  for (let i = 0; i < DRINKS.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if ((i + j) % 4 === 3) continue; // not everyone has tasted everything
      const res = await rpc("dr_rate", { p_token: tokens[names[j]], p_drink: DRINKS[i], p_score: 1 + ((i * 3 + j * 5) % 10), p_bar: null,
        p_comment: (i + j) % 2 ? `${TEXTS[(i + j * 3) % TEXTS.length]} (${i}${j})` : null });
      assert.ok(res.ok, JSON.stringify(res));
    }
  }
  const photos = [["Jesper", 0], ["Astri", 1], ["Ingvild", 2], ["Jesper", 4], ["Astri", 5]];
  for (const [k, [name, i]] of photos.entries()) {
    const res = await rpc("dr_set_photo", { p_token: tokens[name], p_drink: DRINKS[i], p_thumb: thumbs[k], p_data: thumbs[k] });
    assert.ok(res.ok, `${name} ${DRINKS[i]} ${JSON.stringify(res)}`);
  }
  // A photo whose data cannot be shown: it must be left out, not break the game.
  const bad = await rpc("dr_set_photo", { p_token: tokens.Anne, p_drink: DRINKS[6], p_thumb: "data:image/jpeg;base64,AAAAAAAAAAAA", p_data: "data:image/jpeg;base64,AAAAAAAAAAAA" });
  assert.ok(bad.ok, JSON.stringify(bad));
  return tokens;
}

async function page(ctx) {
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.errors = errors;
  return p;
}
async function context(browser, opts = {}) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...opts });
  await ctx.route("**/config.js*", (r) => r.fulfill({ contentType: "text/javascript", body: CONFIG }));
  await ctx.route("https://fonts.*/**", (r) => r.abort());
  // Lets the test make the phone's storage fail on demand (quota full, blocked).
  await ctx.addInitScript(() => {
    for (const m of ["put", "add"]) {
      const orig = IDBObjectStore.prototype[m];
      IDBObjectStore.prototype[m] = function (...a) {
        if (window.__lkFail && this.name === "sessions") throw new DOMException("Full", "QuotaExceededError");
        return orig.apply(this, a);
      };
    }
  });
  ctx.calls = [];
  ctx.on("request", (r) => { const m = r.url().match(/\/rpc\/(\w+)$/); if (m) ctx.calls.push(m[1]); });
  return ctx;
}
async function logIn(p, name) {
  await p.goto(BASE);
  await p.click(`[data-pick="${name}"]`);
  await p.fill("input[name=pin]", PINS[name]);
  await p.click("text=Logg inn");
  await p.locator(".drink").first().waitFor();
}
async function openLagkamp(p) {
  await p.click('[data-tab="family"]');
  await p.click('[data-act="quiz"]');
  await p.click('[data-lk="open"]');
  await p.locator(".lk h2", { hasText: "Lagkamp" }).waitFor();
  await p.locator(".lk-status").waitFor({ state: "detached" });
}
const sheet = (p) => p.locator(".sheet");
const stored = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open("drinkrate-lagkamp");
  r.onsuccess = () => { const g = r.result.transaction("sessions").objectStore("sessions").getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; };
  r.onerror = () => rej(r.error);
}));
const live = async (p) => (await stored(p)).find((s) => s.status === "active" || s.status === "paused");
const saved = (p) => p.locator(".lk-saved", { hasText: "✓ Lagret" }).waitFor();
const phase = async (p) => { await saved(p); return (await live(p)).cursor.phase; };
const noOverflow = async (p, where) => assert.equal(await p.evaluate(() => document.querySelector(".sheet").scrollWidth > document.querySelector(".sheet").clientWidth + 1), false, `horizontal scroll: ${where}`);
// A fast double tap on the same spot of the screen, like a real finger.
async function doubleTap(p, selector) {
  await p.locator(".sheet:not(.guard)").waitFor();
  await p.locator(selector).scrollIntoViewIfNeeded();
  const box = await p.locator(selector).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.touchscreen.tap(x, y);
  await p.waitForTimeout(60);
  await p.touchscreen.tap(x, y);
  await p.waitForTimeout(600);
}
const teamOnPhone = (p) => p.locator(".lk-big .lk-team span").textContent();

// The answer screen for the team holding the phone: right, wrong or pass.
async function answer(p, s, choice) {
  const q = s.questions[s.order[s.cursor.index]];
  await p.click('[data-lk="ready"]');
  await p.locator('[data-lk="lock"]').waitFor();
  if (choice === "pass") { await p.click('[data-lk="pass"]'); return; }
  const opt = choice === "right" ? q.accepted[0] : q.options.find((o) => !q.accepted.includes(o.optionId)).optionId;
  await p.click(`[data-lk="pick"][data-v="${opt}"]`);
  await p.click('[data-lk="lock"]');
}
// Plays the current question with the given choices per team name; returns who should score.
async function playQuestion(p, choices) {
  await saved(p);
  const s = await live(p);
  assert.equal(s.cursor.phase, "intro");
  const q = s.questions[s.order[s.cursor.index]];
  await p.click('[data-lk="begin"]');
  const scored = [];
  for (let i = 0; i < s.teams.length; i++) {
    const name = await teamOnPhone(p);
    await answer(p, s, choices[name]);
    if (choices[name] === "right") scored.push(name);
  }
  await p.click('[data-lk="reveal"]');
  await p.locator(".lk-reveal").waitFor();
  return { q, scored };
}
async function totalsShown(p) {
  return Object.fromEntries(await p.locator(".lk-strip li").evaluateAll((els) => els.map((li) => [li.querySelector(".lk-team span").textContent, Number(li.querySelector(":scope > b").textContent)])));
}

(async () => {
  const browser = await chromium.launch();
  await seed(browser);
  const ctx = await context(browser);
  const p = await page(ctx);
  await logIn(p, "Jesper");
  const callsBefore = ctx.calls.length;
  await openLagkamp(p);
  await p.locator('[data-lk="new"]').waitFor();
  await p.screenshot({ path: `${OUT}/lk-01-home.png` });

  // ── L01, L02: teams. The host (Jesper) is on Lag 1 from the start.
  await p.click('[data-lk="new"]');
  assert.equal(await p.locator('[data-lk-input="assign"][data-name="Jesper"]').inputValue(), "0");
  await p.click('[data-lk="teams-next"]');
  await p.getByText("Lag 2 trenger minst én deltaker.").waitFor();
  await p.click('[data-lk="team-count"][data-v="4"]');
  await p.setViewportSize({ width: 320, height: 640 });
  const longName = "Maximilian-Alexander Kri"; // 24 characters
  await p.fill('[data-lk-input="guest-draft"]', longName);
  await p.click('[data-lk="guest-add"]');
  await p.fill('[data-lk-input="guest-draft"]', "astri");
  await p.click('[data-lk="guest-add"]');
  for (const [i, v] of [[0, "1"], [1, "2"]]) await p.locator(`[data-lk-input="guest-team"][data-i="${i}"]`).selectOption(v);
  await p.locator('[data-lk-input="assign"][data-name="Astri"]').selectOption("3");
  await p.locator('[data-lk-input="assign"][data-name="Anne"]').selectOption("3");
  await p.fill('[data-lk-input="team-name"][data-i="2"]', "Superlangtlagnavnsomgårut");
  await p.click('[data-lk="teams-next"]');
  await p.getByText("astri finnes i familien").waitFor();
  await p.getByText("Lag 1 trenger").waitFor({ state: "detached" });
  await noOverflow(p, "teams 320 px");
  await p.screenshot({ path: `${OUT}/lk-02-teams-320.png`, fullPage: true });
  // Duplicate member across teams is refused, then fixed down to two teams.
  await p.click('[data-lk="guest-rm"][data-v="1"]');
  await p.click('[data-lk="guest-rm"][data-v="0"]');
  await p.click('[data-lk="team-count"][data-v="2"]');
  await p.fill('[data-lk-input="team-name"][data-i="0"]', "Ørnene");
  await p.fill('[data-lk-input="team-name"][data-i="1"]', "Haiene");
  await p.locator('[data-lk-input="assign"][data-name="Ingvild"]').selectOption("0");
  await p.locator('[data-lk-input="assign"][data-name="Astri"]').selectOption("1");
  await p.fill('[data-lk-input="guest-draft"]', "Gjest Gunnar");
  await p.click('[data-lk="guest-add"]');
  await p.locator('[data-lk-input="guest-team"][data-i="0"]').selectOption("1");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('[data-lk="teams-next"]');

  // ── L03, L19: options show the real number of questions; the unreadable photo is left out.
  await p.locator(".lk-plan").waitFor();
  for (const n of [5, 15, 10]) {
    await p.click(`[data-lk="q-count"][data-v="${n}"]`);
    await p.getByText(new RegExp(`^${n} spørsmål fordelt på \\d+ runder?$`)).waitFor();
    assert.match(await p.locator('[data-lk="start"]').textContent(), new RegExp(`\\(${n} spørsmål\\)`));
  }
  await p.getByText("1 bilde kunne ikke vises og er ikke med.").waitFor();
  // Nothing about the questions themselves is shown to the one setting up.
  for (const t of TEXTS) assert.equal(await sheet(p).getByText(t).count(), 0, "no comment shown before the start");
  await p.click('[data-lk="q-count"][data-v="5"]');
  await p.screenshot({ path: `${OUT}/lk-03-options.png`, fullPage: true });
  await p.click('[data-lk="start"]');
  await p.locator('[data-lk="begin"]').waitFor();
  let s = await live(p);
  assert.equal(s.order.length, 5);
  assert.deepEqual(s.teams.map((t) => t.name), ["Ørnene", "Haiene"]);
  assert.deepEqual(s.teams[1].members.map((m) => [m.name, m.guest]), [["Astri", false], ["Gjest Gunnar", true]]);
  // The background holds nothing from the family view and cannot be reached.
  assert.equal(await p.locator("main .feed, main .gallery, main .pcard").count(), 0);
  assert.equal(await p.locator("main[inert], nav[inert], header[inert]").count(), 3);
  await p.screenshot({ path: `${OUT}/lk-04-intro.png` });

  // ── L10: zoom before the reveal shows the photo only (if the first question has one).
  let q0 = s.questions[s.order[0]];
  const firstMedia = q0.mediaId || s.rounds[0].mediaId;
  if (firstMedia) {
    await p.click('[data-lk="zoom"]');
    await p.locator(".lk-zoom img").waitFor();
    assert.equal(await p.locator(".lk-zoom img").getAttribute("alt"), "Bilde til spørsmål 1");
    assert.equal(await p.locator(".lk-zoom p").count(), 0, "no caption before the reveal");
    await p.click('[data-lk="overlay-close"]');
  }
  // ── L04, L06: intro → handoff with a double tap stops at the handoff.
  await doubleTap(p, '[data-lk="begin"]');
  assert.equal(await phase(p), "handoff");
  const first = await teamOnPhone(p);
  await doubleTap(p, '[data-lk="ready"]');
  assert.equal(await phase(p), "answering");
  assert.equal(await p.locator(".lk-picked").count(), 0, "nothing chosen in advance");
  const wrong0 = q0.options.find((o) => !q0.accepted.includes(o.optionId));
  await p.click(`[data-lk="pick"][data-v="${wrong0.optionId}"]`);
  await doubleTap(p, '[data-lk="lock"]');
  assert.equal(await phase(p), "handoff");
  assert.notEqual(await teamOnPhone(p), first);
  // The next team sees no trace of the first team's choice or of the answer.
  const html = await p.evaluate(() => document.body.innerHTML);
  for (const o of q0.options) assert.ok(!html.includes(`>${o.label}<`) && !html.includes(`✓ ${o.label}`), `option "${o.label}" visible on the handoff`);
  assert.ok(!/lk-right|lk-picked|Riktig/.test(html));
  await p.screenshot({ path: `${OUT}/lk-05-handoff.png` });
  // ── L14: reload after a locked answer: neutral continue, same question, no double count.
  await saved(p);
  await p.reload();
  await p.locator(".drink").first().waitFor();
  await openLagkamp(p);
  await p.getByText("Spill pågår").waitFor();
  assert.equal(await sheet(p).getByText(wrong0.label).count(), 0);
  await p.click('[data-lk="continue"]');
  assert.notEqual(await teamOnPhone(p), first);
  assert.equal((await live(p)).events.filter((e) => e.type === "lock").length, 1);
  // ── L05: the reveal is not offered before everyone answered. Undo the last lock, then lock again.
  assert.equal(await p.locator('[data-lk="reveal"]').count(), 0);
  await p.click('[data-lk="unlock"]');
  assert.equal(await teamOnPhone(p), first);
  await answer(p, await live(p), "wrong");
  s = await live(p);
  const second = await teamOnPhone(p);
  // ── L15: the app goes to the background while a team answers: covered on return.
  await p.click('[data-lk="ready"]');
  await p.click(`[data-lk="pick"][data-v="${q0.accepted[0]}"]`);
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.evaluate(() => { delete document.hidden; });
  assert.equal(await p.locator(".lk-picked").count(), 0);
  assert.equal(await teamOnPhone(p), second);
  await p.click('[data-lk="ready"]');
  await p.click(`[data-lk="pick"][data-v="${q0.accepted[0]}"]`);
  await p.click('[data-lk="lock"]');
  await p.getByText("Alle lag har svart").waitFor();
  await doubleTap(p, '[data-lk="reveal"]');
  assert.equal(await phase(p), "reveal");
  assert.deepEqual(await totalsShown(p), { [first]: 0, [second]: 1 });
  await p.screenshot({ path: `${OUT}/lk-06-reveal.png` });
  if (firstMedia && q0.type === "photoDrink") {
    await p.click('[data-lk="zoom"]');
    assert.match(await p.locator(".lk-zoom p").textContent(), /^Riktig svar: /);
    await p.click('[data-lk="overlay-close"]');
  }

  // ── L12: corrections replace the point, need a reason, can be undone and reset.
  await p.click('[data-lk="correct-open"]');
  await p.click('[data-lk="corr-all"]');
  await p.click('[data-lk="corr-save"]');
  await p.getByText("Skriv en kort grunn").waitFor();
  await p.fill('[data-lk-input="reason"]', "Tvetydig bilde");
  await p.click('[data-lk="corr-save"]');
  await p.getByText("Poengene er rettet manuelt.").waitFor();
  assert.deepEqual(await totalsShown(p), { [first]: 1, [second]: 1 });
  // L14 again: reload after a correction keeps it, without counting twice.
  await saved(p);
  await p.reload();
  await p.locator(".drink").first().waitFor();
  await openLagkamp(p);
  await p.click('[data-lk="continue"]');
  await p.locator(".lk-reveal").waitFor();
  assert.deepEqual(await totalsShown(p), { [first]: 1, [second]: 1 });
  await p.click('[data-lk="correct-open"]');
  await p.click('[data-lk="corr-undo"]');
  await p.locator(".lk-corrected").waitFor({ state: "detached" });
  assert.deepEqual(await totalsShown(p), { [first]: 0, [second]: 1 });
  await p.click('[data-lk="correct-open"]');
  await p.click('[data-lk="corr-none"]');
  await p.fill('[data-lk-input="reason"]', "Feiltrykk");
  await p.click('[data-lk="corr-save"]');
  assert.deepEqual(await totalsShown(p), { [first]: 0, [second]: 0 });
  await p.click('[data-lk="correct-open"]');
  await p.click('[data-lk="corr-auto"]');
  assert.deepEqual(await totalsShown(p), { [first]: 0, [second]: 1 });
  await doubleTap(p, '[data-lk="next"]');
  const after = await live(p);
  assert.ok(["intro", "roundEnd"].includes(after.cursor.phase), "a double tap on next moves one step only");
  if (after.cursor.phase === "intro") assert.equal(after.cursor.index, 1);

  // ── L11: skip after one team answered: void for all, earlier points stay.
  const expected = { [first]: 0, [second]: 1 };
  if (after.cursor.phase === "roundEnd") await p.click('[data-lk="next"]');
  await saved(p);
  s = await live(p);
  await p.click('[data-lk="begin"]');
  await answer(p, s, "right");
  await p.click('[data-lk="more"]');
  await p.click('[data-lk="ask-skip"]');
  await p.click('[data-lk="skip"]');
  await saved(p);
  assert.deepEqual(await totalsShown(p), expected);
  s = await live(p);
  assert.equal(s.events.filter((e) => e.type === "skip").length, 1);

  // ── L17: storage fails: honest message, no "saved"; continue in memory; saved again later.
  if (s.cursor.phase === "roundEnd") { await p.click('[data-lk="next"]'); await saved(p); s = await live(p); }
  await p.evaluate(() => { window.__lkFail = true; });
  await p.click('[data-lk="begin"]');
  await p.getByText("Spillet er ikke lagret.").waitFor();
  assert.equal(await p.locator(".lk-saved", { hasText: "✓ Lagret" }).count(), 0);
  await p.click('[data-lk="save-retry"]');
  await p.getByText("Spillet er ikke lagret.").waitFor();
  await p.click('[data-lk="save-temp"]');
  await p.getByText("Ikke lagret på telefonen.").waitFor();
  await p.screenshot({ path: `${OUT}/lk-07-unsaved.png` });
  await p.evaluate(() => { window.__lkFail = false; });
  await answer(p, s, "right");
  await saved(p);
  assert.equal((await live(p)).cursor.phase, "handoff");
  await answer(p, s, "wrong");
  await p.click('[data-lk="reveal"]');
  await saved(p);
  const rv = await live(p);
  const rq = rv.order[rv.cursor.index];
  for (const e of rv.events.filter((x) => x.type === "reveal" && x.questionId === rq)) for (const id of e.auto) expected[rv.teams.find((t) => t.teamId === id).name]++;
  await saved(p);
  assert.deepEqual(await totalsShown(p), expected);

  // ── L18: a second tab with the same game: no silent overwrite.
  const p2 = await page(ctx);
  await p2.goto(BASE);
  await p2.locator(".drink").first().waitFor();
  await openLagkamp(p2);
  await p2.click('[data-lk="continue"]');
  await p2.locator(".lk-reveal").waitFor();
  await p.click('[data-lk="next"]');
  await saved(p);
  const moved = (await live(p)).revision;
  await p2.click('[data-lk="next"]');
  await p2.getByText("Spillet er endret i en annen fane").waitFor();
  assert.equal((await live(p2)).revision, moved, "the other tab's move was not overwritten");
  await p2.close();

  // ── L07, L13: play the rest; right, wrong and pass; the shown totals follow.
  for (let guard = 0; guard < 20; guard++) {
    await saved(p);
    s = (await live(p)) || { status: "finished" };
    if (s.status === "finished") break;
    if (s.cursor.phase === "roundEnd") {
      await p.locator(".lk-table").waitFor();
      await p.screenshot({ path: `${OUT}/lk-08-round.png` });
      await p.click('[data-lk="next"]');
      continue;
    }
    if (s.cursor.phase === "reveal") { await p.click('[data-lk="next"]'); continue; }
    const { scored } = await playQuestion(p, { [first]: "pass", [second]: "right" });
    for (const n of scored) expected[n]++;
    assert.deepEqual(await totalsShown(p), expected);
  }
  await p.getByText("Se alle spørsmål og svar").waitFor();
  const final = await p.locator(".lk-center h3").textContent();
  assert.match(final, new RegExp(`${second} vant med ${expected[second]} poeng`));
  await p.click("summary");
  assert.ok(await p.locator(".lk-hist > li").count() >= 4);
  await p.getByText("Hoppet over – ingen poeng, ingen fasit.").waitFor();
  await p.emulateMedia({ colorScheme: "dark" });
  await p.screenshot({ path: `${OUT}/lk-09-final-dark.png`, fullPage: true });
  await p.emulateMedia({ colorScheme: "light" });
  await noOverflow(p, "final");

  // ── L22: the whole game read the family's data, never wrote it.
  const lkCalls = ctx.calls.slice(callsBefore);
  assert.deepEqual(lkCalls.filter((c) => WRITES.includes(c)), [], `writes during Lagkamp: ${lkCalls}`);
  // dr_award only appears as the app's own sticker sync right after loading (dr_get_stickers) on reload.
  lkCalls.forEach((c, i) => c === "dr_award" && assert.ok(lkCalls.slice(Math.max(0, i - 3), i).includes("dr_get_stickers"), `dr_award outside the sticker sync: ${lkCalls}`));
  assert.ok(lkCalls.includes("dr_get_ratings") && lkCalls.includes("dr_recent_photos"));

  // ── L23: the last result stays; a new game with the same teams starts at zero with new ids.
  const done = (await stored(p)).find((x) => x.status === "finished");
  await p.click('[data-lk="again"]');
  assert.equal(await p.locator('[data-lk-input="team-name"][data-i="0"]').inputValue(), "Ørnene");
  await p.click('[data-lk="teams-next"]');
  await p.locator(".lk-plan").waitFor();
  // L20: change a rating after the first game: the old result keeps its frozen questions.
  await p.click('[data-lk="start"]');
  await p.locator('[data-lk="begin"]').waitFor();
  const next = await live(p);
  assert.notEqual(next.sessionId, done.sessionId);
  assert.ok(next.teams.every((t) => !done.teams.some((d) => d.teamId === t.teamId)));
  assert.deepEqual(await totalsShown(p), { Ørnene: 0, Haiene: 0 });
  const kept = (await stored(p)).find((x) => x.sessionId === done.sessionId);
  assert.deepEqual(kept.questions, done.questions);

  // ── L25: keyboard focus lands on the screen title; touch targets are large enough; 320 px fits.
  await p.setViewportSize({ width: 320, height: 640 });
  assert.equal(await p.evaluate(() => document.activeElement?.classList.contains("lk-focus")), true);
  const small = await p.locator(".sheet button:visible").evaluateAll((els) => els.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.outerHTML.slice(0, 80)));
  assert.deepEqual(small, [], "buttons under 44 px");
  await noOverflow(p, "intro 320 px");
  await p.setViewportSize({ width: 430, height: 932 });
  await noOverflow(p, "intro 430 px");
  await p.setViewportSize({ width: 390, height: 844 });
  // Closing the sheet pauses; the menu shows "Fortsett" without any answer.
  await p.click(".lk-close");
  assert.equal((await live(p)).status, "paused");
  await p.click('[data-act="quiz"]');
  await p.click('[data-lk="open"]');
  await p.getByText("på pause").waitFor();
  await p.getByText("Siste resultat").waitFor();
  await p.click('[data-lk="show-last"]');
  await p.getByText(new RegExp(`${second} vant`)).first().waitFor();
  await p.click('[data-lk="overlay-close"]');

  // ── L16: logout, another person: no game, no data from Jesper.
  await p.click(".lk-close");
  await p.click('[data-tab="me"]');
  await p.click('[data-act="logout"]');
  await logIn(p, "Astri");
  await openLagkamp(p);
  assert.equal(await p.getByText("Spill pågår").count(), 0);
  assert.equal(await p.getByText("Siste resultat").count(), 0);
  // A late photo answer after logging out is dropped.
  await p.click('[data-lk="new"]');
  await p.locator('[data-lk-input="assign"][data-name="Jesper"]').selectOption("1");
  await ctx.route("**/rpc/dr_recent_photos", async (r) => { await new Promise((res) => setTimeout(res, 1500)); return r.continue(); });
  await p.click('[data-lk="teams-next"]');
  await p.locator(".lk-status").waitFor();
  await p.click(".lk-close");
  await p.click('[data-tab="me"]');
  await p.click('[data-act="logout"]');
  await logIn(p, "Jesper");
  await p.waitForTimeout(1800);
  assert.equal(await p.locator(".sheet").count(), 0, "the late answer opened nothing");
  await ctx.unroute("**/rpc/dr_recent_photos");

  // ── L19: photos fail: a network error is not "no photos"; the choice is explicit.
  await ctx.route("**/rpc/dr_recent_photos", (r) => r.abort());
  await openLagkamp(p);
  await p.getByText("Spill pågår").waitFor();
  await p.click('[data-lk="ask-new"]');
  await p.click('[data-lk="new-over"]');
  await p.click('[data-lk="teams-next"]');
  await p.getByText("Bildene kunne ikke hentes").waitFor();
  assert.ok(await p.locator('[data-lk="start"]').isDisabled());
  await p.click('[data-lk="no-photos"]');
  await p.locator('[data-lk="start"]:not([disabled])').waitFor();
  await ctx.unroute("**/rpc/dr_recent_photos");
  await ctx.route("**/rpc/dr_get_ratings", (r) => r.abort());
  await p.click('[data-lk="prep-retry"]');
  await p.getByText("Får ikke hentet vurderingene.").waitFor();
  await ctx.unroute("**/rpc/dr_get_ratings");
  await p.click('[data-lk="prep-retry"]');
  await p.locator(".lk-plan").waitFor();

  // ── L17: a stored game that cannot be read: explained, not loaded, deleted only on request.
  await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("drinkrate-lagkamp");
    r.onsuccess = () => { const tx = r.result.transaction("sessions", "readwrite"); tx.objectStore("sessions").put({ sessionId: "broken", ownerKey: "jesper", schemaVersion: 99, status: "active", updatedAt: 1 }); tx.oncomplete = () => { r.result.close(); res(); }; };
  }));
  await p.click(".lk-close");
  await p.click('[data-act="quiz"]');
  await p.click('[data-lk="open"]');
  await p.getByText("Et lagret spill kan ikke leses").waitFor();
  assert.ok((await stored(p)).some((x) => x.sessionId === "broken"), "not deleted on its own");
  await p.click('[data-lk="ask-clear-bad"]');
  await p.click('[data-lk="clear-bad"]');
  await p.locator('[data-lk-input="team-name"]').first().waitFor();
  assert.ok(!(await stored(p)).some((x) => x.sessionId === "broken"));

  assert.deepEqual(p.errors, []);
  console.log("LAGKAMP E2E PASSED");
  await browser.close();
})().catch((e) => { console.error("LAGKAMP E2E FAILED:", e); process.exit(1); });
