// Evolution: feats, generation change, mutations, evolution leaps, lineage timeline.
// Pure logic - no Three.js.

import type { ClanState, FeatDef, HominidData, LineageState, NeuronId } from '@/core/types';
import { FEATS } from '@/data/feats';
import { NEURONS } from '@/data/neurons';
import { pick, type Rng } from '@/util/rng';
import { applyGenerationToNeurons } from '@/systems/neuronal';
import { isAlive, livingMembers, maxStatsForStage } from '@/systems/clan';

export const START_YEARS_AGO = 10_000_000;
export const GOAL_YEARS_AGO = 2_000_000;
export const YEARS_PER_GENERATION = 15;
export const LEAP_BASE_YEARS = 100_000;
export const LEAP_MAX_YEARS = 1_500_000;
export const MUTATION_CHANCE = 0.35;

export interface GenerationResult {
  died: string[];
  matured: string[];
  mutations: { hominidId: string; neuron: NeuronId }[];
  lostNeurons: { hominidId: string; neurons: NeuronId[] }[];
  newPlayerId: string;
}

export interface LeapResult {
  yearsAdvanced: number;
  generation: GenerationResult;
  yearsAgoAfter: number;
}

export function createLineage(): LineageState {
  return {
    yearsAgo: START_YEARS_AGO,
    generation: 1,
    feats: [],
    actionCounts: {},
    neuronalEnergy: 0,
    discoveries: [],
    areasExplored: [],
  };
}

/** Feats whose action count is now met and were not yet recorded. They are added to the lineage. */
export function checkFeats(lineage: LineageState): FeatDef[] {
  const achieved: FeatDef[] = [];
  for (const f of FEATS) {
    if (lineage.feats.includes(f.id)) continue;
    if ((lineage.actionCounts[f.action] ?? 0) >= f.count) {
      lineage.feats.push(f.id);
      achieved.push(f);
    }
  }
  return achieved;
}

/** Years an evolution leap advances: base plus the reductions earned by feats since the last leap, capped. */
export function yearsForLeap(featsSinceLastLeap: FeatDef[]): number {
  const bonus = featsSinceLastLeap.reduce((sum, f) => sum + f.yearsReduced, 0);
  return Math.min(LEAP_MAX_YEARS, LEAP_BASE_YEARS + bonus);
}

export function computeLeap(_lineage: LineageState, featsSinceLastLeap: FeatDef[]): { yearsAdvanced: number } {
  return { yearsAdvanced: yearsForLeap(featsSinceLastLeap) };
}

/**
 * Advance every living member one stage: baby->child, child->adult, adult->elder, elder->dead.
 * Survivors get stage-scaled max stats, are refilled and cleared of conditions. Already-dead members are skipped.
 */
export function ageHominidsOneGeneration(members: HominidData[], _rng?: Rng): { died: HominidData[]; survivors: HominidData[] } {
  const died: HominidData[] = [];
  const survivors: HominidData[] = [];
  for (const h of members) {
    if (!isAlive(h)) continue;
    h.ageYears += YEARS_PER_GENERATION;
    h.carriedBaby = null;
    if (h.stage === 'elder') {
      h.state = 'dead';
      h.stats.health = 0;
      h.isPlayer = false;
      died.push(h);
      continue;
    }
    h.stage = h.stage === 'baby' ? 'child' : h.stage === 'child' ? 'adult' : 'elder';
    h.maxStats = maxStatsForStage(h.stage);
    h.stats = { ...h.maxStats };
    h.conditions = [];
    h.state = 'idle';
    survivors.push(h);
  }
  return { died, survivors };
}

/** 35% chance of a random neuron not in `existing`; null otherwise (or when every neuron is taken). */
export function rollMutation(rng: Rng, existing: Set<NeuronId>): NeuronId | null {
  if (rng() >= MUTATION_CHANCE) return null;
  const candidates = NEURONS.filter((n) => !existing.has(n.id)).map((n) => n.id);
  if (candidates.length === 0) return null;
  return pick(rng, candidates);
}

