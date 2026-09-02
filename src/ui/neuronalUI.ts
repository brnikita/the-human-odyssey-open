import type { ActionId, NeuronId } from '@/core/types';
import { NEURONS, NEURON_MAP, BRANCHES, BRANCH_COLORS } from '@/data/neurons';
import { canUnlock, neuronProgress, reinforceCost, type UnlockContext } from '@/systems/neuronal';

export interface NeuronalViewData {
  unlocked: Set<NeuronId>;
  reinforced: Set<NeuronId>;
  genetic: Set<NeuronId>;
  energy: number;
  actionCounts: Partial<Record<ActionId, number>>;
  babiesCarried: number;
}

export interface NeuronalCallbacks {
  onUnlock: (id: NeuronId) => boolean;
  onReinforce: (id: NeuronId) => boolean;
  onClose: () => void;
}

export class NeuronalUI {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: NeuronalViewData | null = null;
  private hover: NeuronId | null = null;
  private selected: NeuronId | null = null;
  private t = 0;
  private raf = 0;
  private side: HTMLElement;
  private energyEl: HTMLElement;
  private infoEl: HTMLElement;
  private unlockBtn: HTMLButtonElement;
  private reinforceBtn: HTMLButtonElement;
  private pulse: { id: NeuronId; t: number }[] = [];

  constructor(parent: HTMLElement, private cb: NeuronalCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'neuronal';
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    wrap.appendChild(this.canvas);
    this.root.appendChild(wrap);
    window.addEventListener('resize', () => { if (this.visible) this.resize(); });
    this.side = document.createElement('div');
    this.side.className = 'side';
    this.side.innerHTML = `<h2>Neuronal Network</h2><div class="energy"></div><div class="legend">${BRANCHES.map((b) => `<span style="color:${BRANCH_COLORS[b]}">${b}</span>`).join('')}</div><div class="info"></div><div class="foot">Click a neuron to select. <b>Unlock</b> spends neuronal energy. <b>Reinforce</b> makes it permanent through generations. Neurons with a requirement are unlocked by practising the matching action. Carrying babies increases energy gain.<br><br><kbd>Tab</kbd> / <kbd>Esc</kbd> close</div>`;
    this.energyEl = this.side.querySelector('.energy')!;
    this.infoEl = this.side.querySelector('.info')!;
    this.unlockBtn = document.createElement('button');
    this.unlockBtn.className = 'btn primary';
    this.unlockBtn.textContent = 'Unlock';
    this.reinforceBtn = document.createElement('button');
    this.reinforceBtn.className = 'btn';
    this.reinforceBtn.textContent = 'Reinforce';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn small';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => this.cb.onClose();
    this.side.insertBefore(this.reinforceBtn, this.side.querySelector('.foot'));
    this.side.insertBefore(this.unlockBtn, this.reinforceBtn);
    this.side.appendChild(closeBtn);
    this.root.appendChild(this.side);
    parent.appendChild(this.root);

    this.unlockBtn.onclick = () => { if (this.selected && this.cb.onUnlock(this.selected)) this.pulse.push({ id: this.selected, t: 0 }); this.refreshInfo(); };
    this.reinforceBtn.onclick = () => { if (this.selected && this.cb.onReinforce(this.selected)) this.pulse.push({ id: this.selected, t: 0 }); this.refreshInfo(); };
    this.canvas.addEventListener('mousemove', (e) => { this.hover = this.pick(e.offsetX, e.offsetY); });
    this.canvas.addEventListener('click', (e) => {
      const id = this.pick(e.offsetX, e.offsetY);
      if (id) { this.selected = id; this.refreshInfo(); }
    });
    this.canvas.addEventListener('dblclick', (e) => {
      const id = this.pick(e.offsetX, e.offsetY);
      if (id) { this.selected = id; if (this.cb.onUnlock(id)) this.pulse.push({ id, t: 0 }); this.refreshInfo(); }
    });
  }

  get visible() { return !this.root.hidden; }

