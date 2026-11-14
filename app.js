import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/* VITALIS demo. Every reading here is made up. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ================= SIGN IN ================= */
(function buildPrint() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const inside = (x, y) => ((x - 120) / 100) ** 2 + ((y - 140) / 128) ** 2 < 1;
  let out = '', lit = '';
  for (let i = 0; i < 19; i++) {
    const r = 5 + i * 6.3, cx = 120 + Math.sin(i * .5) * 1.5, cy = 132 + i * .55;
    const gaps = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => [rnd() * 6.28, .12 + rnd() * .4]);
    let d = '', pen = false;
    for (let t = 0; t <= 6.30; t += .035) {
      const wob = 1 + .035 * Math.sin(3 * t + i) + .02 * Math.sin(7 * t - i * 2);
      const x = cx + Math.cos(t) * r * wob, y = cy + Math.sin(t) * r * 1.22 * wob;
      const gap = gaps.some(([s, l]) => (((t - s) % 6.28) + 6.28) % 6.28 < l);
      if (!inside(x, y) || gap) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      pen = true;
    }
    const len = Math.ceil(2 * Math.PI * r * 1.25);
    out += `<path class="${i % 3 === 1 ? 'g' : 'k'}" d="${d}" style="stroke-dasharray:${len};stroke-dashoffset:0"/>`;
    lit += `<path d="${d}"/>`;
  }
  $('#ridges').innerHTML = out;
  $('#ridgesLit').innerHTML = lit;
})();

(function signIn() {
  const wrap = $('#printWrap'), rect = $('#scanRect'), line = $('#scanLine');
  let p = 0, holding = false, done = false, last = performance.now();
  const set = v => { const y = 280 * (1 - v); rect.setAttribute('y', y); rect.setAttribute('height', 280 - y); line.setAttribute('y1', y); line.setAttribute('y2', y); };
  const start = e => { if (done) return; e?.preventDefault(); holding = true; wrap.classList.add('holding'); $('#signinHint').textContent = 'Keep holding…'; };
  const stop = () => { if (done || !holding) return; holding = false; wrap.classList.remove('holding'); $('#signinHint').textContent = 'Press and hold the fingerprint'; };
  wrap.addEventListener('pointerdown', start);
  addEventListener('pointerup', stop);
  addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !done) start(e); });
  addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });

  function tick(now) {
    const dt = now - last; last = now;
    p = holding ? Math.min(1, p + dt / 1500) : Math.max(0, p - dt / 500);
    set(ease(p));
    if (p >= 1) return finish();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function finish() {
    done = true;
    wrap.classList.remove('holding');
    $('#signinText').classList.add('ok');
    $('#signinText h1').textContent = 'Match';
    $('#signinHint').textContent = 'Identity confirmed';
    $$('#ridges path').forEach((el, i) => setTimeout(() => el.style.strokeDashoffset = el.style.strokeDasharray, 250 + i * 18));
    setTimeout(() => { wrap.classList.add('done'); $('#signin').classList.add('welcome'); }, 700);
    setTimeout(() => $('#signin').classList.add('gone'), 2900);
    setTimeout(() => $('#signin').remove(), 4000);
  }
})();

/* ================= DATA ================= */
const SYS = {
  lungs: { name: 'Lungs', value: 16, unit: 'breaths a minute', usual: '14–18', l2: 'Oxygen', v2: '98%', state: 'ok',
    note: 'Breathing is steady. Right where it usually is.', week: [15, 16, 15, 17, 16, 16, 16], jitter: [15, 17] },
  heart: { name: 'Heart', value: 64, unit: 'beats a minute at rest', usual: '54–62', l2: 'Rhythm', v2: 'Regular', state: 'watch',
    note: 'Resting rate has been a little high for 3 days. Worth watching.', week: [57, 58, 57, 60, 62, 63, 64], jitter: [63, 65] },
  sleep: { name: 'Sleep & mind', value: 6.2, unit: 'hours slept', usual: '7–8 h', l2: 'Reaction test', v2: 'Normal', state: 'watch',
    note: 'Sleeping less than usual this week. Focus is still normal.', week: [7.3, 7.1, 7.0, 6.8, 6.5, 6.4, 6.2] },
  muscles: { name: 'Muscles', value: 87, unit: 'recovery out of 100', usual: '80–95', l2: 'Workout today', v2: '45 min', state: 'ok',
    note: 'Recovered well from yesterday’s workout.', week: [84, 88, 82, 90, 86, 85, 87] },
};

