import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/types';
import { SPECIES } from '@/data/species';
import {
  AI_TUNING,
  animalNoise,
  animalScent,
  createAnimal,
  damageAnimal,
  detectionRange,
  inSleepWindow,
  isNight,
  provoke,
  senseRangeFor,
  stepAnimal,
  updateAnimalAI,
  type AIContext,
  type AIOutput,
  type AITarget,
} from '@/systems/animalAI';
import { distanceXZ } from '@/util/vec';

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

const P = (x: number, z: number, y = 0): Vec3 => ({ x, y, z });
const target = (id: string, pos: Vec3, extra: Partial<AITarget> = {}): AITarget => ({
  id, position: pos, isBaby: false, noise: 0.5, fear: 0, ...extra,
});

function makeCtx(over: Partial<AIContext> = {}): AIContext {
  return {
    dt: 0.1,
    targets: [],
    timeOfDay: 0.5,
    rng: mulberry32(42),
    isWater: () => true,
    ...over,
  };
}

/** Run `seconds` of simulation, collecting outputs. Stops early if `until` returns true. */
function simulate(
  a: ReturnType<typeof createAnimal>,
  ctx: AIContext,
  seconds: number,
  until?: (out: AIOutput) => boolean,
): AIOutput[] {
  const outs: AIOutput[] = [];
  const steps = Math.round(seconds / ctx.dt);
  for (let i = 0; i < steps; i++) {
    const out = stepAnimal(a, SPECIES[a.species], ctx);
    outs.push(out);
    if (until && until(out)) break;
  }
  return outs;
}

describe('createAnimal / helpers', () => {
  it('creates an idle, full-health animal whose home is a copy of its position', () => {
    const pos = P(5, -3);
    const a = createAnimal('a1', 'hyena', pos, mulberry32(1));
    expect(a.uid).toBe('a1');
    expect(a.alive).toBe(true);
    expect(a.health).toBe(SPECIES.hyena.health);
    expect(a.maxHealth).toBe(SPECIES.hyena.health);
    expect(a.home).toEqual(pos);
    expect(a.home).not.toBe(pos);
    expect(a.position).not.toBe(pos);
    expect(a.ai.state).toBe('idle');
    expect(a.ai.aggro).toBe(0);
    expect(a.ai.attackCooldown).toBe(0);
  });

  it('adjusts sense range by time of day and target noise', () => {
    expect(isNight(0.1)).toBe(true);
    expect(isNight(0.5)).toBe(false);
    expect(isNight(0.9)).toBe(true);
    expect(senseRangeFor(SPECIES.hyena, 0.1)).toBeCloseTo(60); // nocturnal x1.5
    expect(senseRangeFor(SPECIES.machairodus, 0.1)).toBeCloseTo(31.5); // x0.7
    expect(senseRangeFor(SPECIES.machairodus, 0.5)).toBe(45);
    const quiet = target('q', P(0, 0), { noise: 0 });
    const loud = target('l', P(0, 0), { noise: 1 });
    expect(detectionRange(SPECIES.machairodus, loud, 0.5)).toBeGreaterThan(
      detectionRange(SPECIES.machairodus, quiet, 0.5),
    );
  });

  it('noise and scent values', () => {
    const a = createAnimal('a', 'hyena', P(0, 0), mulberry32(1));
    const out = (state: AIOutput['state']): AIOutput => ({
      moveDir: P(0, 0), speed: 0, wantsAttack: null, sound: null, state,
    });
    expect(animalNoise(a, SPECIES.hyena, out('attack'))).toBe(1);
    expect(animalNoise(a, SPECIES.hyena, out('stalk'))).toBe(0.1);
    expect(animalNoise(a, SPECIES.hyena, out('wander'))).toBe(0.4);
    expect(animalNoise(a, SPECIES.hyena, out('sleep'))).toBe(0.05);
    a.alive = false;
    expect(animalNoise(a, SPECIES.hyena, out('attack'))).toBe(0);
    expect(animalScent(SPECIES.hyena)).toBe(0.9);
    expect(animalScent(SPECIES.antelope)).toBe(0.5);
  });
});

