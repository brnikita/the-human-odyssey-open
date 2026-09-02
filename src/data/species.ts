import type { SpeciesDef, SpeciesId } from '@/core/types';

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  machairodus: {
    id: 'machairodus', name: 'Machairodus', behavior: 'predator', health: 220, damage: 40, speed: 7.5, size: 1.6,
    senseRange: 45, attackRange: 2.6, biomes: ['savanna', 'jungle', 'cliffs'], drops: ['meat', 'meat', 'bone'],
    inflicts: 'bleeding', color: '#c99a5a', intimidatable: true, killableWith: ['sharp_stick', 'chopper', 'bone_sharp'],
    description: 'A saber-toothed cat. The apex predator of the savanna.',
  },
  metridiochoerus: {
    id: 'metridiochoerus', name: 'Giant Warthog', behavior: 'territorial', health: 160, damage: 28, speed: 6.5, size: 1.3,
    senseRange: 25, attackRange: 2.2, biomes: ['savanna', 'jungle'], drops: ['meat', 'meat', 'bone'],
    inflicts: 'bleeding', color: '#6b5545', intimidatable: true, killableWith: ['sharp_stick', 'chopper', 'bone_sharp', 'stone_granite'],
    description: 'A huge tusked boar. Charges anything in its territory.',
  },
  crocodile: {
    id: 'crocodile', name: 'Crocodile', behavior: 'predator', health: 260, damage: 45, speed: 5, size: 1.8,
    senseRange: 30, attackRange: 3, biomes: ['lake', 'swamp'], drops: ['meat', 'meat', 'bone'],
    inflicts: 'bleeding', color: '#4a5e3a', intimidatable: false, killableWith: ['sharp_stick', 'chopper'], aquatic: true,
    description: 'An armored ambush hunter lurking in the water.',
  },
  python: {
    id: 'python', name: 'Rock Python', behavior: 'predator', health: 90, damage: 18, speed: 3.5, size: 1.0,
    senseRange: 15, attackRange: 2, biomes: ['jungle', 'swamp', 'cliffs'], drops: ['meat'],
    inflicts: 'poisoned', color: '#5a5a3a', intimidatable: true, killableWith: ['sharp_stick', 'stone_granite', 'chopper', 'stick'],
    description: 'A giant constrictor coiled in the undergrowth.',
  },
  eagle: {
    id: 'eagle', name: 'Crowned Eagle', behavior: 'predator', health: 60, damage: 22, speed: 12, size: 0.9,
    senseRange: 60, attackRange: 2, biomes: ['cliffs', 'savanna', 'jungle'], drops: ['meat', 'egg'],
    inflicts: 'bleeding', color: '#6a5040', intimidatable: true, killableWith: ['sharp_stick', 'stone_granite', 'stick'], flying: true,
    description: 'A huge raptor. It hunts from the sky and snatches babies.',
  },
  hyena: {
    id: 'hyena', name: 'Hyena', behavior: 'predator', health: 110, damage: 24, speed: 7, size: 1.0,
    senseRange: 40, attackRange: 2.2, biomes: ['savanna', 'cliffs'], drops: ['meat', 'bone'],
    inflicts: 'bleeding', color: '#8a7a5a', intimidatable: true, killableWith: ['sharp_stick', 'chopper', 'stone_granite', 'bone_sharp'], nocturnal: true,
    description: 'A cackling scavenger that hunts in the dark.',
  },
  giant_otter: {
    id: 'giant_otter', name: 'Giant Otter', behavior: 'territorial', health: 80, damage: 15, speed: 6, size: 1.0,
    senseRange: 20, attackRange: 2, biomes: ['lake', 'swamp'], drops: ['meat'],
    inflicts: 'bleeding', color: '#5a4030', intimidatable: true, killableWith: ['sharp_stick', 'stone_granite', 'chopper'], aquatic: true,
    description: 'A large otter guarding its stretch of river.',
  },
  rat: {
    id: 'rat', name: 'Giant Rat', behavior: 'prey', health: 20, damage: 4, speed: 5, size: 0.4,
    senseRange: 10, attackRange: 1, biomes: ['jungle', 'swamp', 'savanna'], drops: ['meat'],
    color: '#6a6060', intimidatable: false, killableWith: ['stick', 'stone_granite', 'sharp_stick', 'chopper', 'bone'],
    description: 'A skittish rodent. Easy food if you can catch it.',
  },
  monkey: {
    id: 'monkey', name: 'Colobus Monkey', behavior: 'neutral', health: 40, damage: 6, speed: 6, size: 0.6,
    senseRange: 20, attackRange: 1.2, biomes: ['jungle'], drops: ['meat'],
    color: '#2a2a2a', intimidatable: true, killableWith: ['sharp_stick', 'stone_granite', 'chopper'],
    description: 'A tree-dwelling monkey that shrieks warnings.',
  },
  antelope: {
    id: 'antelope', name: 'Antelope', behavior: 'prey', health: 70, damage: 8, speed: 9, size: 1.1,
    senseRange: 30, attackRange: 1.5, biomes: ['savanna'], drops: ['meat', 'meat', 'bone'],
    color: '#b08a5a', intimidatable: false, killableWith: ['sharp_stick', 'chopper', 'bone_sharp'],
    description: 'A graceful grazer. Flees at the first sign of danger.',
  },
  deinotherium: {
    id: 'deinotherium', name: 'Deinotherium', behavior: 'neutral', health: 600, damage: 60, speed: 4, size: 3.2,
    senseRange: 25, attackRange: 4, biomes: ['savanna', 'lake'], drops: ['meat', 'meat', 'meat', 'bone', 'bone'],
    inflicts: 'fractured', color: '#6a6660', intimidatable: false,
    description: 'A colossal proboscidean with downward tusks. Peaceful unless provoked.',
  },
  lizard: {
    id: 'lizard', name: 'Monitor Lizard', behavior: 'territorial', health: 50, damage: 10, speed: 5, size: 0.7,
    senseRange: 15, attackRange: 1.5, biomes: ['cliffs', 'savanna', 'beach'], drops: ['meat', 'egg'],
    inflicts: 'poisoned', color: '#5a6a3a', intimidatable: true, killableWith: ['stick', 'sharp_stick', 'stone_granite', 'chopper'],
    description: 'A large lizard basking on the rocks.',
  },
  fish: {
    id: 'fish', name: 'Catfish', behavior: 'prey', health: 10, damage: 0, speed: 4, size: 0.4,
    senseRange: 8, attackRange: 0, biomes: ['lake', 'swamp'], drops: ['fish'],
    color: '#7a8a9a', intimidatable: false, killableWith: ['sharp_stick', 'stick'], aquatic: true,
    description: 'A whiskered fish gliding in the shallows.',
  },
  bee: {
    id: 'bee', name: 'Bee Swarm', behavior: 'territorial', health: 15, damage: 6, speed: 4, size: 0.3,
    senseRange: 8, attackRange: 1.5, biomes: ['jungle', 'savanna'], drops: [],
    inflicts: 'poisoned', color: '#d0a020', intimidatable: false, flying: true,
    description: 'An angry cloud of bees defending the hive.',
  },
  centipede: {
    id: 'centipede', name: 'Giant Centipede', behavior: 'territorial', health: 15, damage: 8, speed: 3, size: 0.3,
    senseRange: 6, attackRange: 1, biomes: ['jungle', 'swamp'], drops: [],
    inflicts: 'poisoned', color: '#8a3a2a', intimidatable: false, killableWith: ['stick', 'stone_granite', 'sharp_stick'],
    description: 'A venomous many-legged crawler.',
  },
  vulture: {
    id: 'vulture', name: 'Vulture', behavior: 'prey', health: 30, damage: 4, speed: 10, size: 0.7,
    senseRange: 50, attackRange: 1, biomes: ['savanna', 'cliffs'], drops: ['meat', 'egg'],
    color: '#4a4040', intimidatable: false, killableWith: ['sharp_stick', 'stone_granite', 'stick'], flying: true,
    description: 'A scavenger circling above carcasses.',
  },
};

export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES);
export const getSpecies = (id: SpeciesId): SpeciesDef => SPECIES[id];
