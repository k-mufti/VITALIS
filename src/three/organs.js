import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { camera, renderer, pivot, twin, XRAY_LAYER } from './scene.js';
import { uni, pt } from './body.js';
import { LAYER_MODELS } from './anatomy-panel.js';
import { markHurt } from './injury-parts.js';

/* 3D organ models from assets/models/manifest.json. They sit inside the glass body
   and appear with an upward scan line when their system is opened.

   Manifest fields per organ (on top of plan.md 5.6). Files are .glb (geometry + normal map only):
   anchor  [x from centre line, height fraction from the feet] of the organ's centre
   width / height  organ size as a fraction of body height (scale multiplies it)
   depth   how far behind the body surface the centre sits (fraction of body height)
   fill    share of the view the organ fills when focused
   clipTop cut the model off above this share of its height (trims the lungs' long trachea)
   fullBody  model replaces the skin (the écorché), framed by `frame`
   pair    show the model twice, mirrored (eyes, ears): gap between the two centres as a fraction
           of body height; + puts the file's own copy on the screen-right side
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

// Starting pose: joints where a straight-down limb bends, no turns.
const LIMB_JOINTS = {
  arms: [[.06, .822], [.06, .682], [.06, .485]],   // shoulder, elbow, wrist [from centre, height]
  legs: [[.05, .52], [.05, .285], [.045, .04]],    // hip, knee, ankle
};
function limbPose(limb) {
  return LIMB_JOINTS[limb].map(([px, py]) => ({ rx: 0, ry: 0, rz: 0, px, py, pz: 0 }));
}
function limbRig(limb) {
  return { on: true, start: limb === 'arms' ? .09 : .015, L: limbPose(limb), R: limbPose(limb) };
}

// Organ look + limb rigs. look.js (and the ?dev FX panel) set these; updateOrgans() applies them.
export const organFx = {
  style: 0,                 // 0 = halftone, 1 = flat silhouette
  edge: 1,                  // edge dots 0..1
  shade: 1,                 // dots on the lit side 0..1
  dotColor: '#7fe9ff',
  tints: { heart: '#0a1f6b', lungs: '#1f5fd1', bones: '#13308f', muscles: '#1846c4', sleep: '#3d6ff0', digestion: '#22409e',
    eyes: '#0f2a80', ears: '#1f5fd1', kidneys: '#1a3aa8' },
  // Limb rigs that pose the skeleton's and muscle model's arms and legs to match the body.
  // Skeleton: each bone moves as one rigid piece. Muscles: one skin, blended softly at the joints.
  // Per limb: on, start (the limb is further out than this from the centre line), and for the muscle
  // skin `cut` (below this height the limb's skin is separate from the torso: armpit / crotch) and
  // `soft` (blend width at the joints). L / R = left / right on screen, each 3 joints
  // (arms: shoulder, elbow, wrist; legs: hip, knee, ankle) with
  //   rz swing out (+) / in (-), rx swing forward (+) / back (-), ry twist   (degrees)
  //   px pivot distance from the centre line, py height from the feet, pz depth (+ = front)
  // Distances are fractions of body height.
  rigs: {
    showJoints: false,
    bones: { arms: limbRig('arms'), legs: limbRig('legs') },
    muscles: { arms: { ...limbRig('arms'), cut: .76, soft: .02 }, legs: { ...limbRig('legs'), cut: .47, soft: .02 } },
  },
  // Per-organ nudge from the FX panel: { x, y, z } as fractions of body height, s = size multiplier.
  place: {},
};
const DEFAULT_TINT = '#1846c4';
const NAVY = new THREE.Color('#0A1F6B');   // plan.md 5.2 severe end of the blue scale

// Uniforms shared by every organ material.
const shared = {
  uOrgStyle: { value: 0 }, uOrgEdge: { value: .45 }, uOrgShade: { value: .3 }, uOrgDot: { value: new THREE.Color() },
  uPivot: { value: new THREE.Matrix4() }, uPivotInv: { value: new THREE.Matrix4() },
  uBodyCX: { value: 0 }, uBodyCZ: { value: 0 }, uBodyMinY: { value: 0 }, uBodyH: { value: 1 },
  // Injury: the hurt bone, muscle or organ turns this red, with lighter dots.
  uHurtColor: { value: new THREE.Color('#e0442e') }, uHurtDot: { value: new THREE.Color('#ffc4b8') },
};

// Limb rigs, in the body's own (pivot) space, mirrored so x = distance from the centre line.
// aArm / aLeg are set per vertex on the CPU: x = how much it follows the limb (0..1), y = side
// (-1 left on screen, 1 right), z = how much it follows the middle joint (elbow / knee),
// w = how much it follows the end joint (wrist / ankle). Skeleton weights are 0 or 1 (rigid bones),
// muscle weights blend. The first joint's turn carries the next two, like a real limb.
const LIMB_GLSL = `
attribute vec4 aArm, aLeg;
uniform mat4 uPivot, uPivotInv;
uniform float uArmOn, uLegOn, uBodyCX, uBodyCZ, uBodyMinY, uBodyH;
uniform mat3 uArmRotL[3], uArmRotR[3], uLegRotL[3], uLegRotR[3];
uniform vec3 uArmJointL[3], uArmJointR[3], uLegJointL[3], uLegJointR[3];
vec3 limbChain(vec3 p, vec4 a, mat3 R0, mat3 R1, mat3 R2, vec3 J0, vec3 J1, vec3 J2, out mat3 R) {
  vec3 top = J0 + R0 * (p - J0);
  vec3 mid = J0 + R0 * (J1 - J0 + R1 * (p - J1));
  vec3 end = J0 + R0 * (J1 - J0 + R1 * (J2 - J1 + R2 * (p - J2)));
  vec3 q = mix(mix(top, mid, a.z), end, a.w);
  mat3 Rb = R0 + (R0 * R1 - R0) * a.z;
  Rb = Rb + (R0 * R1 * R2 - Rb) * a.w;
  R = mat3(1.0) + (Rb - mat3(1.0)) * a.x;
  return mix(p, q, a.x);
}
vec4 limbBend(vec4 pv, out mat3 R, out float side) {
  R = mat3(1.0);
  bool leg = aLeg.x > aArm.x;
  vec4 a = leg ? aLeg : aArm;
  side = a.y;
  if (a.x <= 0.0 || (leg ? uLegOn : uArmOn) < .5) return pv;
  bool left = side < 0.0;
  vec3 p = vec3(side * (pv.x - uBodyCX), pv.y - uBodyMinY, pv.z - uBodyCZ) / uBodyH;
  vec3 q;
  if (leg) {
    q = left ? limbChain(p, a, uLegRotL[0], uLegRotL[1], uLegRotL[2], uLegJointL[0], uLegJointL[1], uLegJointL[2], R)
             : limbChain(p, a, uLegRotR[0], uLegRotR[1], uLegRotR[2], uLegJointR[0], uLegJointR[1], uLegJointR[2], R);
  } else {
    q = left ? limbChain(p, a, uArmRotL[0], uArmRotL[1], uArmRotL[2], uArmJointL[0], uArmJointL[1], uArmJointL[2], R)
             : limbChain(p, a, uArmRotR[0], uArmRotR[1], uArmRotR[2], uArmJointR[0], uArmJointR[1], uArmJointR[2], R);
  }
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
function posedJoints(js) {
  const R0 = jointRot(js[0], new THREE.Matrix3()), R1 = jointRot(js[1], new THREE.Matrix3());
  const [J0, J1, J2] = js.map(j => new THREE.Vector3(j.px, j.py, j.pz));
  const J1b = J1.clone().sub(J0).applyMatrix3(R0).add(J0);
  const J2b = J2.clone().sub(J1).applyMatrix3(R1).applyMatrix3(R0).add(J1b);
  return [J0, J1b, J2b];
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
  const px = new Float32Array(total), py = new Float32Array(total), pz = new Float32Array(total), weld = new Int32Array(total), tri = new Int32Array(triTotal);
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
      pz[base + i] = v.z;
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
  o.graph = { meshes, total, px, py, pz, weld, tri };
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

// Write per-vertex weights into each mesh's aArm and aLeg attributes. fill(i, arm4, leg4) sets them.
function writeWeights(g, fill) {
  const wa = [0, 0, 0, 0], wl = [0, 0, 0, 0];
  for (const m of g.meshes) {
    const n = m.geometry.attributes.position.count, base = m.userData.armBase;
    const attrs = ['aArm', 'aLeg'].map(name => {
      let attr = m.geometry.getAttribute(name);
      if (!attr) {
        attr = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
        m.geometry.setAttribute(name, attr);
      }
      return attr;
    });
    for (let i = 0; i < n; i++) {
      wa.fill(0); wl.fill(0);
      fill(base + i, wa, wl);
      attrs[0].array.set(wa, i * 4);
      attrs[1].array.set(wl, i * 4);
    }
    attrs.forEach(a => (a.needsUpdate = true));
  }
}

const body = () => {
  const B = twin.bodyBox;
  return { B, H: B.max.y - B.min.y, cx: (B.min.x + B.max.x) / 2 };
};
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Skeleton: sort each bone (by its centre) into a limb part. Arms first, then legs. Rigid 0-or-1 weights.
function classifyBones(o, rigs) {
  const g = o.graph, { B, H, cx } = body();
  if (!o.boneStats) {
    const root = components(g);
    const sx = new Float64Array(g.total), sy = new Float64Array(g.total), cnt = new Int32Array(g.total);
    for (let i = 0; i < g.total; i++) { const r = root[i]; sx[r] += g.px[i]; sy[r] += g.py[i]; cnt[r]++; }
    o.boneStats = { root, sx, sy, cnt };
  }
  const { root, sx, sy, cnt } = o.boneStats;
  const { arms, legs } = rigs;
  writeWeights(g, (i, wa, wl) => {
    const r = root[i];
    const dx = (sx[r] / cnt[r] - cx) / H, y = (sy[r] / cnt[r] - B.min.y) / H;
    const side = dx < 0 ? -1 : 1, sd = dx < 0 ? 'L' : 'R';
    const ja = arms[sd], jl = legs[sd];
    if (Math.abs(dx) > arms.start && y < ja[0].py) {
      wa[0] = 1; wa[1] = side; wa[2] = y < ja[1].py ? 1 : 0; wa[3] = y < ja[2].py ? 1 : 0;
    } else if (Math.abs(dx) > legs.start && y < jl[0].py) {
      wl[0] = 1; wl[1] = side; wl[2] = y < jl[1].py ? 1 : 0; wl[3] = y < jl[2].py ? 1 : 0;
    }
  });
}

// One limb on a skin: below `cut` the limb's skin is a separate piece. pick(stats) chooses it per side.
function skinLimb(g, fx, fy, rig, skip, pick) {
  const below = i => !skip(i) && fy(i) < rig.cut && Math.abs(fx(i)) > rig.start;
  const root = components(g, below);
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
  const best = { L: null, R: null };
  for (const [r, st] of stats) {
    if (st.n < 200) continue;
    const sd = st.sx < 0 ? 'L' : 'R';
    const score = pick(st, rig[sd]);
    if (score !== null && (!best[sd] || score > best[sd].score)) best[sd] = { r, score };
  }
  const roots = new Set([best.L?.r, best.R?.r]);
  return i => roots.has(root[i]) && below(i);
}

// Muscles: one skin. Arms: outermost piece below the armpit. Legs: the piece reaching lowest
// below the crotch. Joints blend over `soft`; the top joint fades into the torso.
function classifySkin(o, rigs) {
  const g = o.graph, { B, H, cx } = body();
  const fx = i => (g.px[i] - cx) / H, fy = i => (g.py[i] - B.min.y) / H;
  const { arms, legs } = rigs;
  const inArm = skinLimb(g, fx, fy, arms, () => false,
    (st, js) => (st.top < arms.cut - .03 || st.bottom > js[1].py ? null : st.ax / st.n));
  const inLeg = skinLimb(g, fx, fy, legs, inArm,
    st => (st.top < legs.cut - .03 ? null : -st.bottom));
  const fill = (rig, inside, i, w) => {
    const x = fx(i), y = fy(i), js = x < 0 ? rig.L : rig.R;
    let a = 0;
    if (inside(i)) a = 1;
    else if (y >= rig.cut && Math.abs(x) > rig.start) a = (1 - ss(rig.cut, js[0].py + .02, y)) * ss(rig.start, rig.start + .02, Math.abs(x));
    w[0] = a;
    w[1] = x < 0 ? -1 : 1;
    w[2] = 1 - ss(js[1].py - rig.soft, js[1].py + rig.soft, y);
    w[3] = 1 - ss(js[2].py - rig.soft, js[2].py + rig.soft, y);
  };
  writeWeights(g, (i, wa, wl) => {
    if (arms.on) fill(arms, inArm, i, wa);
    if (legs.on && !inArm(i) && fy(i) < legs.L[0].py + .05) fill(legs, inLeg, i, wl);
    if (wa[0] > 0 && wl[0] > 0) wl[0] = 0;   // a vertex follows one limb only
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; attribute vec2 aHurt; varying vec2 vHurt;' + LIMB_GLSL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
if (aArm.x > 0.0 || aLeg.x > 0.0) {
  mat3 R; float side;
  limbBend(uPivotInv * modelMatrix * vec4(position, 1.0), R, side);
  vec3 n = mat3(uPivotInv * modelMatrix) * objectNormal;
  n.x *= side; n = R * n; n.x *= side;
  objectNormal = normalize(inverse(mat3(uPivotInv * modelMatrix)) * n);
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aArm.x > 0.0 || aLeg.x > 0.0) {
  mat3 R; float side;
  vec4 bent = limbBend(uPivotInv * modelMatrix * vec4(transformed, 1.0), R, side);
  transformed = (inverse(modelMatrix) * uPivot * bent).xyz;
}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vHurt = aHurt;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vHurt; uniform vec3 uCyan, uRegionCenter, uTint, uOrgDot, uHurtColor, uHurtDot;
uniform float uRegionRadius, uPulse, uReveal, uMinY, uMaxY, uTime, uRegionOn, uHover, uCell, uOrgStyle, uOrgEdge, uOrgShade, uSeverity, uFlag, uSheer, uHurt, uHurtAll;
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
float dots = 0.0;
if (uOrgStyle < .5) {
  float dense = 1.0 + uSeverity * .4;
  float htR = max(uOrgEdge * smoothstep(.35, .97, rim) * .74, uOrgShade * smoothstep(.45, 1.0, lam) * .45) * dense;
  dots = dotMask(d, htR) * step(.03, htR);
  col = mix(col, uOrgDot, dots);
}
// Injury: the hurt part itself turns red. vHurt.x = all of this bone or muscle,
// vHurt.y = only the end of a bone near the hurt spot (a joint), uHurtAll = the whole organ.
float nearSpot = 1.0 - smoothstep(uRegionRadius * .7, uRegionRadius * 1.7, distance(vW, uRegionCenter));
float hurt = clamp(max(max(vHurt.x, uHurtAll), vHurt.y * nearSpot), 0.0, 1.0) * uHurt;
col = mix(col, mix(uHurtColor, uHurtDot, dots) * (.94 + .06 * sin(uTime * 2.4)), hurt);
float scanLine = (1.0 - smoothstep(0.0, span * .012, abs(vW.y - edgeY))) * step(uReveal, .999);
float sweepY = uMinY + span * (fract(uTime * .16) * 1.4 - .2);
float sweep = (1.0 - smoothstep(0.0, span * .006, abs(vW.y - sweepY))) * .45 * step(.999, uReveal);
float reg = uRegionOn * (1.0 - smoothstep(uRegionRadius * .45, uRegionRadius, distance(vW, uRegionCenter)));
float hoverEdge = smoothstep(.55, .95, rim) * uHover;
// Needs a look: the edge glows cyan and breathes slowly.
float flagEdge = smoothstep(.3, .95, rim) * uFlag * (.55 + .45 * sin(uTime * 3.2));
outgoingLight = mix(col, uCyan, clamp(hoverEdge + flagEdge + scanLine + sweep + reg * (.22 + .3 * uPulse), 0.0, 1.0));
// Sheer (whole-body systems seen through the body): outline stays, the inside goes see-through.
diffuseColor.a *= mix(1.0, .12 + .75 * smoothstep(.25, .95, rim), uSheer);
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
      uTint: { value: new THREE.Color(DEFAULT_TINT) }, uSeverity: { value: 0 }, uFlag: { value: 0 }, uSheer: { value: 0 }, uArmOn: { value: 0 },
      uHurt: { value: 0 }, uHurtAll: { value: 0 },   // injury: how red, and whether the whole organ is
      uLegOn: { value: 0 },
      // Limb rigs: 3 joint rotations and pivots per side (skeleton and muscles only)
      ...Object.fromEntries(['Arm', 'Leg'].flatMap(l => ['L', 'R'].flatMap(sd => [
        [`u${l}Rot${sd}`, { value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] }],
        [`u${l}Joint${sd}`, { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }],
      ]))),
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
      if (organFx.rigs[k]) setTimeout(() => buildGraph(o), 60);
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
  if (cfg.pair) {
    const half = cfg.pair * H / 2 / s;
    const one = new THREE.Group();
    one.add(model);
    one.position.x = half;
    const other = one.clone();   // shares geometry and material; a negative scale mirrors it
    other.scale.x = -1;
    other.position.x = -half;
    holder.add(one, other);
    o.pairHalf = half;
  } else {
    holder.add(model);
  }
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

// The écorché is the whole body, so it cannot show through it.
const NO_XRAY = ['muscles'];
// The skeleton fills the body: through the skin it shows as a sheer outline so organs stay visible.
const SHEER = ['bones'];

/* On the Body view, an organ that needs a look (or is hovered in a panel) shows through the
   skin: it is drawn in a second pass over the body instead of on the body's surface. */
