import type { SaveGame } from './types';

export const SAVE_KEY = 'human-odyssey-save-v1';
export const SAVE_VERSION = 1;

export function hasSave(): boolean {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

export function writeSave(save: SaveGame): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveGame;
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
