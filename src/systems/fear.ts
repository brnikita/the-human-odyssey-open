// Fear / dopamine / panic system. Pure TS.
import type { HominidData } from '@/core/types';

export const FEAR_RATES = {
  rise: 2.5, // per second in unknown territory
  nightMult: 1.6,
  predatorMult: 1.5,
  clanMult: 0.7,
  highDopamineThreshold: 70,
  highDopamineReduction: 0.4, // 40% less fear rise
  decay: 4, // per second in known territory
  dopamineBaseline: 30,
  dopamineDecay: 0.5, // per second toward baseline
  panicEnter: 100,
  panicExit: 60,
  overcomeSeconds: 45,
  overcomeSuccessDopamine: 40,
} as const;

export interface FearContext {
  inUnknownArea: boolean;
  /** multiplier from neurons (e.g. courage) - 1 = default */
  fearMult: number;
  nearPredator: boolean;
  isNight: boolean;
  withClan: boolean;
}

export const DEFAULT_FEAR_CONTEXT: FearContext = {
  inUnknownArea: false,
  fearMult: 1,
  nearPredator: false,
  isNight: false,
  withClan: false,
};

export interface PanicState {
  panic: boolean;
  /** seconds spent in the current panic episode */
  timeInPanic: number;
}

const panicStates = new WeakMap<HominidData, PanicState>();

export function getPanicState(h: HominidData): PanicState {
  let st = panicStates.get(h);
  if (!st) {
    st = { panic: h.fear >= FEAR_RATES.panicEnter, timeInPanic: 0 };
    panicStates.set(h, st);
  }
  return st;
}

export function isPanicking(h: HominidData): boolean {
  return h.fear >= FEAR_RATES.panicEnter || getPanicState(h).panic;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function addDopamine(h: HominidData, amount: number): number {
  h.dopamine = clamp(h.dopamine + amount, 0, 100);
  return h.dopamine;
}

export type DiscoveryKind = 'item' | 'plant' | 'animal' | 'area' | 'landmark';

const DISCOVERY_DOPAMINE: Record<DiscoveryKind, number> = {
  item: 10,
  plant: 10,
  animal: 15,
  area: 20,
  landmark: 25,
};

export function discoveryDopamine(kind: DiscoveryKind): number {
  return DISCOVERY_DOPAMINE[kind];
}

/** Fear rise rate (per second) for a context; 0 when fear should decay instead. */
export function fearRiseRate(h: HominidData, ctx: FearContext): number {
  if (!ctx.inUnknownArea && !ctx.nearPredator) return 0;
  let rate = FEAR_RATES.rise * ctx.fearMult;
  if (ctx.isNight) rate *= FEAR_RATES.nightMult;
  if (ctx.nearPredator) rate *= FEAR_RATES.predatorMult;
  if (ctx.withClan) rate *= FEAR_RATES.clanMult;
  if (h.dopamine >= FEAR_RATES.highDopamineThreshold) rate *= 1 - FEAR_RATES.highDopamineReduction;
  // A predator in known territory is still frightening, but less so than the unknown.
  if (!ctx.inUnknownArea) rate *= 0.5;
  return rate;
}

/**
 * Advance fear & dopamine by `dt` seconds.
 * Fear rises in unknown areas (or near predators) and decays in known areas.
 * Panic starts when fear reaches 100 and ends (calmed) when it drops below 60.
 */
export function tickFear(h: HominidData, dt: number, ctx: FearContext): { panicStarted: boolean; calmed: boolean } {
  const out = { panicStarted: false, calmed: false };
  if (h.state === 'dead' || !(dt > 0)) return out;

  const rise = fearRiseRate(h, ctx);
  if (rise > 0) h.fear += rise * dt;
  else h.fear -= FEAR_RATES.decay * dt;
  h.fear = clamp(h.fear, 0, 100);

  // Dopamine drifts toward its baseline.
  const base = FEAR_RATES.dopamineBaseline;
  const d = FEAR_RATES.dopamineDecay * dt;
  if (h.dopamine > base) h.dopamine = Math.max(base, h.dopamine - d);
  else if (h.dopamine < base) h.dopamine = Math.min(base, h.dopamine + d);

  const st = getPanicState(h);
  if (!st.panic) {
    if (h.fear >= FEAR_RATES.panicEnter) {
      st.panic = true;
      st.timeInPanic = 0;
      out.panicStarted = true;
    }
  } else {
    st.timeInPanic += dt;
    if (h.fear < FEAR_RATES.panicExit) {
      st.panic = false;
      st.timeInPanic = 0;
      out.calmed = true;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overcome-fear challenge: find glowing lights while afraid
// ---------------------------------------------------------------------------
export type OvercomeStatus = 'active' | 'success' | 'failed';

export interface OvercomeChallenge {
  lightsNeeded: number; // 3..5
  found: number;
  timeLeft: number; // seconds
  status: OvercomeStatus;
}

export function startOvercome(_h: HominidData, rng: () => number): OvercomeChallenge {
  const lightsNeeded = 3 + Math.min(2, Math.floor(clamp(rng(), 0, 0.999999) * 3));
  return { lightsNeeded, found: 0, timeLeft: FEAR_RATES.overcomeSeconds, status: 'active' };
}

/** Register a collected light. Returns true when the challenge is completed by this light. */
export function collectLight(ch: OvercomeChallenge): boolean {
  if (ch.status !== 'active') return ch.status === 'success';
  ch.found += 1;
  if (ch.found >= ch.lightsNeeded) {
    ch.status = 'success';
    return true;
  }
  return false;
}

export function tickOvercome(ch: OvercomeChallenge, dt: number): OvercomeStatus {
  if (ch.status !== 'active') return ch.status;
  ch.timeLeft = Math.max(0, ch.timeLeft - Math.max(0, dt));
  if (ch.found >= ch.lightsNeeded) ch.status = 'success';
  else if (ch.timeLeft <= 0) ch.status = 'failed';
  return ch.status;
}

export function applyOvercomeResult(h: HominidData, success: boolean): void {
  const st = getPanicState(h);
  if (success) {
    h.fear = 0;
    addDopamine(h, FEAR_RATES.overcomeSuccessDopamine);
    st.panic = false;
    st.timeInPanic = 0;
  } else {
    h.fear = 100;
    st.panic = true;
  }
}
