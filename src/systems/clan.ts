// Clan: member creation, recruitment, bonding, mating, baby carrying, player switching.
// Pure logic - no Three.js.

import type { AgeStage, ClanState, HominidData, Sex, Stats, Vec3 } from '@/core/types';
import { pick, randInt, randRange, type Rng } from '@/util/rng';

export const HOMINID_NAMES: string[] = [
  'Ako', 'Nuru', 'Tembo', 'Zuri', 'Kito', 'Imani', 'Baraka', 'Nala', 'Jabari', 'Asha',
  'Enzi', 'Dalili', 'Kesi', 'Moyo', 'Oba', 'Sefu', 'Tano', 'Ulan', 'Wema', 'Yebo',
  'Adisa', 'Bomani', 'Chuma', 'Duma', 'Fumo', 'Goma', 'Hodari', 'Ituri', 'Juma', 'Kibo',
  'Lulu', 'Mosi', 'Neema', 'Okal', 'Pili', 'Rafiki', 'Sidi', 'Tuli', 'Uzuri', 'Zola',
];

/** Health/energy caps per age stage (relative to the adult base of 100). */
export const STAGE_STAT_MULT: Record<AgeStage, { health: number; energy: number }> = {
  baby: { health: 0.3, energy: 0.5 },
  child: { health: 0.6, energy: 0.8 },
  adult: { health: 1, energy: 1 },
  elder: { health: 0.8, energy: 0.7 },
};

export const BASE_STAT = 100;
export const BOND_RATE_PER_SECOND = 0.01;
export const BOND_RADIUS = 6;
export const RECRUIT_BOND: Record<'approach' | 'groom' | 'feed', number> = { approach: 0.1, groom: 0.25, feed: 0.35 };

export function maxStatsForStage(stage: AgeStage): Stats {
  const m = STAGE_STAT_MULT[stage];
  return { health: BASE_STAT * m.health, energy: BASE_STAT * m.energy, hunger: BASE_STAT, thirst: BASE_STAT };
}

let idCounter = 0;
function newId(rng?: Rng): string {
  if (rng) return 'h_' + Math.floor(rng() * 0xffffffff).toString(36);
  idCounter += 1;
  return 'h_' + idCounter;
}

/** Pick an unused name; falls back to a numbered variant when the list is exhausted. Adds it to `used`. */
export function randomName(rng: Rng, used: Set<string>): string {
  const free = HOMINID_NAMES.filter((n) => !used.has(n));
  let name: string;
  if (free.length > 0) {
    name = pick(rng, free);
  } else {
    const base = pick(rng, HOMINID_NAMES);
    let i = 2;
    while (used.has(`${base} ${i}`)) i++;
    name = `${base} ${i}`;
  }
  used.add(name);
  return name;
}

function defaultAge(stage: AgeStage): number {
  switch (stage) {
    case 'baby': return 1;
    case 'child': return 9;
    case 'adult': return 25;
    case 'elder': return 45;
  }
}

/** Build a hominid with sensible defaults; any field can be overridden. */
export function makeClanMember(partial: Partial<HominidData> = {}, rng?: Rng): HominidData {
  const stage = partial.stage ?? 'adult';
  const maxStats = partial.maxStats ?? maxStatsForStage(stage);
  return {
    id: partial.id ?? newId(rng),
    name: partial.name ?? 'Unnamed',
    sex: partial.sex ?? 'female',
    stage,
    ageYears: partial.ageYears ?? defaultAge(stage),
    stats: partial.stats ?? { ...maxStats },
    maxStats,
    conditions: partial.conditions ?? [],
    position: partial.position ?? { x: 0, y: 0, z: 0 },
    state: partial.state ?? 'idle',
    held: partial.held ?? { left: null, right: null },
    carriedBaby: partial.carriedBaby ?? null,
    isPlayer: partial.isPlayer ?? false,
    isOutsider: partial.isOutsider ?? false,
    bond: partial.bond ?? 1,
    neurons: partial.neurons ?? [],
    reinforced: partial.reinforced ?? [],
    genetic: partial.genetic ?? [],
    fear: partial.fear ?? 0,
    dopamine: partial.dopamine ?? 50,
  };
}

function scatter(rng: Rng, center: Vec3, radius: number): Vec3 {
  const angle = randRange(rng, 0, Math.PI * 2);
  const r = Math.sqrt(rng()) * radius;
  return { x: center.x + Math.cos(angle) * r, y: center.y, z: center.z + Math.sin(angle) * r };
}

function randomSex(rng: Rng): Sex {
  return rng() < 0.5 ? 'female' : 'male';
}

/** Starting clan: 3 adults (mixed sex), 1 child, 2 babies around the settlement. First adult is the player. */
export function createClan(rng: Rng, settlement: Vec3): ClanState {
  const used = new Set<string>();
  const members: HominidData[] = [];
  const adultSexes: Sex[] = ['female', 'male', randomSex(rng)];
  for (let i = 0; i < 3; i++) {
    members.push(makeClanMember({
      name: randomName(rng, used),
      sex: adultSexes[i],
      stage: 'adult',
      ageYears: randInt(rng, 18, 35),
      position: scatter(rng, settlement, 8),
      isPlayer: i === 0,
    }, rng));
  }
  members.push(makeClanMember({
    name: randomName(rng, used),
    sex: randomSex(rng),
    stage: 'child',
    ageYears: randInt(rng, 6, 12),
    position: scatter(rng, settlement, 8),
  }, rng));
  for (let i = 0; i < 2; i++) {
    members.push(makeClanMember({
      name: randomName(rng, used),
      sex: randomSex(rng),
      stage: 'baby',
      ageYears: randInt(rng, 0, 3),
      position: scatter(rng, settlement, 8),
    }, rng));
  }
  return { members, settlement: { ...settlement }, playerId: members[0].id };
}

