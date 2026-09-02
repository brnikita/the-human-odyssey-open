import type { NeuronBranch, NeuronDef, NeuronId } from '@/core/types';

/**
 * Neuronal network. Six branches radiate from the core. Each neuron sits at a
 * (radius, angle) position converted to normalized x/y for the UI.
 */
const BRANCH_ANGLE: Record<NeuronBranch, number> = {
  motricity: -90,
  dexterity: -30,
  senses: 30,
  intelligence: 90,
  communication: 150,
  metabolism: 210,
};

function pos(branch: NeuronBranch, ring: number, spread = 0) {
  const a = ((BRANCH_ANGLE[branch] + spread) * Math.PI) / 180;
  const r = 0.2 + ring * 0.26;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

const N = (
  id: NeuronId, name: string, branch: NeuronBranch, ring: number, cost: number,
  requires: NeuronId[], description: string, effects: NeuronDef['effects'],
  unlockCondition?: NeuronDef['unlockCondition'], spread = 0,
): NeuronDef => ({ id, name, branch, cost, requires, description, effects, unlockCondition, pos: pos(branch, ring, spread) });

export const NEURONS: NeuronDef[] = [
  // ---- Motricity ----
  N('mot_balance', 'Balance', 'motricity', 0, 40, [], 'Steadier footing. Walk faster.', [{ type: 'speed', mult: 1.08 }], { action: 'walk', count: 50 }),
  N('mot_sprint', 'Sprint', 'motricity', 1, 80, ['mot_balance'], 'Run longer and faster.', [{ type: 'speed', mult: 1.12 }, { type: 'stat', stat: 'energy', mult: 1.1 }], { action: 'run', count: 40 }),
  N('mot_climb', 'Arboreal Grip', 'motricity', 1, 80, ['mot_balance'], 'Climb faster and safer.', [{ type: 'climb', mult: 1.3 }, { type: 'ability', ability: 'fast_climb' }], { action: 'climb', count: 30 }, -14),
  N('mot_jump', 'Long Jump', 'motricity', 2, 120, ['mot_sprint'], 'Leap farther between branches.', [{ type: 'ability', ability: 'long_jump' }], { action: 'jump', count: 40 }, 8),
  N('mot_swim', 'Swimming', 'motricity', 2, 120, ['mot_climb'], 'Stay afloat in deep water.', [{ type: 'ability', ability: 'swim' }], { action: 'swim', count: 10 }, -20),
  N('mot_dive', 'Diving', 'motricity', 3, 200, ['mot_swim'], 'Hold breath and dive.', [{ type: 'ability', ability: 'dive' }], { action: 'swim', count: 60 }, -22),
  N('mot_bipedal', 'Bipedalism', 'motricity', 3, 320, ['mot_jump'], 'Stand upright. Walk on two legs and free both hands.', [{ type: 'bipedal' }, { type: 'speed', mult: 1.1 }], { action: 'walk', count: 600 }, 6),
  N('mot_fall', 'Safe Landing', 'motricity', 2, 140, ['mot_climb'], 'Reduced fracture chance on falls.', [{ type: 'ability', ability: 'sleep_anywhere' }], { action: 'fall', count: 5 }, -6),

  // ---- Dexterity ----
  N('dex_grip', 'Precision Grip', 'dexterity', 0, 40, [], 'Hold items firmly. Required for tool alteration.', [], { action: 'pickup', count: 20 }),
  N('dex_alter_stick', 'Strip Branch', 'dexterity', 1, 80, ['dex_grip'], 'Strip leaves off branches to make sticks.', [{ type: 'ability', ability: 'alter_stick' }], { action: 'alter', count: 5 }, -10),
  N('dex_alter_stone', 'Stone Knapping', 'dexterity', 1, 100, ['dex_grip'], 'Strike stones together to shape them.', [{ type: 'ability', ability: 'alter_stone' }], { action: 'alter', count: 10 }, 10),
  N('dex_two_hands', 'Ambidexterity', 'dexterity', 2, 160, ['dex_alter_stick'], 'Use both hands to combine items.', [{ type: 'twoHands' }, { type: 'ability', ability: 'use_two_hands' }], { action: 'craft', count: 5 }, -12),
  N('dex_grinder', 'Grinder Making', 'dexterity', 2, 180, ['dex_alter_stone'], 'Grind a granite stone into a grinder.', [{ type: 'ability', ability: 'craft_grinder' }], { action: 'alter', count: 25 }, 12),
  N('dex_chopper', 'Chopper Making', 'dexterity', 3, 260, ['dex_grinder', 'dex_two_hands'], 'Chip obsidian or basalt into a chopper.', [{ type: 'ability', ability: 'craft_chopper' }], { action: 'craft', count: 20 }),
  N('dex_counter', 'Counter Attack', 'dexterity', 3, 240, ['dex_two_hands'], 'Strike back after a successful dodge.', [{ type: 'ability', ability: 'counter_attack' }, { type: 'dodgeWindow', mult: 1.2 }], { action: 'dodge', count: 15 }, -20),

  // ---- Senses ----
  N('sen_sight', 'Keen Sight', 'senses', 0, 40, [], 'See farther in intelligence mode.', [{ type: 'sense', sense: 'sight', mult: 1.3 }], { action: 'identify', count: 10 }),
  N('sen_smell', 'Scent Tracking', 'senses', 1, 80, ['sen_sight'], 'Identify things by smell.', [{ type: 'ability', ability: 'identify_smell' }, { type: 'sense', sense: 'smell', mult: 1.4 }], { action: 'smell', count: 20 }, -12),
  N('sen_hearing', 'Acute Hearing', 'senses', 1, 80, ['sen_sight'], 'Identify things by sound.', [{ type: 'ability', ability: 'identify_sound' }, { type: 'sense', sense: 'hearing', mult: 1.4 }], { action: 'hear', count: 20 }, 12),
  N('sen_predator', 'Predator Sense', 'senses', 2, 180, ['sen_smell', 'sen_hearing'], 'Sense predators even out of sight.', [{ type: 'ability', ability: 'detect_predators' }], { action: 'dodge', count: 5 }),
  N('sen_night', 'Night Vision', 'senses', 2, 160, ['sen_hearing'], 'See better in darkness.', [{ type: 'sense', sense: 'sight', mult: 1.3 }], { action: 'identify', count: 60 }, 22),
  N('sen_far_smell', 'Far Scent', 'senses', 3, 220, ['sen_predator'], 'Smell across great distances.', [{ type: 'sense', sense: 'smell', mult: 1.6 }], { action: 'smell', count: 80 }),

  // ---- Intelligence ----
  N('int_curiosity', 'Curiosity', 'intelligence', 0, 40, [], 'Discoveries grant more dopamine.', [{ type: 'fear', mult: 0.9 }], { action: 'discover_area', count: 3 }),
  N('int_memory', 'Memory', 'intelligence', 1, 90, ['int_curiosity'], 'Remember identified things across generations.', [{ type: 'neuronGain', mult: 1.15 }], { action: 'identify', count: 30 }, -12),
  N('int_courage', 'Courage', 'intelligence', 1, 90, ['int_curiosity'], 'Fear builds slower in the unknown.', [{ type: 'fear', mult: 0.7 }], { action: 'overcome_fear', count: 3 }, 12),
  N('int_learning', 'Fast Learner', 'intelligence', 2, 180, ['int_memory'], 'Neuronal energy gained faster.', [{ type: 'neuronGain', mult: 1.3 }], { action: 'identify', count: 80 }, -14),
  N('int_tools', 'Tool Insight', 'intelligence', 2, 160, ['int_courage', 'int_memory'], 'Understand tools faster; less fragility.', [{ type: 'neuronGain', mult: 1.1 }], { action: 'craft', count: 10 }),
  N('int_fearless', 'Fearless', 'intelligence', 3, 300, ['int_courage'], 'Almost no fear in the unknown.', [{ type: 'fear', mult: 0.4 }], { action: 'overcome_fear', count: 10 }, 14),
  N('int_intimidate', 'Intimidation', 'intelligence', 2, 140, ['int_courage'], 'Scare predators away with a display.', [{ type: 'ability', ability: 'intimidate' }], { action: 'attack', count: 5 }, 26),

  // ---- Communication ----
  N('com_call', 'Clan Call', 'communication', 0, 40, [], 'Call clan members to you.', [{ type: 'ability', ability: 'communicate_call' }], { action: 'call', count: 3 }),
  N('com_groom', 'Grooming', 'communication', 1, 80, ['com_call'], 'Grooming bonds faster.', [], { action: 'groom', count: 10 }, -12),
  N('com_babies', 'Baby Carrier', 'communication', 1, 100, ['com_call'], 'Carry two babies at once.', [{ type: 'ability', ability: 'carry_two_babies' }], { action: 'carry_baby', count: 20 }, 12),
  N('com_group', 'Group Movement', 'communication', 2, 160, ['com_groom'], 'Clan follows you when called.', [{ type: 'ability', ability: 'group_move' }], { action: 'call', count: 20 }, -12),
  N('com_teach', 'Teaching', 'communication', 2, 180, ['com_babies'], 'Babies grant even more neuronal energy.', [{ type: 'neuronGain', mult: 1.25 }], { action: 'carry_baby', count: 60 }, 12),
  N('com_bond', 'Deep Bond', 'communication', 3, 240, ['com_group', 'com_teach'], 'Outsiders recruited faster.', [], { action: 'groom', count: 40 }),

  // ---- Metabolism ----
  N('met_stomach', 'Strong Stomach', 'metabolism', 0, 40, [], 'Less sick from raw food.', [{ type: 'metabolism', mult: 0.92 }], { action: 'eat', count: 15 }),
  N('met_meat', 'Carnivore', 'metabolism', 1, 100, ['met_stomach'], 'Digest raw meat safely.', [{ type: 'ability', ability: 'eat_meat_raw' }], { action: 'eat', count: 40 }, -12),
  N('met_water', 'Water Retention', 'metabolism', 1, 80, ['met_stomach'], 'Thirst rises slower.', [{ type: 'stat', stat: 'thirst', mult: 1.2 }], { action: 'drink', count: 20 }, 12),
  N('met_vitality', 'Vitality', 'metabolism', 2, 160, ['met_meat'], 'More health.', [{ type: 'stat', stat: 'health', mult: 1.25 }], { action: 'heal', count: 5 }, -12),
  N('met_endurance', 'Endurance', 'metabolism', 2, 160, ['met_water'], 'More energy, sleep less.', [{ type: 'stat', stat: 'energy', mult: 1.25 }], { action: 'sleep', count: 5 }, 12),
  N('met_regen', 'Regeneration', 'metabolism', 3, 260, ['met_vitality', 'met_endurance'], 'Health slowly regenerates when fed.', [{ type: 'metabolism', mult: 0.85 }, { type: 'stat', stat: 'health', mult: 1.1 }], { action: 'heal', count: 20 }),
];

export const NEURON_MAP: Record<NeuronId, NeuronDef> = Object.fromEntries(NEURONS.map((n) => [n.id, n]));
export const getNeuron = (id: NeuronId): NeuronDef | undefined => NEURON_MAP[id];
export const BRANCHES: NeuronBranch[] = ['motricity', 'dexterity', 'senses', 'intelligence', 'communication', 'metabolism'];
export const BRANCH_COLORS: Record<NeuronBranch, string> = {
  motricity: '#5ec8ff',
  dexterity: '#ffb347',
  senses: '#c07cff',
  intelligence: '#ffe45e',
  communication: '#ff7aa8',
  metabolism: '#7dff8a',
};
