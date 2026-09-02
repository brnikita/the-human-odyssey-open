import * as THREE from 'three';
import type { BiomeId, PlantId, Vec3 } from '@/core/types';
import { PLANTS } from '@/data/plants';
import { Terrain, WATER_LEVEL, WORLD_SIZE } from './terrain';
import { mulberry32 } from '@/util/rng';
import { mat } from '@/render/models';

/** A climbable vertical (tree trunk). */
export interface Climbable {
  position: THREE.Vector3; // base
  radius: number;
  height: number; // trunk height above base
  canopyRadius: number;
}

/** A harvestable plant instance in the world. */
export interface PlantInstance {
  index: number;
  plant: PlantId;
  position: THREE.Vector3;
  regrowTimer: number; // >0 => harvested and regrowing
  yieldsLeft: number;
  climbable: Climbable | null;
  uid: string;
}

interface Template {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material; castShadow: boolean }[];
  scaleRange: [number, number];
  trunk?: { radius: number; height: number; canopy: number };
}

function templateFor(plant: PlantId, rng: () => number): Template {
  void rng;
  const bark = mat('#5a3d28'), barkDark = mat('#3f2a1a');
  const leafJ = mat('#2f7a2e'), leafJ2 = mat('#3f9a3a'), leafS = mat('#8aa040'), leafDry = mat('#a8a050');
  switch (plant) {
    case 'jungle_tree': {
      const trunk = new THREE.CylinderGeometry(0.28, 0.5, 9, 7); trunk.translate(0, 4.5, 0);
      const c1 = new THREE.IcosahedronGeometry(3.2, 1); c1.translate(0, 9.5, 0);
      const c2 = new THREE.IcosahedronGeometry(2.4, 1); c2.translate(1.8, 8, 1.2);
      const c3 = new THREE.IcosahedronGeometry(2.2, 1); c3.translate(-1.6, 8.4, -1.0);
      return { parts: [{ geo: trunk, mat: bark, castShadow: true }, { geo: c1, mat: leafJ, castShadow: true }, { geo: c2, mat: leafJ2, castShadow: true }, { geo: c3, mat: leafJ, castShadow: false }], scaleRange: [0.8, 1.5], trunk: { radius: 0.5, height: 8.5, canopy: 3.2 } };
    }
    case 'kapok_tree': {
      const trunk = new THREE.CylinderGeometry(0.4, 0.9, 14, 7); trunk.translate(0, 7, 0);
      const c1 = new THREE.IcosahedronGeometry(4.5, 1); c1.scale(1.4, 0.6, 1.4); c1.translate(0, 14.5, 0);
      return { parts: [{ geo: trunk, mat: barkDark, castShadow: true }, { geo: c1, mat: leafJ2, castShadow: true }], scaleRange: [0.9, 1.3], trunk: { radius: 0.9, height: 13.5, canopy: 4.5 } };
    }
    case 'mango_tree': {
      const trunk = new THREE.CylinderGeometry(0.25, 0.4, 4, 6); trunk.translate(0, 2, 0);
      const c1 = new THREE.SphereGeometry(3, 8, 6); c1.translate(0, 5.2, 0);
      return { parts: [{ geo: trunk, mat: bark, castShadow: true }, { geo: c1, mat: leafJ, castShadow: true }], scaleRange: [0.8, 1.2], trunk: { radius: 0.4, height: 4, canopy: 3 } };
    }
    case 'acacia': {
      const trunk = new THREE.CylinderGeometry(0.2, 0.4, 6, 6); trunk.translate(0, 3, 0);
      const c1 = new THREE.CylinderGeometry(4.5, 2.5, 1.2, 8); c1.translate(0, 6.6, 0);
      return { parts: [{ geo: trunk, mat: barkDark, castShadow: true }, { geo: c1, mat: leafS, castShadow: true }], scaleRange: [0.8, 1.3], trunk: { radius: 0.4, height: 6, canopy: 4 } };
    }
    case 'baobab': {
      const trunk = new THREE.CylinderGeometry(1.6, 2.6, 11, 9); trunk.translate(0, 5.5, 0);
      const b1 = new THREE.CylinderGeometry(0.15, 0.5, 4, 5); b1.rotateZ(0.6); b1.translate(1.8, 12, 0);
      const b2 = new THREE.CylinderGeometry(0.15, 0.5, 4, 5); b2.rotateZ(-0.7); b2.translate(-1.8, 12, 0.5);
      const b3 = new THREE.CylinderGeometry(0.15, 0.5, 3.5, 5); b3.rotateX(0.7); b3.translate(0, 12, -1.6);
      const c = new THREE.IcosahedronGeometry(2.2, 0); c.scale(1.6, 0.5, 1.6); c.translate(0, 13.5, 0);
      return { parts: [{ geo: trunk, mat: mat('#7a6a55'), castShadow: true }, { geo: b1, mat: mat('#7a6a55'), castShadow: true }, { geo: b2, mat: mat('#7a6a55'), castShadow: true }, { geo: b3, mat: mat('#7a6a55'), castShadow: true }, { geo: c, mat: leafDry, castShadow: true }], scaleRange: [0.9, 1.4], trunk: { radius: 2.4, height: 11, canopy: 3 } };
    }
    case 'coconut_palm': {
      const trunk = new THREE.CylinderGeometry(0.18, 0.3, 9, 6); trunk.translate(0, 4.5, 0);
      const parts: Template['parts'] = [{ geo: trunk, mat: mat('#8a7050'), castShadow: true }];
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.BoxGeometry(0.5, 0.06, 3.2);
        leaf.translate(0, 0, 1.6); leaf.rotateX(-0.5); leaf.rotateY((i / 6) * Math.PI * 2); leaf.translate(0, 9, 0);
        parts.push({ geo: leaf, mat: leafJ2, castShadow: true });
      }
      const nut = new THREE.SphereGeometry(0.25, 6, 5); nut.translate(0.3, 8.6, 0.2);
      parts.push({ geo: nut, mat: mat('#6e5636'), castShadow: false });
      return { parts, scaleRange: [0.8, 1.3], trunk: { radius: 0.3, height: 8.8, canopy: 1.5 } };
    }
    case 'banana_tree': {
      const parts: Template['parts'] = [];
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.BoxGeometry(0.7, 0.05, 2.6);
        leaf.translate(0, 0, 1.3); leaf.rotateX(-0.9); leaf.rotateY((i / 5) * Math.PI * 2); leaf.translate(0, 1.8, 0);
        parts.push({ geo: leaf, mat: leafJ2, castShadow: true });
      }
      const stem = new THREE.CylinderGeometry(0.12, 0.2, 2, 5); stem.translate(0, 1, 0);
      parts.push({ geo: stem, mat: mat('#6a8a3a'), castShadow: true });
      const bunch = new THREE.SphereGeometry(0.3, 6, 5); bunch.translate(0.4, 1.4, 0);
      parts.push({ geo: bunch, mat: mat('#e9d34a'), castShadow: false });
      return { parts, scaleRange: [0.8, 1.2] };
    }
    case 'fern': {
      const parts: Template['parts'] = [];
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.ConeGeometry(0.25, 1.4, 4); leaf.rotateX(-1.1); leaf.translate(0, 0.2, 0.5); leaf.rotateY((i / 6) * Math.PI * 2);
        parts.push({ geo: leaf, mat: leafJ2, castShadow: false });
      }
      return { parts, scaleRange: [0.6, 1.3] };
    }
    case 'horsetail_plant': {
      const parts: Template['parts'] = [];
      for (let i = 0; i < 5; i++) {
        const st = new THREE.CylinderGeometry(0.03, 0.05, 1.4, 5); st.translate(Math.cos(i * 1.3) * 0.2, 0.7, Math.sin(i * 1.3) * 0.2);
        parts.push({ geo: st, mat: mat('#4a8a3c'), castShadow: false });
      }
      return { parts, scaleRange: [0.8, 1.2] };
    }
    case 'khat_bush': case 'berry_bush': case 'thorn_bush': case 'natal_grass_patch': case 'mushroom_patch': {
      const c = plant === 'khat_bush' ? '#5fa04e' : plant === 'berry_bush' ? '#3e6a30' : plant === 'thorn_bush' ? '#6a5a3a' : plant === 'natal_grass_patch' ? '#7cb35c' : '#7a6a4a';
      const b = new THREE.IcosahedronGeometry(0.9, 0); b.scale(1.2, 0.8, 1.2); b.translate(0, 0.6, 0);
      const parts: Template['parts'] = [{ geo: b, mat: mat(c), castShadow: true }];
      if (plant === 'berry_bush') { const dots = new THREE.IcosahedronGeometry(0.12, 0); dots.translate(0.6, 1.0, 0.5); parts.push({ geo: dots, mat: mat('#5a2a6e'), castShadow: false }); }
      if (plant === 'mushroom_patch') { const cap = new THREE.ConeGeometry(0.3, 0.25, 7); cap.translate(0.3, 0.4, 0.3); parts.push({ geo: cap, mat: mat('#c8b48a'), castShadow: false }); }
      if (plant === 'natal_grass_patch') { const fr = new THREE.ConeGeometry(0.5, 1.6, 5); fr.translate(0, 0.9, 0); parts.push({ geo: fr, mat: mat('#7cb35c'), castShadow: false }); }
      return { parts, scaleRange: [0.7, 1.2] };
    }
    case 'reed_bed': {
      const parts: Template['parts'] = [];
      for (let i = 0; i < 7; i++) {
        const st = new THREE.CylinderGeometry(0.02, 0.04, 2.2, 4); st.translate(Math.cos(i * 0.9) * 0.4, 1.1, Math.sin(i * 0.9) * 0.4);
        parts.push({ geo: st, mat: mat('#9aa860'), castShadow: false });
      }
      return { parts, scaleRange: [0.8, 1.3] };
    }
    case 'beehive': {
      const post = new THREE.CylinderGeometry(0.15, 0.2, 3.5, 5); post.translate(0, 1.75, 0);
      const hive = new THREE.SphereGeometry(0.5, 7, 6); hive.scale(0.8, 1.2, 0.8); hive.translate(0.4, 2.8, 0);
      return { parts: [{ geo: post, mat: bark, castShadow: true }, { geo: hive, mat: mat('#c8a040'), castShadow: true }], scaleRange: [0.9, 1.1] };
    }
  }
}

