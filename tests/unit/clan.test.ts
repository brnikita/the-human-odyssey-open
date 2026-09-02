import { describe, expect, it } from 'vitest';
import type { HominidData } from '@/core/types';
import { mulberry32 } from '@/util/rng';
import {
  HOMINID_NAMES,
  adults,
  babies,
  bondTick,
  canCarryBaby,
  canMate,
  carriedBabyIds,
  createClan,
  createOutsider,
  dropBaby,
  findMember,
  livingMembers,
  makeClanMember,
  mate,
  pickUpBaby,
  randomName,
  recruitAction,
  switchPlayer,
} from '@/systems/clan';

const origin = { x: 0, y: 0, z: 0 };
const dist = (a: HominidData) => Math.hypot(a.position.x - 10, a.position.y - 1, a.position.z - 20);

describe('createClan', () => {
  it('builds 3 adults, 1 child and 2 babies around the settlement with the first adult as player', () => {
    const clan = createClan(mulberry32(1), { x: 10, y: 1, z: 20 });
    expect(clan.members).toHaveLength(6);
    expect(adults(clan)).toHaveLength(3);
    expect(babies(clan)).toHaveLength(2);
    expect(clan.members.filter((m) => m.stage === 'child')).toHaveLength(1);
    const sexes = new Set(adults(clan).map((m) => m.sex));
    expect(sexes.has('male') && sexes.has('female')).toBe(true);
    expect(clan.members[0].stage).toBe('adult');
    expect(clan.members[0].isPlayer).toBe(true);
    expect(clan.playerId).toBe(clan.members[0].id);
    expect(clan.members.filter((m) => m.isPlayer)).toHaveLength(1);
    for (const m of clan.members) {
      expect(dist(m)).toBeLessThanOrEqual(8);
      expect(m.isOutsider).toBe(false);
      expect(m.state).toBe('idle');
    }
    expect(new Set(clan.members.map((m) => m.name)).size).toBe(6);
    expect(new Set(clan.members.map((m) => m.id)).size).toBe(6);
    expect(clan.settlement).toEqual({ x: 10, y: 1, z: 20 });
  });

  it('is deterministic for a seed', () => {
    const a = createClan(mulberry32(77), origin);
    const b = createClan(mulberry32(77), origin);
    expect(a).toEqual(b);
    const c = createClan(mulberry32(78), origin);
    expect(c.members.map((m) => m.name)).not.toEqual(a.members.map((m) => m.name));
  });
});

describe('names and member defaults', () => {
  it('randomName avoids used names and falls back to numbered variants', () => {
    const rng = mulberry32(4);
    const used = new Set<string>();
    for (let i = 0; i < HOMINID_NAMES.length; i++) {
      const n = randomName(rng, used);
      expect(HOMINID_NAMES).toContain(n);
    }
    expect(used.size).toBe(HOMINID_NAMES.length);
    const extra = randomName(rng, used);
    expect(HOMINID_NAMES).not.toContain(extra);
    expect(used.has(extra)).toBe(true);
    expect(extra).toMatch(/ \d+$/);
  });

  it('makeClanMember applies stage-scaled max stats and sane defaults', () => {
    const baby = makeClanMember({ stage: 'baby' });
    expect(baby.maxStats).toEqual({ health: 30, energy: 50, hunger: 100, thirst: 100 });
    expect(baby.stats).toEqual(baby.maxStats);
    const elder = makeClanMember({ stage: 'elder' });
    expect(elder.maxStats).toEqual({ health: 80, energy: 70, hunger: 100, thirst: 100 });
    const adult = makeClanMember();
    expect(adult.stage).toBe('adult');
    expect(adult.stats).toEqual({ health: 100, energy: 100, hunger: 100, thirst: 100 });
    expect(adult.state).toBe('idle');
    expect(adult.fear).toBe(0);
    expect(adult.dopamine).toBe(50);
    expect(adult.isOutsider).toBe(false);
    expect(adult.carriedBaby).toBeNull();
    expect(adult.held).toEqual({ left: null, right: null });
    expect(makeClanMember().id).not.toBe(makeClanMember().id);
    expect(makeClanMember({ id: 'custom', name: 'X' })).toMatchObject({ id: 'custom', name: 'X' });
  });
});

