import type { HominidData, LineageState } from '@/core/types';
import type { Settings } from '@/core/settings';

export interface ScreenCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onResume: () => void;
  onSave: () => void;
  onQuitToMenu: () => void;
  onSwitchMember: (id: string) => void;
  onHelpClose: () => void;
  onToggleMute: () => boolean;
  getSettings: () => Settings;
  onSettingsChange: (s: Settings) => void;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'], ['Shift', 'Run'], ['Space', 'Jump / climb tree'], ['Ctrl / X', 'Climb down / drop'],
  ['Mouse', 'Look'], ['Wheel', 'Camera distance'], ['Left click', 'Interact / attack'], ['Right click', 'Dodge (timed)'],
  ['Q (hold)', 'Intelligence mode'], ['E', 'Smell'], ['R', 'Listen'], ['Left click (in Q)', 'Identify target'],
  ['F', 'Use / eat held item'], ['1', 'Combine or alter held items'], ['Z / V', 'Drop left / right item'], ['Tab', 'Neuronal network'],
  ['I', 'Inventory & knowledge'], ['T', 'Clan'], ['M', 'Map'], ['C', 'Call clan'],
  ['G', 'Generation / evolution (at settlement)'], ['N', 'Sleep (at settlement, tired)'], ['H', 'Help'], ['Esc', 'Pause'],
];

export class Screens {
  readonly root: HTMLElement;
  private current: HTMLElement | null = null;

  constructor(parent: HTMLElement, private cb: ScreenCallbacks) {
    this.root = document.createElement('div');
    parent.appendChild(this.root);
  }

  get visible() { return this.current !== null; }

  hideAll() {
    if (this.current) this.current.remove();
    this.current = null;
  }

  private show(html: string, cls = 'screen'): HTMLElement {
    this.hideAll();
    const s = document.createElement('div');
    s.className = cls;
    s.innerHTML = html;
    this.root.appendChild(s);
    this.current = s;
    return s;
  }

  showLoading(text = 'Shaping the world'): (p: number) => void {
    const s = this.show(`<div class="loading"><h1 style="font-family:var(--display);color:var(--accent);font-weight:400;letter-spacing:.1em">The Human Odyssey</h1><div class="bar"><div class="fill"></div></div><div class="txt">${text}</div></div>`, 'screen');
    const fill = s.querySelector('.fill') as HTMLElement;
    return (p: number) => { fill.style.width = `${Math.round(p * 100)}%`; };
  }

  showMenu(hasSave: boolean) {
    const s = this.show(`
      <h1>The Human Odyssey</h1>
      <div class="subtitle">10,000,000 years ago · Africa</div>
      <div class="col">
        <button class="btn primary" data-a="new">New Lineage</button>
        <button class="btn" data-a="continue" ${hasSave ? '' : 'disabled'}>Continue</button>
        <button class="btn" data-a="help">How to play</button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <div class="hint">Explore, sense, learn and survive. Identify the unknown to calm your fear, unlock neurons, raise babies and pass your knowledge to the next generation. Reach 2 million years ago to win.</div>`);
    s.querySelector('[data-a=new]')!.addEventListener('click', () => this.cb.onNewGame());
    s.querySelector('[data-a=continue]')!.addEventListener('click', () => this.cb.onContinue());
    s.querySelector('[data-a=help]')!.addEventListener('click', () => this.showHelp(() => this.showMenu(hasSave)));
    s.querySelector('[data-a=settings]')!.addEventListener('click', () => this.showSettings(() => this.showMenu(hasSave)));
  }

  showPause() {
    const s = this.show(`
      <h2>Paused</h2>
      <div class="col">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="save">Save game</button>
        <button class="btn" data-a="help">Controls</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="quit">Quit to menu</button>
      </div>
      <div class="hint">Progress is saved automatically when you sleep at the settlement and on generation change.</div>`);
    s.querySelector('[data-a=resume]')!.addEventListener('click', () => this.cb.onResume());
    s.querySelector('[data-a=save]')!.addEventListener('click', () => this.cb.onSave());
    s.querySelector('[data-a=help]')!.addEventListener('click', () => this.showHelp(() => this.showPause()));
    s.querySelector('[data-a=settings]')!.addEventListener('click', () => this.showSettings(() => this.showPause()));
    s.querySelector('[data-a=quit]')!.addEventListener('click', () => this.cb.onQuitToMenu());
  }