const DENSITY: Record<BiomeId, Partial<Record<PlantId, number>>> = {
  jungle: { jungle_tree: 0.26, kapok_tree: 0.03, mango_tree: 0.04, banana_tree: 0.06, fern: 0.35, berry_bush: 0.04, mushroom_patch: 0.03, beehive: 0.012, horsetail_plant: 0.02 },
  savanna: { acacia: 0.05, baobab: 0.005, mango_tree: 0.01, khat_bush: 0.04, berry_bush: 0.04, thorn_bush: 0.04, natal_grass_patch: 0.035, beehive: 0.005 },
  swamp: { jungle_tree: 0.08, fern: 0.25, horsetail_plant: 0.1, reed_bed: 0.2, mushroom_patch: 0.04 },
  lake: { reed_bed: 0.08, horsetail_plant: 0.04, coconut_palm: 0.025 },
  cliffs: { khat_bush: 0.025, natal_grass_patch: 0.025, thorn_bush: 0.025, acacia: 0.01 },
  beach: { coconut_palm: 0.1, reed_bed: 0.04 },
};

/** Spatial cell size for vegetation batching (world units). */
const CELL_SIZE = 150;
const CELLS = Math.ceil(WORLD_SIZE / CELL_SIZE);

interface CellMesh {
  mesh: THREE.InstancedMesh;
  center: THREE.Vector3;
  kind: 'plant' | 'grass';
  /** true for tall plants (trees) that are visible from afar */
  tall: boolean;
}