describe('recruiting', () => {
  it('createOutsider is an unrecruited adult with no bond', () => {
    const o = createOutsider(mulberry32(2), { x: 5, y: 0, z: 5 });
    expect(o.isOutsider).toBe(true);
    expect(o.bond).toBe(0);
    expect(o.stage).toBe('adult');
    expect(o.position).toEqual({ x: 5, y: 0, z: 5 });
  });

  it('recruitAction raises bond per action and recruits at 1', () => {
    const o = createOutsider(mulberry32(2), origin);
    expect(recruitAction(o, 'approach', { bondMult: 1 })).toEqual({ bond: 0.1, recruited: false });
    expect(recruitAction(o, 'groom', { bondMult: 1 }).bond).toBeCloseTo(0.35, 10);
    expect(recruitAction(o, 'feed', { bondMult: 1 }).bond).toBeCloseTo(0.7, 10);
    expect(o.isOutsider).toBe(true);
    const res = recruitAction(o, 'feed', { bondMult: 1 });
    expect(res).toEqual({ bond: 1, recruited: true });
    expect(o.isOutsider).toBe(false);
    expect(recruitAction(o, 'approach', { bondMult: 1 })).toEqual({ bond: 1, recruited: true });
  });

  it('bondMult scales recruitment', () => {
    const o = createOutsider(mulberry32(2), origin);
    expect(recruitAction(o, 'groom', { bondMult: 2 }).bond).toBeCloseTo(0.5, 10);
    expect(recruitAction(o, 'groom', { bondMult: 2 })).toEqual({ bond: 1, recruited: true });
  });
});

describe('mating', () => {
  it('canMate requires two living, recruited adults of opposite sex', () => {
    const f = makeClanMember({ sex: 'female' });
    const m = makeClanMember({ sex: 'male' });
    expect(canMate(f, m)).toBe(true);
    expect(canMate(f, f)).toBe(false);
    expect(canMate(f, makeClanMember({ sex: 'female' }))).toBe(false);
    expect(canMate(f, makeClanMember({ sex: 'male', stage: 'child' }))).toBe(false);
    expect(canMate(f, makeClanMember({ sex: 'male', stage: 'elder' }))).toBe(false);
    expect(canMate(f, makeClanMember({ sex: 'male', state: 'dead' }))).toBe(false);
    expect(canMate(f, makeClanMember({ sex: 'male', isOutsider: true }))).toBe(false);
  });

  it('mate produces a baby near the first parent inheriting both genetic pools', () => {
    const f = makeClanMember({ sex: 'female', position: { x: 3, y: 0, z: 4 }, reinforced: ['mot_balance'], genetic: ['sen_sight'] });
    const m = makeClanMember({ sex: 'male', reinforced: ['sen_sight', 'met_stomach'], genetic: ['dex_grip'], neurons: ['int_curiosity'] });
    const used = new Set<string>([f.name, m.name]);
    const baby = mate(f, m, mulberry32(9), used);
    expect(baby.stage).toBe('baby');
    expect(baby.ageYears).toBe(0);
    expect(baby.genetic.slice().sort()).toEqual(['dex_grip', 'met_stomach', 'mot_balance', 'sen_sight']);
    expect(baby.neurons).toEqual([]);
    expect(baby.maxStats.health).toBe(30);
    expect(Math.hypot(baby.position.x - 3, baby.position.z - 4)).toBeLessThanOrEqual(1);
    expect(used.has(baby.name)).toBe(true);
    expect(() => mate(f, f, mulberry32(1), used)).toThrow('cannot_mate');
  });
});

