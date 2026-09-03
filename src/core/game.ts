import * as THREE from 'three';
import type { ActionId, ClanState, HominidData, ItemId, LineageState, SaveGame, SenseKind } from './types';
import { Input } from './input';
import { GameClock } from './clock';
import { EventBus } from './events';
import { AudioEngine } from './audio';
import { hasSave, readSave, writeSave, SAVE_VERSION } from './save';
import { loadSettings, saveSettings, qualityParams, type Settings } from './settings';
import { GameWorld, type AnimalEntity, type HominidEntity, type WorldItem } from '@/world/gameWorld';
import { WATER_LEVEL, WORLD_SIZE } from '@/world/terrain';
import { Sky } from '@/world/sky';
import { LANDMARKS, type LandmarkId } from '@/world/landmarks';
import { PlayerController, type MoveModifiers } from '@/systems/controller';
import { Hud, type HudData, type HudMarker } from '@/ui/hud';
import { Screens } from '@/ui/screens';
import { NeuronalUI } from '@/ui/neuronalUI';
import { IntroCinematic } from '@/ui/intro';
import { Panels, type PanelKind } from '@/ui/panels';
import { ITEMS } from '@/data/items';
import { PLANTS } from '@/data/plants';
import { SPECIES } from '@/data/species';
import { NEURON_MAP } from '@/data/neurons';
import { FEAT_MAP } from '@/data/feats';
import { t, localizedName, localizedDescription, locale } from '@/i18n';
import {
  tickSurvival, consume, drinkWater, applyDamage, applyCondition, cureCondition, speedMultiplierFromConditions,
  type SurvivalModifiers, hasCondition,
} from '@/systems/survival';
import { tickFear, addDopamine, discoveryDopamine, isPanicking, startOvercome, collectLight, tickOvercome, applyOvercomeResult, type OvercomeChallenge } from '@/systems/fear';
import { detect, focusTarget, identify, exploreArea, isAreaKnown, isKnown, DEFAULT_SENSE_RANGES, type Sensable, type Detection } from '@/systems/intelligence';
import { computeModifiers, unlockNeuron, reinforceNeuron, gainEnergy, recordAction, type Modifiers } from '@/systems/neuronal';
import { createLineage, checkFeats, generationChange, evolutionLeap, isLineageLost, hasWon, lineageProgress, computeLeap } from '@/systems/evolution';
import { createClan, createOutsider, recruitAction, canMate, mate, pickUpBaby, dropBaby, switchPlayer, livingMembers, carriedBabyIds, findMember, maxStatsForStage, bondTick, isAlive } from '@/systems/clan';
import { combine, alter, canHarvestPlant, toolBreaks, bestWeapon, canAlter, canCombine } from '@/systems/crafting';
import { startAttack, tickTelegraph, resolveDodge, dodgeIsHit, dodgeAllowsCounter, hitDamage, attackAnimal, tryIntimidate } from '@/systems/combat';
import { updateAnimalAI, applyMovement, animalNoise, animalScent, damageAnimal, provoke, isNight as aiIsNight } from '@/systems/animalAI';
import { mulberry32, hashString, type Rng } from '@/util/rng';
import { clamp, lerp } from '@/world/noise';

export type GameState = 'menu' | 'loading' | 'intro' | 'playing' | 'paused' | 'neuronal' | 'panel' | 'dead' | 'generation' | 'win' | 'help';

interface IntelState {
  active: boolean;
  sense: SenseKind;
  detections: Detection[];
  focus: Detection | null;
  identifyT: number;
}

interface CombatState {
  telegraph: { attacker: AnimalEntity; t: import('@/systems/combat').AttackTelegraph } | null;
  dodgeInput: number | null;
  counterWindow: number;
  lastPrompt: HudData['combatPrompt'];
}

const AREA_CELL = 64;