/** A wandering adult hominid that can be recruited. */
export function createOutsider(rng: Rng, position: Vec3): HominidData {
  return makeClanMember({
    name: randomName(rng, new Set()),
    sex: randomSex(rng),
    stage: 'adult',
    ageYears: randInt(rng, 18, 35),
    position: { ...position },
    isOutsider: true,
    bond: 0,
  }, rng);
}

/** Interact with an outsider; recruits once bond reaches 1. */
export function recruitAction(
  outsider: HominidData,
  action: 'approach' | 'groom' | 'feed',
  mods: { bondMult: number },
): { bond: number; recruited: boolean } {
  if (!outsider.isOutsider) return { bond: outsider.bond, recruited: true };
  outsider.bond = Math.min(1, outsider.bond + RECRUIT_BOND[action] * mods.bondMult);
  if (outsider.bond >= 1) {
    outsider.isOutsider = false;
    return { bond: outsider.bond, recruited: true };
  }
  return { bond: outsider.bond, recruited: false };
}

export const isAlive = (h: HominidData): boolean => h.state !== 'dead';

export function canMate(a: HominidData, b: HominidData): boolean {
  return a !== b && a.id !== b.id
    && a.stage === 'adult' && b.stage === 'adult'
    && isAlive(a) && isAlive(b)
    && a.sex !== b.sex
    && !a.isOutsider && !b.isOutsider;
}

/** Produce a baby near `a`. Inherits the union of both parents' reinforced and genetic neurons. Not added to a clan. */
export function mate(a: HominidData, b: HominidData, rng: Rng, usedNames: Set<string>): HominidData {
  if (!canMate(a, b)) throw new Error('cannot_mate');
  return makeClanMember({
    name: randomName(rng, usedNames),
    sex: randomSex(rng),
    stage: 'baby',
    ageYears: 0,
    position: scatter(rng, a.position, 1),
    genetic: Array.from(new Set([...a.reinforced, ...a.genetic, ...b.reinforced, ...b.genetic])),
    bond: 1,
  }, rng);
}

// ---- Baby carrying ----
// `carriedBaby` holds one hominid id; with the carry_two_babies ability a second id is appended after a comma.

export function carriedBabyIds(carrier: HominidData): string[] {
  return carrier.carriedBaby ? carrier.carriedBaby.split(',').filter(Boolean) : [];
}

export function canCarryBaby(carrier: HominidData, mods: { carryTwo: boolean }): boolean {
  if (!isAlive(carrier) || carrier.stage === 'baby') return false;
  return carriedBabyIds(carrier).length < (mods.carryTwo ? 2 : 1);
}

export function pickUpBaby(carrier: HominidData, baby: HominidData, mods: { carryTwo: boolean } = { carryTwo: false }): boolean {
  if (baby.stage !== 'baby' || !isAlive(baby) || baby.id === carrier.id) return false;
  if (!canCarryBaby(carrier, mods)) return false;
  const ids = carriedBabyIds(carrier);
  if (ids.includes(baby.id)) return false;
  ids.push(baby.id);
  carrier.carriedBaby = ids.join(',');
  baby.position = { ...carrier.position };
  return true;
}

/** Drop the most recently picked-up baby. Returns its id, or null when carrying none. */
export function dropBaby(carrier: HominidData): string | null {
  const ids = carriedBabyIds(carrier);
  if (ids.length === 0) return null;
  const dropped = ids.pop() as string;
  carrier.carriedBaby = ids.length ? ids.join(',') : null;
  return dropped;
}

// ---- Queries ----

export function findMember(clan: ClanState, id: string): HominidData | undefined {
  return clan.members.find((m) => m.id === id);
}

export function livingMembers(clan: ClanState): HominidData[] {
  return clan.members.filter(isAlive);
}

export function babies(clan: ClanState): HominidData[] {
  return livingMembers(clan).filter((m) => m.stage === 'baby');
}

export function adults(clan: ClanState): HominidData[] {
  return livingMembers(clan).filter((m) => m.stage === 'adult');
}

/** Take control of another living, recruited child/adult/elder. */
export function switchPlayer(clan: ClanState, id: string): boolean {
  const target = findMember(clan, id);
  if (!target || !isAlive(target) || target.isOutsider || target.stage === 'baby') return false;
  for (const m of clan.members) m.isPlayer = m.id === id;
  clan.playerId = id;
  return true;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Clan members near another living member slowly bond (0.01/s) up to 1. Outsiders are handled by recruitment. */
export function bondTick(members: HominidData[], dt: number, radius = BOND_RADIUS): void {
  const living = members.filter(isAlive);
  for (const m of living) {
    if (m.isOutsider || m.bond >= 1) continue;
    const near = living.some((o) => o !== m && dist(o.position, m.position) <= radius);
    if (near) m.bond = Math.min(1, m.bond + BOND_RATE_PER_SECOND * dt);
  }
}
