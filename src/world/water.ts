import * as THREE from 'three';
import { WATER_LEVEL, WORLD_SIZE } from './terrain';

const vert = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vWave;
void main() {
  vec3 p = position;
  float w = sin(p.x * 0.35 + uTime * 1.3) * 0.12 + sin(p.z * 0.27 - uTime * 0.9) * 0.1 + sin((p.x + p.z) * 0.12 + uTime * 0.6) * 0.15;
  p.y += w;
  vWave = w;
  float dx = cos(p.x * 0.35 + uTime * 1.3) * 0.12 * 0.35 + cos((p.x + p.z) * 0.12 + uTime * 0.6) * 0.15 * 0.12;
  float dz = cos(p.z * 0.27 - uTime * 0.9) * 0.1 * 0.27 + cos((p.x + p.z) * 0.12 + uTime * 0.6) * 0.15 * 0.12;
  vNormalW = normalize(vec3(-dx, 1.0, -dz));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vWave;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormalW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = mix(uDeep, uShallow, 0.35 + vWave * 0.8);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 180.0) * 1.8;
  vec3 col = base * (0.5 + 0.5 * max(dot(N, uSunDir), 0.0)) * (1.0 - uNight * 0.75);
  col = mix(col, uFogColor, fres * 0.55);
  col += uSunColor * spec * (1.0 - uNight);
  // fog
  float dist = length(cameraPosition - vWorldPos);
  float f = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 0.82 + fres * 0.15);
}`;

export class Water {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff2d0') },
      uShallow: { value: new THREE.Color('#3f8f8a') },
      uDeep: { value: new THREE.Color('#12384a') },
      uFogColor: { value: new THREE.Color('#bcd5ee') },
      uFogNear: { value: 60 },
      uFogFar: { value: 500 },
      uNight: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.2, WORLD_SIZE * 1.2, 160, 160);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  update(time: number, sunDir: THREE.Vector3, sunColor: THREE.Color, fog: THREE.Fog, night: number) {
    this.uniforms.uTime.value = time;
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    (this.uniforms.uSunColor.value as THREE.Color).copy(sunColor);
    (this.uniforms.uFogColor.value as THREE.Color).copy(fog.color);
    this.uniforms.uFogNear.value = fog.near;
    this.uniforms.uFogFar.value = fog.far;
    this.uniforms.uNight.value = night;
  }
}
