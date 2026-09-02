import * as THREE from 'three';
import { SimplexNoise, smoothstep, clamp, lerp } from './noise';
import type { BiomeId } from '@/core/types';

export const WORLD_SIZE = 1200; // units, centered at origin
export const WATER_LEVEL = 0;
const GRID_STEP = 2.5;
const GRID_N = Math.floor(WORLD_SIZE / GRID_STEP) + 1; // vertices per side
const CHUNK_SEGS = 24; // segments per chunk side
const CHUNKS = (GRID_N - 1) / CHUNK_SEGS; // 20

const BIOME_COLORS: Record<BiomeId, THREE.Color> = {
  jungle: new THREE.Color('#2f6b2a'),
  savanna: new THREE.Color('#a8963f'),
  swamp: new THREE.Color('#4d6b3a'),
  lake: new THREE.Color('#5b6b4a'),
  cliffs: new THREE.Color('#7d7568'),
  beach: new THREE.Color('#c9b98a'),
};

export interface TerrainSample {
  height: number;
  biome: BiomeId;
  moisture: number;
  slope: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  private heights: Float32Array;
  private moisture: Float32Array;
  private noise: SimplexNoise;
  private noise2: SimplexNoise;
  private meshes: THREE.Mesh[] = [];
  private material: THREE.MeshStandardMaterial;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new SimplexNoise(seed);
    this.noise2 = new SimplexNoise(seed * 7 + 13);
    this.heights = new Float32Array(GRID_N * GRID_N);
    this.moisture = new Float32Array(GRID_N * GRID_N);
    this.fillGrid();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      map: makeDetailTexture(seed),
    });
    this.material.map!.repeat.set(WORLD_SIZE / 24, WORLD_SIZE / 24);
  }

  /** Analytic height model in world units. */
  private computeHeight(x: number, z: number): number {
    const nx = x / WORLD_SIZE, nz = z / WORLD_SIZE; // -0.5..0.5
    const r = Math.sqrt(nx * nx + nz * nz);
    // Base rolling land
    let h = this.noise.fbm(x * 0.0022, z * 0.0022, 5) * 14 + 8;
    h += this.noise.fbm(x * 0.008, z * 0.008, 3) * 3;
    // Great lake basin in the west-centre, with a river towards the south-east.
    const lx = nx + 0.16, lz = nz - 0.02;
    const lakeD = Math.sqrt(lx * lx * 1.2 + lz * lz * 0.8);
    const lake = smoothstep(0.2, 0.09, lakeD);
    h = lerp(h, -14, lake);
    // River: meandering channel
    const riverPath = Math.sin(nz * 9 + 1.2) * 0.06 + Math.sin(nz * 3.2) * 0.04 + 0.12;
    const riverD = Math.abs(nx - riverPath);
    const river = smoothstep(0.03, 0.006, riverD) * smoothstep(-0.05, 0.05, nz - (-0.1));
    h = lerp(h, -6, river * 0.9);
    // Northern cliffs and highlands
    const north = smoothstep(-0.05, 0.42, -nz) * (1 - lake);
    const ridge = this.noise.ridged(x * 0.004 + 3, z * 0.004, 4);
    h += north * (ridge * 85 + 20);
    // Eastern plateau (savanna) gentle rise
    h += smoothstep(0.1, 0.45, nx) * 6 * (1 - lake);
    // Edge falloff to mountains so player cannot leave
    const edge = smoothstep(0.42, 0.5, Math.max(Math.abs(nx), Math.abs(nz)));
    h += edge * 120;
    void r;
    return h;
  }

  private computeMoisture(x: number, z: number, h: number): number {
    let m = this.noise2.fbm(x * 0.0035 + 40, z * 0.0035 - 20, 4) * 0.5 + 0.5;
    const nz = z / WORLD_SIZE, nx = x / WORLD_SIZE;
    m += smoothstep(-0.1, 0.4, nz) * 0.35; // south is wetter (jungle)
    m -= smoothstep(0.1, 0.45, nx) * 0.3; // east is drier (savanna)
    m += smoothstep(6, -2, h) * 0.3; // near water
    return clamp(m, 0, 1);
  }

  private fillGrid() {
    for (let j = 0; j < GRID_N; j++) {
      for (let i = 0; i < GRID_N; i++) {
        const x = -WORLD_SIZE / 2 + i * GRID_STEP;
        const z = -WORLD_SIZE / 2 + j * GRID_STEP;
        const h = this.computeHeight(x, z);
        this.heights[j * GRID_N + i] = h;
        this.moisture[j * GRID_N + i] = this.computeMoisture(x, z, h);
      }
    }
  }

  private gridValue(arr: Float32Array, x: number, z: number): number {
    const fx = clamp((x + WORLD_SIZE / 2) / GRID_STEP, 0, GRID_N - 1.0001);
    const fz = clamp((z + WORLD_SIZE / 2) / GRID_STEP, 0, GRID_N - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = arr[j * GRID_N + i], b = arr[j * GRID_N + i + 1];
    const c = arr[(j + 1) * GRID_N + i], d = arr[(j + 1) * GRID_N + i + 1];
    // match triangle split used by PlaneGeometry: (i,j)-(i+1,j)-(i,j+1) and (i+1,j)-(i+1,j+1)-(i,j+1)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  heightAt(x: number, z: number): number {
    return this.gridValue(this.heights, x, z);
  }

  moistureAt(x: number, z: number): number {
    return this.gridValue(this.moisture, x, z);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x: number, z: number): number {
    const n = this.normalAt(x, z);
    return 1 - n.y; // 0 flat .. 1 vertical
  }

  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < WATER_LEVEL - 0.3;
  }

  biomeAt(x: number, z: number): BiomeId {
    const h = this.heightAt(x, z);
    const m = this.moistureAt(x, z);
    const s = this.slopeAt(x, z);
    if (h < WATER_LEVEL - 0.2) return 'lake';
    if (s > 0.45 || h > 55) return 'cliffs';
    if (h < WATER_LEVEL + 1.2) return m > 0.55 ? 'swamp' : 'beach';
    if (h < WATER_LEVEL + 5 && m > 0.7) return 'swamp';
    if (m > 0.58) return 'jungle';
    return 'savanna';
  }

  sample(x: number, z: number): TerrainSample {
    return { height: this.heightAt(x, z), biome: this.biomeAt(x, z), moisture: this.moistureAt(x, z), slope: this.slopeAt(x, z) };
  }

  /** Blended vertex colour for the terrain. */
  private colorAt(x: number, z: number, out: THREE.Color): THREE.Color {
    const h = this.heightAt(x, z), m = this.moistureAt(x, z), s = this.slopeAt(x, z);
    const grass = new THREE.Color().copy(BIOME_COLORS.savanna).lerp(BIOME_COLORS.jungle, smoothstep(0.35, 0.75, m));
    out.copy(grass);
    const wet = smoothstep(4, 0.5, h) * smoothstep(0.4, 0.75, m);
    out.lerp(BIOME_COLORS.swamp, wet);
    const sand = smoothstep(2.5, 0.2, h) * (1 - wet);
    out.lerp(BIOME_COLORS.beach, sand);
    const rock = smoothstep(0.25, 0.5, s) + smoothstep(45, 70, h);
    out.lerp(BIOME_COLORS.cliffs, clamp(rock, 0, 1));
    const under = smoothstep(0.2, -4, h);
    out.lerp(BIOME_COLORS.lake, under);
    // subtle variation
    const v = this.noise2.noise2D(x * 0.05, z * 0.05) * 0.06;
    out.r = clamp(out.r + v, 0, 1); out.g = clamp(out.g + v, 0, 1); out.b = clamp(out.b + v * 0.5, 0, 1);
    return out;
  }

  build(): THREE.Group {
    const color = new THREE.Color();
    for (let cj = 0; cj < CHUNKS; cj++) {
      for (let ci = 0; ci < CHUNKS; ci++) {
        const geo = new THREE.BufferGeometry();
        const verts = (CHUNK_SEGS + 1) * (CHUNK_SEGS + 1);
        const pos = new Float32Array(verts * 3);
        const col = new Float32Array(verts * 3);
        const uv = new Float32Array(verts * 2);
        let p = 0;
        for (let j = 0; j <= CHUNK_SEGS; j++) {
          for (let i = 0; i <= CHUNK_SEGS; i++) {
            const gi = ci * CHUNK_SEGS + i, gj = cj * CHUNK_SEGS + j;
            const x = -WORLD_SIZE / 2 + gi * GRID_STEP;
            const z = -WORLD_SIZE / 2 + gj * GRID_STEP;
            const y = this.heights[gj * GRID_N + gi];
            pos[p * 3] = x; pos[p * 3 + 1] = y; pos[p * 3 + 2] = z;
            this.colorAt(x, z, color);
            col[p * 3] = color.r; col[p * 3 + 1] = color.g; col[p * 3 + 2] = color.b;
            uv[p * 2] = (x + WORLD_SIZE / 2) / WORLD_SIZE; uv[p * 2 + 1] = (z + WORLD_SIZE / 2) / WORLD_SIZE;
            p++;
          }
        }
        const idx: number[] = [];
        for (let j = 0; j < CHUNK_SEGS; j++) {
          for (let i = 0; i < CHUNK_SEGS; i++) {
            const a = j * (CHUNK_SEGS + 1) + i, b = a + 1, c = a + CHUNK_SEGS + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
    // Smooth normals across chunk borders by recomputing from height grid
    for (const mesh of this.meshes) {
      const posAttr = mesh.geometry.getAttribute('position');
      const nrm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      const n = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        this.normalAt(posAttr.getX(i), posAttr.getZ(i), n);
        nrm.setXYZ(i, n.x, n.y, n.z);
      }
      nrm.needsUpdate = true;
    }
    return this.group;
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
  }
}

function makeDetailTexture(seed: number): THREE.Texture {
  const size = 256;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) {
    const tex = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }
  canvas.width = size; canvas.height = size;
  const img = ctx.createImageData(size, size);
  const n = new SimplexNoise(seed + 99);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable via 4D-ish trick: sample on a torus using two angles
      const ax = (x / size) * Math.PI * 2, ay = (y / size) * Math.PI * 2;
      const v1 = n.fbm(Math.cos(ax) * 2 + 10, Math.sin(ax) * 2 + Math.cos(ay) * 2, 3);
      const v2 = n.fbm(Math.sin(ay) * 2 - 10, Math.cos(ay) * 2 + Math.sin(ax) * 2, 3);
      const v = 0.78 + 0.22 * ((v1 + v2) * 0.5 + 0.5);
      const i = (y * size + x) * 4;
      img.data[i] = 255 * v; img.data[i + 1] = 255 * v; img.data[i + 2] = 255 * v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
