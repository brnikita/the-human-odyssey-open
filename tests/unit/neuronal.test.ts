import { describe, expect, it } from 'vitest';
import type { HominidData, LineageState } from '@/core/types';
import { NEURON_MAP } from '@/data/neurons';
import {
  BASE_ENERGY,
  applyGenerationToNeurons,
  availableNeurons,
  baseModifiers,
  canReinforce,
  canUnlock,
  computeModifiers,
  gainEnergy,
  neuronProgress,
  recordAction,
  reinforceCost,
  reinforceNeuron,
  unlockNeuron,
} from '@/systems/neuronal';

function makeHominid(partial: Partial<HominidData> = {}): HominidData {
  return {
    id: 'h1',
    name: 'Test',
    sex: 'female',
    stage: 'adult',
    ageYears: 25,
    stats: { health: 100, energy: 100, hunger: 100, thirst: 100 },
    maxStats: { health: 100, energy: 100, hunger: 100, thirst: 100 },
    conditions: [],
    position: { x: 0, y: 0, z: 0 },
    state: 'idle',
    held: { left: null, right: null },
    carriedBaby: null,
    isPlayer: true,
    isOutsider: false,
    bond: 1,
    neurons: [],
    reinforced: [],
    genetic: [],
    fear: 0,
    dopamine: 50,
    ...partial,
  };
}

function makeLineage(partial: Partial<LineageState> = {}): LineageState {
  return {
    yearsAgo: 10_000_000,
    generation: 1,
    feats: [],
    actionCounts: {},
    neuronalEnergy: 0,
    discoveries: [],
    areasExplored: [],
    ...partial,
  };
}

describe('computeModifiers', () => {
  it('returns neutral modifiers for no neurons', () => {
    const m = computeModifiers([]);
    const base = baseModifiers();
    expect(m.speed).toBe(1);
    expect(m.climb).toBe(1);
    expect(m.sense).toEqual(base.sense);
    expect(m.abilities.size).toBe(0);
    expect(m.twoHands).toBe(false);
    expect(m.bipedal).toBe(false);
    expect(m.statMult).toEqual({ health: 1, energy: 1, hunger: 1, thirst: 1 });
  });

  it('multiplies stacked multipliers and stat mults', () => {
    const m = computeModifiers(['mot_balance', 'mot_sprint']);
    expect(m.speed).toBeCloseTo(1.08 * 1.12, 10);
    expect(m.statMult.energy).toBeCloseTo(1.1, 10);
    expect(m.statMult.health).toBe(1);
  });

  it('unions abilities and applies sense multipliers', () => {
    const m = computeModifiers(['sen_sight', 'sen_smell', 'sen_hearing']);
    expect(m.abilities.has('identify_smell')).toBe(true);
    expect(m.abilities.has('identify_sound')).toBe(true);
    expect(m.sense.sight).toBeCloseTo(1.3, 10);
    expect(m.sense.smell).toBeCloseTo(1.4, 10);
    expect(m.sense.hearing).toBeCloseTo(1.4, 10);
  });

  it('bipedal implies twoHands and grants both abilities', () => {
    const m = computeModifiers(['mot_bipedal']);
    expect(m.bipedal).toBe(true);
    expect(m.twoHands).toBe(true);
    expect(m.abilities.has('bipedalism')).toBe(true);
    expect(m.abilities.has('use_two_hands')).toBe(true);
    expect(m.speed).toBeCloseTo(1.1, 10);
  });

  it('twoHands neuron sets twoHands without bipedal', () => {
    const m = computeModifiers(['dex_two_hands']);
    expect(m.twoHands).toBe(true);
    expect(m.bipedal).toBe(false);
    expect(m.abilities.has('use_two_hands')).toBe(true);
  });

  it('ignores unknown ids and does not double-apply duplicates', () => {
    const m = computeModifiers(['nope', 'int_courage', 'int_courage']);
    expect(m.fear).toBeCloseTo(0.7, 10);
    const n = computeModifiers(['int_courage', 'int_fearless', 'int_curiosity', 'int_learning', 'dex_counter', 'met_stomach']);
    expect(n.fear).toBeCloseTo(0.7 * 0.4 * 0.9, 10);
    expect(n.neuronGain).toBeCloseTo(1.3, 10);
    expect(n.dodgeWindow).toBeCloseTo(1.2, 10);
    expect(n.metabolism).toBeCloseTo(0.92, 10);
  });
});

