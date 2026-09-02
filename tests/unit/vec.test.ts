import { describe, expect, it } from 'vitest';
import * as V from '@/util/vec';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('vec', () => {
  it('constructs vectors', () => {
    expect(V.vec()).toEqual({ x: 0, y: 0, z: 0 });
    expect(V.vec(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('adds and subtracts without mutating inputs', () => {
    const a = V.vec(1, 2, 3);
    const b = V.vec(4, 5, 6);
    expect(V.add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(V.sub(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
    expect(b).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('scales and dots', () => {
    expect(V.scale(V.vec(1, -2, 3), 2)).toEqual({ x: 2, y: -4, z: 6 });
    expect(V.dot(V.vec(1, 2, 3), V.vec(4, 5, 6))).toBe(32);
    expect(V.dot(V.vec(1, 0, 0), V.vec(0, 1, 0))).toBe(0);
  });

  it('measures length', () => {
    expect(V.length(V.vec(3, 4, 0))).toBe(5);
    expect(V.length(V.vec(0, 0, 0))).toBe(0);
    expect(V.lengthXZ(V.vec(3, 100, 4))).toBe(5);
  });

  it('normalizes (zero stays zero)', () => {
    const n = V.normalize(V.vec(0, 3, 4));
    expect(close(n.y, 0.6)).toBe(true);
    expect(close(n.z, 0.8)).toBe(true);
    expect(close(V.length(n), 1)).toBe(true);
    expect(V.normalize(V.vec())).toEqual({ x: 0, y: 0, z: 0 });
    const nxz = V.normalizeXZ(V.vec(3, 50, 4));
    expect(nxz.y).toBe(0);
    expect(close(V.lengthXZ(nxz), 1)).toBe(true);
  });

  it('computes distance and distanceXZ', () => {
    const a = V.vec(0, 0, 0);
    const b = V.vec(3, 10, 4);
    expect(close(V.distance(a, b), Math.sqrt(125))).toBe(true);
    expect(V.distanceXZ(a, b)).toBe(5);
  });

  it('lerps', () => {
    const a = V.vec(0, 0, 0);
    const b = V.vec(10, 20, 30);
    expect(V.lerp(a, b, 0)).toEqual(a);
    expect(V.lerp(a, b, 1)).toEqual(b);
    expect(V.lerp(a, b, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
  });

  it('converts headings both ways and rotates around y', () => {
    const d = V.fromHeading(Math.PI / 2);
    expect(close(d.x, 0)).toBe(true);
    expect(close(d.z, 1)).toBe(true);
    expect(close(V.toHeading(d), Math.PI / 2)).toBe(true);
    expect(V.toHeading(V.vec())).toBe(0);
    const r = V.rotateY(V.vec(1, 0, 0), Math.PI / 2);
    expect(close(r.x, 0)).toBe(true);
    expect(close(r.z, 1)).toBe(true);
    expect(close(V.lengthXZ(r), 1)).toBe(true);
  });

  it('clone and equals', () => {
    const a = V.vec(1, 2, 3);
    const c = V.clone(a);
    expect(c).toEqual(a);
    expect(c).not.toBe(a);
    expect(V.equals(a, V.vec(1, 2, 3 + 1e-12))).toBe(true);
    expect(V.equals(a, V.vec(1, 2, 4))).toBe(false);
  });
});
