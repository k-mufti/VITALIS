import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { camera, renderer, pivot, twin } from './scene.js';
import { uni, pt } from './body.js';

/* 3D organ models from assets/models/manifest.json. They sit inside the glass body
   and appear with an upward scan line when their system is opened.

   Manifest fields per organ (on top of plan.md 5.6). Files are .glb (geometry + normal map only):
   anchor  [x from centre line, height fraction from the feet] of the organ's centre
   width / height  organ size as a fraction of body height (scale multiplies it)
   depth   how far behind the body surface the centre sits (fraction of body height)
   fill    share of the view the organ fills when focused
   clipTop cut the model off above this share of its height (trims the lungs' long trachea)
   fullBody  model replaces the skin (the écorché), framed by `frame`
   region  light up the body region on this model (used for the thigh on the écorché) */

const MODEL_DIR = 'assets/models/';
let manifest = null;
const manifestReady = fetch(MODEL_DIR + 'manifest.json')
  .then(r => r.json())
  .then(m => { manifest = m; })
  .catch(err => { console.error('Could not load the model manifest', err); manifest = { organs: {} }; });

export const organs = {};

// True when this system has a 3D model to show (or one is loading).
export function has3dOrgan(k) {
  return !!(twin.body && manifest?.organs?.[k] && !organs[k]?.failed);
}

// Models are meshopt-compressed .glb files that carry only geometry and a WebP normal map.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Graphite organ with a thin cyan edge. Appears with an upward scan line, then a faint sweep repeats.
function organMaterial(u, source, doubleSided) {
  const m = new THREE.MeshStandardMaterial({
    color: '#1b2022', roughness: .42, metalness: 0,
    normalMap: source?.normalMap || null,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (source?.normalScale) m.normalScale.copy(source.normalScale);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u, { uCyan: uni.uCyan, uRegionCenter: uni.uRegionCenter, uRegionRadius: uni.uRegionRadius, uPulse: uni.uPulse });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; uniform vec3 uCyan, uRegionCenter; uniform float uRegionRadius, uPulse, uReveal, uMinY, uMaxY, uTime, uRegionOn;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float span = uMaxY - uMinY;
float edgeY = uMinY + span * uReveal;
if (vW.y > edgeY) discard;`)
      .replace('#include <opaque_fragment>', `
float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rim = pow(1.0 - facing, 3.0);
float scanLine = (1.0 - smoothstep(0.0, span * .012, abs(vW.y - edgeY))) * step(uReveal, .999);
float sweepY = uMinY + span * (fract(uTime * .16) * 1.4 - .2);
float sweep = (1.0 - smoothstep(0.0, span * .006, abs(vW.y - sweepY))) * .45 * step(.999, uReveal);
float reg = uRegionOn * (1.0 - smoothstep(uRegionRadius * .45, uRegionRadius, distance(vW, uRegionCenter)));
outgoingLight = mix(outgoingLight, uCyan, clamp(rim * .6 + scanLine + sweep + reg * (.22 + .3 * uPulse), 0.0, 1.0));
#include <opaque_fragment>`);
  };
  return m;
}

// Load one organ (cached). Resolves with its record; record.failed is set if it could not load.
export function loadOrgan(k) {
  if (organs[k]) return organs[k].promise;
  const o = organs[k] = {
    reveal: 0,
    u: { uReveal: { value: 0 }, uMinY: { value: 0 }, uMaxY: { value: 1 }, uTime: { value: 0 }, uRegionOn: { value: 0 } },
  };
  o.promise = manifestReady.then(() => {
    const cfg = manifest.organs[k];
    if (!cfg || !twin.body) throw new Error('No model for ' + k);
    o.u.uRegionOn.value = cfg.region ? 1 : 0;
    return loader.loadAsync(encodeURI(MODEL_DIR + cfg.file)).then(gltf => {
      const model = gltf.scene;
      model.traverse(m => {
        if (!m.isMesh) return;
        // Keep the model's normal map for surface detail, swap everything else for the VITALIS look.
        if (m.material.normalMap) m.material.normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
        m.material = organMaterial(o.u, m.material, !!cfg.clipTop);
      });
      placeOrgan(k, cfg, model, o);
      pivot.add(o.group);
      return o;
    });
  }).catch(err => {
    console.error('Could not load the 3D model for ' + k, err);
    o.failed = true;
    return o;
  });
  return o.promise;
}

