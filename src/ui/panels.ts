import type { ClanState, HominidData, LineageState, BiomeId } from '@/core/types';
import { ITEM_LIST } from '@/data/items';
import { PLANT_LIST } from '@/data/plants';
import { SPECIES_LIST } from '@/data/species';
import { FEATS } from '@/data/feats';
import { RECIPES, ALTERATIONS, type Recipe, type Alteration } from '@/systems/crafting';
import { NEURON_MAP } from '@/data/neurons';
import { t, tOr, localizedName, localizedDescription, locale } from '@/i18n';

export type PanelKind = 'inventory' | 'clan' | 'map' | 'evolution';

export interface PanelData {
  clan: ClanState;
  lineage: LineageState;
  player: HominidData;
  abilities: Set<string>;
  /** biome sampler for the map */
  biomeAt: (x: number, z: number) => BiomeId;
  heightAt: (x: number, z: number) => number;
  worldSize: number;
  settlement: { x: number; z: number };
  animals: { x: number; z: number; predator: boolean }[];
  landmarks: { x: number; z: number; name: string }[];
  onSwitch: (id: string) => void;
  onClose: () => void;
}

const BIOME_RGB: Record<BiomeId, [number, number, number]> = {
  jungle: [40, 100, 40], savanna: [168, 150, 63], swamp: [70, 100, 60], lake: [40, 90, 130], cliffs: [125, 117, 104], beach: [200, 185, 140],
};

const TAB_KEYS: Record<PanelKind, string> = { inventory: 'panel.tab.knowledge', clan: 'panel.tab.clan', map: 'panel.tab.map', evolution: 'panel.tab.evolution' };

const recipeText = (r: Recipe) => tOr(`recipe.${r.a}_${r.b}`, r.description);
const alterationText = (a: Alteration) => tOr(`alteration.${a.from}`, a.description);

