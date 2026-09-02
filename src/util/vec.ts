// Minimal pure Vec3 helpers. All functions return new objects and never mutate inputs.
import type { Vec3 } from '@/core/types';

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const ZERO: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });

export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const length = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export const lengthXZ = (a: Vec3): number => Math.sqrt(a.x * a.x + a.z * a.z);

/** Unit vector in the direction of `a`; the zero vector normalizes to zero. */
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
};

/** Unit vector of the horizontal (xz) component of `a`, y forced to 0. */
export const normalizeXZ = (a: Vec3): Vec3 => {
  const l = lengthXZ(a);
  return l > 1e-9 ? { x: a.x / l, y: 0, z: a.z / l } : { x: 0, y: 0, z: 0 };
};

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export const distanceXZ = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const equals = (a: Vec3, b: Vec3, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;

/** Horizontal unit vector for a heading angle (radians, 0 = +x, pi/2 = +z). */
export const fromHeading = (heading: number): Vec3 => ({ x: Math.cos(heading), y: 0, z: Math.sin(heading) });

/** Heading angle (radians) of the horizontal component of `a`. Zero vector -> 0. */
export const toHeading = (a: Vec3): number => (a.x === 0 && a.z === 0 ? 0 : Math.atan2(a.z, a.x));

/** Rotate the horizontal component of `a` around the y axis by `angle` radians. */
export const rotateY = (a: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.z * s, y: a.y, z: a.x * s + a.z * c };
};
