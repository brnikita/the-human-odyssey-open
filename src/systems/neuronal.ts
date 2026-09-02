// Neuronal network: energy gain, unlock rules, reinforcement, generation carry-over.
// Pure logic - no Three.js.

import type { AbilityId, ActionId, HominidData, LineageState, NeuronId } from '@/core/types';
import { NEURONS, getNeuron } from '@/data/neurons';

export interface Modifiers {
  speed: number;
  climb: number;
  sense: { sight: number; smell: number; hearing: number };
  abilities: Set<AbilityId>;
  fear: number;
  metabolism: number;
  dodgeWindow: number;
  neuronGain: number;
  twoHands: boolean;
  bipedal: boolean;
  statMult: { health: number; energy: number; hunger: number; thirst: number };
}

export type UnlockReason = 'unknown' | 'already' | 'requires' | 'locked' | 'energy';
export type ReinforceReason = 'unknown' | 'not_unlocked' | 'already' | 'energy';

export interface UnlockContext {
  unlocked: Set<NeuronId>;
  energy: number;
  actionCounts: Partial<Record<ActionId, number>>;
}

/** Neutral modifiers: all multipliers 1, no abilities. */
export function baseModifiers(): Modifiers {
  return {
    speed: 1,
    climb: 1,
    sense: { sight: 1, smell: 1, hearing: 1 },
    abilities: new Set<AbilityId>(),
    fear: 1,
    metabolism: 1,
    dodgeWindow: 1,
    neuronGain: 1,
    twoHands: false,
    bipedal: false,
    statMult: { health: 1, energy: 1, hunger: 1, thirst: 1 },
  };
}

/** Compose the effects of every unlocked neuron. Multipliers multiply, abilities union. Unknown ids ignored. */
export function computeModifiers(unlocked: Iterable<NeuronId>): Modifiers {
  const m = baseModifiers();
  for (const id of new Set(unlocked)) {
    const def = getNeuron(id);
    if (!def) continue;
    for (const e of def.effects) {
      switch (e.type) {
        case 'stat':
          m.statMult[e.stat] *= e.mult;
          break;
        case 'speed':
          m.speed *= e.mult;
          break;
        case 'climb':
          m.climb *= e.mult;
          break;
        case 'sense':
          m.sense[e.sense] *= e.mult;
          break;
        case 'ability':
          m.abilities.add(e.ability);
          break;
        case 'fear':
          m.fear *= e.mult;
          break;
        case 'metabolism':
          m.metabolism *= e.mult;
          break;
        case 'dodgeWindow':
          m.dodgeWindow *= e.mult;
          break;
        case 'neuronGain':
          m.neuronGain *= e.mult;
          break;
        case 'twoHands':
          m.twoHands = true;
          m.abilities.add('use_two_hands');
          break;
        case 'bipedal':
          m.bipedal = true;
          m.twoHands = true;
          m.abilities.add('bipedalism');
          m.abilities.add('use_two_hands');
          break;
      }
    }
  }
  return m;
}

/** 0..1 progress toward the unlock condition of a neuron (1 when it has none, 0 for unknown ids). */
export function neuronProgress(id: NeuronId, actionCounts: Partial<Record<ActionId, number>>): number {
  const def = getNeuron(id);
  if (!def) return 0;
  const cond = def.unlockCondition;
  if (!cond || cond.count <= 0) return 1;
  const have = actionCounts[cond.action] ?? 0;
  return Math.max(0, Math.min(1, have / cond.count));
}

