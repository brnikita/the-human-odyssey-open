import type { PlantDef, PlantId } from '@/core/types';

export const PLANTS: Record<PlantId, PlantDef> = {
  fern: {
    id: 'fern', name: 'Fern', yields: 'fibers', yieldCount: 1, regrowSeconds: 240,
    biomes: ['jungle', 'swamp'], climbable: false, description: 'Broad green fronds. Hides small animals.',
  },
  horsetail_plant: {
    id: 'horsetail_plant', name: 'Horsetail', yields: 'horsetail', yieldCount: 2, regrowSeconds: 300,
    biomes: ['swamp', 'jungle', 'lake'], climbable: false, description: 'Hollow jointed stems growing near water.',
  },
  kapok_tree: {
    id: 'kapok_tree', name: 'Kapok Tree', yields: 'kapok_fiber', yieldCount: 2, regrowSeconds: 400,
    biomes: ['jungle'], climbable: true, description: 'A tall tree with fluffy seed pods.',
  },
  khat_bush: {
    id: 'khat_bush', name: 'Khat Bush', yields: 'khat_leaf', yieldCount: 2, regrowSeconds: 300,
    biomes: ['savanna', 'cliffs'], climbable: false, description: 'A shrub with glossy stimulant leaves.',
  },
  banana_tree: {
    id: 'banana_tree', name: 'Banana Tree', yields: 'banana', yieldCount: 3, regrowSeconds: 360,
    biomes: ['jungle'], climbable: false, description: 'Broad leaves and bunches of yellow fruit.',
  },
  mango_tree: {
    id: 'mango_tree', name: 'Mango Tree', yields: 'mango', yieldCount: 3, regrowSeconds: 420,
    biomes: ['jungle', 'savanna'], climbable: true, description: 'A round-canopied fruit tree.',
  },
  berry_bush: {
    id: 'berry_bush', name: 'Berry Bush', yields: 'berry', yieldCount: 3, regrowSeconds: 200,
    biomes: ['savanna', 'jungle', 'cliffs'], climbable: false, description: 'A low bush with dark berries.',
  },
  coconut_palm: {
    id: 'coconut_palm', name: 'Coconut Palm', yields: 'coconut', yieldCount: 2, regrowSeconds: 500,
    biomes: ['beach', 'lake'], climbable: true, description: 'A tall palm. Coconuts hang at the crown.',
  },
  reed_bed: {
    id: 'reed_bed', name: 'Reed Bed', yields: 'reed', yieldCount: 2, regrowSeconds: 240,
    biomes: ['swamp', 'lake'], climbable: false, description: 'Tall reeds in shallow water.',
  },
  mushroom_patch: {
    id: 'mushroom_patch', name: 'Mushrooms', yields: 'mushroom', yieldCount: 2, regrowSeconds: 400,
    biomes: ['jungle', 'swamp'], climbable: false, description: 'Spotted caps in the shade.',
  },
  natal_grass_patch: {
    id: 'natal_grass_patch', name: 'Natal Grass Cycad', yields: 'natal_grass', yieldCount: 2, regrowSeconds: 360,
    biomes: ['savanna', 'cliffs'], climbable: false, description: 'A low cycad with stiff fronds.',
  },
  thorn_bush: {
    id: 'thorn_bush', name: 'Thorn Bush', yields: 'thorn', yieldCount: 2, regrowSeconds: 300,
    biomes: ['savanna', 'cliffs'], climbable: false, description: 'Dense spines. Careful.',
  },
  beehive: {
    id: 'beehive', name: 'Beehive', yields: 'honey', yieldCount: 1, regrowSeconds: 900,
    biomes: ['jungle', 'savanna'], climbable: false, requiresTool: ['stick', 'sharp_stick', 'branch'],
    description: 'A humming hive hanging from a branch.',
  },
  baobab: {
    id: 'baobab', name: 'Baobab', yields: null, yieldCount: 0, regrowSeconds: 0,
    biomes: ['savanna'], climbable: true, description: 'An enormous ancient tree.',
  },
  acacia: {
    id: 'acacia', name: 'Acacia', yields: 'stick', yieldCount: 1, regrowSeconds: 300,
    biomes: ['savanna'], climbable: true, description: 'A flat-topped thorny tree.',
  },
  jungle_tree: {
    id: 'jungle_tree', name: 'Jungle Tree', yields: 'stick', yieldCount: 1, regrowSeconds: 300,
    biomes: ['jungle', 'swamp'], climbable: true, description: 'A tall tree wrapped in vines.',
  },
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);
export const getPlant = (id: PlantId): PlantDef => PLANTS[id];
