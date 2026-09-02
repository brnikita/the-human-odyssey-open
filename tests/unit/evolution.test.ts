import { describe, expect, it } from 'vitest';
import type { ClanState, HominidData, LineageState } from '@/core/types';
import { FEAT_MAP, FEATS } from '@/data/feats';
import { NEURONS } from '@/data/neurons';
import { mulberry32 } from '@/util/rng';
import {
  GOAL_YEARS_AGO,
  LEAP_MAX_YEARS,
  START_YEARS_AGO,
  ageHominidsOneGeneration,
  checkFeats,
  computeLeap,
  createLineage,
  evolutionLeap,
  generationChange,
  hasWon,
  isLineageLost,
  lineageProgress,
  rollMutation,
  yearsForLeap,
} from '@/systems/evolution';

let nextId = 0;
function makeHominid(partial: Partial<HominidData> = {}): HominidData {
  nextId += 1;
  return {
    id: `h${nextId}`,
    name: `H${nextId}`,
    sex: 'female',
    stage: 'adult',
    ageYears: 25,
    stats: { health: 50, energy: 40, hunger: 30, thirst: 20 },
    maxStats: { health: 100, energy: 100, hunger: 100, thirst: 100 },
    conditions: [],
    position: { x: 0, y: 0, z: 0 },
    state: 'idle',
    held: { left: null, right: null },
    carriedBaby: null,
    isPlayer: false,
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

function makeClan(members: HominidData[], playerId = members[0].id): ClanState {
  for (const m of members) m.isPlayer = m.id === playerId;
  return { members, settlement: { x: 0, y: 0, z: 0 }, playerId };
}

const always = (v: number) => () => v;

describe('lineage basics', () => {
  it('createLineage starts 10M years ago at generation 1 with nothing recorded', () => {
    const l = createLineage();
    expect(l.yearsAgo).toBe(START_YEARS_AGO);
    expect(l.generation).toBe(1);
    expect(l.feats).toEqual([]);
    expect(l.actionCounts).toEqual({});
    expect(l.neuronalEnergy).toBe(0);
  });

  it('lineageProgress maps 10M..2M onto 0..1 and clamps', () => {
    const l = createLineage();
    expect(lineageProgress(l)).toBe(0);
    l.yearsAgo = 6_000_000;
    expect(lineageProgress(l)).toBeCloseTo(0.5, 10);
    l.yearsAgo = GOAL_YEARS_AGO;
    expect(lineageProgress(l)).toBe(1);
    l.yearsAgo = 1_000_000;
    expect(lineageProgress(l)).toBe(1);
  });

  it('hasWon at or below 2M years ago; isLineageLost when nobody is alive', () => {
    const l = createLineage();
    expect(hasWon(l)).toBe(false);
    l.yearsAgo = GOAL_YEARS_AGO;
    expect(hasWon(l)).toBe(true);
    const clan = makeClan([makeHominid({ state: 'dead' }), makeHominid()]);
    expect(isLineageLost(clan)).toBe(false);
    clan.members[1].state = 'dead';
    expect(isLineageLost(clan)).toBe(true);
    expect(isLineageLost({ members: [], settlement: { x: 0, y: 0, z: 0 }, playerId: '' })).toBe(true);
  });
});

describe('feats', () => {
  it('checkFeats detects met counts once and records them', () => {
    const l = createLineage();
    l.actionCounts.walk = 500;
    const first = checkFeats(l);
    expect(first.map((f) => f.id)).toEqual(['first_steps']);
    expect(l.feats).toEqual(['first_steps']);
    expect(checkFeats(l)).toEqual([]);
    l.actionCounts.walk = 5000;
    l.actionCounts.kill = 1;
    const more = checkFeats(l).map((f) => f.id).sort();
    expect(more).toEqual(['first_kill', 'marathon']);
    expect(l.feats).toHaveLength(3);
  });

  it('yearsForLeap / computeLeap add feat reductions to the base and cap at 1.5M', () => {
    expect(yearsForLeap([])).toBe(100_000);
    expect(computeLeap(createLineage(), [FEAT_MAP.first_steps, FEAT_MAP.first_kill]).yearsAdvanced).toBe(100_000 + 15_000 + 120_000);
    expect(computeLeap(createLineage(), FEATS).yearsAdvanced).toBe(LEAP_MAX_YEARS);
  });
});

describe('ageHominidsOneGeneration', () => {
  it('advances stages, ages 15 years, kills elders and refills stage-scaled stats', () => {
    const baby = makeHominid({ stage: 'baby', ageYears: 1 });
    const child = makeHominid({ stage: 'child', ageYears: 9 });
    const adult = makeHominid({ stage: 'adult', ageYears: 25, conditions: [{ id: 'bleeding', severity: 0.5, time: 3 }] });
    const elder = makeHominid({ stage: 'elder', ageYears: 45, isPlayer: true });
    const dead = makeHominid({ state: 'dead' });
    const { died, survivors } = ageHominidsOneGeneration([baby, child, adult, elder, dead], mulberry32(1));

    expect(died).toEqual([elder]);
    expect(elder.state).toBe('dead');
    expect(elder.isPlayer).toBe(false);
    expect(survivors).toEqual([baby, child, adult]);

    expect(baby.stage).toBe('child');
    expect(child.stage).toBe('adult');
    expect(adult.stage).toBe('elder');
    expect(baby.ageYears).toBe(16);
    expect(child.ageYears).toBe(24);
    expect(adult.ageYears).toBe(40);

    expect(baby.maxStats).toEqual({ health: 60, energy: 80, hunger: 100, thirst: 100 });
    expect(child.maxStats).toEqual({ health: 100, energy: 100, hunger: 100, thirst: 100 });
    expect(adult.maxStats).toEqual({ health: 80, energy: 70, hunger: 100, thirst: 100 });
    expect(adult.stats).toEqual(adult.maxStats);
    expect(adult.conditions).toEqual([]);
    expect(dead.ageYears).toBe(25); // untouched
  });
});

describe('rollMutation', () => {
  it('returns a neuron not already owned when the roll succeeds, null when it fails', () => {
    const existing = new Set(NEURONS.slice(1).map((n) => n.id));
    expect(rollMutation(always(0.1), existing)).toBe(NEURONS[0].id);
    expect(rollMutation(always(0.9), new Set())).toBeNull();
    expect(rollMutation(always(0.1), new Set(NEURONS.map((n) => n.id)))).toBeNull();
  });

  it('happens roughly 35% of the time with a seeded rng', () => {
    const rng = mulberry32(2024);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (rollMutation(rng, new Set()) !== null) hits++;
    expect(hits / 4000).toBeGreaterThan(0.31);
    expect(hits / 4000).toBeLessThan(0.39);
  });
});

describe('generationChange', () => {
  it('throws no_offspring when there is no living baby or child', () => {
    const clan = makeClan([makeHominid(), makeHominid({ stage: 'elder' }), makeHominid({ stage: 'baby', state: 'dead' })]);
    expect(() => generationChange(clan, createLineage(), mulberry32(1))).toThrow('no_offspring');
  });

  it('loses un-reinforced neurons, keeps reinforced/genetic ones, ages everyone, drops the dead', () => {
    const player = makeHominid({ neurons: ['mot_balance', 'mot_sprint', 'sen_sight'], reinforced: ['mot_balance'], genetic: ['sen_sight'] });
    const elder = makeHominid({ stage: 'elder' });
    const baby = makeHominid({ stage: 'baby', ageYears: 2 });
    const clan = makeClan([player, elder, baby]);
    const lineage = createLineage();
    const res = generationChange(clan, lineage, always(0.9)); // no mutation

    expect(res.died).toEqual([elder.id]);
    expect(res.matured.sort()).toEqual([player.id, baby.id].sort());
    expect(res.mutations).toEqual([]);
    expect(res.lostNeurons).toEqual([{ hominidId: player.id, neurons: ['mot_sprint'] }]);
    expect(player.neurons.slice().sort()).toEqual(['mot_balance', 'sen_sight']);
    expect(player.stage).toBe('elder');
    expect(baby.stage).toBe('child');
    expect(clan.members).toEqual([player, baby]);
    expect(lineage.generation).toBe(2);
    expect(lineage.yearsAgo).toBe(START_YEARS_AGO - 15);
    expect(res.newPlayerId).toBe(player.id);
    expect(player.isPlayer).toBe(true);
    expect(baby.isPlayer).toBe(false);
  });

  it('gives babies genetic mutations that are active after the change', () => {
    const baby = makeHominid({ stage: 'baby', genetic: ['mot_balance'] });
    const adult = makeHominid();
    const clan = makeClan([adult, baby]);
    const res = generationChange(clan, createLineage(), mulberry32(5));
    // Seeded: at least verify the structure and consistency of whatever was rolled.
    for (const m of res.mutations) {
      expect(m.hominidId).toBe(baby.id);
      expect(NEURONS.some((n) => n.id === m.neuron)).toBe(true);
      expect(baby.genetic).toContain(m.neuron);
      expect(baby.neurons).toContain(m.neuron);
    }
    // Force a mutation with a stub rng to check the mechanics deterministically.
    const baby2 = makeHominid({ stage: 'baby' });
    const clan2 = makeClan([makeHominid(), baby2]);
    const res2 = generationChange(clan2, createLineage(), always(0.1));
    expect(res2.mutations).toHaveLength(1);
    expect(res2.mutations[0].hominidId).toBe(baby2.id);
    expect(res2.mutations[0].neuron).toBe(NEURONS[Math.floor(0.1 * NEURONS.length)].id);
    expect(baby2.neurons).toEqual([res2.mutations[0].neuron]);
  });

  it('reassigns the player to the oldest adult when the player dies', () => {
    const player = makeHominid({ stage: 'elder', ageYears: 50 });
    const young = makeHominid({ stage: 'child', ageYears: 8 });
    const older = makeHominid({ stage: 'child', ageYears: 12 });
    const baby = makeHominid({ stage: 'baby' });
    const clan = makeClan([player, young, older, baby], player.id);
    const res = generationChange(clan, createLineage(), always(0.9));
    expect(res.died).toEqual([player.id]);
    expect(res.newPlayerId).toBe(older.id);
    expect(clan.playerId).toBe(older.id);
    expect(older.isPlayer).toBe(true);
    expect(young.isPlayer).toBe(false);
    expect(clan.members.filter((m) => m.isPlayer)).toHaveLength(1);
  });

  it('falls back to a non-adult when no adult survives', () => {
    const player = makeHominid({ stage: 'elder' });
    const baby = makeHominid({ stage: 'baby' });
    const clan = makeClan([player, baby], player.id);
    const res = generationChange(clan, createLineage(), always(0.9));
    expect(res.newPlayerId).toBe(baby.id);
    expect(baby.stage).toBe('child');
    expect(baby.isPlayer).toBe(true);
  });
});

describe('evolutionLeap', () => {
  it('turns reinforced into genetic, runs a generation and advances time', () => {
    const player = makeHominid({ neurons: ['mot_balance', 'mot_sprint'], reinforced: ['mot_balance', 'mot_sprint'] });
    const baby = makeHominid({ stage: 'baby' });
    const clan = makeClan([player, baby]);
    const lineage = createLineage();
    const res = evolutionLeap(clan, lineage, always(0.9), [FEAT_MAP.observer]);
    expect(res.yearsAdvanced).toBe(150_000);
    expect(res.generation.newPlayerId).toBe(player.id);
    expect(res.yearsAgoAfter).toBe(START_YEARS_AGO - 15 - 150_000);
    expect(lineage.yearsAgo).toBe(res.yearsAgoAfter);
    expect(lineage.generation).toBe(2);
    expect(player.genetic.slice().sort()).toEqual(['mot_balance', 'mot_sprint']);
    expect(player.neurons.slice().sort()).toEqual(['mot_balance', 'mot_sprint']);
  });

  it('never advances past the 2M-year goal and then counts as won', () => {
    const clan = makeClan([makeHominid(), makeHominid({ stage: 'child' })]);
    const lineage = createLineage();
    lineage.yearsAgo = 2_050_000;
    const res = evolutionLeap(clan, lineage, mulberry32(3), FEATS);
    expect(res.yearsAgoAfter).toBe(GOAL_YEARS_AGO);
    expect(hasWon(lineage)).toBe(true);
  });

  it('propagates no_offspring from the generation change', () => {
    const clan = makeClan([makeHominid()]);
    expect(() => evolutionLeap(clan, createLineage(), mulberry32(1), [])).toThrow('no_offspring');
  });
});
