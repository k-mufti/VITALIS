import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { camera, renderer, pivot, twin } from './scene.js';
import { uni, pt } from './body.js';
import { LAYER_MODELS } from './anatomy-panel.js';

/* 3D organ models from assets/models/manifest.json. They sit inside the glass body
   and appear with an upward scan line when their system is opened.

   Manifest fields per organ (on top of plan.md 5.6). Files are .glb (geometry + normal map only):
   anchor  [x from centre line, height fraction from the feet] of the organ's centre
   width / height  organ size as a fraction of body height (scale multiplies it)
   depth   how far behind the body surface the centre sits (fraction of body height)
   fill    share of the view the organ fills when focused
   clipTop cut the model off above this share of its height (trims the lungs' long trachea)
   fullBody  model replaces the skin (the écorché), framed by `frame`
   region  light up the body region on this model (used for the thigh on the écorché)
   color   (no longer used: organ colours now come from organFx.tints below) */

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

// Organ look + skeleton arm fit. The FX panel (devpanel.js) changes these; updateOrgans() applies them.
export const organFx = {
  style: 0,                 // 0 = halftone, 1 = flat silhouette
  edge: 1,                  // edge dots 0..1
  shade: 1,                 // dots on the lit side 0..1
  dotColor: '#7fe9ff',
  tints: { heart: '#0a1f6b', lungs: '#1f5fd1', bones: '#13308f', muscles: '#1846c4', sleep: '#3d6ff0', digestion: '#22409e' },
  // Swing the skeleton's straight-down arms out to the body's A-pose. Each bone moves as one rigid piece.
  // Positions are fractions of body height: x from the centre line, y from the feet.
  // A bone counts as arm if its centre is further out than `start` and below the shoulder;
  // below `elbowY` it is forearm/hand and also turns at the elbow.
  // Below `wristY` it is the hand and also turns at the wrist.
  arm: { on: true, angle: 25.5, elbow: -.5, wrist: 0, shoulderX: .06, shoulderY: .822, elbowY: .682, wristY: .485, start: .09 },
  // Per-organ nudge from the FX panel: { x, y, z } as fractions of body height, s = size multiplier.
  place: {},
};
const DEFAULT_TINT = '#1846c4';
const NAVY = new THREE.Color('#0A1F6B');   // plan.md 5.2 severe end of the blue scale

// Uniforms shared by every organ material.
const shared = {
  uOrgStyle: { value: 0 }, uOrgEdge: { value: .45 }, uOrgShade: { value: .3 }, uOrgDot: { value: new THREE.Color() },
  uPivot: { value: new THREE.Matrix4() }, uPivotInv: { value: new THREE.Matrix4() },
  uBodyCX: { value: 0 }, uBodyMinY: { value: 0 }, uBodyH: { value: 1 },
  uArmAngle: { value: 0 }, uElbowAngle: { value: 0 }, uShoulderX: { value: .1 }, uShoulderY: { value: .8 },
  uElbowY: { value: .6 }, uWristAngle: { value: 0 }, uWristY: { value: .48 },
};

// Arm bend, in the body's own (pivot) space. aArm is set per bone on the CPU (classifyArms):
// x = 0 not arm, 1 upper arm, 2 forearm, 3 hand; y = side (-1 left, 1 right). Whole bones turn together.
const ARM_GLSL = `
attribute vec2 aArm;
uniform mat4 uPivot, uPivotInv;
uniform float uArmOn, uBodyCX, uBodyMinY, uBodyH, uArmAngle, uElbowAngle, uShoulderX, uShoulderY, uElbowY, uWristAngle, uWristY;
vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec4 armBend(vec4 pv, out float ang, out float side) {
  side = aArm.y;
  vec2 q = vec2(side * (pv.x - uBodyCX), pv.y - uBodyMinY) / uBodyH;
  vec2 sp = vec2(uShoulderX, uShoulderY);
  float a1 = radians(uArmAngle) * step(.5, aArm.x);
  float a2 = radians(uElbowAngle) * step(1.5, aArm.x);
  vec2 v = sp + rot2(q - sp, a1);
  vec2 elbow = sp + rot2(vec2(uShoulderX, uElbowY) - sp, a1);
  v = elbow + rot2(v - elbow, a2);
  // Wrist: where the wrist ended up after the shoulder and elbow turns.
  float a3 = radians(uWristAngle) * step(2.5, aArm.x);
  vec2 wrist = sp + rot2(vec2(uShoulderX, uWristY) - sp, a1);
  wrist = elbow + rot2(wrist - elbow, a2);
  v = wrist + rot2(v - wrist, a3);
  ang = a1 + a2 + a3;
  return vec4(uBodyCX + side * v.x * uBodyH, uBodyMinY + v.y * uBodyH, pv.z, 1.0);
}`;

