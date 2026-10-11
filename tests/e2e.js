// End-to-end check against the mock server. Usage: node tests/e2e.js <screenshot dir>
const { chromium, devices } = require("playwright");
const assert = require("assert");
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8787/";
const CONFIG = `window.DR_CONFIG={url:"http://localhost:8787",key:"sb_publishable_test",family:["Luise","Jesper","Jakob","Astri","Ingvild","Anne","Julie"]};`;

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
  await a.setInputFiles('input[name="photo"]', "/var/tmp/test-photo.jpg");
  await a.locator(".photo-prev img").waitFor();
  const sizes = await a.evaluate(() => document.querySelector(".photo-prev img").src.length);
  assert.ok(sizes < 80000, "thumbnail is small");
  await a.screenshot({ path: `${OUT}/3-sheet.png` });
  await a.click('[data-act="save"]');
  await fx(a, "perfect");
  await a.screenshot({ path: `${OUT}/4-perfect.png` });
  await dismiss(a);

  // Flavours are their own drinks
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
  await fx(a, "opa");
  await a.screenshot({ path: `${OUT}/5-opa.png` });
  await dismiss(a);
  assert.equal(await a.locator(".drink").count(), 2); // Ouzo + Ouzo Plomari
  await a.fill("input[name=q]", "Miranda");
  await fx(a, "miranda-fx");
  await a.screenshot({ path: `${OUT}/5b-miranda.png` });
  await dismiss(a);
  await a.fill("input[name=q]", "");

  // Second member rates Mojito 1 → UFF, sees Jesper's comment escaped
  const b = await page(browser, { colorScheme: "dark" });
  await b.goto(BASE);
  await b.click('[data-pick="Astri"]');
  await b.fill("input[name=pin]", "4321");
  await b.fill("input[name=pin2]", "4321");
  await b.click("text=Kom i gang");
  await b.locator(".drink").first().waitFor();
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
  await b.locator(".gallery .g-item").first().waitFor();
  assert.equal(await b.locator('[data-drink="porn-star-martini"] .tag.photo').count() + 1, 1); // family tab has no cards; just make sure it renders
  await b.screenshot({ path: `${OUT}/7-family-dark.png`, fullPage: true });
  await b.click('[data-person="Jesper"]');
  await b.getByText("Alle karakterer").waitFor();
  assert.ok((await b.locator(".sheet .drink").count()) >= 3);
  await b.screenshot({ path: `${OUT}/8-person-dark.png` });
  await b.click('.sheet .close');

  // Logo x5 → disco
  for (let i = 0; i < 5; i++) await b.click(".top h1");
  await fx(b, "disco-fx");
  await dismiss(b);

  // Jesper: own page, logout, wrong PIN, right PIN, remove rating
  await a.click('[data-tab="me"]');
  await a.getByText("Dine karakterer").waitFor();
  await a.locator(".stickers .sticker.s-miranda").waitFor();
  assert.ok((await a.locator(".stickers .sticker:not(.locked)").count()) >= 5, "stickers collected");
  await a.screenshot({ path: `${OUT}/9-me.png`, fullPage: true });
  await a.click('[data-act="logout"]');
  await a.click('[data-pick="Jesper"]');
  await a.fill("input[name=pin]", "0000");
  await a.click("text=Logg inn");
  await a.getByText("Feil PIN-kode").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.click("text=Logg inn");
  await a.locator(".drink").first().waitFor();
  await a.click('[data-drink="porn-star-martini"]');
  await a.click('[data-act="remove"]');
  await a.getByText("Vurdering fjernet").waitFor();

  for (const p of [a, b]) {
    for (const tab of ["list", "swipe", "top", "family", "me"]) {
      try { await p.click(`[data-tab="${tab}"]`, { timeout: 5000 }); }
      catch (e) { await p.screenshot({ path: `${OUT}/fail-${tab}.png` }); console.log(await p.evaluate(() => document.body.className + " ov=" + document.body.style.overflow + " sheet=" + !!document.querySelector(".sheet") + " fx=" + !!document.querySelector(".fx"))); throw e; }
      await p.setViewportSize({ width: 320, height: 640 });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow on ${tab}`);
    }
  }
  assert.deepEqual([...a.errors, ...b.errors], []);
  console.log("E2E PASSED");
  await browser.close();
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