const STAGE_FALLBACK_ORDER: Record<string, number> = { adult: 0, elder: 1, child: 2, baby: 3 };

/** Oldest adult; failing that the best available member by stage, then age. */
function chooseNewPlayer(survivors: HominidData[]): HominidData | undefined {
  return survivors
    .slice()
    .sort((a, b) => (STAGE_FALLBACK_ORDER[a.stage] - STAGE_FALLBACK_ORDER[b.stage]) || (b.ageYears - a.ageYears))[0];
}

/**
 * Generation change. Requires at least one living baby or child (throws Error('no_offspring') otherwise).
 * Un-reinforced, non-genetic neurons are lost; babies may receive a genetic mutation; everyone ages a stage.
 * Dead members are removed from the clan. If the player died, the oldest surviving adult takes over.
 */
export function generationChange(clan: ClanState, lineage: LineageState, rng: Rng): GenerationResult {
  const living = livingMembers(clan);
  if (!living.some((h) => h.stage === 'baby' || h.stage === 'child')) throw new Error('no_offspring');

  const lostNeurons: GenerationResult['lostNeurons'] = [];
  const mutations: GenerationResult['mutations'] = [];

  for (const h of living) {
    const kept = new Set<NeuronId>([...h.reinforced, ...h.genetic]);
    const lost = h.neurons.filter((n) => !kept.has(n));
    if (lost.length) lostNeurons.push({ hominidId: h.id, neurons: lost });
    if (h.stage === 'baby') {
      const mutation = rollMutation(rng, kept);
      if (mutation) {
        h.genetic.push(mutation);
        mutations.push({ hominidId: h.id, neuron: mutation });
      }
    }
  }

  const { died, survivors } = ageHominidsOneGeneration(living, rng);
  for (const h of survivors) applyGenerationToNeurons(h);

  clan.members = survivors;
  lineage.generation += 1;
  lineage.yearsAgo -= YEARS_PER_GENERATION;

  const player = survivors.find((h) => h.id === clan.playerId) ?? chooseNewPlayer(survivors);
  for (const h of survivors) h.isPlayer = h === player;
  clan.playerId = player ? player.id : '';

  return {
    died: died.map((h) => h.id),
    matured: survivors.map((h) => h.id),
    mutations,
    lostNeurons,
    newPlayerId: clan.playerId,
  };
}

/**
 * Evolution leap: every member's reinforced neurons become genetic for descendants, then a generation
 * change happens and the lineage jumps forward in time (never past the 2M-years goal).
 */
export function evolutionLeap(clan: ClanState, lineage: LineageState, rng: Rng, featsSinceLastLeap: FeatDef[]): LeapResult {
  const { yearsAdvanced } = computeLeap(lineage, featsSinceLastLeap);
  for (const h of livingMembers(clan)) {
    h.genetic = Array.from(new Set([...h.genetic, ...h.reinforced]));
  }
  const generation = generationChange(clan, lineage, rng);
  lineage.yearsAgo = Math.max(GOAL_YEARS_AGO, lineage.yearsAgo - yearsAdvanced);
  return { yearsAdvanced, generation, yearsAgoAfter: lineage.yearsAgo };
}

export function isLineageLost(clan: ClanState): boolean {
  return livingMembers(clan).length === 0;
}

export function hasWon(lineage: LineageState): boolean {
  return lineage.yearsAgo <= GOAL_YEARS_AGO;
}

/** 0..1 progress along the timeline from 10M to 2M years ago. */
export function lineageProgress(lineage: LineageState): number {
  const p = (START_YEARS_AGO - lineage.yearsAgo) / (START_YEARS_AGO - GOAL_YEARS_AGO);
  return Math.max(0, Math.min(1, p));
}
