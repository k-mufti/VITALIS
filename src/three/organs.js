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
  // Arm rigs that pose the straight-down arms of the skeleton and muscle models to match the body.
  // Skeleton: each bone moves as one rigid piece. Muscles: one skin, blended softly at the joints.
  // start = arms are further out than this from the centre line; armpit = below this the arm skin is
  // separate from the torso (muscles only); soft = blend width at elbow / wrist (muscles only).
  // Per side (L = left on screen, R = right on screen), per joint (sh, el, wr):
  //   rz swing out (+) / in (-), rx swing forward (+) / back (-), ry twist   (degrees)
  //   px pivot distance from the centre line, py height from the feet, pz depth (+ = front)
  // Distances are fractions of body height.
  arm: {
    showJoints: false,
    bones: { on: true, start: .09, L: armPose(), R: armPose() },
    muscles: { on: true, start: .09, armpit: .76, soft: .02, L: armPose(), R: armPose() },
  },
  // Per-organ nudge from the FX panel: { x, y, z } as fractions of body height, s = size multiplier.
  place: {},
};
const DEFAULT_TINT = '#1846c4';

// Default arm pose (the skeleton fit tuned on Nov 14).
function armPose() {
  return {
    sh: { rx: 0, ry: 0, rz: 25.5, px: .06, py: .822, pz: 0 },
    el: { rx: 0, ry: 0, rz: -.5, px: .06, py: .682, pz: 0 },
    wr: { rx: 0, ry: 0, rz: 0, px: .06, py: .485, pz: 0 },
  };
}
const NAVY = new THREE.Color('#0A1F6B');   // plan.md 5.2 severe end of the blue scale

// Uniforms shared by every organ material.
const shared = {
  uOrgStyle: { value: 0 }, uOrgEdge: { value: .45 }, uOrgShade: { value: .3 }, uOrgDot: { value: new THREE.Color() },
  uPivot: { value: new THREE.Matrix4() }, uPivotInv: { value: new THREE.Matrix4() },
  uBodyCX: { value: 0 }, uBodyCZ: { value: 0 }, uBodyMinY: { value: 0 }, uBodyH: { value: 1 },

};

// Arm rig, in the body's own (pivot) space, mirrored so x = distance from the centre line.
// aArm is set per vertex on the CPU: x = how much it follows the arm (0..1), y = side (-1 left on
// screen, 1 right), z = how much it follows the forearm, w = how much it follows the hand.
// Skeleton weights are 0 or 1 (rigid bones), muscle weights blend. The shoulder turn carries
// the elbow and wrist, like a real arm.
const ARM_GLSL = `
attribute vec4 aArm;
uniform mat4 uPivot, uPivotInv;
uniform float uArmOn, uBodyCX, uBodyCZ, uBodyMinY, uBodyH;
uniform mat3 uRotL[3], uRotR[3];
uniform vec3 uJointL[3], uJointR[3];
vec4 armBend(vec4 pv, out mat3 R, out float side) {
  side = aArm.y;
  R = mat3(1.0);
  bool left = side < 0.0;
  mat3 Rs = left ? uRotL[0] : uRotR[0];
  mat3 Re = left ? uRotL[1] : uRotR[1];
  mat3 Rw = left ? uRotL[2] : uRotR[2];
  vec3 S = left ? uJointL[0] : uJointR[0];
  vec3 E = left ? uJointL[1] : uJointR[1];
  vec3 W = left ? uJointL[2] : uJointR[2];
  vec3 p = vec3(side * (pv.x - uBodyCX), pv.y - uBodyMinY, pv.z - uBodyCZ) / uBodyH;
  vec3 upper = S + Rs * (p - S);
  vec3 fore = S + Rs * (E - S + Re * (p - E));
  vec3 hand = S + Rs * (E - S + Re * (W - E + Rw * (p - W)));
  vec3 q = mix(mix(upper, fore, aArm.z), hand, aArm.w);
  q = mix(p, q, aArm.x);
  mat3 Rb = Rs + (Rs * Re - Rs) * aArm.z;
  Rb = Rb + (Rs * Re * Rw - Rb) * aArm.w;
  R = mat3(1.0) + (Rb - mat3(1.0)) * aArm.x;
  return vec4(uBodyCX + side * q.x * uBodyH, uBodyMinY + q.y * uBodyH, uBodyCZ + q.z * uBodyH, 1.0);
}`;

