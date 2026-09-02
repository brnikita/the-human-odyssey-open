import type { HominidData, LineageState } from '@/core/types';
import type { Settings } from '@/core/settings';
import { t, getLang, setLang, locale, LANGS, type Lang } from '@/i18n';

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

const CONTROL_IDS = [
  'move', 'run', 'jump', 'down', 'look', 'camera', 'interact', 'dodge',
  'intel', 'smell', 'listen', 'identify', 'use', 'combine', 'drop', 'neurons',
  'inventory', 'clan', 'map', 'call', 'generation', 'sleep', 'help', 'pause',
];

/** [key label, action] rows for the help screen, in the current language. */
const controls = (): [string, string][] => CONTROL_IDS.map((id) => [t(`controls.${id}.key`), t(`controls.${id}`)]);

const fmt = (n: number) => n.toLocaleString(locale());

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

  showLoading(text = t('app.loading')): (p: number) => void {
    const s = this.show(`<div class="loading"><h1 style="font-family:var(--display);color:var(--accent);font-weight:400;letter-spacing:.1em">${t('app.title')}</h1><div class="bar"><div class="fill"></div></div><div class="txt">${text}</div></div>`, 'screen');
    const fill = s.querySelector('.fill') as HTMLElement;
    return (p: number) => { fill.style.width = `${Math.round(p * 100)}%`; };
  }

  showMenu(hasSave: boolean) {
    const s = this.show(`
      <h1>${t('app.title')}</h1>
      <div class="subtitle">${t('menu.subtitle')}</div>
      <div class="col">
        <button class="btn primary" data-a="new">${t('menu.new')}</button>
        <button class="btn" data-a="continue" ${hasSave ? '' : 'disabled'}>${t('menu.continue')}</button>
        <button class="btn" data-a="help">${t('menu.help')}</button>
        <button class="btn" data-a="settings">${t('menu.settings')}</button>
      </div>
      <div class="hint">${t('menu.hint')}</div>`);
    s.querySelector('[data-a=new]')!.addEventListener('click', () => this.cb.onNewGame());
    s.querySelector('[data-a=continue]')!.addEventListener('click', () => this.cb.onContinue());
    s.querySelector('[data-a=help]')!.addEventListener('click', () => this.showHelp(() => this.showMenu(hasSave)));
    s.querySelector('[data-a=settings]')!.addEventListener('click', () => this.showSettings(() => this.showMenu(hasSave)));
  }

  showPause() {
    const s = this.show(`
      <h2>${t('pause.title')}</h2>
      <div class="col">
        <button class="btn primary" data-a="resume">${t('pause.resume')}</button>
        <button class="btn" data-a="save">${t('pause.save')}</button>
        <button class="btn" data-a="help">${t('pause.controls')}</button>
        <button class="btn" data-a="settings">${t('pause.settings')}</button>
        <button class="btn" data-a="quit">${t('pause.quit')}</button>
      </div>
      <div class="hint">${t('pause.hint')}</div>`);
    s.querySelector('[data-a=resume]')!.addEventListener('click', () => this.cb.onResume());
    s.querySelector('[data-a=save]')!.addEventListener('click', () => this.cb.onSave());
    s.querySelector('[data-a=help]')!.addEventListener('click', () => this.showHelp(() => this.showPause()));
    s.querySelector('[data-a=settings]')!.addEventListener('click', () => this.showSettings(() => this.showPause()));
    s.querySelector('[data-a=quit]')!.addEventListener('click', () => this.cb.onQuitToMenu());
  }

  showSettings(onClose: () => void) {
    const st = this.cb.getSettings();
    const lang = getLang();
    const s = this.show(`
      <div class="panel modal settings">
        <h2>${t('settings.title')}</h2>
        <label><span>${t('settings.language')}</span><select data-k="lang">${LANGS.map((l) => `<option value="${l}" ${lang === l ? 'selected' : ''}>${t(`lang.${l}`)}</option>`).join('')}</select></label>
        <label><span>${t('settings.quality')}</span><select data-k="quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${t(`settings.quality.${q}`)}</option>`).join('')}</select></label>
        <label><span>${t('settings.volume')} <em data-v="volume">${Math.round(st.volume * 100)}%</em></span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-k="volume"></label>
        <label><span>${t('settings.sensitivity')} <em data-v="sensitivity">${st.sensitivity.toFixed(2)}</em></span><input type="range" min="0.3" max="2.5" step="0.05" value="${st.sensitivity}" data-k="sensitivity"></label>
        <label><span>${t('settings.invertY')}</span><input type="checkbox" data-k="invertY" ${st.invertY ? 'checked' : ''}></label>
        <label><span>${t('settings.showFps')}</span><input type="checkbox" data-k="showFps" ${st.showFps ? 'checked' : ''}></label>
        <div class="muted">${t('settings.autoNote')}</div>
        <div class="row"><button class="btn primary" data-a="close">${t('settings.done')}</button></div>
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
    s.querySelectorAll('[data-k]:not([data-k=lang])').forEach((el) => { el.addEventListener('input', apply); el.addEventListener('change', apply); });
    s.querySelector('[data-k=lang]')!.addEventListener('change', (e) => {
      const l = (e.target as HTMLSelectElement).value as Lang;
      if (LANGS.includes(l) && l !== getLang()) { setLang(l); this.showSettings(onClose); }
    });
    s.querySelector('[data-a=close]')!.addEventListener('click', onClose);
  }

  showHelp(onClose?: () => void) {
    const s = this.show(`
      <div class="panel modal">
        <h2>${t('help.title')}</h2>
        <div class="muted">${t('help.intro')}</div>
        <div class="help-grid">${controls().map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join('')}</div>
        <div class="muted">${t('help.tips')}</div>
        <div class="row"><button class="btn primary" data-a="close">${t('help.close')}</button></div>
      </div>`, 'screen');
    s.querySelector('[data-a=close]')!.addEventListener('click', () => { if (onClose) onClose(); else this.cb.onHelpClose(); });
  }

  showDeath(dead: HominidData, members: HominidData[], lineageLost: boolean, cause: string) {
    const alive = members.filter((m) => m.state !== 'dead' && !m.isOutsider && m.stage !== 'baby');
    const card = (m: HominidData) => `<div class="card panel" style="cursor:pointer" data-id="${m.id}"><h3>${m.name}</h3><div class="tiny">${t('death.member.hp', { sex: t(`sex.${m.sex}`), stage: t(`stage.${m.stage}`), hp: Math.round(m.stats.health), max: Math.round(m.maxStats.health) })}</div><div class="tiny">${t('death.member.neurons', { n: m.neurons.length })}</div></div>`;
    const s = this.show(`
      <h2>${t('death.title', { name: dead.name })}</h2>
      <div class="subtitle">${cause}</div>
      ${lineageLost ? `<div class="hint">${t('death.lost')}</div><div class="col"><button class="btn primary" data-a="quit">${t('death.return')}</button></div>`
        : `<div class="hint">${t('death.choose')}</div><div class="row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:700px">${alive.map(card).join('')}</div>`}`);
    s.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', () => this.cb.onSwitchMember((c as HTMLElement).dataset.id!)));
    s.querySelector('[data-a=quit]')?.addEventListener('click', () => this.cb.onQuitToMenu());
  }

  showWin(lineage: LineageState) {
    const s = this.show(`
      <h1>${t('win.title')}</h1>
      <div class="subtitle">${t('win.subtitle', { years: fmt(lineage.yearsAgo) })}</div>
      <div class="hint">${t('win.summary', { generations: lineage.generation, discoveries: lineage.discoveries.length, feats: lineage.feats.length })}</div>
      <div class="col"><button class="btn primary" data-a="quit">${t('win.return')}</button></div>`);
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
        <h2>${t('gen.title')}</h2>
        <div class="muted">${t('gen.summary', { generation: opts.lineage.generation, years: fmt(opts.lineage.yearsAgo), offspring: opts.offspring, adults: opts.adults })}</div>
        <div class="evo-timeline"><div class="fill" style="width:${((10_000_000 - opts.lineage.yearsAgo) / 8_000_000) * 100}%"></div><div class="lbl">${t('gen.timeline')}</div></div>
        <div class="row">
          <div class="card"><h3>${t('gen.change.title')}</h3><div class="tiny">${t('gen.change.desc', { n: opts.unreinforced })}</div><br><button class="btn primary" data-a="gen" ${canGen ? '' : 'disabled'}>${t('gen.change.btn')}</button>${canGen ? '' : `<div class="tiny">${t('gen.change.requires')}</div>`}</div>
          <div class="card"><h3>${t('gen.leap.title')}</h3><div class="tiny">${t('gen.leap.desc', { feats: opts.feats, years: fmt(opts.yearsLeap) })}</div><br><button class="btn" data-a="leap" ${canGen ? '' : 'disabled'}>${t('gen.leap.btn')}</button></div>
        </div>
        <div class="row"><button class="btn small" data-a="close">${t('gen.notYet')}</button></div>
      </div>`, 'screen');
    s.querySelector('[data-a=gen]')!.addEventListener('click', () => opts.onGeneration());
    s.querySelector('[data-a=leap]')!.addEventListener('click', () => opts.onLeap());
    s.querySelector('[data-a=close]')!.addEventListener('click', () => opts.onClose());
  }

  /** Summary after a generation change. */
  showGenerationResult(opts: { title: string; lines: string[]; onClose: () => void }) {
    const s = this.show(`<div class="panel modal"><h2>${opts.title}</h2><div class="muted">${opts.lines.map((l) => `<div>${l}</div>`).join('')}</div><div class="row"><button class="btn primary" data-a="close">${t('gen.continue')}</button></div></div>`, 'screen');
    s.querySelector('[data-a=close]')!.addEventListener('click', () => opts.onClose());
  }
}
