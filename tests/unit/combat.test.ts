import { describe, expect, it } from 'vitest';
import type { AbilityId } from '@/core/types';
import { SPECIES } from '@/data/species';
import {
  BASE_DODGE_WINDOW,
  attackAnimal,
  dodgeAllowsCounter,
  dodgeIsHit,
  hitDamage,
  intimidateChance,
  predatorThreatLevel,
  resolveDodge,
  startAttack,
  tickTelegraph,
  tryIntimidate,
  type AttackTelegraph,
} from '@/systems/combat';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const abilities = (...ids: AbilityId[]) => new Set<AbilityId>(ids);
const tele = (windup: number): AttackTelegraph => ({
  species: 'hyena', windup, window: BASE_DODGE_WINDOW, elapsed: 0, resolved: false,
});

describe('telegraph', () => {
  it('startAttack windup is 0.9-1.6 s for a reference-speed predator (hyena)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const t = startAttack(SPECIES.hyena, rng);
      expect(t.windup).toBeGreaterThanOrEqual(0.9);
      expect(t.windup).toBeLessThanOrEqual(1.6);
      expect(t.window).toBe(BASE_DODGE_WINDOW);
      expect(t.elapsed).toBe(0);
      expect(t.resolved).toBe(false);
      expect(t.species).toBe('hyena');
    }
  });

  it('faster species have shorter windups, slower species longer', () => {
    const fixed = () => 0.5;
    const eagle = startAttack(SPECIES.eagle, fixed); // speed 12
    const hyena = startAttack(SPECIES.hyena, fixed); // speed 7
    const python = startAttack(SPECIES.python, fixed); // speed 3.5
    expect(eagle.windup).toBeLessThan(hyena.windup);
    expect(python.windup).toBeGreaterThan(hyena.windup);
  });

  it('tickTelegraph reports strike exactly once', () => {
    const t = tele(1.0);
    const results: string[] = [];
    for (let i = 0; i < 20; i++) results.push(tickTelegraph(t, 0.1));
    expect(results.filter((r) => r === 'strike')).toHaveLength(1);
    expect(results.indexOf('strike')).toBeGreaterThanOrEqual(9);
    expect(results.indexOf('strike')).toBeLessThanOrEqual(10);
    expect(t.resolved).toBe(true);
    expect(t.elapsed).toBeCloseTo(2.0);
  });
});

describe('resolveDodge', () => {
  const t = tele(1.0);
  const w = BASE_DODGE_WINDOW;

  it('perfect within half a window of the strike', () => {
    expect(resolveDodge(t, 1.0)).toBe('perfect');
    expect(resolveDodge(t, 1.0 + w / 2 - 0.001)).toBe('perfect');
    expect(resolveDodge(t, 1.0 - w / 2 + 0.001)).toBe('perfect');
    expect(dodgeAllowsCounter('perfect')).toBe(true);
    expect(dodgeIsHit('perfect')).toBe(false);
  });

  it('good when slightly early, early when far too early', () => {
    expect(resolveDodge(t, 1.0 - w * 0.75)).toBe('good');
    expect(dodgeIsHit('good')).toBe(false);
    expect(dodgeAllowsCounter('good')).toBe(false);
    expect(resolveDodge(t, 1.0 - w - 0.01)).toBe('early');
    expect(resolveDodge(t, 0.1)).toBe('early');
    expect(dodgeIsHit('early')).toBe(true);
  });

  it('late past half a window, miss when never pressed', () => {
    expect(resolveDodge(t, 1.0 + w * 0.5 + 0.01)).toBe('late');
    expect(resolveDodge(t, 2.0)).toBe('late');
    expect(dodgeIsHit('late')).toBe(true);
    expect(resolveDodge(t, null)).toBe('miss');
    expect(resolveDodge(t, Number.NaN)).toBe('miss');
    expect(dodgeIsHit('miss')).toBe(true);
  });

  it('dodgeWindowMult widens the perfect window', () => {
    const input = 1.0 + w * 0.6; // late at mult 1, perfect at mult 2
    expect(resolveDodge(t, input, 1)).toBe('late');
    expect(resolveDodge(t, input, 2)).toBe('perfect');
  });
});

