import { test, expect, type Page } from '@playwright/test';
import { ru } from '../../src/i18n/ru';

declare global {
  interface Window { game: any }
}

/**
 * All gameplay tests drive the simulation deterministically through `game.api.step(n)`
 * (fixed 1/60 s steps) so they do not depend on the headless GPU frame rate.
 */
async function startGame(page: Page, seed = 42) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(async (s) => { await window.game.api.newGame(s); }, seed);
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 90_000 });
  await page.evaluate(() => window.game.api.step(30));
}

const snap = (page: Page) => page.evaluate(() => window.game.snapshot());
const run = (page: Page, code: string) => page.evaluate(`(async () => { const g = window.game; const api = g.api; const step = (n) => api.step(n); const sleep = (ms) => new Promise(r => setTimeout(r, ms)); ${code} })()`);

test.describe('The Human Odyssey', () => {
  test('menu renders and a new lineage starts', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'The Human Odyssey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByRole('button', { name: 'New Lineage' }).click();
    await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 90_000 });
    const s = await snap(page);
    expect(s.clan.length).toBeGreaterThanOrEqual(6);
    expect(s.animals).toBeGreaterThan(100);
    expect(s.items).toBeGreaterThan(300);
    expect(s.player?.stats.health).toBe(100);
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('.hud-stats')).toBeVisible();
  });

  test('movement, running, jumping and climbing register actions', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const p0 = [...g.controller.position.toArray()];
      api.press('forward'); step(150); api.release('forward'); step(10);
      const p1 = [...g.controller.position.toArray()];
      const walked = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
      const walkCount = g.lineage.actionCounts.walk ?? 0;
      api.press('run'); api.press('forward'); step(90); api.release('forward'); api.release('run'); step(10);
      const runCount = g.lineage.actionCounts.run ?? 0;
      api.press('jump'); step(2); api.release('jump'); step(90);
      const jump = { count: g.lineage.actionCounts.jump ?? 0, grounded: g.controller.grounded };
      const veg = g.world.veg; const c = g.controller;
      const tree = veg.climbables.filter(t => Math.hypot(t.position.x - c.position.x, t.position.z - c.position.z) < 120).sort((a, b) => b.height - a.height)[0];
      let climb = null;
      if (tree) {
        api.teleport(tree.position.x + tree.radius + 0.6, tree.position.z); step(5);
        api.press('jump'); step(2); api.release('jump'); step(5);
        const climbing = g.controller.isClimbing;
        api.press('forward'); step(150); api.release('forward'); step(5);
        climb = { climbing, y: g.controller.position.y - tree.position.y, count: g.lineage.actionCounts.climb ?? 0, state: g.controller.state };
      }
      return { walked, walkCount, runCount, jump, climb };
    `) as any;
    expect(r.walked).toBeGreaterThan(5);
    expect(r.walkCount).toBeGreaterThan(0);
    expect(r.runCount).toBeGreaterThan(0);
    expect(r.jump.count).toBe(1);
    expect(r.jump.grounded).toBe(true);
    if (r.climb) {
      expect(r.climb.climbing).toBe(true);
      expect(r.climb.y).toBeGreaterThan(1.5);
      expect(r.climb.count).toBeGreaterThanOrEqual(1);
    }
  });

  test('intelligence mode detects and identifies things', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      api.press('intelligence'); step(20);
      const det = { ...g.snapshot().intel };
      api.spawnItem('stick', 2, 0); const c = g.controller; api.face(c.position.x + 2, c.position.z); step(5);
      const focus = g.intel.focus ? { def: g.intel.focus.target.defId, can: g.intel.focus.canIdentify } : null;
      g.input.mouseButtons[0] = true; step(60); g.input.mouseButtons[0] = false; step(5);
      api.release('intelligence'); step(5);
      await sleep(300);
      return { det, focus, discoveries: g.lineage.discoveries, energy: g.lineage.neuronalEnergy, identify: g.lineage.actionCounts.identify, timeScale: det.active ? g.clock.timeScale : null };
    `) as any;
    expect(r.det.active).toBe(true);
    expect(r.det.detections).toBeGreaterThan(0);
    expect(r.focus?.def).toBe('item:stick');
    expect(r.discoveries).toContain('item:stick');
    expect(r.energy).toBeGreaterThan(20);
    expect(r.identify).toBeGreaterThanOrEqual(1);
  });

  test('pick up, eat, drop and craft items', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const c = g.controller;
      api.spawnItem('banana', 1.2, 0); api.face(c.position.x + 1.2, c.position.z); step(5);
      api.click(0); step(10);
      const picked = { ...g.player.held };
      api.setStat('hunger', 40); api.press('smell'); step(2); api.release('smell'); step(80);
      const ate = { hunger: g.player.stats.hunger, held: { ...g.player.held }, eatCount: g.lineage.actionCounts.eat };
      api.giveItem('stick', 'right'); api.press('dropRight'); step(2); api.release('dropRight'); step(10);
      const dropped = { held: { ...g.player.held }, nearest: api.nearestItemId() };
      api.addEnergy(5000); api.recordAction('pickup', 50); api.recordAction('alter', 50); api.recordAction('craft', 50);
      const unlocked = ['dex_grip', 'dex_alter_stone', 'dex_grinder', 'dex_alter_stick', 'dex_two_hands'].map(id => api.unlock(id));
      g.player.held = { left: null, right: 'stone_granite' }; g.world.syncHeld(g.playerEntity);
      api.press('swapHands'); step(2); api.release('swapHands'); step(70);
      const altered = { ...g.player.held };
      g.player.held = { left: 'stick', right: 'grinder' }; g.world.syncHeld(g.playerEntity);
      api.press('swapHands'); step(2); api.release('swapHands'); step(70);
      const combined = { ...g.player.held };
      // coconut needs a stone
      g.player.held = { left: 'coconut', right: 'stone_granite' }; g.world.syncHeld(g.playerEntity);
      api.press('swapHands'); step(2); api.release('swapHands'); step(70);
      const coconut = { ...g.player.held };
      return { picked, ate, dropped, unlocked, altered, combined, coconut, abilities: [...g.mods.abilities], craft: g.lineage.actionCounts.craft, alter: g.lineage.actionCounts.alter };
    `) as any;
    expect(r.picked.right).toBe('banana');
    expect(r.ate.held.right).toBeNull();
    expect(r.ate.hunger).toBeGreaterThan(50);
    expect(r.ate.eatCount).toBe(1);
    expect(r.dropped.held.right).toBeNull();
    expect(r.dropped.nearest).toBe('stick');
    expect(r.unlocked).toEqual([true, true, true, true, true]);
    expect(r.abilities).toContain('craft_grinder');
    expect(r.altered.right).toBe('grinder');
    expect(r.combined.left).toBe('sharp_stick');
    expect(r.coconut.left).toBe('coconut_open');
  });

  test('hunting a rat, harvesting the carcass and surviving a predator attack', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const c = g.controller; api.giveItem('sharp_stick', 'right');
      const rat = api.spawnAnimal('rat', 1.4, 0); const ent = g.world.animals.find(a => a.data.uid === rat);
      // keep the rat still
      const freeze = () => { ent.data.ai.state = 'sleep'; ent.data.ai.timer = 99; ent.data.position.x = c.position.x + 1.4; ent.data.position.z = c.position.z; };
      let hits = 0;
      for (let i = 0; i < 5 && api.isAlive(rat); i++) { freeze(); api.face(ent.data.position.x, ent.data.position.z); step(2); api.click(0); step(50); hits++; }
      const hunt = { alive: api.isAlive(rat), kills: g.lineage.actionCounts.kill, hits, discovered: g.lineage.discoveries.includes('animal:rat'), attackCount: g.lineage.actionCounts.attack };
      api.face(ent.data.position.x, ent.data.position.z); g.player.held = { left: null, right: 'sharp_stick' }; step(2); api.click(0); step(50);
      const meat = { ...g.player.held };
      const cat = api.spawnAnimal('machairodus', 2.2, 0); const catEnt = g.world.animals.find(a => a.data.uid === cat);
      let telegraph = false; for (let i = 0; i < 600 && !telegraph; i++) { step(1); if (g.combat.telegraph) telegraph = true; }
      g.updateHud?.(); const prompt = document.querySelector('.combat-prompt:not([hidden])')?.textContent ?? null;
      let dodged = false;
      if (g.combat.telegraph) { const t = g.combat.telegraph.t; while (t.elapsed < t.windup - 0.05) step(1); api.click(2); dodged = true; step(60); }
      const after = { health: g.player.stats.health, dodge: g.lineage.actionCounts.dodge ?? 0, state: g.state, fear: g.player.fear };
      g.world.removeAnimal(catEnt); g.combat.telegraph = null;
      return { hunt, meat, telegraph, prompt, dodged, after };
    `) as any;
    expect(r.hunt.alive).toBe(false);
    expect(r.hunt.kills).toBe(1);
    expect(r.hunt.discovered).toBe(true);
    expect(r.meat.left).toBe('meat');
    expect(r.telegraph).toBe(true);
    expect(r.prompt).toBe('DODGE!');
    expect(r.dodged).toBe(true);
    expect(r.after.state).toBe('playing');
    expect(r.after.dodge).toBeGreaterThanOrEqual(1);
    expect(r.after.health).toBe(100);
  });

  test('fear builds in the unknown, panic spawns lights, collecting them calms', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const c = g.controller;
      api.teleport(c.position.x + 200, c.position.z - 150); api.setFear(60); step(150);
      const rising = g.player.fear;
      api.setFear(99.5); step(60);
      const lights = g.world.lights.length; const overcome = !!g.overcome;
      for (const l of [...g.world.lights]) { api.teleport(l.position.x, l.position.z); step(20); }
      step(20);
      return { rising, lights, overcome, fearAfter: g.player.fear, overcomeCount: g.lineage.actionCounts.overcome_fear ?? 0, remaining: g.world.lights.length, dopamine: g.player.dopamine };
    `) as any;
    expect(r.rising).toBeGreaterThan(62);
    expect(r.lights).toBeGreaterThanOrEqual(3);
    expect(r.overcome).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.fearAfter).toBeLessThan(5);
    expect(r.overcomeCount).toBe(1);
  });

  test('survival drains, conditions, medicine and drinking', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const h0 = g.player.stats.hunger; step(360); const h1 = g.player.stats.hunger;
      api.applyCondition('bleeding'); step(90); const bleedHealth = g.player.stats.health;
      api.giveItem('horsetail', 'right'); api.press('use'); step(2); api.release('use'); step(80);
      const cured = g.player.conditions.map(x => x.id);
      api.setStat('thirst', 0); api.setStat('hunger', 0); const hp0 = g.player.stats.health; step(150); const hp1 = g.player.stats.health;
      const t = g.world.terrain; let wp = null;
      for (let r = 5; r < 600 && !wp; r += 5) for (let a = 0; a < 24 && !wp; a++) { const ang = a / 24 * Math.PI * 2; const x = g.world.settlement.x + Math.cos(ang) * r, z = g.world.settlement.z + Math.sin(ang) * r; if (t.isWater(x, z) && !t.isWater(x - 2.5 * Math.cos(ang), z - 2.5 * Math.sin(ang))) wp = [x, z, ang]; }
      let drank = null;
      if (wp) { const bx = wp[0] - 2.2 * Math.cos(wp[2]), bz = wp[1] - 2.2 * Math.sin(wp[2]); api.teleport(bx, bz); api.face(wp[0], wp[1]); step(5); api.click(0); step(90); drank = { thirst: g.player.stats.thirst, drink: g.lineage.actionCounts.drink, known: g.lineage.discoveries.includes('water') }; }
      return { drained: h0 - h1, bleedHealth, cured, starving: hp0 - hp1, drank, heal: g.lineage.actionCounts.heal };
    `) as any;
    expect(r.drained).toBeGreaterThan(0.5);
    expect(r.bleedHealth).toBeLessThan(100);
    expect(r.cured).not.toContain('bleeding');
    expect(r.heal).toBeGreaterThanOrEqual(1);
    expect(r.starving).toBeGreaterThan(1);
    expect(r.drank).not.toBeNull();
    expect(r.drank.thirst).toBeGreaterThan(20);
    expect(r.drank.drink).toBe(1);
    expect(r.drank.known).toBe(true);
  });

  test('neuronal network: unlock, reinforce, modifiers', async ({ page }) => {
    await startGame(page);
    await run(page, `api.press('hear'); step(2); api.release('hear'); step(2);`);
    expect(await page.evaluate(() => window.game.state)).toBe('neuronal');
    await run(page, `api.press('hear'); step(2); api.release('hear'); step(2);`);
    expect(await page.evaluate(() => window.game.state)).toBe('playing');
    await run(page, `api.press('neuronal'); step(2); api.release('neuronal'); step(2);`);
    expect(await page.evaluate(() => window.game.state)).toBe('neuronal');
    await expect(page.locator('#neuronal')).toBeVisible();
    await expect(page.locator('#neuronal .energy')).toContainText('energy');
    const r = await run(page, `
      const before = api.unlock('mot_balance');
      api.addEnergy(200); const noAction = api.unlock('mot_balance');
      api.recordAction('walk', 60); const ok = api.unlock('mot_balance');
      const speed = g.mods.speed; const energyLeft = g.lineage.neuronalEnergy;
      const re = g.reinforce('mot_balance');
      g.closeNeuronal();
      return { before, noAction, ok, speed, energyLeft, re, reinforced: [...g.player.reinforced], state: g.state };
    `) as any;
    expect(r.before).toBe(false);
    expect(r.noAction).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.speed).toBeCloseTo(1.08);
    expect(r.energyLeft).toBe(160);
    expect(r.re).toBe(true);
    expect(r.reinforced).toContain('mot_balance');
    expect(r.state).toBe('playing');
  });

  test('clan: carry baby, groom, call, switch member, panels', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const c = g.controller;
      const baby = g.clan.members.find(m => m.stage === 'baby');
      const be = g.world.hominids.get(baby.id); const bp = be.rig.root.position;
      api.teleport(bp.x + 1.2, bp.z); api.face(bp.x, bp.z); step(5); api.click(0); step(10);
      const carried = g.player.carriedBaby;
      const adult = g.clan.members.find(m => m.stage === 'adult' && !m.isPlayer && !m.isOutsider);
      const ae = g.world.hominids.get(adult.id); const ap = ae.rig.root.position;
      // move both away from the settlement crowd so the adult is the only target
      const sx = g.world.settlement.x + 25, sz = g.world.settlement.z;
      api.teleport(sx, sz); ap.set(sx + 1.2, g.world.terrain.heightAt(sx + 1.2, sz), sz); ae.wanderTimer = 99; ae.target = null;
      api.face(ap.x, ap.z); step(3); api.click(0); step(100);
      const groom = g.lineage.actionCounts.groom ?? 0;
      api.press('call'); step(2); api.release('call'); step(10);
      const call = g.lineage.actionCounts.call ?? 0;
      api.press('clan'); step(2); api.release('clan'); step(2);
      const panelOpen = g.state === 'panel' && !!document.querySelector('.modal');
      g.switchTo(adult.id); step(10);
      const energyWithBaby = g.lineage.neuronalEnergy;
      return { carried, groom, call, panelOpen, playerNow: g.player.name, adultName: adult.name, state: g.state, energyWithBaby };
    `) as any;
    expect(r.carried).toBeTruthy();
    expect(r.groom).toBe(1);
    expect(r.call).toBe(1);
    expect(r.panelOpen).toBe(true);
    expect(r.playerNow).toBe(r.adultName);
    expect(r.state).toBe('playing');
    for (const key of ['inventory', 'map']) {
      await run(page, `api.press('${key}'); step(2); api.release('${key}'); step(2);`);
      await expect(page.locator('.modal')).toBeVisible();
      await page.evaluate(() => window.game.resume());
    }
  });

  test('outsider recruitment and mating produce a baby', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const o = g.clan.members.find(m => m.isOutsider); const oe = g.world.hominids.get(o.id);
      let bonds = [];
      for (let i = 0; i < 4 && o.isOutsider; i++) { const op = oe.rig.root.position; api.teleport(op.x + 1.2, op.z); api.face(op.x, op.z); step(5); api.giveItem('banana', 'right'); api.click(0); step(100); bonds.push(+o.bond.toFixed(2)); }
      const recruited = !o.isOutsider;
      const p = g.player; const partner = g.clan.members.find(m => m.stage === 'adult' && m.sex !== p.sex && !m.isOutsider && m.id !== p.id);
      partner.bond = 1; p.bond = 1; p.held = { left: null, right: null }; g.world.syncHeld(g.playerEntity);
      api.goToSettlement(); const pe = g.world.hominids.get(partner.id); pe.rig.root.position.set(g.controller.position.x + 1.2, g.controller.position.y, g.controller.position.z); api.face(pe.rig.root.position.x, pe.rig.root.position.z); step(5);
      const n0 = g.clan.members.length; api.click(0); step(100);
      return { bonds, recruited, babies: g.clan.members.length - n0, mate: g.lineage.actionCounts.mate ?? 0, members: g.clan.members.length };
    `) as any;
    expect(r.recruited).toBe(true);
    expect(r.babies).toBe(1);
    expect(r.mate).toBe(1);
  });

  test('sleep at settlement advances to morning and autosaves', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      api.goToSettlement(); api.setStat('energy', 20); api.setTime(0.9); step(5);
      api.press('sleep'); step(2); api.release('sleep'); step(5);
      const sleeping = g.sleepUntil !== null;
      let i = 0; while (g.sleepUntil !== null && i++ < 4000) step(1);
      return { sleeping, time: g.clock.timeOfDay, day: g.clock.dayCount, energy: g.player.stats.energy, saved: !!localStorage.getItem('human-odyssey-save-v1'), sleepCount: g.lineage.actionCounts.sleep, steps: i };
    `) as any;
    expect(r.sleeping).toBe(true);
    expect(r.time).toBeGreaterThan(0.26);
    expect(r.time).toBeLessThan(0.35);
    expect(r.day).toBe(2);
    expect(r.energy).toBeGreaterThan(80);
    expect(r.saved).toBe(true);
    expect(r.sleepCount).toBe(1);
  });

  test('generation change and evolution leap', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      api.goToSettlement(); api.addEnergy(1000); api.recordAction('walk', 600); api.unlock('mot_balance'); g.reinforce('mot_balance');
      api.press('generation'); step(2); api.release('generation'); step(2);
      const dialog = g.state === 'generation';
      const gen0 = g.lineage.generation; const years0 = g.lineage.yearsAgo; const oldPlayer = g.player.id;
      g.doGeneration(false); await sleep(100);
      const summary = document.querySelector('.modal')?.textContent ?? '';
      document.querySelector('.modal [data-a=close]').click(); step(5);
      const p = g.player;
      return { dialog, gen: g.lineage.generation - gen0, years: years0 - g.lineage.yearsAgo, summary: summary.slice(0, 120), state: g.state, playerStage: p.stage, neurons: [...p.neurons], reinforced: [...p.reinforced], members: g.clan.members.filter(m => !m.isOutsider).map(m => m.stage), rigs: g.world.hominids.size };
    `) as any;
    expect(r.dialog).toBe(true);
    expect(r.gen).toBe(1);
    expect(r.years).toBe(15);
    expect(r.state).toBe('playing');
    expect(['adult', 'elder', 'child']).toContain(r.playerStage);
    expect(r.members).not.toContain('baby');
    expect(r.rigs).toBeGreaterThan(3);
    const leap = await run(page, `
      const p = g.player; const partner = g.clan.members.find(m => m.sex !== p.sex && !m.isOutsider && m.state !== 'dead' && m.id !== p.id && g.world.hominids.has(m.id));
      if (!partner) return { skipped: true };
      p.stage = 'adult'; partner.stage = 'adult'; partner.bond = 1; p.bond = 1; p.held = { left: null, right: null };
      api.goToSettlement(); const pe = g.world.hominids.get(partner.id); pe.rig.root.position.set(g.controller.position.x + 1.2, g.controller.position.y, g.controller.position.z); api.face(pe.rig.root.position.x, pe.rig.root.position.z); step(5);
      api.click(0); step(100);
      const babies = g.clan.members.filter(m => m.stage === 'baby').length;
      api.recordAction('walk', 5000); api.recordAction('identify', 60); g.act('walk');
      const y0 = g.lineage.yearsAgo;
      g.doGeneration(true); await sleep(100); document.querySelector('.modal [data-a=close]').click(); step(5);
      return { babies, advanced: y0 - g.lineage.yearsAgo, feats: g.lineage.feats.length, genetic: g.player.genetic, state: g.state, mate: g.lineage.actionCounts.mate };
    `) as any;
    expect(leap.skipped).toBeFalsy();
    expect(leap.babies).toBeGreaterThanOrEqual(1);
    expect(leap.mate).toBe(1);
    expect(leap.advanced).toBeGreaterThan(100_000);
    expect(leap.feats).toBeGreaterThanOrEqual(2);
    expect(leap.state).toBe('playing');
  });

  test('save, continue and death flow', async ({ page }) => {
    await startGame(page);
    const before = await run(page, `
      api.giveItem('stick', 'right'); api.addEnergy(77); api.recordAction('walk', 60); api.unlock('mot_balance');
      const c = g.controller; api.teleport(c.position.x + 30, c.position.z + 10); step(5);
      api.save(); return { pos: [...g.controller.position.toArray()], energy: g.lineage.neuronalEnergy, name: g.player.name, day: g.clock.dayCount, discoveries: g.lineage.discoveries.length };
    `) as any;
    await page.goto('/');
    await page.waitForFunction(() => !!window.game);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 90_000 });
    const after = await run(page, `step(5); return { pos: [...g.controller.position.toArray()], energy: g.lineage.neuronalEnergy, name: g.player.name, held: g.player.held.right, neurons: g.player.neurons, animals: g.world.animals.length };`) as any;
    expect(after.name).toBe(before.name);
    expect(Math.abs(after.pos[0] - before.pos[0])).toBeLessThan(0.5);
    expect(after.energy).toBe(before.energy);
    expect(after.held).toBe('stick');
    expect(after.neurons).toContain('mot_balance');
    expect(after.animals).toBeGreaterThan(50);
    await run(page, `api.setStat('health', 1); api.applyCondition('bleeding'); step(120);`);
    await page.waitForFunction(() => window.game.state === 'dead', null, { timeout: 15_000 });
    await expect(page.getByText('has died')).toBeVisible({ timeout: 10_000 });
    const cards = page.locator('.card[data-id]');
    await expect(cards.first()).toBeVisible();
    await cards.first().click();
    await page.waitForFunction(() => window.game.state === 'playing');
    const s = await snap(page);
    expect(s.player.state).not.toBe('dead');
    expect(s.player.stats.health).toBeGreaterThan(0);
  });

  test('pause menu, help and quit to menu', async ({ page }) => {
    await startGame(page);
    await run(page, `api.press('pause'); step(2); api.release('pause'); step(2);`);
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Controls' }).click();
    await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    expect(await page.evaluate(() => window.game.state)).toBe('playing');
    await run(page, `api.press('pause'); step(2); api.release('pause'); step(2);`);
    await page.getByRole('button', { name: 'Quit to menu' }).click();
    await expect(page.getByRole('button', { name: 'New Lineage' })).toBeVisible();
  });

  test('day/night cycle and rendering stay healthy without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await startGame(page);
    const r = await run(page, `
      api.setTime(0.95); await sleep(600); const night = g.world.sky.sun.intensity;
      api.setTime(0.5); await sleep(600); const day = g.world.sky.sun.intensity;
      const info = g.renderer.info.render;
      return { night, day, calls: info.calls, tris: info.triangles };
    `) as any;
    expect(r.night).toBeLessThan(0.2);
    expect(r.day).toBeGreaterThan(2);
    expect(r.calls).toBeGreaterThan(10);
    expect(r.tris).toBeGreaterThan(10_000);
    expect(errors).toEqual([]);
  });
  test('settings menu changes quality, volume and sensitivity and persists', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.game);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.locator('[data-k=quality]').selectOption('low');
    await page.locator('[data-k=volume]').fill('0.3');
    await page.locator('[data-k=sensitivity]').fill('1.5');
    await page.locator('[data-k=invertY]').check();
    const applied = await page.evaluate(() => ({ ...window.game.settings, volume: window.game.audio.volume, shadows: window.game.renderer.shadowMap.enabled }));
    expect(applied.quality).toBe('low');
    expect(applied.volume).toBeCloseTo(0.3);
    expect(applied.sensitivity).toBeCloseTo(1.5);
    expect(applied.invertY).toBe(true);
    expect(applied.shadows).toBe(false);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'New Lineage' })).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => !!window.game);
    const persisted = await page.evaluate(() => window.game.settings);
    expect(persisted).toMatchObject({ quality: 'low', sensitivity: 1.5, invertY: true });
    await startGame(page);
    const ctrl = await page.evaluate(() => ({ s: window.game.controller.sensitivity, inv: window.game.controller.invertY, tree: window.game.world.veg.treeDistance }));
    expect(ctrl.s).toBeCloseTo(1.5);
    expect(ctrl.inv).toBe(true);
  });
  test('language switch to Russian applies immediately, persists, and switches back', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.game);
    await expect(page.getByRole('button', { name: 'New Lineage' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('[data-k=lang]').selectOption('ru');
    await expect(page.getByRole('heading', { name: ru['settings.title'] })).toBeVisible();
    await page.getByRole('button', { name: ru['settings.done'] }).click();
    await expect(page.locator('.screen [data-a=new]')).toHaveText(ru['menu.new']);
    await expect(page.locator('.screen [data-a=help]')).toHaveText(ru['menu.help']);
    await page.reload();
    await page.waitForFunction(() => !!window.game);
    await expect(page.locator('.screen [data-a=new]')).toHaveText(ru['menu.new']);
    expect(await page.evaluate(() => localStorage.getItem('human-odyssey-lang'))).toBe('ru');
    await page.locator('.screen [data-a=settings]').click();
    await page.locator('[data-k=lang]').selectOption('en');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'New Lineage' })).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => !!window.game);
    await expect(page.getByRole('button', { name: 'New Lineage' })).toBeVisible();
  });
  test('landmarks exist, can be identified and appear on the map', async ({ page }) => {
    await startGame(page);
    const r = await run(page, `
      const lm = g.world.landmarks; if (!lm.length) return { count: 0 };
      const l = lm[0];
      api.teleport(l.position.x + 6, l.position.z); api.face(l.position.x, l.position.z); step(5);
      api.press('intelligence'); step(10);
      const focus = g.intel.focus?.target.defId ?? null;
      g.input.mouseButtons[0] = true; step(60); g.input.mouseButtons[0] = false; api.release('intelligence'); step(5);
      const known = g.lineage.discoveries.filter(d => d.startsWith('landmark:'));
      g.openPanel('map'); await sleep(100);
      const mapOpen = !!document.querySelector('.map-canvas');
      g.resume();
      return { count: lm.length, ids: lm.map(x => x.def.id), focus, known, mapOpen, energy: g.lineage.neuronalEnergy, dopamine: g.player.dopamine };
    `) as any;
    expect(r.count).toBeGreaterThanOrEqual(5);
    expect(r.focus).toMatch(/^landmark:/);
    expect(r.known.length).toBe(1);
    expect(r.energy).toBeGreaterThan(60);
    expect(r.mapOpen).toBe(true);
  });
  test('procedural audio engine initialises and plays effects without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startGame(page);
    const r = await run(page, `
      g.audio.init(); g.audio.resume();
      for (const n of ['pickup', 'eat', 'discover', 'unlock', 'hit', 'hurt', 'roar', 'call', 'evolve', 'heartbeat']) g.audio.play(n, 0.5);
      g.audio.update(0.1, { night: 1, rain: 0.5, fear: 80, inJungle: 1, underwater: false, timeScale: 1 });
      await sleep(300);
      return { ctx: !!g.audio.ctx, state: g.audio.ctx?.state ?? null, volume: g.audio.volume };
    `) as any;
    expect(r.ctx).toBe(true);
    expect(['running', 'suspended']).toContain(r.state);
    expect(errors).toEqual([]);
  });
});
