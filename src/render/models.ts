import * as THREE from 'three';
import type { HominidState, ItemId, AgeStage, SpeciesId } from '@/core/types';
import { ITEMS } from '@/data/items';
import { SPECIES } from '@/data/species';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function sphere(r: number, m: THREE.Material, seg = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
  mesh.castShadow = true;
  return mesh;
}
function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), m);
  mesh.castShadow = true;
  return mesh;
}

/** A limb: pivot at the top joint; the mesh hangs down along -Y. */
function limb(r: number, len: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const mesh = capsule(r, len, m);
  mesh.position.y = -len / 2;
  g.add(mesh);
  return g;
}

/**
 * Merge all static child meshes of a group into one mesh with vertex colours
 * (one draw call instead of many). Non-mesh children are kept.
 */
export function bakeStatic(group: THREE.Group, material: THREE.Material): THREE.Mesh | null {
  const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  if (meshes.length < 2) return null;
  const parts: THREE.BufferGeometry[] = [];
  let total = 0;
  for (const m of meshes) {
    m.updateMatrix();
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(m.matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1));
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
    total += n;
  }
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, off * 3);
    nrm.set(g.getAttribute('normal').array as Float32Array, off * 3);
    col.set(g.getAttribute('color').array as Float32Array, off * 3);
    off += g.getAttribute('position').count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  for (const m of meshes) { group.remove(m); m.geometry.dispose(); }
  const merged = new THREE.Mesh(geo, material);
  merged.castShadow = true;
  merged.receiveShadow = true;
  group.add(merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Hominid rig
// ---------------------------------------------------------------------------

export class HominidRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private torso: THREE.Mesh;
  private head: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;
  private foreL: THREE.Group; private foreR: THREE.Group;
  private legL: THREE.Group; private legR: THREE.Group;
  private shinL: THREE.Group; private shinR: THREE.Group;
  readonly handL = new THREE.Group(); readonly handR = new THREE.Group();
  readonly back = new THREE.Group();
  private phase = 0;
  private t = 0;
  private lean = 0;
  private breathe = 0;
  bipedal = false;
  scaleFactor = 1;
  private furMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private bakedMat: THREE.MeshStandardMaterial;
  private highlight = 0;

  constructor(furColor = '#100d0c', skinColor = '#6e5140') {
    this.furMat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.95, flatShading: true });
    this.skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8, flatShading: true });
    this.bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const fur = this.furMat, skin = this.skinMat;

    const dark = mat('#1a1210');
    const furC = new THREE.Color(furColor);
    const chestMat = mat(furC.clone().offsetHSL(0, -0.05, 0.09).getStyle());
    // chimpanzee face: bare, darker than the body skin, lighter around the mouth
    const faceMat = mat(new THREE.Color(skinColor).offsetHSL(0, -0.1, -0.14).getStyle(), { roughness: 0.75 });
    const lipMat = mat(new THREE.Color(skinColor).offsetHSL(0, -0.05, -0.02).getStyle(), { roughness: 0.75 });

    // ---- Torso: furry human proportions - long trunk, broad shoulders, narrow waist, round hips
    this.torso = capsule(0.25, 0.5, fur);
    this.torso.scale.set(1.12, 1, 0.82);
    const chest = sphere(0.24, chestMat, 8); chest.position.set(0, 0.08, 0.15); chest.scale.set(1.15, 1.0, 0.5);
    const belly = sphere(0.24, fur, 10); belly.position.set(0, -0.2, 0.03); belly.scale.set(1.0, 0.85, 0.9);
    const hips = sphere(0.26, fur, 8); hips.position.set(0, -0.36, -0.02); hips.scale.set(1.05, 0.6, 0.9);
    const shoulders = capsule(0.12, 0.52, fur); shoulders.rotation.z = Math.PI / 2; shoulders.position.set(0, 0.32, -0.03);
    const deltL = sphere(0.125, fur, 7); deltL.position.set(-0.35, 0.3, -0.02);
    const deltR = deltL.clone(); deltR.position.x = 0.36;
    const neck = capsule(0.09, 0.1, fur); neck.position.set(0, 0.42, 0.03);
    const torsoGroup = new THREE.Group();
    torsoGroup.add(this.torso, chest, belly, hips, shoulders, deltL, deltR, neck);
    bakeStatic(torsoGroup, this.bakedMat);
    this.body.add(torsoGroup);

    // ---- Head: chimpanzee - round skull, big protruding ears, heavy brow, wide flat muzzle, wide mouth
    this.head = new THREE.Group();
    const skull = sphere(0.2, fur, 10); skull.scale.set(1.05, 1, 1.05); skull.position.y = 0.02;
    const cap = sphere(0.16, fur, 8); cap.position.set(0, 0.12, -0.03); cap.scale.set(1.05, 0.7, 1.1);
    const face = sphere(0.165, faceMat, 9); face.position.set(0, -0.03, 0.1); face.scale.set(1.0, 0.95, 0.75);
    const cheekL = sphere(0.075, faceMat, 7); cheekL.position.set(-0.1, -0.08, 0.16);
    const cheekR = cheekL.clone(); cheekR.position.x = 0.1;
    const muzzle = sphere(0.125, lipMat, 9); muzzle.position.set(0, -0.11, 0.2); muzzle.scale.set(1.3, 0.72, 0.75);
    const mouth = box(0.16, 0.012, 0.03, dark); mouth.position.set(0, -0.135, 0.285);
    const nose = sphere(0.045, faceMat, 6); nose.position.set(0, -0.07, 0.27); nose.scale.set(1.3, 0.6, 0.6);
    const nostrilL = sphere(0.014, dark, 5); nostrilL.position.set(-0.028, -0.078, 0.29);
    const nostrilR = nostrilL.clone(); nostrilR.position.x = 0.028;
    const brow = box(0.27, 0.06, 0.09, fur); brow.position.set(0, 0.06, 0.16); brow.rotation.x = 0.3;
    const browSkin = box(0.24, 0.035, 0.05, faceMat); browSkin.position.set(0, 0.025, 0.2);
    const eyeWhiteL = sphere(0.033, mat('#e9dfc8', { roughness: 0.35 }), 7); eyeWhiteL.position.set(-0.065, 0.0, 0.2);
    const eyeWhiteR = eyeWhiteL.clone(); eyeWhiteR.position.x = 0.065;
    const pupilL = sphere(0.02, mat('#0e0a08', { roughness: 0.25 }), 6); pupilL.position.set(-0.065, 0.0, 0.228);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.065;
    const earL = sphere(0.075, faceMat, 8); earL.position.set(-0.225, 0.01, -0.02); earL.scale.set(0.4, 1, 0.9);
    const earR = earL.clone(); earR.position.x = 0.225;
    const earInL = sphere(0.045, dark, 6); earInL.position.set(-0.235, 0.005, 0.0); earInL.scale.set(0.3, 0.8, 0.7);
    const earInR = earInL.clone(); earInR.position.x = 0.235;
    this.head.add(skull, cap, face, cheekL, cheekR, muzzle, mouth, nose, nostrilL, nostrilR, brow, browSkin, eyeWhiteL, eyeWhiteR, pupilL, pupilR, earL, earR, earInL, earInR);
    bakeStatic(this.head, this.bakedMat);
    this.head.position.set(0, 0.52, 0.05);
    this.body.add(this.head);

    // ---- Arms: chimpanzee - long and slender, forearms longer than upper arms, narrow hands with long fingers
    this.armL = limb(0.115, 0.5, fur); this.armL.position.set(-0.37, 0.28, -0.02);
    this.armR = limb(0.115, 0.5, fur); this.armR.position.set(0.37, 0.28, -0.02);
    this.foreL = limb(0.095, 0.54, fur); this.foreL.position.y = -0.5;
    this.foreR = limb(0.095, 0.54, fur); this.foreR.position.y = -0.5;
    this.armL.add(this.foreL); this.armR.add(this.foreR);
    const makeHand = () => {
      const g = new THREE.Group();
      const palm = box(0.125, 0.06, 0.17, skin); palm.position.set(0, 0, 0.03);
      const knuckles = box(0.125, 0.055, 0.06, fur); knuckles.position.set(0, 0.03, -0.03);
      for (let i = 0; i < 4; i++) {
        const f = capsule(0.018, 0.13, skin); f.position.set(-0.045 + i * 0.03, -0.05, 0.13); f.rotation.x = 1.35;
        g.add(f);
      }
      const thumb = capsule(0.015, 0.06, skin); thumb.position.set(0.065, -0.015, 0.05); thumb.rotation.z = -1.0; thumb.rotation.x = 0.5;
      g.add(palm, knuckles, thumb);
      bakeStatic(g, this.bakedMat);
      g.position.y = -0.56;
      return g;
    };
    this.foreL.add(makeHand()); this.foreR.add(makeHand());
    this.handL.position.set(0, -0.58, 0.08); this.handR.position.set(0, -0.58, 0.08);
    this.foreL.add(this.handL); this.foreR.add(this.handR);
    this.body.add(this.armL, this.armR);

    // ---- Legs: gorilla - short, very thick thighs and calves, broad grasping feet
    this.legL = limb(0.15, 0.3, fur); this.legL.position.set(-0.18, -0.34, 0);
    this.legR = limb(0.15, 0.3, fur); this.legR.position.set(0.18, -0.34, 0);
    this.shinL = limb(0.11, 0.3, fur); this.shinL.position.y = -0.3;
    this.shinR = limb(0.11, 0.3, fur); this.shinR.position.y = -0.3;
    this.legL.add(this.shinL); this.legR.add(this.shinR);
    for (const shin of [this.shinL, this.shinR]) {
      const calf = sphere(0.12, fur, 7); calf.position.set(0, -0.08, -0.03); calf.scale.set(1, 1.3, 1);
      const sole = box(0.16, 0.07, 0.3, skin); sole.position.set(0, -0.32, 0.07);
      for (let i = 0; i < 4; i++) { const toe = capsule(0.02, 0.05, skin); toe.position.set(-0.055 + i * 0.037, -0.33, 0.23); toe.rotation.x = Math.PI / 2; shin.add(toe); }
      const bigToe = capsule(0.024, 0.055, skin); bigToe.position.set(-0.09, -0.33, 0.14); bigToe.rotation.z = 1.2; shin.add(bigToe);
      shin.add(calf, sole);
      bakeStatic(shin, this.bakedMat);
    }
    this.body.add(this.legL, this.legR);

    this.back.position.set(0, 0.35, -0.3);
    this.body.add(this.back);

    this.root.add(this.body);
    this.body.position.y = 1.0;
  }

  setStage(stage: AgeStage) {
    const s = stage === 'baby' ? 0.4 : stage === 'child' ? 0.65 : stage === 'elder' ? 0.95 : 1;
    this.scaleFactor = s;
    this.root.scale.setScalar(s);
    if (stage === 'elder') { this.furMat.color.set('#3a3432'); this.bakedMat.color.set('#c9c2bd'); }
  }

  setHighlight(v: number) {
    this.highlight = v;
    this.furMat.emissive.set('#ffcc66').multiplyScalar(v * 0.5);
    this.bakedMat.emissive.copy(this.furMat.emissive);
  }

  setColors(fur: string, skin: string) {
    this.furMat.color.set(fur);
    this.skinMat.color.set(skin);
  }

  /**
   * Procedural animation.
   * @param speed horizontal speed in units/s
   * @param climbSpeed vertical climb speed
   */
  update(dt: number, state: HominidState, speed: number, climbSpeed = 0, extras: { attackT?: number; dodgeT?: number; grounded?: boolean } = {}) {
    this.t += dt;
    const bip = this.bipedal;
    const stride = bip ? 1.9 : 1.6;
    this.phase += dt * Math.max(speed, 0) * (bip ? 3.4 : 4.2) / stride;
    const p = this.phase;
    const swing = Math.sin(p), swing2 = Math.sin(p + Math.PI);
    const moving = speed > 0.3;
    this.breathe = Math.sin(this.t * 2.2) * 0.02;

    // Defaults (idle)
    let bodyY = bip ? 1.05 : 0.89;
    let torsoPitch = bip ? 0.1 : 0.55; // radians forward lean
    let armL = 0, armR = 0, foreL = 0, foreR = 0, legL = 0, legR = 0, shinL = 0, shinR = 0;
    let headPitch = bip ? 0 : -0.15;
    let bodyRoll = 0;
    let bodyYaw = 0;

    switch (state) {
      case 'idle':
      case 'eat':
      case 'drink':
      case 'groom':
        if (bip) { armL = 0.15; armR = -0.15; foreL = 0.2; foreR = 0.2; }
        else {
          // quadruped stance: limb angles are expressed in world pitch, then made relative to the leaning torso
          armL = 0.1 - torsoPitch; armR = armL; foreL = 0.05; foreR = 0.05;
          legL = 0.45 - torsoPitch; legR = legL; shinL = -0.5; shinR = -0.5; bodyY = 0.9;
        }
        if (state === 'eat' || state === 'drink') { armR = -1.4; foreR = -1.5; headPitch = state === 'drink' ? -0.9 : -0.3; }
        if (state === 'groom') { armL = -1.0; foreL = -0.9; armR = -1.1; foreR = -0.8; }
        bodyY += this.breathe;
        break;
      case 'walk':
      case 'run': {
        const amp = state === 'run' ? 0.95 : 0.6;
        if (bip) {
          legL = swing * amp; legR = swing2 * amp;
          shinL = Math.max(0, -Math.sin(p - 0.6)) * amp * 1.3; shinR = Math.max(0, -Math.sin(p + Math.PI - 0.6)) * amp * 1.3;
          armL = swing2 * amp * 0.6; armR = swing * amp * 0.6; foreL = 0.4; foreR = 0.4;
          torsoPitch = state === 'run' ? 0.35 : 0.12;
          bodyY = 1.05 + Math.abs(Math.cos(p)) * 0.05;
        } else {
          // knuckle-walk: arms act as front legs; thighs swing forward-down, shins fold back under the hips
          torsoPitch = state === 'run' ? 0.7 : 0.6;
          armL = 0.1 + swing * amp * 0.55 - torsoPitch; armR = 0.1 + swing2 * amp * 0.55 - torsoPitch;
          foreL = 0.05 + Math.max(0, Math.sin(p + 0.8)) * 0.45; foreR = 0.05 + Math.max(0, Math.sin(p + Math.PI + 0.8)) * 0.45;
          legL = 0.5 + swing2 * amp * 0.5 - torsoPitch; legR = 0.5 + swing * amp * 0.5 - torsoPitch;
          shinL = -0.65 + Math.max(0, Math.sin(p + Math.PI - 0.5)) * 0.6; shinR = -0.65 + Math.max(0, Math.sin(p - 0.5)) * 0.6;
          bodyY = 0.89 + Math.abs(Math.sin(p)) * (state === 'run' ? 0.06 : 0.03);
          bodyRoll = Math.sin(p) * 0.06;
        }
        break;
      }
      case 'climb': {
        const cp = this.t * 5 + climbSpeed;
        this.phase += dt * Math.abs(climbSpeed) * 3;
        const q = this.phase;
        torsoPitch = -0.15; bodyY = 0.95;
        armL = -2.4 + Math.sin(q) * 0.5; armR = -2.4 + Math.sin(q + Math.PI) * 0.5;
        foreL = 0.9; foreR = 0.9;
        legL = 1.1 + Math.sin(q + Math.PI) * 0.6; legR = 1.1 + Math.sin(q) * 0.6;
        shinL = -1.9; shinR = -1.9;
        headPitch = 0.4;
        void cp;
        break;
      }
      case 'jump':
      case 'fall':
        torsoPitch = 0.4; bodyY = 1.0;
        armL = -2.3; armR = -2.3; foreL = 0.4; foreR = 0.4;
        legL = 0.9; legR = 0.6; shinL = -1.4; shinR = -1.2;
        break;
      case 'swim': {
        const q = this.t * 6;
        torsoPitch = 1.45; bodyY = 0.35;
        armL = -1.2 + Math.sin(q) * 1.2; armR = -1.2 + Math.sin(q + Math.PI) * 1.2;
        foreL = 0.3; foreR = 0.3;
        legL = Math.sin(q * 1.5) * 0.5; legR = -Math.sin(q * 1.5) * 0.5; shinL = -0.3; shinR = -0.3;
        headPitch = -0.9;
        break;
      }
      case 'attack': {
        const a = extras.attackT ?? 0; // 0..1
        const s = Math.sin(a * Math.PI);
        torsoPitch = bip ? 0.3 + s * 0.4 : 0.6 + s * 0.4;
        armR = -2.8 + a * 3.6; foreR = 0.2 + s * 0.3;
        armL = -0.5; foreL = 0.5;
        legL = 0.6; legR = 0.3; shinL = -1.2; shinR = -0.8;
        bodyY = (bip ? 1.05 : 0.85) - s * 0.1;
        bodyYaw = -0.4 + a * 0.6;
        break;
      }
      case 'dodge': {
        const d = extras.dodgeT ?? 0;
        const s = Math.sin(d * Math.PI);
        torsoPitch = 1.1; bodyY = 0.6 + s * 0.2; bodyRoll = s * 0.8;
        armL = -1.0; armR = -1.5; foreL = 0.8; foreR = 0.5; legL = 1.3; legR = 0.8; shinL = -1.8; shinR = -1.5;
        break;
      }
      case 'sleep':
        torsoPitch = 1.5; bodyY = 0.32; bodyRoll = 1.4;
        armL = -0.8; armR = -1.6; foreL = -1.2; foreR = -1.2; legL = 1.4; legR = 1.2; shinL = -1.9; shinR = -1.8;
        headPitch = 0.4;
        bodyY += this.breathe * 0.5;
        break;
      case 'dead':
        torsoPitch = 1.55; bodyY = 0.3; bodyRoll = 1.6;
        armL = -1.2; armR = -0.3; foreL = 0; foreR = 0; legL = 0.4; legR = 0.9; shinL = -0.2; shinR = -0.6;
        headPitch = 0.3;
        break;
    }
    void moving;

    const k = Math.min(1, dt * 12);
    this.lean += (torsoPitch - this.lean) * k;
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.set(this.lean, bodyYaw, bodyRoll);
    this.head.rotation.x += (headPitch - this.head.rotation.x) * k;
    const lookAround = (state === 'idle' || state === 'walk') ? Math.sin(this.t * 0.7) * 0.35 + Math.sin(this.t * 1.9) * 0.1 : 0;
    this.head.rotation.y += (lookAround - this.head.rotation.y) * Math.min(1, dt * 3);
    const lerpRot = (g: THREE.Group, x: number) => { g.rotation.x += (x - g.rotation.x) * k; };
    lerpRot(this.armL, armL); lerpRot(this.armR, armR);
    lerpRot(this.foreL, foreL); lerpRot(this.foreR, foreR);
    lerpRot(this.legL, legL); lerpRot(this.legR, legR);
    lerpRot(this.shinL, shinL); lerpRot(this.shinR, shinR);
    if (this.highlight > 0) { this.furMat.emissiveIntensity = 0.5 + Math.sin(this.t * 4) * 0.3; this.bakedMat.emissiveIntensity = this.furMat.emissiveIntensity; }
  }

  dispose() {
    this.root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    this.furMat.dispose(); this.skinMat.dispose(); this.bakedMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Animal rig
// ---------------------------------------------------------------------------

export class AnimalRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private head: THREE.Group;
  private tail: THREE.Group | null = null;
  private wings: THREE.Group[] = [];
  private phase = 0;
  private t = 0;
  readonly species: SpeciesId;
  private bodyMat: THREE.MeshStandardMaterial;
  private baseY: number;

  constructor(species: SpeciesId) {
    this.species = species;
    const def = SPECIES[species];
    const s = def.size;
    this.bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9, flatShading: true });
    const m = this.bodyMat;
    const dark = mat('#221a14');
    const kind = def.aquatic && species !== 'giant_otter' ? 'reptile' : species === 'python' ? 'snake' : def.flying ? 'bird' : species === 'fish' ? 'fish' : species === 'bee' || species === 'centipede' ? 'bug' : 'quad';

    this.head = new THREE.Group();
    this.baseY = 0.5 * s;

    if (kind === 'quad') {
      const long = species === 'machairodus' || species === 'hyena' ? 1.15 : 1;
      const torso = capsule(0.32 * s, 0.9 * s * long, m);
      torso.rotation.z = Math.PI / 2;
      this.body.add(torso);
      const skull = sphere(0.26 * s, m, 8); skull.scale.set(1, 0.9, 1.25);
      this.head.add(skull);
      const eye = sphere(0.04 * s, dark, 5); eye.position.set(-0.13 * s, 0.08 * s, 0.22 * s);
      const eye2 = eye.clone(); eye2.position.x = 0.13 * s;
      this.head.add(eye, eye2);
      if (species === 'machairodus') {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.22 * s, 5), mat('#f4efe0'));
        fang.position.set(-0.08 * s, -0.2 * s, 0.24 * s); fang.rotation.x = Math.PI;
        const fang2 = fang.clone(); fang2.position.x = 0.08 * s;
        this.head.add(fang, fang2);
        const earA = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.12 * s, 4), m); earA.position.set(-0.15 * s, 0.24 * s, 0);
        const earB = earA.clone(); earB.position.x = 0.15 * s;
        this.head.add(earA, earB);
      }
      if (species === 'metridiochoerus' || species === 'deinotherium') {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.35 * s, 5), mat('#efe6cc'));
        tusk.position.set(-0.14 * s, -0.1 * s, 0.3 * s); tusk.rotation.x = species === 'deinotherium' ? Math.PI : -Math.PI / 2 + 0.5;
        const tusk2 = tusk.clone(); tusk2.position.x = 0.14 * s;
        this.head.add(tusk, tusk2);
        if (species === 'deinotherium') {
          const trunk = capsule(0.08 * s, 0.7 * s, m); trunk.position.set(0, -0.35 * s, 0.3 * s); trunk.rotation.x = 0.4;
          this.head.add(trunk);
          const earL = box(0.05 * s, 0.4 * s, 0.35 * s, m); earL.position.set(-0.3 * s, 0.05 * s, -0.05 * s);
          const earR = earL.clone(); earR.position.x = 0.3 * s;
          this.head.add(earL, earR);
        }
      }
      if (species === 'antelope') {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.4 * s, 5), mat('#4a3a2a')); horn.position.set(-0.08 * s, 0.35 * s, -0.05 * s); horn.rotation.x = -0.3;
        const horn2 = horn.clone(); horn2.position.x = 0.08 * s;
        this.head.add(horn, horn2);
      }
      this.head.position.set(0, 0.18 * s, 0.62 * s * long);
      this.body.add(this.head);
      const legLen = (species === 'antelope' ? 0.65 : species === 'deinotherium' ? 0.75 : 0.5) * s;
      this.baseY = legLen + 0.25 * s;
      const legR = 0.08 * s;
      const offsets: [number, number][] = [[-0.2, 0.38 * long], [0.2, 0.38 * long], [-0.2, -0.38 * long], [0.2, -0.38 * long]];
      for (const [x, z] of offsets) {
        const l = limb(legR, legLen, m);
        l.position.set(x * s, -0.15 * s, z * s);
        this.body.add(l); this.legs.push(l);
      }
      this.tail = limb(0.04 * s, 0.5 * s, m);
      this.tail.position.set(0, 0.1 * s, -0.55 * s * long);
      this.tail.rotation.x = -2.2;
      this.body.add(this.tail);
    } else if (kind === 'reptile') {
      const torso = capsule(0.28 * s, 1.4 * s, m); torso.rotation.z = Math.PI / 2; torso.scale.y = 0.6;
      this.body.add(torso);
      const skull = box(0.36 * s, 0.18 * s, 0.7 * s, m); this.head.add(skull);
      const eye = sphere(0.04 * s, dark, 5); eye.position.set(-0.14 * s, 0.1 * s, -0.1 * s); const eye2 = eye.clone(); eye2.position.x = 0.14 * s;
      this.head.add(eye, eye2);
      this.head.position.set(0, 0.02 * s, 1.0 * s);
      this.body.add(this.head);
      this.baseY = 0.28 * s;
      for (const [x, z] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.4], [0.3, -0.4]] as [number, number][]) {
        const l = limb(0.06 * s, 0.25 * s, m); l.position.set(x * s, -0.05 * s, z * s); l.rotation.z = x < 0 ? 0.9 : -0.9;
        this.body.add(l); this.legs.push(l);
      }
      this.tail = limb(0.12 * s, 1.2 * s, m); this.tail.position.set(0, 0, -0.8 * s); this.tail.rotation.x = -Math.PI / 2 - 0.05;
      this.body.add(this.tail);
    } else if (kind === 'snake') {
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const seg = sphere(0.14 * s * (1 - i / segs * 0.5), m, 7); seg.position.set(Math.sin(i * 0.9) * 0.2 * s, 0, -i * 0.25 * s);
        this.body.add(seg); this.legs.push(new THREE.Group().add(seg));
      }
      const skull = sphere(0.16 * s, m, 7); skull.scale.set(1.2, 0.7, 1.4); this.head.add(skull);
      const eye = sphere(0.03 * s, mat('#e0c020'), 5); eye.position.set(-0.08 * s, 0.05 * s, 0.1 * s); const eye2 = eye.clone(); eye2.position.x = 0.08 * s;
      this.head.add(eye, eye2);
      this.head.position.set(0, 0.05 * s, 0.2 * s);
      this.body.add(this.head);
      this.baseY = 0.14 * s;
    } else if (kind === 'bird') {
      const torso = sphere(0.22 * s, m, 8); torso.scale.set(1, 0.9, 1.6); this.body.add(torso);
      const skull = sphere(0.14 * s, m, 7); this.head.add(skull);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.18 * s, 5), mat('#d8b040')); beak.rotation.x = Math.PI / 2; beak.position.z = 0.18 * s;
      this.head.add(beak);
      this.head.position.set(0, 0.15 * s, 0.35 * s);
      this.body.add(this.head);
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        const wing = box(1.1 * s, 0.03 * s, 0.45 * s, m); wing.position.x = side * 0.55 * s;
        w.add(wing); w.position.set(side * 0.15 * s, 0.1 * s, 0);
        this.body.add(w); this.wings.push(w);
      }
      this.baseY = species === 'bee' ? 1.2 : 6;
    } else if (kind === 'fish') {
      const torso = sphere(0.18 * s, m, 7); torso.scale.set(0.7, 1, 2); this.body.add(torso);
      const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.25 * s, 4), m); tailFin.rotation.x = Math.PI / 2; tailFin.position.z = -0.42 * s;
      this.tail = new THREE.Group().add(tailFin); this.body.add(this.tail);
      this.baseY = -0.6;
    } else {
      // bug
      const torso = sphere(0.12 * s, m, 6); torso.scale.set(1, 0.8, 1.6); this.body.add(torso);
      const skull = sphere(0.08 * s, m, 6); skull.position.z = 0.18 * s; this.head.add(skull); this.body.add(this.head);
      this.baseY = species === 'bee' ? 1.3 : 0.1;
      if (species === 'bee') {
        for (const side of [-1, 1]) {
          const w = new THREE.Group();
          const wing = box(0.25 * s, 0.01 * s, 0.12 * s, mat('#ffffff', { transparent: true, opacity: 0.5 })); wing.position.x = side * 0.13 * s;
          w.add(wing); this.body.add(w); this.wings.push(w);
        }
      }
    }
    bakeStatic(this.head, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    this.body.position.y = this.baseY;
    this.root.add(this.body);
  }

  update(dt: number, speed: number, state: string) {
    this.t += dt;
    this.phase += dt * speed * 2.2;
    const p = this.phase;
    const def = SPECIES[this.species];
    const moving = speed > 0.2;
    if (this.legs.length === 4) {
      const amp = moving ? Math.min(0.9, speed / def.speed) : 0;
      this.legs[0].rotation.x = Math.sin(p) * amp;
      this.legs[1].rotation.x = Math.sin(p + Math.PI) * amp;
      this.legs[2].rotation.x = Math.sin(p + Math.PI) * amp;
      this.legs[3].rotation.x = Math.sin(p) * amp;
      this.body.position.y = this.baseY + Math.abs(Math.sin(p)) * amp * 0.08 * def.size;
      if (state === 'sleep') { this.body.position.y = this.baseY * 0.55; this.body.rotation.z = 0.5; } else this.body.rotation.z = 0;
      if (state === 'attack') { this.body.rotation.x = -0.25; } else this.body.rotation.x = Math.sin(this.t * 1.5) * 0.02;
      if (this.tail) this.tail.rotation.y = Math.sin(this.t * 3) * 0.3;
      this.head.rotation.x = state === 'stalk' ? 0.25 : state === 'eat' ? 0.6 : Math.sin(this.t * 0.7) * 0.05;
    } else if (this.legs.length > 4) {
      // snake slither
      this.legs.forEach((g, i) => {
        const seg = g.children[0] as THREE.Mesh;
        seg.position.x = Math.sin(this.phase * 1.5 + i * 0.9) * 0.2 * def.size * (moving ? 1 : 0.3);
      });
    }
    if (this.wings.length) {
      const flap = Math.sin(this.t * (this.species === 'bee' ? 60 : 6)) * (this.species === 'bee' ? 0.6 : 0.5);
      this.wings[0].rotation.z = flap; this.wings[1].rotation.z = -flap;
      this.body.rotation.z = -Math.sin(this.t * 0.8) * 0.2;
    }
    if (this.tail && this.species === 'fish') this.tail.rotation.y = Math.sin(this.t * 8) * 0.5;
  }

  setDead() {
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = this.baseY * 0.5;
  }

  dispose() {
    this.root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    this.bodyMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const itemGeoCache = new Map<ItemId, THREE.BufferGeometry>();

export function itemGeometry(id: ItemId): THREE.BufferGeometry {
  let g = itemGeoCache.get(id);
  if (g) return g;
  switch (id) {
    case 'stick': case 'sharp_stick': case 'branch': case 'reed':
      g = new THREE.CylinderGeometry(id === 'sharp_stick' ? 0.0 : 0.035, 0.05, id === 'reed' ? 1.6 : 1.1, 6); g.rotateZ(Math.PI / 2); break;
    case 'stone_granite': case 'stone_basalt': case 'stone_obsidian': case 'grinder': case 'chopper':
      g = new THREE.DodecahedronGeometry(0.16, 0); if (id === 'grinder') g.scale(1.2, 0.6, 1.2); if (id === 'chopper') g.scale(1.1, 0.5, 1.3); break;
    case 'coconut': case 'coconut_open': g = new THREE.SphereGeometry(0.18, 8, 6); break;
    case 'banana': g = new THREE.CapsuleGeometry(0.05, 0.25, 2, 6); g.rotateZ(1.1); break;
    case 'mango': g = new THREE.SphereGeometry(0.13, 8, 6); g.scale(0.9, 1.2, 0.9); break;
    case 'berry': g = new THREE.SphereGeometry(0.1, 6, 5); break;
    case 'honey': g = new THREE.BoxGeometry(0.25, 0.18, 0.12); break;
    case 'egg': g = new THREE.SphereGeometry(0.1, 8, 6); g.scale(0.85, 1.15, 0.85); break;
    case 'mushroom': g = new THREE.ConeGeometry(0.14, 0.12, 8); g.translate(0, 0.12, 0); break;
    case 'meat': g = new THREE.BoxGeometry(0.28, 0.16, 0.2); break;
    case 'fish': g = new THREE.SphereGeometry(0.12, 6, 5); g.scale(0.6, 0.8, 2); break;
    case 'bone': case 'bone_sharp': g = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6); g.rotateZ(Math.PI / 2); break;
    case 'water_gourd': g = new THREE.SphereGeometry(0.16, 8, 6); g.scale(1, 1.3, 1); break;
    case 'horsetail': case 'khat_leaf': case 'natal_grass': case 'fibers': case 'kapok_fiber':
      g = new THREE.ConeGeometry(0.12, 0.45, 5); g.translate(0, 0.2, 0); break;
    case 'thorn': g = new THREE.ConeGeometry(0.03, 0.2, 4); g.rotateZ(Math.PI / 2); break;
    default: g = new THREE.SphereGeometry(0.12, 6, 5);
  }
  itemGeoCache.set(id, g);
  return g;
}

export function makeItemMesh(id: ItemId): THREE.Mesh {
  const def = ITEMS[id];
  const mesh = new THREE.Mesh(itemGeometry(id), mat(def.color));
  mesh.castShadow = true;
  return mesh;
}
