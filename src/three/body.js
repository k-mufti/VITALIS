import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { $, $$ } from '../util.js';
import { pivot, HOME, cam, twin, renderer } from './scene.js';
import { createHalftoneSkin, createAuraMaterials, halftoneUniforms } from './effects.js';

/* Body model, skin shader, and the body regions each system lives at. */

// x: world units from centre line (+ = screen right). v: height fraction from the feet.
export const REGIONS = {
  sleep:   { x: 0,     v: .972, radius: .34, dist: 2.1 },
  eyes:    { x: .06,   v: .947, radius: .16, dist: 1.5 },
  bones:   { x: 0,     v: .55,  radius: .62, dist: 4.2, coreX: 0 },
  lungs:   { x: -.22,  v: .76,  radius: .5,  dist: 2.8, coreX: 0 },
  heart:   { x: .09,   v: .735, radius: .24, dist: 2.3 },
  muscles: { x: -.27,  v: .45,  radius: .5,  dist: 3.9 },
};

export const uni = {
  uRegionCenter: { value: new THREE.Vector3(0, 99, 0) }, uRegionRadius: { value: .3 },
  uHighlight: { value: 0 }, uGhost: { value: 0 }, uPulse: { value: 0 }, uCyan: { value: new THREE.Color('#0aa5bd') },
  uFade: { value: 1 },   // écorché crossfade: 0 hides the skin
  ...halftoneUniforms(renderer.getPixelRatio()),
};

// Pitch-black halftone body (see effects.js).
export const skin = createHalftoneSkin(uni);
const auraMats = createAuraMaterials(uni);
const auraMeshes = [];

// Camera framing. size = how big the body looks (1 = whole body, bigger = closer).
// lift = how far up the camera aims, as a fraction of body height.
export const framing = { H: 4.65, size: 2.02, lift: .23 };
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

// The body is a meshopt-compressed .glb listed in assets/models/manifest.json (rules.md 4).
// Quantized .glb files keep positions as small integers plus a scale on the mesh node. The aura
// pushes vertices out along their normals in object space, so turn them back into plain floats
// and bake the node transform in. That keeps object space the same as the original FBX.
function bakeMeshes(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(m => { if (m.isMesh) meshes.push(m); });
  meshes.forEach(m => {
    const g = m.geometry;
    ['position', 'normal'].forEach(name => {
      const a = g.getAttribute(name);
      if (!a || a.array instanceof Float32Array) return;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(name, new THREE.BufferAttribute(f, 3));
    });
    g.applyMatrix4(m.matrixWorld);
    m.matrix.identity(); m.matrix.decompose(m.position, m.quaternion, m.scale);
    root.attach(m);
  });
  return root;
}

export function loadBody() {
  fetch('assets/models/manifest.json')
    .then(r => r.json())
    .then(manifest => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/models/' + manifest.body.file))
    .then(gltf => placeBody(bakeMeshes(gltf.scene)))
    .catch(err => {
      console.error(err);
      $('#loadNote').innerHTML = 'The 3D body needs a local server.<br><br>Run: python3 -m http.server';
      const pos = { sleep: [50, 14], heart: [52, 34], lungs: [47, 33], muscles: [46, 60] };
      $$('.spot').forEach(s => { const [x, y] = pos[s.dataset.sys]; s.style.left = x + '%'; s.style.top = y + '%'; });
      $('#spots').classList.remove('hide');
    });
  $('#spots').classList.add('hide');
}

function placeBody(obj) {
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
  twin.bodyBox = b.clone();
  $('#loadNote').remove();
  $('#spots').classList.remove('hide');
}

// World position of a region on the body ('surface' or 'core').
export const pt = (k, which = 'surface') => twin.body.localToWorld(REGIONS[k][which].clone());
