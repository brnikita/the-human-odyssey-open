import * as THREE from 'three';
import type { HominidState } from '@/core/types';
import type { Input } from '@/core/input';
import { Terrain, WATER_LEVEL } from '@/world/terrain';
import type { Vegetation, Climbable } from '@/world/vegetation';
import { HominidRig } from '@/render/models';
import { clamp, lerp } from '@/world/noise';

export interface MoveModifiers {
  speed: number;
  climb: number;
  canSwim: boolean;
  canDive: boolean;
  bipedal: boolean;
  longJump: boolean;
  fastClimb: boolean;
  stageSpeed: number;
  conditionSpeed: number;
  fearSlow: number; // 0..1, 1 = no slow
}

export type ControllerEvent =
  | { type: 'jump' } | { type: 'land'; fallHeight: number } | { type: 'climb_start' } | { type: 'climb_end' }
  | { type: 'swim_start' } | { type: 'swim_end' } | { type: 'step'; running: boolean } | { type: 'dodge' }
  | { type: 'attack_hit'; t: number } | { type: 'canopy' } | { type: 'drown_tick' };

const GRAVITY = 22;
const WALK = 3.4, RUN = 7.2, SWIM = 2.4, CLIMB = 2.6;

export class PlayerController {
  readonly rig: HominidRig;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0; // facing direction
  state: HominidState = 'idle';
  grounded = true;
  speed = 0;
  private climbing: Climbable | null = null;
  private climbHeight = 0;
  private onCanopy: Climbable | null = null;
  private fallStart = 0;
  private actionTimer = 0;
  private actionDuration = 0;
  private stepAcc = 0;
  private swimTime = 0;
  private lockedState: HominidState | null = null;
  private dodgeDir = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private blockedInput = false;

  // camera
  camYaw = 0;
  camPitch = 0.28;
  camDist = 6.5;
  sensitivity = 1;
  invertY = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  shake = 0;

  constructor(private terrain: Terrain, private veg: Vegetation, rig: HominidRig) {
    this.rig = rig;
  }

