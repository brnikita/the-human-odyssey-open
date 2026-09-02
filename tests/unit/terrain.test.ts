import { describe, it, expect } from 'vitest';
import { Terrain, WORLD_SIZE, WATER_LEVEL } from '@/world/terrain';
import { placeLandmarks, LANDMARKS } from '@/world/landmarks';

describe('Terrain', () => {
  const t = new Terrain(42);

  it('is deterministic per seed', () => {
    const t2 = new Terrain(42), t3 = new Terrain(43);
    expect(t2.heightAt(10, 20)).toBe(t.heightAt(10, 20));
    expect(t3.heightAt(10, 20)).not.toBe(t.heightAt(10, 20));
  });

  it('has a lake below water level and mountains at the edges', () => {
    let water = 0, total = 0, maxH = -Infinity;
    for (let z = -560; z <= 560; z += 20) for (let x = -560; x <= 560; x += 20) { total++; const h = t.heightAt(x, z); if (h < WATER_LEVEL) water++; maxH = Math.max(maxH, h); }
    expect(water / total).toBeGreaterThan(0.03);
    expect(water / total).toBeLessThan(0.4);
    expect(maxH).toBeGreaterThan(60);
    expect(t.heightAt(WORLD_SIZE / 2 - 5, 0)).toBeGreaterThan(80);
  });

  it('exposes all biomes', () => {
    const seen = new Set<string>();
    for (let z = -560; z <= 560; z += 12) for (let x = -560; x <= 560; x += 12) seen.add(t.biomeAt(x, z));
    for (const b of ['jungle', 'savanna', 'swamp', 'lake', 'cliffs', 'beach']) expect([...seen]).toContain(b);
  });

  it('interpolates smoothly and reports slope and normals', () => {
    const a = t.heightAt(100, 100), b = t.heightAt(100.5, 100), c = t.heightAt(101, 100);
    expect(Math.abs(b - (a + c) / 2)).toBeLessThan(1);
    const n = t.normalAt(100, 100);
    expect(n.length()).toBeCloseTo(1, 5);
    expect(t.slopeAt(100, 100)).toBeGreaterThanOrEqual(0);
    expect(t.slopeAt(100, 100)).toBeLessThanOrEqual(1);
    expect(t.isWater(0, 0)).toBe(t.heightAt(0, 0) < WATER_LEVEL - 0.3);
  });

  it('builds chunk meshes', () => {
    const g = t.build();
    expect(g.children.length).toBe(400);
    const mesh = g.children[0] as { geometry: { getAttribute: (n: string) => { count: number } } };
    expect(mesh.geometry.getAttribute('position').count).toBe(25 * 25);
    t.dispose();
  });
});

describe('Landmarks', () => {
  const t = new Terrain(7);
  const settlement = { x: 0, y: 0, z: 100 };

  it('places every landmark in a fitting biome, far from the settlement and from each other', () => {
    const lm = placeLandmarks(t, 7, settlement);
    expect(lm.length).toBe(Object.keys(LANDMARKS).length);
    for (const l of lm) {
      expect(l.def.biomes).toContain(t.biomeAt(l.position.x, l.position.z));
      expect(Math.hypot(l.position.x - settlement.x, l.position.z - settlement.z)).toBeGreaterThanOrEqual(140);
      for (const o of lm) if (o !== l) expect(Math.hypot(o.position.x - l.position.x, o.position.z - l.position.z)).toBeGreaterThanOrEqual(120);
      expect(l.group.children.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed', () => {
    const a = placeLandmarks(t, 7, settlement), b = placeLandmarks(t, 7, settlement);
    expect(a.map((l) => [l.def.id, l.position.x, l.position.z])).toEqual(b.map((l) => [l.def.id, l.position.x, l.position.z]));
  });
});
