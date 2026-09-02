import { describe, it, expect } from 'vitest';
import { createHominid } from '@/entities/hominidFactory';
import type { HominidData } from '@/core/types';
import {
  DEFAULT_FEAR_CONTEXT,
  addDopamine,
  applyOvercomeResult,
  collectLight,
  discoveryDopamine,
  getPanicState,
  isPanicking,
  startOvercome,
  tickFear,
  tickOvercome,
  type FearContext,
} from '@/systems/fear';

const ctx = (over: Partial<FearContext> = {}): FearContext => ({ ...DEFAULT_FEAR_CONTEXT, ...over });
const make = (over: Partial<HominidData> = {}): HominidData => createHominid({ id: 'h', dopamine: 30, ...over });

describe('fear: accumulation and decay', () => {
  it('rises 2.5/s in unknown areas', () => {
    const h = make();
    tickFear(h, 10, ctx({ inUnknownArea: true }));
    expect(h.fear).toBeCloseTo(25, 5);
  });

  it('applies night, predator and clan multipliers', () => {
    const night = make();
    tickFear(night, 10, ctx({ inUnknownArea: true, isNight: true }));
    expect(night.fear).toBeCloseTo(40, 5);

    const predator = make();
    tickFear(predator, 10, ctx({ inUnknownArea: true, nearPredator: true }));
    expect(predator.fear).toBeCloseTo(37.5, 5);

    const clan = make();
    tickFear(clan, 10, ctx({ inUnknownArea: true, withClan: true }));
    expect(clan.fear).toBeCloseTo(17.5, 5);

    const all = make();
    tickFear(all, 10, ctx({ inUnknownArea: true, isNight: true, nearPredator: true, withClan: true, fearMult: 0.5 }));
    expect(all.fear).toBeCloseTo(2.5 * 1.6 * 1.5 * 0.7 * 0.5 * 10, 5);
  });

  it('high dopamine (>= 70) reduces fear rise by 40%', () => {
    const h = make({ dopamine: 80 });
    tickFear(h, 10, ctx({ inUnknownArea: true }));
    expect(h.fear).toBeCloseTo(15, 5);
  });

  it('decays 4/s in known areas and clamps to 0', () => {
    const h = make({ fear: 50 });
    tickFear(h, 10, ctx());
    expect(h.fear).toBeCloseTo(10, 5);
    tickFear(h, 10, ctx());
    expect(h.fear).toBe(0);
  });

  it('a predator in known territory still raises fear (half rate)', () => {
    const h = make();
    tickFear(h, 10, ctx({ nearPredator: true }));
    expect(h.fear).toBeCloseTo(2.5 * 1.5 * 0.5 * 10, 5);
  });

  it('clamps fear at 100 and ignores dead hominids', () => {
    const h = make({ fear: 95 });
    tickFear(h, 100, ctx({ inUnknownArea: true }));
    expect(h.fear).toBe(100);
    const dead = make({ fear: 10, state: 'dead' });
    expect(tickFear(dead, 10, ctx({ inUnknownArea: true }))).toEqual({ panicStarted: false, calmed: false });
    expect(dead.fear).toBe(10);
  });
});

describe('fear: dopamine', () => {
  it('decays 0.5/s toward 30 from both sides without overshooting', () => {
    const high = make({ dopamine: 50 });
    tickFear(high, 10, ctx());
    expect(high.dopamine).toBeCloseTo(45, 5);
    tickFear(high, 100, ctx());
    expect(high.dopamine).toBe(30);

    const low = make({ dopamine: 10 });
    tickFear(low, 10, ctx());
    expect(low.dopamine).toBeCloseTo(15, 5);
    tickFear(low, 100, ctx());
    expect(low.dopamine).toBe(30);
  });

  it('addDopamine clamps to 0..100', () => {
    const h = make({ dopamine: 90 });
    expect(addDopamine(h, 20)).toBe(100);
    expect(addDopamine(h, -150)).toBe(0);
  });

  it('discoveryDopamine returns the tuned values', () => {
    expect(discoveryDopamine('item')).toBe(10);
    expect(discoveryDopamine('plant')).toBe(10);
    expect(discoveryDopamine('animal')).toBe(15);
    expect(discoveryDopamine('area')).toBe(20);
    expect(discoveryDopamine('landmark')).toBe(25);
  });
});