describe('predator', () => {
  it('stalks then attacks a close target, moving toward it', () => {
    const a = createAnimal('cat', 'machairodus', P(0, 0), mulberry32(3));
    const ctx = makeCtx({ targets: [target('player', P(10, 0))] });
    const startDist = distanceXZ(a.position, P(10, 0));
    const outs = simulate(a, ctx, 10, (o) => o.wantsAttack !== null);
    const states = outs.map((o) => o.state);
    expect(states).toContain('stalk');
    expect(states).toContain('attack');
    expect(outs[0].sound).toBe('growl');
    const last = outs[outs.length - 1];
    expect(last.wantsAttack).toEqual({ targetId: 'player' });
    expect(last.sound).toBe('roar');
    expect(distanceXZ(a.position, P(10, 0))).toBeLessThan(startDist);
    expect(distanceXZ(a.position, P(10, 0))).toBeLessThanOrEqual(SPECIES.machairodus.attackRange * 1.3);
    expect(a.ai.aggro).toBeGreaterThan(0);
  });

  it('respects the 1.8 s attack cooldown', () => {
    const a = createAnimal('cat', 'machairodus', P(0, 0), mulberry32(3));
    const ctx = makeCtx({ targets: [target('player', P(1, 0))] });
    const attackTimes: number[] = [];
    const dt = ctx.dt;
    for (let i = 0; i < 100; i++) {
      const out = stepAnimal(a, SPECIES.machairodus, ctx);
      if (out.wantsAttack) attackTimes.push(i * dt);
    }
    expect(attackTimes.length).toBeGreaterThanOrEqual(4);
    expect(attackTimes.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < attackTimes.length; i++) {
      expect(attackTimes[i] - attackTimes[i - 1]).toBeGreaterThanOrEqual(AI_TUNING.ATTACK_COOLDOWN - 1e-6);
    }
  });

  it('gives up when the target is far beyond sense range and returns home', () => {
    const a = createAnimal('cat', 'machairodus', P(0, 0), mulberry32(3));
    const ctx = makeCtx({ targets: [target('player', P(10, 0))] });
    simulate(a, ctx, 1);
    expect(a.ai.state).toBe('stalk');
    expect(distanceXZ(a.position, a.home)).toBeGreaterThan(AI_TUNING.HOME_ARRIVE_DIST);
    // teleport the target out of reach
    ctx.targets = [target('player', P(200, 0))];
    const out = stepAnimal(a, SPECIES.machairodus, ctx);
    expect(out.state).toBe('return');
    expect(a.ai.targetId).toBeNull();
    ctx.targets = [];
    simulate(a, ctx, 5, (o) => o.state === 'idle');
    expect(distanceXZ(a.position, a.home)).toBeLessThanOrEqual(AI_TUNING.HOME_ARRIVE_DIST);
    expect(a.ai.state).toBe('idle');
  });

  it('does not notice a target beyond its (night-reduced) sense range', () => {
    const cat = createAnimal('cat', 'machairodus', P(0, 0), mulberry32(3));
    const outs = simulate(cat, makeCtx({ timeOfDay: 0.9, targets: [target('p', P(40, 0))] }), 2);
    expect(outs.every((o) => o.state !== 'stalk' && o.state !== 'attack')).toBe(true);
    // nocturnal hyena sees further at night
    const hyena = createAnimal('h', 'hyena', P(0, 0), mulberry32(3));
    const hOuts = simulate(hyena, makeCtx({ timeOfDay: 0.9, targets: [target('p', P(50, 0))] }), 0.2);
    expect(hOuts[0].state).toBe('stalk');
  });

  it('sleeps at dawn when nothing is around and wakes afterwards', () => {
    const a = createAnimal('cat', 'machairodus', P(0, 0), mulberry32(3));
    expect(inSleepWindow(SPECIES.machairodus, 0.1)).toBe(true);
    expect(inSleepWindow(SPECIES.hyena, 0.1)).toBe(false);
    const dawn = makeCtx({ timeOfDay: 0.1 });
    const out = stepAnimal(a, SPECIES.machairodus, dawn);
    expect(out.state).toBe('sleep');
    expect(out.speed).toBe(0);
    // stays asleep
    expect(simulate(a, dawn, 3).every((o) => o.state === 'sleep')).toBe(true);
    // a target nearby wakes it into a stalk
    const woken = stepAnimal(a, SPECIES.machairodus, makeCtx({ timeOfDay: 0.1, targets: [target('p', P(5, 0))] }));
    expect(woken.state).toBe('stalk');
    // or the morning passes
    const b = createAnimal('cat2', 'machairodus', P(0, 0), mulberry32(3));
    stepAnimal(b, SPECIES.machairodus, dawn);
    expect(b.ai.state).toBe('sleep');
    stepAnimal(b, SPECIES.machairodus, makeCtx({ timeOfDay: 0.3 }));
    expect(b.ai.state).toBe('idle');
    // nocturnal predators do not sleep at dawn
    const h = createAnimal('h', 'hyena', P(0, 0), mulberry32(3));
    expect(stepAnimal(h, SPECIES.hyena, dawn).state).not.toBe('sleep');
  });

  it('wanders around home and stays within the home radius', () => {
    const a = createAnimal('cat', 'machairodus', P(100, 100), mulberry32(9));
    const outs = simulate(a, makeCtx({ rng: mulberry32(9) }), 120);
    const states = new Set(outs.map((o) => o.state));
    expect(states.has('wander')).toBe(true);
    expect(states.has('idle')).toBe(true);
    expect(distanceXZ(a.position, a.home)).toBeLessThanOrEqual(AI_TUNING.HOME_RADIUS + 1);
    for (const o of outs) {
      if (o.speed > 0) expect(Math.abs(Math.hypot(o.moveDir.x, o.moveDir.z) - 1)).toBeLessThan(1e-6);
      else expect(o.moveDir).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('flying predator circles its home when idle', () => {
    const a = createAnimal('e', 'eagle', P(0, 0), mulberry32(2));
    const outs = simulate(a, makeCtx(), 20);
    expect(outs.some((o) => o.state === 'circle')).toBe(true);
    expect(outs.every((o) => o.state !== 'wander')).toBe(true);
    expect(distanceXZ(a.position, a.home)).toBeLessThan(AI_TUNING.CIRCLE_RADIUS * 2.5);
  });
});

describe('prey', () => {
  it('flees away from a nearby target at boosted speed', () => {
    const a = createAnimal('ant', 'antelope', P(0, 0), mulberry32(5));
    const ctx = makeCtx({ targets: [target('player', P(10, 0))] });
    const outs = simulate(a, ctx, 2);
    expect(outs[0].state).toBe('flee');
    expect(outs[0].speed).toBeCloseTo(SPECIES.antelope.speed * 1.2);
    expect(outs[0].moveDir.x).toBeLessThan(0); // away from +x
    expect(a.position.x).toBeLessThan(-10);
    expect(a.ai.fleeUntil).toBeGreaterThan(0);
    expect(outs.every((o) => o.wantsAttack === null)).toBe(true);
  });

  it('stops fleeing once the threat is gone and eventually returns home', () => {
    const a = createAnimal('ant', 'antelope', P(0, 0), mulberry32(5));
    const ctx = makeCtx({ targets: [target('player', P(10, 0))] });
    simulate(a, ctx, 4);
    expect(a.ai.state).toBe('flee');
    ctx.targets = [];
    simulate(a, ctx, AI_TUNING.FLEE_TIME + 0.5);
    expect(a.ai.state).not.toBe('flee');
    expect(a.ai.state).toBe('return'); // it ran well past the home radius
    simulate(a, ctx, 40, (o) => o.state === 'idle');
    expect(distanceXZ(a.position, a.home)).toBeLessThanOrEqual(AI_TUNING.HOME_ARRIVE_DIST);
  });

  it('small prey squeaks when startled', () => {
    const a = createAnimal('r', 'rat', P(0, 0), mulberry32(5));
    const out = stepAnimal(a, SPECIES.rat, makeCtx({ targets: [target('p', P(3, 0))] }));
    expect(out.state).toBe('flee');
    expect(out.sound).toBe('squeak');
  });

  it('damageAnimal makes wounded prey flee and reports kills', () => {
    const a = createAnimal('ant', 'antelope', P(0, 0), mulberry32(5));
    expect(damageAnimal(a, 10)).toBe(false);
    expect(a.ai.state).toBe('idle');
    expect(damageAnimal(a, 40)).toBe(false); // 20/70 < 40%
    expect(a.ai.state).toBe('flee');
    expect(a.ai.fleeUntil).toBe(AI_TUNING.FLEE_TIME);
    expect(damageAnimal(a, 100)).toBe(true);
    expect(a.alive).toBe(false);
    expect(a.health).toBe(0);
    expect(damageAnimal(a, 1)).toBe(true);
    const dead = updateAnimalAI(a, SPECIES.antelope, makeCtx({ targets: [target('p', P(1, 0))] }));
    expect(dead.speed).toBe(0);
    expect(dead.wantsAttack).toBeNull();
  });
});

describe('territorial', () => {
  it('attacks a target inside its territory, ignores one outside', () => {
    const hog = createAnimal('hog', 'metridiochoerus', P(0, 0), mulberry32(6));
    const far = simulate(hog, makeCtx({ targets: [target('p', P(20, 0))] }), 2); // 20 > 25*0.6
    expect(far.every((o) => o.state !== 'attack')).toBe(true);
    const outs = simulate(hog, makeCtx({ targets: [target('p', P(10, 0))] }), 5, (o) => o.wantsAttack !== null);
    expect(outs[0].state).toBe('attack');
    expect(outs[0].sound).toBe('snarl');
    expect(outs[outs.length - 1].wantsAttack).toEqual({ targetId: 'p' });
  });

  it('returns home when it strays beyond its sense range', () => {
    const hog = createAnimal('hog', 'metridiochoerus', P(0, 0), mulberry32(6));
    hog.position = P(40, 0);
    const ctx = makeCtx();
    const first = stepAnimal(hog, SPECIES.metridiochoerus, ctx);
    expect(first.state).toBe('return');
    expect(first.moveDir.x).toBeLessThan(0);
    simulate(hog, ctx, 20, (o) => o.state === 'idle');
    expect(distanceXZ(hog.position, hog.home)).toBeLessThanOrEqual(AI_TUNING.HOME_ARRIVE_DIST);
    expect(hog.ai.state).toBe('idle');
  });

  it('breaks off a chase when the target leaves the territory', () => {
    const hog = createAnimal('hog', 'metridiochoerus', P(0, 0), mulberry32(6));
    const ctx = makeCtx({ targets: [target('p', P(10, 0))] });
    simulate(hog, ctx, 1); // charges ~6.5 units toward the intruder
    expect(hog.ai.state).toBe('attack');
    expect(distanceXZ(hog.position, hog.home)).toBeGreaterThan(AI_TUNING.HOME_ARRIVE_DIST);
    ctx.targets = [target('p', P(30, 0))];
    const out = stepAnimal(hog, SPECIES.metridiochoerus, ctx);
    expect(out.state).toBe('return');
    expect(out.moveDir.x).toBeLessThan(0); // already heading home
    expect(hog.ai.targetId).toBeNull();
  });

  it('wounded territorial animals flee', () => {
    const liz = createAnimal('liz', 'lizard', P(0, 0), mulberry32(6));
    damageAnimal(liz, 35); // 15/50 < 40%
    expect(liz.ai.state).toBe('flee');
  });
});

describe('neutral', () => {
  it('ignores targets until provoked, then attacks', () => {
    const m = createAnimal('m', 'monkey', P(0, 0), mulberry32(8));
    const ctx = makeCtx({ targets: [target('p', P(4, 0))] });
    const calm = simulate(m, ctx, 3);
    expect(calm.every((o) => o.state !== 'stalk' && o.state !== 'attack')).toBe(true);
    provoke(m);
    expect(m.ai.aggro).toBeGreaterThan(AI_TUNING.AGGRO_THRESHOLD);
    const outs = simulate(m, ctx, 5, (o) => o.wantsAttack !== null);
    expect(outs[outs.length - 1].wantsAttack).toEqual({ targetId: 'p' });
    expect(damageAnimal(m, 1)).toBe(false);
    expect(m.ai.aggro).toBeGreaterThan(0.9); // being hit provokes further
  });

  it('aggro is clamped to 1', () => {
    const m = createAnimal('m', 'monkey', P(0, 0), mulberry32(8));
    provoke(m, 5);
    expect(m.ai.aggro).toBe(1);
  });
});

describe('aquatic', () => {
  it('never leaves the water while hunting or wandering', () => {
    const isWater = (p: Vec3) => p.x < 0;
    const croc = createAnimal('croc', 'crocodile', P(-5, 0), mulberry32(11));
    const hunt = makeCtx({ isWater, targets: [target('p', P(20, 0))] });
    const outs: AIOutput[] = [];
    for (let i = 0; i < 300; i++) {
      outs.push(stepAnimal(croc, SPECIES.crocodile, hunt));
      expect(croc.position.x).toBeLessThan(0);
    }
    expect(outs.some((o) => o.state === 'stalk')).toBe(true);
    expect(outs.some((o) => o.speed > 0)).toBe(true);
    // wandering over a long time also stays wet
    const calm = makeCtx({ isWater, rng: mulberry32(12) });
    croc.ai.state = 'idle';
    croc.ai.timer = 0;
    for (let i = 0; i < 1200; i++) {
      stepAnimal(croc, SPECIES.crocodile, calm);
      expect(isWater(croc.position)).toBe(true);
    }
  });
});