  /** Place the character on the ground at x,z. */
  teleport(x: number, z: number) {
    this.position.set(x, this.terrain.heightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.climbing = null;
    this.onCanopy = null;
    this.state = 'idle';
    this.camInit = false;
    this.rig.root.position.copy(this.position);
  }

  get forward(): THREE.Vector3 {
    return this.tmp2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get cameraForward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
  }

  get isClimbing() { return this.climbing !== null; }
  get isSwimming() { return this.state === 'swim'; }
  get isBusy() { return this.lockedState !== null; }
  get canopy() { return this.onCanopy; }

  /** Ground height under the character including canopy platforms. */
  groundHeight(x: number, z: number): number {
    let h = this.terrain.heightAt(x, z);
    if (this.onCanopy) {
      const c = this.onCanopy;
      const d = Math.hypot(c.position.x - x, c.position.z - z);
      if (d < c.canopyRadius * 1.1) h = Math.max(h, c.position.y + c.height - 0.2);
      else this.onCanopy = null;
    }
    return h;
  }

  /** Start a timed action (eat, drink, groom, attack, dodge, sleep). */
  startAction(state: HominidState, duration: number) {
    this.lockedState = state;
    this.actionDuration = duration;
    this.actionTimer = 0;
    this.state = state;
    if (state === 'dodge') {
      const f = this.forward;
      this.dodgeDir.set(-f.x, 0, -f.z);
    }
  }

  cancelAction() {
    this.lockedState = null;
    this.state = 'idle';
  }

  get actionProgress(): number {
    return this.actionDuration > 0 ? clamp(this.actionTimer / this.actionDuration, 0, 1) : 0;
  }

  update(dt: number, input: Input, mods: MoveModifiers, allowInput: boolean): ControllerEvent[] {
    const events: ControllerEvent[] = [];
    this.blockedInput = !allowInput;
    this.rig.bipedal = mods.bipedal;

    // Camera look
    if (allowInput && input.pointerLocked) {
      this.camYaw -= input.mouseDX * 0.0022 * this.sensitivity;
      this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0018 * this.sensitivity * (this.invertY ? -1 : 1), -0.6, 1.2);
    }
    if (allowInput) this.camDist = clamp(this.camDist + input.wheel * 0.8, 2.5, 14);

    // Locked actions
    if (this.lockedState) {
      this.actionTimer += dt;
      if (this.lockedState === 'dodge') {
        const s = Math.sin(this.actionProgress * Math.PI);
        this.position.addScaledVector(this.dodgeDir, dt * 9 * s);
        this.position.y = this.groundHeight(this.position.x, this.position.z);
      }
      if (this.lockedState === 'attack' && this.actionProgress > 0.45 && this.actionProgress - dt / this.actionDuration <= 0.45) {
        events.push({ type: 'attack_hit', t: this.actionProgress });
      }
      if (this.actionTimer >= this.actionDuration) {
        this.lockedState = null;
        this.state = 'idle';
      } else {
        this.state = this.lockedState;
        this.finishFrame(dt, 0, 0, { attackT: this.actionProgress, dodgeT: this.actionProgress });
        return events;
      }
    }

    // Movement input relative to camera
    const inX = allowInput ? (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0) : 0;
    const inZ = allowInput ? (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0) : 0;
    const wantRun = allowInput && input.isDown('run');
    const cf = this.cameraForward;
    const cr = this.tmp.set(cf.z, 0, -cf.x);
    const move = new THREE.Vector3().addScaledVector(cf, inZ).addScaledVector(cr, inX);
    const hasMove = move.lengthSq() > 0.001;
    if (hasMove) move.normalize();

    const terrainH = this.terrain.heightAt(this.position.x, this.position.z);
    const inDeepWater = terrainH < WATER_LEVEL - 1.1 && !this.climbing && !this.onCanopy;

    // ---------------- Climbing ----------------
    if (this.climbing) {
      const c = this.climbing;
      const climbSpeed = CLIMB * mods.climb * (mods.fastClimb ? 1.3 : 1);
      let dy = 0;
      if (allowInput) dy = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      this.climbHeight = clamp(this.climbHeight + dy * climbSpeed * dt, 0, c.height);
      // strafe around trunk
      const ang = Math.atan2(this.position.x - c.position.x, this.position.z - c.position.z) + inX * dt * 1.5;
      this.position.x = c.position.x + Math.sin(ang) * (c.radius + 0.35);
      this.position.z = c.position.z + Math.cos(ang) * (c.radius + 0.35);
      this.position.y = c.position.y + this.climbHeight;
      this.yaw = ang + Math.PI; // face trunk
      this.state = 'climb';
      if (allowInput && input.justPressed('down')) {
        this.climbing = null;
        this.state = 'fall';
        this.fallStart = this.position.y;
        events.push({ type: 'climb_end' });
      } else if (this.climbHeight >= c.height - 0.01 && dy > 0) {
        // reach canopy
        this.climbing = null;
        this.onCanopy = c;
        this.position.x = c.position.x + Math.sin(ang) * (c.radius + 0.6);
        this.position.z = c.position.z + Math.cos(ang) * (c.radius + 0.6);
        this.position.y = c.position.y + c.height - 0.2;
        this.state = 'idle';
        events.push({ type: 'climb_end' }, { type: 'canopy' });
      } else if (this.climbHeight <= 0.01 && dy < 0) {
        this.climbing = null;
        this.state = 'idle';
        events.push({ type: 'climb_end' });
      }
      this.speed = 0;
      this.finishFrame(dt, 0, dy);
      return events;
    }

    // ---------------- Swimming ----------------
    if (inDeepWater) {
      if (this.state !== 'swim') { events.push({ type: 'swim_start' }); this.swimTime = 0; }
      this.state = 'swim';
      this.swimTime += dt;
      this.onCanopy = null;
      const sp = SWIM * mods.speed * mods.stageSpeed * (mods.canSwim ? 1 : 0.55);
      if (hasMove) {
        this.velocity.x = lerp(this.velocity.x, move.x * sp, dt * 4);
        this.velocity.z = lerp(this.velocity.z, move.z * sp, dt * 4);
        this.yaw = this.lerpAngle(this.yaw, Math.atan2(move.x, move.z), dt * 8);
      } else {
        this.velocity.x = lerp(this.velocity.x, 0, dt * 3);
        this.velocity.z = lerp(this.velocity.z, 0, dt * 3);
      }
      this.velocity.y = 0;
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.position.y = lerp(this.position.y, WATER_LEVEL - 0.55, dt * 6);
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (!mods.canSwim && this.swimTime > 3) events.push({ type: 'drown_tick' });
      this.grounded = false;
      this.finishFrame(dt, this.speed, 0);
      return events;
    } else if (this.state === 'swim') {
      this.state = 'idle';
      events.push({ type: 'swim_end' });
    }

    // ---------------- Ground / air ----------------
    const ground = this.groundHeight(this.position.x, this.position.z);
    const wasGrounded = this.grounded;
    this.grounded = this.position.y <= ground + 0.05 && this.velocity.y <= 0;

    let target = WALK;
    const running = wantRun && hasMove;
    if (running) target = RUN;
    target *= mods.speed * mods.stageSpeed * mods.conditionSpeed * lerp(0.6, 1, mods.fearSlow);
    // slope penalty
    const slope = this.terrain.slopeAt(this.position.x, this.position.z);
    const uphill = hasMove ? this.terrain.normalAt(this.position.x, this.position.z).dot(move) : 0; // negative when moving uphill
    if (slope > 0.55 && uphill < -0.2) target *= 0.15;
    else if (slope > 0.35 && uphill < 0) target *= 0.55;

    if (this.grounded) {
      if (!wasGrounded && this.state === 'fall') {
        const fall = Math.max(0, this.fallStart - this.position.y);
        events.push({ type: 'land', fallHeight: fall });
        if (fall > 2) this.shake = Math.min(1, fall / 10);
      }
      const accel = hasMove ? 14 : 18;
      const vx = hasMove ? move.x * target : 0, vz = hasMove ? move.z * target : 0;
      this.velocity.x = lerp(this.velocity.x, vx, clamp(dt * accel, 0, 1));
      this.velocity.z = lerp(this.velocity.z, vz, clamp(dt * accel, 0, 1));
      this.velocity.y = 0;
      this.position.y = ground;
      if (hasMove) this.yaw = this.lerpAngle(this.yaw, Math.atan2(move.x, move.z), clamp(dt * 12, 0, 1));
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);
      this.state = this.speed > 0.4 ? (running && this.speed > WALK * 1.1 ? 'run' : 'walk') : 'idle';

      // footsteps
      this.stepAcc += this.speed * dt;
      const strideLen = running ? 1.9 : 1.3;
      if (this.stepAcc > strideLen) { this.stepAcc = 0; events.push({ type: 'step', running }); }

      // Jump / climb
      if (allowInput && input.justPressed('jump')) {
        const tree = this.veg.nearestClimbable(this.position.x, this.position.z, 1.6);
        if (tree && !this.onCanopy) {
          this.beginClimb(tree, events);
        } else {
          const jumpV = mods.longJump ? 8.5 : 7.2;
          this.velocity.y = jumpV;
          this.velocity.x = hasMove ? move.x * Math.max(target, WALK) * (mods.longJump ? 1.3 : 1.1) : this.velocity.x;
          this.velocity.z = hasMove ? move.z * Math.max(target, WALK) * (mods.longJump ? 1.3 : 1.1) : this.velocity.z;
          this.position.y += 0.1;
          this.grounded = false;
          this.state = 'jump';
          this.fallStart = this.position.y;
          events.push({ type: 'jump' });
        }
      }
      if (allowInput && input.justPressed('down') && this.onCanopy) {
        // climb down from canopy
        const c = this.onCanopy;
        this.onCanopy = null;
        this.beginClimb(c, events, c.height - 0.3);
        return events;
      }
    } else {
      // airborne
      this.velocity.y -= GRAVITY * dt;
      if (hasMove) {
        this.velocity.x = lerp(this.velocity.x, move.x * target, dt * 2);
        this.velocity.z = lerp(this.velocity.z, move.z * target, dt * 2);
      }
      this.position.y += this.velocity.y * dt;
      if (this.velocity.y < 0 && this.state !== 'fall') { this.state = 'fall'; if (this.fallStart < this.position.y) this.fallStart = this.position.y; }
      if (this.state !== 'jump' && this.state !== 'fall') { this.state = 'fall'; this.fallStart = this.position.y; }
      // grab a trunk mid-air
      if (allowInput && (input.isDown('jump') || input.isDown('forward'))) {
        const tree = this.veg.nearestClimbable(this.position.x, this.position.z, 1.4);
        if (tree && this.position.y > tree.position.y + 0.5 && this.position.y < tree.position.y + tree.height) {
          this.beginClimb(tree, events, this.position.y - tree.position.y);
          return events;
        }
      }
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.grounded = true;
        const fall = Math.max(0, this.fallStart - this.position.y);
        events.push({ type: 'land', fallHeight: fall });
        if (fall > 2) this.shake = Math.min(1, fall / 10);
        this.velocity.y = 0;
        this.state = 'idle';
      }
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    // keep inside world
    const lim = 560;
    this.position.x = clamp(this.position.x, -lim, lim);
    this.position.z = clamp(this.position.z, -lim, lim);