// Positions are worked out in the pivot's own space, so they hold whichever way the body is turned.
function placeOrgan(k, cfg, model, o) {
  const B = twin.bodyBox, H = B.max.y - B.min.y;
  const raw = new THREE.Box3().setFromObject(model);
  const size = raw.getSize(new THREE.Vector3());
  model.position.copy(raw.getCenter(new THREE.Vector3())).multiplyScalar(-1);

  let s;
  const center = new THREE.Vector3();
  if (cfg.fullBody) {
    s = H / size.y;
    center.copy(B.getCenter(new THREE.Vector3()));
  } else {
    if (cfg.width) s = cfg.width * H / size.x;
    else s = cfg.height * H / size.y;
    const surface = pivot.worldToLocal(pt(k));
    center.set(cfg.anchor[0], B.min.y + cfg.anchor[1] * H, surface.z - cfg.depth * H);
  }
  s *= cfg.scale ?? 1;

  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(s);
  holder.position.copy(center);
  holder.visible = false;
  o.group = holder;
  o.base = s;

  // Top of the visible part. A small margin keeps a beating or breathing organ from being trimmed.
  const halfY = size.y * s / 2, minY = center.y - halfY, topY = center.y + halfY;
  let maxY = topY + halfY * .06;
  if (cfg.clipTop) maxY = minY + 2 * halfY * cfg.clipTop;
  o.u.uMinY.value = minY;
  o.u.uMaxY.value = maxY;

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  if (cfg.frame) {
    o.frame = { point: new THREE.Vector3(0, B.min.y + cfg.frame.v * H, 0), dist: cfg.frame.half * H / tanHalf };
  } else {
    const shownTop = Math.min(maxY, topY);
    o.frame = { point: new THREE.Vector3(center.x, (minY + shownTop) / 2, center.z), dist: (shownTop - minY) / 2 / tanHalf / cfg.fill };
  }
}

// Load the heart and lungs in the background. The écorché is big, so it only loads when opened.
export function prefetchOrgans() {
  loadOrgan('lungs').then(() => loadOrgan('heart'));
}

// Called every frame: scan organs in and out.
export function updateOrgans(now, dt) {
  for (const [k, o] of Object.entries(organs)) {
    if (!o.group) continue;
    const want = twin.focus === k && now - twin.focusAt > 650;
    if (want) o.reveal = Math.min(1, o.reveal + dt / (k === 'muscles' ? 2.2 : 1.5));
    else o.reveal = Math.max(0, o.reveal - dt / .5);
    o.u.uReveal.value = o.reveal < .5 ? 4 * o.reveal ** 3 : 1 - Math.pow(-2 * o.reveal + 2, 3) / 2;
    o.u.uTime.value = now / 1000;
    o.group.visible = o.reveal > 0;
  }
}

// Live motion for an open 3D organ. Returns a 0..1 pulse, or null if this organ has no 3D model showing.
export function animate3dOrgan(k, t, value) {
  const o = organs[k];
  if (!o?.group) return null;
  if (k === 'lungs') {
    const s = Math.sin(t * 2 * Math.PI * value / 60);
    o.group.scale.set(o.base * (1 + .035 * s), o.base * (1 + .02 * s), o.base * (1 + .03 * s));
    return (s + 1) / 2;
  }
  if (k === 'heart') {
    const c = Math.exp(-((((t * value / 60) % 1 - .23) / .07) ** 2));
    o.group.scale.setScalar(o.base * (1 - .045 * c));
    return c;
  }
  return (Math.sin(t * 1.2) + 1) / 2;
}
