import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { $, $$ } from '../util.js';
import { pivot, HOME, cam, twin, renderer } from './scene.js';
import { createHalftoneSkin, halftoneUniforms } from './effects.js';

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
    HOME.pos.set(0, 0, Math.max(8, H * 2.4));
    cam.pos.copy(HOME.pos);
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