// Joint rotation from the panel's degrees. Matches the shader: X (forward/back) first, then Y (twist),
// then Z (out/in). rx is flipped so + swings the arm forward.
const m4 = new THREE.Matrix4(), eul = new THREE.Euler();
function jointRot(j, out) {
  const r = THREE.MathUtils.degToRad;
  eul.set(-r(j.rx), r(j.ry), r(j.rz), 'ZYX');
  return out.setFromMatrix4(m4.makeRotationFromEuler(eul));
}

// Where each joint ends up after the chain (mirrored body-fraction space). For the joint markers.
function posedJoints(sd) {
  const Rs = jointRot(sd.sh, new THREE.Matrix3()), Re = jointRot(sd.el, new THREE.Matrix3());
  const S = new THREE.Vector3(sd.sh.px, sd.sh.py, sd.sh.pz);
  const E = new THREE.Vector3(sd.el.px, sd.el.py, sd.el.pz);
  const W = new THREE.Vector3(sd.wr.px, sd.wr.py, sd.wr.pz);
  const E2 = E.clone().sub(S).applyMatrix3(Rs).add(S);
  const W2 = W.clone().sub(E).applyMatrix3(Re).applyMatrix3(Rs).add(E2);
  return [S, E2, W2];
}

// Mesh graph of a model in pivot space: vertex positions, a welded id per vertex (vertices at the
// same spot, split by UV seams, share one id) and the triangles. Built once when the model loads.
function buildGraph(o) {
  pivot.updateMatrixWorld(true);
  const toPivotBase = pivot.matrixWorld.clone().invert();
  const meshes = [];
  let total = 0, triTotal = 0;
  o.group.traverse(m => {
    if (!m.isMesh) return;
    meshes.push(m);
    total += m.geometry.attributes.position.count;
    triTotal += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  });
  const px = new Float32Array(total), py = new Float32Array(total), weld = new Int32Array(total), tri = new Int32Array(triTotal);
  const seen = new Map();
  const toPivot = new THREE.Matrix4(), v = new THREE.Vector3();
  let base = 0, t3 = 0;
  for (const m of meshes) {
    toPivot.multiplyMatrices(toPivotBase, m.matrixWorld);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toPivot);
      px[base + i] = v.x;
      py[base + i] = v.y;
      const key = Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4);
      const same = seen.get(key);
      if (same === undefined) { seen.set(key, base + i); weld[base + i] = base + i; }
      else weld[base + i] = same;
    }
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t++) tri[t3++] = base + (idx ? idx.getX(t) : t);
    m.userData.armBase = base;
    base += pos.count;
  }
  o.graph = { meshes, total, px, py, weld, tri };
}

// Union-find over the graph. `keep(i)` limits which vertices may be joined.
function components(g, keep) {
  const parent = new Int32Array(g.total);
  for (let i = 0; i < g.total; i++) parent[i] = i;
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a, b) => {
    if (keep && (!keep(a) || !keep(b))) return;
    a = find(a); b = find(b);
    if (a !== b) parent[a] = b;
  };
  for (let i = 0; i < g.total; i++) join(i, g.weld[i]);
  for (let t = 0; t < g.tri.length; t += 3) {
    join(g.tri[t], g.tri[t + 1]);
    join(g.tri[t + 1], g.tri[t + 2]);
  }
  const root = new Int32Array(g.total);
  for (let i = 0; i < g.total; i++) root[i] = find(i);
  return root;
}

// Write per-vertex weights into each mesh's aArm attribute. fill(i, out4) sets the 4 values.
function writeWeights(g, fill) {
  const w = [0, 0, 0, 0];
  for (const m of g.meshes) {
    const n = m.geometry.attributes.position.count, base = m.userData.armBase;
    let attr = m.geometry.getAttribute('aArm');
    if (!attr) {
      attr = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
      m.geometry.setAttribute('aArm', attr);
    }
    const arr = attr.array;
    for (let i = 0; i < n; i++) {
      fill(base + i, w);
      arr.set(w, i * 4);
    }
    attr.needsUpdate = true;
  }
}

