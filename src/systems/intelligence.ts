// Intelligence mode: sense detection (range + cone), identification, area exploration. Pure TS.
import type { AbilityId, LineageState, SenseKind, Vec3 } from '@/core/types';

export type SensableKind = 'item' | 'plant' | 'animal' | 'hominid' | 'landmark' | 'water';

export interface Sensable {
  uid: string;
  kind: SensableKind;
  /** item / plant / species / landmark id used for discovery */
  defId: string;
  position: Vec3;
  /** already identified by the lineage */
  known: boolean;
  noise: number; // 0..1
  scent: number; // 0..1
  /** occluded from sight (behind cover, underwater, in a hole...) */
  hidden?: boolean;
}

export interface SenseRanges {
  sight: number;
  smell: number;
  hearing: number;
}

export const DEFAULT_SENSE_RANGES: SenseRanges = { sight: 40, smell: 25, hearing: 35 };

/** cos(70 deg) ~ 0.342 : half-angle of the vision cone */
export const SIGHT_CONE_COS = 0.34;
/** fraction of sight range within which a target can be identified by sight */
export const SIGHT_IDENTIFY_FRACTION = 0.6;
/** minimum scent / noise for a target to be sensed at all */
export const SENSE_MIN_SIGNAL = 0.05;

export interface Detection {
  target: Sensable;
  distance: number;
  /** 0..1, closer = stronger (scaled by signal strength for smell/hearing) */
  strength: number;
  canIdentify: boolean;
}

// ---------------------------------------------------------------------------
// Vector helpers (local; y ignored for direction tests)
// ---------------------------------------------------------------------------
const dist3 = (a: Vec3, b: Vec3): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/** cosine of the horizontal angle between `forward` and the direction origin->target; 1 when coincident */
function horizontalAlignment(origin: Vec3, forward: Vec3, target: Vec3): number {
  const fx = forward.x;
  const fz = forward.z;
  const fl = Math.sqrt(fx * fx + fz * fz);
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dl = Math.sqrt(dx * dx + dz * dz);
  if (dl < 1e-6) return 1; // on top of us
  if (fl < 1e-6) return 1; // no facing -> omnidirectional
  return (fx * dx + fz * dz) / (fl * dl);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect sensables from `origin` facing `forward` with a given sense.
 * - sight: within range, inside the 70deg half-angle cone, not hidden.
 * - smell: within smell range, scent > 0.05, ignores hidden.
 * - hearing: within hearing range, noise > 0.05, ignores hidden.
 * Results are sorted by distance (closest first).
 */
export function detect(
  origin: Vec3,
  forward: Vec3,
  targets: Sensable[],
  sense: SenseKind,
  ranges: SenseRanges,
  abilities?: Set<AbilityId>,
): Detection[] {
  const out: Detection[] = [];
  for (const t of targets) {
    const d = dist3(origin, t.position);
    switch (sense) {
      case 'sight': {
        if (t.hidden) continue;
        if (d > ranges.sight) continue;
        if (horizontalAlignment(origin, forward, t.position) < SIGHT_CONE_COS) continue;
        out.push({
          target: t,
          distance: d,
          strength: clamp01(1 - d / Math.max(ranges.sight, 1e-6)),
          canIdentify: d < ranges.sight * SIGHT_IDENTIFY_FRACTION,
        });
        break;
      }
      case 'smell': {
        if (d > ranges.smell || t.scent <= SENSE_MIN_SIGNAL) continue;
        out.push({
          target: t,
          distance: d,
          strength: clamp01((1 - d / Math.max(ranges.smell, 1e-6)) * clamp01(t.scent)),
          canIdentify: abilities?.has('identify_smell') ?? false,
        });
        break;
      }
      case 'hearing': {
        if (d > ranges.hearing || t.noise <= SENSE_MIN_SIGNAL) continue;
        out.push({
          target: t,
          distance: d,
          strength: clamp01((1 - d / Math.max(ranges.hearing, 1e-6)) * clamp01(t.noise)),
          canIdentify: abilities?.has('identify_sound') ?? false,
        });
        break;
      }
      default:
        break;
    }
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

/** Among detections, pick the one most aligned with `forward`; null when empty. */
export function focusTarget(detections: Detection[], forward: Vec3, origin: Vec3): Detection | null {
  let best: Detection | null = null;
  let bestAlign = -Infinity;
  for (const det of detections) {
    const a = horizontalAlignment(origin, forward, det.target.position);
    // Tie-break on distance so a nearer target wins when equally aligned.
    if (a > bestAlign + 1e-9 || (Math.abs(a - bestAlign) <= 1e-9 && best && det.distance < best.distance)) {
      bestAlign = a;
      best = det;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Identification & exploration
// ---------------------------------------------------------------------------
export const IDENTIFY_ENERGY_NEW = 25;
export const IDENTIFY_ENERGY_REPEAT = 2;

/** Identify a discovery; adds it to the lineage. Returns whether it was new and the neuronal energy granted. */
export function identify(lineage: LineageState, discoveryId: string): { isNew: boolean; energy: number } {
  if (lineage.discoveries.includes(discoveryId)) return { isNew: false, energy: IDENTIFY_ENERGY_REPEAT };
  lineage.discoveries.push(discoveryId);
  return { isNew: true, energy: IDENTIFY_ENERGY_NEW };
}

export const isKnown = (lineage: LineageState, discoveryId: string): boolean =>
  lineage.discoveries.includes(discoveryId);

export const DEFAULT_AREA_CELL = 64;

export function areaCellId(pos: Vec3, cellSize: number = DEFAULT_AREA_CELL): string {
  const cs = cellSize > 0 ? cellSize : DEFAULT_AREA_CELL;
  return `${Math.floor(pos.x / cs)},${Math.floor(pos.z / cs)}`;
}

/** Mark the cell containing `pos` as explored. Returns true if it was newly discovered. */
export function exploreArea(lineage: LineageState, pos: Vec3, cellSize: number = DEFAULT_AREA_CELL): boolean {
  const id = areaCellId(pos, cellSize);
  if (lineage.areasExplored.includes(id)) return false;
  lineage.areasExplored.push(id);
  return true;
}

export function isAreaKnown(lineage: LineageState, pos: Vec3, cellSize: number = DEFAULT_AREA_CELL): boolean {
  return lineage.areasExplored.includes(areaCellId(pos, cellSize));
}
