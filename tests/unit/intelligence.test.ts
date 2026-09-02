import { describe, it, expect } from 'vitest';
import type { AbilityId, LineageState, Vec3 } from '@/core/types';
import {
  DEFAULT_SENSE_RANGES,
  areaCellId,
  detect,
  exploreArea,
  focusTarget,
  identify,
  isAreaKnown,
  isKnown,
  type Sensable,
} from '@/systems/intelligence';

const origin: Vec3 = { x: 0, y: 0, z: 0 };
const forward: Vec3 = { x: 0, y: 0, z: 1 };

const sensable = (uid: string, position: Vec3, over: Partial<Sensable> = {}): Sensable => ({
  uid,
  kind: 'animal',
  defId: 'hyena',
  position,
  known: false,
  noise: 0.5,
  scent: 0.5,
  ...over,
});

const lineage = (): LineageState => ({
  yearsAgo: 10_000_000,
  generation: 1,
  feats: [],
  actionCounts: {},
  neuronalEnergy: 0,
  discoveries: [],
  areasExplored: [],
});

describe('intelligence: sight', () => {
  it('sees targets in front within range, not behind or out of range', () => {
    const targets = [
      sensable('front', { x: 0, y: 0, z: 10 }),
      sensable('behind', { x: 0, y: 0, z: -10 }),
      sensable('far', { x: 0, y: 0, z: 41 }),
      sensable('edge', { x: 0, y: 0, z: 40 }),
    ];
    const ids = detect(origin, forward, targets, 'sight', DEFAULT_SENSE_RANGES).map((d) => d.target.uid);
    expect(ids).toEqual(['front', 'edge']);
  });

  it('uses a 70 degree half-angle cone and ignores the y axis', () => {
    const deg = (a: number, r = 10): Vec3 => ({ x: Math.sin((a * Math.PI) / 180) * r, y: 30, z: Math.cos((a * Math.PI) / 180) * r });
    const targets = [
      sensable('a60', deg(60)),
      sensable('a-60', deg(-60)),
      sensable('a69', deg(69)),
      sensable('a80', deg(80)),
      sensable('a120', deg(120)),
    ];
    const ids = detect(origin, forward, targets, 'sight', DEFAULT_SENSE_RANGES).map((d) => d.target.uid);
    expect(ids.sort()).toEqual(['a-60', 'a60', 'a69']);
  });

  it('cannot see hidden targets, but can smell and hear them', () => {
    const t = [sensable('h', { x: 0, y: 0, z: 5 }, { hidden: true })];
    expect(detect(origin, forward, t, 'sight', DEFAULT_SENSE_RANGES)).toHaveLength(0);
    expect(detect(origin, forward, t, 'smell', DEFAULT_SENSE_RANGES)).toHaveLength(1);
    expect(detect(origin, forward, t, 'hearing', DEFAULT_SENSE_RANGES)).toHaveLength(1);
  });

  it('sorts by distance with decreasing strength and identifies only within 60% of range', () => {
    const targets = [
      sensable('c', { x: 0, y: 0, z: 30 }),
      sensable('a', { x: 0, y: 0, z: 5 }),
      sensable('b', { x: 0, y: 0, z: 23 }),
    ];
    const d = detect(origin, forward, targets, 'sight', DEFAULT_SENSE_RANGES);
    expect(d.map((x) => x.target.uid)).toEqual(['a', 'b', 'c']);
    expect(d[0].strength).toBeGreaterThan(d[1].strength);
    expect(d[1].strength).toBeGreaterThan(d[2].strength);
    expect(d[0].strength).toBeCloseTo(1 - 5 / 40, 5);
    expect(d[0].canIdentify).toBe(true);
    expect(d[1].canIdentify).toBe(true); // 23 < 24
    expect(d[2].canIdentify).toBe(false);
  });

  it('a target on top of the observer is always seen with full strength', () => {
    const d = detect(origin, forward, [sensable('here', { x: 0, y: 0, z: 0 })], 'sight', DEFAULT_SENSE_RANGES);
    expect(d).toHaveLength(1);
    expect(d[0].strength).toBe(1);
  });
});

