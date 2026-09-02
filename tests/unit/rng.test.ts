import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, pick, randInt, randRange, shuffle } from '@/util/rng';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays within [0, 1) and is reasonably uniform', () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 5000).toBeGreaterThan(0.45);
    expect(sum / 5000).toBeLessThan(0.55);
  });
});

describe('randRange / randInt', () => {
  it('randRange stays within [a, b)', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 1000; i++) {
      const v = randRange(rng, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it('randInt is inclusive on both ends and returns integers', () => {
    const rng = mulberry32(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(rng, 1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('randInt handles a == b and swapped bounds', () => {
    const rng = mulberry32(5);
    expect(randInt(rng, 4, 4)).toBe(4);
    for (let i = 0; i < 100; i++) {
      const v = randInt(rng, 3, 1);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });
});

describe('pick / shuffle', () => {
  it('pick returns an element of the array and throws on empty', () => {
    const rng = mulberry32(9);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(rng, arr));
    expect(() => pick(rng, [])).toThrow();
  });

  it('shuffle returns a permutation without mutating the input', () => {
    const rng = mulberry32(13);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = input.slice();
    const out = shuffle(rng, input);
    expect(input).toEqual(copy);
    expect(out).toHaveLength(input.length);
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('shuffle actually reorders for a typical seed', () => {
    const rng = mulberry32(99);
    const input = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffle(rng, input)).not.toEqual(input);
  });
});

describe('hashString', () => {
  it('is deterministic and returns an unsigned 32-bit integer', () => {
    const h = hashString('the-human-odyssey');
    expect(h).toBe(hashString('the-human-odyssey'));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different strings and seeds a PRNG usably', () => {
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).not.toBe(hashString('a'));
    const rng = mulberry32(hashString('seed'));
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
