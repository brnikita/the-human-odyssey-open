import { describe, it, expect } from 'vitest';
import { createHominid } from '@/entities/hominidFactory';
import { ITEMS } from '@/data/items';
import type { HominidData } from '@/core/types';
import {
  DEFAULT_MODS,
  SURVIVAL_RATES,
  applyCondition,
  applyDamage,
  consume,
  cureCondition,
  drinkWater,
  hasCondition,
  sleep,
  speedMultiplierFromConditions,
  statPercent,
  tickSurvival,
  type SurvivalEvent,
  type SurvivalModifiers,
} from '@/systems/survival';

const mods = (over: Partial<SurvivalModifiers> = {}): SurvivalModifiers => ({ ...DEFAULT_MODS, ...over });
const make = (over: Partial<HominidData> = {}): HominidData => createHominid({ id: 'h', ...over });
const has = (events: SurvivalEvent[], type: SurvivalEvent['type'], id?: string) =>
  events.some((e) => e.type === type && (id === undefined || ('id' in e && e.id === id)));

/** mulberry32 seeded rng */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('survival: drains', () => {
  it('drains hunger, thirst and energy at base rates while awake', () => {
    const h = make();
    tickSurvival(h, 10, mods());
    expect(h.stats.hunger).toBeCloseTo(96.5, 5);
    expect(h.stats.thirst).toBeCloseTo(95, 5);
    expect(h.stats.energy).toBeCloseTo(98, 5);
    expect(h.stats.health).toBe(100); // regen clamps at max
  });

  it('running multiplies drains by 2.2', () => {
    const h = make();
    tickSurvival(h, 10, mods({ isRunning: true }));
    expect(h.stats.hunger).toBeCloseTo(100 - 0.35 * 2.2 * 10, 5);
    expect(h.stats.thirst).toBeCloseTo(100 - 0.5 * 2.2 * 10, 5);
    expect(h.stats.energy).toBeCloseTo(100 - 0.2 * 2.2 * 10, 5);
  });

  it('climbing and swimming use their own multipliers', () => {
    const c = make();
    tickSurvival(c, 10, mods({ isClimbing: true }));
    expect(c.stats.hunger).toBeCloseTo(100 - 0.35 * 1.8 * 10, 5);
    const s = make();
    tickSurvival(s, 10, mods({ isSwimming: true }));
    expect(s.stats.hunger).toBeCloseTo(100 - 0.35 * 2 * 10, 5);
  });

  it('metabolismMult and statMult scale the drains', () => {
    const h = make();
    tickSurvival(h, 10, mods({ metabolismMult: 0.5, statMult: { thirst: 0.5 } }));
    expect(h.stats.hunger).toBeCloseTo(100 - 0.35 * 0.5 * 10, 5);
    expect(h.stats.thirst).toBeCloseTo(100 - 0.5 * 0.5 * 0.5 * 10, 5);
  });

  it('sleeping restores energy and halves the other drains', () => {
    const h = make({ stats: { health: 100, energy: 20, hunger: 100, thirst: 100 } });
    tickSurvival(h, 10, mods({ isSleeping: true, isRunning: true }));
    expect(h.stats.energy).toBeCloseTo(50, 5);
    expect(h.stats.hunger).toBeCloseTo(100 - 0.35 * 0.5 * 10, 5);
    expect(h.stats.thirst).toBeCloseTo(100 - 0.5 * 0.5 * 10, 5);
  });

  it('is robust to large dt (sub-steps internally)', () => {
    const a = make();
    const b = make();
    tickSurvival(a, 600, mods());
    for (let i = 0; i < 1200; i++) tickSurvival(b, 0.5, mods());
    expect(a.stats.hunger).toBeCloseTo(b.stats.hunger, 6);
    expect(a.stats.thirst).toBeCloseTo(b.stats.thirst, 6);
    expect(a.stats.energy).toBeCloseTo(b.stats.energy, 6);
    expect(a.stats.thirst).toBe(0); // 100 / 0.5 = 200s to empty
  });

  it('ignores zero, negative and NaN dt', () => {
    const h = make();
    expect(tickSurvival(h, 0, mods())).toEqual([]);
    expect(tickSurvival(h, -5, mods())).toEqual([]);
    expect(tickSurvival(h, NaN, mods())).toEqual([]);
    expect(h.stats.hunger).toBe(100);
  });
});

