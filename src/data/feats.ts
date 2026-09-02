import type { FeatDef } from '@/core/types';

/** Evolution feats: milestone counts of actions that reduce the years to the next leap. */
export const FEATS: FeatDef[] = [
  { id: 'first_steps', name: 'First Steps', description: 'Walk 500 steps.', action: 'walk', count: 500, yearsReduced: 15_000 },
  { id: 'marathon', name: 'Wanderer', description: 'Walk 5000 steps.', action: 'walk', count: 5000, yearsReduced: 60_000 },
  { id: 'runner', name: 'Runner', description: 'Run 1000 steps.', action: 'run', count: 1000, yearsReduced: 30_000 },
  { id: 'climber', name: 'Canopy Dweller', description: 'Climb 100 times.', action: 'climb', count: 100, yearsReduced: 40_000 },
  { id: 'leaper', name: 'Leaper', description: 'Jump 100 times.', action: 'jump', count: 100, yearsReduced: 25_000 },
  { id: 'swimmer', name: 'Swimmer', description: 'Swim 50 times.', action: 'swim', count: 50, yearsReduced: 45_000 },
  { id: 'observer', name: 'Observer', description: 'Identify 20 things.', action: 'identify', count: 20, yearsReduced: 50_000 },
  { id: 'naturalist', name: 'Naturalist', description: 'Identify 60 things.', action: 'identify', count: 60, yearsReduced: 120_000 },
  { id: 'sniffer', name: 'Scent Reader', description: 'Smell 50 times.', action: 'smell', count: 50, yearsReduced: 30_000 },
  { id: 'listener', name: 'Listener', description: 'Listen 50 times.', action: 'hear', count: 50, yearsReduced: 30_000 },
  { id: 'forager', name: 'Forager', description: 'Eat 30 times.', action: 'eat', count: 30, yearsReduced: 35_000 },
  { id: 'gatherer', name: 'Gatherer', description: 'Pick up 100 items.', action: 'pickup', count: 100, yearsReduced: 40_000 },
  { id: 'toolmaker', name: 'Toolmaker', description: 'Alter an item 10 times.', action: 'alter', count: 10, yearsReduced: 150_000 },
  { id: 'craftsman', name: 'Craftsman', description: 'Craft 25 times.', action: 'craft', count: 25, yearsReduced: 200_000 },
  { id: 'first_kill', name: 'Hunter', description: 'Kill an animal.', action: 'kill', count: 1, yearsReduced: 120_000 },
  { id: 'apex', name: 'Apex', description: 'Kill 10 animals.', action: 'kill', count: 10, yearsReduced: 250_000 },
  { id: 'dodger', name: 'Evasive', description: 'Dodge 20 attacks.', action: 'dodge', count: 20, yearsReduced: 60_000 },
  { id: 'brave', name: 'Brave Heart', description: 'Overcome fear 5 times.', action: 'overcome_fear', count: 5, yearsReduced: 100_000 },
  { id: 'explorer', name: 'Explorer', description: 'Discover 15 areas.', action: 'discover_area', count: 15, yearsReduced: 140_000 },
  { id: 'cartographer', name: 'Cartographer', description: 'Discover 40 areas.', action: 'discover_area', count: 40, yearsReduced: 300_000 },
  { id: 'caregiver', name: 'Caregiver', description: 'Carry a baby 30 times.', action: 'carry_baby', count: 30, yearsReduced: 80_000 },
  { id: 'social', name: 'Social Animal', description: 'Groom 20 times.', action: 'groom', count: 20, yearsReduced: 60_000 },
  { id: 'lineage', name: 'Lineage', description: 'Mate 3 times.', action: 'mate', count: 3, yearsReduced: 90_000 },
  { id: 'healer', name: 'Healer', description: 'Cure a condition 10 times.', action: 'heal', count: 10, yearsReduced: 70_000 },
  { id: 'voice', name: 'Voice', description: 'Call the clan 20 times.', action: 'call', count: 20, yearsReduced: 50_000 },
];

export const FEAT_MAP: Record<string, FeatDef> = Object.fromEntries(FEATS.map((f) => [f.id, f]));
