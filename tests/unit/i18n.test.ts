import { describe, it, expect, beforeEach } from 'vitest';
import { en } from '@/i18n/en';
import { ru, ruData } from '@/i18n/ru';
import { t, tn, getLang, setLang, localizedName, localizedDescription, interpolate, LANG_KEY } from '@/i18n';
import { ITEMS } from '@/data/items';
import { PLANTS } from '@/data/plants';
import { SPECIES } from '@/data/species';
import { NEURONS } from '@/data/neurons';
import { FEATS } from '@/data/feats';
import { LANDMARKS } from '@/world/landmarks';
import { RECIPES, ALTERATIONS } from '@/systems/crafting';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  it('ru has every key en has, and vice versa', () => {
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    const missingInRu = enKeys.filter((k) => !(k in ru));
    const missingInEn = ruKeys.filter((k) => !(k in en));
    expect(missingInRu).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it('has no empty values', () => {
    for (const [k, v] of Object.entries(en)) expect(v.length, `en.${k}`).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(ru)) expect(v.length, `ru.${k}`).toBeGreaterThan(0);
  });

  it('ru uses the same placeholders as en for every key', () => {
    for (const k of Object.keys(en)) {
      expect(placeholders(ru[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it('covers every crafting recipe and alteration description', () => {
    for (const r of RECIPES) expect(en[`recipe.${r.a}_${r.b}`], `recipe ${r.a}+${r.b}`).toBe(r.description);
    for (const a of ALTERATIONS) expect(en[`alteration.${a.from}`], `alteration ${a.from}`).toBe(a.description);
  });
});

describe('ruData coverage', () => {
  const check = (kind: string, ids: string[]) => {
    for (const id of ids) {
      const entry = ruData[`${kind}:${id}`];
      expect(entry, `${kind}:${id}`).toBeDefined();
      expect(entry.name.length, `${kind}:${id} name`).toBeGreaterThan(0);
      expect(entry.description?.length ?? 0, `${kind}:${id} description`).toBeGreaterThan(0);
    }
  };

  it('covers all items', () => check('item', Object.keys(ITEMS)));
  it('covers all plants', () => check('plant', Object.keys(PLANTS)));
  it('covers all species', () => check('animal', Object.keys(SPECIES)));
  it('covers all neurons', () => check('neuron', NEURONS.map((n) => n.id)));
  it('covers all feats', () => check('feat', FEATS.map((f) => f.id)));
  it('covers all landmarks', () => check('landmark', Object.keys(LANDMARKS)));

  it('has no stray entries that do not match a data id', () => {
    const valid = new Set([
      ...Object.keys(ITEMS).map((i) => `item:${i}`),
      ...Object.keys(PLANTS).map((i) => `plant:${i}`),
      ...Object.keys(SPECIES).map((i) => `animal:${i}`),
      ...NEURONS.map((n) => `neuron:${n.id}`),
      ...FEATS.map((f) => `feat:${f.id}`),
      ...Object.keys(LANDMARKS).map((i) => `landmark:${i}`),
    ]);
    for (const k of Object.keys(ruData)) expect(valid.has(k), k).toBe(true);
  });
});

describe('i18n runtime', () => {
  beforeEach(() => {
    localStorage.removeItem(LANG_KEY);
    setLang('en');
  });

  it('interpolates placeholders and leaves unknown ones untouched', () => {
    expect(interpolate('Day {day} · {time}', { day: 3, time: '06:00' })).toBe('Day 3 · 06:00');
    expect(interpolate('Hi {name} {other}', { name: 'Ako' })).toBe('Hi Ako {other}');
    expect(t('hud.generation', { generation: 2, n: 5 })).toBe('Generation 2 · 5 clan members');
    setLang('ru');
    expect(t('hud.day', { day: 7, time: '12:30' })).toBe('День 7 · 12:30');
  });

  it('returns the English text for the current language and falls back to en, then to the key', () => {
    expect(t('menu.new')).toBe('New Lineage');
    setLang('ru');
    expect(t('menu.new')).toBe('Новый род');
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
    expect(t('nope', { x: 1 })).toBe('nope');
  });

  it('tn returns Russian data text only when the language is ru', () => {
    expect(tn('item', 'stick', 'name')).toBeUndefined();
    expect(localizedName('item', 'stick', ITEMS.stick.name)).toBe('Dead Branch');
    setLang('ru');
    expect(tn('item', 'stick', 'name')).toBe(ruData['item:stick'].name);
    expect(tn('neuron', 'mot_balance', 'description')).toBe(ruData['neuron:mot_balance'].description);
    expect(tn('item', 'does_not_exist', 'name')).toBeUndefined();
    expect(localizedName('item', 'does_not_exist', 'Fallback')).toBe('Fallback');
    expect(localizedDescription('landmark', 'cave', 'x')).toBe(ruData['landmark:cave'].description);
  });

  it('setLang persists to localStorage and getLang reads it back', () => {
    setLang('ru');
    expect(localStorage.getItem(LANG_KEY)).toBe('ru');
    expect(getLang()).toBe('ru');
    setLang('en');
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
    expect(getLang()).toBe('en');
  });
});