  showSettings(onClose: () => void) {
    const st = this.cb.getSettings();
    const s = this.show(`
      <div class="panel modal settings">
        <h2>Settings</h2>
        <label><span>Graphics quality</span><select data-k="quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
        <label><span>Volume <em data-v="volume">${Math.round(st.volume * 100)}%</em></span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-k="volume"></label>
        <label><span>Mouse sensitivity <em data-v="sensitivity">${st.sensitivity.toFixed(2)}</em></span><input type="range" min="0.3" max="2.5" step="0.05" value="${st.sensitivity}" data-k="sensitivity"></label>
        <label><span>Invert vertical look</span><input type="checkbox" data-k="invertY" ${st.invertY ? 'checked' : ''}></label>
        <label><span>Show frame rate</span><input type="checkbox" data-k="showFps" ${st.showFps ? 'checked' : ''}></label>
        <div class="muted">Auto quality lowers resolution and view distance when the frame rate drops, and raises them again when it is stable.</div>
        <div class="row"><button class="btn primary" data-a="close">Done</button></div>
      </div>`, 'screen');
    const apply = () => {
      const next: Settings = {
        quality: (s.querySelector('[data-k=quality]') as HTMLSelectElement).value as Settings['quality'],
        volume: parseFloat((s.querySelector('[data-k=volume]') as HTMLInputElement).value),
        sensitivity: parseFloat((s.querySelector('[data-k=sensitivity]') as HTMLInputElement).value),
        invertY: (s.querySelector('[data-k=invertY]') as HTMLInputElement).checked,
        showFps: (s.querySelector('[data-k=showFps]') as HTMLInputElement).checked,
      };
      (s.querySelector('[data-v=volume]') as HTMLElement).textContent = `${Math.round(next.volume * 100)}%`;
      (s.querySelector('[data-v=sensitivity]') as HTMLElement).textContent = next.sensitivity.toFixed(2);
      this.cb.onSettingsChange(next);
    };
    s.querySelectorAll('[data-k]').forEach((el) => { el.addEventListener('input', apply); el.addEventListener('change', apply); });
    s.querySelector('[data-a=close]')!.addEventListener('click', onClose);
  }

  showHelp(onClose?: () => void) {
    const s = this.show(`
      <div class="panel modal">
        <h2>How to play</h2>
        <div class="muted">You control one member of a hominid clan. The world is unknown and frightening: venture into new places, use your senses to identify everything, and your fear turns into dopamine and neuronal energy. Spend energy in the <b>neuronal network</b> (Tab) to unlock skills. Eat, drink and sleep at the settlement to survive. Carry babies to learn faster, mate to grow the clan, and trigger a <b>generation change</b> (G at settlement) to pass reinforced neurons to your descendants. Every evolution leap moves your lineage forward in time.</div>
        <div class="help-grid">${CONTROLS.map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join('')}</div>
        <div class="muted"><b>Tips:</b> Panic makes you weak; find the glowing lights when fear peaks. Horsetail cures bleeding, natal grass cures poison, kapok fiber cures cold, khat restores energy. Sharpen a stick with a grinder (granite stone altered with <kbd>1</kbd>) to hunt. Predators telegraph attacks: dodge with right click when the prompt appears, then counter-attack.</div>
        <div class="row"><button class="btn primary" data-a="close">Close</button></div>
      </div>`, 'screen');
    s.querySelector('[data-a=close]')!.addEventListener('click', () => { if (onClose) onClose(); else this.cb.onHelpClose(); });
  }

