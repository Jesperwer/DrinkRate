// Shared by the full Postgres E2E suite and the focused local browser check.
const assert = require("node:assert/strict");
module.exports = async function tableGames(p, out) {
  await p.setViewportSize({ width: 320, height: 680 });
  await p.click('[data-tab="family"]');
  await p.click('[data-act="quiz"]');
  await p.click('[data-table="duel"]');
  await p.locator('[data-game-select="cat"]').selectOption("spirit");
  await p.locator('[data-game-select="bar"]').selectOption("sea");
  assert.ok(await p.locator('[data-act="table-start"]').isDisabled());
  await p.locator('[data-game-select="bar"]').selectOption("cap");
  await p.locator('[data-game-select="cat"]').selectOption("free");
  await p.locator('[data-game-check="aiOnly"]').check();
  await p.screenshot({ path: `${out}/25-game-setup.png` });
  await p.click('[data-act="table-start"]');
  const before = await p.locator('[data-duel-choice]').first().getAttribute("data-duel-choice");
  await p.locator('[data-duel-replace]').first().click();
  assert.notEqual(await p.locator('[data-duel-choice]').first().getAttribute("data-duel-choice"), before);
  await p.emulateMedia({ colorScheme: "dark" });
  await p.screenshot({ path: `${out}/26-duel-dark.png` });
  await p.emulateMedia({ colorScheme: "light" });
  let winner;
  for (let i = 0; i < 7; i++) {
    const choices = p.locator('[data-duel-choice]');
    assert.equal(await choices.count(), 2);
    for (const id of await choices.evaluateAll((els) => els.map((e) => e.dataset.duelChoice))) {
      assert.ok(await p.evaluate((id) => window.DRINKS.some((d) => d.id === id && d.cat === "free" && d.ai.includes("cap")), id));
    }
    winner = await choices.first().getAttribute("data-duel-choice");
    await choices.first().click();
    assert.ok(await choices.nth(1).isDisabled());
    if (i === 0) {
      await p.click('[data-act="duel-repick"]');
      assert.ok(await choices.nth(1).isEnabled());
      await choices.first().click();
    }
    assert.equal(await p.evaluate(() => document.querySelector(".sheet").scrollWidth > innerWidth), false, "duel fits 320 px");
    await p.click('[data-act="duel-next"]');
  }
  await p.getByText("Bordets vinner!", { exact: true }).waitFor();
  await p.locator(`[data-game-drink="${winner}"]`).waitFor();
  await p.locator(`[data-game-wish="${winner}"]`).click();
  assert.ok(await p.locator(`[data-game-wish="${winner}"]`).isDisabled());
  await p.screenshot({ path: `${out}/27-duel-winner.png` });
  await p.click('[data-act="table-again"]');
  await p.locator('[data-game-select="bar"]').waitFor();
  await p.click('[data-act="table-menu"]');

  await p.click('[data-table="pitch"]');
  // Two participants: Jesper and Astri. Empty/one-person games cannot start.
  for (const i of [0, 2, 4, 5, 6, 3]) await p.click(`[data-game-player="${i}"]`);
  assert.ok(await p.locator('[data-act="table-start"]').isDisabled());
  await p.click('[data-game-player="3"]');
  await p.locator('[data-game-select="cat"]').selectOption("coffee");
  await p.click('[data-act="table-start"]');
  await p.getByText("Jesper, overbevis Astri!", { exact: true }).waitFor();
  const pitchDrink = await p.locator('[data-game-drink]').getAttribute("data-game-drink");
  await p.click('[data-act="pitch-replace"]');
  assert.notEqual(await p.locator('[data-game-drink]').getAttribute("data-game-drink"), pitchDrink);
  await p.clock.install();
  await p.click('[data-act="pitch-start"]');
  await p.clock.fastForward(5000);
  await p.click('[data-act="pitch-pause"]');
  const paused = await p.locator(".pitch-seconds").textContent();
  assert.ok(Number(paused) <= 15 && Number(paused) > 0);
  await p.clock.fastForward(25000);
  assert.equal(await p.locator(".pitch-seconds").textContent(), paused);
  await p.screenshot({ path: `${out}/28-pitch-timer.png` });
  await p.click('[data-act="pitch-start"]');
  await p.clock.fastForward(21000);
  await p.getByText("Tid for å stemme!", { exact: true }).waitFor();
  assert.ok(await p.locator('[data-act="pitch-score"]').isDisabled());
  await p.click('[data-pitch-votes="1"]');
  await p.click('[data-act="pitch-score"]');
  await p.getByText("Jesper fikk 1 poeng!", { exact: true }).waitFor();
  await p.click('[data-act="pitch-next"]');
  await p.getByText("Astri, overbevis Jesper!", { exact: true }).waitFor();
  await p.click('[data-act="pitch-skip"]');
  await p.click('[data-act="pitch-next"]');
  await p.getByText("Jesper vant!", { exact: true }).waitFor();
  assert.equal(await p.locator(".pitch-results li").count(), 2);
  assert.equal(await p.locator(".pitch-score").last().textContent(), "AstriHoppet over");
  await p.screenshot({ path: `${out}/29-pitch-result.png` });
  assert.equal(await p.evaluate(() => document.querySelector(".sheet").scrollWidth > innerWidth), false, "results fit 320 px");
  await p.click('[data-act="table-again"]');
  await p.click('[data-act="table-start"]');
  await p.click('[data-act="pitch-start"]');
  await p.click(".sheet .close");
  await p.clock.fastForward(25000);
  assert.equal(await p.locator(".sheet").count(), 0, "closing cancels the timer");
  await p.clock.resume();
  await p.click('[data-tab="swipe"]');
  await p.locator(`.list [data-drink="${winner}"]`).waitFor();
  await p.click('[data-tab="list"]');
};
