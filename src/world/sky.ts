import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise';

const skyVert = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // push to far plane
}`;

const skyFrag = /* glsl */ `
precision highp float;
varying vec3 vWorldDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uNight;
uniform float uTime;
uniform float uRain;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

void main() {
  vec3 d = normalize(vWorldDir);
  float h = clamp(d.y, -0.2, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  float sunAmt = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sunAmt, 6.0) * 0.35 * uSunIntensity;
  col += uSunColor * pow(sunAmt, 220.0) * 2.5 * uSunIntensity;
  // moon
  vec3 moonDir = -uSunDir;
  float moonAmt = max(dot(d, moonDir), 0.0);
  col += vec3(0.8, 0.85, 1.0) * pow(moonAmt, 400.0) * 1.6 * uNight;
  col += vec3(0.4, 0.45, 0.6) * pow(moonAmt, 8.0) * 0.12 * uNight;
  // stars
  if (h > 0.0) {
    vec3 g = floor(d * 220.0);
    float s = hash(g);
    float star = smoothstep(0.985, 1.0, s) * uNight;
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
    col += vec3(star * twinkle) * (1.0 - uRain);
  }
  // ground haze below horizon
  col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.2, d.y));
  col = mix(col, col * 0.55 + vec3(0.2), uRain * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface SkyState {
  timeOfDay: number; // 0..1, 0 = midnight, 0.5 = noon
  sunElevation: number; // -1..1
  night: number; // 0..1
  rain: number; // 0..1
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly fog: THREE.Fog;
  private uniforms: Record<string, THREE.IUniform>;
  private sunTarget = new THREE.Object3D();
  rain = 0;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color('#2a63b8') },
      uHorizon: { value: new THREE.Color('#bcd5ee') },
      uSunColor: { value: new THREE.Color('#fff2d0') },
      uSunIntensity: { value: 1 },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uRain: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const mat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(4000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    const s = 70;
    this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s; this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.sun.target = this.sunTarget;
    scene.add(this.sun, this.sunTarget);

    this.moon = new THREE.DirectionalLight('#8fa4d8', 0.25);
    scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight('#9fc4ff', '#5a4a30', 0.6);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.15);
    scene.add(this.ambient);
    this.fog = new THREE.Fog('#bcd5ee', 60, 520);
    scene.fog = this.fog;
  }

  /** Update lighting for a time of day. Call every frame. */
  update(timeOfDay: number, dt: number, focus: THREE.Vector3): SkyState {
    this.elapsed += dt;
    const angle = (timeOfDay - 0.25) * Math.PI * 2; // sunrise at 0.25
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    const elev = sunDir.y;
    const day = smoothstep(-0.08, 0.15, elev);
    const night = 1 - smoothstep(-0.2, 0.02, elev);
    const dusk = (1 - smoothstep(0.0, 0.3, Math.abs(elev))) * (1 - night);

    const zenithDay = new THREE.Color('#2a63b8'), zenithDusk = new THREE.Color('#3b2a5a'), zenithNight = new THREE.Color('#050912');
    const horizonDay = new THREE.Color('#bcd5ee'), horizonDusk = new THREE.Color('#ff9a4a'), horizonNight = new THREE.Color('#141a2c');
    const zenith = zenithNight.clone().lerp(zenithDay, day).lerp(zenithDusk, dusk * 0.7);
    const horizon = horizonNight.clone().lerp(horizonDay, day).lerp(horizonDusk, dusk * 0.85);
    (this.uniforms.uZenith.value as THREE.Color).copy(zenith);
    (this.uniforms.uHorizon.value as THREE.Color).copy(horizon);
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    const sunColor = new THREE.Color('#fff2d0').lerp(new THREE.Color('#ff7a30'), dusk);
    (this.uniforms.uSunColor.value as THREE.Color).copy(sunColor);
    this.uniforms.uSunIntensity.value = day;
    this.uniforms.uNight.value = night;
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uRain.value = this.rain;

    this.sun.color.copy(sunColor);
    this.sun.intensity = lerp(0.0, 2.6, day) * (1 - this.rain * 0.6);
    this.sun.position.copy(focus).addScaledVector(sunDir, 180);
    this.sunTarget.position.copy(focus);
    this.sun.visible = elev > -0.05;
    this.moon.intensity = 0.55 * night * (1 - this.rain * 0.5);
    this.moon.position.copy(focus).addScaledVector(sunDir, -150);
    this.moon.target = this.sunTarget;

    this.hemi.color.copy(zenith).lerp(new THREE.Color('#ffffff'), 0.3);
    this.hemi.groundColor.set('#5a4a30').lerp(new THREE.Color('#101418'), night);
    this.hemi.intensity = lerp(0.22, 0.65, day) + dusk * 0.1;
    this.ambient.intensity = lerp(0.1, 0.18, day);

    const fogColor = horizon.clone().lerp(new THREE.Color('#0a0e18'), night * 0.8);
    if (this.rain > 0) fogColor.lerp(new THREE.Color('#9aa5b0'), this.rain * 0.5);
    this.fog.color.copy(fogColor);
    this.fog.near = lerp(60, 25, this.rain);
    this.fog.far = lerp(520, 200, this.rain) - night * 120;

    this.mesh.position.copy(focus);
    return { timeOfDay, sunElevation: clamp(elev, -1, 1), night, rain: this.rain };
  }

  get fogColor(): THREE.Color {
    return this.fog.color;
  }
}
