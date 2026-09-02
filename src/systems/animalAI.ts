// Per-species finite state machine for animals. Pure logic: no Three.js.
// `updateAnimalAI` decides *what* the animal wants to do this tick (direction,
// speed, attack request, sound) and mutates only the brain; `applyMovement`
// integrates the position, and `stepAnimal` does both for convenience.
import type { SpeciesDef, SpeciesId, Vec3 } from '@/core/types';
import { SPECIES } from '@/data/species';
import * as V from '@/util/vec';

export type AIState = 'idle' | 'wander' | 'stalk' | 'attack' | 'flee' | 'sleep' | 'eat' | 'return' | 'circle';
export type AISound = 'growl' | 'roar' | 'snarl' | 'squeak';

export interface AIBrain {
  state: AIState;
  /** countdown (s) for the current state; state-specific meaning */
  timer: number;
  /** time (s) spent in the current state */
  stateTime: number;
  /** accumulated stalk + attack time (s) for the current chase */
  chaseTime: number;
  targetId: string | null;
  wanderTarget: Vec3 | null;
  attackCooldown: number;
  /** seconds of fleeing remaining (refreshed while a threat stays close) */
  fleeUntil: number;
  /** 0..1 */
  aggro: number;
  lastKnownTargetPos: Vec3 | null;
}

export interface AnimalData {
  uid: string;
  species: SpeciesId;
  position: Vec3;
  health: number;
  maxHealth: number;
  alive: boolean;
  /** radians, 0 = +x, pi/2 = +z */
  heading: number;
  home: Vec3;
  ai: AIBrain;
}

export interface AITarget {
  id: string;
  position: Vec3;
  isBaby: boolean;
  /** 0..1 noise made by the target (running = 1) */
  noise: number;
  /** 0..1 */
  fear: number;
}

export interface AIContext {
  dt: number;
  targets: AITarget[];
  /** 0..1, night when < 0.22 or > 0.8 */
  timeOfDay: number;
  rng: () => number;
  isWater: (p: Vec3) => boolean;
}

export interface AIOutput {
  /** normalized xz direction, or zero */
  moveDir: Vec3;
  /** units / s */
  speed: number;
  wantsAttack: { targetId: string } | null;
  sound: AISound | null;
  state: AIState;
}