    // blocked by steep cliffs: push back if we ended up on a very steep slope while grounded
    if (this.grounded) {
      const newGround = this.groundHeight(this.position.x, this.position.z);
      if (newGround - this.position.y > 1.2) {
        this.position.x -= this.velocity.x * dt;
        this.position.z -= this.velocity.z * dt;
        this.velocity.x *= 0.2; this.velocity.z *= 0.2;
      } else this.position.y = newGround;
    }

    this.finishFrame(dt, this.speed, 0);
    return events;
  }

  private beginClimb(tree: Climbable, events: ControllerEvent[], startHeight = 0.6) {
    this.climbing = tree;
    this.climbHeight = clamp(startHeight, 0, tree.height);
    this.velocity.set(0, 0, 0);
    this.state = 'climb';
    this.grounded = false;
    events.push({ type: 'climb_start' });
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * clamp(t, 0, 1);
  }

  private finishFrame(dt: number, speed: number, climbSpeed: number, extras: { attackT?: number; dodgeT?: number } = {}) {
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt, this.state, speed, climbSpeed, { ...extras, grounded: this.grounded });
    this.shake = Math.max(0, this.shake - dt * 2);
  }

  /** Third-person camera with terrain collision. */
  updateCamera(camera: THREE.PerspectiveCamera, dt: number, opts: { intel: boolean; fov: number }) {
    const headY = this.state === 'swim' ? 0.6 : this.state === 'sleep' || this.state === 'dead' ? 0.8 : this.rig.bipedal ? 1.9 : 1.5;
    const look = this.tmp.set(this.position.x, this.position.y + headY * this.rig.scaleFactor, this.position.z);
    const dist = opts.intel ? this.camDist * 0.75 : this.camDist;
    const off = new THREE.Vector3(
      -Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist,
      Math.sin(this.camPitch) * dist + 0.6,
      -Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist,
    );
    const desired = look.clone().add(off);
    // terrain collision: march from look to desired
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const p = look.clone().lerp(desired, i / steps);
      const g = this.terrain.heightAt(p.x, p.z) + 0.5;
      if (p.y < g) {
        desired.copy(look).lerp(desired, Math.max(0.15, (i - 1) / steps));
        desired.y = Math.max(desired.y, this.terrain.heightAt(desired.x, desired.z) + 0.6);
        break;
      }
    }
    if (desired.y < WATER_LEVEL + 0.3 && this.position.y > WATER_LEVEL - 0.3) desired.y = WATER_LEVEL + 0.3;
    if (!this.camInit) { this.camPos.copy(desired); this.camLook.copy(look); this.camInit = true; }
    const k = clamp(dt * 9, 0, 1);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, clamp(dt * 14, 0, 1));
    camera.position.copy(this.camPos);
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    camera.lookAt(this.camLook);
    const targetFov = opts.intel ? opts.fov * 0.85 : opts.fov + (this.state === 'run' ? 6 : 0);
    camera.fov = lerp(camera.fov, targetFov, clamp(dt * 5, 0, 1));
    camera.updateProjectionMatrix();
  }
}
