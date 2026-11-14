import * as THREE from 'three';
import { $, $$ } from '../util.js';
import { twin } from './scene.js';
import { organs, has3dOrgan, animate3dOrgan } from './organs.js';
import { ORGAN_HALFTONE_DEFS } from './effects.js';

/* Organ drawings shown in the Detail view, their live motion, and drag-to-turn. */

const label = (x, y, x2, y2, text, anchor = 'start') =>
  `<line class="tick" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/><circle class="node" cx="${x2}" cy="${y2}" r="1.8"/><text x="${x}" y="${y - 5}" text-anchor="${anchor}">${text}</text>`;
const bronchi = 'M200 150 C190 165 175 175 160 190 M160 190 C150 210 140 232 128 262 M160 190 C148 196 134 204 118 220 M168 184 C166 230 160 270 150 304 M150 304 C142 312 136 318 126 322 M128 262 C120 270 114 280 110 292';

export const DRAWINGS = {
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

// What the Detail view puts in #organ. Systems with a 3D model get an empty drawing
// (the model shows in the 3D stage behind it); the rest keep their SVG drawing.
const EMPTY = '<svg viewBox="0 0 400 400"></svg>';
const LOADING = '<svg viewBox="0 0 400 400"><text x="200" y="204" text-anchor="middle">Loading 3D model</text></svg>';
export const ORGANS = {};
[...Object.keys(DRAWINGS), 'eyes'].forEach(k => Object.defineProperty(ORGANS, k, {
  enumerable: true,
  get() {
    if (!has3dOrgan(k)) return DRAWINGS[k] || '';
    if (organs[k]?.group) return EMPTY;
    return LOADING;
  },
}));

// Move the open organ (3D model or drawing). value = the system's live reading (breaths or beats a minute).
// Returns a 0..1 pulse used to light up the 3D body in sync.
export function animateOrgan(k, t, value) {
  const pulse3d = animate3dOrgan(k, t, value);
  if (pulse3d !== null) return pulse3d;
  const g = $('#anim'); if (!g) return 0;
  if (k === 'lungs') { const s = Math.sin(t * 2 * Math.PI * value / 60); g.style.transform = `scale(${1 + .045 * s}, ${1 + .03 * s})`; return (s + 1) / 2; }
  if (k === 'heart') { const c = Math.exp(-((((t * value / 60) % 1 - .23) / .07) ** 2)); g.style.transform = `scale(${1 - .045 * c})`; return c; }
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

// Drag to turn the organ: orbits the camera around a 3D organ, or tilts the drawing.
// Scroll zooms a 3D organ, double-click resets it.
const showing3d = () => !!(twin.focus && organs[twin.focus]?.group);
export function initOrganDrag() {
  const el = $('#organ'); let start = null, rx = 0, ry = 0, tx = 0, ty = 0;
  const orbit = twin.orbit;
  el.addEventListener('pointerdown', e => {
    start = { x: e.clientX, y: e.clientY, tx, ty, yaw: orbit.yawT, pitch: orbit.pitchT };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    if (showing3d()) {
      orbit.yawT = start.yaw - (e.clientX - start.x) * .008;
      orbit.pitchT = THREE.MathUtils.clamp(start.pitch + (e.clientY - start.y) * .005, -.7, .7);
      return;
    }
    ty = Math.max(-50, Math.min(50, start.ty + (e.clientX - start.x) * .3));
    tx = Math.max(-20, Math.min(20, start.tx - (e.clientY - start.y) * .2));
  });
  el.addEventListener('pointerup', () => { start = null; tx = 0; ty = 0; });
  el.addEventListener('wheel', e => {
    if (!showing3d() || !orbit.on) return;
    e.preventDefault();
    orbit.distT = THREE.MathUtils.clamp(orbit.distT * Math.exp(e.deltaY * .0012), orbit.base * .45, orbit.base * 1.8);
  }, { passive: false });
  el.addEventListener('dblclick', () => { orbit.yawT = 0; orbit.pitchT = 0; orbit.distT = orbit.base; });
  (function loop() { rx += (tx - rx) * .1; ry += (ty - ry) * .1; const s = el.querySelector('svg'); if (s) s.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; requestAnimationFrame(loop); })();
}

// Halftone fill for the organ shapes (pattern from effects.js). Applied to the drawings;
// ORGANS hands these out for systems without a 3D model.
for (const k of Object.keys(DRAWINGS)) {
  DRAWINGS[k] = DRAWINGS[k]
    .replace('<svg viewBox="0 0 400 400">', '<svg viewBox="0 0 400 400">' + ORGAN_HALFTONE_DEFS)
    .replaceAll('class="shape"', 'class="shape" style="fill:url(#ht)"');
}
