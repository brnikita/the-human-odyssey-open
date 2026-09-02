// Shared type contracts for all systems. Pure TS - no Three.js here.

export type Vec3 = { x: number; y: number; z: number };

export type AgeStage = 'baby' | 'child' | 'adult' | 'elder';
export type Sex = 'male' | 'female';

export type HominidState =
  | 'idle' | 'walk' | 'run' | 'climb' | 'jump' | 'fall' | 'swim'
  | 'attack' | 'dodge' | 'sleep' | 'eat' | 'drink' | 'groom' | 'dead';

export type ConditionId = 'bleeding' | 'poisoned' | 'fractured' | 'cold' | 'exhausted';

export interface Condition {
  id: ConditionId;
  severity: number; // 0..1
  time: number; // seconds since applied
}

export interface Stats {
  health: number;
  energy: number; // sleep
  hunger: number; // 100 = full
  thirst: number; // 100 = hydrated
}

export interface HominidData {
  id: string;
  name: string;
  sex: Sex;
  stage: AgeStage;
  ageYears: number;
  stats: Stats;
  maxStats: Stats;
  conditions: Condition[];
  position: Vec3;
  state: HominidState;
  held: { left: ItemId | null; right: ItemId | null };
  carriedBaby: string | null; // hominid id
  isPlayer: boolean;
  isOutsider: boolean; // not yet recruited
  bond: number; // 0..1 with clan (for outsiders) / affection
  neurons: NeuronId[]; // unlocked (this life)
  reinforced: NeuronId[]; // will carry over generation
  genetic: NeuronId[]; // mutations inherited
  fear: number; // 0..100
  dopamine: number; // 0..100
}

export type ItemId =
  | 'stick' | 'sharp_stick' | 'stone_granite' | 'stone_basalt' | 'stone_obsidian'
  | 'grinder' | 'chopper' | 'branch' | 'horsetail' | 'kapok_fiber' | 'khat_leaf'
  | 'natal_grass' | 'meat' | 'fish' | 'coconut' | 'coconut_open' | 'banana'
  | 'mango' | 'berry' | 'honey' | 'egg' | 'mushroom' | 'bone' | 'bone_sharp'
  | 'water_gourd' | 'reed' | 'fibers' | 'thorn';

export type ItemCategory = 'tool' | 'food' | 'medicine' | 'material';

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  description: string;
  /** stats restored on consumption */
  nutrition?: Partial<Stats>;
  /** condition cured on consumption/application */
  cures?: ConditionId[];
  /** harmful if raw / unknown */
  toxicity?: number;
  /** attack strength when held */
  damage?: number;
  /** whether it can be held in one hand */
  holdable: boolean;
  /** 0..1 chance of breaking on use */
  fragility?: number;
  color: string; // hex for procedural rendering
}

export type PlantId =
  | 'fern' | 'horsetail_plant' | 'kapok_tree' | 'khat_bush' | 'banana_tree' | 'mango_tree'
  | 'berry_bush' | 'coconut_palm' | 'reed_bed' | 'mushroom_patch' | 'natal_grass_patch'
  | 'thorn_bush' | 'beehive' | 'baobab' | 'acacia' | 'jungle_tree';

export interface PlantDef {
  id: PlantId;
  name: string;
  yields: ItemId | null;
  yieldCount: number;
  regrowSeconds: number;
  biomes: BiomeId[];
  climbable: boolean;
  /** requires one of these tools to harvest */
  requiresTool?: ItemId[];
  description: string;
}

export type SpeciesId =
  | 'machairodus' | 'metridiochoerus' | 'crocodile' | 'python' | 'eagle' | 'hyena'
  | 'giant_otter' | 'rat' | 'monkey' | 'antelope' | 'deinotherium' | 'lizard' | 'fish'
  | 'bee' | 'centipede' | 'vulture';

