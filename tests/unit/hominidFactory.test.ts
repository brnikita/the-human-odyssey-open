import { describe, it, expect } from 'vitest';
import { createHominid, stageFromAge, stageStatMultiplier } from '@/entities/hominidFactory';

describe('hominidFactory', () => {
  it('creates a hominid with sensible defaults', () => {
    const h = createHominid({ id: 'h1' });
    expect(h.id).toBe('h1');
    expect(h.name).toBe('h1');
    expect(h.stage).toBe('adult');
    expect(h.stats).toEqual({ health: 100, energy: 100, hunger: 100, thirst: 100 });
    expect(h.maxStats).toEqual({ health: 100, energy: 100, hunger: 100, thirst: 100 });
    expect(h.conditions).toEqual([]);
    expect(h.state).toBe('idle');
    expect(h.fear).toBe(0);
    expect(h.dopamine).toBe(50);
    expect(h.held).toEqual({ left: null, right: null });
    expect(h.neurons).toEqual([]);
    expect(h.reinforced).toEqual([]);
    expect(h.genetic).toEqual([]);
    expect(h.carriedBaby).toBeNull();
    expect(h.isPlayer).toBe(false);
    expect(h.isOutsider).toBe(false);
    expect(h.bond).toBe(0);
    expect(h.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('applies overrides', () => {
    const h = createHominid({
      id: 'p',
      name: 'Kala',
      sex: 'male',
      isPlayer: true,
      fear: 20,
      dopamine: 80,
      state: 'walk',
      position: { x: 1, y: 2, z: 3 },
      held: { left: 'stick', right: null },
    });
    expect(h.name).toBe('Kala');
    expect(h.sex).toBe('male');
    expect(h.isPlayer).toBe(true);
    expect(h.fear).toBe(20);
    expect(h.dopamine).toBe(80);
    expect(h.state).toBe('walk');
    expect(h.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(h.held.left).toBe('stick');
  });

  it('derives stage from ageYears when stage is not given', () => {
    expect(createHominid({ id: 'a', ageYears: 1 }).stage).toBe('baby');
    expect(createHominid({ id: 'b', ageYears: 5 }).stage).toBe('child');
    expect(createHominid({ id: 'c', ageYears: 20 }).stage).toBe('adult');
    expect(createHominid({ id: 'd', ageYears: 50 }).stage).toBe('elder');
  });

  it('picks a representative age when only stage is given', () => {
    const baby = createHominid({ id: 'x', stage: 'baby' });
    expect(stageFromAge(baby.ageYears)).toBe('baby');
    const elder = createHominid({ id: 'y', stage: 'elder' });
    expect(stageFromAge(elder.ageYears)).toBe('elder');
  });

  it('stats default to maxStats when only maxStats is overridden', () => {
    const h = createHominid({ id: 'm', maxStats: { health: 150, energy: 120, hunger: 100, thirst: 100 } });
    expect(h.stats.health).toBe(150);
    expect(h.stats.energy).toBe(120);
  });

  it('does not alias arrays or nested objects passed as overrides', () => {
    const neurons = ['n1'];
    const conditions = [{ id: 'bleeding' as const, severity: 0.5, time: 0 }];
    const position = { x: 5, y: 0, z: 5 };
    const h = createHominid({ id: 'z', neurons, conditions, position });
    neurons.push('n2');
    conditions[0].severity = 1;
    position.x = 99;
    expect(h.neurons).toEqual(['n1']);
    expect(h.conditions[0].severity).toBe(0.5);
    expect(h.position.x).toBe(5);
  });

  it('stageFromAge respects the thresholds', () => {
    expect(stageFromAge(0)).toBe('baby');
    expect(stageFromAge(2.99)).toBe('baby');
    expect(stageFromAge(3)).toBe('child');
    expect(stageFromAge(9.99)).toBe('child');
    expect(stageFromAge(10)).toBe('adult');
    expect(stageFromAge(34.99)).toBe('adult');
    expect(stageFromAge(35)).toBe('elder');
    expect(stageFromAge(80)).toBe('elder');
  });

  it('stageStatMultiplier returns the tuned multipliers', () => {
    expect(stageStatMultiplier('baby')).toEqual({ health: 0.3, energy: 0.5, speed: 0.4 });
    expect(stageStatMultiplier('child')).toEqual({ health: 0.6, energy: 0.8, speed: 0.8 });
    expect(stageStatMultiplier('adult')).toEqual({ health: 1, energy: 1, speed: 1 });
    expect(stageStatMultiplier('elder')).toEqual({ health: 0.8, energy: 0.7, speed: 0.75 });
  });

  it('stageStatMultiplier returns a fresh object each call', () => {
    const a = stageStatMultiplier('adult');
    a.speed = 5;
    expect(stageStatMultiplier('adult').speed).toBe(1);
  });
});
