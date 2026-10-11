// End-to-end check against the mock server. Usage: node tests/e2e.js <screenshot dir>
const { chromium, devices } = require("playwright");
const assert = require("assert");
const OUT = process.argv[2] || ".";
const BASE = "http://localhost:8787/";

async function page(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], browserName: undefined });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.DR_CONFIG={url:"http://localhost:8787",key:"sb_publishable_test"};` }));
  await ctx.route("https://fonts.*/**", (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/fonts|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.errors = errors;
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const a = await page(browser);
  await a.goto(BASE);
  await a.getByText("Lag din bruker").waitFor();
  await a.screenshot({ path: `${OUT}/1-register.png` });
  await a.fill("input[name=name]", "Jesper");
  await a.fill("input[name=pin]", "1234");
  await a.click("text=Kom i gang");
  await a.getByRole("heading", { name: "Drinker" }).waitFor();
  await a.screenshot({ path: `${OUT}/2-list.png` });

  await a.click('[data-drink="amph-mojito"]');
  await a.click('[data-star="5"]');
  await a.fill("textarea[name=comment]", "Beste mojitoen <b>hittil</b>");
  await a.click('[data-star="4"]'); // comment must survive a star change
  assert.equal(await a.inputValue("textarea[name=comment]"), "Beste mojitoen <b>hittil</b>");
  await a.screenshot({ path: `${OUT}/3-sheet.png` });
  await a.click('[data-act="save"]');
  await a.getByText("Du: 4 ★").first().waitFor();

  await a.click('[data-drink="cap-captain-zombie"]');
  await a.click('[data-star="3"]');
  await a.click('[data-act="save"]');
  await a.getByText("Du: 3 ★").first().waitFor();

  // Second family member on another phone
  const b = await page(browser);
  await b.goto(BASE);
  await b.getByText("Hvem er du?").waitFor();
  await b.screenshot({ path: `${OUT}/4-pick.png` });
  await b.click("text=+ Ny person");
  await b.fill("input[name=name]", "jesper");
  await b.fill("input[name=pin]", "1111");
  await b.click("text=Kom i gang");
  await b.getByText("allerede tatt").waitFor();
  await b.fill("input[name=name]", "Mamma");
  await b.fill("input[name=pin]", "4321");
  await b.click("text=Kom i gang");
  await b.getByRole("heading", { name: "Drinker" }).waitFor();
  await b.click('[data-drink="amph-mojito"]');
  await b.getByText("Beste mojitoen <b>hittil</b>").waitFor(); // escaped, shown as text
  await b.click('[data-star="5"]');
  await b.click('[data-act="save"]');
  await b.waitForSelector(".sheet", { state: "detached" });
  const score = await b.locator('[data-drink="amph-mojito"] .score b').textContent();
  assert.equal(score, "4,5");

  await b.click('[data-tab="top"]');
  await b.getByRole("heading", { name: "Toppliste" }).waitFor();
  await b.screenshot({ path: `${OUT}/5-top.png` });
  const first = await b.locator(".list .drink").first().getAttribute("data-drink");
  assert.equal(first, "amph-mojito");

  // Search and filters
  await b.click('[data-tab="list"]');
  await b.fill("input[name=q]", "zombie");
  assert.equal(await b.locator(".drink").count(), 1);
  await b.fill("input[name=q]", "");
  await b.click('[data-bar="sea"]');
  await b.click('[data-cat="free"]');
  assert.equal(await b.locator(".drink").count(), 3);
  await b.screenshot({ path: `${OUT}/6-filter.png` });

  // Jesper's own list, then log out and back in (wrong PIN first)
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
  await a.click('[data-drink="cap-captain-zombie"]');
  await a.click('[data-act="remove"]');
  await a.getByText("Vurdering fjernet").waitFor();
  assert.equal(await a.locator('[data-drink="cap-captain-zombie"] .pill.todo').count(), 1);

  // Horizontal overflow check at narrow width
  await a.setViewportSize({ width: 320, height: 640 });
  const overflow = await a.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, "horizontal overflow");

  assert.deepEqual([...a.errors, ...b.errors], []);
  console.log("E2E PASSED");
  await browser.close();
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