  open(data: NeuronalViewData) {
    this.data = data;
    this.root.hidden = false;
    this.resize();
    this.refreshInfo();
    cancelAnimationFrame(this.raf);
    const loop = (ts: number) => { this.t = ts / 1000; this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  refresh(data: NeuronalViewData) {
    this.data = data;
    this.refreshInfo();
  }

  close() {
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(300, r.width * devicePixelRatio);
    this.canvas.height = Math.max(300, r.height * devicePixelRatio);
  }

  private nodePos(id: NeuronId): { x: number; y: number } {
    const n = NEURON_MAP[id];
    const w = this.canvas.width / devicePixelRatio, h = this.canvas.height / devicePixelRatio;
    const Rx = Math.min(w * 0.46, h * 0.62), Ry = h * 0.44;
    return { x: w / 2 + n.pos.x * Rx, y: h / 2 + n.pos.y * Ry };
  }

  private pick(x: number, y: number): NeuronId | null {
    let best: NeuronId | null = null, bd = 22;
    for (const n of NEURONS) {
      const p = this.nodePos(n.id);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  private ctxFor(): UnlockContext | null {
    if (!this.data) return null;
    return { unlocked: this.data.unlocked, energy: this.data.energy, actionCounts: this.data.actionCounts };
  }

  private refreshInfo() {
    if (!this.data) return;
    this.energyEl.textContent = `◈ ${Math.floor(this.data.energy)} energy${this.data.babiesCarried ? ` · ×${(1 + 0.5 * this.data.babiesCarried).toFixed(1)} (babies)` : ''}`;
    if (!this.selected) {
      this.infoEl.innerHTML = `<div class="desc">Select a neuron to see its details. Unlocked: ${this.data.unlocked.size} / ${NEURONS.length}. Reinforced: ${this.data.reinforced.size}.</div>`;
      this.unlockBtn.disabled = true; this.reinforceBtn.disabled = true;
      return;
    }
    const n = NEURON_MAP[this.selected];
    const ctx = this.ctxFor()!;
    const un = canUnlock(n.id, ctx);
    const isUnlocked = this.data.unlocked.has(n.id);
    const isRe = this.data.reinforced.has(n.id);
    const isGen = this.data.genetic.has(n.id);
    const prog = neuronProgress(n.id, this.data.actionCounts);
    const reqNames = n.requires.map((r) => NEURON_MAP[r].name).join(', ');
    let status = '';
    if (isGen) status = 'Genetic — inherited, permanent.';
    else if (isRe) status = 'Reinforced — will carry to the next generation.';
    else if (isUnlocked) status = `Unlocked. Reinforce for ${reinforceCost(n.id)} energy to keep it across generations.`;
    else if (un.ok) status = `Available. Cost ${n.cost} energy.`;
    else if (un.reason === 'energy') status = `Need ${n.cost} energy (have ${Math.floor(this.data.energy)}).`;
    else if (un.reason === 'requires') status = `Requires: ${reqNames}.`;
    else if (un.reason === 'locked') status = `Practise <b>${n.unlockCondition?.action}</b>: ${Math.floor(prog * 100)}% (${this.data.actionCounts[n.unlockCondition!.action] ?? 0}/${n.unlockCondition!.count}).`;
    this.infoEl.innerHTML = `<div class="nname" style="color:${BRANCH_COLORS[n.branch]}">${n.name}</div><div class="req">${n.branch} · ${n.cost} energy${n.requires.length ? ` · requires ${reqNames}` : ''}</div><div class="desc">${n.description}<br><br>${status}</div>`;
    this.unlockBtn.disabled = !un.ok || isUnlocked;
    this.reinforceBtn.disabled = !isUnlocked || isRe || isGen || this.data.energy < reinforceCost(n.id);
    this.reinforceBtn.textContent = `Reinforce (${reinforceCost(n.id)})`;
  }

  private draw() {
    if (!this.data) return;
    const { ctx } = this;
    const dpr = devicePixelRatio;
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // background synapse field
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + this.t * 0.05;
      const r = (Math.sin(this.t * 0.4 + i) * 0.5 + 0.5) * Math.min(w, h) * 0.5;
      ctx.fillStyle = '#5a6fff';
      ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const uctx = this.ctxFor()!;
    // edges
    for (const n of NEURONS) {
      const p = this.nodePos(n.id);
      for (const r of n.requires) {
        const q = this.nodePos(r);
        const lit = this.data.unlocked.has(n.id);
        ctx.strokeStyle = lit ? BRANCH_COLORS[n.branch] : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = lit ? 2.2 : 1;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (lit) {
          const k = (this.t * 0.5 + n.pos.x) % 1;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(q.x + (p.x - q.x) * k, q.y + (p.y - q.y) * k, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (n.requires.length === 0) {
        ctx.strokeStyle = this.data.unlocked.has(n.id) ? BRANCH_COLORS[n.branch] : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    }
    // core
    const glow = 0.6 + Math.sin(this.t * 2) * 0.2;
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 40);
    g.addColorStop(0, `rgba(255,230,160,${glow})`); g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe8b0'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2); ctx.fill();
    // nodes
    for (const n of NEURONS) {
      const p = this.nodePos(n.id);
      const color = BRANCH_COLORS[n.branch];
      const unlocked = this.data.unlocked.has(n.id);
      const re = this.data.reinforced.has(n.id) || this.data.genetic.has(n.id);
      const avail = canUnlock(n.id, uctx);
      const canBuy = avail.ok;
      const partially = avail.reason === 'energy' || avail.reason === 'locked';
      const r = 11 + (unlocked ? 3 : 0) + (this.hover === n.id || this.selected === n.id ? 3 : 0);
      if (unlocked) {
        const gg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.5);
        gg.addColorStop(0, color + 'aa'); gg.addColorStop(1, color + '00');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2); ctx.fill();
      }
      if (partially && !unlocked) {
        const prog = avail.reason === 'locked' ? neuronProgress(n.id, this.data.actionCounts) : Math.min(1, this.data.energy / n.cost);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = unlocked ? color : canBuy ? color + '66' : 'rgba(30,36,50,0.9)';
      ctx.fill();
      ctx.strokeStyle = unlocked || canBuy ? color : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = this.selected === n.id ? 3 : 1.5;
      ctx.stroke();
      if (re) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r - 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = unlocked || canBuy ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.name, p.x, p.y + r + 14);
    }
    // pulses
    this.pulse = this.pulse.filter((pl) => pl.t < 1);
    for (const pl of this.pulse) {
      pl.t += 0.02;
      const p = this.nodePos(pl.id);
      ctx.strokeStyle = `rgba(255,255,255,${1 - pl.t})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 14 + pl.t * 60, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.hover) {
      const n = NEURON_MAP[this.hover];
      const p = this.nodePos(n.id);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeStyle = BRANCH_COLORS[n.branch];
      const text = `${n.name} · ${n.cost}`;
      ctx.font = '13px Segoe UI, sans-serif';
      const tw = ctx.measureText(text).width + 16;
      ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y - 44, tw, 24, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(text, p.x, p.y - 27);
    }
  }
}
