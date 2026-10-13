// Family variants end-to-end: make, rate, see across people, delete rules, and a site
// whose database does not have custom_drinks.sql yet. Synthetic data, local only.
// Usage: PORT=8787 node tests/custom-drinks.e2e.js <screenshot dir>
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const OUT = process.argv[2] || ".";
const PORT = Number(process.env.PORT || 8787);
const BASE = `http://localhost:${PORT}/`;
const CONFIG = `window.DR_CONFIG={url:"http://localhost:${PORT}",key:"sb_publishable_test",family:["Luise","Jesper","Jakob","Astri","Ingvild","Anne","Julie"],
  features:{customDrinks:true,quiz:true,teamGame:true},birthday:null};`;
const PINS = { Jesper: "1234", Astri: "4321" };

async function phone(browser, opts = {}) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...opts });
  await ctx.route("**/config.js*", (r) => r.fulfill({ contentType: "text/javascript", body: CONFIG }));
  await ctx.route("https://fonts.*/**", (r) => r.abort());
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && p.errors.push(m.text()));
  p.calls = [];
  p.on("request", (r) => { const m = r.url().match(/\/rpc\/(\w+)$/); if (m) p.calls.push(m[1]); });
  return p;
}
async function logIn(p, name) {
  await p.goto(BASE);
  await p.click(`[data-pick="${name}"]`);
  await p.fill("input[name=pin]", PINS[name]);
  await p.click("text=Logg inn");
  await p.locator(".drink").first().waitFor();
}
const variantRow = (p, name) => p.locator(".list .drink", { hasText: name });

(async () => {
  const browser = await chromium.launch();
  const a = await phone(browser);
  await logIn(a, "Jesper");
  const menu = await a.evaluate(() => window.DRINKS.length);

  // Make a variant from Gin Fizz: checks first, then a double tap saves once.
  await a.click('.list [data-drink="gin-fizz"]');
  await a.click('[data-act="variant"]');
  assert.equal(await a.inputValue('input[name="vname"]'), "Gin Fizz – min variant");
  assert.equal(await a.inputValue('textarea[name="vingr"]'), await a.evaluate(() => window.DRINKS.find((d) => d.id === "gin-fizz").desc));
  await a.fill('input[name="vname"]', "x");
  await a.click('[data-act="variant-save"]');
  await a.getByText("Navnet må ha 2–60 tegn.").waitFor();
  await a.fill('input[name="vname"]', "mojito");
  await a.click('[data-act="variant-save"]');
  await a.getByText("Det finnes allerede en drink med det navnet").waitFor();
  await a.fill('input[name="vname"]', "Gin Fizz uten sukker");
  await a.fill('textarea[name="vingr"]', "Gin, sitron og soda – uten sukker");
  await a.setViewportSize({ width: 320, height: 640 });
  assert.equal(await a.evaluate(() => document.querySelector(".sheet").scrollWidth > innerWidth), false, "variant form fits 320 px");
  await a.screenshot({ path: `${OUT}/v-1-form.png` });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.dblclick('[data-act="variant-save"]');
  await a.locator(".sheet h2", { hasText: "Gin Fizz uten sukker" }).waitFor();
  assert.equal(a.calls.filter((c) => c === "dr_add_custom_drink").length, 1, "one variant per save");
  await a.getByText("Variant av").waitFor();
  assert.equal(await a.locator(".sheet .desc").textContent(), "Gin, sitron og soda – uten sukker");
  await a.click('[data-score="8"]');
  await a.click('[data-act="save"]');
  await a.getByText("Lagret: 8/10 for Gin Fizz uten sukker").waitFor();
  await variantRow(a, "Gin Fizz uten sukker").locator(".tag.variant").waitFor();
  assert.equal(await a.evaluate(() => window.DRINKS.length), menu + 1);
  // Same category as the drink it is based on.
  assert.equal(await a.evaluate(() => window.DRINKS.find((d) => d.name === "Gin Fizz uten sukker").cat), await a.evaluate(() => window.DRINKS.find((d) => d.id === "gin-fizz").cat));
  await a.screenshot({ path: `${OUT}/v-2-list.png` });

  // Astri sees it and rates it; then Jesper can no longer delete it.
  const b = await phone(browser);
  await logIn(b, "Astri");
  await variantRow(b, "Gin Fizz uten sukker").click();
  await b.getByText("laget av Jesper").waitFor();
  assert.equal(await b.locator('[data-act="variant-ask-delete"]').count(), 0, "only the maker can delete");
  await b.click('[data-score="6"]');
  await b.click('[data-act="save"]');
  await b.getByText("Lagret: 6/10").waitFor();
  await a.reload();
  await variantRow(a, "Gin Fizz uten sukker").click();
  await a.locator(".review", { hasText: "Astri" }).waitFor();
  assert.equal(await a.locator('[data-act="variant-ask-delete"]').count(), 0, "not deletable once others rated it");
  await a.click(".sheet .close");

  // A second variant, never rated by others: the maker can delete it.
  await a.click('.list [data-drink="tom-collins"]');
  await a.click('[data-act="variant"]');
  await a.fill('input[name="vname"]', "Tom Collins med basilikum");
  await a.click('[data-act="variant-save"]');
  await a.locator(".sheet h2", { hasText: "Tom Collins med basilikum" }).waitFor();
  await a.click('[data-act="variant-ask-delete"]');
  await a.click('[data-act="variant-keep"]');
  await a.click('[data-act="variant-ask-delete"]');
  await a.click('[data-act="variant-delete"]');
  await a.getByText("Varianten er slettet").waitFor();
  assert.equal(await variantRow(a, "Tom Collins med basilikum").count(), 0);

  // Before custom_drinks.sql is run, the site works as before and shows no button.
  const c = await phone(browser);
  await c.context().route("**/rpc/dr_list_custom_drinks", (r) => r.fulfill({ status: 404, body: "{}" }));
  await logIn(c, "Jesper");
  await c.click('.list [data-drink="gin-fizz"]');
  await c.locator(".sheet h2", { hasText: "Gin Fizz" }).waitFor();
  assert.equal(await c.locator('[data-act="variant"]').count(), 0);

  const writes = [...a.calls, ...b.calls].filter((x) => ["dr_add_custom_drink", "dr_remove_custom_drink"].includes(x));
  assert.deepEqual(writes, ["dr_add_custom_drink", "dr_add_custom_drink", "dr_remove_custom_drink"]);
  assert.deepEqual([...a.errors, ...b.errors, ...c.errors], []);
  console.log("VARIANT E2E PASSED");
  await browser.close();
})().catch(async (e) => { console.error("VARIANT E2E FAILED:", e); process.exit(1); });
