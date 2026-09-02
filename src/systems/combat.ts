// Predator encounter resolution: telegraphed attacks, timed dodges, counters,
// intimidation. Pure logic, no Three.js.
import type { AbilityId, ItemId, SpeciesDef, SpeciesId } from '@/core/types';
import { weaponDamage } from '@/systems/crafting';

export interface AttackTelegraph {
  species: SpeciesId;
  /** seconds from telegraph start to the strike */
  windup: number;
  /** base dodge window width (seconds) around the strike moment */
  window: number;
  elapsed: number;
  /** true once the strike moment has been reported by tickTelegraph */
  resolved: boolean;
}

export type DodgeOutcome = 'perfect' | 'good' | 'early' | 'late' | 'miss';

export const BASE_DODGE_WINDOW = 0.35;
export const COUNTER_MULT = 2.5;
/** reference speed at which windup is unscaled */
const REFERENCE_SPEED = 7;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Begin a telegraphed attack. Windup is 0.9-1.6 s for a reference-speed
 * predator and shrinks for faster species (divided by a clamped speed factor).
 */
export function startAttack(species: SpeciesDef, rng: () => number): AttackTelegraph {
  const speedFactor = clamp(species.speed / REFERENCE_SPEED, 0.6, 1.6);
  const base = 0.9 + rng() * 0.7;
  return {
    species: species.id,
    windup: base / speedFactor,
    window: BASE_DODGE_WINDOW,
    elapsed: 0,
    resolved: false,
  };
}

/** Advance the telegraph; returns 'strike' exactly once when the windup elapses. */
export function tickTelegraph(t: AttackTelegraph, dt: number): 'pending' | 'strike' {
  t.elapsed += dt;
  if (!t.resolved && t.elapsed >= t.windup) {
    t.resolved = true;
    return 'strike';
  }
  return 'pending';
}

/**
 * Judge a dodge input pressed `inputTimeSinceStart` seconds after the telegraph
 * began (null = never pressed). With w = window * dodgeWindowMult and
 * d = input - windup:
 *   perfect : |d| <= w/2            (no damage, counter-attack allowed)
 *   good    : -w <= d < -w/2        (slightly early: no damage, no counter)
 *   early   : d < -w                (far too early: the predator adapts -> hit)
 *   late    : d > w/2               (too late -> hit)
 *   miss    : no input              (hit)
 */
export function resolveDodge(
  t: AttackTelegraph,
  inputTimeSinceStart: number | null,
  dodgeWindowMult = 1,
): DodgeOutcome {
  if (inputTimeSinceStart === null || !Number.isFinite(inputTimeSinceStart)) return 'miss';
  const w = t.window * Math.max(0.05, dodgeWindowMult);
  const d = inputTimeSinceStart - t.windup;
  if (Math.abs(d) <= w / 2) return 'perfect';
  if (d < -w) return 'early';
  if (d > w * 0.5) return 'late';
  return 'good';
}

/** Whether the outcome results in the player taking the hit. */
export const dodgeIsHit = (o: DodgeOutcome): boolean => o === 'early' || o === 'late' || o === 'miss';

/** Whether the outcome opens a counter-attack opportunity. */
export const dodgeAllowsCounter = (o: DodgeOutcome): boolean => o === 'perfect';

/** Damage dealt to the player by a landed hit (at least 1, never more than max health). */
export function hitDamage(species: SpeciesDef, playerMaxHealth: number, stageMult = 1): number {
  const raw = Math.round(species.damage * stageMult);
  return Math.max(1, Math.min(raw, Math.max(1, playerMaxHealth)));
}

/** Player strikes the animal. A counter (after a perfect dodge) with the ability deals 2.5x. */
export function attackAnimal(
  animalHealth: number,
  weapon: ItemId | null,
  isCounter: boolean,
  abilities: Set<AbilityId>,
): { damage: number; health: number; killed: boolean } {
  const mult = isCounter && abilities.has('counter_attack') ? COUNTER_MULT : 1;
  const damage = weaponDamage(weapon) * mult;
  const health = Math.max(0, animalHealth - damage);
  return { damage, health, killed: health <= 0 };
}

/**
 * Probability (0..1) that a display of intimidation scares the animal off.
 * Requires the 'intimidate' ability and an intimidatable species.
 */
export function intimidateChance(
  species: SpeciesDef,
  clanNearby: number,
  abilities: Set<AbilityId>,
  heldWeapon: ItemId | null,
): number {
  if (!species.intimidatable || !abilities.has('intimidate')) return 0;
  let chance = 0.35 + 0.15 * Math.max(0, clanNearby) + (heldWeapon ? 0.15 : 0);
  if (species.id === 'machairodus') chance -= 0.15;
  return clamp(chance, 0, 0.95);
}

export function tryIntimidate(
  species: SpeciesDef,
  clanNearby: number,
  abilities: Set<AbilityId>,
  heldWeapon: ItemId | null,
  rng: () => number,
): boolean {
  const chance = intimidateChance(species, clanNearby, abilities, heldWeapon);
  if (chance <= 0) return false;
  return rng() < chance;
}

/** Coarse danger rating by damage: 1 (<18), 2 (18..34), 3 (>=35). */
export function predatorThreatLevel(species: SpeciesDef): 1 | 2 | 3 {
  if (species.damage >= 35) return 3;
  if (species.damage >= 18) return 2;
  return 1;
}
