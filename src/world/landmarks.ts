import * as THREE from 'three';
import type { BiomeId, Vec3 } from '@/core/types';
import { Terrain, WORLD_SIZE } from './terrain';
import { mat } from '@/render/models';
import { mulberry32, type Rng } from '@/util/rng';

export type LandmarkId = 'great_baobab' | 'stone_arch' | 'ancient_bones' | 'hot_spring' | 'cave' | 'fallen_giant';

export interface LandmarkDef {
  id: LandmarkId;
  name: string;
  description: string;
  biomes: BiomeId[];
  /** scent / noise for the senses */
  scent: number;
  noise: number;
}

export const LANDMARKS: Record<LandmarkId, LandmarkDef> = {
  great_baobab: { id: 'great_baobab', name: 'The Great Baobab', description: 'A tree older than memory. Its crown shelters a whole clan.', biomes: ['savanna'], scent: 0.2, noise: 0.3 },
  stone_arch: { id: 'stone_arch', name: 'Stone Arch', description: 'Wind and time carved a gate in the rock.', biomes: ['cliffs', 'savanna'], scent: 0.05, noise: 0.5 },
  ancient_bones: { id: 'ancient_bones', name: 'Ancient Bones', description: 'The ribs of a giant, bleached white. Good bones for tools.', biomes: ['savanna', 'beach'], scent: 0.4, noise: 0.05 },
  hot_spring: { id: 'hot_spring', name: 'Hot Spring', description: 'Warm water steams from the ground. Cures the cold.', biomes: ['swamp', 'jungle'], scent: 0.8, noise: 0.4 },
  cave: { id: 'cave', name: 'Dark Cave', description: 'A hollow in the cliff. Something may live inside.', biomes: ['cliffs'], scent: 0.5, noise: 0.6 },
  fallen_giant: { id: 'fallen_giant', name: 'Fallen Giant', description: 'A colossal trunk lying across the forest floor, wrapped in moss.', biomes: ['jungle', 'swamp'], scent: 0.3, noise: 0.1 },
};

export interface Landmark {
  def: LandmarkDef;
  position: THREE.Vector3;
  group: THREE.Group;
  uid: string;
}

