import * as THREE from 'three';

/** Lightweight rain: a cloud of streaks that follows the camera and wraps vertically. */
export class Rain {
  readonly points: THREE.LineSegments;
  private positions: Float32Array;
  private count: number;
  private box = new THREE.Vector3(36, 26, 36);
  private material: THREE.LineBasicMaterial;
  private speeds: Float32Array;

  constructor(scene: THREE.Scene, count = 1800) {
    this.count = count;
    this.positions = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this.box.x, y = Math.random() * this.box.y, z = (Math.random() - 0.5) * this.box.z;
      const len = 0.5 + Math.random() * 0.5;
      this.positions.set([x, y, z, x, y + len, z], i * 6);
      this.speeds[i] = 22 + Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: '#cfe0f0', transparent: true, opacity: 0, depthWrite: false });
    this.points = new THREE.LineSegments(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(dt: number, intensity: number, camera: THREE.Camera, groundY: number) {
    const target = Math.min(0.75, intensity);
    this.material.opacity += (target - this.material.opacity) * Math.min(1, dt * 2);
    this.points.visible = this.material.opacity > 0.01;
    if (!this.points.visible) return;
    const p = this.positions;
    const cam = camera.position;
    const bottom = Math.min(groundY - 4, cam.y - this.box.y * 0.5);
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const fall = this.speeds[i] * dt;
      p[o + 1] -= fall; p[o + 4] -= fall;
      if (p[o + 1] < bottom) {
        const ny = bottom + this.box.y;
        p[o + 4] = ny + (p[o + 4] - p[o + 1]);
        p[o + 1] = ny;
        p[o] = cam.x + (Math.random() - 0.5) * this.box.x; p[o + 3] = p[o];
        p[o + 2] = cam.z + (Math.random() - 0.5) * this.box.z; p[o + 5] = p[o + 2];
      }
      // keep within the box around the camera horizontally
      if (Math.abs(p[o] - cam.x) > this.box.x * 0.5) { p[o] = cam.x + (Math.random() - 0.5) * this.box.x; p[o + 3] = p[o]; }
      if (Math.abs(p[o + 2] - cam.z) > this.box.z * 0.5) { p[o + 2] = cam.z + (Math.random() - 0.5) * this.box.z; p[o + 5] = p[o + 2]; }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
