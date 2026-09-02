import { chromium } from '@playwright/test';
const url = process.argv[2] || 'http://localhost:5173/?quality=high';
const out = process.argv[3] || 'quick.png';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
if (process.env.LANG_RU) await page.addInitScript(() => localStorage.setItem('human-odyssey-lang', 'ru'));
await page.goto(url);
if (process.env.MENU_SHOT) { await page.waitForFunction(() => !!window.game); await page.waitForTimeout(800); await page.screenshot({ path: process.env.MENU_SHOT }); }
await page.waitForFunction(() => !!window.game);
await page.evaluate(async () => { await window.game.api.newGame(42); });
await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 120000 });
await page.evaluate(() => { const g = window.game; g.api.step(30); g.controller.camPitch = 0.25; g.controller.camDist = 5; g.api.spawnAnimal('machairodus', 3, 1); g.api.spawnAnimal('antelope', -3, 2); g.api.step(2); for (let i = 0; i < 2; i++) g.render(0.016); g.updateHud(); });
await page.waitForTimeout(500);
await page.screenshot({ path: out, timeout: 180000 });
const info = await page.evaluate(() => { const g = window.game; g.render(0.016); return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
console.log(JSON.stringify(info));
await browser.close();
