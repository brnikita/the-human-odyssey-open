import type { HominidData, ItemId, SenseKind } from '@/core/types';
import { ITEMS } from '@/data/items';

export interface HudMarker {
  x: number; // screen px
  y: number;
  sense: SenseKind;
  known: boolean;
  label: string;
  focus: boolean;
  visible: boolean;
}

export interface HudPrompt {
  target: string;
  unknown: boolean;
  actions: { key: string; label: string }[];
}

export interface HudData {
  player: HominidData;
  time: string;
  day: number;
  energy: number;
  yearsAgo: number;
  generation: number;
  progress: number; // 0..1 lineage
  clanAlive: number;
  prompt: HudPrompt | null;
  markers: HudMarker[];
  overlays: { fear: number; damage: number; intel: number; night: number; underwater: number };
  identifyProgress: number | null;
  combatPrompt: 'DODGE!' | 'STRIKE!' | 'COUNTER!' | null;
  intelMode: boolean;
  activeSense: SenseKind;
  carriedBabies: number;
  fps: number;
  overcome: { found: number; needed: number; timeLeft: number } | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class Hud {
  readonly root: HTMLElement;
  private stats: Record<string, HTMLElement> = {};
  private statRows: Record<string, HTMLElement> = {};
  private conds: HTMLElement;
  private fearFill: HTMLElement;
  private dopFill: HTMLElement;
  private name: HTMLElement;
  private time: HTMLElement;
  private energy: HTMLElement;
  private lineage: HTMLElement;
  private lineageFill: HTMLElement;
  private clanInfo: HTMLElement;
  private handL: HTMLElement;
  private handR: HTMLElement;
  private prompt: HTMLElement;
  private markersRoot: HTMLElement;
  private markerPool: HTMLElement[] = [];
  private overlays: Record<string, HTMLElement> = {};
  private identify: HTMLElement;
  private identifyFill: HTMLElement;
  private combat: HTMLElement;
  private notify: HTMLElement;
  private senseLabel: HTMLElement;
  private overcome: HTMLElement;
  private fpsEl: HTMLElement;
  private lastPrompt = '';

  constructor(parent: HTMLElement) {
    this.root = el('div');
    this.root.id = 'hud';
    parent.appendChild(this.root);

    for (const k of ['fear', 'damage', 'intel', 'night', 'underwater']) {
      const o = el('div', `overlay ${k}`);
      this.overlays[k] = o;
      this.root.appendChild(o);
    }

    const top = el('div', 'hud-top');
    this.name = el('div', 'name', 'Ako');
    this.time = el('div', 'time', 'Day 1 · 06:00');
    this.energy = el('div', 'energy-n', '◈ 0 neuronal energy');
    this.senseLabel = el('div', 'time', '');
    top.append(this.name, this.time, this.energy, this.senseLabel);
    this.root.appendChild(top);

    const clan = el('div', 'hud-clan');
    this.lineage = el('div', 'lineage', '10,000,000 years ago');
    const bar = el('div', 'bar');
    this.lineageFill = el('div', 'fill');
    bar.appendChild(this.lineageFill);
    this.clanInfo = el('div', '', 'Generation 1 · 6 clan members');
    clan.append(this.lineage, bar, this.clanInfo);
    this.root.appendChild(clan);

    const stats = el('div', 'hud-stats');
    for (const [k, label] of [['health', 'Health'], ['energy', 'Energy'], ['hunger', 'Hunger'], ['thirst', 'Thirst']]) {
      const row = el('div', `stat ${k}`);
      row.innerHTML = `<span class="label">${label}</span><div class="bar"><div class="fill"></div></div>`;
      stats.appendChild(row);
      this.stats[k] = row.querySelector('.fill')!;
      this.statRows[k] = row;
    }
    this.root.appendChild(stats);
    this.conds = el('div', 'hud-conditions');
    this.root.appendChild(this.conds);

    const fear = el('div', 'hud-fear');
    fear.innerHTML = `<div class="stat fear"><span class="label">Fear</span><div class="bar"><div class="fill"></div></div></div><div class="stat dopamine"><span class="label">Dopamine</span><div class="bar"><div class="fill"></div></div></div>`;
    this.fearFill = fear.querySelector('.fear .fill')!;
    this.dopFill = fear.querySelector('.dopamine .fill')!;
    this.root.appendChild(fear);

    const hands = el('div', 'hud-hands');
    this.handL = el('div', 'hand', '<span class="key">LEFT · Z</span><span class="item">empty</span>');
    this.handR = el('div', 'hand', '<span class="key">RIGHT · V</span><span class="item">empty</span>');
    hands.append(this.handL, this.handR);
    this.root.appendChild(hands);

    this.prompt = el('div', 'hud-prompt');
    this.root.appendChild(this.prompt);
    this.markersRoot = el('div');
    this.root.appendChild(this.markersRoot);
    this.root.appendChild(el('div', 'crosshair'));

    this.identify = el('div', 'identify');
    this.identifyFill = el('div', 'fill');
    this.identify.appendChild(this.identifyFill);
    this.identify.hidden = true;
    this.root.appendChild(this.identify);

    this.combat = el('div', 'combat-prompt');
    this.combat.hidden = true;
    this.root.appendChild(this.combat);

    this.overcome = el('div', 'combat-prompt counter');
    this.overcome.hidden = true;
    this.root.appendChild(this.overcome);

    this.notify = el('div', 'hud-notify');
    this.root.appendChild(this.notify);

    this.fpsEl = el('div', 'hud-controls', 'H help · Tab neurons · Q senses · Esc pause');
    this.root.appendChild(this.fpsEl);
  }

  set visible(v: boolean) { this.root.hidden = !v; }

  toast(text: string, kind: 'info' | 'warn' | 'good' | 'discovery' | 'neuron' = 'info') {
    const t = el('div', `toast ${kind}`, text);
    this.notify.appendChild(t);
    while (this.notify.children.length > 5) this.notify.removeChild(this.notify.firstChild!);
    setTimeout(() => t.remove(), 4200);
  }

  private itemName(id: ItemId | null): string {
    return id ? ITEMS[id].name : 'empty';
  }

  update(d: HudData) {
    const p = d.player;
    for (const k of ['health', 'energy', 'hunger', 'thirst'] as const) {
      const pct = Math.max(0, Math.min(1, p.stats[k] / Math.max(1, p.maxStats[k])));
      this.stats[k].style.width = `${pct * 100}%`;
      this.statRows[k].classList.toggle('low', pct < 0.2);
    }
    this.conds.innerHTML = p.conditions.map((c) => `<span class="cond ${c.id}">${c.id}</span>`).join('');
    this.fearFill.style.width = `${p.fear}%`;
    this.dopFill.style.width = `${p.dopamine}%`;
    this.name.textContent = `${p.name} · ${p.stage}${d.carriedBabies ? ` · carrying ${d.carriedBabies} baby` : ''}`;
    this.time.textContent = `Day ${d.day} · ${d.time}`;
    this.energy.textContent = `◈ ${Math.floor(d.energy)} neuronal energy`;
    this.senseLabel.textContent = d.intelMode ? `Intelligence · ${d.activeSense.toUpperCase()}` : '';
    this.lineage.textContent = `${d.yearsAgo.toLocaleString('en-US')} years ago`;
    this.lineageFill.style.width = `${d.progress * 100}%`;
    this.clanInfo.textContent = `Generation ${d.generation} · ${d.clanAlive} clan members`;
    this.handL.querySelector('.item')!.textContent = this.itemName(p.held.left);
    this.handR.querySelector('.item')!.textContent = this.itemName(p.held.right);
    this.handL.classList.toggle('has', !!p.held.left);
    this.handR.classList.toggle('has', !!p.held.right);

    // prompt
    const key = d.prompt ? `${d.prompt.target}|${d.prompt.unknown}|${d.prompt.actions.map((a) => a.key + a.label).join(',')}` : '';
    if (key !== this.lastPrompt) {
      this.lastPrompt = key;
      if (!d.prompt) this.prompt.innerHTML = '';
      else {
        this.prompt.innerHTML = `<div class="target ${d.prompt.unknown ? 'unknown' : ''}">${d.prompt.target}</div><div class="actions">${d.prompt.actions.map((a) => `<span><b>${a.key}</b>${a.label}</span>`).join('')}</div>`;
      }
    }

    // markers
    for (let i = 0; i < d.markers.length; i++) {
      let m = this.markerPool[i];
      if (!m) {
        m = el('div', 'marker');
        m.innerHTML = '<div class="dot"></div><div class="lbl"></div>';
        this.markersRoot.appendChild(m);
        this.markerPool.push(m);
      }
      const mk = d.markers[i];
      m.hidden = !mk.visible;
      if (!mk.visible) continue;
      m.style.left = `${mk.x}px`;
      m.style.top = `${mk.y}px`;
      m.className = `marker ${mk.focus ? 'focus' : ''}`;
      const dot = m.firstElementChild as HTMLElement;
      dot.className = `dot ${mk.sense} ${mk.known ? '' : 'unknown'}`;
      const lbl = m.lastElementChild as HTMLElement;
      lbl.className = `lbl ${mk.known ? '' : 'unknown'}`;
      lbl.textContent = mk.label;
    }
    for (let i = d.markers.length; i < this.markerPool.length; i++) this.markerPool[i].hidden = true;

    for (const k of Object.keys(d.overlays) as (keyof HudData['overlays'])[]) {
      this.overlays[k].style.opacity = String(Math.max(0, Math.min(1, d.overlays[k])));
    }
    this.identify.hidden = d.identifyProgress === null;
    if (d.identifyProgress !== null) this.identifyFill.style.width = `${d.identifyProgress * 100}%`;
    this.combat.hidden = !d.combatPrompt;
    if (d.combatPrompt) {
      this.combat.textContent = d.combatPrompt;
      this.combat.className = `combat-prompt ${d.combatPrompt === 'DODGE!' ? '' : 'counter'}`;
    }
    this.overcome.hidden = !d.overcome;
    if (d.overcome) this.overcome.textContent = `FIND THE LIGHTS ${d.overcome.found}/${d.overcome.needed} · ${Math.ceil(d.overcome.timeLeft)}s`;
    this.fpsEl.textContent = `${Math.round(d.fps)} fps · H help · Tab neurons · Q senses · Esc pause`;
  }
}
