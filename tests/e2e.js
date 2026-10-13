// End-to-end check against the mock server. Usage: node tests/e2e.js <screenshot dir>
const { chromium, devices } = require("playwright");
const assert = require("assert");
const OUT = process.argv[2] || ".";
const PORT = Number(process.env.PORT || 8787);
const BASE = `http://localhost:${PORT}/`;
const PHOTO = process.env.TEST_PHOTO || "/var/tmp/test-photo.jpg";
const CONFIG = `window.DR_CONFIG={url:"http://localhost:${PORT}",key:"sb_publishable_test",family:["Luise","Jesper","Jakob","Astri","Ingvild","Anne","Julie"],
  features:{birthday:true,controversy:true,twins:true,quiz:true,tableGames:true,blindRating:true,postcard:true},
  birthday:{id:"anne2026",name:"Anne",date:"2026-10-13",tz:"Asia/Nicosia"}};`;

async function page(browser, opts = {}) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...opts });
  await ctx.route("**/config.js*", (r) => r.fulfill({ contentType: "text/javascript", body: CONFIG }));
  await ctx.route("https://fonts.*/**", (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.errors = errors;
  return p;
}
const fx = (p, cls) => p.locator(`.fx.${cls}`).waitFor({ timeout: 2500 });
const dismiss = async (p) => { await p.locator(".fx").click(); await p.locator(".fx").waitFor({ state: "detached" }); };
async function logIn(p, name, pin) {
  await p.goto(BASE);
  await p.click(`[data-pick="${name}"]`);
  await p.fill("input[name=pin]", pin);
  await p.click("text=Logg inn");
}
// Counts calls to one database function; `fail()` decides whether to cut the connection.
function watch(p, fn, fail = () => false, delay = 0) {
  const w = { calls: 0 };
  p.context().route(`**/rpc/${fn}`, async (r) => {
    w.calls++;
    if (fail()) return r.abort();
    if (delay) await new Promise((res) => setTimeout(res, delay));
    return r.continue();
  });
  return w;
}

(async () => {
  const browser = await chromium.launch();
  const a = await page(browser);
  await a.goto(BASE);
  await a.getByText("Hvem er du?").waitFor();
  assert.equal(await a.locator("[data-pick]").count(), 7);
  await a.screenshot({ path: `${OUT}/1-pick.png` });

  // Jesper already has a PIN and old ratings (seeded by the runner)
  await a.click('[data-pick="Jesper"]');
  await a.getByText("Hei, Jesper!").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.click("text=Logg inn");
  await a.locator(".drink").first().waitFor();
  const total = await a.evaluate(() => window.DRINKS.length);
  assert.equal(await a.locator(".drink").count(), total);
  // Every old rating is still shown
  assert.equal(await a.locator('[data-drink="mojito"] .rater').count(), 1);
  assert.equal(await a.locator('[data-drink="coeur-de-lion"] .rater').count(), 1);
  await a.screenshot({ path: `${OUT}/2-list.png` });

  // All-inclusive filter + bar filter
  await a.click('[data-act="aionly"]');
  const aiCount = await a.locator(".drink").count();
  assert.ok(aiCount < total && aiCount > 90, `ai count ${aiCount}`);
  assert.equal(await a.locator('.drink .tag.paid').count(), 0);
  await a.click('[data-act="aionly"]');
  await a.click('[data-cat="spirit"]');
  await a.click('[data-bar="sea"]');
  assert.equal(await a.locator(".drink").count(), 0);
  await a.click('[data-bar="all"]');
  await a.click('[data-cat="all"]');

  // Untested is an independent, personal filter and intersects the other filters.
  await a.click('[data-act="untested"]');
  assert.equal(await a.locator('.drink').count(), total - 2);
  assert.equal(await a.locator('[data-drink="mojito"]').count(), 0);
  await a.click('[data-cat="cocktail"]');
  await a.click('[data-bar="cap"]');
  await a.click('[data-act="aionly"]');
  const expected = await a.evaluate(() => window.DRINKS.filter((d) => d.cat === "cocktail" && d.ai.includes("cap") && d.id !== "mojito").length);
  assert.equal(await a.locator('.drink').count(), expected);
  await a.click('[data-cat="all"]');
  await a.click('[data-bar="all"]');
  await a.click('[data-act="aionly"]');

  // Rate a new non-inclusive drink with 10 → PERFEKT
  await a.fill("input[name=q]", "porn star");
  await a.click('[data-drink="porn-star-martini"]');
  await a.getByText("Ikke inkludert · €13").waitFor();
  await a.click('[data-score="6"]');
  await a.click('[data-score="7"]');
  await fx(a, "six7");
  await dismiss(a);
  await a.click('[data-score="10"]');
  await a.click('[data-pickbar="cap"]');
  await a.fill("textarea[name=comment]", "Beste <b>hittil</b>");
  // Photo: a big camera image is shrunk on the phone before upload
  await a.setInputFiles('input[name="photo"]', PHOTO);
  await a.locator(".photo-prev img").waitFor();
  const sizes = await a.evaluate(() => document.querySelector(".photo-prev img").src.length);
  assert.ok(sizes < 80000, "thumbnail is small");
  await a.screenshot({ path: `${OUT}/3-sheet.png` });
  await a.click('[data-act="save"]');
  await fx(a, "perfect");
  await a.screenshot({ path: `${OUT}/4-perfect.png` });
  await dismiss(a);

  // Flavours are their own drinks
  assert.equal(await a.locator('[data-drink="porn-star-martini"]').count(), 0, "saving removes a drink from untested immediately");
  await a.click('[data-act="untested"]');
  await a.fill("input[name=q]", "daiquiri");
  assert.equal(await a.locator(".drink").count(), 4);
  await a.locator('[data-drink="strawberry-daiquiri"]').waitFor();
  await a.fill("input[name=q]", "mango");
  assert.ok((await a.locator(".drink").count()) >= 6);
  await a.fill("input[name=q]", "");

  // Search eggs
  await a.fill("input[name=q]", "skål");
  await fx(a, "cheers");
  await dismiss(a);
  await a.fill("input[name=q]", "ouzo");
  assert.equal(await a.locator(".drink").count(), 2); // Ouzo + Ouzo Plomari
  await a.waitForTimeout(400);
  assert.equal(await a.locator(".fx").count(), 0, "opa egg is gone");
  await a.fill("input[name=q]", "Miranda");
  await fx(a, "miranda-fx");
  await a.screenshot({ path: `${OUT}/5b-miranda.png` });
  await dismiss(a);
  await a.fill("input[name=q]", "");

  // Registration is closed: a family member without an account gets a clear message
  const b = await page(browser, { colorScheme: "dark" });
  await b.goto(BASE);
  await b.click('[data-pick="Julie"]');
  await b.getByText("Velkommen, Julie!").waitFor();
  await b.fill("input[name=pin]", "1111");
  await b.fill("input[name=pin2]", "1111");
  await b.click("text=Kom i gang");
  await b.getByText("Nye brukere er stengt. Ta kontakt med Jesper.").waitFor();
  await b.click("text=Ikke deg? Velg et annet navn");

  // Second member (set up before registration closed) rates Mojito 1 → UFF, sees Jesper's comment escaped
  await b.click('[data-pick="Astri"]');
  await b.fill("input[name=pin]", "4321");
  await b.click("text=Logg inn");
  await b.locator(".drink").first().waitFor();
  await b.click('[data-act="untested"]');
  assert.equal(await b.locator('[data-drink="mojito"]').count(), 1, "someone else's rating does not hide a drink");
  await b.click('[data-act="untested"]');
  await b.click('[data-drink="porn-star-martini"]');
  await b.getByText("Beste <b>hittil</b>").waitFor();
  // Jesper's photo shows for Astri and opens full size
  await b.locator(".review-photo img").waitFor();
  await b.click(".review-photo");
  await b.locator(".lightbox img").waitFor();
  await b.waitForFunction(() => document.querySelector(".lightbox img").naturalWidth >= 1000);
  const full = await b.evaluate(() => [document.querySelector(".lightbox img").naturalWidth, document.querySelector(".lightbox img").src.length]);
  assert.ok(full[0] <= 1280 && full[1] < 700000, `full photo shrunk: ${full}`);
  await b.screenshot({ path: `${OUT}/3b-lightbox.png` });
  await b.click(".lightbox");
  await b.getByText("på Captain's Bar").waitFor();
  assert.equal(await b.locator(".review.muted").count(), 6); // 7 in the family, only Jesper has rated it
  await b.click('.sheet .close');
  await b.click('[data-drink="coeur-de-lion"]');
  await b.click('[data-score="7"]');
  await b.click('[data-act="save"]');
  await fx(b, "agree-fx");
  await b.getByText("Samme karakter som Jesper").waitFor();
  await dismiss(b);
  await b.click('[data-drink="mojito"]');
  await b.click('[data-score="1"]');
  await b.click('[data-act="save"]');
  await fx(b, "yuck");
  await dismiss(b);
  assert.equal(await b.locator('[data-drink="mojito"] .ring b').textContent(), "4,5"); // (8 + 1) / 2

  // Swipe: drag left = nope, drag right = like, button like, undo
  await b.click('[data-tab="swipe"]');
  await b.locator(".swipe-card.is-top").waitFor();
  await b.screenshot({ path: `${OUT}/6a-swipe-dark.png` });
  const swipeTop = () => b.locator(".swipe-card.is-top").getAttribute("data-swipe");
  const drag = async (dx) => {
    const box = await b.locator(".swipe-card.is-top").boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await b.mouse.move(x, y); await b.mouse.down();
    for (let i = 1; i <= 8; i++) await b.mouse.move(x + (dx * i) / 8, y + i);
    await b.mouse.up();
  };
  const first = await swipeTop();
  assert.ok(first !== "mojito" && first !== "coeur-de-lion", "rated drinks are not in the deck");
  await drag(-180);
  await b.waitForFunction((id) => document.querySelector(".swipe-card.is-top")?.dataset.swipe !== id, first);
  const second = await swipeTop();
  // small drag snaps back
  await drag(40);
  assert.equal(await swipeTop(), second);
  await drag(180);
  await b.waitForFunction((id) => document.querySelector(".swipe-card.is-top")?.dataset.swipe !== id, second);
  if (await b.locator(".fx.match-fx").count()) { await b.screenshot({ path: `${OUT}/6b-match.png` }); await dismiss(b); }
  await b.getByText("💚 Vil smake").waitFor();
  assert.equal(await b.locator(`.swipe-wrap ~ .list [data-drink="${second}"], .list [data-drink="${second}"]`).count() >= 1, true);
  await b.click('[data-act="undo"]');
  assert.equal(await swipeTop(), second);
  // Porn Star Martini (Jesper 10) liked from the sheet heart, then like via button → match on a 8+ drink
  await b.click('[data-act="like"]');
  await b.waitForFunction((id) => document.querySelector(".swipe-card.is-top")?.dataset.swipe !== id, second);
  if (await b.locator(".fx.match-fx").count()) await dismiss(b);
  await b.screenshot({ path: `${OUT}/6c-swipe-list.png`, fullPage: true });
  // "Kun all inclusive" in swipe: only included drinks in the deck
  await b.click('.swipe-bar [data-act="aionly"]');
  for (let i = 0; i < 4; i++) {
    const id = await swipeTop();
    assert.ok(await b.evaluate((x) => window.DRINKS.find((d) => d.id === x).ai.length > 0, id), `${id} is not all-inclusive`);
    await b.click('[data-act="nope"]');
    await b.waitForFunction((x) => document.querySelector(".swipe-card.is-top")?.dataset.swipe !== x, id);
  }
  await b.screenshot({ path: `${OUT}/6d-swipe-ai.png` });
  // Manual pick from the wish list
  await b.click('[data-act="pick"]');
  await b.getByText("Gå for denne!").waitFor();
  await b.screenshot({ path: `${OUT}/6e-pick.png` });
  await b.click('.sheet .btn[data-act="close"]');
  // Three more likes → 4 likes this session (undo took one back) → automatic pick
  for (let i = 0; i < 3; i++) {
    const id = await swipeTop();
    await b.click('[data-act="like"]');
    await b.waitForFunction((x) => document.querySelector(".swipe-card.is-top")?.dataset.swipe !== x, id);
    if (await b.locator(".fx").count()) await dismiss(b);
  }
  await b.getByText("Gå for denne!").waitFor();
  await b.click('.sheet .btn[data-act="close"]');
  await b.click('.swipe-bar [data-act="aionly"]');

  await b.click('[data-tab="top"]');
  await b.locator(".podium").waitFor();
  await b.screenshot({ path: `${OUT}/6-top-dark.png`, fullPage: true });
  // Needs 2 votes: Coeur de Lion (7, 7) beats Mojito (8, 1); Porn Star Martini (one 10) waits for votes
  assert.equal(await b.locator(".pod.p1").getAttribute("data-drink"), "coeur-de-lion");
  assert.equal(await b.locator(".podium .pod").count(), 2);
  await b.getByText("Trenger flere stemmer").waitFor();
  assert.equal(await b.locator('.podium [data-drink="porn-star-martini"]').count(), 0);

  await b.click('[data-tab="family"]');
  await b.getByText("Siste smaksprøver").waitFor();
  await b.getByText("Flest klistremerker").waitFor();
  await b.locator('[data-person="Jesper"] .pcard-stickers').waitFor();
  await b.locator(".gallery .g-item").first().waitFor();
  assert.equal(await b.locator('[data-drink="porn-star-martini"] .tag.photo').count() + 1, 1); // family tab has no cards; just make sure it renders
  await b.screenshot({ path: `${OUT}/7-family-dark.png`, fullPage: true });
  await b.click('[data-person="Jesper"]');
  await b.getByText("Alle karakterer").waitFor();
  // Jesper's stickers are visible to Astri
  await b.locator(".sheet .stickers .sticker.s-miranda").waitFor();
  // "Enige" follows from the ratings: Jesper never saw the egg on his phone, but Astri matched his 7
  await b.locator(".sheet .stickers .sticker.s-agree").waitFor();
  assert.ok((await b.locator(".sheet .stickers .sticker:not(.locked)").count()) >= 4, "Jesper's stickers shown");
  assert.ok((await b.locator(".sheet .drink").count()) >= 3);
  await b.screenshot({ path: `${OUT}/8-person-dark.png` });
  await b.click('.sheet .close');

  // Logo x5 → disco
  for (let i = 0; i < 5; i++) await b.click(".top h1");
  await fx(b, "disco-fx");
  await b.locator(".fx .ball.big").waitFor();
  await b.waitForTimeout(700);
  await b.screenshot({ path: `${OUT}/10-disco-drop.png` });
  await b.locator(".disco-hang .ball").waitFor({ timeout: 5000 });
  await b.waitForTimeout(900);
  await b.screenshot({ path: `${OUT}/11-disco-hang.png` });
  await b.click(".disco-hang");
  await b.locator(".disco-hang").waitFor({ state: "detached" });

  // ── Ingvild: failed first load, rate first, save safety, insights, quiz, postcard
  const c = await page(browser);
  let failRatings = true;
  watch(c, "dr_get_ratings", () => failRatings);
  await logIn(c, "Ingvild", "5555");
  await c.getByText("Får ikke hentet vurderingene").waitFor();
  assert.equal(await c.locator(".drink").count(), 0, "a failed load is not shown as an empty list");
  failRatings = false;
  await c.click('[data-act="reload"]');
  await c.locator(".drink").first().waitFor();

  // Rate first: the family's scores are hidden until her own is saved
  let failRate = true;
  const rate = watch(c, "dr_rate", () => failRate, 500);
  await c.click('[data-drink="mojito"]');
  await c.click('[data-act="blind"]');
  await c.locator(".blind-note").waitFor();
  assert.equal(await c.locator(".sheet .review").count(), 0);
  assert.equal(await c.locator(".sheet .fam-avg").count(), 0);
  await c.click('[data-score="9"]');
  await c.fill("textarea[name=comment]", "Frisk og fin");
  // Network down: nothing is called saved, nothing revealed, the comment stays
  await c.click('[data-act="save"]');
  await c.getByText("Ikke lagret – får ikke kontakt").waitFor();
  assert.equal(await c.inputValue("textarea[name=comment]"), "Frisk og fin");
  assert.equal(await c.locator(".blind-note").count(), 1);
  assert.equal(rate.calls, 1, "a failed write is not retried blindly");
  await c.screenshot({ path: `${OUT}/12-save-failed.png` });
  // ...and survives closing the sheet and reloading the page
  await c.click(".sheet .close");
  await c.reload();
  await c.locator(".drink").first().waitFor();
  await c.click('[data-drink="mojito"]');
  await c.getByText("Ulagret kladd hentet tilbake").waitFor();
  assert.equal(await c.inputValue("textarea[name=comment]"), "Frisk og fin");
  assert.equal(await c.locator(".blind-note").count(), 1, "rate-first is remembered");
  // Double tap on Lagre: only one write goes out
  failRate = false;
  rate.calls = 0;
  await c.evaluate(() => {
    document.querySelector('[data-act="save"]').click();
    const again = document.querySelector('[data-act="save"]');
    again.disabled = false; // as if the second tap landed before the button was disabled
    again.click();
  });
  await c.getByText("Avsløring!").waitFor();
  assert.equal(rate.calls, 1);
  await c.getByText("Du likte den 4,5 poeng bedre enn familien").waitFor(); // 9 vs (8 + 1) / 2
  await c.locator(".sheet .review").first().waitFor();
  await c.screenshot({ path: `${OUT}/13-reveal.png` });
  await c.click('.reveal [data-act="close"]');

  // Rating saved but the photo fails: say so, and send only the photo again
  let failPhoto = true;
  const photoW = watch(c, "dr_set_photo", () => failPhoto);
  await c.click('[data-drink="coeur-de-lion"]');
  await c.click('[data-act="blind"]'); // back to normal mode
  await c.locator(".sheet .review").first().waitFor();
  await c.click('[data-score="7"]');
  await c.setInputFiles('input[name="photo"]', PHOTO);
  await c.locator(".photo-prev img").waitFor();
  rate.calls = 0;
  await c.click('[data-act="save"]');
  await fx(c, "agree-fx");
  await dismiss(c);
  await c.getByText("bilde gjenstår").waitFor();
  await c.locator(".photo-prev img").waitFor();
  await c.screenshot({ path: `${OUT}/14-photo-failed.png` });
  failPhoto = false;
  await c.click('[data-act="retryphoto"]');
  await c.getByText("Bildet er lagret").waitFor();
  await c.locator(".sheet").waitFor({ state: "detached" });
  assert.equal(rate.calls, 1, "the retry sends only the photo");
  assert.equal(photoW.calls, 2);
  assert.equal(await c.locator('[data-drink="coeur-de-lion"] .tag.photo').count(), 1);

  await c.click('[data-drink="porn-star-martini"]');
  await c.click('[data-score="9"]');
  await c.click('[data-act="save"]');
  await c.locator(".sheet").waitFor({ state: "detached" });

  // Taste twins: [8, 7, 10] vs [9, 7, 9] → 2/3 point on 3 shared drinks
  await c.click('[data-tab="me"]');
  await c.getByText("Din smakstvilling er").waitFor();
  await c.getByText("skiller i snitt 0,7 poeng på 3 felles drinker").waitFor();
  assert.equal(await c.locator(".twin-row").count(), 1, "Astri shares only 2 drinks");
  await c.click('[data-twin="Jesper"]');
  assert.equal(await c.locator(".sheet .twin-list .drink").count(), 3);
  await c.click(".sheet .close");
  // Sticker hint
  await c.locator(".stickers button.sticker.locked").first().click();
  await c.locator("#toast.show").waitFor();
  assert.ok((await c.locator("#toast").textContent()).startsWith("💡"));
  await c.screenshot({ path: `${OUT}/15-me-twins.png`, fullPage: true });

  // Postcard: own favourite (newest of the two 9s), family top 3, most controversial, a photo
  await c.click('[data-act="postcard"]');
  await c.locator(".postcard .pc-photo").waitFor();
  const card = await c.locator(".postcard").textContent();
  assert.ok(/Min favoritt.*Porn Star Martini.*9\/10/s.test(card), card);
  assert.equal(await c.locator(".postcard ol li").count(), 3);
  assert.ok(/Mest omdiskutert.*Mojito.*1–9/s.test(card), card);
  await c.screenshot({ path: `${OUT}/16-postcard.png` });
  await c.click(".sheet .close");

  // Most controversial: Mojito 1 / 8 / 9
  await c.click('[data-tab="family"]');
  await c.getByText("Mest omdiskutert").waitFor();
  assert.equal(await c.locator(".hot-card").count(), 1);
  assert.equal(await c.locator(".hot-card").getAttribute("data-drink"), "mojito");
  await c.getByText("sprik 8 · 3 personer").waitFor();
  await c.screenshot({ path: `${OUT}/17-family-hot.png`, fullPage: true });

  // Quiz: "who wrote it" from the two real comments, topped up with menu questions
  await c.click('[data-act="quiz"]');
  await c.click('[data-quiz="who"]');
  const asked = [];
  for (let i = 0; i < 5; i++) {
    await c.getByText(`spørsmål ${i + 1} av 5`).waitFor();
    asked.push([await c.locator(".quiz-prompt").textContent(), await c.locator(".quiz-q").textContent()]);
    assert.equal(await c.locator(".quiz-q b").count(), 0, "comments are text, not HTML");
    await c.evaluate(() => { const o = document.querySelectorAll(".quiz-opt"); o[0].click(); });
    await c.locator(".quiz-opt[disabled]").first().waitFor();
    await c.locator(".quiz-opt").nth(1).click({ force: true }); // a second tap changes nothing
    assert.equal(await c.locator(".quiz-opt.right").count(), 1);
    if (i === 0) await c.screenshot({ path: `${OUT}/18-quiz.png` });
    await c.click('[data-act="qnext"]');
  }
  assert.equal(asked.filter(([q]) => q.startsWith("Hvem skrev")).length, 2, JSON.stringify(asked));
  assert.ok(asked.some(([, t]) => t === "Beste <b>hittil</b>"));
  await c.getByText(/Du fikk \d av 5 riktige/).waitFor();
  await c.getByText(/Rekord på denne telefonen/).waitFor();
  // Guess the score, then leave mid-round
  await c.click('[data-act="quizmenu"]');
  await c.click('[data-quiz="score"]');
  await c.locator(".quiz-opts.nums .quiz-opt").first().click();
  await c.locator(".quiz-fb").waitFor();
  await c.click(".sheet .close");
  await c.click('[data-act="quiz"]');
  await c.locator('.game-mode[data-quiz="who"]').waitFor(); // a fresh menu, not the old round
  await c.click(".sheet .close");

  // ── Anne's birthday: 13 October in Cyprus, whatever zone the phone is in
  const day = async (iso, opts, name, pin) => {
    const p = await page(browser, opts);
    await p.clock.setFixedTime(new Date(iso));
    await logIn(p, name, pin);
    await p.locator(".drink").first().waitFor();
    return p;
  };
  // 12 Oct, 23:00 in Cyprus (already the 13th in Tokyo): no banner yet
  const d12 = await day("2026-10-12T20:00:00Z", { timezoneId: "Asia/Tokyo" }, "Ingvild", "5555");
  assert.equal(await d12.locator(".bday").count(), 0);
  // 13 Oct, 01:30 in Cyprus (still the 12th in New York): Anne sees her own banner
  const d13 = await day("2026-10-12T22:30:00Z", { timezoneId: "America/New_York", reducedMotion: "reduce" }, "Anne", "2222");
  const awards = watch(d13, "dr_award");
  await d13.getByText("Gratulerer med dagen, Anne!").waitFor();
  await d13.getByText("Hele familien skåler for deg i dag").waitFor();
  await d13.screenshot({ path: `${OUT}/19-birthday.png` });
  await d13.click('[data-act="bday"]');
  await fx(d13, "bday-fx");
  assert.equal(await d13.locator(".bday-fx .fx-burst").isVisible(), false, "no flying confetti with reduced motion");
  await dismiss(d13);
  await d13.click('[data-act="bday"]');
  await fx(d13, "bday-fx");
  await dismiss(d13);
  assert.equal(awards.calls, 1, "the sticker is sent once");
  await d13.getByText("Anne 2026-klistremerket er ditt").waitFor();
  // Rating still works with the banner there
  await d13.click('[data-drink="gin-fizz"]');
  await d13.click('[data-score="8"]');
  await d13.click('[data-act="save"]');
  await d13.locator(".sheet").waitFor({ state: "detached" });
  // 14 Oct: the banner is gone, the sticker stays
  const d14 = await day("2026-10-14T09:00:00Z", {}, "Anne", "2222");
  assert.equal(await d14.locator(".bday").count(), 0);
  await d14.click('[data-tab="me"]');
  await d14.locator(".stickers .sticker.s-anne2026").waitFor();

  // Jesper: own page, logout, wrong PIN, right PIN, remove rating
  await require("./table-games.e2e")(a, OUT);
  await a.click('[data-act="untested"]');
  await a.click('[data-tab="me"]');
  await a.getByText("Dine karakterer").waitFor();
  await a.locator(".stickers .sticker.s-miranda").waitFor();
  assert.ok((await a.locator(".stickers .sticker:not(.locked)").count()) >= 4, "stickers collected");
  await a.screenshot({ path: `${OUT}/9-me.png`, fullPage: true });
  await a.click('[data-act="logout"]');
  await a.click('[data-pick="Jesper"]');
  await a.fill("input[name=pin]", "0000");
  await a.click("text=Logg inn");
  await a.getByText("Feil PIN-kode").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.click("text=Logg inn");
  await a.locator(".drink").first().waitFor();
  assert.equal(await a.locator('[data-act="untested"]').getAttribute("aria-pressed"), "false", "logout resets personal filter");
  await a.click('[data-drink="porn-star-martini"]');
  await a.click('[data-act="remove"]');
  await a.getByText("Vurdering fjernet").waitFor();
  await a.click('[data-act="untested"]');
  await a.locator('[data-drink="porn-star-martini"]').waitFor();
  await a.click('[data-act="untested"]');

  for (const p of [a, b, c]) {
    for (const tab of ["list", "swipe", "top", "family", "me"]) {
      try { await p.click(`[data-tab="${tab}"]`, { timeout: 5000 }); }
      catch (e) { await p.screenshot({ path: `${OUT}/fail-${tab}.png` }); console.log(await p.evaluate(() => document.body.className + " ov=" + document.body.style.overflow + " sheet=" + !!document.querySelector(".sheet") + " fx=" + !!document.querySelector(".fx"))); throw e; }
      await p.setViewportSize({ width: 320, height: 640 });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow on ${tab}`);
    }
  }
  assert.deepEqual([...a.errors, ...b.errors, ...c.errors, ...d12.errors, ...d13.errors, ...d14.errors], []);
  console.log("E2E PASSED");
  await browser.close();
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