describe('canUnlock', () => {
  const ctx = (over: Partial<Parameters<typeof canUnlock>[1]> = {}) => ({
    unlocked: new Set<string>(),
    energy: 1000,
    actionCounts: { walk: 1000, run: 1000 } as Record<string, number>,
    ...over,
  });

  it('rejects unknown ids', () => {
    expect(canUnlock('does_not_exist', ctx())).toEqual({ ok: false, reason: 'unknown' });
  });

  it('rejects already unlocked', () => {
    expect(canUnlock('mot_balance', ctx({ unlocked: new Set(['mot_balance']) }))).toEqual({ ok: false, reason: 'already' });
  });

  it('requires prerequisite neurons', () => {
    expect(canUnlock('mot_sprint', ctx())).toEqual({ ok: false, reason: 'requires' });
    expect(canUnlock('mot_sprint', ctx({ unlocked: new Set(['mot_balance']) }))).toEqual({ ok: true });
  });

  it('is locked until the action count is met', () => {
    expect(canUnlock('mot_balance', ctx({ actionCounts: { walk: 49 } }))).toEqual({ ok: false, reason: 'locked' });
    expect(canUnlock('mot_balance', ctx({ actionCounts: { walk: 50 } }))).toEqual({ ok: true });
    expect(canUnlock('mot_balance', ctx({ actionCounts: {} }))).toEqual({ ok: false, reason: 'locked' });
  });

  it('needs enough energy (checked last)', () => {
    expect(canUnlock('mot_balance', ctx({ energy: 39 }))).toEqual({ ok: false, reason: 'energy' });
    expect(canUnlock('mot_balance', ctx({ energy: 40 }))).toEqual({ ok: true });
  });
});

