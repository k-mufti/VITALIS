import * as THREE from 'three';
import { $ } from '../util.js';
import { createHalftoneBackdrop } from './effects.js';

/* Renderer, camera, lights, resize, drag-to-turn, camera flights. */

export const host = $('#stage3d');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(30, 1, .01, 200);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;  // keep the black pure and the paper dots exact
host.append(renderer.domElement);
export const backdrop = createHalftoneBackdrop(scene, renderer);
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f31, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(3, 3, -5); scene.add(rim);

export const pivot = new THREE.Group(); scene.add(pivot);
export const HOME = { pos: new THREE.Vector3(0, 0, 11), look: new THREE.Vector3() };
export const cam = { pos: HOME.pos.clone(), look: HOME.look.clone() };

// Mutable 3D state shared inside src/three/. Other code should go through api.js.
export const twin = {
  body: null,
  rot: 0,
  rotTarget: 0,
  fly: null,
  hover: null,
  focus: null,
  focusAt: 0,
  layer: 'skin',       // body layer picked in the anatomy panel: skin | muscle | skeleton | organs
  ghostTarget: 0,
  bodyBox: null,
  // Detail view camera: orbits the focused organ (drag to turn, scroll to zoom).
  orbit: { on: false, focus: new THREE.Vector3(), yaw: 0, yawT: 0, pitch: 0, pitchT: 0, dist: 3, distT: 3, base: 3 },
  severity: {},      // organId -> 0..1, from setOrganSeverity
  testSeverity: 0,   // FX panel preview
  injury: false,     // an injury alert is showing (showInjury)
  injuryModel: null, // the bone, muscle or organ system shown lit at the injury
};

export function flyTo(t, dur = 1500) {
  twin.fly = { t0: performance.now(), dur, fromPos: cam.pos.clone(), fromLook: cam.look.clone(), ...t };
}

function resize() {
  const { width: w, height: h } = host.getBoundingClientRect();
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

export function initScene() {
  new ResizeObserver(resize).observe(host);

  // Drag to turn the body
  let drag = null;
  host.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: twin.rotTarget }; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', e => { if (drag) twin.rotTarget = drag.r + (e.clientX - drag.x) * .01; });
  host.addEventListener('pointerup', () => drag = null);
  host.addEventListener('dblclick', () => twin.rotTarget = 0);
}
