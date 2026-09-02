// Factory helpers for HominidData. Pure TS - no Three.js.
import type { AgeStage, HominidData, Stats } from '@/core/types';

/** Age thresholds (years) for each life stage. */
export const STAGE_AGE = { child: 3, adult: 10, elder: 35 } as const;

/** Representative age used when a stage is given without an explicit age. */
const DEFAULT_AGE_FOR_STAGE: Record<AgeStage, number> = {
  baby: 1,
  child: 6,
  adult: 20,
  elder: 40,
};

export interface StageMultiplier {
  health: number;
  energy: number;
  speed: number;
}

const STAGE_MULT: Record<AgeStage, StageMultiplier> = {
  baby: { health: 0.3, energy: 0.5, speed: 0.4 },
  child: { health: 0.6, energy: 0.8, speed: 0.8 },
  adult: { health: 1, energy: 1, speed: 1 },
  elder: { health: 0.8, energy: 0.7, speed: 0.75 },
};

export function stageFromAge(ageYears: number): AgeStage {
  if (ageYears < STAGE_AGE.child) return 'baby';
  if (ageYears < STAGE_AGE.adult) return 'child';
  if (ageYears < STAGE_AGE.elder) return 'adult';
  return 'elder';
}

export function stageStatMultiplier(stage: AgeStage): StageMultiplier {
  return { ...STAGE_MULT[stage] };
}

const fullStats = (): Stats => ({ health: 100, energy: 100, hunger: 100, thirst: 100 });

/**
 * Build a hominid with sensible defaults. Any field can be overridden.
 * If only `ageYears` is given the stage is derived from it; if only `stage`
 * is given a representative age is chosen. Arrays and nested objects passed
 * in overrides are copied so the returned hominid never aliases caller data.
 */
export function createHominid(overrides: Partial<HominidData> & { id: string }): HominidData {
  const stage: AgeStage =
    overrides.stage ?? (overrides.ageYears !== undefined ? stageFromAge(overrides.ageYears) : 'adult');
  const ageYears = overrides.ageYears ?? DEFAULT_AGE_FOR_STAGE[stage];

  const maxStats: Stats = { ...fullStats(), ...(overrides.maxStats ?? {}) };
  const stats: Stats = overrides.stats ? { ...overrides.stats } : { ...maxStats };

  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    sex: overrides.sex ?? 'female',
    stage,
    ageYears,
    stats,
    maxStats,
    conditions: overrides.conditions ? overrides.conditions.map((c) => ({ ...c })) : [],
    position: overrides.position ? { ...overrides.position } : { x: 0, y: 0, z: 0 },
    state: overrides.state ?? 'idle',
    held: overrides.held ? { ...overrides.held } : { left: null, right: null },
    carriedBaby: overrides.carriedBaby ?? null,
    isPlayer: overrides.isPlayer ?? false,
    isOutsider: overrides.isOutsider ?? false,
    bond: overrides.bond ?? 0,
    neurons: overrides.neurons ? [...overrides.neurons] : [],
    reinforced: overrides.reinforced ? [...overrides.reinforced] : [],
    genetic: overrides.genetic ? [...overrides.genetic] : [],
    fear: overrides.fear ?? 0,
    dopamine: overrides.dopamine ?? 50,
  };
}