describe('survival: starvation, dehydration, death', () => {
  it('emits starving once when hunger reaches 0 and drains health', () => {
    const h = make({ stats: { health: 100, energy: 100, hunger: 1, thirst: 100 } });
    const events = tickSurvival(h, 10, mods());
    expect(events.filter((e) => e.type === 'starving')).toHaveLength(1);
    expect(h.stats.hunger).toBe(0);
    expect(h.stats.health).toBeLessThan(100);
    // no further 'starving' event while still starving
    expect(tickSurvival(h, 5, mods()).some((e) => e.type === 'starving')).toBe(false);
  });

  it('drains health at 1.5/s each for hunger and thirst at 0', () => {
    const h = make({ stats: { health: 100, energy: 100, hunger: 0, thirst: 0 } });
    tickSurvival(h, 10, mods());
    expect(h.stats.health).toBeCloseTo(70, 5);
    const d = make({ stats: { health: 100, energy: 100, hunger: 100, thirst: 0 } });
    const events = tickSurvival(d, 10, mods());
    expect(events.some((e) => e.type === 'dehydrated')).toBe(false); // already at 0: no crossing
    expect(d.stats.health).toBeCloseTo(85, 5);
  });

  it('dies when health reaches 0 with a cause and stops ticking afterwards', () => {
    const h = make({ stats: { health: 5, energy: 100, hunger: 0, thirst: 100 } });
    const events = tickSurvival(h, 30, mods());
    const died = events.find((e) => e.type === 'died');
    expect(died).toBeDefined();
    expect(died && died.type === 'died' && died.cause).toBe('starvation');
    expect(h.state).toBe('dead');
    expect(h.stats.health).toBe(0);
    expect(events.filter((e) => e.type === 'died')).toHaveLength(1);
    expect(tickSurvival(h, 10, mods())).toEqual([]);
  });

  it('attributes death to bleeding when that is the dominant damage', () => {
    const h = make({ stats: { health: 3, energy: 100, hunger: 100, thirst: 100 } });
    applyCondition(h, 'bleeding', 1);
    const events = tickSurvival(h, 20, mods());
    const died = events.find((e) => e.type === 'died');
    expect(died && died.type === 'died' && died.cause).toBe('bleeding');
  });
});

