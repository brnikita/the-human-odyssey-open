import type { ItemDef, ItemId } from '@/core/types';

export const ITEMS: Record<ItemId, ItemDef> = {
  stick: {
    id: 'stick', name: 'Dead Branch', category: 'material', holdable: true, damage: 4,
    description: 'A dry branch. Can be stripped and sharpened.', color: '#8a6b3f',
  },
  sharp_stick: {
    id: 'sharp_stick', name: 'Sharpened Stick', category: 'tool', holdable: true, damage: 14, fragility: 0.08,
    description: 'A pointed stick. Good for stabbing and for harvesting fibers.', color: '#a07d4b',
  },
  branch: {
    id: 'branch', name: 'Leafy Branch', category: 'material', holdable: true, damage: 2,
    description: 'A green branch full of leaves. Can be used for bedding.', color: '#4f7a2f',
  },
  stone_granite: {
    id: 'stone_granite', name: 'Granite Stone', category: 'material', holdable: true, damage: 8,
    description: 'A heavy rough stone. Can break coconuts and make a grinder.', color: '#9a9590',
  },
  stone_basalt: {
    id: 'stone_basalt', name: 'Basalt Stone', category: 'material', holdable: true, damage: 9,
    description: 'A dark volcanic stone.', color: '#3f3f42',
  },
  stone_obsidian: {
    id: 'stone_obsidian', name: 'Obsidian', category: 'material', holdable: true, damage: 10,
    description: 'Volcanic glass. Very sharp edges once chipped.', color: '#1b1b22',
  },
  grinder: {
    id: 'grinder', name: 'Grinder', category: 'tool', holdable: true, damage: 10, fragility: 0.05,
    description: 'A stone with a flat face. Sharpens sticks and grinds seeds.', color: '#b3aca3',
  },
  chopper: {
    id: 'chopper', name: 'Chopper', category: 'tool', holdable: true, damage: 18, fragility: 0.06,
    description: 'A chipped stone with a cutting edge. Cuts meat and fibers.', color: '#2b2b33',
  },
  horsetail: {
    id: 'horsetail', name: 'Horsetail', category: 'medicine', holdable: true, cures: ['bleeding'],
    nutrition: { hunger: 2 }, description: 'A hollow ribbed plant. Stops bleeding when eaten.', color: '#4a8a3c',
  },
  kapok_fiber: {
    id: 'kapok_fiber', name: 'Kapok Fiber', category: 'medicine', holdable: true, cures: ['cold'],
    description: 'Fluffy fibers. Rubbing them on the body warms and dries.', color: '#e8e0c9',
  },
  khat_leaf: {
    id: 'khat_leaf', name: 'Khat Leaves', category: 'medicine', holdable: true, cures: ['exhausted'],
    nutrition: { energy: 25, hunger: 3 }, description: 'Stimulant leaves. Restore energy and fight fatigue.', color: '#5fa04e',
  },
  natal_grass: {
    id: 'natal_grass', name: 'Natal Grass', category: 'medicine', holdable: true, cures: ['poisoned'],
    nutrition: { hunger: 2 }, description: 'A cycad frond. Neutralizes poison.', color: '#7cb35c',
  },
  meat: {
    id: 'meat', name: 'Raw Meat', category: 'food', holdable: true, nutrition: { hunger: 45, health: 5 },
    toxicity: 0.15, description: 'A chunk of flesh. Nutritious but heavy on the stomach.', color: '#b03a3a',
  },
  fish: {
    id: 'fish', name: 'Fish', category: 'food', holdable: true, nutrition: { hunger: 30, thirst: 5 },
    description: 'A slippery fish caught in the river.', color: '#8fa6b8',
  },
  coconut: {
    id: 'coconut', name: 'Coconut', category: 'food', holdable: true, damage: 6,
    description: 'A hard shell. Must be broken with a stone.', color: '#6e5636',
  },
  coconut_open: {
    id: 'coconut_open', name: 'Open Coconut', category: 'food', holdable: true, nutrition: { hunger: 25, thirst: 30 },
    description: 'Fresh coconut flesh and water.', color: '#f1ecdc',
  },
  banana: {
    id: 'banana', name: 'Banana', category: 'food', holdable: true, nutrition: { hunger: 18, energy: 4 },
    description: 'A sweet fruit.', color: '#e9d34a',
  },
  mango: {
    id: 'mango', name: 'Mango', category: 'food', holdable: true, nutrition: { hunger: 20, thirst: 10 },
    description: 'A juicy fruit.', color: '#f0a030',
  },
  berry: {
    id: 'berry', name: 'Wild Berries', category: 'food', holdable: true, nutrition: { hunger: 8, thirst: 4 },
    toxicity: 0.2, description: 'Small dark berries. Some are poisonous.', color: '#5a2a6e',
  },
  honey: {
    id: 'honey', name: 'Honeycomb', category: 'food', holdable: true, nutrition: { hunger: 22, energy: 20, health: 8 },
    description: 'Sweet golden comb. Bees defend it.', color: '#e0a020',
  },
  egg: {
    id: 'egg', name: 'Egg', category: 'food', holdable: true, nutrition: { hunger: 15, health: 3 },
    description: 'A bird egg.', color: '#e8e2d0',
  },
  mushroom: {
    id: 'mushroom', name: 'Mushroom', category: 'food', holdable: true, nutrition: { hunger: 10 },
    toxicity: 0.5, description: 'A spotted mushroom. Risky.', color: '#c8b48a',
  },
  bone: {
    id: 'bone', name: 'Bone', category: 'material', holdable: true, damage: 7,
    description: 'A large bone. Can be sharpened.', color: '#e3dccc',
  },
  bone_sharp: {
    id: 'bone_sharp', name: 'Sharpened Bone', category: 'tool', holdable: true, damage: 16, fragility: 0.05,
    description: 'A pointed bone shard.', color: '#efe8d8',
  },
  water_gourd: {
    id: 'water_gourd', name: 'Water Gourd', category: 'food', holdable: true, nutrition: { thirst: 40 },
    description: 'A gourd filled with water.', color: '#8a9a4a',
  },
  reed: {
    id: 'reed', name: 'Reed', category: 'material', holdable: true,
    description: 'A tall hollow reed from the swamp.', color: '#9aa860',
  },
  fibers: {
    id: 'fibers', name: 'Plant Fibers', category: 'material', holdable: true,
    description: 'Stripped fibers. Useful for bedding.', color: '#c2b280',
  },
  thorn: {
    id: 'thorn', name: 'Thorn', category: 'material', holdable: true, damage: 3,
    description: 'A sharp thorn.', color: '#6a4a2a',
  },
};

export const ITEM_LIST: ItemDef[] = Object.values(ITEMS);
export const getItem = (id: ItemId): ItemDef => ITEMS[id];