export function xrayWanted(k) {
  if (twin.focus || NO_XRAY.includes(k) || !has3dOrgan(k)) return false;
  if ((LAYER_MODELS[twin.layer] || []).includes(k)) return false;   // already showing in its layer
  return (twin.showFlagged && twin.flagged.has(k)) || twin.hover === k;   // showFlagged: "Highlight" switch
}

// True when at least one organ is showing through the body (api.js then draws the x-ray pass).
export function xrayShowing() {
  return Object.values(organs).some(o => o.xray && o.group?.visible);
}

// Should this model be showing? The open system's model, or (on the Body view) the models of the
// picked layer and any organ that needs a look.
function wanted(k, now) {
  if (twin.injury) return twin.injuryModel === k && now - twin.focusAt > 650;   // injury drill: only the hurt part
  if (twin.focus) return twin.focus === k && now - twin.focusAt > 650;
  return (LAYER_MODELS[twin.layer] || []).includes(k) || xrayWanted(k);
}

// Move an organ between the normal pass and the x-ray pass. Sheer systems blend only while in x-ray.
function setXray(k, o, on) {
  if (o.xray === on) return;
  o.xray = on;
  const sheer = on && SHEER.includes(k);
  o.group.traverse(m => {
    m.layers.set(on ? XRAY_LAYER : 0);
    if (!m.isMesh) return;
    m.material.transparent = sheer;
    // In x-ray, draw only inside the body's silhouette (the skin writes 1 into the stencil).
    Object.assign(m.material, { stencilWrite: on, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp });
  });
}