describe('damage', () => {
  it('hitDamage scales with stage and is at least 1 and at most max health', () => {
    expect(hitDamage(SPECIES.machairodus, 100)).toBe(40);
    expect(hitDamage(SPECIES.machairodus, 100, 0.5)).toBe(20);
    expect(hitDamage(SPECIES.fish, 100)).toBe(1); // damage 0 -> min 1
    expect(hitDamage(SPECIES.deinotherium, 50)).toBe(50); // capped by max health
  });

  it('attackAnimal uses weapon damage; counter with ability deals 2.5x', () => {
    const plain = attackAnimal(100, 'sharp_stick', false, abilities());
    expect(plain.damage).toBe(14);
    expect(plain.health).toBe(86);
    expect(plain.killed).toBe(false);

    const counterNoAbility = attackAnimal(100, 'sharp_stick', true, abilities());
    expect(counterNoAbility.damage).toBe(14);

    const counter = attackAnimal(100, 'sharp_stick', true, abilities('counter_attack'));
    expect(counter.damage).toBe(35);
    expect(counter.health).toBe(65);

    const bare = attackAnimal(3, null, false, abilities());
    expect(bare.damage).toBe(2);
    expect(bare.killed).toBe(false);
    const kill = attackAnimal(10, 'chopper', false, abilities());
    expect(kill.health).toBe(0);
    expect(kill.killed).toBe(true);
  });
});

describe('intimidation', () => {
  it('is impossible without the ability or on non-intimidatable species', () => {
    expect(intimidateChance(SPECIES.hyena, 3, abilities(), 'chopper')).toBe(0);
    expect(intimidateChance(SPECIES.crocodile, 3, abilities('intimidate'), 'chopper')).toBe(0);
    expect(tryIntimidate(SPECIES.crocodile, 3, abilities('intimidate'), 'chopper', () => 0)).toBe(false);
  });

  it('rises with clan members and a weapon, capped at 0.95, and machairodus is harder', () => {
    const intim = abilities('intimidate');
    expect(intimidateChance(SPECIES.hyena, 0, intim, null)).toBeCloseTo(0.35);
    expect(intimidateChance(SPECIES.hyena, 2, intim, null)).toBeCloseTo(0.65);
    expect(intimidateChance(SPECIES.hyena, 2, intim, 'stick')).toBeCloseTo(0.8);
    expect(intimidateChance(SPECIES.hyena, 10, intim, 'stick')).toBe(0.95);
    expect(intimidateChance(SPECIES.machairodus, 0, intim, null)).toBeCloseTo(0.2);
  });

  it('tryIntimidate rolls against the chance', () => {
    const intim = abilities('intimidate');
    expect(tryIntimidate(SPECIES.hyena, 0, intim, null, () => 0.1)).toBe(true);
    expect(tryIntimidate(SPECIES.hyena, 0, intim, null, () => 0.9)).toBe(false);
    const rng = mulberry32(7);
    let wins = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (tryIntimidate(SPECIES.hyena, 0, intim, null, rng)) wins++;
    expect(wins / n).toBeGreaterThan(0.3);
    expect(wins / n).toBeLessThan(0.4);
  });
});

describe('predatorThreatLevel', () => {
  it('rates by damage thresholds', () => {
    expect(predatorThreatLevel(SPECIES.machairodus)).toBe(3);
    expect(predatorThreatLevel(SPECIES.crocodile)).toBe(3);
    expect(predatorThreatLevel(SPECIES.hyena)).toBe(2);
    expect(predatorThreatLevel(SPECIES.python)).toBe(2);
    expect(predatorThreatLevel(SPECIES.rat)).toBe(1);
    expect(predatorThreatLevel(SPECIES.lizard)).toBe(1);
  });
});
