/** Player settings persisted in localStorage. */
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  quality: QualityPreset;
  volume: number; // 0..1
  sensitivity: number; // 0.3..2.5
  invertY: boolean;
  showFps: boolean;
}

export const SETTINGS_KEY = 'human-odyssey-settings-v1';

export const DEFAULT_SETTINGS: Settings = { quality: 'auto', volume: 0.7, sensitivity: 1, invertY: false, showFps: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Render parameters for a quality preset. */
export function qualityParams(q: Exclude<QualityPreset, 'auto'>) {
  switch (q) {
    case 'low': return { pixelRatio: 0.7, shadows: false, shadowMap: 1024, treeDistance: 220, bushDistance: 90, grassDistance: 55, shadowDistance: 40 };
    case 'medium': return { pixelRatio: 1, shadows: true, shadowMap: 1536, treeDistance: 320, bushDistance: 130, grassDistance: 85, shadowDistance: 70 };
    case 'high': return { pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, shadowMap: 2048, treeDistance: 480, bushDistance: 200, grassDistance: 140, shadowDistance: 110 };
  }
}
