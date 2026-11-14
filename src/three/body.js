import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { $, $$ } from '../util.js';
import { pivot, HOME, cam, twin, renderer } from './scene.js';
import { createHalftoneSkin, createAuraMaterials, halftoneUniforms } from './effects.js';

/* Body model, skin shader, and the body regions each system lives at. */

// x: world units from centre line (+ = screen right). v: height fraction from the feet.
export const REGIONS = {
  sleep:   { x: 0,     v: .972, radius: .34, dist: 2.1 },
  lungs:   { x: -.22,  v: .76,  radius: .5,  dist: 2.8, coreX: 0 },
  heart:   { x: .09,   v: .735, radius: .24, dist: 2.3 },
  muscles: { x: -.27,  v: .45,  radius: .5,  dist: 3.9 },
};

export const uni = {
  uRegionCenter: { value: new THREE.Vector3(0, 99, 0) }, uRegionRadius: { value: .3 },
  uHighlight: { value: 0 }, uGhost: { value: 0 }, uPulse: { value: 0 }, uCyan: { value: new THREE.Color('#0aa5bd') },
  ...halftoneUniforms(renderer.getPixelRatio()),
};

// Pitch-black halftone body (see effects.js).
export const skin = createHalftoneSkin(uni);
const auraMats = createAuraMaterials(uni);
const auraMeshes = [];

// Camera framing. size = how big the body looks (1 = whole body, bigger = closer).
// lift = how far up the camera aims, as a fraction of body height.
export const framing = { H: 4.65, size: 1.4, lift: .08 };
export function applyFraming() {
  const { H, size, lift } = framing;
  HOME.pos.set(0, H * lift, H * 2.4 / size);
  HOME.look.set(0, H * lift, 0);
  if (!twin.focus && !twin.fly) {
    cam.pos.copy(HOME.pos);
    cam.look.copy(HOME.look);
  }
}

// Turn aura shells on/off (skip drawing them when strength is 0).
export function setAuraVisible(on) {
  auraMeshes.forEach(m => m.visible = on);
}

// Glow shells share the body's geometry (and skeleton, if skinned).
function addAura(obj) {
  const bodyMeshes = [];
  obj.traverse(m => { if (m.isMesh) bodyMeshes.push(m); });
  bodyMeshes.forEach(m => {
    m.renderOrder = 1;  // body draws after the glow
    auraMats.forEach(mat => {
      let a;
      if (m.isSkinnedMesh) {
        a = new THREE.SkinnedMesh(m.geometry, mat);
        a.bind(m.skeleton, m.bindMatrix);
      } else {
        a = new THREE.Mesh(m.geometry, mat);
      }
      a.position.copy(m.position);
      a.quaternion.copy(m.quaternion);
      a.scale.copy(m.scale);
      a.frustumCulled = false;
      a.renderOrder = 0;
      a.visible = uni.uAura.value > 0;
      m.parent.add(a);
      auraMeshes.push(a);
    });
  });
}

export function loadBody() {
  new FBXLoader().load('./malebody.fbx', obj => {
    const s0 = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(4.65 / Math.max(s0.x, s0.y, s0.z));
    obj.position.sub(new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()));
    obj.traverse(m => { if (m.isMesh) { m.material = skin; m.frustumCulled = false; } });
    pivot.add(obj);
    const b = new THREE.Box3().setFromObject(obj), H = b.max.y - b.min.y;
    // Find each region's surface point by casting a ray at the front of the body.
    obj.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    Object.values(REGIONS).forEach(r => {
      const y = b.min.y + r.v * H;
      ray.set(new THREE.Vector3(r.x, y, b.max.z + 5), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(obj, true)[0];
      const surf = hit ? hit.point.clone() : new THREE.Vector3(r.x, y, .3);
      const core = surf.clone(); core.z -= r.radius * .45; if (r.coreX !== undefined) core.x = r.coreX;
      r.surface = obj.worldToLocal(surf); r.core = obj.worldToLocal(core);
    });
    addAura(obj);  // after the raycasts, so rays only hit the body
    framing.H = H;
    applyFraming();
    twin.body = obj;
    $('#loadNote').remove();
    $('#spots').classList.remove('hide');
  }, undefined, err => {
    console.error(err);
    $('#loadNote').innerHTML = 'The 3D body needs a local server.<br><br>Run: python3 -m http.server';
    const pos = { sleep: [50, 14], heart: [52, 34], lungs: [47, 33], muscles: [46, 60] };
    $$('.spot').forEach(s => { const [x, y] = pos[s.dataset.sys]; s.style.left = x + '%'; s.style.top = y + '%'; });
    $('#spots').classList.remove('hide');
  });
  $('#spots').classList.add('hide');
}

// World position of a region on the body ('surface' or 'core').
export const pt = (k, which = 'surface') => twin.body.localToWorld(REGIONS[k][which].clone());