// Split a model into its separate bones (pieces of connected triangles, welded at seams),
// so arm bones can be moved whole. Runs once when the skeleton loads.
function findBones(o) {
  pivot.updateMatrixWorld(true);
  const toPivotBase = pivot.matrixWorld.clone().invert();
  const meshes = [];
  let total = 0;
  o.group.traverse(m => {
    if (!m.isMesh) return;
    meshes.push(m);
    total += m.geometry.attributes.position.count;
  });
  const parent = new Int32Array(total);
  for (let i = 0; i < total; i++) parent[i] = i;
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a, b) => {
    a = find(a); b = find(b);
    if (a !== b) parent[a] = b;
  };
  const px = new Float32Array(total), py = new Float32Array(total);
  const weld = new Map();
  const toPivot = new THREE.Matrix4(), v = new THREE.Vector3();
  let base = 0;
  for (const m of meshes) {
    toPivot.multiplyMatrices(toPivotBase, m.matrixWorld);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toPivot);
      px[base + i] = v.x;
      py[base + i] = v.y;
      const key = Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4);
      const same = weld.get(key);
      if (same === undefined) weld.set(key, base + i);
      else join(base + i, same);
    }
    const idx = m.geometry.index;
    const tris = idx ? idx.count : pos.count;
    for (let t = 0; t < tris; t += 3) {
      const a = base + (idx ? idx.getX(t) : t);
      join(a, base + (idx ? idx.getX(t + 1) : t + 1));
      join(a, base + (idx ? idx.getX(t + 2) : t + 2));
    }
    m.userData.armBase = base;
    base += pos.count;
  }
  // Centre of each bone.
  const root = new Int32Array(total), sx = new Float64Array(total), sy = new Float64Array(total), cnt = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    const r = find(i);
    root[i] = r;
    sx[r] += px[i];
    sy[r] += py[i];
    cnt[r]++;
  }
  o.bones = { meshes, root, sx, sy, cnt, key: '' };
}

// Mark each vertex with its bone's role (upper arm / forearm / none) and side.
function classifyArms(o) {
  const { meshes, root, sx, sy, cnt } = o.bones;
  const B = twin.bodyBox, H = B.max.y - B.min.y, cx = (B.min.x + B.max.x) / 2;
  const a = organFx.arm;
  for (const m of meshes) {
    const n = m.geometry.attributes.position.count, base = m.userData.armBase;
    let attr = m.geometry.getAttribute('aArm');
    if (!attr) {
      attr = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
      m.geometry.setAttribute('aArm', attr);
    }
    const arr = attr.array;
    for (let i = 0; i < n; i++) {
      const r = root[base + i];
      const dx = (sx[r] / cnt[r] - cx) / H, y = (sy[r] / cnt[r] - B.min.y) / H;
      let role = 0;
      if (Math.abs(dx) > a.start && y < a.shoulderY) {
        role = 1;
        if (y < a.elbowY) role = 2;
        if (y < a.wristY) role = 3;
      }
      arr[i * 2] = role;
      arr[i * 2 + 1] = dx < 0 ? -1 : 1;
    }
    attr.needsUpdate = true;
  }
}

