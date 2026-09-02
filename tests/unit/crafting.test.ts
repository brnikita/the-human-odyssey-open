import { describe, expect, it } from 'vitest';
import type { AbilityId } from '@/core/types';
import { ITEMS } from '@/data/items';
import { PLANTS } from '@/data/plants';
import { SPECIES } from '@/data/species';
import {
  ALTERATIONS,
  RECIPES,
  alter,
  bestWeapon,
  canAlter,
  canCombine,
  canHarvestPlant,
  canKill,
  combine,
  findRecipe,
  toolBreaks,
  weaponDamage,
} from '@/systems/crafting';

const abilities = (...ids: AbilityId[]) => new Set<AbilityId>(ids);
const NONE = abilities();

describe('crafting recipes', () => {
  it('has at least 6 recipes referencing valid items', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(6);
    for (const r of RECIPES) {
      expect(ITEMS[r.a]).toBeDefined();
      expect(ITEMS[r.b]).toBeDefined();
      expect(ITEMS[r.result]).toBeDefined();
      expect(r.a).not.toBe(r.b);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it('findRecipe is symmetric', () => {
    for (const r of RECIPES) {
      expect(findRecipe(r.a, r.b)).toBe(r);
      expect(findRecipe(r.b, r.a)).toBe(r);
    }
    expect(findRecipe('banana', 'mango')).toBeNull();
  });

  it('gates recipes behind abilities', () => {
    expect(canCombine('stick', 'grinder', NONE)).toMatchObject({ ok: false, reason: 'ability' });
    expect(canCombine('stick', 'grinder', abilities('use_two_hands'))).toMatchObject({ ok: true });
    expect(canCombine('coconut', 'stone_granite', NONE)).toMatchObject({ ok: true });
    expect(canCombine('banana', 'stick', abilities('use_two_hands'))).toEqual({ ok: false, reason: 'no_recipe' });
  });

  it('combine places the result in the consumed slot regardless of hand order', () => {
    const r1 = combine({ left: 'stick', right: 'grinder' }, abilities('use_two_hands'));
    expect(r1.ok).toBe(true);
    expect(r1.result).toBe('sharp_stick');
    expect(r1.held).toEqual({ left: 'sharp_stick', right: 'grinder' });

    const r2 = combine({ left: 'grinder', right: 'stick' }, abilities('use_two_hands'));
    expect(r2.held).toEqual({ left: 'grinder', right: 'sharp_stick' });

    const r3 = combine({ left: 'stone_granite', right: 'coconut' }, NONE);
    expect(r3.held).toEqual({ left: 'stone_granite', right: 'coconut_open' });
  });

  it('combine fails without two items, without ability, or without a recipe; never mutates input', () => {
    const held = { left: 'stick' as const, right: null };
    const r = combine(held, abilities('use_two_hands'));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('need_two_items');
    expect(r.held).toEqual(held);

    const held2 = { left: 'stick' as const, right: 'grinder' as const };
    const r2 = combine(held2, NONE);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('ability');
    expect(held2).toEqual({ left: 'stick', right: 'grinder' });

    expect(combine({ left: 'banana', right: 'mango' }, NONE).reason).toBe('no_recipe');
  });

  it('crafts a chopper from obsidian or basalt with a granite hammerstone', () => {
    const craft = abilities('craft_chopper');
    expect(combine({ left: 'stone_obsidian', right: 'stone_granite' }, craft).held).toEqual({
      left: 'chopper', right: 'stone_granite',
    });
    expect(combine({ left: 'stone_granite', right: 'stone_basalt' }, craft).held).toEqual({
      left: 'stone_granite', right: 'chopper',
    });
    expect(combine({ left: 'stone_obsidian', right: 'stone_granite' }, NONE).ok).toBe(false);
  });
});

describe('alterations', () => {
  it('lists at least two valid alterations', () => {
    expect(ALTERATIONS.length).toBeGreaterThanOrEqual(2);
    for (const a of ALTERATIONS) {
      expect(ITEMS[a.from]).toBeDefined();
      expect(ITEMS[a.to]).toBeDefined();
    }
  });

  it('branch -> stick needs alter_stick, granite -> grinder needs craft_grinder', () => {
    expect(canAlter('branch', NONE)).toBe(false);
    expect(alter('branch', NONE)).toBeNull();
    expect(canAlter('branch', abilities('alter_stick'))).toBe(true);
    expect(alter('branch', abilities('alter_stick'))).toBe('stick');
    expect(alter('stone_granite', abilities('alter_stick'))).toBeNull();
    expect(alter('stone_granite', abilities('craft_grinder'))).toBe('grinder');
    expect(alter('banana', abilities('alter_stick', 'craft_grinder'))).toBeNull();
  });
});

describe('tools', () => {
  it('toolBreaks follows ITEMS fragility', () => {
    expect(toolBreaks('stick', () => 0)).toBe(false); // no fragility -> never
    expect(toolBreaks('sharp_stick', () => 0.01)).toBe(true); // 0.01 < 0.08
    expect(toolBreaks('sharp_stick', () => 0.5)).toBe(false);
    expect(toolBreaks('sharp_stick', () => 0.15, 2)).toBe(true); // 0.16 with mult
    expect(toolBreaks('sharp_stick', () => 0.15, 1)).toBe(false);
  });

  it('canHarvestPlant honors requiresTool in either hand', () => {
    expect(canHarvestPlant(PLANTS.berry_bush, { left: null, right: null })).toBe(true);
    expect(canHarvestPlant(PLANTS.beehive, { left: null, right: null })).toBe(false);
    expect(canHarvestPlant(PLANTS.beehive, { left: 'stick', right: null })).toBe(true);
    expect(canHarvestPlant(PLANTS.beehive, { left: null, right: 'sharp_stick' })).toBe(true);
    expect(canHarvestPlant(PLANTS.beehive, { left: 'coconut', right: 'banana' })).toBe(false);
  });

  it('canKill checks killableWith and rejects unkillable species / bare hands', () => {
    expect(canKill(SPECIES.machairodus, 'sharp_stick')).toBe(true);
    expect(canKill(SPECIES.machairodus, 'stick')).toBe(false);
    expect(canKill(SPECIES.machairodus, null)).toBe(false);
    expect(canKill(SPECIES.deinotherium, 'chopper')).toBe(false); // no killableWith
    expect(canKill(SPECIES.rat, 'stick')).toBe(true);
  });

  it('weaponDamage and bestWeapon', () => {
    expect(weaponDamage(null)).toBe(2);
    expect(weaponDamage('chopper')).toBe(ITEMS.chopper.damage);
    expect(weaponDamage('reed')).toBe(2); // item without damage
    expect(bestWeapon({ left: null, right: null })).toBeNull();
    expect(bestWeapon({ left: 'stick', right: null })).toBe('stick');
    expect(bestWeapon({ left: 'stick', right: 'chopper' })).toBe('chopper');
    expect(bestWeapon({ left: 'chopper', right: 'stick' })).toBe('chopper');
  });
});
