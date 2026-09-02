import { describe, it, expect, beforeAll } from 'vitest';
import { Terrain, WATER_LEVEL } from '@/world/terrain';
import { Vegetation } from '@/world/vegetation';
import { HominidRig } from '@/render/models';
import { PlayerController, type MoveModifiers } from '@/systems/controller';
import { Input } from '@/core/input';

const MODS: MoveModifiers = { speed: 1, climb: 1, canSwim: true, canDive: false, bipedal: false, longJump: false, fastClimb: false, stageSpeed: 1, conditionSpeed: 1, fearSlow: 1 };

let terrain: Terrain;
let veg: Vegetation;

function makeController() {
  const rig = new HominidRig();
  return new PlayerController(terrain, veg, rig);
}

function findFlatLand(): { x: number; z: number } {
  for (let r = 20; r < 500; r += 10) {
    for (let a = 0; a < 16; a++) {
      const x = Math.cos((a / 16) * Math.PI * 2) * r, z = 100 + Math.sin((a / 16) * Math.PI * 2) * r;
      const s = terrain.sample(x, z);
      if (s.height > 3 && s.slope < 0.08 && !veg.nearestClimbable(x, z, 4)) return { x, z };
    }
  }
  throw new Error('no flat land');
}

function step(c: PlayerController, input: Input, n: number, dt = 1 / 60) {
  const events: ReturnType<PlayerController['update']> = [];
  for (let i = 0; i < n; i++) { events.push(...c.update(dt, input, MODS, true)); input.endFrame(); }
  return events;
}

describe('PlayerController', () => {
  beforeAll(() => {
    terrain = new Terrain(11);
    veg = new Vegetation(terrain, 11);
  });

  it('stays on the ground and walks in the camera direction', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const p = findFlatLand();
    c.teleport(p.x, p.z);
    c.camYaw = 0; // forward = +z
    input.press('forward');
    const ev = step(c, input, 120);
    expect(c.position.z - p.z).toBeGreaterThan(4);
    expect(Math.abs(c.position.x - p.x)).toBeLessThan(1);
    expect(Math.abs(c.position.y - terrain.heightAt(c.position.x, c.position.z))).toBeLessThan(0.2);
    expect(c.state).toBe('walk');
    expect(ev.filter((e) => e.type === 'step').length).toBeGreaterThan(2);
    input.release('forward');
    step(c, input, 60);
    expect(c.state).toBe('idle');
  });

  it('runs faster than walking', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const p = findFlatLand();
    c.teleport(p.x, p.z); c.camYaw = 0;
    input.press('forward'); step(c, input, 120); const walkZ = c.position.z - p.z;
    c.teleport(p.x, p.z);
    input.press('run'); step(c, input, 120); const runZ = c.position.z - p.z;
    expect(runZ).toBeGreaterThan(walkZ * 1.5);
    expect(c.state).toBe('run');
  });

  it('jumps, is airborne, then lands with a land event', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const p = findFlatLand();
    c.teleport(p.x, p.z);
    input.press('jump');
    const first = step(c, input, 1);
    input.release('jump');
    expect(first.some((e) => e.type === 'jump')).toBe(true);
    expect(c.grounded).toBe(false);
    let maxY = 0;
    const ev: string[] = [];
    for (let i = 0; i < 120; i++) { for (const e of c.update(1 / 60, input, MODS, true)) ev.push(e.type); input.endFrame(); maxY = Math.max(maxY, c.position.y - terrain.heightAt(c.position.x, c.position.z)); }
    expect(maxY).toBeGreaterThan(0.8);
    expect(ev).toContain('land');
    expect(c.grounded).toBe(true);
  });

  it('climbs a tree trunk, reaches the canopy and drops down', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const tree = veg.climbables.filter((t) => t.height > 6).sort((a, b) => b.height - a.height)[0];
    c.teleport(tree.position.x + tree.radius + 0.6, tree.position.z);
    input.press('jump');
    const ev = step(c, input, 2);
    input.release('jump');
    expect(ev.some((e) => e.type === 'climb_start')).toBe(true);
    expect(c.isClimbing).toBe(true);
    input.press('forward');
    let reached = false;
    for (let i = 0; i < 60 * 12 && !reached; i++) { for (const e of c.update(1 / 60, input, MODS, true)) if (e.type === 'canopy') reached = true; input.endFrame(); }
    input.release('forward');
    step(c, input, 5);
    expect(reached).toBe(true);
    expect(c.canopy).toBe(tree);
    expect(c.position.y - tree.position.y).toBeGreaterThan(tree.height - 1);
    // drop with ctrl: begins climbing down from the canopy
    input.press('down');
    step(c, input, 2);
    input.release('down');
    expect(c.isClimbing).toBe(true);
  });

  it('swims in deep water at the surface and reports drowning without the ability', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    let wp: { x: number; z: number } | null = null;
    for (let z = -500; z < 500 && !wp; z += 5) for (let x = -500; x < 500 && !wp; x += 5) if (terrain.heightAt(x, z) < WATER_LEVEL - 3) wp = { x, z };
    expect(wp).not.toBeNull();
    c.teleport(wp!.x, wp!.z);
    const ev = step(c, input, 60);
    expect(ev.some((e) => e.type === 'swim_start')).toBe(true);
    expect(c.state).toBe('swim');
    expect(c.position.y).toBeCloseTo(WATER_LEVEL - 0.55, 0);
    const noSwim = { ...MODS, canSwim: false };
    let drown = 0;
    for (let i = 0; i < 60 * 5; i++) { for (const e of c.update(1 / 60, input, noSwim, true)) if (e.type === 'drown_tick') drown++; input.endFrame(); }
    expect(drown).toBeGreaterThan(0);
  });

  it('locks movement during timed actions and reports attack hits', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const p = findFlatLand();
    c.teleport(p.x, p.z);
    c.startAction('attack', 0.6);
    expect(c.isBusy).toBe(true);
    input.press('forward');
    const ev = step(c, input, 40);
    expect(ev.some((e) => e.type === 'attack_hit')).toBe(true);
    expect(c.isBusy).toBe(false);
    expect(Math.hypot(c.position.x - p.x, c.position.z - p.z)).toBeLessThan(0.5);
  });

  it('keeps the camera above the terrain and behind the character', () => {
    const c = makeController();
    const input = new Input(document.createElement('div'));
    const p = findFlatLand();
    c.teleport(p.x, p.z);
    step(c, input, 5);
    const { PerspectiveCamera } = require('three') as typeof import('three');
    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    for (let i = 0; i < 60; i++) c.updateCamera(cam, 1 / 60, { intel: false, fov: 60 });
    expect(cam.position.y).toBeGreaterThan(terrain.heightAt(cam.position.x, cam.position.z) + 0.4);
    expect(cam.position.distanceTo(c.position)).toBeGreaterThan(2);
    expect(cam.position.distanceTo(c.position)).toBeLessThan(15);
  });
});