export function canUnlock(id: NeuronId, ctx: UnlockContext): { ok: boolean; reason?: UnlockReason } {
  const def = getNeuron(id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (ctx.unlocked.has(id)) return { ok: false, reason: 'already' };
  for (const req of def.requires) {
    if (!ctx.unlocked.has(req)) return { ok: false, reason: 'requires' };
  }
  if (def.unlockCondition) {
    const have = ctx.actionCounts[def.unlockCondition.action] ?? 0;
    if (have < def.unlockCondition.count) return { ok: false, reason: 'locked' };
  }
  if (ctx.energy < def.cost) return { ok: false, reason: 'energy' };
  return { ok: true };
}

export function unlockContextFor(h: HominidData, lineage: LineageState): UnlockContext {
  return { unlocked: new Set(h.neurons), energy: lineage.neuronalEnergy, actionCounts: lineage.actionCounts };
}

/** Spend lineage energy to unlock a neuron on this hominid. Returns whether it happened. */
export function unlockNeuron(h: HominidData, lineage: LineageState, id: NeuronId): boolean {
  const res = canUnlock(id, unlockContextFor(h, lineage));
  if (!res.ok) return false;
  const def = getNeuron(id)!;
  lineage.neuronalEnergy -= def.cost;
  h.neurons.push(id);
  return true;
}

/** Reinforcing costs half the unlock price (rounded up). 0 for unknown ids. */
export function reinforceCost(id: NeuronId): number {
  const def = getNeuron(id);
  return def ? Math.ceil(def.cost * 0.5) : 0;
}

export function canReinforce(h: HominidData, lineage: LineageState, id: NeuronId): { ok: boolean; reason?: ReinforceReason } {
  const def = getNeuron(id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!h.neurons.includes(id)) return { ok: false, reason: 'not_unlocked' };
  if (h.reinforced.includes(id)) return { ok: false, reason: 'already' };
  if (lineage.neuronalEnergy < reinforceCost(id)) return { ok: false, reason: 'energy' };
  return { ok: true };
}

/** Reinforce an unlocked neuron so it survives the next generation change. */
export function reinforceNeuron(h: HominidData, lineage: LineageState, id: NeuronId): boolean {
  if (!canReinforce(h, lineage, id).ok) return false;
  lineage.neuronalEnergy -= reinforceCost(id);
  h.reinforced.push(id);
  return true;
}

/** Neurons that can be bought now, or could be as soon as enough energy is gathered. */
export function availableNeurons(ctx: UnlockContext): NeuronId[] {
  const out: NeuronId[] = [];
  for (const n of NEURONS) {
    const r = canUnlock(n.id, ctx);
    if (r.ok || r.reason === 'energy') out.push(n.id);
  }
  return out;
}

export function recordAction(lineage: LineageState, action: ActionId, n = 1): void {
  lineage.actionCounts[action] = (lineage.actionCounts[action] ?? 0) + n;
}

/** Neuronal energy granted per action, before multipliers. */
export const BASE_ENERGY: Partial<Record<ActionId, number>> = {
  walk: 0.05,
  run: 0.08,
  climb: 0.5,
  jump: 0.3,
  swim: 0.6,
  identify: 8,
  smell: 1.5,
  hear: 1.5,
  eat: 2,
  drink: 1,
  sleep: 5,
  pickup: 0.8,
  craft: 12,
  alter: 8,
  attack: 3,
  dodge: 4,
  intimidate: 5,
  groom: 4,
  mate: 15,
  carry_baby: 0.2,
  discover_area: 20,
  overcome_fear: 30,
  kill: 25,
  call: 2,
  heal: 10,
  fall: 1,
};

/** Award energy for an action (each carried baby adds +50%), record the action, return the energy added. */
export function gainEnergy(lineage: LineageState, action: ActionId, mods: Modifiers, babiesCarried: number): number {
  const base = BASE_ENERGY[action] ?? 0;
  const gained = base * mods.neuronGain * (1 + 0.5 * Math.max(0, babiesCarried));
  lineage.neuronalEnergy += gained;
  recordAction(lineage, action, 1);
  return gained;
}

/** After a generation change only reinforced and genetic neurons remain unlocked. */
export function applyGenerationToNeurons(h: HominidData): void {
  h.neurons = Array.from(new Set([...h.reinforced, ...h.genetic]));
}