describe('unlockNeuron / reinforce', () => {
  it('unlockNeuron spends lineage energy and records the neuron', () => {
    const h = makeHominid();
    const lineage = makeLineage({ neuronalEnergy: 100, actionCounts: { walk: 100 } });
    expect(unlockNeuron(h, lineage, 'mot_balance')).toBe(true);
    expect(h.neurons).toEqual(['mot_balance']);
    expect(lineage.neuronalEnergy).toBe(60);
    expect(unlockNeuron(h, lineage, 'mot_balance')).toBe(false);
    expect(lineage.neuronalEnergy).toBe(60);
  });

  it('unlockNeuron fails without energy or prerequisites and leaves state untouched', () => {
    const h = makeHominid();
    const lineage = makeLineage({ neuronalEnergy: 10, actionCounts: { walk: 100, run: 100 } });
    expect(unlockNeuron(h, lineage, 'mot_balance')).toBe(false);
    expect(unlockNeuron(h, lineage, 'mot_sprint')).toBe(false);
    expect(h.neurons).toEqual([]);
    expect(lineage.neuronalEnergy).toBe(10);
  });

  it('reinforceCost is half the cost rounded up', () => {
    expect(reinforceCost('mot_balance')).toBe(20);
    expect(reinforceCost('int_memory')).toBe(45); // cost 90
    expect(reinforceCost('unknown')).toBe(0);
    for (const n of Object.values(NEURON_MAP)) expect(reinforceCost(n.id)).toBe(Math.ceil(n.cost / 2));
  });

  it('canReinforce gates on unlocked, not-already, and energy', () => {
    const h = makeHominid();
    const lineage = makeLineage({ neuronalEnergy: 5 });
    expect(canReinforce(h, lineage, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(canReinforce(h, lineage, 'mot_balance')).toEqual({ ok: false, reason: 'not_unlocked' });
    h.neurons.push('mot_balance');
    expect(canReinforce(h, lineage, 'mot_balance')).toEqual({ ok: false, reason: 'energy' });
    lineage.neuronalEnergy = 20;
    expect(canReinforce(h, lineage, 'mot_balance')).toEqual({ ok: true });
    expect(reinforceNeuron(h, lineage, 'mot_balance')).toBe(true);
    expect(lineage.neuronalEnergy).toBe(0);
    expect(h.reinforced).toEqual(['mot_balance']);
    expect(canReinforce(h, lineage, 'mot_balance')).toEqual({ ok: false, reason: 'already' });
    expect(reinforceNeuron(h, lineage, 'mot_balance')).toBe(false);
  });
});

describe('progress / availability / energy', () => {
  it('neuronProgress reports 0..1 toward the unlock condition', () => {
    expect(neuronProgress('mot_balance', {})).toBe(0);
    expect(neuronProgress('mot_balance', { walk: 25 })).toBeCloseTo(0.5, 10);
    expect(neuronProgress('mot_balance', { walk: 500 })).toBe(1);
    expect(neuronProgress('unknown', { walk: 500 })).toBe(0);
  });

  it('availableNeurons lists purchasable or energy-gated neurons only', () => {
    const list = availableNeurons({ unlocked: new Set(), energy: 0, actionCounts: { walk: 50, pickup: 20 } });
    expect(list).toContain('mot_balance');
    expect(list).toContain('dex_grip');
    expect(list).not.toContain('sen_sight'); // locked by action count
    expect(list).not.toContain('mot_sprint'); // requires mot_balance
    const later = availableNeurons({ unlocked: new Set(['mot_balance']), energy: 1000, actionCounts: { walk: 50, run: 40 } });
    expect(later).toContain('mot_sprint');
    expect(later).not.toContain('mot_balance');
  });

  it('recordAction accumulates counts', () => {
    const lineage = makeLineage();
    recordAction(lineage, 'walk');
    recordAction(lineage, 'walk', 4);
    recordAction(lineage, 'jump', 2);
    expect(lineage.actionCounts).toEqual({ walk: 5, jump: 2 });
  });

  it('gainEnergy applies neuronGain and baby bonus, records the action', () => {
    const lineage = makeLineage();
    const mods = computeModifiers(['int_curiosity', 'int_memory']); // neuronGain 1.15
    const gained = gainEnergy(lineage, 'identify', mods, 2);
    expect(gained).toBeCloseTo(8 * 1.15 * 2, 10);
    expect(lineage.neuronalEnergy).toBeCloseTo(gained, 10);
    expect(lineage.actionCounts.identify).toBe(1);
    const walk = gainEnergy(lineage, 'walk', baseModifiers(), 0);
    expect(walk).toBeCloseTo(BASE_ENERGY.walk!, 10);
    expect(lineage.actionCounts.walk).toBe(1);
  });

  it('BASE_ENERGY covers every action with a positive value', () => {
    const actions = ['walk', 'run', 'climb', 'jump', 'swim', 'identify', 'smell', 'hear', 'eat', 'drink', 'sleep', 'pickup',
      'craft', 'alter', 'attack', 'dodge', 'intimidate', 'groom', 'mate', 'carry_baby', 'discover_area', 'overcome_fear',
      'kill', 'call', 'heal', 'fall'] as const;
    for (const a of actions) expect(BASE_ENERGY[a]).toBeGreaterThan(0);
    expect(BASE_ENERGY.discover_area).toBe(20);
  });
});

describe('generation carry-over', () => {
  it('applyGenerationToNeurons keeps only reinforced and genetic neurons, deduped', () => {
    const h = makeHominid({
      neurons: ['mot_balance', 'mot_sprint', 'sen_sight'],
      reinforced: ['mot_balance'],
      genetic: ['met_stomach', 'mot_balance'],
    });
    applyGenerationToNeurons(h);
    expect(h.neurons.slice().sort()).toEqual(['met_stomach', 'mot_balance']);
    expect(h.reinforced).toEqual(['mot_balance']);
  });

  it('a reinforced neuron survives while an un-reinforced one is lost', () => {
    const h = makeHominid();
    const lineage = makeLineage({ neuronalEnergy: 500, actionCounts: { walk: 100, run: 100, pickup: 100 } });
    expect(unlockNeuron(h, lineage, 'mot_balance')).toBe(true);
    expect(unlockNeuron(h, lineage, 'mot_sprint')).toBe(true);
    expect(unlockNeuron(h, lineage, 'dex_grip')).toBe(true);
    expect(reinforceNeuron(h, lineage, 'mot_sprint')).toBe(true);
    applyGenerationToNeurons(h);
    expect(h.neurons).toEqual(['mot_sprint']);
    expect(computeModifiers(h.neurons).speed).toBeCloseTo(1.12, 10);
  });
});