function buildMesh(id: LandmarkId, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  switch (id) {
    case 'great_baobab': {
      const bark = mat('#8a7a62');
      const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(4, 6.5, 22, 12), bark)); trunk.position.y = 11;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 9, 6), bark));
        b.position.set(Math.cos(a) * 3.5, 24, Math.sin(a) * 3.5);
        b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      }
      const crown = add(new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), mat('#a8a050'))); crown.scale.set(1.5, 0.5, 1.5); crown.position.y = 28;
      break;
    }
    case 'stone_arch': {
      const rock = mat('#8a8074');
      const l = add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 14, 7), rock)); l.position.set(-6, 7, 0);
      const r = add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 14, 7), rock)); r.position.set(6, 7, 0);
      const top = add(new THREE.Mesh(new THREE.BoxGeometry(17, 3, 4), rock)); top.position.y = 14.5; top.rotation.z = 0.05;
      break;
    }
    case 'ancient_bones': {
      const bone = mat('#e8e0cc');
      const spine = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 18, 6), bone)); spine.rotation.z = Math.PI / 2; spine.position.y = 1.2;
      for (let i = 0; i < 8; i++) {
        for (const side of [-1, 1]) {
          const rib = add(new THREE.Mesh(new THREE.TorusGeometry(3.2 + i * 0.1, 0.22, 6, 12, Math.PI), bone));
          rib.position.set(-7 + i * 2, 1, 0);
          rib.rotation.y = Math.PI / 2; rib.rotation.z = side > 0 ? 0 : Math.PI;
          rib.scale.set(1, 1, side);
        }
      }
      const skull = add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), bone)); skull.position.set(10.5, 1.8, 0); skull.scale.set(1.3, 0.9, 1);
      break;
    }
    case 'hot_spring': {
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(4.5, 1, 8, 20), mat('#7a6a5a'))); rim.rotation.x = Math.PI / 2; rim.position.y = 0.3;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.4, 24), new THREE.MeshStandardMaterial({ color: '#4fc3c9', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85, emissive: '#1a5a60', emissiveIntensity: 0.4 }));
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.35; g.add(pool);
      for (let i = 0; i < 6; i++) {
        const steam = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rng() * 0.6, 7, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
        steam.position.set((rng() - 0.5) * 5, 1.5 + rng() * 3, (rng() - 0.5) * 5);
        steam.userData.steam = { phase: rng() * 6 };
        g.add(steam);
      }
      const light = new THREE.PointLight('#5fe0e8', 3, 20, 1.5); light.position.y = 2; g.add(light);
      break;
    }
    case 'cave': {
      const rock = mat('#6f665c');
      const hill = add(new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), rock)); hill.scale.set(1.4, 0.8, 1.1); hill.position.y = 1;
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 6, 10), new THREE.MeshBasicMaterial({ color: '#050505' }));
      mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 2.2, 10); g.add(mouth);
      for (let i = 0; i < 5; i++) { const s = add(new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rng() * 1.5, 0), rock)); s.position.set((rng() - 0.5) * 16, 0.5, 9 + rng() * 4); }
      break;
    }
    case 'fallen_giant': {
      const bark = mat('#4a3626');
      const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 34, 12), bark)); trunk.rotation.z = Math.PI / 2; trunk.rotation.y = 0.3; trunk.position.y = 2.2;
      const roots = add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 1, 2, 9), bark)); roots.rotation.z = Math.PI / 2; roots.position.set(-17, 3, -5);
      for (let i = 0; i < 12; i++) {
        const moss = add(new THREE.Mesh(new THREE.SphereGeometry(0.8 + rng() * 1.2, 6, 5), mat('#4f8f3a')));
        const t = -14 + i * 2.5;
        moss.position.set(t * Math.cos(0.3), 3.6 + rng() * 0.8, -t * Math.sin(0.3) + (rng() - 0.5) * 3);
        moss.scale.y = 0.4;
      }
      break;
    }
  }
  return g;
}

/** Place one of each landmark far from the settlement in a fitting biome. Deterministic per seed. */
export function placeLandmarks(terrain: Terrain, seed: number, settlement: Vec3): Landmark[] {
  const rng = mulberry32(seed ^ 0x1a9d3e7);
  const out: Landmark[] = [];
  const taken: THREE.Vector3[] = [];
  for (const def of Object.values(LANDMARKS)) {
    let best: THREE.Vector3 | null = null;
    for (let i = 0; i < 3000 && !best; i++) {
      const x = (rng() - 0.5) * (WORLD_SIZE - 160), z = (rng() - 0.5) * (WORLD_SIZE - 160);
      const s = terrain.sample(x, z);
      if (!def.biomes.includes(s.biome) || s.slope > 0.22) continue;
      if (def.id !== 'hot_spring' && s.height < 1.5) continue;
      const d = Math.hypot(x - settlement.x, z - settlement.z);
      if (d < 140 || d > 520) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 120)) continue;
      best = new THREE.Vector3(x, s.height, z);
    }
    if (!best) continue;
    taken.push(best);
    const group = buildMesh(def.id, rng);
    group.position.copy(best);
    group.position.y -= 0.3;
    group.rotation.y = rng() * Math.PI * 2;
    out.push({ def, position: best, group, uid: `landmark_${def.id}` });
  }
  return out;
}

/** Animate steam etc. */
export function updateLandmarks(landmarks: Landmark[], time: number) {
  for (const l of landmarks) {
    if (l.def.id !== 'hot_spring') continue;
    l.group.children.forEach((c) => {
      const st = c.userData.steam as { phase: number } | undefined;
      if (!st) return;
      c.position.y = 1.5 + ((time * 0.6 + st.phase) % 4);
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 * (1 - ((time * 0.6 + st.phase) % 4) / 4);
    });
  }
}
