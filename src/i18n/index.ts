// Minimal i18n runtime: dictionary lookup with placeholder substitution and
// language persistence. Dictionaries live in ./en.ts and ./ru.ts.
import { en } from './en';
import { ru, ruData } from './ru';

export type Lang = 'en' | 'ru';

export const LANG_KEY = 'human-odyssey-lang';

export type DataKind = 'item' | 'plant' | 'animal' | 'neuron' | 'feat' | 'landmark';
export type DataField = 'name' | 'description';
export interface DataText { name: string; description?: string }

const DICTS: Record<Lang, Record<string, string>> = { en, ru };
const DATA: Partial<Record<Lang, Record<string, DataText>>> = { ru: ruData };

let current: Lang | null = null;

function detect(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  } catch { /* ignore */ }
  try {
    const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
    if (nav.toLowerCase().startsWith('ru')) return 'ru';
  } catch { /* ignore */ }
  return 'en';
}

export function getLang(): Lang {
  if (!current) current = detect();
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
}

/** Replace `{name}` placeholders with values from `params`; unknown placeholders are left as-is. */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate a UI key: current language → English → the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLang();
  const text = DICTS[lang][key] ?? en[key] ?? key;
  return interpolate(text, params);
}

/** Translated data text (name/description) for the current language, or undefined when none exists. */
export function tn(kind: DataKind, id: string, field: DataField): string | undefined {
  const table = DATA[getLang()];
  if (!table) return undefined;
  return table[`${kind}:${id}`]?.[field];
}

/** Localized data name with an explicit English fallback (the value from the data file). */
export function localizedName(kind: DataKind, id: string, fallback: string): string {
  return tn(kind, id, 'name') ?? fallback;
}

/** Localized data description with an explicit English fallback. */
export function localizedDescription(kind: DataKind, id: string, fallback: string): string {
  return tn(kind, id, 'description') ?? fallback;
}

export const LANGS: Lang[] = ['en', 'ru'];
export { en, ru, ruData };