/* ================= 3D BODY ================= */
// x: world units from centre line (+ = screen right). v: height fraction from the feet.
const REGIONS = {
  sleep:   { x: 0,     v: .972, radius: .34, dist: 2.1 },
  lungs:   { x: -.22,  v: .76,  radius: .5,  dist: 2.8, coreX: 0 },
  heart:   { x: .09,   v: .735, radius: .24, dist: 2.3 },
  muscles: { x: -.27,  v: .45,  radius: .5,  dist: 3.9 },
};
const uni = {
  uRegionCenter: { value: new THREE.Vector3(0, 99, 0) }, uRegionRadius: { value: .3 },
  uHighlight: { value: 0 }, uGhost: { value: 0 }, uPulse: { value: 0 }, uCyan: { value: new THREE.Color('#0aa5bd') },
};
// Charcoal body. Shader adds a thin cyan ring on the hovered region and turns the body to glass when zoomed in.
const skin = new THREE.MeshStandardMaterial({ color: '#131516', roughness: .6, metalness: 0, transparent: true });
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

const host = $('#stage3d');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .01, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f31, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(3, 3, -5); scene.add(rim);

const pivot = new THREE.Group(); scene.add(pivot);
const HOME = { pos: new THREE.Vector3(0, 0, 11), look: new THREE.Vector3() };
const cam = { pos: HOME.pos.clone(), look: HOME.look.clone() };
let body = null, rot = 0, rotTarget = 0, fly = null, hover = null, ghostTarget = 0;

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
  body = obj;
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
$$('.spot').forEach(s => {
  if (SYS[s.dataset.sys].state === 'watch') s.classList.add('watch');
  if (['lungs', 'muscles'].includes(s.dataset.sys)) s.classList.add('l');
  s.addEventListener('pointerenter', () => hover = s.dataset.sys);
  s.addEventListener('pointerleave', () => hover = null);
});
const pt = (k, which = 'surface') => body.localToWorld(REGIONS[k][which].clone());

function resize() {
  const { width: w, height: h } = host.getBoundingClientRect();
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

// Drag to turn the body
let drag = null;
host.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: rotTarget }; host.setPointerCapture(e.pointerId); });
host.addEventListener('pointermove', e => { if (drag) rotTarget = drag.r + (e.clientX - drag.x) * .01; });
host.addEventListener('pointerup', () => drag = null);
host.addEventListener('dblclick', () => rotTarget = 0);

function flyTo(t, dur = 1500) { fly = { t0: performance.now(), dur, fromPos: cam.pos.clone(), fromLook: cam.look.clone(), ...t }; }

