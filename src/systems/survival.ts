// Survival system: metabolism, conditions, healing, consumption. Pure TS.
import type { AbilityId, ConditionId, HominidData, ItemDef, Stats } from '@/core/types';

// ---------------------------------------------------------------------------
// Tuning constants (all rates are per second of game time)
// ---------------------------------------------------------------------------
export const SURVIVAL_RATES = {
  hungerDrain: 0.14,
  thirstDrain: 0.2,
  energyDrain: 0.09,
  runMult: 2.2,
  climbMult: 1.8,
  swimMult: 2.0,
  /** while sleeping: energy regen and drain factor for other stats */
  sleepEnergyRegen: 3,
  sleepDrainFactor: 0.5,
  /** health loss per second when hunger / thirst is at 0 (each) */
  starvationDamage: 0.8,
  dehydrationDamage: 1.0,
  /** health regen when well fed & hydrated */
  healthRegen: 0.4,
  regenHungerMin: 50,
  regenThirstMin: 50,
  /** conditions */
  bleedDamage: 1.2, // * severity
  bleedWorsen: 0.005, // severity per second
  poisonDamage: 0.8, // * severity
  poisonDecaySeconds: 180, // full severity fades in this time
  fractureHealSeconds: 400,
  coldOnsetSeconds: 20,
  coldDryOffSeconds: 20,
  coldEnergyDrain: 0.4,
  exhaustedDamage: 0.3,
  exhaustedRecoverEnergy: 30,
  /** max integration step used internally */
  maxStep: 0.5,
  /** water restored by drinking from a source */
  drinkAmount: 35,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SurvivalModifiers {
  /** global multiplier on hunger/thirst/energy drain (metabolism neurons) */
  metabolismMult: number;
  /** per-stat drain multiplier (hunger/thirst/energy); for health it scales regen */
  statMult: Partial<Stats>;
  hasAbility: (a: AbilityId) => boolean;
  isSleeping: boolean;
  isRunning: boolean;
  isClimbing: boolean;
  isSwimming: boolean;
  isRaining: boolean;
  nearFire?: boolean;
}

export const DEFAULT_MODS: SurvivalModifiers = {
  metabolismMult: 1,
  statMult: {},
  hasAbility: () => false,
  isSleeping: false,
  isRunning: false,
  isClimbing: false,
  isSwimming: false,
  isRaining: false,
  nearFire: false,
};

export type SurvivalEvent =
  | { type: 'died'; cause: string }
  | { type: 'condition_added'; id: ConditionId }
  | { type: 'condition_cured'; id: ConditionId }
  | { type: 'starving' }
  | { type: 'dehydrated' }
  | { type: 'exhausted' }
  | { type: 'condition_worsened'; id: ConditionId };

export interface ConsumeResult {
  events: SurvivalEvent[];
  poisoned: boolean;
  healed: ConditionId[];
}

// ---------------------------------------------------------------------------
// Transient per-hominid state that does not belong in the save data
// ---------------------------------------------------------------------------
interface Transient {
  wetTime: number;
  dryTime: number;
}
const transient = new WeakMap<HominidData, Transient>();
const getTransient = (h: HominidData): Transient => {
  let t = transient.get(h);
  if (!t) {
    t = { wetTime: 0, dryTime: 0 };
    transient.set(h, t);
  }
  return t;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const STAT_KEYS: (keyof Stats)[] = ['health', 'energy', 'hunger', 'thirst'];

export function clampStats(h: HominidData): void {
  for (const k of STAT_KEYS) {
    const max = Math.max(0, h.maxStats[k]);
    h.stats[k] = clamp(h.stats[k], 0, max);
  }
}

export function getCondition(h: HominidData, id: ConditionId) {
  return h.conditions.find((c) => c.id === id);
}

export const hasCondition = (h: HominidData, id: ConditionId): boolean => getCondition(h, id) !== undefined;

export function statPercent(h: HominidData, key: keyof Stats): number {
  const max = h.maxStats[key];
  if (max <= 0) return 0;
  return clamp(h.stats[key] / max, 0, 1);
}

/** Apply a condition. Returns true if newly added; otherwise raises severity to the max of both. */
export function applyCondition(h: HominidData, id: ConditionId, severity = 0.5): boolean {
  const sev = clamp(severity, 0, 1);
  const existing = getCondition(h, id);
  if (existing) {
    existing.severity = Math.max(existing.severity, sev);
    return false;
  }
  h.conditions.push({ id, severity: sev, time: 0 });
  return true;
}

/** Remove a condition. Returns true if it was present. */
export function cureCondition(h: HominidData, id: ConditionId): boolean {
  const idx = h.conditions.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  h.conditions.splice(idx, 1);
  if (id === 'cold') {
    const t = getTransient(h);
    t.wetTime = 0;
    t.dryTime = 0;
  }
  return true;
}

function kill(h: HominidData): void {
  h.stats.health = 0;
  h.state = 'dead';
}

/** Deal damage, optionally inflicting a condition. Returns true if the hominid died. */
export function applyDamage(h: HominidData, amount: number, inflicts?: ConditionId, severity = 0.5): boolean {
  if (h.state === 'dead') return false;
  h.stats.health -= Math.max(0, amount);
  if (inflicts) applyCondition(h, inflicts, severity);
  if (h.stats.health <= 0) {
    kill(h);
    return true;
  }
  return false;
}

/** Movement speed factor derived from active conditions and life state. */
export function speedMultiplierFromConditions(h: HominidData): number {
  if (h.state === 'dead') return 0;
  let m = 1;
  for (const c of h.conditions) {
    switch (c.id) {
      case 'fractured':
        m *= 0.5;
        break;
      case 'exhausted':
        m *= 0.7;
        break;
      case 'cold':
        m *= 0.85;
        break;
      default:
        break;
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------
function activityMultiplier(mods: SurvivalModifiers): number {
  if (mods.isSleeping) return 1;
  let m = 1;
  if (mods.isRunning) m = Math.max(m, SURVIVAL_RATES.runMult);
  if (mods.isClimbing) m = Math.max(m, SURVIVAL_RATES.climbMult);
  if (mods.isSwimming) m = Math.max(m, SURVIVAL_RATES.swimMult);
  return m;
}

/**
 * Advance survival simulation by `dt` seconds. Robust to large dt: the
 * integration is internally sub-stepped at most `maxStep` seconds at a time.
 */
export function tickSurvival(h: HominidData, dt: number, mods: SurvivalModifiers): SurvivalEvent[] {
  const events: SurvivalEvent[] = [];
  const alive = (): boolean => h.state !== 'dead';
  if (!alive() || !(dt > 0)) return events;

  let remaining = dt;
  while (remaining > 0 && alive()) {
    const step = Math.min(remaining, SURVIVAL_RATES.maxStep);
    remaining -= step;
    stepSurvival(h, step, mods, events);
  }
  return events;
}

function stepSurvival(h: HominidData, dt: number, mods: SurvivalModifiers, events: SurvivalEvent[]): void {
  const R = SURVIVAL_RATES;
  const s = h.stats;
  const sm = mods.statMult;
  const meta = mods.metabolismMult;
  const act = activityMultiplier(mods);
  const sleepFactor = mods.isSleeping ? R.sleepDrainFactor : 1;

  // Damage attribution for the death cause.
  const damage: Record<string, number> = {};
  const hurt = (cause: string, amount: number) => {
    if (amount <= 0) return;
    s.health -= amount;
    damage[cause] = (damage[cause] ?? 0) + amount;
  };

  const hungerBefore = s.hunger;
  const thirstBefore = s.thirst;
  const energyBefore = s.energy;

  // 1. Basic metabolism
  s.hunger -= R.hungerDrain * (sm.hunger ?? 1) * meta * act * sleepFactor * dt;
  s.thirst -= R.thirstDrain * (sm.thirst ?? 1) * meta * act * sleepFactor * dt;
  if (mods.isSleeping) {
    s.energy += R.sleepEnergyRegen * dt;
  } else {
    s.energy -= R.energyDrain * (sm.energy ?? 1) * meta * act * dt;
  }

  // 2. Conditions (time, effects, natural healing)
  for (let i = h.conditions.length - 1; i >= 0; i--) {
    const c = h.conditions[i];
    c.time += dt;
    switch (c.id) {
      case 'bleeding': {
        hurt('bleeding', R.bleedDamage * c.severity * dt);
        if (c.severity < 1) {
          const before = Math.floor(c.severity * 4);
          c.severity = Math.min(1, c.severity + R.bleedWorsen * dt);
          if (Math.floor(c.severity * 4) > before) events.push({ type: 'condition_worsened', id: 'bleeding' });
        }
        break;
      }
      case 'poisoned': {
        hurt('poison', R.poisonDamage * c.severity * dt);
        c.severity -= dt / R.poisonDecaySeconds;
        if (c.severity <= 0) {
          h.conditions.splice(i, 1);
          events.push({ type: 'condition_cured', id: 'poisoned' });
        }
        break;
      }
      case 'fractured': {
        if (c.time >= R.fractureHealSeconds) {
          h.conditions.splice(i, 1);
          events.push({ type: 'condition_cured', id: 'fractured' });
        }
        break;
      }
      case 'cold': {
        if (!mods.isSleeping) s.energy -= R.coldEnergyDrain * (0.5 + 0.5 * c.severity) * dt;
        break;
      }
      case 'exhausted': {
        if (s.energy > R.exhaustedRecoverEnergy) {
          h.conditions.splice(i, 1);
          events.push({ type: 'condition_cured', id: 'exhausted' });
        } else {
          hurt('exhaustion', R.exhaustedDamage * dt);
        }
        break;
      }
      default:
        break;
    }
  }

  // 3. Cold onset / drying
  const t = getTransient(h);
  const wet = mods.isRaining && !mods.nearFire;
  if (wet) {
    t.wetTime += dt;
    t.dryTime = 0;
    if (t.wetTime > R.coldOnsetSeconds && !hasCondition(h, 'cold')) {
      applyCondition(h, 'cold', 0.5);
      events.push({ type: 'condition_added', id: 'cold' });
    }
  } else {
    t.dryTime += dt;
    t.wetTime = 0;
    if (t.dryTime > R.coldDryOffSeconds && hasCondition(h, 'cold')) {
      cureCondition(h, 'cold');
      events.push({ type: 'condition_cured', id: 'cold' });
    }
  }

  // 4. Energy floor -> exhaustion
  if (s.energy <= 0) {
    s.energy = 0;
    if (energyBefore > 0) events.push({ type: 'exhausted' });
    if (applyCondition(h, 'exhausted', 0.5)) events.push({ type: 'condition_added', id: 'exhausted' });
  }

  // 5. Starvation / dehydration
  if (s.hunger <= 0) {
    s.hunger = 0;
    if (hungerBefore > 0) events.push({ type: 'starving' });
    hurt('starvation', R.starvationDamage * dt);
  }
  if (s.thirst <= 0) {
    s.thirst = 0;
    if (thirstBefore > 0) events.push({ type: 'dehydrated' });
    hurt('dehydration', R.dehydrationDamage * dt);
  }

  // 6. Regeneration
  if (
    s.hunger > R.regenHungerMin &&
    s.thirst > R.regenThirstMin &&
    !hasCondition(h, 'bleeding') &&
    !hasCondition(h, 'poisoned')
  ) {
    s.health += R.healthRegen * (sm.health ?? 1) * dt;
  }

  // 7. Clamp and death check
  clampStats(h);
  if (s.health <= 0) {
    let cause = 'injury';
    let worst = 0;
    for (const [k, v] of Object.entries(damage)) {
      if (v > worst) {
        worst = v;
        cause = k;
      }
    }
    kill(h);
    events.push({ type: 'died', cause });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Eat / apply an item. Nutrition is applied and clamped, cures applied, toxicity rolled. */
export function consume(
  h: HominidData,
  item: ItemDef,
  mods: SurvivalModifiers,
  rng: () => number,
): ConsumeResult {
  const result: ConsumeResult = { events: [], poisoned: false, healed: [] };
  if (h.state === 'dead') return result;

  if (item.nutrition) {
    for (const k of STAT_KEYS) {
      const v = item.nutrition[k];
      if (v) h.stats[k] += v;
    }
  }

  if (item.cures) {
    for (const id of item.cures) {
      if (cureCondition(h, id)) {
        result.healed.push(id);
        result.events.push({ type: 'condition_cured', id });
      }
    }
  }

  if (item.toxicity && item.toxicity > 0) {
    const immune = item.id === 'meat' && mods.hasAbility('eat_meat_raw');
    const chance = immune ? 0 : item.toxicity * mods.metabolismMult;
    if (chance > 0 && rng() < chance) {
      result.poisoned = true;
      if (applyCondition(h, 'poisoned', clamp(item.toxicity, 0.1, 1))) {
        result.events.push({ type: 'condition_added', id: 'poisoned' });
      }
    }
  }

  clampStats(h);
  return result;
}

/** Drink from a water source. Returns the thirst actually restored. */
export function drinkWater(h: HominidData, _mods: SurvivalModifiers = DEFAULT_MODS): number {
  if (h.state === 'dead') return 0;
  const before = h.stats.thirst;
  h.stats.thirst += SURVIVAL_RATES.drinkAmount;
  clampStats(h);
  return h.stats.thirst - before;
}

/** Sleep for `seconds`; runs the survival tick with isSleeping = true. */
export function sleep(h: HominidData, seconds: number, mods: SurvivalModifiers = DEFAULT_MODS): SurvivalEvent[] {
  return tickSurvival(h, seconds, {
    ...mods,
    isSleeping: true,
    isRunning: false,
    isClimbing: false,
    isSwimming: false,
  });
}
