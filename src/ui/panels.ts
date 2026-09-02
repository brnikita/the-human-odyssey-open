import type { ClanState, HominidData, LineageState, BiomeId } from '@/core/types';
import { ITEM_LIST } from '@/data/items';
import { PLANT_LIST } from '@/data/plants';
import { SPECIES_LIST } from '@/data/species';
import { FEATS } from '@/data/feats';
import { RECIPES, ALTERATIONS } from '@/systems/crafting';
import { NEURON_MAP } from '@/data/neurons';

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
  onSwitch: (id: string) => void;
  onClose: () => void;
}

const BIOME_RGB: Record<BiomeId, [number, number, number]> = {
  jungle: [40, 100, 40], savanna: [168, 150, 63], swamp: [70, 100, 60], lake: [40, 90, 130], cliffs: [125, 117, 104], beach: [200, 185, 140],
};

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
      b.textContent = { inventory: 'Knowledge (I)', clan: 'Clan (T)', map: 'Map (M)', evolution: 'Evolution' }[k];
      b.onclick = () => this.show(k, d);
      tabs.appendChild(b);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn small';
    closeBtn.textContent = 'Close (Esc)';
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
    const itemName = (id: string | null) => id ? ITEM_LIST.find((i) => i.id === id)?.name ?? id : 'empty';
    const recipes = RECIPES.filter((r) => !r.ability || d.abilities.has(r.ability));
    const alts = ALTERATIONS.filter((a) => d.abilities.has(a.ability));
    body.innerHTML = `
      <h2>Knowledge</h2>
      <div class="row"><div class="card"><h3>Left hand</h3>${itemName(p.held.left)}</div><div class="card"><h3>Right hand</h3>${itemName(p.held.right)}</div></div>
      <div class="muted">Known: ${known.size} discoveries · ${p.neurons.length} neurons this life (${p.reinforced.length} reinforced, ${p.genetic.length} genetic)</div>
      <h3>Recipes you can perform (press 1 with both items held)</h3>
      <div class="list">${recipes.map((r) => `<div class="entry"><b>${itemName(r.a)} + ${itemName(r.b)}</b>→ ${itemName(r.result)}<div class="tiny">${r.description}</div></div>`).join('') || '<div class="muted">Unlock Dexterity neurons to craft.</div>'}</div>
      <h3>Alterations (press 1 with a single item)</h3>
      <div class="list">${alts.map((a) => `<div class="entry"><b>${itemName(a.from)}</b>→ ${itemName(a.to)}<div class="tiny">${a.description}</div></div>`).join('') || '<div class="muted">Unlock Strip Branch / Grinder Making to alter items.</div>'}</div>
      <h3>Items</h3>
      <div class="list">${ITEM_LIST.map((i) => `<div class="entry ${known.has('item:' + i.id) ? '' : 'locked'}"><b>${known.has('item:' + i.id) ? i.name : '???'}</b><div class="tiny">${known.has('item:' + i.id) ? i.description : 'Not yet identified'}</div></div>`).join('')}</div>
      <h3>Plants</h3>
      <div class="list">${PLANT_LIST.map((i) => `<div class="entry ${known.has('plant:' + i.id) ? '' : 'locked'}"><b>${known.has('plant:' + i.id) ? i.name : '???'}</b><div class="tiny">${known.has('plant:' + i.id) ? i.description : 'Not yet identified'}</div></div>`).join('')}</div>
      <h3>Animals</h3>
      <div class="list">${SPECIES_LIST.map((i) => `<div class="entry ${known.has('animal:' + i.id) ? '' : 'locked'}"><b>${known.has('animal:' + i.id) ? i.name : '???'}</b><div class="tiny">${known.has('animal:' + i.id) ? `${i.behavior} · ${i.description}` : 'Not yet identified'}</div></div>`).join('')}</div>`;
  }

  private renderClan(body: HTMLElement, d: PanelData) {
    const members = d.clan.members.filter((m) => !m.isOutsider);
    const bar = (v: number, max: number, c: string) => `<i><b style="width:${(v / Math.max(1, max)) * 100}%;background:${c}"></b></i>`;
    body.innerHTML = `<h2>Clan</h2><div class="muted">${members.filter((m) => m.state !== 'dead').length} living members · settlement at (${Math.round(d.settlement.x)}, ${Math.round(d.settlement.z)}). Click a member to take control (adults and children only).</div>
      <div class="list">${members.map((m) => `<div class="card ${m.isPlayer ? 'player' : ''} ${m.state === 'dead' ? 'dead' : ''}" data-id="${m.id}" style="cursor:${m.stage === 'baby' || m.state === 'dead' ? 'default' : 'pointer'}"><h3>${m.name}${m.isPlayer ? ' ★' : ''}</h3><div class="tiny">${m.sex} · ${m.stage} · ${m.ageYears}y · ${m.state}${m.carriedBaby ? ' · carrying baby' : ''}</div><div class="mini">${bar(m.stats.health, m.maxStats.health, '#ff7b6b')}${bar(m.stats.energy, m.maxStats.energy, '#7ad3ff')}${bar(m.stats.hunger, m.maxStats.hunger, '#ffd06b')}${bar(m.stats.thirst, m.maxStats.thirst, '#8bfff0')}</div><div class="tiny">${m.neurons.length} neurons · ${m.genetic.length} genetic${m.conditions.length ? ' · ' + m.conditions.map((c) => c.id).join(', ') : ''}</div></div>`).join('')}</div>`;
    body.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => {
      const id = (c as HTMLElement).dataset.id!;
      const m = members.find((x) => x.id === id);
      if (m && m.stage !== 'baby' && m.state !== 'dead' && !m.isPlayer) d.onSwitch(id);
    }));
  }

  private renderMap(body: HTMLElement, d: PanelData) {
    const size = 256;
    body.innerHTML = `<h2>Map</h2><div class="muted">Explored areas are bright; the unknown is dim. ★ settlement · ● you · ▲ predators (only when known nearby).</div>`;
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
    const [sx, sy] = toPx(d.settlement.x, d.settlement.z); ctx.fillStyle = '#ffcf6b'; ctx.fillText('★', sx, sy + 4);
    const [px, py] = toPx(d.player.position.x, d.player.position.z); ctx.fillStyle = '#7ad3ff'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }

  private renderEvolution(body: HTMLElement, d: PanelData) {
    const done = new Set(d.lineage.feats);
    const counts = d.lineage.actionCounts;
    body.innerHTML = `<h2>Evolution</h2>
      <div class="evo-timeline"><div class="fill" style="width:${((10_000_000 - d.lineage.yearsAgo) / 8_000_000) * 100}%"></div><div class="lbl">${d.lineage.yearsAgo.toLocaleString('en-US')} years ago · generation ${d.lineage.generation}</div></div>
      <div class="muted">Feats reduce the time of the next evolution leap. Press <kbd>G</kbd> at the settlement with offspring to change generation or leap.</div>
      <div class="list">${FEATS.map((f) => { const c = counts[f.action] ?? 0; return `<div class="entry feat ${done.has(f.id) ? 'done' : ''}"><b>${f.name}</b>${f.description}<div class="tiny">${Math.min(c, f.count)}/${f.count} · −${f.yearsReduced.toLocaleString('en-US')} years</div></div>`; }).join('')}</div>
      <h3>Genetic neurons</h3><div class="muted">${d.player.genetic.length ? d.player.genetic.map((n) => NEURON_MAP[n]?.name ?? n).join(', ') : 'None yet. Reinforce neurons and change generation.'}</div>`;
  }
}
