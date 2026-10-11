// End-to-end check against the mock server. Usage: node tests/e2e.js <screenshot dir>
const { chromium, devices } = require("playwright");
const assert = require("assert");
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8787/";
const CONFIG = `window.DR_CONFIG={url:"http://localhost:8787",key:"sb_publishable_test",family:["Luise","Jesper","Jakob","Astri","Ingvild","Anne","Julie"]};`;

async function page(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: CONFIG }));
  await ctx.route("https://fonts.*/**", (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.errors = errors;
  return p;
}
const sixSevenShown = (p) => p.locator(".six7").waitFor({ timeout: 2000 });

(async () => {
  const browser = await chromium.launch();
  const a = await page(browser);
  await a.goto(BASE);
  await a.getByText("Hvem er du?").waitFor();
  assert.equal(await a.locator("[data-pick]").count(), 7);
  await a.screenshot({ path: `${OUT}/1-pick.png` });

  // First time: Jesper picks his own PIN (must match twice)
  await a.click('[data-pick="Jesper"]');
  await a.getByText("Velkommen, Jesper!").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.fill("input[name=pin2]", "1235");
  await a.click("text=Kom i gang");
  await a.getByText("PIN-kodene er ikke like").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.fill("input[name=pin2]", "1234");
  await a.screenshot({ path: `${OUT}/2-setpin.png` });
  await a.click("text=Kom i gang");
  await a.getByRole("heading", { name: "Drinker" }).waitFor();
  await a.locator(".drink").first().waitFor();
  assert.equal(await a.locator(".drink").count(), 63);
  await a.screenshot({ path: `${OUT}/3-list.png` });

  // Rate Mojito 9 at Splash with a comment; 6 → 7 taps fire the meme
  await a.click('[data-drink="mojito"]');
  await a.click('[data-score="6"]');
  await a.click('[data-score="7"]');
  await sixSevenShown(a);
  await a.screenshot({ path: `${OUT}/4-six-seven.png` });
  await a.locator(".six7").click();
  await a.click('[data-score="9"]');
  await a.click('[data-pickbar="spl"]');
  await a.fill("textarea[name=comment]", "Beste <b>hittil</b>");
  await a.click('[data-score="8"]'); // comment and bar survive a score change
  assert.equal(await a.inputValue("textarea[name=comment]"), "Beste <b>hittil</b>");
  assert.equal(await a.locator('[data-pickbar="spl"].on').count(), 1);
  await a.screenshot({ path: `${OUT}/5-sheet.png` });
  await a.click('[data-act="save"]');
  await a.getByText("Du: 8").first().waitFor();

  // Single-bar drink: no bar picker, bar saved automatically
  await a.click('[data-drink="captain-zombie"]');
  assert.equal(await a.locator(".bar-pick").count(), 0);
  await a.click('[data-score="5"]');
  await a.click('[data-act="save"]');
  await a.getByText("Du: 5").first().waitFor();

  // Typing 67 in search → meme
  await a.fill("input[name=q]", "67");
  await sixSevenShown(a);
  await a.locator(".six7").click();
  await a.fill("input[name=q]", "");

  // Second family member
  const b = await page(browser);
  await b.goto(BASE);
  await b.click('[data-pick="Jesper"]');
  await b.getByText("Hei, Jesper!").waitFor(); // already registered → asks for PIN
  await b.click('[data-act="back"]');
  await b.click('[data-pick="Astri"]');
  await b.fill("input[name=pin]", "4321");
  await b.fill("input[name=pin2]", "4321");
  await b.click("text=Kom i gang");
  await b.getByRole("heading", { name: "Drinker" }).waitFor();
  await b.click('[data-drink="mojito"]');
  await b.getByText("Beste <b>hittil</b>").waitFor(); // escaped, shown as text
  await b.getByText("på Splash").waitFor();
  await b.click('[data-score="10"]');
  await b.fill("textarea[name=comment]", "6 7 hehe");
  await sixSevenShown(b);
  await b.locator(".six7").click();
  await b.click('[data-act="save"]');
  await b.waitForSelector(".sheet", { state: "detached" });
  assert.equal(await b.locator('[data-drink="mojito"] .score b').textContent(), "9,0");

  await b.click('[data-tab="top"]');
  await b.getByRole("heading", { name: "Toppliste" }).waitFor();
  await b.screenshot({ path: `${OUT}/6-top.png` });
  assert.equal(await b.locator(".list .drink").first().getAttribute("data-drink"), "mojito");

  // Filters: bar filter shows drinks served there
  await b.click('[data-tab="list"]');
  await b.click('[data-bar="sea"]');
  await b.click('[data-cat="free"]');
  assert.equal(await b.locator(".drink").count(), 3);
  await b.click('[data-bar="all"]');
  await b.click('[data-cat="all"]');
  await b.fill("input[name=q]", "zombie");
  assert.equal(await b.locator(".drink").count(), 1);

  // Jesper: own list, log out, wrong PIN, right PIN
  await a.reload();
  await a.click('[data-tab="mine"]');
  await a.getByText("Dine favoritter").waitFor();
  assert.equal(await a.locator(".drink").count(), 2);
  await a.screenshot({ path: `${OUT}/7-mine.png` });
  await a.click('[data-act="menu"]');
  await a.click('[data-act="logout"]');
  await a.click('[data-pick="Jesper"]');
  await a.fill("input[name=pin]", "0000");
  await a.click("text=Logg inn");
  await a.getByText("Feil PIN-kode").waitFor();
  await a.fill("input[name=pin]", "1234");
  await a.click("text=Logg inn");
  await a.getByRole("heading", { name: "Drinker" }).waitFor();

  // Remove a rating
  await a.click('[data-drink="captain-zombie"]');
  await a.click('[data-act="remove"]');
  await a.getByText("Vurdering fjernet").waitFor();
  assert.equal(await a.locator('[data-drink="captain-zombie"] .pill.todo').count(), 1);

  for (const p of [a, b]) {
    await p.setViewportSize({ width: 320, height: 640 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "horizontal overflow");
  }
  assert.deepEqual([...a.errors, ...b.errors], []);
  console.log("E2E PASSED");
  await browser.close();
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
