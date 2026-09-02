import * as THREE from 'three';
import type { HominidData, ItemId, SpeciesId, Vec3, BiomeId } from '@/core/types';
import { Terrain, WATER_LEVEL, WORLD_SIZE } from './terrain';
import { Vegetation } from './vegetation';
import { Sky } from './sky';
import { Water } from './water';
import { Rain } from './rain';
import { AnimalRig, HominidRig, makeItemMesh, mat } from '@/render/models';
import { SPECIES, SPECIES_LIST } from '@/data/species';
import { createAnimal, type AnimalData, type AIOutput } from '@/systems/animalAI';
import type { AttackTelegraph } from '@/systems/combat';
import { mulberry32, type Rng } from '@/util/rng';

export interface WorldItem {
  uid: string;
  id: ItemId;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

export interface AnimalEntity {
  data: AnimalData;
  rig: AnimalRig;
  out: AIOutput;
  telegraph: AttackTelegraph | null;
  corpseTimer: number;
  drops: ItemId[];
  soundCooldown: number;
}

export interface HominidEntity {
  data: HominidData;
  rig: HominidRig;
  /** NPC behaviour */
  target: THREE.Vector3 | null;
  wanderTimer: number;
  following: boolean;
  speed: number;
  heldMeshes: { left: THREE.Mesh | null; right: THREE.Mesh | null };
}

const ITEM_BIOMES: Partial<Record<ItemId, { biomes: BiomeId[]; weight: number }>> = {
  stick: { biomes: ['jungle', 'savanna', 'swamp'], weight: 1.0 },
  branch: { biomes: ['jungle', 'swamp'], weight: 0.5 },
  stone_granite: { biomes: ['savanna', 'cliffs', 'beach'], weight: 0.8 },
  stone_basalt: { biomes: ['cliffs', 'savanna'], weight: 0.35 },
  stone_obsidian: { biomes: ['cliffs'], weight: 0.25 },
  coconut: { biomes: ['beach'], weight: 0.5 },
  bone: { biomes: ['savanna', 'cliffs'], weight: 0.15 },
  egg: { biomes: ['cliffs', 'savanna'], weight: 0.1 },
};

export class GameWorld {
  readonly scene = new THREE.Scene();
  readonly terrain: Terrain;
  readonly veg: Vegetation;
  readonly sky: Sky;
  readonly water: Water;
  readonly rain: Rain;
  readonly items: WorldItem[] = [];
  readonly animals: AnimalEntity[] = [];
  readonly hominids = new Map<string, HominidEntity>();
  readonly settlement = new THREE.Vector3();
  readonly settlementGroup = new THREE.Group();
  readonly lights: THREE.Mesh[] = [];
  private itemUid = 0;
  private animalUid = 0;
  readonly rng: Rng;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.terrain = new Terrain(seed);
    this.scene.add(this.terrain.build());
    this.veg = new Vegetation(this.terrain, seed);
    this.scene.add(this.veg.group);
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene);
    this.rain = new Rain(this.scene);
    this.scene.add(this.settlementGroup);
  }

  /** Find a good starting settlement: jungle edge, flat, near water but above it. */
  chooseSettlement(): THREE.Vector3 {
    let best: THREE.Vector3 | null = null, bestScore = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const x = (this.rng() - 0.5) * 500, z = 40 + this.rng() * 300;
      const s = this.terrain.sample(x, z);
      if (s.biome !== 'jungle' || s.slope > 0.15 || s.height < 3) continue;
      const trees = this.veg.nearby(x, z, 20).filter((p) => p.climbable).length;
      let waterD = 999;
      for (let a = 0; a < 16; a++) {
        for (let r = 10; r < 120; r += 10) {
          const wx = x + Math.cos((a / 16) * Math.PI * 2) * r, wz = z + Math.sin((a / 16) * Math.PI * 2) * r;
          if (this.terrain.isWater(wx, wz)) { waterD = Math.min(waterD, r); break; }
        }
      }
      const score = trees * 0.5 - Math.abs(waterD - 40) * 0.1 - s.slope * 20;
      if (score > bestScore) { bestScore = score; best = new THREE.Vector3(x, s.height, z); }
    }
    this.settlement.copy(best ?? new THREE.Vector3(0, this.terrain.heightAt(0, 100), 100));
    this.buildSettlement();
    return this.settlement;
  }

  setSettlement(v: Vec3) {
    this.settlement.set(v.x, this.terrain.heightAt(v.x, v.z), v.z);
    this.buildSettlement();
  }

  private buildSettlement() {
    this.settlementGroup.clear();
    const s = this.settlement;
    this.veg.clearAround(s.x, s.z, 12);
    // leaf beds
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bx = s.x + Math.cos(a) * 3.2, bz = s.z + Math.sin(a) * 3.2;
      const bed = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 5), mat('#4f7a2f'));
      bed.scale.set(1.3, 0.25, 1);
      bed.position.set(bx, this.terrain.heightAt(bx, bz) + 0.1, bz);
      bed.rotation.y = a;
      bed.receiveShadow = true;
      this.settlementGroup.add(bed);
    }
    // stone ring
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const rx = s.x + Math.cos(a) * 6, rz = s.z + Math.sin(a) * 6;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + this.rng() * 0.4, 0), mat('#8a8278'));
      rock.position.set(rx, this.terrain.heightAt(rx, rz) + 0.1, rz);
      rock.castShadow = true;
      this.settlementGroup.add(rock);
    }
    // marker post with a soft glow so it's findable
    const glow = new THREE.PointLight('#ffb060', 6, 25, 1.6);
    glow.position.set(s.x, s.y + 2.5, s.z);
    this.settlementGroup.add(glow);
    const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.6, 6), mat('#6a4a2a'));
    totem.position.set(s.x, s.y + 1.3, s.z);
    totem.castShadow = true;
    this.settlementGroup.add(totem);
  }

  // ------------------------------------------------------------------ items
  spawnItem(id: ItemId, position: Vec3, uid?: string): WorldItem {
    const mesh = makeItemMesh(id);
    const y = Math.max(this.terrain.heightAt(position.x, position.z), position.y);
    mesh.position.set(position.x, y + 0.12, position.z);
    mesh.rotation.y = this.rng() * Math.PI * 2;
    this.scene.add(mesh);
    const item: WorldItem = { uid: uid ?? `item_${this.itemUid++}`, id, position: mesh.position, mesh };
    this.items.push(item);
    return item;
  }

  removeItem(item: WorldItem) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    this.scene.remove(item.mesh);
  }

  scatterItems(count: number) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const x = (this.rng() - 0.5) * (WORLD_SIZE - 100), z = (this.rng() - 0.5) * (WORLD_SIZE - 100);
      const s = this.terrain.sample(x, z);
      if (s.biome === 'lake' || s.slope > 0.4) continue;
      const candidates = (Object.entries(ITEM_BIOMES) as [ItemId, { biomes: BiomeId[]; weight: number }][]).filter(([, v]) => v.biomes.includes(s.biome));
      if (!candidates.length) continue;
      const total = candidates.reduce((a, [, v]) => a + v.weight, 0);
      let r = this.rng() * total;
      for (const [id, v] of candidates) {
        r -= v.weight;
        if (r <= 0) { this.spawnItem(id, { x, y: s.height, z }); placed++; break; }
      }
    }
    // Extra sticks and stones around the settlement so the start is playable
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2, r = 6 + this.rng() * 14;
      const x = this.settlement.x + Math.cos(a) * r, z = this.settlement.z + Math.sin(a) * r;
      this.spawnItem(i % 2 ? 'stick' : 'stone_granite', { x, y: this.terrain.heightAt(x, z), z });
    }
  }

  nearestItem(pos: THREE.Vector3, radius: number): WorldItem | null {
    let best: WorldItem | null = null, bd = radius;
    for (const it of this.items) {
      const d = it.position.distanceTo(pos);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ---------------------------------------------------------------- animals
  spawnAnimal(species: SpeciesId, position: Vec3, health?: number): AnimalEntity {
    const def = SPECIES[species];
    const data = createAnimal(`animal_${this.animalUid++}`, species, position, this.rng);
    if (health !== undefined) { data.health = health; if (health <= 0) data.alive = false; }
    const rig = new AnimalRig(species);
    rig.root.position.set(position.x, position.y, position.z);
    this.scene.add(rig.root);
    const ent: AnimalEntity = {
      data, rig, telegraph: null, corpseTimer: 0, drops: [...def.drops], soundCooldown: 0,
      out: { moveDir: { x: 0, y: 0, z: 0 }, speed: 0, wantsAttack: null, sound: null, state: 'idle' },
    };
    if (!data.alive) rig.setDead();
    this.animals.push(ent);
    return ent;
  }

  removeAnimal(ent: AnimalEntity) {
    const i = this.animals.indexOf(ent);
    if (i >= 0) this.animals.splice(i, 1);
    this.scene.remove(ent.rig.root);
    ent.rig.dispose();
  }

  populateAnimals(count: number) {
    const s = this.settlement;
    let placed = 0, tries = 0;
    const perSpecies = new Map<SpeciesId, number>();
    while (placed < count && tries < count * 30) {
      tries++;
      const x = (this.rng() - 0.5) * (WORLD_SIZE - 120), z = (this.rng() - 0.5) * (WORLD_SIZE - 120);
      const sample = this.terrain.sample(x, z);
      const distSettle = Math.hypot(x - s.x, z - s.z);
      const options = SPECIES_LIST.filter((d) => d.biomes.includes(sample.biome) && (d.aquatic ? sample.biome === 'lake' || sample.biome === 'swamp' : sample.biome !== 'lake' || d.flying));
      if (!options.length) continue;
      const def = options[Math.floor(this.rng() * options.length)];
      // keep dangerous predators away from the start
      if (def.behavior === 'predator' && distSettle < 90) continue;
      if (def.behavior !== 'prey' && def.behavior !== 'neutral' && distSettle < 45) continue;
      const cap = def.behavior === 'predator' ? 10 : def.id === 'deinotherium' ? 4 : 16;
      if ((perSpecies.get(def.id) ?? 0) >= cap) continue;
      if (def.aquatic && !this.terrain.isWater(x, z)) continue;
      perSpecies.set(def.id, (perSpecies.get(def.id) ?? 0) + 1);
      this.spawnAnimal(def.id, { x, y: sample.height, z });
      placed++;
    }
    // Guaranteed nearby prey + a python somewhere near for early tension
    for (let i = 0; i < 3; i++) {
      const a = this.rng() * Math.PI * 2, r = 25 + this.rng() * 25;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (!this.terrain.isWater(x, z)) this.spawnAnimal(i === 2 ? 'monkey' : 'rat', { x, y: this.terrain.heightAt(x, z), z });
    }
  }

  // --------------------------------------------------------------- hominids
  addHominid(data: HominidData): HominidEntity {
    const rig = new HominidRig(data.sex === 'female' ? '#4a3626' : '#33261b', data.sex === 'female' ? '#7a5a48' : '#6e5140');
    rig.setStage(data.stage);
    const y = this.terrain.heightAt(data.position.x, data.position.z);
    data.position.y = y;
    rig.root.position.set(data.position.x, y, data.position.z);
    this.scene.add(rig.root);
    const ent: HominidEntity = { data, rig, target: null, wanderTimer: this.rng() * 5, following: false, speed: 0, heldMeshes: { left: null, right: null } };
    this.hominids.set(data.id, ent);
    return ent;
  }

  removeHominid(id: string) {
    const e = this.hominids.get(id);
    if (!e) return;
    this.scene.remove(e.rig.root);
    e.rig.dispose();
    this.hominids.delete(id);
  }

  /** Sync held item meshes to a hominid's hands. */
  syncHeld(ent: HominidEntity) {
    const d = ent.data;
    for (const side of ['left', 'right'] as const) {
      const cur = ent.heldMeshes[side];
      const want = d.held[side];
      if (cur && (!want || cur.userData.item !== want)) {
        cur.parent?.remove(cur);
        ent.heldMeshes[side] = null;
      }
      if (want && !ent.heldMeshes[side]) {
        const m = makeItemMesh(want);
        m.userData.item = want;
        m.scale.setScalar(0.9);
        m.rotation.set(0.3, 0, 1.2);
        (side === 'left' ? ent.rig.handL : ent.rig.handR).add(m);
        ent.heldMeshes[side] = m;
      }
    }
  }

  // ----------------------------------------------------------- fear lights
  spawnFearLights(center: THREE.Vector3, count: number) {
    this.clearFearLights();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * 1.2;
      const r = 14 + this.rng() * 18;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const y = Math.max(this.terrain.heightAt(x, z), WATER_LEVEL) + 1.4;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffe9a0' }));
      m.position.set(x, y, z);
      const l = new THREE.PointLight('#ffd070', 8, 18, 1.5);
      m.add(l);
      this.scene.add(m);
      this.lights.push(m);
    }
  }

  clearFearLights() {
    for (const l of this.lights) { this.scene.remove(l); (l.material as THREE.Material).dispose(); l.geometry.dispose(); }
    this.lights.length = 0;
  }

  update(dt: number, time: number, viewer?: THREE.Vector3) {
    this.veg.update(time, dt, viewer);
    for (const l of this.lights) {
      l.position.y += Math.sin(time * 3 + l.position.x) * dt * 0.4;
      l.scale.setScalar(1 + Math.sin(time * 5 + l.position.z) * 0.15);
    }
  }
}