describe('survival: conditions', () => {
  it('applyCondition adds once and raises severity to the max on repeat', () => {
    const h = make();
    expect(applyCondition(h, 'bleeding', 0.3)).toBe(true);
    expect(applyCondition(h, 'bleeding', 0.8)).toBe(false);
    expect(applyCondition(h, 'bleeding', 0.1)).toBe(false);
    expect(h.conditions).toHaveLength(1);
    expect(h.conditions[0].severity).toBe(0.8);
    expect(cureCondition(h, 'bleeding')).toBe(true);
    expect(cureCondition(h, 'bleeding')).toBe(false);
    expect(h.conditions).toHaveLength(0);
  });

  it('bleeding drains health proportional to severity, blocks regen and slowly worsens', () => {
    const h = make({ stats: { health: 90, energy: 100, hunger: 100, thirst: 100 } });
    applyCondition(h, 'bleeding', 0.5);
    tickSurvival(h, 10, mods());
    expect(h.stats.health).toBeCloseTo(90 - 1.2 * 0.5 * 10 - 1.2 * 0.5 * 0.005 * 10 * 10 * 0.5, 0);
    expect(h.stats.health).toBeLessThan(85);
    expect(h.conditions[0].severity).toBeGreaterThan(0.5);
    const events = tickSurvival(h, 60, mods());
    expect(has(events, 'condition_worsened', 'bleeding')).toBe(true);
  });

  it('poison drains health and decays away naturally', () => {
    const h = make({ stats: { health: 100, energy: 100, hunger: 100, thirst: 100 } });
    applyCondition(h, 'poisoned', 0.5);
    tickSurvival(h, 10, mods());
    expect(h.stats.health).toBeLessThan(100);
    expect(hasCondition(h, 'poisoned')).toBe(true);
    const events = tickSurvival(h, 100, mods());
    expect(hasCondition(h, 'poisoned')).toBe(false);
    expect(has(events, 'condition_cured', 'poisoned')).toBe(true);
  });

  it('fracture halves speed and heals after 400s', () => {
    const h = make();
    applyCondition(h, 'fractured');
    expect(speedMultiplierFromConditions(h)).toBe(0.5);
    const fed = mods({ metabolismMult: 0 }); // keep it alive for 400s without eating
    tickSurvival(h, 399, fed);
    expect(hasCondition(h, 'fractured')).toBe(true);
    expect(h.state).toBe('idle');
    const events = tickSurvival(h, 2, fed);
    expect(hasCondition(h, 'fractured')).toBe(false);
    expect(has(events, 'condition_cured', 'fractured')).toBe(true);
    expect(speedMultiplierFromConditions(h)).toBe(1);
  });

  it('speed multiplier stacks conditions and is 0 when dead', () => {
    const h = make();
    applyCondition(h, 'fractured');
    applyCondition(h, 'exhausted');
    expect(speedMultiplierFromConditions(h)).toBeCloseTo(0.35, 5);
    h.state = 'dead';
    expect(speedMultiplierFromConditions(h)).toBe(0);
  });

  it('cold sets in after 20s of rain without fire, drains energy, and dries off', () => {
    const h = make();
    let events = tickSurvival(h, 15, mods({ isRaining: true }));
    expect(hasCondition(h, 'cold')).toBe(false);
    events = tickSurvival(h, 10, mods({ isRaining: true }));
    expect(hasCondition(h, 'cold')).toBe(true);
    expect(has(events, 'condition_added', 'cold')).toBe(true);
    const energyBefore = h.stats.energy;
    tickSurvival(h, 10, mods({ isRaining: true }));
    expect(energyBefore - h.stats.energy).toBeGreaterThan(0.2 * 10); // more than base drain
    events = tickSurvival(h, 25, mods({ isRaining: false }));
    expect(hasCondition(h, 'cold')).toBe(false);
    expect(has(events, 'condition_cured', 'cold')).toBe(true);
  });

  it('a fire prevents cold and kapok fiber cures it', () => {
    const h = make();
    tickSurvival(h, 60, mods({ isRaining: true, nearFire: true }));
    expect(hasCondition(h, 'cold')).toBe(false);
    applyCondition(h, 'cold');
    const r = consume(h, ITEMS.kapok_fiber, mods(), () => 0.5);
    expect(r.healed).toEqual(['cold']);
    expect(hasCondition(h, 'cold')).toBe(false);
  });

  it('exhaustion sets in at 0 energy, drains health, and lifts once energy > 30', () => {
    const h = make({ stats: { health: 100, energy: 1, hunger: 100, thirst: 100 } });
    let events = tickSurvival(h, 10, mods());
    expect(h.stats.energy).toBe(0);
    expect(has(events, 'exhausted')).toBe(true);
    expect(has(events, 'condition_added', 'exhausted')).toBe(true);
    expect(hasCondition(h, 'exhausted')).toBe(true);
    // health drains slowly even while fed (regen 0.4 > exhausted 0.3 so net is positive but below max)
    events = sleep(h, 20, mods());
    expect(h.stats.energy).toBeGreaterThan(30);
    expect(hasCondition(h, 'exhausted')).toBe(false);
    expect(has(events, 'condition_cured', 'exhausted')).toBe(true);
  });

  it('regenerates health only when fed, hydrated and not bleeding/poisoned', () => {
    const ok = make({ stats: { health: 50, energy: 100, hunger: 100, thirst: 100 } });
    tickSurvival(ok, 10, mods());
    expect(ok.stats.health).toBeCloseTo(54, 3);

    const hungry = make({ stats: { health: 50, energy: 100, hunger: 40, thirst: 100 } });
    tickSurvival(hungry, 10, mods());
    expect(hungry.stats.health).toBe(50);

    const poisoned = make({ stats: { health: 50, energy: 100, hunger: 100, thirst: 100 } });
    applyCondition(poisoned, 'poisoned', 0.5);
    tickSurvival(poisoned, 10, mods());
    expect(poisoned.stats.health).toBeLessThan(50);
  });
});

describe('survival: damage', () => {
  it('applyDamage reduces health, inflicts conditions and reports death', () => {
    const h = make();
    expect(applyDamage(h, 30, 'bleeding', 0.7)).toBe(false);
    expect(h.stats.health).toBe(70);
    expect(h.conditions[0]).toMatchObject({ id: 'bleeding', severity: 0.7 });
    expect(applyDamage(h, 70)).toBe(true);
    expect(h.state).toBe('dead');
    expect(h.stats.health).toBe(0);
    expect(applyDamage(h, 10)).toBe(false); // already dead
  });
});