export const AI_TUNING = {
  HOME_RADIUS: 30,
  WANDER_RADIUS: 25,
  TERRITORY_WANDER_RADIUS: 8,
  ATTACK_COOLDOWN: 1.8,
  CHASE_LIMIT: 25,
  FLEE_TIME: 6,
  LOW_HEALTH: 0.4,
  SLEEP_START: 0.05,
  SLEEP_END: 0.2,
  NOCTURNAL_SLEEP_START: 0.45,
  NOCTURNAL_SLEEP_END: 0.6,
  CIRCLE_RADIUS: 8,
  ARRIVE_DIST: 1.5,
  HOME_ARRIVE_DIST: 3,
  AGGRO_THRESHOLD: 0.5,
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const isNight = (timeOfDay: number): boolean => timeOfDay < 0.22 || timeOfDay > 0.8;

/** Sense range adjusted for the time of day (nocturnal x1.5 at night, others x0.7). */
export function senseRangeFor(species: SpeciesDef, timeOfDay: number): number {
  let r = species.senseRange;
  if (isNight(timeOfDay)) r *= species.nocturnal ? 1.5 : 0.7;
  return r;
}

/** Distance at which `target` is noticed: noisy (running) targets are noticed from further away. */
export function detectionRange(species: SpeciesDef, target: AITarget, timeOfDay: number): number {
  return senseRangeFor(species, timeOfDay) * (0.8 + 0.4 * clamp01(target.noise));
}

/** Predators (non-nocturnal) sleep at dawn 0.05..0.2; nocturnal predators around midday 0.45..0.6. */
export function inSleepWindow(species: SpeciesDef, timeOfDay: number): boolean {
  const T = AI_TUNING;
  return species.nocturnal
    ? timeOfDay >= T.NOCTURNAL_SLEEP_START && timeOfDay <= T.NOCTURNAL_SLEEP_END
    : timeOfDay >= T.SLEEP_START && timeOfDay <= T.SLEEP_END;
}

export function createBrain(rng: () => number): AIBrain {
  return {
    state: 'idle',
    timer: 1 + rng() * 3,
    stateTime: 0,
    chaseTime: 0,
    targetId: null,
    wanderTarget: null,
    attackCooldown: 0,
    fleeUntil: 0,
    aggro: 0,
    lastKnownTargetPos: null,
  };
}

export function createAnimal(uid: string, species: SpeciesId, position: Vec3, rng: () => number): AnimalData {
  const def = SPECIES[species];
  return {
    uid,
    species,
    position: V.clone(position),
    health: def.health,
    maxHealth: def.health,
    alive: true,
    heading: rng() * Math.PI * 2,
    home: V.clone(position),
    ai: createBrain(rng),
  };
}

/** Raise aggression (neutral animals attack once aggro > 0.5). */
export function provoke(a: AnimalData, amount = 0.6): void {
  a.ai.aggro = clamp01(a.ai.aggro + amount);
}

/** Apply damage. Returns true if the animal died. Prey/territorial flee when below 40% health. */
export function damageAnimal(a: AnimalData, dmg: number): boolean {
  if (!a.alive) return true;
  a.health = Math.max(0, a.health - Math.max(0, dmg));
  if (a.health <= 0) {
    a.alive = false;
    a.ai.state = 'idle';
    a.ai.targetId = null;
    return true;
  }
  const def = SPECIES[a.species];
  const b = a.ai;
  if (def.behavior === 'prey' || def.behavior === 'territorial') {
    if (a.health < AI_TUNING.LOW_HEALTH * a.maxHealth) {
      setState(b, 'flee');
      b.fleeUntil = AI_TUNING.FLEE_TIME;
      b.targetId = null;
    }
  } else {
    provoke(a, 0.6);
  }
  return false;
}

/** 0..1 loudness for the hearing sense, from the state the animal is in this tick. */
export function animalNoise(a: AnimalData, species: SpeciesDef, out: AIOutput): number {
  if (!a.alive) return 0;
  void species;
  switch (out.state) {
    case 'attack': return 1;
    case 'stalk': return 0.1;
    case 'wander': return 0.4;
    case 'return': return 0.4;
    case 'sleep': return 0.05;
    case 'flee': return 0.6;
    case 'circle': return 0.3;
    case 'eat': return 0.25;
    case 'idle': return 0.15;
    default: return 0.2;
  }
}

/** 0..1 scent strength for the smell sense. */
export function animalScent(species: SpeciesDef): number {
  return species.behavior === 'predator' ? 0.9 : 0.5;
}

// ---------------------------------------------------------------------------
// internals

function setState(b: AIBrain, state: AIState, timer = 0): void {
  b.state = state;
  b.stateTime = 0;
  b.timer = timer;
}

function emptyOutput(state: AIState): AIOutput {
  return { moveDir: { x: 0, y: 0, z: 0 }, speed: 0, wantsAttack: null, sound: null, state };
}

function getTarget(ctx: AIContext, id: string | null): AITarget | null {
  if (id === null) return null;
  return ctx.targets.find((t) => t.id === id) ?? null;
}

/**
 * Best target within detection range measured from `from` (default: the
 * animal's position). Babies and frightened targets are preferred.
 */
function findTarget(
  a: AnimalData,
  species: SpeciesDef,
  ctx: AIContext,
  rangeMult = 1,
  from: Vec3 = a.position,
): AITarget | null {
  let best: AITarget | null = null;
  let bestScore = Infinity;
  for (const t of ctx.targets) {
    const d = V.distanceXZ(from, t.position);
    if (d > detectionRange(species, t, ctx.timeOfDay) * rangeMult) continue;
    const score = d / (1 + (t.isBaby ? 1 : 0) + 0.3 * clamp01(t.fear));
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

function nearestTarget(a: AnimalData, ctx: AIContext): { target: AITarget; dist: number } | null {
  let best: AITarget | null = null;
  let bestDist = Infinity;
  for (const t of ctx.targets) {
    const d = V.distanceXZ(a.position, t.position);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best ? { target: best, dist: bestDist } : null;
}

function moveToward(out: AIOutput, a: AnimalData, p: Vec3, speed: number): void {
  out.moveDir = V.normalizeXZ(V.sub(p, a.position));
  out.speed = out.moveDir.x === 0 && out.moveDir.z === 0 ? 0 : speed;
}

function moveAway(out: AIOutput, a: AnimalData, p: Vec3, speed: number): void {
  const dir = V.normalizeXZ(V.sub(a.position, p));
  out.moveDir = dir.x === 0 && dir.z === 0 ? V.fromHeading(a.heading) : dir;
  out.speed = speed;
}

function pickWanderTarget(a: AnimalData, species: SpeciesDef, ctx: AIContext, radius: number): Vec3 | null {
  for (let i = 0; i < 8; i++) {
    const angle = ctx.rng() * Math.PI * 2;
    const r = radius * (0.3 + 0.7 * ctx.rng());
    const p = { x: a.home.x + Math.cos(angle) * r, y: a.home.y, z: a.home.z + Math.sin(angle) * r };
    if (!species.aquatic || ctx.isWater(p)) return p;
  }
  return null;
}

function attackSound(species: SpeciesDef): AISound {
  return species.damage >= 30 ? 'roar' : 'snarl';
}

// The begin* helpers switch state and immediately act for this tick so a
// transition never costs the animal a frozen frame.

function beginStalk(a: AnimalData, t: AITarget, out: AIOutput, species: SpeciesDef, ctx: AIContext): void {
  const b = a.ai;
  b.targetId = t.id;
  b.chaseTime = 0;
  b.lastKnownTargetPos = V.clone(t.position);
  setState(b, 'stalk');
  doChase(a, species, ctx, out, false);
  out.sound = species.size >= 1 ? 'growl' : 'snarl';
}

function beginReturn(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  b.targetId = null;
  b.chaseTime = 0;
  b.wanderTarget = null;
  setState(b, 'return');
  doReturn(a, species, ctx, out);
}

function beginFlee(a: AnimalData, out: AIOutput, species: SpeciesDef, ctx: AIContext): void {
  const b = a.ai;
  b.targetId = null;
  b.fleeUntil = AI_TUNING.FLEE_TIME;
  setState(b, 'flee');
  doFlee(a, species, ctx, out);
  out.sound = species.size < 0.5 ? 'squeak' : null;
}

/** idle <-> wander / circle / eat cycle shared by every behavior. */
function doIdleWander(
  a: AnimalData,
  species: SpeciesDef,
  ctx: AIContext,
  out: AIOutput,
  radius: number,
  allowEat: boolean,
): void {
  const b = a.ai;
  switch (b.state) {
    case 'idle': {
      out.speed = 0;
      if (b.timer > 0) break;
      if (species.flying) {
        setState(b, 'circle', 6 + ctx.rng() * 6);
      } else if (allowEat && ctx.rng() < 0.3) {
        setState(b, 'eat', 3 + ctx.rng() * 3);
      } else {
        b.wanderTarget = pickWanderTarget(a, species, ctx, radius);
        setState(b, 'wander', 4 + ctx.rng() * 4);
      }
      break;
    }
    case 'wander': {
      if (!b.wanderTarget) b.wanderTarget = pickWanderTarget(a, species, ctx, radius);
      if (!b.wanderTarget) {
        setState(b, 'idle', 1 + ctx.rng() * 2);
        break;
      }
      const d = V.distanceXZ(a.position, b.wanderTarget);
      if (d <= AI_TUNING.ARRIVE_DIST || b.timer <= 0) {
        b.wanderTarget = null;
        setState(b, 'idle', 1 + ctx.rng() * 3);
        break;
      }
      moveToward(out, a, b.wanderTarget, species.speed * (species.behavior === 'prey' ? 0.5 : 0.4));
      break;
    }
    case 'circle': {
      const rel = V.sub(a.position, a.home);
      const dist = V.lengthXZ(rel);
      const radial = dist > 1e-6 ? V.normalizeXZ(rel) : V.fromHeading(a.heading);
      const tangent = { x: -radial.z, y: 0, z: radial.x };
      const correction = (AI_TUNING.CIRCLE_RADIUS - dist) * 0.15;
      out.moveDir = V.normalizeXZ(V.add(tangent, V.scale(radial, correction)));
      out.speed = species.speed * 0.5;
      if (b.timer <= 0) setState(b, 'idle', 1 + ctx.rng() * 2);
      break;
    }
    case 'eat': {
      out.speed = 0;
      if (b.timer <= 0) setState(b, 'idle', 1 + ctx.rng() * 2);
      break;
    }
    default:
      setState(b, 'idle', 1 + ctx.rng() * 2);
  }
}

function doReturn(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  b.aggro = Math.max(0, b.aggro - 0.05 * ctx.dt);
  if (V.distanceXZ(a.position, a.home) <= AI_TUNING.HOME_ARRIVE_DIST) {
    setState(b, 'idle', 1 + ctx.rng() * 2);
    out.speed = 0;
    return;
  }
  moveToward(out, a, a.home, species.speed * 0.6);
}

function doFlee(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  const near = nearestTarget(a, ctx);
  const range = senseRangeFor(species, ctx.timeOfDay);
  if (near && near.dist <= range * 1.2) b.fleeUntil = AI_TUNING.FLEE_TIME;
  b.fleeUntil -= ctx.dt;
  if (b.fleeUntil <= 0) {
    b.fleeUntil = 0;
    if (V.distanceXZ(a.position, a.home) > AI_TUNING.HOME_RADIUS) {
      beginReturn(a, species, ctx, out);
    } else {
      setState(b, 'idle', 1 + ctx.rng() * 2);
      out.speed = 0;
    }
    return;
  }
  if (near) moveAway(out, a, near.target.position, species.speed * 1.2);
  else {
    out.moveDir = V.fromHeading(a.heading);
    out.speed = species.speed * 1.2;
  }
}

/** Chase logic (stalk + attack) shared by predators and provoked neutrals. */
function doChase(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput, giveUp: boolean): void {
  const b = a.ai;
  const t = getTarget(ctx, b.targetId);
  b.chaseTime += ctx.dt;
  const d = t ? V.distanceXZ(a.position, t.position) : Infinity;
  const range = senseRangeFor(species, ctx.timeOfDay);
  if (!t || giveUp || d > range * 1.5 || b.chaseTime > AI_TUNING.CHASE_LIMIT) {
    beginReturn(a, species, ctx, out);
    return;
  }
  b.lastKnownTargetPos = V.clone(t.position);
  if (b.state === 'stalk') {
    b.aggro = clamp01(b.aggro + 0.05 * ctx.dt);
    if (d <= species.attackRange) {
      setState(b, 'attack');
      out.speed = 0;
      return;
    }
    moveToward(out, a, t.position, species.speed * (d < species.attackRange * 4 ? 1 : 0.85));
    return;
  }
  // attack
  if (d > species.attackRange * 1.3) {
    setState(b, 'stalk');
    moveToward(out, a, t.position, species.speed);
    return;
  }
  out.speed = 0;
  out.moveDir = V.normalizeXZ(V.sub(t.position, a.position));
  if (b.attackCooldown <= 0) {
    out.wantsAttack = { targetId: t.id };
    b.attackCooldown = AI_TUNING.ATTACK_COOLDOWN;
    b.aggro = clamp01(b.aggro + 0.2);
    out.sound = attackSound(species);
  }
}

function updatePredator(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  switch (b.state) {
    case 'sleep': {
      const t = findTarget(a, species, ctx, 0.8);
      if (t) {
        beginStalk(a, t, out, species, ctx);
        break;
      }
      if (!inSleepWindow(species, ctx.timeOfDay)) setState(b, 'idle', 1 + ctx.rng() * 2);
      out.speed = 0;
      break;
    }
    case 'idle':
    case 'wander':
    case 'circle':
    case 'eat': {
      const t = findTarget(a, species, ctx);
      if (t) {
        beginStalk(a, t, out, species, ctx);
        break;
      }
      if (inSleepWindow(species, ctx.timeOfDay)) {
        setState(b, 'sleep');
        out.speed = 0;
        break;
      }
      if (V.distanceXZ(a.position, a.home) > AI_TUNING.HOME_RADIUS) {
        beginReturn(a, species, ctx, out);
        break;
      }
      doIdleWander(a, species, ctx, out, AI_TUNING.WANDER_RADIUS, true);
      break;
    }
    case 'stalk':
    case 'attack':
      doChase(a, species, ctx, out, false);
      break;
    case 'return':
      doReturn(a, species, ctx, out);
      break;
    case 'flee':
      doFlee(a, species, ctx, out);
      break;
  }
}

function updatePrey(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  const lowHealth = a.health < AI_TUNING.LOW_HEALTH * a.maxHealth;
  switch (b.state) {
    case 'idle':
    case 'wander':
    case 'circle':
    case 'eat':
    case 'return':
    case 'sleep': {
      const t = findTarget(a, species, ctx, lowHealth ? 1.5 : 1);
      if (t) {
        beginFlee(a, out, species, ctx);
        break;
      }
      if (b.state === 'return') {
        doReturn(a, species, ctx, out);
        break;
      }
      if (b.state === 'sleep') {
        setState(b, 'idle', 1);
        break;
      }
      doIdleWander(a, species, ctx, out, AI_TUNING.WANDER_RADIUS, !lowHealth);
      break;
    }
    case 'flee':
      doFlee(a, species, ctx, out);
      break;
    case 'stalk':
    case 'attack':
      setState(b, 'idle', 1);
      break;
  }
}

function updateTerritorial(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  const range = senseRangeFor(species, ctx.timeOfDay);
  switch (b.state) {
    case 'idle':
    case 'wander':
    case 'circle':
    case 'eat':
    case 'sleep': {
      const t = findTarget(a, species, ctx, 0.6, a.home);
      if (t) {
        b.targetId = t.id;
        b.chaseTime = 0;
        b.lastKnownTargetPos = V.clone(t.position);
        setState(b, 'attack');
        out.sound = 'snarl';
        break;
      }
      if (V.distanceXZ(a.position, a.home) > range) {
        beginReturn(a, species, ctx, out);
        break;
      }
      doIdleWander(a, species, ctx, out, AI_TUNING.TERRITORY_WANDER_RADIUS, true);
      break;
    }
    case 'stalk':
    case 'attack': {
      const t = getTarget(ctx, b.targetId);
      b.chaseTime += ctx.dt;
      if (
        !t ||
        V.distanceXZ(a.position, a.home) > range ||
        V.distanceXZ(t.position, a.home) > range * 0.9 ||
        b.chaseTime > AI_TUNING.CHASE_LIMIT
      ) {
        beginReturn(a, species, ctx, out);
        break;
      }
      b.state = 'attack';
      b.lastKnownTargetPos = V.clone(t.position);
      const d = V.distanceXZ(a.position, t.position);
      if (d > species.attackRange) {
        moveToward(out, a, t.position, species.speed);
        break;
      }
      out.speed = 0;
      out.moveDir = V.normalizeXZ(V.sub(t.position, a.position));
      if (b.attackCooldown <= 0) {
        out.wantsAttack = { targetId: t.id };
        b.attackCooldown = AI_TUNING.ATTACK_COOLDOWN;
        b.aggro = clamp01(b.aggro + 0.2);
        out.sound = attackSound(species);
      }
      break;
    }
    case 'return':
      doReturn(a, species, ctx, out);
      break;
    case 'flee':
      doFlee(a, species, ctx, out);
      break;
  }
}

function updateNeutral(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  const b = a.ai;
  switch (b.state) {
    case 'idle':
    case 'wander':
    case 'circle':
    case 'eat':
    case 'sleep': {
      if (b.aggro > AI_TUNING.AGGRO_THRESHOLD) {
        const t = findTarget(a, species, ctx, 1.2);
        if (t) {
          beginStalk(a, t, out, species, ctx);
          break;
        }
      }
      b.aggro = Math.max(0, b.aggro - 0.02 * ctx.dt);
      if (V.distanceXZ(a.position, a.home) > AI_TUNING.HOME_RADIUS) {
        beginReturn(a, species, ctx, out);
        break;
      }
      doIdleWander(a, species, ctx, out, AI_TUNING.WANDER_RADIUS, true);
      break;
    }
    case 'stalk':
    case 'attack':
      doChase(a, species, ctx, out, b.aggro <= AI_TUNING.AGGRO_THRESHOLD);
      break;
    case 'return':
      doReturn(a, species, ctx, out);
      break;
    case 'flee':
      doFlee(a, species, ctx, out);
      break;
  }
}

/** Aquatic animals never step onto land: try alternative headings, else stop. */
function constrainToWater(a: AnimalData, species: SpeciesDef, ctx: AIContext, out: AIOutput): void {
  if (!species.aquatic || out.speed <= 0) return;
  const step = out.speed * ctx.dt;
  const ok = (dir: Vec3): boolean => ctx.isWater(V.add(a.position, V.scale(dir, step)));
  if (ok(out.moveDir)) return;
  const angles = [Math.PI / 3, -Math.PI / 3, (2 * Math.PI) / 3, (-2 * Math.PI) / 3, Math.PI, ctx.rng() * Math.PI * 2];
  for (const ang of angles) {
    const dir = V.rotateY(out.moveDir, ang);
    if (ok(dir)) {
      out.moveDir = dir;
      out.speed *= 0.7;
      if (a.ai.state === 'wander') a.ai.wanderTarget = null;
      return;
    }
  }
  out.moveDir = { x: 0, y: 0, z: 0 };
  out.speed = 0;
  if (a.ai.state === 'wander') a.ai.wanderTarget = null;
}

// ---------------------------------------------------------------------------
// public update

/** Decide the animal's intent for this tick. Mutates `a.ai` only. */
export function updateAnimalAI(a: AnimalData, species: SpeciesDef, ctx: AIContext): AIOutput {
  const b = a.ai;
  const out = emptyOutput(b.state);
  if (!a.alive) return out;

  b.timer -= ctx.dt;
  b.stateTime += ctx.dt;
  b.attackCooldown = Math.max(0, b.attackCooldown - ctx.dt);

  switch (species.behavior) {
    case 'predator':
      updatePredator(a, species, ctx, out);
      break;
    case 'prey':
      updatePrey(a, species, ctx, out);
      break;
    case 'territorial':
      updateTerritorial(a, species, ctx, out);
      break;
    case 'neutral':
      updateNeutral(a, species, ctx, out);
      break;
  }

  constrainToWater(a, species, ctx, out);
  if (out.speed <= 0) out.moveDir = { x: 0, y: 0, z: 0 };
  out.state = b.state;
  return out;
}

/** Integrate the AI output into position and heading (xz only; y is left to the world). */
export function applyMovement(a: AnimalData, out: AIOutput, dt: number): void {
  if (!a.alive || out.speed <= 0) return;
  a.position = V.add(a.position, V.scale(out.moveDir, out.speed * dt));
  if (out.moveDir.x !== 0 || out.moveDir.z !== 0) a.heading = V.toHeading(out.moveDir);
}

/** updateAnimalAI + applyMovement. */
export function stepAnimal(a: AnimalData, species: SpeciesDef, ctx: AIContext): AIOutput {
  const out = updateAnimalAI(a, species, ctx);
  applyMovement(a, out, ctx.dt);
  return out;
}
