// Capture frames of the opening cinematic: node scripts/introshot.mjs [outDir] [seed]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [outDir = 'test-results/intro', seed = '42'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
if (process.env.LANG_RU) await page.addInitScript(() => localStorage.setItem('human-odyssey-lang', 'ru'));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => !!window.game);
await page.evaluate(async (s) => { await window.game.api.newGame(Number(s), true); }, seed);
await page.waitForFunction(() => window.game.state === 'intro', null, { timeout: 120000 });
for (const t of (process.env.FRAMES ? process.env.FRAMES.split(',').map(Number) : [2, 6, 12, 17, 21, 27])) {
  await page.evaluate((time) => { const g = window.game; g.intro.seek(time); g.clock.timeOfDay = 0.27 + time * 0.0018; for (let i = 0; i < 3; i++) g.render(0.016); }, t);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/intro-${String(t).padStart(2, '0')}.png`, timeout: 120000 });
  console.log('frame', t);
}
await browser.close();