describe('intelligence: smell and hearing', () => {
  it('smell ignores the cone, needs scent > 0.05 and respects smell range', () => {
    const targets = [
      sensable('behind', { x: 0, y: 0, z: -10 }, { scent: 0.8 }),
      sensable('scentless', { x: 0, y: 0, z: 5 }, { scent: 0.05 }),
      sensable('far', { x: 0, y: 0, z: 26 }, { scent: 1 }),
      sensable('edge', { x: 0, y: 0, z: 25 }, { scent: 1 }),
    ];
    const ids = detect(origin, forward, targets, 'smell', DEFAULT_SENSE_RANGES).map((d) => d.target.uid);
    expect(ids).toEqual(['behind', 'edge']);
  });

  it('hearing needs noise > 0.05 and respects hearing range; strength scales with noise', () => {
    const targets = [
      sensable('loud', { x: 10, y: 0, z: -10 }, { noise: 1 }),
      sensable('quiet', { x: -10, y: 0, z: -10 }, { noise: 0.2 }),
      sensable('silent', { x: 0, y: 0, z: 3 }, { noise: 0 }),
      sensable('far', { x: 0, y: 0, z: -36 }, { noise: 1 }),
    ];
    const d = detect(origin, forward, targets, 'hearing', DEFAULT_SENSE_RANGES);
    expect(d.map((x) => x.target.uid).sort()).toEqual(['loud', 'quiet']);
    const loud = d.find((x) => x.target.uid === 'loud')!;
    const quiet = d.find((x) => x.target.uid === 'quiet')!;
    expect(loud.strength).toBeGreaterThan(quiet.strength);
  });

  it('smell / hearing identification requires the matching ability', () => {
    const t = [sensable('x', { x: 0, y: 0, z: 5 })];
    expect(detect(origin, forward, t, 'smell', DEFAULT_SENSE_RANGES)[0].canIdentify).toBe(false);
    expect(detect(origin, forward, t, 'hearing', DEFAULT_SENSE_RANGES)[0].canIdentify).toBe(false);
    const smellAb = new Set<AbilityId>(['identify_smell']);
    expect(detect(origin, forward, t, 'smell', DEFAULT_SENSE_RANGES, smellAb)[0].canIdentify).toBe(true);
    expect(detect(origin, forward, t, 'hearing', DEFAULT_SENSE_RANGES, smellAb)[0].canIdentify).toBe(false);
    const soundAb = new Set<AbilityId>(['identify_sound']);
    expect(detect(origin, forward, t, 'hearing', DEFAULT_SENSE_RANGES, soundAb)[0].canIdentify).toBe(true);
  });

  it('custom ranges are honoured', () => {
    const t = [sensable('x', { x: 0, y: 0, z: 30 })];
    expect(detect(origin, forward, t, 'sight', { sight: 20, smell: 20, hearing: 20 })).toHaveLength(0);
    expect(detect(origin, forward, t, 'sight', { sight: 60, smell: 20, hearing: 20 })).toHaveLength(1);
  });
});

describe('intelligence: focus', () => {
  it('picks the detection most aligned with forward, nearest on ties', () => {
    const targets = [
      sensable('side', { x: 8, y: 0, z: 8 }),
      sensable('ahead-far', { x: 0, y: 0, z: 30 }),
      sensable('ahead-near', { x: 0, y: 0, z: 12 }),
    ];
    const d = detect(origin, forward, targets, 'sight', DEFAULT_SENSE_RANGES);
    expect(focusTarget(d, forward, origin)?.target.uid).toBe('ahead-near');
    expect(focusTarget(d, { x: 1, y: 0, z: 1 }, origin)?.target.uid).toBe('side');
    expect(focusTarget([], forward, origin)).toBeNull();
  });
});

describe('intelligence: identification', () => {
  it('grants 25 energy for a new discovery and 2 for a repeat', () => {
    const l = lineage();
    expect(identify(l, 'hyena')).toEqual({ isNew: true, energy: 25 });
    expect(isKnown(l, 'hyena')).toBe(true);
    expect(identify(l, 'hyena')).toEqual({ isNew: false, energy: 2 });
    expect(l.discoveries).toEqual(['hyena']);
    expect(identify(l, 'berry').isNew).toBe(true);
    expect(l.discoveries).toEqual(['hyena', 'berry']);
  });
});

describe('intelligence: area exploration', () => {
  it('computes grid cell ids including negative coordinates', () => {
    expect(areaCellId({ x: 0, y: 0, z: 0 })).toBe('0,0');
    expect(areaCellId({ x: 200, y: 5, z: -130 })).toBe('3,-3');
    expect(areaCellId({ x: 63.9, y: 0, z: 64 })).toBe('0,1');
    expect(areaCellId({ x: 200, y: 0, z: -130 }, 100)).toBe('2,-2');
  });

  it('exploreArea adds cells once and isAreaKnown reflects it', () => {
    const l = lineage();
    const p = { x: 70, y: 0, z: 10 };
    expect(isAreaKnown(l, p)).toBe(false);
    expect(exploreArea(l, p)).toBe(true);
    expect(exploreArea(l, { x: 100, y: 0, z: 60 })).toBe(false); // same cell
    expect(isAreaKnown(l, p)).toBe(true);
    expect(isAreaKnown(l, { x: -1, y: 0, z: 0 })).toBe(false);
    expect(exploreArea(l, { x: -1, y: 0, z: 0 })).toBe(true);
    expect(l.areasExplored).toEqual(['1,0', '-1,0']);
    expect(exploreArea(l, p, 32)).toBe(true); // different grid size -> different id
  });
});