export class Panels {
  readonly root: HTMLElement;
  private current: PanelKind | null = null;
  private mapCache: ImageData | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    parent.appendChild(this.root);
  }

  get open(): PanelKind | null { return this.current; }

  close() {
    this.root.innerHTML = '';
    this.current = null;
  }

  show(kind: PanelKind, d: PanelData) {
    this.close();
    this.current = kind;
    const wrap = document.createElement('div');
    wrap.className = 'screen';
    const modal = document.createElement('div');
    modal.className = 'panel modal';
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const k of ['inventory', 'clan', 'map', 'evolution'] as PanelKind[]) {
      const b = document.createElement('button');
      b.className = `btn ${k === kind ? 'active' : ''}`;
      b.textContent = t(TAB_KEYS[k]);
      b.onclick = () => this.show(k, d);
      tabs.appendChild(b);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn small';
    closeBtn.textContent = t('panel.close');
    closeBtn.style.marginLeft = 'auto';
    closeBtn.onclick = () => d.onClose();
    tabs.appendChild(closeBtn);
    modal.appendChild(tabs);
    const body = document.createElement('div');
    modal.appendChild(body);
    wrap.appendChild(modal);
    this.root.appendChild(wrap);
    switch (kind) {
      case 'inventory': this.renderInventory(body, d); break;
      case 'clan': this.renderClan(body, d); break;
      case 'map': this.renderMap(body, d); break;
      case 'evolution': this.renderEvolution(body, d); break;
    }
  }

  private renderInventory(body: HTMLElement, d: PanelData) {
    const known = new Set(d.lineage.discoveries);
    const p = d.player;
    const itemName = (id: string | null) => {
      if (!id) return t('hud.empty');
      const def = ITEM_LIST.find((i) => i.id === id);
      return def ? localizedName('item', id, def.name) : id;
    };
    const recipes = RECIPES.filter((r) => !r.ability || d.abilities.has(r.ability));
    const alts = ALTERATIONS.filter((a) => d.abilities.has(a.ability));
    const unknownName = t('panel.knowledge.unknownName');
    const unidentified = t('panel.knowledge.unidentified');
    body.innerHTML = `
      <h2>${t('panel.knowledge.title')}</h2>
      <div class="row"><div class="card"><h3>${t('panel.knowledge.leftHand')}</h3>${itemName(p.held.left)}</div><div class="card"><h3>${t('panel.knowledge.rightHand')}</h3>${itemName(p.held.right)}</div></div>
      <div class="muted">${t('panel.knowledge.known', { discoveries: known.size, neurons: p.neurons.length, reinforced: p.reinforced.length, genetic: p.genetic.length })}</div>
      <h3>${t('panel.knowledge.recipes')}</h3>
      <div class="list">${recipes.map((r) => `<div class="entry"><b>${itemName(r.a)} + ${itemName(r.b)}</b>→ ${itemName(r.result)}<div class="tiny">${recipeText(r)}</div></div>`).join('') || `<div class="muted">${t('panel.knowledge.noRecipes')}</div>`}</div>
      <h3>${t('panel.knowledge.alterations')}</h3>
      <div class="list">${alts.map((a) => `<div class="entry"><b>${itemName(a.from)}</b>→ ${itemName(a.to)}<div class="tiny">${alterationText(a)}</div></div>`).join('') || `<div class="muted">${t('panel.knowledge.noAlterations')}</div>`}</div>
      <h3>${t('panel.knowledge.items')}</h3>
      <div class="list">${ITEM_LIST.map((i) => { const k = known.has('item:' + i.id); return `<div class="entry ${k ? '' : 'locked'}"><b>${k ? localizedName('item', i.id, i.name) : unknownName}</b><div class="tiny">${k ? localizedDescription('item', i.id, i.description) : unidentified}</div></div>`; }).join('')}</div>
      <h3>${t('panel.knowledge.plants')}</h3>
      <div class="list">${PLANT_LIST.map((i) => { const k = known.has('plant:' + i.id); return `<div class="entry ${k ? '' : 'locked'}"><b>${k ? localizedName('plant', i.id, i.name) : unknownName}</b><div class="tiny">${k ? localizedDescription('plant', i.id, i.description) : unidentified}</div></div>`; }).join('')}</div>
      <h3>${t('panel.knowledge.animals')}</h3>
      <div class="list">${SPECIES_LIST.map((i) => { const k = known.has('animal:' + i.id); return `<div class="entry ${k ? '' : 'locked'}"><b>${k ? localizedName('animal', i.id, i.name) : unknownName}</b><div class="tiny">${k ? `${t(`behavior.${i.behavior}`)} · ${localizedDescription('animal', i.id, i.description)}` : unidentified}</div></div>`; }).join('')}</div>`;
  }

  private renderClan(body: HTMLElement, d: PanelData) {
    const members = d.clan.members.filter((m) => !m.isOutsider);
    const bar = (v: number, max: number, c: string) => `<i><b style="width:${(v / Math.max(1, max)) * 100}%;background:${c}"></b></i>`;
    const info = (m: HominidData) => `${t('panel.clan.member', { sex: t(`sex.${m.sex}`), stage: t(`stage.${m.stage}`), age: m.ageYears, state: t(`state.${m.state}`) })}${m.carriedBaby ? ` · ${t('panel.clan.carryingBaby')}` : ''}`;
    const neurons = (m: HominidData) => `${t('panel.clan.neurons', { n: m.neurons.length, genetic: m.genetic.length })}${m.conditions.length ? ' · ' + m.conditions.map((c) => t(`cond.${c.id}`)).join(', ') : ''}`;
    body.innerHTML = `<h2>${t('panel.clan.title')}</h2><div class="muted">${t('panel.clan.summary', { n: members.filter((m) => m.state !== 'dead').length, x: Math.round(d.settlement.x), z: Math.round(d.settlement.z) })}</div>
      <div class="list">${members.map((m) => `<div class="card ${m.isPlayer ? 'player' : ''} ${m.state === 'dead' ? 'dead' : ''}" data-id="${m.id}" style="cursor:${m.stage === 'baby' || m.state === 'dead' ? 'default' : 'pointer'}"><h3>${m.name}${m.isPlayer ? ' ★' : ''}</h3><div class="tiny">${info(m)}</div><div class="mini">${bar(m.stats.health, m.maxStats.health, '#ff7b6b')}${bar(m.stats.energy, m.maxStats.energy, '#7ad3ff')}${bar(m.stats.hunger, m.maxStats.hunger, '#ffd06b')}${bar(m.stats.thirst, m.maxStats.thirst, '#8bfff0')}</div><div class="tiny">${neurons(m)}</div></div>`).join('')}</div>`;
    body.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => {
      const id = (c as HTMLElement).dataset.id!;
      const m = members.find((x) => x.id === id);
      if (m && m.stage !== 'baby' && m.state !== 'dead' && !m.isPlayer) d.onSwitch(id);
    }));
  }

  private renderMap(body: HTMLElement, d: PanelData) {
    const size = 256;
    body.innerHTML = `<h2>${t('panel.map.title')}</h2><div class="muted">${t('panel.map.legend')}</div>`;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.className = 'map-canvas';
    canvas.style.maxWidth = '520px';
    body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    if (!this.mapCache) {
      const img = ctx.createImageData(size, size);
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const x = (i / size - 0.5) * d.worldSize, z = (j / size - 0.5) * d.worldSize;
          const b = d.biomeAt(x, z);
          const h = d.heightAt(x, z);
          const [r, g, bl] = BIOME_RGB[b];
          const shade = 0.75 + Math.max(-0.25, Math.min(0.35, h / 120));
          const k = (j * size + i) * 4;
          img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = bl * shade; img.data[k + 3] = 255;
        }
      }
      this.mapCache = img;
    }
    ctx.putImageData(this.mapCache, 0, 0);
    // fog of war
    const explored = new Set(d.lineage.areasExplored);
    const cell = 64;
    const cells = d.worldSize / cell;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let cz = 0; cz < cells; cz++) {
      for (let cx = 0; cx < cells; cx++) {
        const wx = (cx - cells / 2) * cell, wz = (cz - cells / 2) * cell;
        const id = `${Math.floor(wx / cell)},${Math.floor(wz / cell)}`;
        if (!explored.has(id)) ctx.fillRect((cx / cells) * size, (cz / cells) * size, size / cells + 0.5, size / cells + 0.5);
      }
    }
    const toPx = (x: number, z: number) => [((x / d.worldSize) + 0.5) * size, ((z / d.worldSize) + 0.5) * size];
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    for (const a of d.animals) { const [x, y] = toPx(a.x, a.z); ctx.fillStyle = a.predator ? '#ff6b6b' : '#ffe45e'; ctx.fillText(a.predator ? '▲' : '·', x, y + 4); }
    for (const l of d.landmarks) { const [x, y] = toPx(l.x, l.z); ctx.fillStyle = '#7ad3ff'; ctx.fillText('◆', x, y + 4); ctx.font = '9px sans-serif'; ctx.fillText(l.name, x, y + 14); ctx.font = '12px sans-serif'; }
    const [sx, sy] = toPx(d.settlement.x, d.settlement.z); ctx.fillStyle = '#ffcf6b'; ctx.fillText('★', sx, sy + 4);
    const [px, py] = toPx(d.player.position.x, d.player.position.z); ctx.fillStyle = '#7ad3ff'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }

  private renderEvolution(body: HTMLElement, d: PanelData) {
    const done = new Set(d.lineage.feats);
    const counts = d.lineage.actionCounts;
    const geneticNames = d.player.genetic.map((n) => NEURON_MAP[n] ? localizedName('neuron', n, NEURON_MAP[n].name) : n);
    body.innerHTML = `<h2>${t('panel.evolution.title')}</h2>
      <div class="evo-timeline"><div class="fill" style="width:${((10_000_000 - d.lineage.yearsAgo) / 8_000_000) * 100}%"></div><div class="lbl">${t('panel.evolution.timeline', { years: d.lineage.yearsAgo.toLocaleString(locale()), generation: d.lineage.generation })}</div></div>
      <div class="muted">${t('panel.evolution.desc')}</div>
      <div class="list">${FEATS.map((f) => { const c = counts[f.action] ?? 0; return `<div class="entry feat ${done.has(f.id) ? 'done' : ''}"><b>${localizedName('feat', f.id, f.name)}</b>${localizedDescription('feat', f.id, f.description)}<div class="tiny">${t('panel.evolution.progress', { done: Math.min(c, f.count), count: f.count, years: f.yearsReduced.toLocaleString(locale()) })}</div></div>`; }).join('')}</div>
      <h3>${t('panel.evolution.genetic')}</h3><div class="muted">${geneticNames.length ? geneticNames.join(', ') : t('panel.evolution.noGenetic')}</div>`;
  }
}