export type AnimalBehavior = 'predator' | 'prey' | 'neutral' | 'territorial';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  behavior: AnimalBehavior;
  health: number;
  damage: number;
  speed: number;
  size: number; // scale
  senseRange: number;
  attackRange: number;
  biomes: BiomeId[];
  drops: ItemId[];
  /** inflicts condition on hit */
  inflicts?: ConditionId;
  color: string;
  /** can be intimidated away */
  intimidatable: boolean;
  /** hunting is possible with these tools */
  killableWith?: ItemId[];
  nocturnal?: boolean;
  aquatic?: boolean;
  flying?: boolean;
  description: string;
}

export type BiomeId = 'jungle' | 'savanna' | 'swamp' | 'lake' | 'cliffs' | 'beach';

export type NeuronBranch =
  | 'motricity' | 'senses' | 'intelligence' | 'communication' | 'metabolism' | 'dexterity';

export type NeuronId = string;

export interface NeuronDef {
  id: NeuronId;
  name: string;
  branch: NeuronBranch;
  description: string;
  cost: number; // neuronal energy
  requires: NeuronId[];
  /** action counters that unlock the possibility to buy */
  unlockCondition?: { action: ActionId; count: number };
  effects: NeuronEffect[];
  /** tree layout, normalized -1..1 */
  pos: { x: number; y: number };
}

export type NeuronEffect =
  | { type: 'stat'; stat: keyof Stats; mult: number }
  | { type: 'speed'; mult: number }
  | { type: 'climb'; mult: number }
  | { type: 'sense'; sense: 'sight' | 'smell' | 'hearing'; mult: number }
  | { type: 'ability'; ability: AbilityId }
  | { type: 'fear'; mult: number }
  | { type: 'metabolism'; mult: number }
  | { type: 'dodgeWindow'; mult: number }
  | { type: 'neuronGain'; mult: number }
  | { type: 'twoHands' }
  | { type: 'bipedal' };

export type AbilityId =
  | 'identify_smell' | 'identify_sound' | 'alter_stick' | 'alter_stone' | 'use_two_hands'
  | 'carry_two_babies' | 'counter_attack' | 'intimidate' | 'swim' | 'dive' | 'sleep_anywhere'
  | 'craft_grinder' | 'craft_chopper' | 'eat_meat_raw' | 'detect_predators' | 'bipedalism'
  | 'communicate_call' | 'group_move' | 'long_jump' | 'fast_climb';

export type ActionId =
  | 'walk' | 'run' | 'climb' | 'jump' | 'swim' | 'identify' | 'smell' | 'hear' | 'eat'
  | 'drink' | 'sleep' | 'pickup' | 'craft' | 'alter' | 'attack' | 'dodge' | 'intimidate'
  | 'groom' | 'mate' | 'carry_baby' | 'discover_area' | 'overcome_fear' | 'kill' | 'call'
  | 'heal' | 'fall';

export interface FeatDef {
  id: string;
  name: string;
  description: string;
  action: ActionId;
  count: number;
  yearsReduced: number;
}

export interface LineageState {
  yearsAgo: number; // starts at 10_000_000
  generation: number;
  feats: string[]; // achieved feat ids
  actionCounts: Partial<Record<ActionId, number>>;
  neuronalEnergy: number;
  discoveries: string[]; // ids of species/items/plants known
  areasExplored: string[]; // grid cell ids
  /** index into feats at the moment of the last evolution leap */
  featsAtLastLeap?: number;
}

export interface ClanState {
  members: HominidData[];
  settlement: Vec3;
  playerId: string;
}

export interface SaveGame {
  version: number;
  timestamp: number;
  worldSeed: number;
  timeOfDay: number; // 0..1
  dayCount: number;
  lineage: LineageState;
  clan: ClanState;
  items: { id: ItemId; position: Vec3; quantity: number }[];
  animals: { species: SpeciesId; position: Vec3; health: number }[];
  harvested: { plantIndex: number; timeLeft: number }[];
}

export type SenseKind = 'sight' | 'smell' | 'hearing';