describe('baby carrying', () => {
  it('carries one baby by default and two with the carry_two ability', () => {
    const carrier = makeClanMember({ position: { x: 1, y: 2, z: 3 } });
    const b1 = makeClanMember({ stage: 'baby' });
    const b2 = makeClanMember({ stage: 'baby' });
    expect(canCarryBaby(carrier, { carryTwo: false })).toBe(true);
    expect(pickUpBaby(carrier, b1)).toBe(true);
    expect(carrier.carriedBaby).toBe(b1.id);
    expect(b1.position).toEqual(carrier.position);
    expect(canCarryBaby(carrier, { carryTwo: false })).toBe(false);
    expect(pickUpBaby(carrier, b2)).toBe(false);
    expect(pickUpBaby(carrier, b1, { carryTwo: true })).toBe(false); // already carried
    expect(canCarryBaby(carrier, { carryTwo: true })).toBe(true);
    expect(pickUpBaby(carrier, b2, { carryTwo: true })).toBe(true);
    expect(carriedBabyIds(carrier)).toEqual([b1.id, b2.id]);
    expect(canCarryBaby(carrier, { carryTwo: true })).toBe(false);
  });

  it('rejects non-babies, dead babies and baby carriers', () => {
    const carrier = makeClanMember();
    expect(pickUpBaby(carrier, makeClanMember({ stage: 'child' }))).toBe(false);
    expect(pickUpBaby(carrier, makeClanMember({ stage: 'baby', state: 'dead' }))).toBe(false);
    expect(canCarryBaby(makeClanMember({ stage: 'baby' }), { carryTwo: true })).toBe(false);
    expect(canCarryBaby(makeClanMember({ state: 'dead' }), { carryTwo: false })).toBe(false);
    expect(carrier.carriedBaby).toBeNull();
  });

  it('dropBaby releases the most recent baby and returns null when empty', () => {
    const carrier = makeClanMember();
    const b1 = makeClanMember({ stage: 'baby' });
    const b2 = makeClanMember({ stage: 'baby' });
    expect(dropBaby(carrier)).toBeNull();
    pickUpBaby(carrier, b1, { carryTwo: true });
    pickUpBaby(carrier, b2, { carryTwo: true });
    expect(dropBaby(carrier)).toBe(b2.id);
    expect(carrier.carriedBaby).toBe(b1.id);
    expect(dropBaby(carrier)).toBe(b1.id);
    expect(carrier.carriedBaby).toBeNull();
  });
});

describe('player switching and queries', () => {
  it('switchPlayer moves control to a valid member only', () => {
    const clan = createClan(mulberry32(3), origin);
    const [p, other, , child, baby] = clan.members;
    expect(switchPlayer(clan, other.id)).toBe(true);
    expect(clan.playerId).toBe(other.id);
    expect(other.isPlayer).toBe(true);
    expect(p.isPlayer).toBe(false);
    expect(clan.members.filter((m) => m.isPlayer)).toHaveLength(1);
    expect(switchPlayer(clan, child.id)).toBe(true);
    expect(switchPlayer(clan, baby.id)).toBe(false);
    expect(switchPlayer(clan, 'nope')).toBe(false);
    const outsider = createOutsider(mulberry32(1), origin);
    clan.members.push(outsider);
    expect(switchPlayer(clan, outsider.id)).toBe(false);
    p.state = 'dead';
    expect(switchPlayer(clan, p.id)).toBe(false);
    expect(clan.playerId).toBe(child.id);
  });

  it('livingMembers, babies, adults and findMember filter correctly', () => {
    const clan = createClan(mulberry32(3), origin);
    clan.members[1].state = 'dead';
    clan.members[4].state = 'dead';
    expect(livingMembers(clan)).toHaveLength(4);
    expect(adults(clan)).toHaveLength(2);
    expect(babies(clan)).toHaveLength(1);
    expect(findMember(clan, clan.members[2].id)).toBe(clan.members[2]);
    expect(findMember(clan, 'missing')).toBeUndefined();
  });
});

describe('bondTick', () => {
  it('raises bond 0.01/s for members near others, capped at 1, ignoring far ones and outsiders', () => {
    const a = makeClanMember({ bond: 0.5, position: { x: 0, y: 0, z: 0 } });
    const b = makeClanMember({ bond: 0.98, position: { x: 3, y: 0, z: 0 } });
    const far = makeClanMember({ bond: 0.2, position: { x: 100, y: 0, z: 0 } });
    const outsider = makeClanMember({ bond: 0.2, isOutsider: true, position: { x: 1, y: 0, z: 0 } });
    const dead = makeClanMember({ bond: 0.2, state: 'dead', position: { x: 99, y: 0, z: 0 } });
    bondTick([a, b, far, outsider, dead], 1);
    expect(a.bond).toBeCloseTo(0.51, 10);
    expect(b.bond).toBeCloseTo(0.99, 10);
    expect(far.bond).toBe(0.2);
    expect(outsider.bond).toBe(0.2);
    expect(dead.bond).toBe(0.2);
    bondTick([a, b], 10);
    expect(a.bond).toBeCloseTo(0.61, 10);
    expect(b.bond).toBe(1);
  });

  it('a dead neighbour does not count as company', () => {
    const a = makeClanMember({ bond: 0.5, position: { x: 0, y: 0, z: 0 } });
    const corpse = makeClanMember({ state: 'dead', position: { x: 1, y: 0, z: 0 } });
    bondTick([a, corpse], 5);
    expect(a.bond).toBe(0.5);
  });
});
