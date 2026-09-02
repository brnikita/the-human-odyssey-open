import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

declare global {
  interface Window { game: any }
}

const OUT = 'test-results/screens';

/**
 * Visual smoke: renders key screens with a real WebGL context (SwiftShader in CI)
 * and stores screenshots for manual review. Assertions only check that the
 * canvas is not blank and no page errors occurred.
 */
async function start(page: Page) {
  await page.goto('/?quality=high');
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(async () => { await window.game.api.newGame(42); });
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 90_000 });
  await page.evaluate(() => { const g = window.game; g.api.step(30); g.controller.camPitch = 0.3; g.controller.camDist = 8; });
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => { const g = window.game; for (let i = 0; i < 2; i++) g.render(0.016); g.updateHud?.(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function canvasHasContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas') as HTMLCanvasElement;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    // render synchronously right before reading so the drawing buffer is still valid
    window.game.render(0.016);
    const px = new Uint8Array(4 * 64);
    for (let i = 0; i < 64; i++) {
      gl.readPixels(Math.floor((i % 8) * gl.drawingBufferWidth / 8), Math.floor(Math.floor(i / 8) * gl.drawingBufferHeight / 8), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4));
    }
    let distinct = new Set<string>();
    for (let i = 0; i < 64; i++) distinct.add(`${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]}`);
    return distinct.size > 4;
  });
}

test.describe('visual smoke', () => {
  test('key screens render', async ({ page }) => {
    test.setTimeout(1_200_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => !!window.game);
    await page.waitForTimeout(800);
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/00-menu.png` });

    await start(page);
    await shot(page, '01-gameplay');
    expect(await canvasHasContent(page)).toBe(true);

    await page.evaluate(() => { window.game.api.press('intelligence'); window.game.api.step(10); });
    await shot(page, '02-intelligence');
    await page.evaluate(() => { window.game.api.release('intelligence'); window.game.api.step(2); });

    await page.evaluate(() => { const g = window.game; g.api.addEnergy(300); g.api.recordAction('walk', 60); g.api.unlock('mot_balance'); g.openNeuronal(); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/03-neuronal.png` });
    await page.evaluate(() => window.game.closeNeuronal());

    await page.evaluate(() => window.game.openPanel('map'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/04-map.png` });
    await page.evaluate(() => window.game.openPanel('inventory'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/05-knowledge.png` });
    await page.evaluate(() => window.game.openPanel('clan'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/06-clan.png` });
    await page.evaluate(() => window.game.resume());

    await page.evaluate(() => { const g = window.game; g.api.setTime(0.93); g.api.step(5); });
    await shot(page, '07-night');
    await page.evaluate(() => { const g = window.game; g.api.setTime(0.45); g.world.sky.rain = 1; g.rainTarget = 1; for (let i = 0; i < 4; i++) g.render(0.25); });
    await shot(page, '08-rain');

    // predator encounter prompt
    await page.evaluate(() => { const g = window.game; g.world.sky.rain = 0; g.rainTarget = 0; g.api.spawnAnimal('machairodus', 3, 0); g.api.face(g.controller.position.x + 3, g.controller.position.z); for (let i = 0; i < 400 && !g.combat.telegraph; i++) g.api.step(1); });
    await shot(page, '09-predator');

    await page.evaluate(() => { const g = window.game; const l = g.world.landmarks.find((x: any) => x.def.id === 'great_baobab') ?? g.world.landmarks[0]; if (l) { g.api.teleport(l.position.x + 18, l.position.z + 12); g.api.face(l.position.x, l.position.z); g.controller.camYaw = g.controller.yaw; g.controller.camDist = 12; g.api.step(3); } });
    await shot(page, '11-landmark');

    await page.evaluate(() => { const g = window.game; g.api.goToSettlement(); g.api.step(5); g.tryGeneration(); });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/10-generation.png` });
    expect(errors).toEqual([]);
  });
});