/** Death cause id (from survival events) to localized text; unknown causes pass through. */
function causeText(cause: string): string {
  const key = `cause.${cause}`;
  const s = t(key);
  return s === key ? cause : s;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly clock = new GameClock();
  readonly events = new EventBus();
  readonly audio = new AudioEngine();
  readonly hud: Hud;
  readonly screens: Screens;
  readonly neuronalUI: NeuronalUI;
  readonly panels: Panels;
  world: GameWorld | null = null;
  controller: PlayerController | null = null;
  state: GameState = 'menu';
  lineage: LineageState = createLineage();
  clan: ClanState = { members: [], settlement: { x: 0, y: 0, z: 0 }, playerId: '' };
  mods: Modifiers = computeModifiers([]);
  private intel: IntelState = { active: false, sense: 'sight', detections: [], focus: null, identifyT: 0 };
  private combat: CombatState = { telegraph: null, dodgeInput: null, counterWindow: 0, lastPrompt: null };
  private overcome: OvercomeChallenge | null = null;
  private rng: Rng = mulberry32(1);
  private lastTime = 0;
  private fps = 60;
  private damageFlash = 0;
  private fixedAcc = 0;
  private uiRoot: HTMLElement;
  private running = false;
  private rainTimer = 0;
  private rainTarget = 0;
  private nearWaterCache = false;
  private fearLightTimer = 0;
  private lastCall = 0;
  private stepCount = 0;
  private outsiderTimer = 120;
  private sleepUntil: number | null = null;
  private predatorNear = false;
  private lowQuality = false;
  settings: Settings = loadSettings();
  private unknownExposure = 0;
  private hintsShown = new Set<string>();
  private hintTimer = 0;
  private playTime = 0;
  intro: IntroCinematic | null = null;
  private menuScene = new THREE.Scene();
  private menuSky: Sky;
  private menuTime = 0;
  /** debug/automation handle */
  readonly debug = { get: () => this.snapshot() };

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.lowQuality = (navigator.webdriver === true || /lowquality/.test(location.search)) && !/quality=high/.test(location.search);
    this.renderer.setPixelRatio(this.lowQuality ? 0.5 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
    this.menuSky = new Sky(this.menuScene);
    const menuGround = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), new THREE.MeshStandardMaterial({ color: '#25401f', roughness: 1 }));
    menuGround.rotation.x = -Math.PI / 2; menuGround.position.y = -3;
    this.menuScene.add(menuGround);
    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot);
    this.hud.visible = false;
    this.screens = new Screens(uiRoot, {
      onNewGame: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onResume: () => this.resume(),
      onSave: () => { this.save(); this.hud.toast(t('toast.saved'), 'good'); this.resume(); },
      onQuitToMenu: () => this.quitToMenu(),
      onSwitchMember: (id) => this.switchTo(id),
      onHelpClose: () => this.resume(),
      onToggleMute: () => { this.audio.muted = !this.audio.muted; return this.audio.muted; },
      getSettings: () => this.settings,
      onSettingsChange: (st) => this.applySettings(st),
    });
    this.neuronalUI = new NeuronalUI(uiRoot, {
      onUnlock: (id) => this.unlock(id),
      onReinforce: (id) => this.reinforce(id),
      onClose: () => this.closeNeuronal(),
    });
    this.panels = new Panels(uiRoot);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    document.addEventListener('pointerlockchange', () => {
      // Esc in pointer lock is swallowed by the browser: treat unlocking as a pause request.
      if (!document.pointerLockElement && this.state === 'playing' && this.input.wantPointerLock && this.sleepUntil === null) this.pause();
    });
    if (matchMedia('(pointer: coarse)').matches && !('onmousemove' in window)) {
      setTimeout(() => this.hud.toast(t('toast.needKeyboard'), 'warn'), 500);
    }
    this.resize();
    this.screens.showMenu(hasSave());
    this.input.wantPointerLock = false;
    this.applySettings(this.settings);
    canvas.addEventListener('mousedown', () => { this.audio.init(); this.audio.resume(); }, { once: true });
    window.addEventListener('keydown', () => { this.audio.init(); this.audio.resume(); }, { once: true });
    (window as unknown as { game: Game }).game = this;
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.lastTime) / 1000);
      this.lastTime = t;
      this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
      try { this.frame(dt); } catch (e) { console.error(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get player(): HominidData {
    return findMember(this.clan, this.clan.playerId)!;
  }

  get playerEntity(): HominidEntity | undefined {
    return this.world?.hominids.get(this.clan.playerId);
  }

  private async buildWorld(seed: number, progress: (p: number) => void) {
    // yield to let the loading screen paint
    const tick = (p: number) => new Promise<void>((r) => { progress(p); setTimeout(r, 16); });
    await tick(0.05);
    this.world = new GameWorld(seed);
    await tick(0.6);
    this.rng = mulberry32(seed ^ 0x51ed27);
    if (this.lowQuality) { const v = this.world.veg; v.treeDistance = 120; v.bushDistance = 60; v.grassDistance = 40; v.shadowDistance = 0; }
    else this.applySettings(this.settings);
    return this.world;
  }

  async newGame(seed = Date.now() % 1_000_000, withIntro = !this.lowQuality) {
    this.state = 'loading';
    const progress = this.screens.showLoading();
    const world = await this.buildWorld(seed, progress);
    this.lineage = createLineage();
    const settle = world.chooseSettlement();
    this.clan = createClan(this.rng, { x: settle.x, y: settle.y, z: settle.z });
    progress(0.7);
    world.scatterItems(700);
    world.populateAnimals(150);
    // one outsider not far away
    const ox = settle.x + 70, oz = settle.z - 40;
    this.clan.members.push(createOutsider(this.rng, { x: ox, y: world.terrain.heightAt(ox, oz), z: oz }));
    progress(0.9);
    this.clock.timeOfDay = 0.3;
    this.clock.dayCount = 1;
    this.setupEntities();
    // starting knowledge: the settlement area
    exploreArea(this.lineage, this.player.position, AREA_CELL);
    if (withIntro) { this.startIntro(); return; }
    this.beginPlay();
    this.hud.toast(t('toast.intro'), 'info');
    setTimeout(() => this.hud.toast(t('toast.pressH'), 'info'), 2500);
  }

  async continueGame() {
    const save = readSave();
    if (!save) return this.newGame();
    this.state = 'loading';
    const progress = this.screens.showLoading(t('app.loading.remembering'));
    const world = await this.buildWorld(save.worldSeed, progress);
    this.lineage = save.lineage;
    this.clan = save.clan;
    world.setSettlement(save.clan.settlement);
    for (const it of save.items) world.spawnItem(it.id, it.position);
    for (const a of save.animals) world.spawnAnimal(a.species, a.position, a.health);
    world.veg.restore(save.harvested);
    this.clock.timeOfDay = save.timeOfDay;
    this.clock.dayCount = save.dayCount;
    progress(0.9);
    this.setupEntities();
    this.beginPlay();
    this.hud.toast(t('toast.welcomeBack'), 'good');
  }

  private setupEntities() {
    const world = this.world!;
    for (const m of this.clan.members) {
      if (m.state === 'dead') continue;
      const ent = world.addHominid(m);
      world.syncHeld(ent);
    }
    this.attachPlayer();
  }

  private attachPlayer() {
    const world = this.world!;
    const p = this.player;
    const ent = world.hominids.get(p.id)!;
    this.controller = new PlayerController(world.terrain, world.veg, ent.rig);
    this.controller.teleport(p.position.x, p.position.z);
    this.controller.sensitivity = this.settings.sensitivity;
    this.controller.invertY = this.settings.invertY;
    this.controller.camYaw = Math.atan2(world.settlement.x - p.position.x, world.settlement.z - p.position.z) + Math.PI;
    this.recomputeMods();
    this.syncBabyRigs();
  }

  /** Opening cinematic over the freshly generated world; ends in gameplay. */
  startIntro() {
    const w = this.world!;
    this.screens.hideAll();
    this.hud.visible = false;
    this.state = 'intro';
    this.input.wantPointerLock = false;
    this.input.clearAll();
    this.clock.timeOfDay = 0.27;
    const lakeCenter = new THREE.Vector3(-0.16 * WORLD_SIZE, 0, 0.02 * WORLD_SIZE);
    this.intro = new IntroCinematic(this.uiRoot, { settlement: w.settlement.clone(), lakeCenter, heightAt: (x, z) => w.terrain.heightAt(x, z) });
    this.intro.onFinish(() => {
      this.intro = null;
      this.clock.timeOfDay = 0.3;
      this.beginPlay();
      this.hud.toast(t('toast.intro'), 'info');
      setTimeout(() => this.hud.toast(t('toast.pressH'), 'info'), 2500);
    });
    this.audio.init(); this.audio.resume(); this.audio.playIntro();
  }

  private beginPlay() {
    this.screens.hideAll();
    this.hud.visible = true;
    this.state = 'playing';
    this.input.wantPointerLock = true;
    this.input.clearAll();
    this.combat = { telegraph: null, dodgeInput: null, counterWindow: 0, lastPrompt: null };
    this.intel.active = false;
  }

  private quitToMenu() {
    this.state = 'menu';
    this.hud.visible = false;
    this.neuronalUI.close();
    this.panels.close();
    this.input.exitPointerLock();
    this.input.wantPointerLock = false;
    this.screens.showMenu(hasSave());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitPointerLock();
    this.screens.showPause();
  }

  resume() {
    this.screens.hideAll();
    this.panels.close();
    this.neuronalUI.close();
    this.hud.visible = true;
    this.state = 'playing';
    this.input.clearAll();
  }

  // ---------------------------------------------------------------- save/load
  save(): boolean {
    if (!this.world) return false;
    const w = this.world;
    for (const [id, ent] of w.hominids) {
      const d = findMember(this.clan, id);
      if (d) d.position = { x: ent.rig.root.position.x, y: ent.rig.root.position.y, z: ent.rig.root.position.z };
    }
    if (this.controller) this.player.position = { x: this.controller.position.x, y: this.controller.position.y, z: this.controller.position.z };
    const save: SaveGame = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: w.seed,
      timeOfDay: this.clock.timeOfDay,
      dayCount: this.clock.dayCount,
      lineage: this.lineage,
      clan: this.clan,
      items: w.items.map((i) => ({ id: i.id, position: { x: i.position.x, y: i.position.y, z: i.position.z }, quantity: 1 })),
      animals: w.animals.filter((a) => a.data.alive).map((a) => ({ species: a.data.species, position: { ...a.data.position }, health: a.data.health })),
      harvested: w.veg.serialize(),
    };
    return writeSave(save);
  }

  // ------------------------------------------------------------------ helpers
  private recomputeMods() {
    const p = this.player;
    this.mods = computeModifiers([...p.neurons, ...p.genetic]);
    const base = maxStatsForStage(p.stage);
    p.maxStats = {
      health: base.health * this.mods.statMult.health,
      energy: base.energy * this.mods.statMult.energy,
      hunger: base.hunger * this.mods.statMult.hunger,
      thirst: base.thirst * this.mods.statMult.thirst,
    };
    for (const k of ['health', 'energy', 'hunger', 'thirst'] as const) p.stats[k] = Math.min(p.stats[k], p.maxStats[k]);
  }

  private hasAbility(a: string) { return this.mods.abilities.has(a as never); }

  private survivalMods(): SurvivalModifiers {
    const c = this.controller!;
    return {
      metabolismMult: this.mods.metabolism,
      statMult: {},
      hasAbility: (a) => this.mods.abilities.has(a),
      isSleeping: this.sleepUntil !== null,
      isRunning: c.state === 'run',
      isClimbing: c.isClimbing,
      isSwimming: c.isSwimming,
      isRaining: this.world!.sky.rain > 0.3,
      nearFire: this.nearSettlement(10) || (this.world?.landmarks.some((l) => l.def.id === 'hot_spring' && l.position.distanceTo(this.controller!.position) < 8) ?? false),
    };
  }

  private nearSettlement(r: number): boolean {
    const c = this.controller;
    if (!c || !this.world) return false;
    return c.position.distanceTo(this.world.settlement) < r;
  }

  private act(action: ActionId, n = 1) {
    const babies = carriedBabyIds(this.player).length;
    let total = 0;
    for (let i = 0; i < n; i++) total += gainEnergy(this.lineage, action, this.mods, babies);
    if (total >= 5) this.events.emit('neuronEnergy', { amount: total, total: this.lineage.neuronalEnergy });
    const feats = checkFeats(this.lineage);
    for (const f of feats) {
      this.hud.toast(t('toast.feat', { name: localizedName('feat', f.id, f.name) }), 'neuron');
      this.audio.play('unlock', 0.6);
    }
    return total;
  }

  private discover(id: string, name: string, kind: 'item' | 'plant' | 'animal' | 'area' | 'landmark') {
    const r = identify(this.lineage, id);
    this.act('identify');
    if (r.isNew && kind === 'landmark' && id.startsWith('landmark:')) {
      this.lineage.neuronalEnergy += 40;
      this.hud.toast(t('toast.landmark', { name, description: localizedDescription('landmark', id.slice(9), LANDMARKS[id.slice(9) as LandmarkId]?.description ?? '') }), 'discovery');
    }
    if (r.isNew) {
      this.lineage.neuronalEnergy += r.energy;
      addDopamine(this.player, discoveryDopamine(kind));
      this.hud.toast(t('toast.discovered', { name, energy: r.energy }), 'discovery');
      this.audio.play('discover', 0.8);
      this.events.emit('discovery', { id, name, kind });
    } else {
      this.lineage.neuronalEnergy += r.energy;
      addDopamine(this.player, 2);
    }
    return r.isNew;
  }

  private unlock(id: string): boolean {
    const ok = unlockNeuron(this.player, this.lineage, id);
    if (ok) {
      this.recomputeMods();
      this.audio.play('unlock');
      this.hud.toast(t('toast.neuronUnlocked', { name: localizedName('neuron', id, NEURON_MAP[id].name) }), 'neuron');
      this.refreshNeuronal();
    }
    return ok;
  }

  private reinforce(id: string): boolean {
    const ok = reinforceNeuron(this.player, this.lineage, id);
    if (ok) { this.audio.play('neuron'); this.refreshNeuronal(); }
    return ok;
  }

  private neuronalData() {
    const p = this.player;
    return {
      unlocked: new Set([...p.neurons, ...p.genetic]),
      reinforced: new Set(p.reinforced),
      genetic: new Set(p.genetic),
      energy: this.lineage.neuronalEnergy,
      actionCounts: this.lineage.actionCounts,
      babiesCarried: carriedBabyIds(p).length,
    };
  }

  private refreshNeuronal() { if (this.neuronalUI.visible) this.neuronalUI.refresh(this.neuronalData()); }

  openNeuronal() {
    if (this.state !== 'playing') return;
    this.state = 'neuronal';
    this.input.exitPointerLock();
    this.hud.visible = false;
    this.neuronalUI.open(this.neuronalData());
  }

  closeNeuronal() {
    this.neuronalUI.close();
    this.hud.visible = true;
    this.state = 'playing';
    this.input.clearAll();
  }

  openPanel(kind: PanelKind) {
    if (this.state !== 'playing' && this.state !== 'panel') return;
    this.state = 'panel';
    this.input.exitPointerLock();
    this.hud.visible = false;
    const w = this.world!;
    this.panels.show(kind, {
      clan: this.clan, lineage: this.lineage, player: this.player, abilities: this.mods.abilities as Set<string>,
      biomeAt: (x, z) => w.terrain.biomeAt(x, z), heightAt: (x, z) => w.terrain.heightAt(x, z), worldSize: WORLD_SIZE,
      settlement: { x: w.settlement.x, z: w.settlement.z },
      landmarks: w.landmarks.filter((l) => isKnown(this.lineage, `landmark:${l.def.id}`)).map((l) => ({ x: l.position.x, z: l.position.z, name: localizedName('landmark', l.def.id, l.def.name) })),
      animals: w.animals.filter((a) => a.data.alive && isKnown(this.lineage, `animal:${a.data.species}`) && Math.hypot(a.data.position.x - this.controller!.position.x, a.data.position.z - this.controller!.position.z) < 120).map((a) => ({ x: a.data.position.x, z: a.data.position.z, predator: SPECIES[a.data.species].behavior === 'predator' })),
      onSwitch: (id) => { this.panels.close(); this.switchTo(id); },
      onClose: () => this.resume(),
    });
  }

  /** Switch the controlled hominid. */
  switchTo(id: string) {
    const target = findMember(this.clan, id);
    if (!target || target.state === 'dead' || !this.world) return;
    // store current player position
    if (this.controller && this.player.state !== 'dead') {
      this.player.position = { x: this.controller.position.x, y: this.controller.position.y, z: this.controller.position.z };
    }
    if (!switchPlayer(this.clan, id)) return;
    const w = this.world;
    if (!w.hominids.get(id)) w.addHominid(target);
    this.attachPlayer();
    this.combat = { telegraph: null, dodgeInput: null, counterWindow: 0, lastPrompt: null };
    this.overcome = null;
    w.clearFearLights();
    this.screens.hideAll();
    this.hud.visible = true;
    this.state = 'playing';
    this.hud.toast(t('toast.nowPlaying', { name: target.name }), 'good');
  }

  private syncBabyRigs() {
    const w = this.world!;
    for (const [, ent] of w.hominids) {
      const d = ent.data;
      if (d.stage !== 'baby') continue;
      const carrierEnt = [...w.hominids.values()].find((h) => carriedBabyIds(h.data).includes(d.id));
      if (carrierEnt) {
        if (ent.rig.root.parent !== carrierEnt.rig.back) {
          carrierEnt.rig.back.add(ent.rig.root);
          ent.rig.root.position.set(0, 0.1, -0.1);
          ent.rig.root.rotation.set(0.6, 0, 0);
        }
      } else if (ent.rig.root.parent !== w.scene) {
        w.scene.add(ent.rig.root);
        const carrierPos = this.controller?.position ?? w.settlement;
        ent.rig.root.position.set(carrierPos.x + 0.8, w.terrain.heightAt(carrierPos.x + 0.8, carrierPos.z), carrierPos.z);
        ent.rig.root.rotation.set(0, 0, 0);
        d.position = { x: ent.rig.root.position.x, y: ent.rig.root.position.y, z: ent.rig.root.position.z };
      }
    }
  }

  // ------------------------------------------------------------------- frame
  private frame(dt: number) {
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== window.innerWidth || size.y !== window.innerHeight) this.resize();
    const w = this.world;
    if (w && this.controller) {
      if (this.state === 'intro' && this.intro) {
        if (this.input.anyPressed()) this.intro.skip();
        else {
          this.clock.timeOfDay = Math.min(0.3, this.clock.timeOfDay + dt * 0.0018);
          this.idleAnimate(dt);
        }
      } else if (this.state === 'playing') this.simulate(dt);
      else { this.handleOverlayKeys(); this.idleAnimate(dt); }
      this.render(dt);
    } else if (w) {
      this.render(dt);
    } else {
      this.renderMenu(dt);
    }
    this.input.endFrame();
  }

  /** Apply and persist player settings. */
  applySettings(st: Settings) {
    this.settings = st;
    saveSettings(st);
    this.audio.volume = st.volume;
    if (this.controller) { this.controller.sensitivity = st.sensitivity; this.controller.invertY = st.invertY; }
    this.hud.showFps = st.showFps;
    if (st.quality !== 'auto' && !this.lowQuality) {
      const q = qualityParams(st.quality);
      this.pixelRatio = q.pixelRatio;
      this.renderer.setPixelRatio(q.pixelRatio);
      this.renderer.shadowMap.enabled = q.shadows;
      const w = this.world;
      if (w) {
        w.veg.treeDistance = q.treeDistance; w.veg.bushDistance = q.bushDistance; w.veg.grassDistance = q.grassDistance; w.veg.shadowDistance = q.shadowDistance;
        if (w.sky.sun.shadow.mapSize.x !== q.shadowMap) { w.sky.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap); w.sky.sun.shadow.map?.dispose(); w.sky.sun.shadow.map = null; }
        w.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
      }
    } else if (!this.lowQuality) {
      this.renderer.shadowMap.enabled = true;
    }
  }

  private qualityTimer = 0;
  private pixelRatio = Math.min(devicePixelRatio, 1.5);
  /** Adaptive quality: lower resolution and view distances when the GPU struggles. */
  private adaptQuality(dt: number) {
    this.qualityTimer += dt;
    if (this.qualityTimer < 2.5) return;
    this.qualityTimer = 0;
    if (this.settings.quality !== 'auto') return;
    const w = this.world!;
    const veg = w.veg;
    if (this.fps < 30) {
      if (this.pixelRatio > 0.7) { this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.15); this.renderer.setPixelRatio(this.pixelRatio); }
      else if (veg.treeDistance > 260) { veg.treeDistance -= 60; veg.bushDistance = Math.max(90, veg.bushDistance - 25); veg.grassDistance = Math.max(60, veg.grassDistance - 20); veg.shadowDistance = Math.max(50, veg.shadowDistance - 15); }
      else if (w.sky.sun.shadow.mapSize.x > 1024) { w.sky.sun.shadow.mapSize.set(1024, 1024); w.sky.sun.shadow.map?.dispose(); w.sky.sun.shadow.map = null; }
    } else if (this.fps > 56) {
      if (veg.treeDistance < 420) { veg.treeDistance += 40; veg.bushDistance = Math.min(160, veg.bushDistance + 15); veg.grassDistance = Math.min(110, veg.grassDistance + 10); }
      else if (this.pixelRatio < Math.min(devicePixelRatio, 1.5)) { this.pixelRatio = Math.min(Math.min(devicePixelRatio, 1.5), this.pixelRatio + 0.1); this.renderer.setPixelRatio(this.pixelRatio); }
    }
  }

  /** Slow sunrise behind the main menu. */
  private renderMenu(dt: number) {
    this.menuTime += dt;
    const t = 0.27 + (Math.sin(this.menuTime * 0.05) * 0.5 + 0.5) * 0.3; // sunrise .. afternoon
    const focus = new THREE.Vector3(0, 0, 0);
    this.menuSky.update(t, dt, focus);
    this.camera.position.set(Math.sin(this.menuTime * 0.03) * 4, 2, Math.cos(this.menuTime * 0.03) * 4);
    this.camera.lookAt(Math.sin(this.menuTime * 0.03 + 1) * 40, 8, Math.cos(this.menuTime * 0.03 + 1) * 40);
    this.renderer.render(this.menuScene, this.camera);
  }

  /** Keyboard shortcuts that close overlay screens (neuronal network, panels, help). */
  private handleOverlayKeys() {
    const input = this.input;
    if (this.state === 'neuronal' && (input.justPressed('neuronal') || input.justPressed('hear') || input.justPressed('pause'))) this.closeNeuronal();
    else if (this.state === 'panel' && (input.justPressed('pause') || input.justPressed('inventory') || input.justPressed('clan') || input.justPressed('map'))) this.resume();
    else if (this.state === 'help' && (input.justPressed('pause') || input.justPressed('help'))) this.resume();
  }

  private idleAnimate(dt: number) {
    const w = this.world!;
    for (const a of w.animals) a.rig.update(dt, 0, a.data.alive ? 'idle' : 'dead');
    for (const [, h] of w.hominids) if (h.data.id !== this.clan.playerId) h.rig.update(dt, h.data.state === 'dead' ? 'dead' : 'idle', 0);
    this.controller!.rig.update(dt, this.player.state === 'dead' ? 'dead' : this.sleepUntil !== null ? 'sleep' : 'idle', 0);
  }

  private render(dt: number) {
    const w = this.world!;
    const introCam = this.state === 'intro' && this.intro ? this.intro.update(dt, this.camera) : null;
    const focus = introCam ?? (this.controller ? this.controller.position : w.settlement);
    const sky = w.sky.update(this.clock.timeOfDay, dt, focus);
    w.rain.update(dt, w.sky.rain, this.camera, focus.y);
    const sunDir = (w.sky.sun.position.clone().sub(focus)).normalize();
    w.water.update(this.clock.elapsed, sunDir, w.sky.sun.color, w.sky.fog, sky.night);
    w.update(dt, this.clock.elapsed, focus);
    this.adaptQuality(dt);
    if (introCam) { /* camera already placed by the cinematic */ }
    else if (this.controller) this.controller.updateCamera(this.camera, dt, { intel: this.intel.active, fov: 60 });
    else {
      this.camera.position.set(focus.x + 20, focus.y + 12, focus.z + 20);
      this.camera.lookAt(focus);
    }
    this.renderer.render(w.scene, this.camera);
  }

  // ---------------------------------------------------------------- simulate
  private simulate(dt: number) {
    const w = this.world!;
    const c = this.controller!;
    const p = this.player;
    const input = this.input;

    // Sleep skip
    if (this.sleepUntil !== null) {
      this.clock.timeScale = 60;
      this.clock.advance(dt);
      const mods = this.survivalMods();
      for (const ev of tickSurvival(p, dt * 60, mods)) this.onSurvivalEvent(ev);
      c.rig.update(dt, 'sleep', 0);
      if (this.clock.timeOfDay >= this.sleepUntil && this.clock.timeOfDay < this.sleepUntil + 0.05) {
        this.sleepUntil = null;
        this.clock.timeScale = 1;
        c.cancelAction();
        this.act('sleep');
        this.hud.toast(t('toast.newDay'), 'good');
        this.save();
      }
      this.updateClan(dt);
      this.updateHud();
      return;
    }

    // Global keys
    if (input.justPressed('pause')) { this.pause(); return; }
    if (input.justPressed('neuronal') || (input.justPressed('hear') && !this.intel.active)) { this.openNeuronal(); return; }
    if (input.justPressed('inventory')) { this.openPanel('inventory'); return; }
    if (input.justPressed('clan')) { this.openPanel('clan'); return; }
    if (input.justPressed('map')) { this.openPanel('map'); return; }
    if (input.justPressed('help')) { this.state = 'help'; this.input.exitPointerLock(); this.screens.showHelp(); return; }
    if (input.justPressed('generation')) { this.tryGeneration(); if (this.state !== 'playing') return; }
    if (input.justPressed('sleep')) this.trySleep();

    // Intelligence mode
    const intelHeld = input.isDown('intelligence');
    if (intelHeld && !this.intel.active) { this.intel.active = true; this.audio.play('ui', 0.4); }
    if (!intelHeld && this.intel.active) { this.intel.active = false; this.intel.identifyT = 0; }
    if (this.intel.active) {
      if (input.justPressed('smell')) { this.intel.sense = this.intel.sense === 'smell' ? 'sight' : 'smell'; this.act('smell'); this.audio.play('ui', 0.3); }
      if (input.justPressed('hear')) { this.intel.sense = this.intel.sense === 'hearing' ? 'sight' : 'hearing'; this.act('hear'); this.audio.play('ui', 0.3); }
    } else this.intel.sense = 'sight';
    this.clock.timeScale = this.intel.active ? 0.2 : 1;
    this.clock.advance(dt);
    const simDt = dt * (this.intel.active ? 0.35 : 1);

    // Weather
    this.rainTimer -= dt;
    if (this.rainTimer <= 0) { this.rainTimer = 90 + this.rng() * 240; this.rainTarget = this.rng() < 0.3 ? 0.6 + this.rng() * 0.4 : 0; }
    w.sky.rain = lerp(w.sky.rain, this.rainTarget, dt * 0.05);

    // Movement
    const busy = c.isBusy;
    const moveMods: MoveModifiers = {
      speed: this.mods.speed, climb: this.mods.climb, canSwim: this.hasAbility('swim'), canDive: this.hasAbility('dive'),
      bipedal: this.mods.bipedal, longJump: this.hasAbility('long_jump'), fastClimb: this.hasAbility('fast_climb'),
      stageSpeed: p.stage === 'child' ? 0.85 : p.stage === 'elder' ? 0.8 : 1,
      conditionSpeed: speedMultiplierFromConditions(p) * (p.stats.energy < 10 ? 0.6 : 1),
      fearSlow: isPanicking(p) ? 0.3 : 1 - p.fear / 250,
    };
    const allowMove = !busy && !this.intel.active;
    const events = c.update(simDt, input, moveMods, allowMove || this.intel.active);
    for (const ev of events) {
      switch (ev.type) {
        case 'step': this.audio.play('land', ev.running ? 0.12 : 0.06); this.stepCount++; this.act(ev.running ? 'run' : 'walk'); break;
        case 'jump': this.audio.play('jump', 0.3); this.act('jump'); break;
        case 'land': {
          this.audio.play('land', 0.4);
          if (ev.fallHeight > 6.5) {
            const dmg = (ev.fallHeight - 6) * 7;
            const frac = ev.fallHeight > 9 && this.rng() < 0.6 && !this.hasAbility('sleep_anywhere');
            const died = applyDamage(p, dmg, frac ? 'fractured' : undefined, 0.6);
            this.damageFlash = 1;
            this.audio.play('hurt');
            this.hud.toast(frac ? t('toast.badFall') : t('toast.hardLanding'), 'warn');
            this.act('fall');
            if (died) this.onPlayerDeath(t('cause.fall'));
          }
          break;
        }
        case 'climb_start': this.act('climb'); break;
        case 'canopy': addDopamine(p, 3); break;
        case 'swim_start': this.audio.play('splash', 0.6); this.act('swim'); break;
        case 'drown_tick': {
          if (applyDamage(p, 6 * simDt)) this.onPlayerDeath(t('cause.drowning'));
          if (this.stepCount % 30 === 0) this.hud.toast(t('toast.cannotSwim'), 'warn');
          break;
        }
        case 'attack_hit': this.resolvePlayerAttack(); break;
      }
    }
    p.position = { x: c.position.x, y: c.position.y, z: c.position.z };
    p.state = c.state;
    if (c.state === 'swim' && this.stepCount++ % 90 === 0) this.act('swim');

    // Survival
    const smods = this.survivalMods();
    for (const ev of tickSurvival(p, simDt, smods)) this.onSurvivalEvent(ev);
    if (p.state === 'dead') return;

    // Exploration & fear
    if (exploreArea(this.lineage, p.position, AREA_CELL)) {
      this.unknownExposure = 1;
      addDopamine(p, discoveryDopamine('area'));
      this.act('discover_area');
      this.hud.toast(t('toast.newTerritory'), 'discovery');
      this.audio.play('discover', 0.5);
    }
    this.predatorNear = w.animals.some((a) => a.data.alive && SPECIES[a.data.species].behavior === 'predator' && (a.out.state === 'stalk' || a.out.state === 'attack') && Math.hypot(a.data.position.x - p.position.x, a.data.position.z - p.position.z) < 30);
    const withClan = [...w.hominids.values()].some((h) => h.data.id !== p.id && !h.data.isOutsider && h.data.state !== 'dead' && h.rig.root.position.distanceTo(c.position) < 10);
    this.unknownExposure = Math.max(0, this.unknownExposure - simDt / 40);
    let unknownNeighbors = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      if (!isAreaKnown(this.lineage, { x: p.position.x + dx * AREA_CELL, y: 0, z: p.position.z + dz * AREA_CELL }, AREA_CELL)) unknownNeighbors++;
    }
    const fearRes = tickFear(p, simDt, {
      inUnknownArea: (unknownNeighbors >= 4 || this.unknownExposure > 0) && !this.nearSettlement(30),
      fearMult: this.mods.fear, nearPredator: this.predatorNear, isNight: this.clock.isNight, withClan,
    });
    if (fearRes.panicStarted) {
      this.overcome = startOvercome(p, this.rng);
      w.spawnFearLights(c.position, this.overcome.lightsNeeded);
      this.hud.toast(t('toast.panic'), 'warn');
      this.audio.play('fear');
      this.events.emit('panic', { started: true });
    }
    if (this.overcome) {
      const st = tickOvercome(this.overcome, simDt);
      for (const l of [...w.lights]) {
        if (l.position.distanceTo(c.position) < 2.2) {
          w.scene.remove(l); w.lights.splice(w.lights.indexOf(l), 1);
          this.audio.play('light');
          if (collectLight(this.overcome)) { /* completed */ }
          addDopamine(p, 8);
        }
      }
      if (st !== 'active' || this.overcome.found >= this.overcome.lightsNeeded) {
        const ok = st === 'success' || this.overcome.found >= this.overcome.lightsNeeded;
        applyOvercomeResult(p, ok);
        if (ok) { this.act('overcome_fear'); this.hud.toast(t('toast.fearOvercome'), 'good'); this.audio.play('discover'); }
        else this.hud.toast(t('toast.panicLingers'), 'warn');
        this.overcome = null;
        w.clearFearLights();
      }
    }

    // Intelligence sensing
    this.updateIntel(simDt);

    // Interactions
    if (!this.intel.active && !busy) this.handleInteractions();
    if ((input.justPressed('use') || (input.justPressed('smell') && !this.intel.active)) && !busy) this.useHeld();
    if (input.justPressed('swapHands') && !busy) this.craft();
    if (input.justPressed('dropLeft') && !busy) this.drop('left');
    if (input.justPressed('dropRight') && !busy) this.drop('right');
    if (input.justPressed('call') && !busy) this.callOrIntimidate();
    if (input.mouseJustPressed(2) && !busy && !this.intel.active && c.grounded && !c.isClimbing) {
      c.startAction('dodge', 0.55);
      this.audio.play('dodge', 0.5);
      if (this.combat.telegraph) this.combat.dodgeInput = this.combat.telegraph.t.elapsed;
    }

    // Animals & clan
    this.updateAnimals(simDt);
    this.updateCombat(simDt);
    this.updateClan(simDt);
    this.updateOutsiders(simDt);
    bondTick(this.clan.members.filter((m) => !m.isOutsider), simDt);

    this.updateHints(dt);

    // Hot spring warms and dries
    const spring = w.landmarks.find((l) => l.def.id === 'hot_spring');
    if (spring && hasCondition(p, 'cold') && spring.position.distanceTo(c.position) < 7) { cureCondition(p, 'cold'); this.hud.toast(t('toast.hotSpring'), 'good'); this.act('heal'); }

    // Ambient audio
    const biome = w.terrain.biomeAt(c.position.x, c.position.z);
    this.audio.update(dt, { night: this.clock.isNight ? 1 : 0, rain: w.sky.rain, fear: p.fear, inJungle: biome === 'jungle' ? 1 : biome === 'swamp' ? 0.5 : 0, underwater: false, timeScale: this.clock.timeScale });
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2);
    if (this.player.state !== 'dead') this.updateHud();
  }

  /** Contextual one-time hints for new players. */
  private updateHints(dt: number) {
    this.playTime += dt;
    this.hintTimer -= dt;
    if (this.hintTimer > 0) return;
    this.hintTimer = 4;
    const p = this.player;
    const w = this.world!;
    const hint = (id: string, cond: boolean, text: string) => {
      if (this.hintsShown.has(id) || !cond) return false;
      this.hintsShown.add(id);
      this.hud.toast(text, 'info');
      return true;
    };
    if (hint('senses', this.playTime > 25 && this.lineage.discoveries.length === 0, t('hint.senses'))) return;
    if (hint('neurons', this.lineage.neuronalEnergy >= 40 && p.neurons.length === 0, t('hint.neurons'))) return;
    if (hint('fear', p.fear > 45, t('hint.fear'))) return;
    if (hint('hunger', p.stats.hunger < 55, t('hint.hunger'))) return;
    if (hint('thirst', p.stats.thirst < 55, t('hint.thirst'))) return;
    if (hint('energy', p.stats.energy < 45, t('hint.energy'))) return;
    if (hint('tool', (p.held.left === 'stone_granite' || p.held.right === 'stone_granite') && !this.hasAbility('craft_grinder'), t('hint.tool'))) return;
    if (hint('stick', (p.held.left === 'stick' || p.held.right === 'stick') && !this.hasAbility('use_two_hands'), t('hint.stick'))) return;
    const babyNear = [...w.hominids.values()].some((h) => h.data.stage === 'baby' && h.rig.root.parent === w.scene && h.rig.root.position.distanceTo(this.controller!.position) < 12);
    if (hint('baby', babyNear && !p.carriedBaby && this.playTime > 60, t('hint.baby'))) return;
    if (hint('generation', this.lineage.generation === 1 && this.playTime > 600, t('hint.generation'))) return;
  }

  private onSurvivalEvent(ev: import('@/systems/survival').SurvivalEvent) {
    switch (ev.type) {
      case 'died': this.onPlayerDeath(causeText(ev.cause)); break;
      case 'condition_added': this.hud.toast(t('toast.conditionAdded', { condition: t(`cond.${ev.id}`) }), 'warn'); this.audio.play('hurt', 0.5); break;
      case 'condition_cured': this.hud.toast(t('toast.conditionCured', { condition: t(`cond.${ev.id}`) }), 'good'); this.act('heal'); break;
      case 'starving': if (this.stepCount % 200 === 0) this.hud.toast(t('toast.starving'), 'warn'); break;
      case 'dehydrated': if (this.stepCount % 200 === 0) this.hud.toast(t('toast.dehydrated'), 'warn'); break;
      case 'exhausted': break;
      case 'condition_worsened': break;
    }
  }

  private onPlayerDeath(cause: string) {
    const p = this.player;
    if (this.state === 'dead') return;
    p.state = 'dead';
    p.stats.health = 0;
    // drop babies
    for (const bid of carriedBabyIds(p)) { const b = findMember(this.clan, bid); if (b) b.position = { ...p.position }; }
    p.carriedBaby = null;
    this.syncBabyRigs();
    this.state = 'dead';
    this.audio.play('death');
    this.input.exitPointerLock();
    this.controller?.rig.update(0.1, 'dead', 0);
    this.events.emit('playerDied', { cause });
    const lost = isLineageLost({ ...this.clan, members: this.clan.members.filter((m) => !m.isOutsider && m.stage !== 'baby') });
    setTimeout(() => this.screens.showDeath(p, this.clan.members, lost, t('death.cause', { cause })), 1200);
  }

  // ---------------------------------------------------------------- sensing
  private buildSensables(radius: number): Sensable[] {
    const w = this.world!;
    const c = this.controller!;
    const out: Sensable[] = [];
    const px = c.position.x, pz = c.position.z;
    for (const it of w.items) {
      if (Math.abs(it.position.x - px) > radius || Math.abs(it.position.z - pz) > radius) continue;
      out.push({ uid: it.uid, kind: 'item', defId: `item:${it.id}`, position: { x: it.position.x, y: it.position.y, z: it.position.z }, known: isKnown(this.lineage, `item:${it.id}`), noise: 0, scent: ITEMS[it.id].category === 'food' ? 0.6 : 0.15 });
    }
    for (const pl of w.veg.nearby(px, pz, radius)) {
      const def = PLANTS[pl.plant];
      out.push({ uid: pl.uid, kind: 'plant', defId: `plant:${pl.plant}`, position: { x: pl.position.x, y: pl.position.y + 1, z: pl.position.z }, known: isKnown(this.lineage, `plant:${pl.plant}`), noise: pl.plant === 'beehive' ? 0.5 : 0, scent: def.yields ? 0.5 : 0.1 });
    }
    for (const a of w.animals) {
      if (Math.abs(a.data.position.x - px) > radius || Math.abs(a.data.position.z - pz) > radius) continue;
      const def = SPECIES[a.data.species];
      out.push({ uid: a.data.uid, kind: 'animal', defId: `animal:${a.data.species}`, position: { x: a.data.position.x, y: a.data.position.y + 0.8, z: a.data.position.z }, known: isKnown(this.lineage, `animal:${a.data.species}`), noise: a.data.alive ? animalNoise(a.data, def, a.out) : 0, scent: a.data.alive ? animalScent(def) : 0.9, hidden: a.out.state === 'stalk' && def.behavior === 'predator' && Math.hypot(a.data.position.x - px, a.data.position.z - pz) > 18 });
    }
    for (const [, h] of w.hominids) {
      if (h.data.id === this.clan.playerId || h.data.state === 'dead') continue;
      const pos = h.rig.root.getWorldPosition(new THREE.Vector3());
      if (Math.abs(pos.x - px) > radius || Math.abs(pos.z - pz) > radius) continue;
      out.push({ uid: h.data.id, kind: 'hominid', defId: h.data.isOutsider ? 'hominid:outsider' : `hominid:${h.data.id}`, position: { x: pos.x, y: pos.y + 1, z: pos.z }, known: !h.data.isOutsider || isKnown(this.lineage, 'hominid:outsider'), noise: 0.3, scent: 0.5 });
    }
    for (const l of w.landmarks) {
      if (Math.abs(l.position.x - px) > radius * 1.5 || Math.abs(l.position.z - pz) > radius * 1.5) continue;
      out.push({ uid: l.uid, kind: 'landmark', defId: `landmark:${l.def.id}`, position: { x: l.position.x, y: l.position.y + 4, z: l.position.z }, known: isKnown(this.lineage, `landmark:${l.def.id}`), noise: l.def.noise, scent: l.def.scent });
    }
    // water
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (let r = 4; r < 40; r += 4) {
        const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
        if (w.terrain.isWater(x, z)) { out.push({ uid: `water_${a}`, kind: 'water', defId: 'water', position: { x, y: WATER_LEVEL, z }, known: isKnown(this.lineage, 'water'), noise: 0.4, scent: 0.4 }); break; }
      }
    }
    return out;
  }

  private updateIntel(dt: number) {
    const c = this.controller!;
    if (!this.intel.active) { this.intel.detections = []; this.intel.focus = null; return; }
    const ranges = {
      sight: DEFAULT_SENSE_RANGES.sight * this.mods.sense.sight * (this.clock.isNight ? 0.6 : 1),
      smell: DEFAULT_SENSE_RANGES.smell * this.mods.sense.smell,
      hearing: DEFAULT_SENSE_RANGES.hearing * this.mods.sense.hearing,
    };
    const forward = c.cameraForward;
    const origin = { x: c.position.x, y: c.position.y + 1.2, z: c.position.z };
    const sensables = this.buildSensables(Math.max(ranges.sight, ranges.smell, ranges.hearing));
    this.intel.detections = detect(origin, { x: forward.x, y: 0, z: forward.z }, sensables, this.intel.sense, ranges, this.mods.abilities).slice(0, 40);
    this.intel.focus = focusTarget(this.intel.detections, { x: forward.x, y: 0, z: forward.z }, origin);
    // identify with LMB hold
    if (this.intel.focus && this.input.mouseDown(0)) {
      const f = this.intel.focus;
      if (f.canIdentify) {
        this.intel.identifyT += dt / 0.35;
        if (this.intel.identifyT >= 1) {
          this.intel.identifyT = 0;
          const [kind] = f.target.defId.split(':');
          const name = this.nameOf(f.target.defId);
          this.discover(f.target.defId, name, (kind === 'water' ? 'landmark' : kind) as never);
          if (f.target.kind === 'animal') {
            const a = this.world!.animals.find((x) => x.data.uid === f.target.uid);
            if (a && SPECIES[a.data.species].behavior === 'predator') this.hud.toast(t('toast.dangerous', { name }), 'warn');
          }
        }
      } else if (this.input.mouseJustPressed(0)) {
        if (this.intel.sense !== 'sight') this.hud.toast(t('toast.needSenseNeuron', { neuron: this.intel.sense === 'smell' ? localizedName('neuron', 'sen_smell', 'Scent Tracking') : localizedName('neuron', 'sen_hearing', 'Acute Hearing'), sense: t(`sense.by.${this.intel.sense}`) }), 'warn');
        else this.hud.toast(t('toast.getCloser'), 'info');
      }
    } else this.intel.identifyT = 0;
  }

  private nameOf(defId: string): string {
    const [kind, id] = defId.split(':');
    switch (kind) {
      case 'item': { const d = ITEMS[id as ItemId]; return d ? localizedName('item', id, d.name) : id; }
      case 'plant': { const d = PLANTS[id as keyof typeof PLANTS]; return d ? localizedName('plant', id, d.name) : id; }
      case 'animal': { const d = SPECIES[id as keyof typeof SPECIES]; return d ? localizedName('animal', id, d.name) : id; }
      case 'hominid': return id === 'outsider' ? t('target.outsiderHominid') : findMember(this.clan, id)?.name ?? t('target.hominid');
      case 'water': return t('target.freshWater');
      case 'landmark': { const d = LANDMARKS[id as LandmarkId]; return d ? localizedName('landmark', id, d.name) : id; }
    }
    return defId;
  }

  // ------------------------------------------------------------ interactions
  private currentTarget(): { kind: 'item' | 'plant' | 'animal' | 'hominid' | 'water' | 'settlement' | 'baby' | 'carcass'; ref: unknown; name: string; known: boolean; dist: number } | null {
    const w = this.world!;
    const c = this.controller!;
    const pos = c.position;
    const fwd = c.forward.clone();
    const R = 2.8;
    let best: ReturnType<Game['currentTarget']> = null;
    const consider = (kind: NonNullable<ReturnType<Game['currentTarget']>>['kind'], ref: unknown, p: THREE.Vector3, name: string, known: boolean, radius = R) => {
      const d = p.distanceTo(pos);
      if (d > radius) return;
      const dir = p.clone().sub(pos).setY(0).normalize();
      const align = d < 1.2 ? 1 : dir.dot(fwd);
      if (align < 0.2) return;
      const score = d - align;
      if (!best || score < best.dist) best = { kind, ref, name, known, dist: score };
    };
    for (const it of w.items) consider('item', it, it.position, localizedName('item', it.id, ITEMS[it.id].name), isKnown(this.lineage, `item:${it.id}`));
    for (const pl of w.veg.nearby(pos.x, pos.z, 6)) {
      const def = PLANTS[pl.plant];
      if (!def.yields) continue;
      const pp = pl.position.clone();
      if (pl.climbable) { pp.y = pl.climbable.position.y + pl.climbable.height; if (!c.canopy || c.canopy !== pl.climbable) continue; }
      consider('plant', pl, pp, localizedName('plant', def.id, def.name), isKnown(this.lineage, `plant:${pl.plant}`), pl.climbable ? 6 : 3.2);
    }
    for (const a of w.animals) {
      const ap = new THREE.Vector3(a.data.position.x, a.data.position.y + 0.5, a.data.position.z);
      consider(a.data.alive ? 'animal' : 'carcass', a, ap, localizedName('animal', a.data.species, SPECIES[a.data.species].name), isKnown(this.lineage, `animal:${a.data.species}`), a.data.alive ? 3.2 : 2.6);
    }
    for (const [, h] of w.hominids) {
      if (h.data.id === this.clan.playerId || h.data.state === 'dead') continue;
      if (h.data.stage === 'baby' && carriedBabyIds(this.player).includes(h.data.id)) continue;
      const hp = h.rig.root.getWorldPosition(new THREE.Vector3());
      consider(h.data.stage === 'baby' ? 'baby' : 'hominid', h, hp, h.data.isOutsider ? t('target.outsider') : h.data.name, true);
    }
    // water
    const ahead = pos.clone().addScaledVector(fwd, 1.5);
    if (w.terrain.heightAt(ahead.x, ahead.z) < WATER_LEVEL + 0.3 || c.isSwimming) consider('water', null, ahead, t('target.water'), isKnown(this.lineage, 'water'), 3);
    if (!best && pos.distanceTo(w.settlement) < 5) consider('settlement', null, w.settlement, t('target.settlement'), true, 5);
    return best;
  }

  private handleInteractions() {
    const tg = this.currentTarget();
    if (!tg) return;
    const input = this.input;
    const p = this.player;
    const c = this.controller!;
    const w = this.world!;
    if (!input.mouseJustPressed(0)) return;
    switch (tg.kind) {
      case 'item': {
        const it = tg.ref as WorldItem;
        const hand = this.freeHand();
        if (!hand) { this.hud.toast(t('toast.handsFullDrop'), 'info'); return; }
        p.held[hand] = it.id;
        w.removeItem(it);
        this.audio.play('pickup');
        this.act('pickup');
        if (!tg.known) this.discover(`item:${it.id}`, localizedName('item', it.id, ITEMS[it.id].name), 'item');
        w.syncHeld(this.playerEntity!);
        break;
      }
      case 'plant': {
        const pl = tg.ref as import('@/world/vegetation').PlantInstance;
        const def = PLANTS[pl.plant];
        if (!canHarvestPlant(def, p.held)) { this.hud.toast(t('toast.needStick', { name: localizedName('plant', def.id, def.name) }), 'info'); return; }
        if (pl.yieldsLeft <= 0) { this.hud.toast(t('toast.nothingLeftPlant', { name: localizedName('plant', def.id, def.name) }), 'info'); return; }
        const hand = this.freeHand();
        if (!hand) { this.hud.toast(t('toast.handsFull'), 'info'); return; }
        c.startAction('eat', 0.7);
        if (w.veg.harvest(pl) && def.yields) {
          p.held[hand] = def.yields;
          this.audio.play('pickup');
          this.act('pickup');
          if (!tg.known) this.discover(`plant:${pl.plant}`, localizedName('plant', def.id, def.name), 'plant');
          if (!isKnown(this.lineage, `item:${def.yields}`)) this.discover(`item:${def.yields}`, localizedName('item', def.yields, ITEMS[def.yields].name), 'item');
          if (pl.plant === 'beehive') {
            const bee = w.spawnAnimal('bee', { x: pl.position.x + 1, y: pl.position.y + 1.5, z: pl.position.z });
            provoke(bee.data, 1);
          }
          w.syncHeld(this.playerEntity!);
        }
        break;
      }
      case 'water': {
        c.startAction('drink', 1.2);
        drinkWater(p);
        this.audio.play('drink');
        this.act('drink');
        if (!tg.known) this.discover('water', t('target.freshWater'), 'landmark');
        break;
      }
      case 'animal': this.attackAnimal(tg.ref as AnimalEntity); break;
      case 'carcass': {
        const a = tg.ref as AnimalEntity;
        const hand = this.freeHand();
        if (!hand) { this.hud.toast(t('toast.handsFull'), 'info'); return; }
        if (!a.drops.length) { this.hud.toast(t('toast.nothingLeftCarcass'), 'info'); return; }
        const weapon = bestWeapon(p.held);
        const needTool = a.drops[0] === 'meat' && !(weapon && ['chopper', 'sharp_stick', 'bone_sharp', 'stone_obsidian'].includes(weapon)) && !this.hasAbility('eat_meat_raw');
        if (needTool && this.rng() < 0.6) { this.hud.toast(t('toast.toughHide'), 'info'); c.startAction('eat', 0.6); return; }
        const item = a.drops.shift()!;
        p.held[hand] = item;
        c.startAction('eat', 0.6);
        this.audio.play('pickup');
        this.act('pickup');
        if (!isKnown(this.lineage, `item:${item}`)) this.discover(`item:${item}`, localizedName('item', item, ITEMS[item].name), 'item');
        w.syncHeld(this.playerEntity!);
        break;
      }
      case 'hominid': {
        const h = tg.ref as HominidEntity;
        const d = h.data;
        c.startAction('groom', 1.4);
        if (d.isOutsider) {
          const food = this.heldFood();
          const r = recruitAction(d, food ? 'feed' : 'groom', { bondMult: this.player.neurons.includes('com_bond') ? 1.5 : 1 });
          if (food) { p.held[food] = null; w.syncHeld(this.playerEntity!); }
          this.act('groom');
          this.audio.play('call', 0.4);
          if (!isKnown(this.lineage, 'hominid:outsider')) this.discover('hominid:outsider', t('target.outsiderHominid'), 'animal');
          if (r.recruited) { this.hud.toast(t('toast.joins', { name: d.name }), 'good'); this.audio.play('unlock'); }
          else this.hud.toast(t('toast.trusts', { name: d.name, pct: Math.round(r.bond * 100) }), 'info');
        } else if (canMate(p, d) && d.bond >= 0.99 && p.bond >= 0.5 && !p.held.left && !p.held.right && this.nearSettlement(20)) {
          const used = new Set(this.clan.members.map((m) => m.name));
          const baby = mate(p, d, this.rng, used);
          baby.position = { ...p.position };
          this.clan.members.push(baby);
          w.addHominid(baby);
          this.act('mate');
          this.audio.play('unlock');
          this.hud.toast(t('toast.baby', { a: p.name, b: d.name, baby: baby.name }), 'good');
          this.syncBabyRigs();
        } else {
          d.bond = Math.min(1, d.bond + 0.15);
          p.bond = Math.min(1, p.bond + 0.1);
          this.act('groom');
          this.audio.play('call', 0.3);
          const hint = canMate(p, d) ? (this.nearSettlement(20) ? t('toast.groom.mateHere') : t('toast.groom.mateAtSettlement')) : '';
          this.hud.toast(t('toast.groom', { name: d.name, hint }), 'info');
        }
        break;
      }
      case 'baby': {
        const h = tg.ref as HominidEntity;
        if (p.stage !== 'adult' && p.stage !== 'elder') { this.hud.toast(t('toast.onlyAdultsCarry'), 'info'); return; }
        if (pickUpBaby(p, h.data, { carryTwo: this.hasAbility('carry_two_babies') })) {
          this.act('carry_baby');
          this.audio.play('pickup');
          this.hud.toast(t('toast.carry', { name: h.data.name }), 'good');
          this.syncBabyRigs();
        } else this.hud.toast(t('toast.alreadyCarry'), 'info');
        break;
      }
      case 'settlement': {
        const bid = dropBaby(p);
        if (bid) { const b = findMember(this.clan, bid); if (b) b.position = { ...p.position }; this.syncBabyRigs(); this.hud.toast(t('toast.babySetDown'), 'info'); }
        else this.hud.toast(t('toast.settlement'), 'info');
        break;
      }
    }
  }

  private freeHand(): 'left' | 'right' | null {
    const p = this.player;
    if (!p.held.right) return 'right';
    if (!p.held.left) return 'left';
    return null;
  }

  private heldFood(): 'left' | 'right' | null {
    const p = this.player;
    for (const s of ['right', 'left'] as const) if (p.held[s] && ITEMS[p.held[s]!].category === 'food' && ITEMS[p.held[s]!].nutrition) return s;
    return null;
  }

  private useHeld() {
    const p = this.player;
    const w = this.world!;
    const c = this.controller!;
    const consumable = (['right', 'left'] as const).find((s) => p.held[s] && (ITEMS[p.held[s]!].category === 'food' || ITEMS[p.held[s]!].category === 'medicine'));
    const side = consumable ?? (['right', 'left'] as const).find((s) => p.held[s]);
    if (!side) { this.hud.toast(t('toast.nothingInHand'), 'info'); return; }
    const id = p.held[side]!;
    const def = ITEMS[id];
    if (def.category === 'food' || def.category === 'medicine') {
      if (!def.nutrition && !def.cures) { this.hud.toast(t('toast.tooHard', { name: localizedName('item', def.id, def.name) }), 'info'); return; }
      const known = isKnown(this.lineage, `item:${id}`);
      const mods = this.survivalMods();
      const res = consume(p, { ...def, toxicity: (def.toxicity ?? 0) * (known ? 1 : 1.8) }, mods, this.rng);
      c.startAction('eat', 1.0);
      this.audio.play('eat');
      p.held[side] = null;
      w.syncHeld(this.playerEntity!);
      this.act('eat');
      if (res.healed.length) { this.hud.toast(t('toast.cured', { name: localizedName('item', def.id, def.name), conditions: res.healed.map((x) => t(`cond.${x}`)).join(', ') }), 'good'); this.act('heal'); }
      if (res.poisoned) this.hud.toast(t('toast.wasBad', { name: localizedName('item', def.id, def.name) }), 'warn');
      else if (!res.healed.length) this.hud.toast(t('toast.eat', { name: localizedName('item', def.id, def.name) }), 'info');
      if (!known) this.discover(`item:${id}`, localizedName('item', id, def.name), 'item');
      if (def.id === 'kapok_fiber' && hasCondition(p, 'cold')) cureCondition(p, 'cold');
      return;
    }
    if (def.category === 'tool' || def.category === 'material') {
      this.hud.toast(t('toast.holdToStrike', { name: localizedName('item', def.id, def.name) }), 'info');
    }
  }

  private craft() {
    const p = this.player;
    const w = this.world!;
    const c = this.controller!;
    const abilities = this.mods.abilities;
    if (p.held.left && p.held.right) {
      const check = canCombine(p.held.left, p.held.right, abilities);
      if (!check.ok) {
        if (check.reason === 'ability') this.hud.toast(t('toast.lackSkill', { ability: check.recipe?.ability ? t(`ability.${check.recipe.ability}`) : '' }), 'info');
        else this.hud.toast(t('toast.noCombine'), 'info');
        return;
      }
      const r = combine(p.held, abilities);
      if (r.ok && r.result) {
        c.startAction('attack', 0.8);
        p.held = r.held;
        this.audio.play('craft');
        this.act('craft');
        this.hud.toast(t('toast.made', { name: localizedName('item', r.result, ITEMS[r.result].name) }), 'good');
        if (!isKnown(this.lineage, `item:${r.result}`)) this.discover(`item:${r.result}`, localizedName('item', r.result, ITEMS[r.result].name), 'item');
        w.syncHeld(this.playerEntity!);
      }
      return;
    }
    const side = (['right', 'left'] as const).find((s) => p.held[s]);
    if (!side) { this.hud.toast(t('toast.holdToAlter'), 'info'); return; }
    const id = p.held[side]!;
    if (!canAlter(id, abilities)) {
      const alt = alter(id, new Set(['alter_stick', 'craft_grinder', 'alter_stone', 'craft_chopper', 'use_two_hands']));
      this.hud.toast(alt ? t('toast.couldAlter', { name: localizedName('item', id, ITEMS[id].name) }) : t('toast.cannotAlter', { name: localizedName('item', id, ITEMS[id].name) }), 'info');
      return;
    }
    const result = alter(id, abilities)!;
    c.startAction('attack', 0.8);
    p.held[side] = result;
    this.audio.play('craft');
    this.act('alter');
    this.hud.toast(t('toast.altered', { name: localizedName('item', result, ITEMS[result].name) }), 'good');
    if (!isKnown(this.lineage, `item:${result}`)) this.discover(`item:${result}`, localizedName('item', result, ITEMS[result].name), 'item');
    w.syncHeld(this.playerEntity!);
  }

  private drop(side: 'left' | 'right') {
    const p = this.player;
    const w = this.world!;
    const c = this.controller!;
    const id = p.held[side];
    if (!id) return;
    p.held[side] = null;
    const f = c.forward;
    w.spawnItem(id, { x: c.position.x + f.x * 0.8, y: c.position.y, z: c.position.z + f.z * 0.8 });
    this.audio.play('drop');
    w.syncHeld(this.playerEntity!);
  }

  private callOrIntimidate() {
    const w = this.world!;
    const c = this.controller!;
    const p = this.player;
    const threat = w.animals.find((a) => a.data.alive && (a.out.state === 'stalk' || a.out.state === 'attack') && Math.hypot(a.data.position.x - c.position.x, a.data.position.z - c.position.z) < 14 && SPECIES[a.data.species].behavior !== 'prey');
    if (threat) {
      if (!this.hasAbility('intimidate')) { this.hud.toast(t('toast.screamNotImpressed'), 'warn'); this.audio.play('call'); return; }
      c.startAction('attack', 0.9);
      const clanNear = [...w.hominids.values()].filter((h) => !h.data.isOutsider && h.data.id !== p.id && h.data.stage !== 'baby' && h.rig.root.position.distanceTo(c.position) < 12).length;
      const ok = tryIntimidate(SPECIES[threat.data.species], clanNear, this.mods.abilities, bestWeapon(p.held), this.rng);
      this.audio.play('roar', 0.5);
      this.act('intimidate');
      if (ok) {
        threat.data.ai.state = 'flee';
        threat.data.ai.fleeUntil = 8;
        threat.data.ai.targetId = null;
        this.hud.toast(t('toast.backsOff', { name: localizedName('animal', threat.data.species, SPECIES[threat.data.species].name) }), 'good');
        addDopamine(p, 10);
      } else this.hud.toast(t('toast.notAfraid'), 'warn');
      return;
    }
    if (performance.now() - this.lastCall < 1500) return;
    this.lastCall = performance.now();
    this.audio.play('call');
    this.act('call');
    let n = 0;
    for (const [, h] of w.hominids) {
      if (h.data.id === p.id || h.data.isOutsider || h.data.stage === 'baby' || h.data.state === 'dead') continue;
      if (h.rig.root.position.distanceTo(c.position) < 45) { h.following = !h.following || !this.hasAbility('communicate_call') ? this.hasAbility('communicate_call') : h.following; if (this.hasAbility('communicate_call')) n++; }
    }
    if (!this.hasAbility('communicate_call')) this.hud.toast(t('toast.callNoNeuron'), 'info');
    else this.hud.toast(n ? t('toast.callFollow', { n }) : t('toast.callNoOne'), 'info');
  }

  // -------------------------------------------------------------------- combat
  private attackAnimal(a: AnimalEntity) {
    const c = this.controller!;
    c.startAction('attack', 0.6);
    this.pendingTarget = a;
  }
  private pendingTarget: AnimalEntity | null = null;

  private resolvePlayerAttack() {
    const a = this.pendingTarget;
    this.pendingTarget = null;
    if (!a || !a.data.alive) return;
    const p = this.player;
    const c = this.controller!;
    if (Math.hypot(a.data.position.x - c.position.x, a.data.position.z - c.position.z) > 3.4) { this.audio.play('dodge', 0.2); return; }
    const weapon = bestWeapon(p.held);
    const isCounter = this.combat.counterWindow > 0;
    const res = attackAnimal(a.data.health, weapon, isCounter, this.mods.abilities);
    const dmg = res.damage * (p.stage === 'child' ? 0.5 : p.stage === 'elder' ? 0.8 : 1);
    const killed = damageAnimal(a.data, dmg);
    provoke(a.data, 0.8);
    this.audio.play('hit');
    this.act('attack');
    this.combat.counterWindow = 0;
    if (weapon && toolBreaks(weapon, this.rng, this.player.neurons.includes('int_tools') ? 0.5 : 1)) {
      const side = p.held.right === weapon ? 'right' : 'left';
      p.held[side] = null;
      this.world!.syncHeld(this.playerEntity!);
      this.audio.play('break');
      this.hud.toast(t('toast.weaponBroke', { name: localizedName('item', weapon, ITEMS[weapon].name) }), 'warn');
    }
    if (killed) this.onAnimalKilled(a);
    else if (!isKnown(this.lineage, `animal:${a.data.species}`)) this.discover(`animal:${a.data.species}`, localizedName('animal', a.data.species, SPECIES[a.data.species].name), 'animal');
  }

  private onAnimalKilled(a: AnimalEntity) {
    const def = SPECIES[a.data.species];
    a.rig.setDead();
    a.corpseTimer = 240;
    a.telegraph = null;
    if (this.combat.telegraph?.attacker === a) this.combat.telegraph = null;
    this.hud.toast(t('toast.killed', { name: localizedName('animal', def.id, def.name) }), 'good');
    this.audio.play('roar', 0.3);
    this.act('kill');
    addDopamine(this.player, 15);
    if (!isKnown(this.lineage, `animal:${a.data.species}`)) this.discover(`animal:${a.data.species}`, localizedName('animal', def.id, def.name), 'animal');
  }

  private updateAnimals(dt: number) {
    const w = this.world!;
    const c = this.controller!;
    const p = this.player;
    const targets = [{ id: p.id, position: { x: c.position.x, y: c.position.y, z: c.position.z }, isBaby: false, noise: c.state === 'run' ? 1 : c.state === 'walk' ? 0.4 : 0.1, fear: p.fear / 100 }];
    for (const [, h] of w.hominids) {
      if (h.data.id === p.id || h.data.state === 'dead') continue;
      if (h.data.stage === 'baby' && h.rig.root.parent !== w.scene) continue;
      const pos = h.rig.root.position;
      targets.push({ id: h.data.id, position: { x: pos.x, y: pos.y, z: pos.z }, isBaby: h.data.stage === 'baby', noise: h.speed > 3 ? 0.8 : 0.3, fear: 0 });
    }
    const ctx = { dt, targets, timeOfDay: this.clock.timeOfDay, rng: this.rng, isWater: (v: { x: number; z: number }) => w.terrain.isWater(v.x, v.z) };
    for (const a of w.animals) {
      const def = SPECIES[a.data.species];
      const d2 = (a.data.position.x - c.position.x) ** 2 + (a.data.position.z - c.position.z) ** 2;
      if (!a.data.alive) {
        a.corpseTimer -= dt;
        if (a.corpseTimer <= 0 && d2 > 40 * 40) { w.removeAnimal(a); }
        continue;
      }
      if (d2 > 220 * 220) { a.rig.root.visible = false; continue; }
      a.rig.root.visible = true;
      const out = updateAnimalAI(a.data, def, ctx);
      // Only chase the player's clan, keep the AI target valid
      applyMovement(a.data, out, dt);
      a.out = out;
      // terrain / water height
      const gh = w.terrain.heightAt(a.data.position.x, a.data.position.z);
      if (def.flying) a.data.position.y = lerp(a.data.position.y, Math.max(gh, WATER_LEVEL) + (out.state === 'attack' ? 1.2 : def.id === 'bee' ? 1.4 : 7 + Math.sin(this.clock.elapsed + a.data.home.x) * 2), dt * 2);
      else if (def.aquatic) a.data.position.y = Math.max(gh, WATER_LEVEL - 0.4);
      else if (gh < WATER_LEVEL - 1.5 && def.id !== 'crocodile') { a.data.position.x = a.data.home.x + (a.data.position.x - a.data.home.x) * 0.9; a.data.position.z = a.data.home.z + (a.data.position.z - a.data.home.z) * 0.9; a.data.position.y = w.terrain.heightAt(a.data.position.x, a.data.position.z); }
      else a.data.position.y = gh;
      a.rig.root.position.set(a.data.position.x, a.data.position.y, a.data.position.z);
      const targetYaw = Math.atan2(Math.cos(a.data.heading), Math.sin(a.data.heading));
      const cur = a.rig.root.rotation.y;
      let dy = targetYaw - cur; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      a.rig.root.rotation.y = cur + dy * Math.min(1, dt * 6);
      a.rig.update(dt, out.speed, out.state);
      // sounds
      a.soundCooldown -= dt;
      if (out.sound && a.soundCooldown <= 0 && d2 < 60 * 60) {
        a.soundCooldown = 3 + this.rng() * 4;
        const dist = Math.sqrt(d2);
        const pan = clamp((a.data.position.x - c.position.x) / 30, -1, 1) * Math.cos(c.camYaw);
        this.audio.play(out.sound, clamp(1 - dist / 60, 0.1, 1), pan);
      }
      // attacks
      if (out.wantsAttack) {
        if (out.wantsAttack.targetId === p.id) {
          if (!this.combat.telegraph && !a.telegraph) {
            const t = startAttack(def, this.rng);
            a.telegraph = t;
            this.combat.telegraph = { attacker: a, t };
            this.combat.dodgeInput = null;
            this.audio.play(def.behavior === 'predator' ? 'roar' : 'snarl', 0.6);
            this.events.emit('attackWarning', { species: def.id });
          }
        } else {
          // attack a clan member
          const h = w.hominids.get(out.wantsAttack.targetId);
          if (h && h.data.state !== 'dead' && this.rng() < 0.7) {
            const died = applyDamage(h.data, hitDamage(def, h.data.maxStats.health) * 0.6, def.inflicts);
            if (h.data.stage === 'baby' && def.id === 'eagle') { h.data.stats.health = 0; }
            if (died || h.data.stats.health <= 0) { h.data.state = 'dead'; h.rig.update(0.1, 'dead', 0); this.hud.toast(t('toast.memberKilled', { member: h.data.name, name: localizedName('animal', def.id, def.name) }), 'warn'); }
            else if (d2 < 40 * 40) this.hud.toast(t('toast.memberAttacked', { member: h.data.name, name: localizedName('animal', def.id, def.name) }), 'warn');
          }
        }
      }
    }
  }

  private updateCombat(dt: number) {
    const cb = this.combat;
    const p = this.player;
    const c = this.controller!;
    cb.counterWindow = Math.max(0, cb.counterWindow - dt);
    if (!cb.telegraph) return;
    const { attacker, t: tele } = cb.telegraph;
    const def = SPECIES[attacker.data.species];
    if (!attacker.data.alive) { cb.telegraph = null; attacker.telegraph = null; return; }
    const dist = Math.hypot(attacker.data.position.x - c.position.x, attacker.data.position.z - c.position.z);
    if (tickTelegraph(tele, dt) === 'strike') {
      attacker.telegraph = null;
      cb.telegraph = null;
      if (dist > def.attackRange + 2.5 || c.isClimbing || (c.canopy && !def.flying)) { return; }
      const outcome = resolveDodge(tele, cb.dodgeInput, this.mods.dodgeWindow);
      if (dodgeIsHit(outcome)) {
        const dmg = hitDamage(def, p.maxStats.health, p.stage === 'child' ? 1.4 : 1);
        const died = applyDamage(p, dmg, def.inflicts, 0.5);
        this.damageFlash = 1;
        c.shake = 0.6;
        this.audio.play('hurt');
        p.fear = Math.min(100, p.fear + 12);
        this.hud.toast(t('toast.hitsYou', { name: localizedName('animal', def.id, def.name) }) + (def.inflicts ? t('toast.youAre', { condition: t(`cond.${def.inflicts}`) }) : ''), 'warn');
        if (died) this.onPlayerDeath(t('cause.killedBy', { name: localizedName('animal', def.id, def.name) }));
        // eagle snatches carried baby
        if (def.id === 'eagle' && carriedBabyIds(p).length && this.rng() < 0.3) {
          const bid = dropBaby(p);
          const b = bid ? findMember(this.clan, bid) : null;
          if (b) { b.state = 'dead'; this.hud.toast(t('toast.eagleTook', { name: b.name }), 'warn'); this.world!.removeHominid(b.id); }
        }
      } else {
        this.act('dodge');
        addDopamine(p, 5);
        this.audio.play('dodge');
        if (dodgeAllowsCounter(outcome) && this.hasAbility('counter_attack')) { cb.counterWindow = 1.4; this.hud.toast(t('toast.perfectCounter'), 'good'); }
        else this.hud.toast(outcome === 'perfect' ? t('toast.perfectDodge') : t('toast.dodged'), 'good');
        if (cb.counterWindow > 0) this.pendingTarget = attacker;
      }
    }
  }

  // ----------------------------------------------------------------- clan NPCs
  private updateClan(dt: number) {
    const w = this.world!;
    const c = this.controller!;
    const p = this.player;
    for (const [id, h] of w.hominids) {
      const d = h.data;
      if (id === p.id) continue;
      if (d.state === 'dead') { h.rig.update(dt, 'dead', 0); continue; }
      if (d.stage === 'baby') {
        if (h.rig.root.parent !== w.scene) { h.rig.update(dt, 'idle', 0); continue; }
        // babies crawl toward the nearest adult a bit
        h.rig.update(dt, 'idle', 0);
        d.position = { x: h.rig.root.position.x, y: h.rig.root.position.y, z: h.rig.root.position.z };
        continue;
      }
      // NPC survival (gentle): passive drain, auto-restore at settlement
      if (!d.isOutsider) {
        d.stats.hunger = Math.max(0, d.stats.hunger - dt * 0.05);
        d.stats.thirst = Math.max(0, d.stats.thirst - dt * 0.06);
        if (h.rig.root.position.distanceTo(w.settlement) < 15) {
          d.stats.hunger = Math.min(d.maxStats.hunger, d.stats.hunger + dt * 0.5);
          d.stats.thirst = Math.min(d.maxStats.thirst, d.stats.thirst + dt * 0.5);
          d.stats.health = Math.min(d.maxStats.health, d.stats.health + dt * 0.3);
        }
        if (d.stats.hunger <= 0 || d.stats.thirst <= 0) d.stats.health = Math.max(1, d.stats.health - dt * 0.2);
        d.conditions = d.conditions.filter((cd) => { cd.time += dt; return cd.time < 240; });
      }
      const pos = h.rig.root.position;
      const night = this.clock.isNight;
      let target: THREE.Vector3 | null = null;
      let run = false;
      if (h.following && !d.isOutsider) {
        const dist = pos.distanceTo(c.position);
        if (dist > 3.5) { target = c.position; run = dist > 12; }
        if (dist > 80) h.following = false;
      } else if (night && !d.isOutsider) {
        if (pos.distanceTo(w.settlement) > 4) target = w.settlement;
        else { h.rig.update(dt, 'sleep', 0); d.state = 'sleep'; continue; }
      } else {
        h.wanderTimer -= dt;
        if (h.wanderTimer <= 0) {
          h.wanderTimer = 5 + this.rng() * 8;
          const home = d.isOutsider ? new THREE.Vector3(d.position.x, 0, d.position.z) : w.settlement;
          const a = this.rng() * Math.PI * 2, r = this.rng() * (d.isOutsider ? 20 : 14);
          h.target = new THREE.Vector3(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
          if (d.isOutsider && pos.distanceTo(c.position) < 25 && d.bond > 0.3) h.target = c.position.clone();
        }
        target = h.target;
        // flee predators
        const threat = w.animals.find((a) => a.data.alive && SPECIES[a.data.species].behavior === 'predator' && Math.hypot(a.data.position.x - pos.x, a.data.position.z - pos.z) < 12);
        if (threat) { target = pos.clone().sub(new THREE.Vector3(threat.data.position.x, 0, threat.data.position.z)).setY(0).normalize().multiplyScalar(20).add(pos); run = true; }
      }
      let speed = 0;
      if (target) {
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.2) {
          const sp = (run ? 6 : 2.8) * (d.stage === 'child' ? 0.8 : d.stage === 'elder' ? 0.7 : 1);
          const step = Math.min(dist, sp * dt);
          const nx = pos.x + (dx / dist) * step, nz = pos.z + (dz / dist) * step;
          if (!w.terrain.isWater(nx, nz) && w.terrain.slopeAt(nx, nz) < 0.5) {
            pos.x = nx; pos.z = nz;
            h.rig.root.rotation.y = Math.atan2(dx, dz);
            speed = sp;
          } else { h.wanderTimer = 0; }
        }
      }
      pos.y = w.terrain.heightAt(pos.x, pos.z);
      h.speed = speed;
      d.state = speed > 4 ? 'run' : speed > 0 ? 'walk' : 'idle';
      h.rig.update(dt, d.state, speed);
      d.position = { x: pos.x, y: pos.y, z: pos.z };
    }
  }

  private updateOutsiders(dt: number) {
    this.outsiderTimer -= dt;
    if (this.outsiderTimer > 0) return;
    this.outsiderTimer = 400 + this.rng() * 400;
    const w = this.world!;
    const outsiders = this.clan.members.filter((m) => m.isOutsider && m.state !== 'dead').length;
    if (outsiders >= 2) return;
    const c = this.controller!;
    const a = this.rng() * Math.PI * 2, r = 60 + this.rng() * 50;
    const x = c.position.x + Math.cos(a) * r, z = c.position.z + Math.sin(a) * r;
    if (w.terrain.isWater(x, z) || Math.abs(x) > 520 || Math.abs(z) > 520) return;
    const o = createOutsider(this.rng, { x, y: w.terrain.heightAt(x, z), z });
    this.clan.members.push(o);
    w.addHominid(o);
  }

  // ------------------------------------------------------- sleep & generation
  private trySleep() {
    const p = this.player;
    if (!this.nearSettlement(12) && !this.hasAbility('sleep_anywhere')) { this.hud.toast(t('toast.sleepAtSettlement'), 'info'); return; }
    if (p.stats.energy > p.maxStats.energy * 0.8 && !this.clock.isNight) { this.hud.toast(t('toast.notTired'), 'info'); return; }
    this.sleepUntil = 0.27;
    this.controller!.startAction('sleep', 9999);
    this.audio.play('sleep');
    this.hud.toast(t('toast.sleep'), 'info');
    if (this.clock.timeOfDay > 0.27) { /* sleep through night: wrap */ }
  }

  private tryGeneration() {
    if (!this.nearSettlement(15)) { this.hud.toast(t('toast.returnForGeneration'), 'info'); return; }
    const members = this.clan.members.filter((m) => !m.isOutsider && m.state !== 'dead');
    const offspring = members.filter((m) => m.stage === 'baby' || m.stage === 'child').length;
    const adults = members.filter((m) => m.stage === 'adult').length;
    const unre = members.reduce((n, m) => n + m.neurons.filter((x) => !m.reinforced.includes(x) && !m.genetic.includes(x)).length, 0);
    const since = this.featsSinceLeap();
    const leap = computeLeap(this.lineage, since).yearsAdvanced;
    this.state = 'generation';
    this.input.exitPointerLock();
    this.screens.showGeneration({
      lineage: this.lineage, offspring, adults, unreinforced: unre, feats: since.length, yearsLeap: leap,
      onGeneration: () => this.doGeneration(false),
      onLeap: () => this.doGeneration(true),
      onClose: () => this.resume(),
    });
  }

  private featsSinceLeap() {
    const idx = this.lineage.featsAtLastLeap ?? 0;
    return this.lineage.feats.slice(idx).map((id) => FEAT_MAP[id]).filter(Boolean);
  }

  private doGeneration(leap: boolean) {
    const w = this.world!;
    this.save();
    // sync positions
    for (const [id, ent] of w.hominids) { const d = findMember(this.clan, id); if (d) d.position = { x: ent.rig.root.position.x, y: ent.rig.root.position.y, z: ent.rig.root.position.z }; }
    const outsiders = this.clan.members.filter((m) => m.isOutsider);
    this.clan.members = this.clan.members.filter((m) => !m.isOutsider);
    let lines: string[] = [];
    try {
      let res;
      if (leap) {
        const since = this.featsSinceLeap();
        const r = evolutionLeap(this.clan, this.lineage, this.rng, since);
        this.lineage.featsAtLastLeap = this.lineage.feats.length;
        res = r.generation;
        lines.push(t('gen.line.leap', { years: r.yearsAdvanced.toLocaleString(locale()), yearsAgo: this.lineage.yearsAgo.toLocaleString(locale()) }));
      } else {
        res = generationChange(this.clan, this.lineage, this.rng);
        lines.push(t('gen.line.years', { generation: this.lineage.generation }));
      }
      if (res.died.length) lines.push(t('gen.line.died', { names: res.died.map((id) => this.nameFromAny(id)).join(', ') }));
      if (res.matured.length) lines.push(t('gen.line.matured', { names: res.matured.map((id) => this.nameFromAny(id)).join(', ') }));
      for (const m of res.mutations) lines.push(t('gen.line.mutation', { name: this.nameFromAny(m.hominidId), neuron: NEURON_MAP[m.neuron] ? localizedName('neuron', m.neuron, NEURON_MAP[m.neuron].name) : m.neuron }));
      const lost = res.lostNeurons.reduce((n, l) => n + l.neurons.length, 0);
      if (lost) lines.push(t('gen.line.forgotten', { n: lost }));
      lines.push(t('gen.line.newPlayer', { name: this.nameFromAny(res.newPlayerId) }));
    } catch (e) {
      lines = [`${(e as Error).message === 'no_offspring' ? t('gen.line.noOffspring') : String(e)}`];
      this.clan.members.push(...outsiders);
      this.screens.showGenerationResult({ title: t('gen.result.notYet'), lines, onClose: () => this.resume() });
      return;
    }
    this.clan.members.push(...outsiders);
    // rebuild entities
    for (const id of [...w.hominids.keys()]) w.removeHominid(id);
    for (const m of this.clan.members) {
      if (m.state === 'dead') continue;
      m.position = { x: w.settlement.x + (this.rng() - 0.5) * 6, y: 0, z: w.settlement.z + (this.rng() - 0.5) * 6 };
      if (m.isOutsider) m.position = { x: w.settlement.x + 60, y: 0, z: w.settlement.z + 30 };
      const ent = w.addHominid(m);
      w.syncHeld(ent);
    }
    this.attachPlayer();
    this.clock.timeOfDay = 0.3;
    this.clock.dayCount += 1;
    this.audio.play('evolve');
    this.events.emit('generation', { generation: this.lineage.generation });
    this.save();
    const won = hasWon(this.lineage);
    this.screens.showGenerationResult({
      title: leap ? t('gen.result.leap') : t('gen.result.new'),
      lines,
      onClose: () => { if (won) { this.state = 'win'; this.screens.showWin(this.lineage); } else this.resume(); },
    });
  }

  private nameFromAny(id: string): string {
    return findMember(this.clan, id)?.name ?? id;
  }

  // --------------------------------------------------------------------- HUD
  private updateHud() {
    const w = this.world!;
    const c = this.controller!;
    const p = this.player;
    const markers: HudMarker[] = [];
    if (this.intel.active) {
      const v = new THREE.Vector3();
      const perDef = new Map<string, number>();
      for (const d of this.intel.detections) {
        // de-clutter: at most 3 markers per thing kind unless focused; unknown ones first (sorted by distance already)
        const n = perDef.get(d.target.defId) ?? 0;
        if (n >= 3 && d !== this.intel.focus) continue;
        perDef.set(d.target.defId, n + 1);
        v.set(d.target.position.x, d.target.position.y, d.target.position.z).project(this.camera);
        const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        markers.push({
          x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight,
          sense: this.intel.sense, known: d.target.known,
          label: d.target.known ? this.nameOf(d.target.defId) : t('prompt.unknown', { kind: t(`kind.${d.target.kind}`) }),
          focus: d === this.intel.focus, visible,
        });
      }
    }
    let prompt: HudData['prompt'] = null;
    if (this.intel.active) {
      const f = this.intel.focus;
      prompt = f ? { target: f.target.known ? this.nameOf(f.target.defId) : t('prompt.unknown', { kind: t(`kind.${f.target.kind}`) }), unknown: !f.target.known, actions: f.canIdentify ? [{ key: t('key.lmb'), label: t('prompt.identify') }] : [{ key: '', label: this.intel.sense === 'sight' ? t('prompt.getCloser') : t('prompt.needNeuron') }] }
        : { target: this.intel.sense === 'sight' ? t('prompt.looking') : this.intel.sense === 'smell' ? t('prompt.smelling') : t('prompt.listening'), unknown: false, actions: [{ key: 'E', label: t('prompt.smell') }, { key: 'R', label: t('prompt.listen') }] };
    } else if (!c.isBusy) {
      const tg = this.currentTarget();
      if (tg) {
        const actions: { key: string; label: string }[] = [];
        switch (tg.kind) {
          case 'item': actions.push({ key: t('key.lmb'), label: t('prompt.pickup') }); break;
          case 'plant': actions.push({ key: t('key.lmb'), label: t('prompt.harvest') }); break;
          case 'water': actions.push({ key: t('key.lmb'), label: t('prompt.drink') }); break;
          case 'animal': actions.push({ key: t('key.lmb'), label: t('prompt.attack') }, { key: t('key.rmb'), label: t('prompt.dodge') }, { key: 'C', label: t('prompt.intimidate') }); break;
          case 'carcass': actions.push({ key: t('key.lmb'), label: t('prompt.takeMeat') }); break;
          case 'hominid': actions.push({ key: t('key.lmb'), label: (tg.ref as HominidEntity).data.isOutsider ? t('prompt.groomOffer') : t('prompt.groom') }); break;
          case 'baby': actions.push({ key: t('key.lmb'), label: t('prompt.carry') }); break;
          case 'settlement': actions.push({ key: 'N', label: t('prompt.sleep') }, { key: 'G', label: t('prompt.generation') }, { key: t('key.lmb'), label: t('prompt.setBabyDown') }); break;
        }
        prompt = { target: tg.known ? tg.name : t('prompt.unknown', { kind: t(`kind.${tg.kind}`) }), unknown: !tg.known, actions };
      }
    }
    const held = p.held.right ?? p.held.left;
    if (!prompt && held && !c.isBusy) prompt = { target: localizedName('item', held, ITEMS[held].name), unknown: false, actions: [{ key: 'E', label: t('prompt.use') }, { key: '1', label: t('prompt.alter') }] };

    const night = this.clock.isNight ? 1 : 0;
    const data: HudData = {
      player: p, time: this.clock.hourLabel, day: this.clock.dayCount, energy: this.lineage.neuronalEnergy,
      yearsAgo: this.lineage.yearsAgo, generation: this.lineage.generation, progress: lineageProgress(this.lineage),
      clanAlive: livingMembers(this.clan).filter((m) => !m.isOutsider).length,
      prompt, markers,
      overlays: { fear: isPanicking(p) ? 0.9 : p.fear / 140, damage: this.damageFlash, intel: this.intel.active ? 1 : 0, night: night * 0.6, underwater: 0 },
      identifyProgress: this.intel.identifyT > 0 ? this.intel.identifyT : null,
      combatPrompt: this.combat.telegraph ? 'DODGE!' : this.combat.counterWindow > 0 ? 'COUNTER!' : null,
      intelMode: this.intel.active, activeSense: this.intel.sense,
      carriedBabies: carriedBabyIds(p).length,
      fps: this.fps,
      overcome: this.overcome ? { found: this.overcome.found, needed: this.overcome.lightsNeeded, timeLeft: this.overcome.timeLeft } : null,
    };
    this.hud.update(data);
    void w;
  }

  /** Snapshot for automated tests. */
  snapshot() {
    const p = this.clan.members.length ? this.player : null;
    return {
      state: this.state,
      player: p ? { id: p.id, name: p.name, stats: { ...p.stats }, position: { ...p.position }, fear: p.fear, held: { ...p.held }, neurons: [...p.neurons], conditions: p.conditions.map((c) => c.id), state: p.state } : null,
      lineage: { energy: this.lineage.neuronalEnergy, discoveries: [...this.lineage.discoveries], areas: this.lineage.areasExplored.length, yearsAgo: this.lineage.yearsAgo, generation: this.lineage.generation, feats: [...this.lineage.feats], actionCounts: { ...this.lineage.actionCounts } },
      clan: this.clan.members.map((m) => ({ id: m.id, name: m.name, stage: m.stage, state: m.state, isPlayer: m.isPlayer, isOutsider: m.isOutsider })),
      animals: this.world?.animals.length ?? 0,
      items: this.world?.items.length ?? 0,
      time: this.clock.timeOfDay,
      day: this.clock.dayCount,
      fps: this.fps,
      intel: { active: this.intel.active, sense: this.intel.sense, detections: this.intel.detections.length },
      settlement: this.world ? { x: this.world.settlement.x, y: this.world.settlement.y, z: this.world.settlement.z } : null,
      controller: this.controller ? { state: this.controller.state, grounded: this.controller.grounded, climbing: this.controller.isClimbing, pos: this.controller.position.toArray() } : null,
    };
  }

  /** Automation helpers (used by e2e tests). */
  readonly api = {
    newGame: (seed?: number, withIntro = false) => this.newGame(seed, withIntro),
    startIntro: () => this.startIntro(),
    skipIntro: () => this.intro?.skip(),
    press: (a: Parameters<Input['press']>[0]) => this.input.press(a),
    release: (a: Parameters<Input['release']>[0]) => this.input.release(a),
    click: (b: number) => this.input.clickMouse(b),
    teleport: (x: number, z: number) => this.controller?.teleport(x, z),
    giveItem: (id: ItemId, side: 'left' | 'right' = 'right') => { this.player.held[side] = id; this.world?.syncHeld(this.playerEntity!); },
    addEnergy: (n: number) => { this.lineage.neuronalEnergy += n; },
    spawnAnimal: (species: keyof typeof SPECIES, dx: number, dz: number) => { const c = this.controller!; const x = c.position.x + dx, z = c.position.z + dz; return this.world!.spawnAnimal(species, { x, y: this.world!.terrain.heightAt(x, z), z }).data.uid; },
    spawnItem: (id: ItemId, dx: number, dz: number) => { const c = this.controller!; return this.world!.spawnItem(id, { x: c.position.x + dx, y: 0, z: c.position.z + dz }).uid; },
    setStat: (k: 'health' | 'energy' | 'hunger' | 'thirst', v: number) => { this.player.stats[k] = v; },
    setFear: (v: number) => { this.player.fear = v; },
    recordAction: (a: ActionId, n: number) => recordAction(this.lineage, a, n),
    save: () => this.save(),
    unlock: (id: string) => this.unlock(id),
    setTime: (t: number) => { this.clock.timeOfDay = t; },
    /** Deterministically advance the simulation by n fixed steps (for automated tests). */
    step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { if (this.state === 'playing' && this.world && this.controller) this.simulate(dt); else this.handleOverlayKeys(); this.input.endFrame(); } },
    applyCondition: (id: 'bleeding' | 'poisoned' | 'fractured' | 'cold' | 'exhausted') => applyCondition(this.player, id, 0.5),
    goToSettlement: () => { const s = this.world!.settlement; this.controller?.teleport(s.x + 2, s.z + 2); },
    nearestItemId: () => this.world?.nearestItem(this.controller!.position, 4)?.id ?? null,
    faceSettlement: () => { const s = this.world!.settlement; const c = this.controller!; c.yaw = Math.atan2(s.x - c.position.x, s.z - c.position.z); c.camYaw = c.yaw; },
    face: (x: number, z: number) => { const c = this.controller!; c.yaw = Math.atan2(x - c.position.x, z - c.position.z); c.camYaw = c.yaw; },
    pauseSim: (v: boolean) => { this.state = v ? 'paused' : 'playing'; },
    isAlive: (uid: string) => this.world?.animals.find((a) => a.data.uid === uid)?.data.alive ?? false,
    dtBoost: () => aiIsNight(this.clock.timeOfDay),
  };
}