const body = () => {
  const B = twin.bodyBox;
  return { B, H: B.max.y - B.min.y, cx: (B.min.x + B.max.x) / 2 };
};

// Skeleton: sort each bone (by its centre) into upper arm / forearm / hand. Rigid 0-or-1 weights.
function classifyBones(o, rig) {
  const g = o.graph, { B, H, cx } = body();
  if (!o.boneRoot) o.boneRoot = components(g);
  const root = o.boneRoot;
  const sx = new Float64Array(g.total), sy = new Float64Array(g.total), cnt = new Int32Array(g.total);
  for (let i = 0; i < g.total; i++) { const r = root[i]; sx[r] += g.px[i]; sy[r] += g.py[i]; cnt[r]++; }
  writeWeights(g, (i, w) => {
    const r = root[i];
    const dx = (sx[r] / cnt[r] - cx) / H, y = (sy[r] / cnt[r] - B.min.y) / H;
    const sd = dx < 0 ? rig.L : rig.R;
    const arm = Math.abs(dx) > rig.start && y < sd.sh.py;
    w[0] = arm ? 1 : 0;
    w[1] = dx < 0 ? -1 : 1;
    w[2] = arm && y < sd.el.py ? 1 : 0;
    w[3] = arm && y < sd.wr.py ? 1 : 0;
  });
}

// Muscles: one skin. Below the armpit the arm is not joined to the torso, so the arm is the
// outermost connected piece on each side. Joints blend over `soft`; the shoulder fades into the torso.
function classifySkin(o, rig) {
  const g = o.graph, { B, H, cx } = body();
  const fx = i => (g.px[i] - cx) / H, fy = i => (g.py[i] - B.min.y) / H;
  const below = i => fy(i) < rig.armpit && Math.abs(fx(i)) > rig.start;
  const root = components(g, below);
  // Per piece: size, mean distance from the centre, height range, side.
  const stats = new Map();
  for (let i = 0; i < g.total; i++) {
    if (!below(i)) continue;
    const r = root[i];
    let st = stats.get(r);
    if (!st) stats.set(r, st = { n: 0, ax: 0, sx: 0, top: -1, bottom: 2 });
    const x = fx(i), y = fy(i);
    st.n++; st.ax += Math.abs(x); st.sx += x;
    if (y > st.top) st.top = y;
    if (y < st.bottom) st.bottom = y;
  }
  // The arm on each side: reaches up to the armpit, down past the elbow, and sits furthest out.
  const best = { L: null, R: null };
  for (const [r, st] of stats) {
    const sd = st.sx < 0 ? 'L' : 'R';
    if (st.n < 200 || st.top < rig.armpit - .03 || st.bottom > rig[sd].el.py) continue;
    if (!best[sd] || st.ax / st.n > best[sd].mean) best[sd] = { r, mean: st.ax / st.n };
  }
  const armRoots = new Set([best.L?.r, best.R?.r]);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  writeWeights(g, (i, w) => {
    const x = fx(i), y = fy(i), sd = x < 0 ? rig.L : rig.R;
    let a = 0;
    if (armRoots.has(root[i]) && below(i)) a = 1;
    else if (y >= rig.armpit && Math.abs(x) > rig.start) {
      // Shoulder cap above the armpit: fade from full arm to torso.
      a = (1 - ss(rig.armpit, sd.sh.py + .02, y)) * ss(rig.start, rig.start + .02, Math.abs(x));
    }
    w[0] = a;
    w[1] = x < 0 ? -1 : 1;
    w[2] = 1 - ss(sd.el.py - rig.soft, sd.el.py + rig.soft, y);
    w[3] = 1 - ss(sd.wr.py - rig.soft, sd.wr.py + rig.soft, y);
  });
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
if (uArmOn > .5 && aArm.x > 0.0) {
  mat3 R; float side;
  armBend(uPivotInv * modelMatrix * vec4(position, 1.0), R, side);
  vec3 n = mat3(uPivotInv * modelMatrix) * objectNormal;
  n.x *= side; n = R * n; n.x *= side;
  objectNormal = normalize(inverse(mat3(uPivotInv * modelMatrix)) * n);
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (uArmOn > .5 && aArm.x > 0.0) {
  mat3 R; float side;
  vec4 bent = armBend(uPivotInv * modelMatrix * vec4(transformed, 1.0), R, side);
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
      // Arm rig: [shoulder, elbow, wrist] rotation and pivot per side (skeleton and muscles only)
      uRotL: { value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] },
      uRotR: { value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] },
      uJointL: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uJointR: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
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
      // Arm rigs need the mesh graph. Built just after the first frame so the model shows first.
      if (organFx.arm[k]) setTimeout(() => buildGraph(o), 60);
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

// Small cyan dots on each arm joint (FX panel "Show joint markers"), drawn on top of everything.
function updateJointMarkers(o, rig) {
  const B = twin.bodyBox;
  const on = rig.on && organFx.arm.showJoints && o.group.visible;
  if (!o.markers && !on) return;
  if (!o.markers) {
    o.markers = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#0aa5bd', depthTest: false, transparent: true });
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 6; i++) {
      const dot = new THREE.Mesh(geo, mat);
      dot.renderOrder = 20;
      o.markers.add(dot);
    }
    pivot.add(o.markers);
  }
  o.markers.visible = on;
  if (!on) return;
  const H = B.max.y - B.min.y, cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
  [[rig.L, -1], [rig.R, 1]].forEach(([sd, side], s) => {
    posedJoints(sd).forEach((j, i) => {
      const dot = o.markers.children[s * 3 + i];
      dot.position.set(cx + side * j.x * H, B.min.y + j.y * H, cz + j.z * H);
      dot.scale.setScalar(H * (i === 0 ? .009 : .007));
    });
  });
}

