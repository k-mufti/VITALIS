import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { $, $$ } from '../util.js';
import { pivot, HOME, cam, twin } from './scene.js';

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
};

// Charcoal body. Shader adds a thin cyan ring on the hovered region and turns the body to glass when zoomed in.
export const skin = new THREE.MeshStandardMaterial({ color: '#131516', roughness: .6, metalness: 0, transparent: true });
skin.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, uni);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vW; uniform vec3 uRegionCenter; uniform float uRegionRadius, uHighlight, uGhost, uPulse; uniform vec3 uCyan;`)
    .replace('#include <opaque_fragment>', `
float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rim = pow(1.0 - facing, 2.4);
float dR = distance(vW, uRegionCenter);
float region = (1.0 - smoothstep(uRegionRadius * .5, uRegionRadius, dR)) * uHighlight;
float ring = (1.0 - smoothstep(0.0, .03, abs(dR / uRegionRadius - .9))) * uHighlight;
outgoingLight = mix(outgoingLight, uCyan, clamp(smoothstep(.42, .8, rim) * region + ring * (1.0 - .6 * uGhost) + region * .1 * (1.0 - uGhost), 0.0, 1.0));
outgoingLight = mix(outgoingLight, uCyan, region * uGhost * (.25 + .35 * uPulse));
diffuseColor.a *= mix(1.0, clamp(.045 + rim * .42 + region * (.16 + .22 * uPulse) + ring * .5, 0.0, 1.0), uGhost);
#include <opaque_fragment>`);
};

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