/** Merge template parts into one geometry with vertex colours so a plant is a single draw call. */
function mergeTemplate(tpl: Template): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const part of tpl.parts) {
    const g = part.geo.clone();
    const m = part.mat as THREE.MeshStandardMaterial;
    const c = m.color;
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.index) geos.push(g.toNonIndexed()); else geos.push(g);
  }
  // manual merge (positions, normals, colors)
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    const p = g.getAttribute('position'), nn = g.getAttribute('normal'), cc = g.getAttribute('color');
    pos.set(p.array as Float32Array, off * 3);
    nrm.set(nn.array as Float32Array, off * 3);
    col.set(cc.array as Float32Array, off * 3);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const plantMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });

export class Vegetation {
  readonly group = new THREE.Group();
  readonly plants: PlantInstance[] = [];
  readonly climbables: Climbable[] = [];
  private cellMeshes: CellMesh[] = [];
  private grassMaterial: THREE.MeshStandardMaterial | null = null;
  private byCell = new Map<string, PlantInstance[]>();
  private instanceOf = new Map<PlantId, number[]>();
  private static CELL = 32;
  /** distance limits, tuned by quality settings */
  treeDistance = 420;
  bushDistance = 160;
  grassDistance = 110;
  shadowDistance = 90;

  constructor(private terrain: Terrain, seed: number) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    this.scatter(rng);
    this.buildInstances(rng);
    this.buildGrass(rng);
    this.buildRocks(rng);
  }

  private cellKey(x: number, z: number) {
    return `${Math.floor(x / Vegetation.CELL)},${Math.floor(z / Vegetation.CELL)}`;
  }

  private bigCell(x: number, z: number): number {
    const cx = Math.min(CELLS - 1, Math.max(0, Math.floor((x + WORLD_SIZE / 2) / CELL_SIZE)));
    const cz = Math.min(CELLS - 1, Math.max(0, Math.floor((z + WORLD_SIZE / 2) / CELL_SIZE)));
    return cz * CELLS + cx;
  }

  private cellCenter(idx: number): THREE.Vector3 {
    const cx = idx % CELLS, cz = Math.floor(idx / CELLS);
    return new THREE.Vector3(-WORLD_SIZE / 2 + (cx + 0.5) * CELL_SIZE, 0, -WORLD_SIZE / 2 + (cz + 0.5) * CELL_SIZE);
  }

  private scatter(rng: () => number) {
    const step = 7;
    const half = WORLD_SIZE / 2 - 30;
    const perType = new Map<PlantId, { pos: THREE.Vector3; rot: number }[]>();
    for (let z = -half; z < half; z += step) {
      for (let x = -half; x < half; x += step) {
        const px = x + (rng() - 0.5) * step, pz = z + (rng() - 0.5) * step;
        const s = this.terrain.sample(px, pz);
        if (s.slope > 0.5) continue;
        if (s.biome === 'lake' && s.height < WATER_LEVEL - 2) continue;
        const dens = DENSITY[s.biome];
        const roll = rng();
        let acc = 0;
        for (const [pid, d] of Object.entries(dens) as [PlantId, number][]) {
          acc += d;
          if (roll < acc) {
            const list = perType.get(pid) ?? [];
            list.push({ pos: new THREE.Vector3(px, s.height, pz), rot: rng() * Math.PI * 2 });
            perType.set(pid, list);
            break;
          }
        }
      }
    }
    for (const [pid, list] of perType) {
      const def = PLANTS[pid];
      const idxs: number[] = [];
      for (const e of list) {
        const index = this.plants.length;
        const inst: PlantInstance = { index, plant: pid, position: e.pos, regrowTimer: 0, yieldsLeft: def.yieldCount, climbable: null, uid: `plant_${index}` };
        this.plants.push(inst);
        idxs.push(index);
        const key = this.cellKey(e.pos.x, e.pos.z);
        const cell = this.byCell.get(key) ?? [];
        cell.push(inst);
        this.byCell.set(key, cell);
      }
      this.instanceOf.set(pid, idxs);
    }
  }

  private buildInstances(rng: () => number) {
    const dummy = new THREE.Object3D();
    for (const [pid, idxs] of this.instanceOf) {
      const tpl = templateFor(pid, rng);
      const geo = mergeTemplate(tpl);
      const tall = !!tpl.trunk;
      // group by big cell
      const groups = new Map<number, { index: number; matrix: THREE.Matrix4 }[]>();
      for (const i of idxs) {
        const inst = this.plants[i];
        const [a, b] = tpl.scaleRange;
        const sc = a + rng() * (b - a);
        dummy.position.copy(inst.position);
        dummy.position.y -= 0.15;
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        const cell = this.bigCell(inst.position.x, inst.position.z);
        const list = groups.get(cell) ?? [];
        list.push({ index: i, matrix: dummy.matrix.clone() });
        groups.set(cell, list);
        if (tpl.trunk) {
          const c: Climbable = { position: inst.position.clone(), radius: tpl.trunk.radius * sc, height: tpl.trunk.height * sc, canopyRadius: tpl.trunk.canopy * sc };
          inst.climbable = c;
          this.climbables.push(c);
        }
      }
      for (const [cell, list] of groups) {
        const im = new THREE.InstancedMesh(geo, plantMaterial, list.length);
        list.forEach((e, k) => { im.setMatrixAt(k, e.matrix); (this.plants[e.index] as PlantInstance & { meshRef?: [THREE.InstancedMesh, number] }).meshRef = [im, k]; });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = tall;
        im.receiveShadow = true;
        im.frustumCulled = true;
        im.computeBoundingSphere();
        im.userData.plant = pid;
        this.group.add(im);
        this.cellMeshes.push({ mesh: im, center: this.cellCenter(cell), kind: 'plant', tall });
      }
    }
  }

  private buildGrass(rng: () => number) {
    const total = 28000;
    const geo = new THREE.ConeGeometry(0.16, 0.55, 3, 1, true);
    geo.translate(0, 0.27, 0);
    const material = new THREE.MeshStandardMaterial({ color: '#8fa64a', roughness: 1, side: THREE.DoubleSide, flatShading: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = sin(uTime * 1.6 + instanceMatrix[3][0] * 0.4 + instanceMatrix[3][2] * 0.3) * 0.18 * transformed.y;
        transformed.x += sway; transformed.z += sway * 0.5;`,
      );
      (material as unknown as { shader: typeof shader }).shader = shader;
    };
    this.grassMaterial = material;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const groups = new Map<number, { m: THREE.Matrix4; c: THREE.Color }[]>();
    let placed = 0, tries = 0;
    while (placed < total && tries < total * 4) {
      tries++;
      const x = (rng() - 0.5) * (WORLD_SIZE - 80), z = (rng() - 0.5) * (WORLD_SIZE - 80);
      const s = this.terrain.sample(x, z);
      if (s.biome === 'lake' || s.biome === 'cliffs' || s.biome === 'beach' || s.slope > 0.4) continue;
      if (s.biome === 'swamp' && rng() < 0.5) continue;
      dummy.position.set(x, s.height, z);
      dummy.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
      dummy.scale.set(1 + rng(), 0.7 + rng() * 0.8, 1 + rng());
      dummy.updateMatrix();
      color.set(s.biome === 'jungle' ? '#4f8f3a' : s.biome === 'swamp' ? '#5f7a3a' : '#a8a048').offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.1);
      const cell = this.bigCell(x, z);
      const list = groups.get(cell) ?? [];
      list.push({ m: dummy.matrix.clone(), c: color.clone() });
      groups.set(cell, list);
      placed++;
    }
    for (const [cell, list] of groups) {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((e, k) => { im.setMatrixAt(k, e.m); im.setColorAt(k, e.c); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.cellMeshes.push({ mesh: im, center: this.cellCenter(cell), kind: 'grass', tall: false });
    }
  }

  private buildRocks(rng: () => number) {
    const count = 1200;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(geo, mat('#7d7568', { flatShading: true }), count);
    const dummy = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 5) {
      tries++;
      const x = (rng() - 0.5) * (WORLD_SIZE - 60), z = (rng() - 0.5) * (WORLD_SIZE - 60);
      const s = this.terrain.sample(x, z);
      if (s.biome === 'lake') continue;
      const pRock = s.biome === 'cliffs' ? 0.9 : s.biome === 'savanna' ? 0.3 : 0.12;
      if (rng() > pRock) continue;
      const sc = 0.5 + rng() * (s.biome === 'cliffs' ? 4 : 1.5);
      dummy.position.set(x, s.height - sc * 0.3, z);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.set(sc * (0.7 + rng() * 0.6), sc * (0.5 + rng() * 0.5), sc * (0.7 + rng() * 0.6));
      dummy.updateMatrix();
      im.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    im.count = placed;
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    this.group.add(im);
  }

  /** Remove plants (visually and logically) within radius of a point, e.g. the settlement. */
  clearAround(x: number, z: number, radius: number) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of this.nearby(x, z, radius)) {
      const ref = (p as PlantInstance & { meshRef?: [THREE.InstancedMesh, number] }).meshRef;
      if (ref) { ref[0].setMatrixAt(ref[1], zero); ref[0].instanceMatrix.needsUpdate = true; }
      p.yieldsLeft = 0;
      p.regrowTimer = 1e9;
      if (p.climbable) { const i = this.climbables.indexOf(p.climbable); if (i >= 0) this.climbables.splice(i, 1); p.climbable = null; }
      const cell = this.byCell.get(this.cellKey(p.position.x, p.position.z));
      if (cell) { const i = cell.indexOf(p); if (i >= 0) cell.splice(i, 1); }
    }
  }

  /** Per-frame: animate grass and cull cells by distance from the viewer. */
  update(time: number, dt: number, viewer?: THREE.Vector3) {
    const m = this.grassMaterial as (THREE.MeshStandardMaterial & { shader?: { uniforms: { uTime: { value: number } } } }) | null;
    if (m?.shader) m.shader.uniforms.uTime.value = time;
    if (viewer) {
      const half = CELL_SIZE * 0.71;
      for (const c of this.cellMeshes) {
        const d = Math.max(0, Math.hypot(c.center.x - viewer.x, c.center.z - viewer.z) - half);
        const limit = c.kind === 'grass' ? this.grassDistance : c.tall ? this.treeDistance : this.bushDistance;
        c.mesh.visible = d < limit;
        if (c.kind === 'plant') c.mesh.castShadow = c.tall && d < this.shadowDistance;
      }
    }
    for (const p of this.plants) {
      if (p.regrowTimer > 0 && p.regrowTimer < 1e8) {
        p.regrowTimer -= dt;
        if (p.regrowTimer <= 0) {
          p.regrowTimer = 0;
          p.yieldsLeft = PLANTS[p.plant].yieldCount;
        }
      }
    }
  }

  /** Plants within radius of a point. */
  nearby(x: number, z: number, radius: number): PlantInstance[] {
    const out: PlantInstance[] = [];
    const c = Vegetation.CELL;
    const r = Math.ceil(radius / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const cell = this.byCell.get(`${cx + i},${cz + j}`);
        if (!cell) continue;
        for (const p of cell) {
          const dx = p.position.x - x, dz = p.position.z - z;
          if (dx * dx + dz * dz <= radius * radius) out.push(p);
        }
      }
    }
    return out;
  }

  nearestClimbable(x: number, z: number, radius: number): Climbable | null {
    let best: Climbable | null = null, bd = radius;
    for (const p of this.nearby(x, z, radius + 3)) {
      if (!p.climbable) continue;
      const d = Math.hypot(p.climbable.position.x - x, p.climbable.position.z - z) - p.climbable.radius;
      if (d < bd) { bd = d; best = p.climbable; }
    }
    return best;
  }

  harvest(p: PlantInstance): boolean {
    if (p.yieldsLeft <= 0 || p.regrowTimer > 0) return false;
    p.yieldsLeft--;
    if (p.yieldsLeft <= 0) p.regrowTimer = PLANTS[p.plant].regrowSeconds;
    return true;
  }

  /** Serialise harvested state. */
  serialize(): { plantIndex: number; timeLeft: number }[] {
    return this.plants.filter((p) => p.regrowTimer > 0 && p.regrowTimer < 1e8 || (p.regrowTimer === 0 && p.yieldsLeft < PLANTS[p.plant].yieldCount)).map((p) => ({ plantIndex: p.index, timeLeft: p.regrowTimer }));
  }

  restore(data: { plantIndex: number; timeLeft: number }[]) {
    for (const d of data) {
      const p = this.plants[d.plantIndex];
      if (!p) continue;
      p.regrowTimer = d.timeLeft;
      p.yieldsLeft = d.timeLeft > 0 ? 0 : PLANTS[p.plant].yieldCount;
    }
  }

  toVec3(p: PlantInstance): Vec3 {
    return { x: p.position.x, y: p.position.y, z: p.position.z };
  }
}
