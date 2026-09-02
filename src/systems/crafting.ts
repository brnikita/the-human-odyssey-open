// Crafting: item + item -> item recipes, single-item alterations, and tool checks
// for harvesting plants and hunting animals. Pure logic, no Three.js.
import type { AbilityId, ItemId, PlantDef, SpeciesDef } from '@/core/types';
import { ITEMS } from '@/data/items';

export interface Recipe {
  a: ItemId;
  b: ItemId;
  result: ItemId;
  /** ability required to perform the combination (none = always possible) */
  ability?: AbilityId;
  /** which ingredient(s) are used up; the result takes the consumed slot */
  consumes: 'a' | 'b' | 'both';
  description: string;
}

export interface Alteration {
  from: ItemId;
  to: ItemId;
  ability: AbilityId;
  description: string;
}

export type HeldItems = { left: ItemId | null; right: ItemId | null };

/** Recipes are symmetric: `a`/`b` may be held in either hand. */
export const RECIPES: Recipe[] = [
  {
    a: 'stick', b: 'grinder', result: 'sharp_stick', ability: 'use_two_hands', consumes: 'a',
    description: 'Rub a dead branch against a grinder to sharpen its tip.',
  },
  {
    a: 'bone', b: 'grinder', result: 'bone_sharp', ability: 'use_two_hands', consumes: 'a',
    description: 'Grind a bone against a grinder into a pointed shard.',
  },
  {
    a: 'coconut', b: 'stone_granite', result: 'coconut_open', consumes: 'a',
    description: 'Smash a coconut open with a granite stone.',
  },
  {
    a: 'coconut', b: 'stone_basalt', result: 'coconut_open', consumes: 'a',
    description: 'Smash a coconut open with a basalt stone.',
  },
  {
    a: 'coconut', b: 'chopper', result: 'coconut_open', consumes: 'a',
    description: 'Split a coconut with a chopper.',
  },
  {
    a: 'stone_obsidian', b: 'stone_granite', result: 'chopper', ability: 'craft_chopper', consumes: 'a',
    description: 'Chip obsidian with a granite hammerstone to make a cutting edge.',
  },
  {
    a: 'stone_basalt', b: 'stone_granite', result: 'chopper', ability: 'craft_chopper', consumes: 'a',
    description: 'Knap basalt with a granite hammerstone into a chopper.',
  },
];

/** Single-item modifications performed with the hands (require an ability). */
export const ALTERATIONS: Alteration[] = [
  {
    from: 'branch', to: 'stick', ability: 'alter_stick',
    description: 'Strip the leaves off a leafy branch to make a stick.',
  },
  {
    from: 'stone_granite', to: 'grinder', ability: 'craft_grinder',
    description: 'Flatten one face of a granite stone into a grinder.',
  },
  {
    from: 'reed', to: 'fibers', ability: 'alter_stick',
    description: 'Split a reed lengthwise into plant fibers.',
  },
];

const BARE_HAND_DAMAGE = 2;

export function findRecipe(a: ItemId, b: ItemId): Recipe | null {
  for (const r of RECIPES) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
  }
  return null;
}

export function canCombine(
  a: ItemId,
  b: ItemId,
  abilities: Set<AbilityId>,
): { ok: boolean; recipe?: Recipe; reason?: 'no_recipe' | 'ability' } {
  const recipe = findRecipe(a, b);
  if (!recipe) return { ok: false, reason: 'no_recipe' };
  if (recipe.ability && !abilities.has(recipe.ability)) return { ok: false, recipe, reason: 'ability' };
  return { ok: true, recipe };
}

/**
 * Combine the two held items. On success the result replaces the consumed
 * ingredient's slot (for `consumes: 'both'` the result goes to the right hand
 * and the left is emptied). The input object is never mutated.
 */
export function combine(
  held: HeldItems,
  abilities: Set<AbilityId>,
): { ok: boolean; held: HeldItems; result?: ItemId; reason?: string } {
  const out: HeldItems = { left: held.left, right: held.right };
  if (!held.left || !held.right) return { ok: false, held: out, reason: 'need_two_items' };
  const check = canCombine(held.left, held.right, abilities);
  if (!check.ok || !check.recipe) return { ok: false, held: out, reason: check.reason };
  const recipe = check.recipe;
  // Which hand holds recipe ingredient `a`? (a === b never occurs in RECIPES.)
  const aSlot: keyof HeldItems = held.left === recipe.a ? 'left' : 'right';
  const bSlot: keyof HeldItems = aSlot === 'left' ? 'right' : 'left';
  if (recipe.consumes === 'a') out[aSlot] = recipe.result;
  else if (recipe.consumes === 'b') out[bSlot] = recipe.result;
  else {
    out.left = null;
    out.right = recipe.result;
  }
  return { ok: true, held: out, result: recipe.result };
}

export function findAlteration(item: ItemId): Alteration | null {
  return ALTERATIONS.find((alt) => alt.from === item) ?? null;
}

export function canAlter(item: ItemId, abilities: Set<AbilityId>): boolean {
  const alt = findAlteration(item);
  return !!alt && abilities.has(alt.ability);
}

/** Result of altering `item`, or null if impossible (no alteration or ability missing). */
export function alter(item: ItemId, abilities: Set<AbilityId>): ItemId | null {
  const alt = findAlteration(item);
  if (!alt || !abilities.has(alt.ability)) return null;
  return alt.to;
}

/** Roll whether a tool breaks on use, using ITEMS fragility (0 = never breaks). */
export function toolBreaks(item: ItemId, rng: () => number, fragilityMult = 1): boolean {
  const fragility = ITEMS[item]?.fragility ?? 0;
  if (fragility <= 0) return false;
  return rng() < Math.min(1, fragility * fragilityMult);
}

/** True if the plant needs no tool, or either hand holds one of the required tools. */
export function canHarvestPlant(plant: PlantDef, held: HeldItems): boolean {
  const req = plant.requiresTool;
  if (!req || req.length === 0) return true;
  return (held.left !== null && req.includes(held.left)) || (held.right !== null && req.includes(held.right));
}

/** True if the species can be hunted with `weapon`. Species without `killableWith` are unkillable. */
export function canKill(species: SpeciesDef, weapon: ItemId | null): boolean {
  if (!species.killableWith || weapon === null) return false;
  return species.killableWith.includes(weapon);
}

/** Attack strength of a held item, or bare-hand damage (2) when empty / item has no damage. */
export function weaponDamage(weapon: ItemId | null): number {
  if (weapon === null) return BARE_HAND_DAMAGE;
  return ITEMS[weapon]?.damage ?? BARE_HAND_DAMAGE;
}

/** Best weapon among the held items (highest damage), or null if both hands are empty. */
export function bestWeapon(held: HeldItems): ItemId | null {
  const l = held.left;
  const r = held.right;
  if (l === null) return r;
  if (r === null) return l;
  return weaponDamage(l) >= weaponDamage(r) ? l : r;
}
