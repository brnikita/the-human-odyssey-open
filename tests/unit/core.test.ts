import { describe, it, expect, beforeEach } from 'vitest';
import { GameClock, DAY_LENGTH_SECONDS } from '@/core/clock';
import { EventBus } from '@/core/events';
import { Input } from '@/core/input';
import { writeSave, readSave, hasSave, clearSave, SAVE_VERSION } from '@/core/save';
import { SimplexNoise, smoothstep, clamp, lerp } from '@/world/noise';
import { createLineage } from '@/systems/evolution';
import type { SaveGame } from '@/core/types';

describe('GameClock', () => {
  it('advances time of day and wraps into a new day', () => {
    const c = new GameClock();
    c.timeOfDay = 0.9;
    c.advance(DAY_LENGTH_SECONDS * 0.2);
    expect(c.dayCount).toBe(2);
    expect(c.timeOfDay).toBeCloseTo(0.1, 5);
  });
  it('respects time scale and reports night', () => {
    const c = new GameClock();
    c.timeOfDay = 0.5; c.timeScale = 0.5;
    c.advance(DAY_LENGTH_SECONDS * 0.2);
    expect(c.timeOfDay).toBeCloseTo(0.6, 5);
    expect(c.isNight).toBe(false);
    c.timeOfDay = 0.1;
    expect(c.isNight).toBe(true);
    expect(c.hourLabel).toBe('02:24');
  });
  it('skip moves by a fraction of a day', () => {
    const c = new GameClock();
    c.timeOfDay = 0.3;
    c.skip(0.25);
    expect(c.timeOfDay).toBeCloseTo(0.55, 5);
  });
});

describe('EventBus', () => {
  it('delivers events and supports unsubscribe', () => {
    const bus = new EventBus();
    const got: string[] = [];
    const off = bus.on('notify', (p) => got.push(p.text));
    bus.emit('notify', { text: 'a' });
    off();
    bus.emit('notify', { text: 'b' });
    expect(got).toEqual(['a']);
  });
});

describe('Input', () => {
  let el: HTMLElement;
  let input: Input;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    input = new Input(el);
  });
  it('maps key codes to actions with press/release edges', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.isDown('forward')).toBe(true);
    expect(input.justPressed('forward')).toBe(true);
    input.endFrame();
    expect(input.justPressed('forward')).toBe(false);
    expect(input.isDown('forward')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(input.isDown('forward')).toBe(false);
    expect(input.justReleased('forward')).toBe(true);
  });
  it('supports programmatic injection and mouse clicks', () => {
    input.press('jump');
    expect(input.justPressed('jump')).toBe(true);
    input.clickMouse(0);
    expect(input.mouseJustPressed(0)).toBe(true);
    input.endFrame();
    expect(input.mouseJustPressed(0)).toBe(false);
    input.release('jump');
    expect(input.isDown('jump')).toBe(false);
  });
  it('clears everything on blur', () => {
    input.press('run');
    window.dispatchEvent(new Event('blur'));
    expect(input.isDown('run')).toBe(false);
  });
});

describe('Save', () => {
  const sample = (): SaveGame => ({
    version: SAVE_VERSION, timestamp: 1, worldSeed: 7, timeOfDay: 0.4, dayCount: 3,
    lineage: createLineage(), clan: { members: [], settlement: { x: 0, y: 0, z: 0 }, playerId: '' },
    items: [], animals: [], harvested: [],
  });
  beforeEach(() => clearSave());
  it('round-trips through localStorage', () => {
    expect(hasSave()).toBe(false);
    expect(writeSave(sample())).toBe(true);
    expect(hasSave()).toBe(true);
    expect(readSave()?.worldSeed).toBe(7);
  });
  it('rejects saves from another version', () => {
    const s = sample(); s.version = 999;
    writeSave(s);
    expect(readSave()).toBeNull();
  });
});

describe('SimplexNoise', () => {
  it('is deterministic per seed and bounded', () => {
    const a = new SimplexNoise(5), b = new SimplexNoise(5), c = new SimplexNoise(6);
    let min = 1, max = -1, diff = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37, y = i * 0.11;
      const v = a.noise2D(x, y);
      expect(v).toBe(b.noise2D(x, y));
      if (v !== c.noise2D(x, y)) diff++;
      min = Math.min(min, v); max = Math.max(max, v);
      const f = a.fbm(x, y);
      expect(f).toBeGreaterThanOrEqual(-1); expect(f).toBeLessThanOrEqual(1);
      const r = a.ridged(x, y);
      expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1);
    }
    expect(min).toBeGreaterThanOrEqual(-1); expect(max).toBeLessThanOrEqual(1);
    expect(diff).toBeGreaterThan(400);
  });
  it('math helpers behave', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});