// Push one rig's joints into an organ's uniforms, and re-weight the mesh when its split points move.
// The muscle skin is big, so it waits until the sliders have been still for a moment.
function updateRig(k, o, rig, now) {
  o.u.uArmOn.value = rig.on && o.graph ? 1 : 0;
  ['sh', 'el', 'wr'].forEach((j, i) => {
    jointRot(rig.L[j], o.u.uRotL.value[i]);
    jointRot(rig.R[j], o.u.uRotR.value[i]);
    o.u.uJointL.value[i].set(rig.L[j].px, rig.L[j].py, rig.L[j].pz);
    o.u.uJointR.value[i].set(rig.R[j].px, rig.R[j].py, rig.R[j].pz);
  });
  if (!o.graph || !rig.on) return;
  const key = [rig.start, rig.armpit, rig.soft, ...['L', 'R'].flatMap(sd => ['sh', 'el', 'wr'].map(j => rig[sd][j].py))].join('|');
  if (key !== o.rigKey) { o.rigKey = key; o.rigAt = now; }
  const wait = k === 'muscles' ? 300 : 0;
  if (o.rigDone !== key && now - o.rigAt >= wait) {
    if (k === 'muscles') classifySkin(o, rig);
    else classifyBones(o, rig);
    o.rigDone = key;
  }
  updateJointMarkers(o, rig);
}

// Push the FX settings into the shared uniforms (cheap, runs every frame).
const tmpColor = new THREE.Color();
function applyOrganFx() {
  shared.uOrgStyle.value = organFx.style;
  shared.uOrgEdge.value = organFx.edge;
  shared.uOrgShade.value = organFx.shade;
  shared.uOrgDot.value.set(organFx.dotColor);
  pivot.updateMatrixWorld();
  shared.uPivot.value.copy(pivot.matrixWorld);
  shared.uPivotInv.value.copy(pivot.matrixWorld).invert();
  const B = twin.bodyBox;
  if (B) {
    shared.uBodyCX.value = (B.min.x + B.max.x) / 2;
    shared.uBodyMinY.value = B.min.y;
    shared.uBodyCZ.value = (B.min.z + B.max.z) / 2;
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
    if (organFx.arm[k]) updateRig(k, o, organFx.arm[k], now);
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
