// verify-redsea.mjs —— Playwright 目視驗收:跑完紅海全階段、逐階段截圖、抓 pageerror。
// 用法:node scripts/verify-redsea.mjs [outDir] [url]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || join(process.cwd(), "verify-shots");
const URL = process.argv[3] || "http://localhost:4177";
mkdirSync(OUT, { recursive: true });

const errors = [];
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log("  📸", name); };
const st = (page) => page.evaluate(() => {
  const g = window.__redsea3d;
  return g ? { phase: g.phase, x: +g.moses.x.toFixed(1), rise: +g.wallRise.toFixed(2), coh: g.band ? +g.band.cohesion(g.moses).toFixed(2) : null } : null;
});
const waitPhase = async (page, target, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await st(page);
    if (s && s.phase === target) return true;
    await page.waitForTimeout(150);
  }
  return false;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "01-menu");

  await page.selectOption("#difficultySelect", "kids").catch(() => {});
  await page.click("#startButton");
  await page.waitForTimeout(800);
  console.log("  staff:", JSON.stringify(await st(page)));
  await shot(page, "02-staff");
  const promptVisible = await page.isVisible("#actionPrompt");
  console.log("  actionPrompt visible:", promptVisible);

  // 伸杖 → 水牆升起
  await page.evaluate(() => window.__redsea3d.triggerAction());
  await page.waitForTimeout(2200);
  await shot(page, "03-parting");
  console.log("  part:", JSON.stringify(await st(page)));

  // 走乾地(帶一點左右導引)
  await waitPhase(page, "cross", 8000);
  await page.evaluate(() => { window.__redsea3d.controls.right = true; });
  await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__redsea3d.controls.right = false; window.__redsea3d.controls.left = true; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__redsea3d.controls.left = false; });
  await shot(page, "04-crossing");
  console.log("  cross:", JSON.stringify(await st(page)));

  // 快轉到對岸(連隊伍一起傳送,否則要等真實步行 10 秒+)
  await page.evaluate(() => {
    const g = window.__redsea3d;
    g.moses.x = g.goal - 2;
    for (const f of g.band.followers) { f.x = g.goal - 4 + Math.random() * 2.5; }
  });
  await waitPhase(page, "close", 8000);
  await page.waitForTimeout(1600);
  await shot(page, "05-closing");

  await waitPhase(page, "done", 10000);
  await page.waitForTimeout(700);
  await shot(page, "06-done");
  const overlayVisible = await page.isVisible("#matchOverlay.visible");
  console.log("  ending overlay visible:", overlayVisible);
  const fin = await st(page);
  if (!fin || fin.phase !== "done") errors.push("gameplay: did not reach done");

  console.log("\n=== RESULT ===");
  console.log("errors:", errors.length);
  for (const e of errors) console.log("   🔴", e);
  console.log(errors.length === 0 ? "🟢 all green" : "🔴 issues found");
} catch (err) {
  console.error("VERIFY FAILED:", err.message);
  errors.push("script: " + err.message);
} finally {
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