  showDeath(dead: HominidData, members: HominidData[], lineageLost: boolean, cause: string) {
    const alive = members.filter((m) => m.state !== 'dead' && !m.isOutsider && m.stage !== 'baby');
    const s = this.show(`
      <h2>${dead.name} has died</h2>
      <div class="subtitle">${cause}</div>
      ${lineageLost ? `<div class="hint">The lineage is lost. No clan member survives to carry your knowledge forward.</div><div class="col"><button class="btn primary" data-a="quit">Return to menu</button></div>`
        : `<div class="hint">Choose a clan member to continue the lineage.</div><div class="row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:700px">${alive.map((m) => `<div class="card panel" style="cursor:pointer" data-id="${m.id}"><h3>${m.name}</h3><div class="tiny">${m.sex} · ${m.stage} · ${Math.round(m.stats.health)}/${Math.round(m.maxStats.health)} hp</div><div class="tiny">${m.neurons.length} neurons</div></div>`).join('')}</div>`}`);
    s.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => this.cb.onSwitchMember((c as HTMLElement).dataset.id!)));
    s.querySelector('[data-a=quit]')?.addEventListener('click', () => this.cb.onQuitToMenu());
  }

  showWin(lineage: LineageState) {
    const s = this.show(`
      <h1>Lineage Complete</h1>
      <div class="subtitle">Your descendants reached ${lineage.yearsAgo.toLocaleString('en-US')} years ago</div>
      <div class="hint">${lineage.generation} generations · ${lineage.discoveries.length} discoveries · ${lineage.feats.length} evolutionary feats. From the trees to the savanna, from fear to knowledge: the human odyssey began with you.</div>
      <div class="col"><button class="btn primary" data-a="quit">Return to menu</button></div>`);
    s.querySelector('[data-a=quit]')!.addEventListener('click', () => this.cb.onQuitToMenu());
  }

  /** Generation / evolution dialog. */
  showGeneration(opts: {
    lineage: LineageState; offspring: number; adults: number; unreinforced: number; feats: number; yearsLeap: number;
    onGeneration: () => void; onLeap: () => void; onClose: () => void;
  }) {
    const canGen = opts.offspring > 0;
    const s = this.show(`
      <div class="panel modal">
        <h2>The next generation</h2>
        <div class="muted">Generation ${opts.lineage.generation} · ${opts.lineage.yearsAgo.toLocaleString('en-US')} years ago · ${opts.offspring} offspring · ${opts.adults} adults</div>
        <div class="evo-timeline"><div class="fill" style="width:${((10_000_000 - opts.lineage.yearsAgo) / 8_000_000) * 100}%"></div><div class="lbl">10M years ago → 2M years ago</div></div>
        <div class="row">
          <div class="card"><h3>Generation change</h3><div class="tiny">Babies grow, adults age, elders pass. Un-reinforced neurons (${opts.unreinforced}) are lost. Newborns may carry mutations. Advances 15 years.</div><br><button class="btn primary" data-a="gen" ${canGen ? '' : 'disabled'}>Change generation</button>${canGen ? '' : '<div class="tiny">Requires at least one baby or child.</div>'}</div>
          <div class="card"><h3>Evolution leap</h3><div class="tiny">A generation change plus a leap through time. ${opts.feats} feats achieved since last leap: advance <b>${opts.yearsLeap.toLocaleString('en-US')} years</b>. Reinforced neurons become genetic.</div><br><button class="btn" data-a="leap" ${canGen ? '' : 'disabled'}>Evolution leap</button></div>
        </div>
        <div class="row"><button class="btn small" data-a="close">Not yet</button></div>
      </div>`, 'screen');
    s.querySelector('[data-a=gen]')!.addEventListener('click', () => opts.onGeneration());
    s.querySelector('[data-a=leap]')!.addEventListener('click', () => opts.onLeap());
    s.querySelector('[data-a=close]')!.addEventListener('click', () => opts.onClose());
  }

  /** Summary after a generation change. */
  showGenerationResult(opts: { title: string; lines: string[]; onClose: () => void }) {
    const s = this.show(`<div class="panel modal"><h2>${opts.title}</h2><div class="muted">${opts.lines.map((l) => `<div>${l}</div>`).join('')}</div><div class="row"><button class="btn primary" data-a="close">Continue</button></div></div>`, 'screen');
    s.querySelector('[data-a=close]')!.addEventListener('click', () => opts.onClose());
  }
}
