// Writes a synthetic "camera" JPEG (3000 × 2000) used by the photo tests.
// Usage: node tests/make-photo.js <out.jpg>
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 3000; c.height = 2000;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 3000, 2000);
    grad.addColorStop(0, "#f2b134"); grad.addColorStop(0.5, "#e2553f"); grad.addColorStop(1, "#0d7a96");
    g.fillStyle = grad; g.fillRect(0, 0, 3000, 2000);
    // Some noise so the JPEG is camera-sized, not a few kilobytes.
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 50)}%)`;
      g.fillRect((i * 7919) % 3000, (i * 104729) % 2000, 6 + (i % 9), 6 + (i % 7));
    }
    return c.toDataURL("image/jpeg", 0.92);
  });
  fs.writeFileSync(process.argv[2], Buffer.from(data.split(",")[1], "base64"));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