// Organ material: tinted silhouette with halftone dots, plus the scan-in line, hover edge and region glow.
function organMaterial(u, source, doubleSided) {
  const m = new THREE.MeshStandardMaterial({
    color: '#000000', roughness: .5, metalness: 0,
    normalMap: source?.normalMap || null,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (source?.normalScale) m.normalScale.copy(source.normalScale);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u, shared, { uCyan: uni.uCyan, uRegionCenter: uni.uRegionCenter, uRegionRadius: uni.uRegionRadius, uPulse: uni.uPulse, uCell: uni.uCell });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;' + ARM_GLSL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
if (uArmOn > .5) {
  float ang, side;
  armBend(uPivotInv * modelMatrix * vec4(position, 1.0), ang, side);
  vec3 n = mat3(uPivotInv * modelMatrix) * objectNormal;
  n.x *= side; n.xy = rot2(n.xy, ang); n.x *= side;
  objectNormal = normalize(inverse(mat3(uPivotInv * modelMatrix)) * n);
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (uArmOn > .5) {
  float ang, side;
  vec4 bent = armBend(uPivotInv * modelMatrix * vec4(transformed, 1.0), ang, side);
  transformed = (inverse(modelMatrix) * uPivot * bent).xyz;
}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; uniform vec3 uCyan, uRegionCenter, uTint, uOrgDot;
uniform float uRegionRadius, uPulse, uReveal, uMinY, uMaxY, uTime, uRegionOn, uHover, uCell, uOrgStyle, uOrgEdge, uOrgShade, uSeverity;
float dotMask(float d, float r) { return 1.0 - smoothstep(r - .06, r + .06, d); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float span = uMaxY - uMinY;
float edgeY = uMinY + span * uReveal;
if (vW.y > edgeY) discard;`)
      .replace('#include <opaque_fragment>', `
vec3 n = normalize(normal);
float rim = 1.0 - clamp(abs(dot(n, normalize(vViewPosition))), 0.0, 1.0);
float lam = clamp(dot(n, normalize(vec3(-.55, .65, .55))), 0.0, 1.0);
vec2 g = mat2(.7071, -.7071, .7071, .7071) * gl_FragCoord.xy / uCell;
float d = length(fract(g) - .5);
vec3 col = uTint;
if (uOrgStyle < .5) {
  float dense = 1.0 + uSeverity * .4;
  float htR = max(uOrgEdge * smoothstep(.35, .97, rim) * .74, uOrgShade * smoothstep(.45, 1.0, lam) * .45) * dense;
  col = mix(col, uOrgDot, dotMask(d, htR) * step(.03, htR));
}
float scanLine = (1.0 - smoothstep(0.0, span * .012, abs(vW.y - edgeY))) * step(uReveal, .999);
float sweepY = uMinY + span * (fract(uTime * .16) * 1.4 - .2);
float sweep = (1.0 - smoothstep(0.0, span * .006, abs(vW.y - sweepY))) * .45 * step(.999, uReveal);
float reg = uRegionOn * (1.0 - smoothstep(uRegionRadius * .45, uRegionRadius, distance(vW, uRegionCenter)));
float hoverEdge = smoothstep(.55, .95, rim) * uHover;
outgoingLight = mix(col, uCyan, clamp(hoverEdge + scanLine + sweep + reg * (.22 + .3 * uPulse), 0.0, 1.0));
#include <opaque_fragment>`);
  };
  return m;
}

// Load one organ (cached). Resolves with its record; record.failed is set if it could not load.
export function loadOrgan(k) {
  if (organs[k]) return organs[k].promise;
  const o = organs[k] = {
    reveal: 0,
    u: {
      uReveal: { value: 0 }, uMinY: { value: 0 }, uMaxY: { value: 1 }, uTime: { value: 0 }, uRegionOn: { value: 0 }, uHover: { value: 0 },
      uTint: { value: new THREE.Color(DEFAULT_TINT) }, uSeverity: { value: 0 }, uArmOn: { value: 0 },
    },
  };
  o.promise = manifestReady.then(() => {
    const cfg = manifest.organs[k];
    if (!cfg || !twin.body) throw new Error('No model for ' + k);
    o.region = !!cfg.region;
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
      if (k === 'bones') findBones(o);
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
  // Remember the fitted spot so the FX panel can nudge it.
  o.basePos = center.clone();
  o.base0 = s;
  o.H = H;
  o.minY0 = minY;
  o.maxY0 = maxY;

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  if (cfg.frame) {
    o.frame = { point: new THREE.Vector3(0, B.min.y + cfg.frame.v * H, 0), dist: cfg.frame.half * H / tanHalf };
  } else {
    const shownTop = Math.min(maxY, topY);
    o.frame = { point: new THREE.Vector3(center.x, (minY + shownTop) / 2, center.z), dist: (shownTop - minY) / 2 / tanHalf / cfg.fill };
  }
}

// Where the camera should look at an organ right now: the fitted frame, moved and scaled
// by any FX panel nudge (organFx.place). Returns null if the organ has no model yet.
export function organFrame(k) {
  const o = organs[k];
  if (!o?.frame) return null;
  const point = o.frame.point.clone();
  let dist = o.frame.dist;
  const p = organFx.place[k];
  if (p && o.basePos) {
    point.sub(o.basePos).multiplyScalar(p.s).add(o.basePos);
    point.add(new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(o.H));
    dist *= p.s;
  }
  return { point, dist };
}

// Load the heart and lungs in the background. The écorché is big, so it only loads when opened.
export function prefetchOrgans() {
  loadOrgan('lungs').then(() => loadOrgan('heart'));
}

// Should this model be showing? The open system's model, or (on the Body view) the models of the picked layer.
function wanted(k, now) {
  if (twin.focus) return twin.focus === k && now - twin.focusAt > 650;
  return (LAYER_MODELS[twin.layer] || []).includes(k);
}

// Push the FX settings into the shared uniforms (cheap, runs every frame).
const tmpColor = new THREE.Color();
function applyOrganFx() {
  shared.uOrgStyle.value = organFx.style;
  shared.uOrgEdge.value = organFx.edge;
  shared.uOrgShade.value = organFx.shade;
  shared.uOrgDot.value.set(organFx.dotColor);
  const a = organFx.arm;
  shared.uArmAngle.value = a.angle;
  shared.uElbowAngle.value = a.elbow;
  shared.uShoulderX.value = a.shoulderX;
  shared.uShoulderY.value = a.shoulderY;
  shared.uElbowY.value = a.elbowY;
  shared.uWristAngle.value = a.wrist;
  shared.uWristY.value = a.wristY;
  pivot.updateMatrixWorld();
  shared.uPivot.value.copy(pivot.matrixWorld);
  shared.uPivotInv.value.copy(pivot.matrixWorld).invert();
  const B = twin.bodyBox;
  if (B) {
    shared.uBodyCX.value = (B.min.x + B.max.x) / 2;
    shared.uBodyMinY.value = B.min.y;
    shared.uBodyH.value = B.max.y - B.min.y;
  }
}

// Called every frame: scan organs in and out.
export function updateOrgans(now, dt) {
  applyOrganFx();
  for (const [k, o] of Object.entries(organs)) {
    if (!o.group) continue;
    const want = wanted(k, now);
    o.u.uHover.value += ((twin.hover === k ? 1 : 0) - o.u.uHover.value) * Math.min(1, dt * 8);
    // Region glow (the thigh on the écorché) only while that system is hovered or open.
    let regionGoal = 0;
    if (o.region && (twin.focus === k || twin.hover === k)) regionGoal = 1;
    o.u.uRegionOn.value += (regionGoal - o.u.uRegionOn.value) * Math.min(1, dt * 6);
    if (want) o.reveal = Math.min(1, o.reveal + dt / (k === 'muscles' ? 2.2 : 1.5));
    else o.reveal = Math.max(0, o.reveal - dt / .5);
    o.u.uReveal.value = o.reveal < .5 ? 4 * o.reveal ** 3 : 1 - Math.pow(-2 * o.reveal + 2, 3) / 2;
    o.u.uTime.value = now / 1000;
    // Tint darkens toward navy as severity rises (plan.md 5.2).
    const sev = twin.severity?.[k] || 0;
    o.u.uSeverity.value = sev;
    o.u.uTint.value.set(organFx.tints[k] || DEFAULT_TINT).lerp(tmpColor.copy(NAVY), sev * .8);
    const arm = organFx.arm;
    o.u.uArmOn.value = arm.on && o.bones ? 1 : 0;
    // Re-sort bones into arm / not arm when the related sliders change.
    if (o.bones && arm.on) {
      const key = arm.start + '|' + arm.shoulderY + '|' + arm.elbowY + '|' + arm.wristY;
      if (key !== o.bones.key) { classifyArms(o); o.bones.key = key; }
    }
    // FX panel nudge: move / resize the organ (and its scan-in range) from its fitted spot.
    const p = organFx.place[k];
    if (p && o.basePos) {
      const cy = o.basePos.y + p.y * o.H;
      o.group.position.set(o.basePos.x + p.x * o.H, cy, o.basePos.z + p.z * o.H);
      if (o.placeScale !== p.s) {
        o.base = o.base0 * p.s;   // animate3dOrgan breathes / beats around o.base
        o.group.scale.setScalar(o.base);
        o.placeScale = p.s;
      }
      o.u.uMinY.value = cy + (o.minY0 - o.basePos.y) * p.s;
      o.u.uMaxY.value = cy + (o.maxY0 - o.basePos.y) * p.s;
    }
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
