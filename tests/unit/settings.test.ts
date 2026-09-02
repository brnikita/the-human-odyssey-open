import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY, qualityParams } from '@/core/settings';

describe('settings', () => {
  beforeEach(() => localStorage.removeItem(SETTINGS_KEY));

  it('returns defaults when nothing is stored or storage is corrupt', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips and merges partial data with defaults', () => {
    saveSettings({ ...DEFAULT_SETTINGS, volume: 0.2, invertY: true });
    expect(loadSettings()).toMatchObject({ volume: 0.2, invertY: true, quality: 'auto' });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sensitivity: 2 }));
    expect(loadSettings()).toMatchObject({ sensitivity: 2, volume: DEFAULT_SETTINGS.volume });
  });

  it('quality presets scale monotonically', () => {
    const low = qualityParams('low'), med = qualityParams('medium'), high = qualityParams('high');
    expect(low.treeDistance).toBeLessThan(med.treeDistance);
    expect(med.treeDistance).toBeLessThan(high.treeDistance);
    expect(low.shadows).toBe(false);
    expect(high.shadows).toBe(true);
    expect(low.pixelRatio).toBeLessThan(med.pixelRatio);
  });
});
