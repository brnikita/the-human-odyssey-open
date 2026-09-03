import * as THREE from 'three';
import { t } from '@/i18n';

export interface IntroShot {
  /** camera position keyframe (world) */
  pos: THREE.Vector3;
  /** look-at keyframe (world) */
  look: THREE.Vector3;
}

export interface IntroCaption {
  from: number;
  to: number;
  key: string;
  /** big title style */
  title?: boolean;
}

export interface IntroContext {
  settlement: THREE.Vector3;
  lakeCenter: THREE.Vector3;
  heightAt: (x: number, z: number) => number;
}

/** Duration of the intro cinematic in seconds. */
export const INTRO_DURATION = 30;

/**
 * Opening cinematic: a slow flight over the world at dawn ending at the
 * settlement, with letterbox bars and captions. Fully procedural, skippable.
 */
export class IntroCinematic {
  readonly root: HTMLElement;
  private caption: HTMLElement;
  private title: HTMLElement;
  private fade: HTMLElement;
  private skipHint: HTMLElement;
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  private captions: IntroCaption[];
  private heightAt: (x: number, z: number) => number;
  time = 0;
  done = false;
  private finishCb: (() => void) | null = null;
  private lastCaption = '';

  constructor(parent: HTMLElement, ctx: IntroContext) {
    this.heightAt = ctx.heightAt;
    this.root = document.createElement('div');
    this.root.className = 'intro';
    this.root.innerHTML = '<div class="bar top"></div><div class="bar bottom"></div><div class="caption"></div><div class="title"></div><div class="skip"></div><div class="fade"></div>';
    this.caption = this.root.querySelector('.caption')!;
    this.title = this.root.querySelector('.title')!;
    this.fade = this.root.querySelector('.fade')!;
    this.skipHint = this.root.querySelector('.skip')!;
    this.skipHint.textContent = t('intro.skip');
    parent.appendChild(this.root);

    const s = ctx.settlement, lake = ctx.lakeCenter;
    const toLake = lake.clone().sub(s).setY(0);
    const dir = toLake.lengthSq() > 1 ? toLake.normalize() : new THREE.Vector3(-1, 0, 0);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lift = (v: THREE.Vector3, h: number) => { v.y = Math.max(this.heightAt(v.x, v.z), 0) + h; return v; };
    // Camera path: sunrise across the lake -> low over the water -> along the shore and over the canopy ->
    // descending into the settlement clearing -> slow orbit around the clan. Look targets stay near the horizon.
    // `dir` points from the settlement towards the lake, so "lake + dir*k" is the far shore.
    const positions = [
      lift(lake.clone().addScaledVector(dir, 95).addScaledVector(side, 40), 30),   // far shore, sunrise ahead
      lift(lake.clone().addScaledVector(side, 14), 15),                             // over the lake
      lift(s.clone().addScaledVector(dir, 125).addScaledVector(side, -18), 22),    // near shore, above the jungle edge
      lift(s.clone().addScaledVector(dir, 62).addScaledVector(side, 16), 15),      // over the canopy
      lift(s.clone().addScaledVector(dir, 26).addScaledVector(side, 8), 8),        // descending
      lift(s.clone().addScaledVector(dir, 9).addScaledVector(side, 5), 4.2),       // entering the clearing
      lift(s.clone().addScaledVector(dir, 2).addScaledVector(side, -8), 3.2),      // orbit
      lift(s.clone().addScaledVector(dir, -6).addScaledVector(side, -3), 2.8),     // behind the clan, facing the river
    ];
    const looks = [
      lift(s.clone().addScaledVector(dir, 60), 6),
      lift(s.clone().addScaledVector(dir, 40), 8),
      lift(s.clone().addScaledVector(dir, 30), 8),
      lift(s.clone(), 4),
      lift(s.clone(), 2),
      lift(s.clone(), 1.4),
      lift(s.clone(), 1.1),
      lift(s.clone().addScaledVector(dir, 6), 1.0),
    ];
    this.posCurve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.25);
    this.lookCurve = new THREE.CatmullRomCurve3(looks, false, 'catmullrom', 0.25);
    this.captions = [
      { from: 1.5, to: 8, key: 'intro.caption1' },
      { from: 10, to: 16.5, key: 'intro.caption2' },
      { from: 18.5, to: 24, key: 'intro.caption3' },
      { from: 25, to: 29.5, key: 'intro.title', title: true },
    ];
    this.applyCamera = this.applyCamera.bind(this);
  }

  onFinish(cb: () => void) { this.finishCb = cb; }

  /** Jump to a time (used by tests and screenshots). */
  seek(time: number) { this.time = Math.max(0, Math.min(INTRO_DURATION, time)); }

  skip() {
    if (this.done) return;
    this.done = true;
    this.root.classList.add('ending');
    this.finish();
  }

  private finish() {
    this.done = true;
    const cb = this.finishCb;
    this.finishCb = null;
    this.root.remove();
    cb?.();
  }

  /** Progress 0..1 with easing at both ends. */
  private progress(): number {
    const u = this.time / INTRO_DURATION;
    return u * u * (3 - 2 * u) * 0.35 + u * 0.65; // gentle ease, mostly linear
  }

  applyCamera(camera: THREE.PerspectiveCamera) {
    const u = this.progress();
    // parameter-uniform sampling: every keyframe segment gets the same screen time, so the
    // short final segments around the settlement play slowly
    const p = this.posCurve.getPoint(u);
    const l = this.lookCurve.getPoint(u);
    // keep clear of the ground
    p.y = Math.max(p.y, this.heightAt(p.x, p.z) + 2.5);
    // subtle handheld drift
    p.x += Math.sin(this.time * 0.7) * 0.15;
    p.y += Math.sin(this.time * 0.9 + 1) * 0.1;
    camera.position.copy(p);
    camera.lookAt(l);
    camera.fov = 48 + Math.sin(this.time * 0.15) * 2;
    camera.updateProjectionMatrix();
  }

  /** Returns the camera position for lighting/fog focus. */
  update(dt: number, camera: THREE.PerspectiveCamera): THREE.Vector3 {
    if (this.done) return camera.position;
    this.time += dt;
    this.applyCamera(camera);
    // fade in/out
    const fadeIn = Math.min(1, this.time / 2.5);
    const fadeOut = Math.min(1, Math.max(0, (INTRO_DURATION - this.time) / 1.5));
    this.fade.style.opacity = String(1 - Math.min(fadeIn, fadeOut));
    // captions
    let text = '', isTitle = false, alpha = 0;
    for (const c of this.captions) {
      if (this.time >= c.from && this.time <= c.to) {
        text = t(c.key); isTitle = !!c.title;
        const inA = Math.min(1, (this.time - c.from) / 1.2), outA = Math.min(1, (c.to - this.time) / 1.2);
        alpha = Math.min(inA, outA);
      }
    }
    if (text !== this.lastCaption) {
      this.lastCaption = text;
      this.caption.textContent = isTitle ? '' : text;
      this.title.textContent = isTitle ? text : '';
    }
    (isTitle ? this.title : this.caption).style.opacity = String(alpha);
    (isTitle ? this.caption : this.title).style.opacity = '0';
    this.skipHint.style.opacity = this.time > 1 && this.time < INTRO_DURATION - 2 ? '0.7' : '0';
    if (this.time >= INTRO_DURATION) this.finish();
    return camera.position;
  }
}