// Small cyan dots on each limb joint (FX panel "Show joint markers"), drawn on top of everything.
function updateJointMarkers(o, rigs) {
  const B = twin.bodyBox;
  const on = organFx.rigs.showJoints && o.group.visible;
  if (!o.markers && !on) return;
  if (!o.markers) {
    o.markers = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#0aa5bd', depthTest: false, transparent: true });
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 12; i++) {
      const dot = new THREE.Mesh(geo, mat);
      dot.renderOrder = 20;
      o.markers.add(dot);
    }
    pivot.add(o.markers);
  }
  o.markers.visible = on;
  if (!on) return;
  const H = B.max.y - B.min.y, cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
  let n = 0;
  for (const limb of ['arms', 'legs']) {
    const rig = rigs[limb];
    for (const [sd, side] of [['L', -1], ['R', 1]]) {
      posedJoints(rig[sd]).forEach((j, i) => {
        const dot = o.markers.children[n++];
        dot.visible = rig.on;
        dot.position.set(cx + side * j.x * H, B.min.y + j.y * H, cz + j.z * H);
        dot.scale.setScalar(H * (i === 0 ? .009 : .007));
      });
    }
  }
}

// Push the rigs' joints into an organ's uniforms, and re-weight the mesh when its split points move.
// The muscle skin is big, so it waits until the sliders have been still for a moment.
function updateRig(k, o, rigs, now) {
  o.u.uArmOn.value = rigs.arms.on && o.graph ? 1 : 0;
  o.u.uLegOn.value = rigs.legs.on && o.graph ? 1 : 0;
  for (const [limb, l] of [['arms', 'Arm'], ['legs', 'Leg']]) {
    for (const sd of ['L', 'R']) {
      rigs[limb][sd].forEach((j, i) => {
        jointRot(j, o.u[`u${l}Rot${sd}`].value[i]);
        o.u[`u${l}Joint${sd}`].value[i].set(j.px, j.py, j.pz);
      });
    }
  }
  if (!o.graph) return;
  const key = ['arms', 'legs'].flatMap(limb => {
    const r = rigs[limb];
    return [r.on, r.start, r.cut, r.soft, ...['L', 'R'].flatMap(sd => r[sd].map(j => j.py))];
  }).join('|');
  if (key !== o.rigKey) { o.rigKey = key; o.rigAt = now; }
  const wait = k === 'muscles' ? 300 : 0;
  if (o.rigDone !== key && now - o.rigAt >= wait) {
    if (k === 'muscles') classifySkin(o, rigs);
    else classifyBones(o, rigs);
    o.rigDone = key;
  }
  updateJointMarkers(o, rigs);
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
    // X-ray while it is wanted that way; when it is fading out, stay in x-ray until it is gone.
    const xray = xrayWanted(k);
    if (xray) setXray(k, o, true);
    else if (want || o.reveal <= 0) setXray(k, o, false);
    o.u.uFlag.value += ((o.xray && twin.showFlagged && twin.flagged.has(k) ? 1 : 0) - o.u.uFlag.value) * Math.min(1, dt * 4);
    o.u.uSheer.value = o.xray && SHEER.includes(k) ? 1 : 0;
    o.u.uHover.value += ((twin.hover === k ? 1 : 0) - o.u.uHover.value) * Math.min(1, dt * 8);
    // Region glow (the thigh on the écorché) only while that system is hovered or open.
    let regionGoal = 0;
    if (o.region && (twin.focus === k || twin.hover === k)) regionGoal = 1;
    // Injury: the hurt bone, muscle or organ turns red (injury-parts.js). Limb models are marked once
    // their rig is ready. Until then, or if nothing could be marked, the hurt spot glows instead.
    const hurtHere = twin.injury && twin.injuryModel === k;
    if (hurtHere && o.hurtId !== twin.injurySpot.id && (!organFx.rigs[k] || (o.graph && o.rigDone))) {
      o.hurtId = twin.injurySpot.id;
      o.hurtMode = markHurt(k, o, twin.injurySpot);
      o.u.uHurtAll.value = o.hurtMode === 'all' ? 1 : 0;
    }
    const hurtShown = hurtHere && o.hurtId === twin.injurySpot.id && !!o.hurtMode;
    o.u.uHurt.value += ((hurtShown ? 1 : 0) - o.u.uHurt.value) * Math.min(1, dt * 5);
    if (hurtHere && !hurtShown) regionGoal = 1.8;
    o.u.uRegionOn.value += (regionGoal - o.u.uRegionOn.value) * Math.min(1, dt * 6);
    if (want) o.reveal = Math.min(1, o.reveal + dt / (k === 'muscles' ? 2.2 : 1.5));
    else o.reveal = Math.max(0, o.reveal - dt / .5);
    o.u.uReveal.value = o.reveal < .5 ? 4 * o.reveal ** 3 : 1 - Math.pow(-2 * o.reveal + 2, 3) / 2;
    o.u.uTime.value = now / 1000;
    // Tint darkens toward navy as severity rises (plan.md 5.2).
    const sev = twin.severity?.[k] || 0;
    o.u.uSeverity.value = sev;
    o.u.uTint.value.set(organFx.tints[k] || DEFAULT_TINT).lerp(tmpColor.copy(NAVY), sev * .8);
    if (organFx.rigs[k]) updateRig(k, o, organFx.rigs[k], now);
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
      // Paired organs (eyes, ears): FX panel gap between the two copies.
      if (o.pairHalf) {
        o.group.children[0].position.x = o.pairHalf * (p.g ?? 1);
        o.group.children[1].position.x = -o.pairHalf * (p.g ?? 1);
      }
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