describe('survival: consumption', () => {
  it('applies nutrition and clamps to max stats', () => {
    const h = make({ stats: { health: 100, energy: 100, hunger: 95, thirst: 50 } });
    const r = consume(h, ITEMS.coconut_open, mods(), () => 0.5);
    expect(h.stats.hunger).toBe(100);
    expect(h.stats.thirst).toBe(80);
    expect(r.poisoned).toBe(false);
    expect(r.events).toEqual([]);
  });

  it('cures conditions listed on the item', () => {
    const h = make();
    applyCondition(h, 'bleeding');
    const r = consume(h, ITEMS.horsetail, mods(), () => 0.5);
    expect(r.healed).toEqual(['bleeding']);
    expect(has(r.events, 'condition_cured', 'bleeding')).toBe(true);
    expect(hasCondition(h, 'bleeding')).toBe(false);
    // curing an absent condition reports nothing
    expect(consume(make(), ITEMS.natal_grass, mods(), () => 0.5).healed).toEqual([]);
  });

  it('rolls toxicity against rng', () => {
    const safe = make();
    expect(consume(safe, ITEMS.berry, mods(), () => 0.99).poisoned).toBe(false);
    const unlucky = make();
    const r = consume(unlucky, ITEMS.berry, mods(), () => 0.01);
    expect(r.poisoned).toBe(true);
    expect(has(r.events, 'condition_added', 'poisoned')).toBe(true);
    expect(hasCondition(unlucky, 'poisoned')).toBe(true);
  });

  it('raw meat is safe with eat_meat_raw and toxicity scales with metabolism', () => {
    const h = make();
    const m = mods({ hasAbility: (a) => a === 'eat_meat_raw' });
    expect(consume(h, ITEMS.meat, m, () => 0).poisoned).toBe(false);
    // ability does not protect against berries
    expect(consume(h, ITEMS.berry, m, () => 0).poisoned).toBe(true);
    // metabolism 0.5: mushroom chance 0.25 -> rng 0.3 is safe, rng 0.2 is not
    expect(consume(make(), ITEMS.mushroom, mods({ metabolismMult: 0.5 }), () => 0.3).poisoned).toBe(false);
    expect(consume(make(), ITEMS.mushroom, mods({ metabolismMult: 0.5 }), () => 0.2).poisoned).toBe(true);
  });

  it('seeded rng gives statistically plausible poisoning for mushrooms (~50%)', () => {
    const rng = seeded(1234);
    let poisoned = 0;
    const N = 400;
    for (let i = 0; i < N; i++) if (consume(make(), ITEMS.mushroom, mods(), rng).poisoned) poisoned++;
    expect(poisoned / N).toBeGreaterThan(0.4);
    expect(poisoned / N).toBeLessThan(0.6);
  });

  it('drinkWater restores 35 thirst and reports the amount restored', () => {
    const h = make({ stats: { health: 100, energy: 100, hunger: 100, thirst: 50 } });
    expect(drinkWater(h, mods())).toBe(35);
    expect(h.stats.thirst).toBe(85);
    expect(drinkWater(h)).toBe(15);
    expect(h.stats.thirst).toBe(100);
  });

  it('sleep restores energy fully within about a minute', () => {
    const h = make({ stats: { health: 100, energy: 0, hunger: 100, thirst: 100 } });
    sleep(h, 60, mods({ isRunning: true }));
    expect(h.stats.energy).toBe(100);
    expect(h.stats.hunger).toBeCloseTo(100 - SURVIVAL_RATES.hungerDrain * 0.5 * 60, 5);
  });

  it('statPercent normalizes by max stats', () => {
    const h = make({ stats: { health: 25, energy: 100, hunger: 100, thirst: 100 } });
    expect(statPercent(h, 'health')).toBe(0.25);
    expect(statPercent(h, 'energy')).toBe(1);
    h.maxStats.thirst = 0;
    expect(statPercent(h, 'thirst')).toBe(0);
  });

  it('dead hominids cannot eat or drink', () => {
    const h = make({ state: 'dead', stats: { health: 0, energy: 0, hunger: 0, thirst: 0 } });
    expect(consume(h, ITEMS.banana, mods(), () => 0.5).events).toEqual([]);
    expect(h.stats.hunger).toBe(0);
    expect(drinkWater(h)).toBe(0);
  });
});