describe('fear: panic', () => {
  it('starts panic once when fear crosses 100 and calms below 60', () => {
    const h = make({ fear: 90 });
    expect(isPanicking(h)).toBe(false);
    let r = tickFear(h, 10, ctx({ inUnknownArea: true }));
    expect(h.fear).toBe(100);
    expect(r.panicStarted).toBe(true);
    expect(isPanicking(h)).toBe(true);

    r = tickFear(h, 1, ctx({ inUnknownArea: true }));
    expect(r.panicStarted).toBe(false); // only once
    expect(getPanicState(h).panic).toBe(true);
    expect(getPanicState(h).timeInPanic).toBeCloseTo(1, 5);

    // Hysteresis: still panicking while fear is between 60 and 100
    r = tickFear(h, 5, ctx());
    expect(h.fear).toBeCloseTo(80, 5);
    expect(r.calmed).toBe(false);
    expect(isPanicking(h)).toBe(true);

    r = tickFear(h, 6, ctx());
    expect(h.fear).toBeCloseTo(56, 5);
    expect(r.calmed).toBe(true);
    expect(isPanicking(h)).toBe(false);
    expect(getPanicState(h).timeInPanic).toBe(0);
  });

  it('isPanicking is true for fear >= 100 even without a tick', () => {
    const h = make({ fear: 100 });
    expect(isPanicking(h)).toBe(true);
  });

  it('can re-enter panic after calming', () => {
    const h = make({ fear: 100 });
    tickFear(h, 0.1, ctx({ inUnknownArea: true }));
    tickFear(h, 20, ctx()); // fear 20 -> calmed
    expect(isPanicking(h)).toBe(false);
    const r = tickFear(h, 40, ctx({ inUnknownArea: true }));
    expect(r.panicStarted).toBe(true);
  });
});

describe('fear: overcome challenge', () => {
  it('starts with 3..5 lights depending on rng and 45s on the clock', () => {
    const h = make({ fear: 100 });
    expect(startOvercome(h, () => 0).lightsNeeded).toBe(3);
    expect(startOvercome(h, () => 0.5).lightsNeeded).toBe(4);
    expect(startOvercome(h, () => 0.99).lightsNeeded).toBe(5);
    expect(startOvercome(h, () => 1).lightsNeeded).toBe(5);
    const ch = startOvercome(h, () => 0);
    expect(ch.found).toBe(0);
    expect(ch.timeLeft).toBe(45);
    expect(ch.status).toBe('active');
  });

  it('succeeds when enough lights are collected before time runs out', () => {
    const ch = startOvercome(make(), () => 0); // needs 3
    expect(collectLight(ch)).toBe(false);
    expect(tickOvercome(ch, 10)).toBe('active');
    expect(collectLight(ch)).toBe(false);
    expect(collectLight(ch)).toBe(true);
    expect(ch.status).toBe('success');
    expect(tickOvercome(ch, 100)).toBe('success'); // stays success
    expect(collectLight(ch)).toBe(true);
    expect(ch.found).toBe(3);
  });

  it('fails when the timer expires', () => {
    const ch = startOvercome(make(), () => 0.99); // needs 5
    collectLight(ch);
    expect(tickOvercome(ch, 44)).toBe('active');
    expect(tickOvercome(ch, 1)).toBe('failed');
    expect(ch.timeLeft).toBe(0);
    expect(collectLight(ch)).toBe(false); // too late
    expect(ch.status).toBe('failed');
  });

  it('applyOvercomeResult resets or maxes fear', () => {
    const win = make({ fear: 100, dopamine: 30 });
    tickFear(win, 0.1, ctx({ inUnknownArea: true }));
    expect(isPanicking(win)).toBe(true);
    applyOvercomeResult(win, true);
    expect(win.fear).toBe(0);
    expect(win.dopamine).toBeCloseTo(70, 5);
    expect(isPanicking(win)).toBe(false);

    const lose = make({ fear: 70 });
    applyOvercomeResult(lose, false);
    expect(lose.fear).toBe(100);
    expect(isPanicking(lose)).toBe(true);
  });
});
