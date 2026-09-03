// Developer page: renders hominid and animal rigs in fixed poses for model review.
// Open /rig.html (dev server). Query: ?view=side|front|back (default side), ?walk=1 animates.
import * as THREE from 'three';
import { HominidRig, AnimalRig } from '@/render/models';
import type { HominidState, SpeciesId } from '@/core/types';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'side';
const species = params.get('animal') as SpeciesId | null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfd8dc');
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, new THREE.HemisphereLight('#dfe9f3', '#6b5a48', 0.9), new THREE.AmbientLight('#ffffff', 0.2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#8fa64a', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, '#5c6b3a', '#7e8f52');
grid.position.y = 0.01;
scene.add(grid);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);

const poses: { state: HominidState; speed: number; label: string }[] = [
  { state: 'idle', speed: 0, label: 'idle' },
  { state: 'walk', speed: 3.4, label: 'walk' },
  { state: 'run', speed: 7, label: 'run' },
];

const rigs: { rig: HominidRig; pose: (typeof poses)[number] }[] = [];
const animalRigs: AnimalRig[] = [];

if (species) {
  const r = new AnimalRig(species);
  r.root.position.set(0, 0, 0);
  scene.add(r.root);
  animalRigs.push(r);
} else {
  poses.forEach((pose, i) => {
    const rig = new HominidRig();
    rig.root.position.set((i - 1) * 2.4, 0, 0);
    // model faces +z; rotate so the chosen view sees it
    rig.root.rotation.y = view === 'side' ? Math.PI / 2 : view === 'back' ? Math.PI : 0;
    scene.add(rig.root);
    rigs.push({ rig, pose });
  });
}

camera.position.set(0, 1.6, 7.5);
camera.lookAt(0, 0.8, 0);

let t = 0;
const walk = params.get('walk') === '1';
function frame() {
  t += 1 / 60;
  for (const { rig, pose } of rigs) rig.update(1 / 60, pose.state, walk || pose.speed === 0 ? pose.speed : 0, 0);
  for (const r of animalRigs) r.update(1 / 60, walk ? 3 : 0, 'wander');
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// Prime the pose lerps so the first frames already show the target pose.
for (let i = 0; i < 90; i++) {
  for (const { rig, pose } of rigs) rig.update(1 / 60, pose.state, pose.speed, 0);
  for (const r of animalRigs) r.update(1 / 60, walk ? 3 : 0, 'wander');
}
frame();
(window as unknown as { rigReady: boolean }).rigReady = true;