const v = new THREE.Vector3();
function render3d(now, pulse) {
  rot += (rotTarget - rot) * .08;
  pivot.rotation.y = rot;
  if (fly) {
    const k = ease(Math.min(1, (now - fly.t0) / fly.dur));
    cam.pos.lerpVectors(fly.fromPos, fly.pos, k);
    cam.look.lerpVectors(fly.fromLook, fly.look, k);
    if (k >= 1) { fly.done?.(); fly = null; }
  }
  const focus = current || hover;
  uni.uHighlight.value += ((focus ? 1 : 0) - uni.uHighlight.value) * .1;
  uni.uGhost.value += (ghostTarget - uni.uGhost.value) * .05;
  uni.uPulse.value = pulse;
  skin.depthWrite = uni.uGhost.value < .05;
  if (body && focus) { uni.uRegionCenter.value.copy(pt(focus)); uni.uRegionRadius.value = REGIONS[focus].radius; }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  renderer.render(scene, camera);
  if (body) {
    pivot.updateMatrixWorld();
    const { width: w, height: h } = host.getBoundingClientRect();
    const show = Math.cos(rot) > .5;
    $$('.spot').forEach(s => {
      v.copy(pt(s.dataset.sys)).project(camera);
      s.style.transform = `translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
      s.style.opacity = show ? '' : 0;
      s.style.pointerEvents = show ? '' : 'none';
    });
  }
}

/* ================= NAVIGATION ================= */
let view = 'body';
function show(name) {
  if (view === 'detail' && name !== 'detail') leaveDetail(name !== 'body');
  view = name;
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === (name === 'detail' ? 'body' : name)));
  host.classList.toggle('away', name === 'crew' || name === 'ask');
  host.classList.toggle('locked', name === 'detail');
  if (name === 'ask' && !$('#thread').children.length) ask('Why was crew 03 flagged?', true);
}
$$('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

/* ================= DETAIL ================= */
let current = null, pastDay = null;

function openSystem(k) {
  const d = SYS[k]; current = k; pastDay = null; hover = null;
  rotTarget = 0; rot = 0;
  $('#spots').classList.add('hide');
  if (body) {
    pivot.updateMatrixWorld();
    const p = pt(k, 'core');
    flyTo({ pos: new THREE.Vector3(p.x, p.y, p.z + REGIONS[k].dist + .6), look: p });
  }
  ghostTarget = 1;
  $('#dName').textContent = d.name;
  $('#dValue').textContent = d.value;
  $('#dUnit').textContent = d.unit;
  $('#dUsual').textContent = d.usual;
  $('#d2Label').textContent = d.l2;
  $('#d2Value').textContent = d.v2;
  const note = $('#dNote'); note.textContent = d.note; note.classList.toggle('watch', d.state === 'watch');
  $('.big').classList.remove('past');
  $('#organ').innerHTML = ORGANS[k];
  $('#organ svg').classList.add('organ-in');
  buildWeek(d);
  wave.length = 0;
  setTimeout(() => show('detail'), 350);
}
function leaveDetail(instant) {
  current = null; ghostTarget = 0;
  if (instant) { fly = null; cam.pos.copy(HOME.pos); cam.look.copy(HOME.look); uni.uGhost.value = 0; $('#spots').classList.remove('hide'); return; }
  flyTo({ pos: HOME.pos.clone(), look: HOME.look.clone(), done: () => body && $('#spots').classList.remove('hide') }, 1200);
}
$$('[data-sys]').forEach(b => b.addEventListener('click', () => openSystem(b.dataset.sys)));
$('#back').addEventListener('click', () => show('body'));
addEventListener('keydown', e => { if (e.key === 'Escape' && view === 'detail') show('body'); });

function buildWeek(d) {
  const lo = Math.min(...d.week), hi = Math.max(...d.week);
  $('#week').innerHTML = d.week.map((x, i) =>
    `<button class="${i === 6 ? 'today on' : ''}" data-i="${i}"><i style="height:${14 + ((x - lo) / (hi - lo || 1)) * 40}px"></i><span>${i === 6 ? 'TODAY' : 'DAY ' + (178 + i)}</span></button>`).join('');
  $$('#week button').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    $$('#week button').forEach(x => x.classList.toggle('on', x === b));
    pastDay = i === 6 ? null : i;
    $('#dValue').textContent = d.week[i];
    $('.big').classList.toggle('past', pastDay !== null);
    $('#dUnit').textContent = d.unit + (pastDay !== null ? ` · day ${178 + i}` : '');
  }));
}

// Drag to turn the organ drawing
(function organDrag() {
  const el = $('#organ'); let start = null, rx = 0, ry = 0, tx = 0, ty = 0;
  el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, tx, ty }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (!start) return; ty = Math.max(-50, Math.min(50, start.ty + (e.clientX - start.x) * .3)); tx = Math.max(-20, Math.min(20, start.tx - (e.clientY - start.y) * .2)); });
  el.addEventListener('pointerup', () => { start = null; tx = 0; ty = 0; });
  (function loop() { rx += (tx - rx) * .1; ry += (ty - ry) * .1; const s = el.querySelector('svg'); if (s) s.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; requestAnimationFrame(loop); })();
})();

/* ---------- organ drawings ---------- */
const label = (x, y, x2, y2, text, anchor = 'start') =>
  `<line class="tick" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/><circle class="node" cx="${x2}" cy="${y2}" r="1.8"/><text x="${x}" y="${y - 5}" text-anchor="${anchor}">${text}</text>`;
const bronchi = 'M200 150 C190 165 175 175 160 190 M160 190 C150 210 140 232 128 262 M160 190 C148 196 134 204 118 220 M168 184 C166 230 160 270 150 304 M150 304 C142 312 136 318 126 322 M128 262 C120 270 114 280 110 292';
const ORGANS = {
  lungs: `<svg viewBox="0 0 400 400">
    <path class="thin" d="M194 40 V146 M206 40 V146"/>
    <path class="flow" d="M200 40 V150"/>
    <g id="anim" style="transform-origin:200px 150px">
      <path class="shape" d="M186 118 C150 112 112 160 100 220 C88 285 98 330 128 338 C160 346 184 326 188 296 C192 250 192 160 186 118 Z"/>
      <path class="shape" d="M214 118 C250 112 288 160 300 220 C312 285 302 330 272 338 C240 346 216 326 212 296 C208 250 208 160 214 118 Z"/>
      <path class="thin" d="M110 250 C140 240 165 215 186 190 M290 235 C262 228 236 210 214 190 M298 272 C270 268 240 260 214 250"/>
      <path class="flow" d="${bronchi}"/>
      <g transform="translate(400 0) scale(-1 1)"><path class="flow" d="${bronchi}"/></g>
    </g>
    ${label(10, 190, 112, 205, 'Right lung')}
    ${label(390, 190, 288, 205, 'Left lung', 'end')}
    ${label(240, 52, 206, 70, 'Windpipe')}
  </svg>`,
  heart: `<svg viewBox="0 0 400 400">
    <path class="thin" style="opacity:1;stroke-width:1.3" d="M212 130 C212 76 270 72 274 118 L274 150 M168 140 V66 M232 104 V64 M250 88 V56 M190 128 C186 92 160 82 136 86"/>
    <g id="anim" style="transform-origin:200px 220px">
      <path class="shape" d="M200 130 C175 98 112 104 108 168 C104 232 170 282 205 330 C236 284 300 236 296 170 C292 108 228 100 200 130 Z"/>
      <path class="thin" d="M200 132 C194 190 204 250 205 328 M140 150 C162 172 176 202 180 244 M262 140 C246 170 232 200 224 236"/>
    </g>
    <path class="flow" d="M168 66 V150 C150 200 170 250 200 300"/>
    <path class="flow" d="M205 300 C236 250 252 200 238 150 C226 116 212 104 212 84 C214 66 268 66 274 104 V150"/>
    <path class="flow" d="M190 128 C186 92 160 82 136 86"/>
    ${label(10, 90, 166, 96, 'Into heart')}
    ${label(390, 70, 272, 92, 'Out to body', 'end')}
    ${label(390, 300, 236, 262, 'Main pump', 'end')}
  </svg>`,
  sleep: `<svg viewBox="0 0 400 400">
    <g id="anim" style="transform-origin:200px 190px">
      <path class="shape" d="M120 230 C88 200 95 140 140 114 C172 90 232 86 272 106 C312 126 326 172 312 212 C305 240 282 254 250 258 L242 292 C238 302 224 302 222 292 L216 262 C190 266 150 262 120 230 Z"/>
      <path class="shape" d="M252 258 C272 262 292 254 302 236 C296 266 272 280 250 272 Z"/>
      <path class="thin" d="M140 140 C160 150 170 130 190 140 S220 120 240 132 M130 180 C150 170 165 190 185 176 S220 170 235 186 S270 176 290 190 M150 220 C170 210 190 226 210 214 S250 222 270 214 M200 100 C196 130 210 150 205 175"/>
    </g>
    <g id="net"></g>
    ${label(10, 130, 132, 150, 'Focus')}
    ${label(390, 150, 292, 170, 'Sleep cycle', 'end')}
    ${label(390, 290, 272, 268, 'Balance', 'end')}
  </svg>`,
  muscles: `<svg viewBox="0 0 400 400">
    <g id="anim" style="transform-origin:200px 200px">
      <path class="thin" style="opacity:1" d="M148 50 C136 140 142 240 166 340 L174 372 M254 50 C266 140 260 240 236 340 L228 372"/>
      <path class="shape" d="M200 64 C184 140 184 240 200 322 C216 240 216 140 200 64 Z"/>
      <path class="shape" d="M162 84 C150 160 156 254 186 322 C180 240 180 150 192 74 Z"/>
      <path class="shape" d="M240 118 C252 200 242 282 212 326 C224 262 226 190 230 118 Z"/>
      <path class="thin" d="M200 90 V300 M193 110 C190 170 190 240 197 300 M207 110 C210 170 210 240 203 300 M170 110 C164 170 168 240 182 300 M234 150 C236 210 230 270 218 310"/>
      <path class="flow" d="M200 80 V310 M175 100 C166 170 170 250 184 312 M236 140 C240 210 232 280 214 318"/>
    </g>
    ${label(10, 120, 168, 140, 'Outer thigh')}
    ${label(390, 100, 202, 120, 'Front thigh', 'end')}
    ${label(390, 230, 236, 240, 'Inner thigh', 'end')}
  </svg>`,
};

/* ---------- live motion: organ + wave ---------- */
const wave = [];
let lastSample = 0;
function sample(k, t) {
  if (k === 'lungs') return Math.sin(t * 2 * Math.PI * SYS.lungs.value / 60);
  if (k === 'heart') {
    const x = (t * SYS.heart.value / 60) % 1;
    const g = (c, w, a) => a * Math.exp(-(((x - c) / w) ** 2));
    return g(.1, .03, .15) + g(.19, .008, -.2) + g(.21, .012, 1) + g(.235, .01, -.3) + g(.45, .05, .25) - .1;
  }
  if (k === 'sleep') return .6 * Math.sin(t * 1.9) + .25 * Math.sin(t * 6.3) + .15 * Math.sin(t * 13);
  return .5 * Math.sin(t * .9) + .3 * Math.sin(t * 2.7 + 1) + .1 * Math.sin(t * 9);
}
function animateOrgan(k, t) {
  const g = $('#anim'); if (!g) return 0;
  if (k === 'lungs') { const s = Math.sin(t * 2 * Math.PI * SYS.lungs.value / 60); g.style.transform = `scale(${1 + .045 * s}, ${1 + .03 * s})`; return (s + 1) / 2; }
  if (k === 'heart') { const c = Math.exp(-((((t * SYS.heart.value / 60) % 1 - .23) / .07) ** 2)); g.style.transform = `scale(${1 - .045 * c})`; return c; }
  if (k === 'sleep') {
    const net = $('#net');
    if (net && !net.children.length) {
      const P = [[150, 150], [190, 125], [240, 130], [280, 160], [170, 195], [225, 175], [265, 210], [205, 230], [140, 210]];
      const L = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [5, 6], [3, 6], [4, 7], [5, 7], [4, 8], [6, 7]];
      net.innerHTML = L.map(([a, b]) => `<line class="flow" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`).join('') +
        P.map(([x, y]) => `<circle class="node" cx="${x}" cy="${y}" r="2.6"/>`).join('');
    }
    $$('#net circle').forEach((c, i) => c.style.opacity = .3 + .7 * Math.max(0, Math.sin(t * 1.3 + i * 1.7)));
  }
  return (Math.sin(t * 1.2) + 1) / 2;
}
function drawWave(k, now) {
  if (now - lastSample > 50) { wave.push(sample(k, now / 1000)); if (wave.length > 120) wave.shift(); lastSample = now; }
  const n = wave.length; if (n < 2) return;
  $('#wavePath').setAttribute('d', wave.map((y, i) => `${i ? 'L' : 'M'}${(200 * (i + 120 - n) / 119).toFixed(1)} ${(25 - y * 18).toFixed(1)}`).join(''));
}
setInterval(() => {
  if (!current || pastDay !== null || !SYS[current].jitter) return;
  const [a, b] = SYS[current].jitter;
  $('#dValue').textContent = a + Math.floor(Math.random() * (b - a + 1));
}, 3500);

/* ================= CREW ================= */
const CREW = [
  { n: 'Reyes', id: '03', role: 'Commander', watch: true, note: 'Alex Reyes: resting heart rate up, sleep down. Worth watching.' },
  { n: 'Kim', id: '01', role: 'Engineer', note: 'Maya Kim: everything in her normal range.' },
  { n: 'Laurent', id: '02', role: 'Scientist', note: 'Sofia Laurent: everything in her normal range.' },
  { n: 'Okafor', id: '04', role: 'Doctor', note: 'Jonah Okafor: everything in his normal range.' },
  { n: 'Nakamura', id: '05', role: 'Pilot', watch: true, note: 'Theo Nakamura: sore lower back after exercise. Resting today.' },
  { n: 'Alvarez', id: '06', role: 'Geologist', note: 'Elena Alvarez: everything in her normal range.' },
];
const FIGURE = '<path d="M26 2a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M14 23h24c5 0 8 4 8 9v23h-6v35h-9V58h-2v32h-9V55H6V32c0-5 3-9 8-9Z"/>';
$('#people').innerHTML = CREW.map((c, i) =>
  `<button class="person" data-i="${i}"><svg viewBox="0 0 52 92" style="height:${86 + (i % 3) * 4}px">${FIGURE}</svg><b><i class="dot ${c.watch ? 'amber' : ''}"></i>${c.n}</b><small>${c.role} · ${c.id}</small></button>`).join('');
$$('.person').forEach(p => p.addEventListener('click', () => {
  $$('.person').forEach(x => x.classList.toggle('on', x === p));
  $('#personNote').textContent = CREW[+p.dataset.i].note;
}));
const STOP_POS = [0, 50, 76, 100];
$$('#stops button').forEach((b, i) => b.addEventListener('click', () => {
  $$('#stops button').forEach(x => x.classList.toggle('on', x === b));
  $('.ship').style.left = STOP_POS[i] + '%';
  $('.track .done').style.width = STOP_POS[i] + '%';
  $('#tripNote').textContent = b.dataset.note;
}));

/* ================= ASK ================= */
function chart({ title, value, unit, chg, data, usual, min, max, forecast = [] }) {
  const n = data.length + forecast.length, W = 300, H = 70;
  const X = i => (i / (n - 1)) * W, Y = y => H - ((y - min) / (max - min)) * H;
  const line = data.map((y, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(y)}`).join('');
  const fc = forecast.length ? `M${X(data.length - 1)} ${Y(data.at(-1))}` + forecast.map((y, i) => `L${X(data.length + i)} ${Y(y)}`).join('') : '';
  return `<div class="chart"><h3>${title}</h3><b>${value}<small>${unit}</small></b>${chg ? `<span class="chg">${chg}</span>` : ''}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect class="band" x="0" width="${W}" y="${Y(usual[1])}" height="${Y(usual[0]) - Y(usual[1])}"/><path class="ln" d="${line}"/>${fc ? `<path class="fc" d="${fc}"/>` : ''}</svg>
    <div class="axis"><span>3 days ago</span><span>${forecast.length ? 'Now → +3 days' : 'Now'}</span></div><p class="usual">Shaded = usual for Reyes</p></div>`;
}
const hr = [58, 57, 59, 60, 59, 61, 62, 61, 63, 62, 64, 64];
const sl = [7.2, 7.0, 7.1, 6.9, 6.8, 6.6, 6.7, 6.5, 6.4, 6.4, 6.3, 6.2];
const ANSWERS = [
  { re: /flag|why|03|reyes/i,
    a: `Two things changed over the last 3 days:<ul><li>Resting heart rate went up, from about 58 to 64.</li><li>Sleep went down, from about 7 hours to 6.2.</li></ul>Neither is alarming on its own. Together they’re worth a check-in with the crew doctor.`,
    src: 'NASA-STD-3001 Vol. 1 (crew health) · NASA Human Research Program, sleep loss risk',
    proof: () => chart({ title: 'Resting heart rate', value: 64, unit: 'bpm', chg: '+6', data: hr, usual: [54, 62], min: 52, max: 68 }) +
      chart({ title: 'Sleep', value: 6.2, unit: 'hours', chg: '−0.9', data: sl, usual: [7, 8], min: 5.8, max: 8.2 }) +
      `<div class="verdict"><h3>Suggestion</h3><b>Watch · not urgent</b></div>` },
  { re: /next|happen|forecast|future|will/i,
    a: `If nothing changes, resting heart rate could reach about 66 in 3 days.<br><br>Better sleep usually brings it back down within a few days. This is an estimate, not a diagnosis.`,
    src: 'Reyes’ own 30-day history (demo data)',
    proof: () => chart({ title: 'Resting heart rate · next 3 days', value: '~66', unit: 'bpm', data: hr, forecast: [65, 65, 66, 66], usual: [54, 62], min: 52, max: 68 }) +
      `<div class="verdict"><h3>Confidence</h3><b>Medium</b></div>` },
  { re: /report|summary|crew/i,
    a: `<b>Crew report · Day 184</b><ul><li>4 of 6 crew are in their normal range.</li><li>Reyes (03): heart rate up, sleep down.</li><li>Nakamura (05): sore lower back, resting.</li><li>Radiation is 74% of the trip limit, on schedule.</li><li>Cabin air and temperature are normal.</li></ul>`,
    src: 'All crew sensors · last 24 hours (demo data)',
    proof: () => `<div class="verdict"><h3>Crew</h3><b>4 OK · 2 watch</b></div><div class="verdict"><h3>Radiation</h3><b>148 / 200 mSv</b></div><div class="verdict"><h3>Ship</h3><b>All OK</b></div>` },
];
function ask(q, instant) {
  q = q.trim(); if (!q) return;
  const th = $('#thread');
  const qEl = document.createElement('div'); qEl.className = 'q'; qEl.textContent = q; th.append(qEl);
  const hit = ANSWERS.find(x => x.re.test(q));
  const a = document.createElement('div'); a.className = 'a'; a.innerHTML = `<span class="who-tag">Vitalis</span><span class="thinking"></span>`; th.append(a);
  th.scrollTop = th.scrollHeight;
  setTimeout(() => {
    a.innerHTML = `<span class="who-tag">Vitalis</span>` + (hit ? hit.a + `<p class="src"><b>Sources</b>${hit.src}</p>` : `I can only answer questions about this demo crew’s health. Try one of the questions below.`);
    if (hit) $('#proof').innerHTML = `<h3>What I looked at</h3>` + hit.proof();
    th.scrollTop = th.scrollHeight;
  }, instant ? 0 : 900);
}
$('#askForm').addEventListener('submit', e => { e.preventDefault(); ask($('#askInput').value); $('#askInput').value = ''; });
$$('.chips button').forEach(b => b.addEventListener('click', () => ask(b.textContent)));

/* ================= MAIN LOOP ================= */
(function loop(now) {
  let pulse = 0;
  if (view === 'detail' && current) { pulse = animateOrgan(current, now / 1000); drawWave(current, now); }
  render3d(now, pulse);
  requestAnimationFrame(loop);
})(performance.now());
