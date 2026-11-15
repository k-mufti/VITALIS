import { $, $$ } from './util.js';
import { LOOK, applyLook, initSigninDev } from './signin-look.js';

/* Fingerprint sign-in screen: a holographic print.
   Layers inside #print (tilted in 3D with the print):
     orbit rings, a cyan depth copy (colour split), the print, a foil glint,
     drifting hologram scanlines, glitch slices, and the scan line with glow + trail.
   Layers that stay flat: a HUD (brackets, crosshairs, ruler, live readouts, particles,
   match shockwave) and a halftone dot field behind everything.
   Holding presses the print flat; a scan line rises and each ridge flashes cyan, then turns black.
   Compare other prints and animations in tools/fingerprint-lab.html. */

const PRINT_NO = String(Math.round(LOOK.print)).padStart(2, '0');
const PRINT = `assets/fingerprints/print-${PRINT_NO}.svg`;
const NS = 'http://www.w3.org/2000/svg';
let ridges = [];
const box = { top: 10, bottom: 270, rx: 110, ry: 130 }; // print area in the 240 x 280 sign-in space
const own = { x: 0, y: 0, w: 1, h: 1 };                  // the print file's own box (for the glint)
const layer = {};
const hud = {};

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (parent) parent.append(n);
  return n;
};

// Load the chosen print, fit it into the 240 x 280 box, and build the hologram layers.
async function buildPrint() {
  const res = await fetch(PRINT);
  if (!res.ok) throw new Error('Print not found');
  const src = new DOMParser().parseFromString(await res.text(), 'image/svg+xml').documentElement;
  const [x, y, w, h] = src.getAttribute('viewBox').trim().split(/\s+/).map(Number);
  Object.assign(own, { x, y, w, h });
  const s = Math.min(220 / w, 264 / h);
  const fit = `translate(${120 - (x + w / 2) * s} ${140 - (y + h / 2) * s}) scale(${s})`;
  Object.assign(box, { top: 140 - (h * s) / 2, bottom: 140 + (h * s) / 2, rx: (w * s) / 2, ry: (h * s) / 2 });

  const svg = $('#print'), base = $('#ridges');
  svg.querySelector('defs').insertAdjacentHTML('beforeend', `
    <linearGradient id="holoGlint" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7fe9ff" stop-opacity="0"/>
      <stop offset=".34" stop-color="#7fe9ff" stop-opacity="0"/>
      <stop offset=".43" stop-color="#0a1f6b" stop-opacity=".7"/>
      <stop offset=".47" stop-color="#0aa5bd" stop-opacity=".95"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".54" stop-color="#7fe9ff" stop-opacity=".9"/>
      <stop offset=".66" stop-color="#7fe9ff" stop-opacity="0"/>
      <stop offset="1" stop-color="#7fe9ff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="printShape"><ellipse cx="120" cy="140" rx="${box.rx + 2}" ry="${box.ry + 2}"/></clipPath>
    <clipPath id="glitchClip"><rect/><rect/><rect/></clipPath>
    <pattern id="holoLinePattern" width="4" height="3.2" patternUnits="userSpaceOnUse"><rect width="4" height="1.1" fill="#ffffff"/></pattern>
    <linearGradient id="scanTrail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0aa5bd" stop-opacity=".45"/>
      <stop offset="1" stop-color="#0aa5bd" stop-opacity="0"/>
    </linearGradient>`);

  // Back to front.
  const rings = el('g');
  el('ellipse', { id: 'holoRing2', class: 'holo-ring', cx: 120, cy: 140, rx: box.rx + 34, ry: box.ry + 30 }, rings);
  el('ellipse', { id: 'holoRing', class: 'holo-ring', cx: 120, cy: 140, rx: box.rx + 18, ry: box.ry + 16 }, rings);
  el('ellipse', { id: 'holoArc', class: 'holo-ring', cx: 120, cy: 140, rx: box.rx + 26, ry: box.ry + 23 }, rings);
  layer.backNear = el('g', { id: 'ridgesNear' });
  const nearInner = el('g', { transform: fit }, layer.backNear);
  layer.glint = el('g', { id: 'ridgesGlint', transform: fit });
  layer.lines = el('rect', { id: 'holoLines', x: 0, y: 0, width: 240, height: 280, 'clip-path': 'url(#printShape)' });
  layer.glitch = el('g', { id: 'ridgesGlitch', 'clip-path': 'url(#glitchClip)' });
  const glitchInner = el('g', { transform: fit }, layer.glitch);
  layer.trail = el('rect', { id: 'scanTrailRect', x: 0, width: 240, y: box.bottom, height: 0, 'clip-path': 'url(#printShape)' });
  layer.glow = el('line', { id: 'scanGlow', x1: -40, x2: 280, y1: box.bottom, y2: box.bottom });

  [rings, layer.backNear].forEach(n => svg.insertBefore(n, base));
  base.after(layer.glint, layer.lines, layer.glitch);
  $('#scanLine').before(layer.trail, layer.glow);
  $('#scanLine').setAttribute('x1', -40);
  $('#scanLine').setAttribute('x2', 280);

  base.setAttribute('transform', fit);
  base.innerHTML = src.innerHTML;
  nearInner.innerHTML = layer.glint.innerHTML = glitchInner.innerHTML = src.innerHTML;
  layer.glitchRects = [...svg.querySelectorAll('#glitchClip rect')];
  ridges = [...base.querySelectorAll('path')];
  const cx = x + w / 2, cy = y + h * .55;
  ridges.forEach(p => {
    const b = p.getBBox();
    const d = Math.min(1, Math.hypot((b.x + b.width / 2 - cx) / w, (b.y + b.height / 2 - cy) / h) * 1.6);
    p.dataset.d = d;
    p.dataset.y = 1 - (b.y + b.height / 2 - y) / h; // 0 = bottom, 1 = top
    p.setAttribute('pathLength', 1);
    p.style.setProperty('--delay', (d * .9).toFixed(2) + 's');
  });
  buildHud();
  // Everything starts fully formed: no trace-in, no fade.
  svg.classList.add('ready', 'settled');
  $('#signin').classList.add('hud-on');
}

// Flat HUD around the print, in the same units as the print (print box = 0..240 x 0..280).
function buildHud() {
  const field = document.createElement('div');
  field.className = 'holo-field';
  $('#signin').prepend(field);
  hud.field = field;

  const svg = el('svg', { class: 'holo-hud', viewBox: '-120 -70 480 420', 'aria-hidden': 'true' });
  $('#printWrap').append(svg);
  // Crosshairs with gaps around the print (none below, where the heading sits).
  [[-120, 140, -14, 140], [254, 140, 360, 140], [120, -70, 120, -20]]
    .forEach(([x1, y1, x2, y2]) => el('line', { class: 'hair', x1, y1, x2, y2 }, svg));
  // Corner brackets.
  const B = 16, L = -8, T = -8, R = 248, D = 288;
  [['tl', `M${L} ${T + B}V${T}H${L + B}`], ['tr', `M${R - B} ${T}H${R}V${T + B}`],
   ['bl', `M${L} ${D - B}V${D}H${L + B}`], ['br', `M${R - B} ${D}H${R}V${D - B}`]]
    .forEach(([c, d]) => el('path', { class: 'brk ' + c, d }, svg));
  // Ruler on the left, with a marker that follows the scan line.
  for (let i = 0; i <= 28; i++) {
    const yy = i * 10, long = i % 5 === 0;
    el('line', { class: 'tick rul', x1: long ? -46 : -40, x2: -34, y1: yy, y2: yy }, svg);
    if (long) el('text', { x: -50, y: yy + 2.5, 'text-anchor': 'end', class: 'rul' }, svg).textContent = String(i * 10).padStart(3, '0');
  }
  hud.marker = el('path', { class: 'marker rul', d: 'M-31 0l6 -3.5v7z' }, svg);
  // Readouts.
  const t = (x, y, cls, txt, anchor = 'start') => { const n = el('text', { x, y, class: ('read ' + cls).trim(), 'text-anchor': anchor }, svg); n.textContent = txt; return n; };
  t(-110, -48, 'ink', 'VITALIS / BIOMETRIC');
  t(-110, -38, '', `PRINT ${PRINT_NO}${PRINT_NO === '18' ? ' · TENTED ARCH' : ''}`);
  hud.state = t(350, -48, 'cy', 'STANDBY', 'end');
  hud.ridges = t(350, -38, '', 'RIDGES 000 / 000', 'end');
  hud.match = t(350, 330, 'ink', 'MATCH 00.0%', 'end');
  hud.tilt = t(350, 340, '', 'TILT X +00.0 Y +00.0', 'end');
  t(-110, 340, '', 'CREW 03 · AUTH CHANNEL 7');
  t(-110, 330, 'cy', '● LIVE');
  hud.dust = el('g', { class: 'dust' }, svg);
  el('circle', { class: 'shock', cx: 120, cy: 140, r: 20 }, svg);
  el('circle', { class: 'shock two', cx: 120, cy: 140, r: 20 }, svg);
}

// Fallback if the print file cannot load: the older drawn concentric print (no hologram layers).
function buildDrawnPrint() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const inside = (x, y) => ((x - 120) / 100) ** 2 + ((y - 140) / 128) ** 2 < 1;
  let out = '';
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
    out += `<path class="drawn" d="${d}" data-d="${(i / 18).toFixed(2)}" data-y="${(1 - (cy + r) / 280).toFixed(2)}"/>`;
  }
  $('#ridges').innerHTML = out;
  ridges = $$('#ridges path');
  $('#print').classList.add('ready', 'settled');
}

// Point the glint gradient across the print. `pos` 0..1 moves the bright band; `angle` in degrees.
function aimGlint(pos, angle) {
  const g = document.getElementById('holoGlint');
  if (!g) return;
  const a = angle * Math.PI / 180, L = Math.hypot(own.w, own.h);
  const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
  const cx = own.x + own.w / 2 + (pos - .5) * 2 * dx, cy = own.y + own.h / 2 + (pos - .5) * 2 * dy;
  g.setAttribute('x1', cx - dx); g.setAttribute('y1', cy - dy);
  g.setAttribute('x2', cx + dx); g.setAttribute('y2', cy + dy);
}

// Glitch: a few horizontal slices of the print jump sideways for a moment.
let glitchUntil = 0, nextGlitch = 3000;
function glitch(now, ms) {
  if (!layer.glitchRects) return;
  glitchUntil = now + ms;
  layer.glitch.classList.toggle('navy', Math.random() < .35);
}
function drawGlitch(now) {
  if (!layer.glitchRects) return;
  if (now > glitchUntil) {
    layer.glitchRects.forEach(r => r.setAttribute('height', 0));
    layer.glitch.removeAttribute('transform');
    return;
  }
  layer.glitchRects.forEach(r => {
    const y = box.top + Math.random() * (box.bottom - box.top);
    r.setAttribute('x', -20); r.setAttribute('width', 280);
    r.setAttribute('y', y); r.setAttribute('height', 2 + Math.random() * 14);
  });
  layer.glitch.setAttribute('transform', `translate(${((Math.random() - .5) * 26 * LOOK.glitchStrength).toFixed(1)} 0)`);
}

// Particles drifting off the print. Positions in print units.
const dust = [];
function spawn(x, y, vx, vy, life) {
  if (!hud.dust || !LOOK.particles || dust.length > 90 * Math.max(1, LOOK.particleAmount)) return;
  const c = el('circle', { r: ((.5 + Math.random() * 1.3) * LOOK.particleSize).toFixed(2) }, hud.dust);
  dust.push({ c, x, y, vx, vy, life, age: 0 });
}
function drawDust(dt) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.age += dt; d.x += d.vx * dt / 16; d.y += d.vy * dt / 16;
    const k = d.age / d.life;
    if (k >= 1) { d.c.remove(); dust.splice(i, 1); continue; }
    d.c.setAttribute('cx', d.x.toFixed(1)); d.c.setAttribute('cy', d.y.toFixed(1));
    d.c.setAttribute('opacity', (Math.sin(k * Math.PI) * .9).toFixed(2));
  }
}
const onPrint = () => {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
  return [120 + Math.cos(a) * box.rx * r, 140 + Math.sin(a) * box.ry * r];
};

const sign = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1).padStart(4, '0');

function signIn() {
  const wrap = $('#printWrap'), line = $('#scanLine'), print = $('#print'), screen = $('#signin');
  let p = 0, holding = false, done = false, last = performance.now(), frame = 0;
  let rx = 0, ry = 0, aimX = 0, aimY = 0, press = 0;
  const start = e => { if (done) return; e?.preventDefault(); holding = true; wrap.classList.add('holding'); screen.classList.add('scanning'); $('#signinHint').textContent = 'Keep holding…'; };
  const stop = () => { if (done || !holding) return; holding = false; wrap.classList.remove('holding'); screen.classList.remove('scanning'); $('#signinHint').textContent = 'Press and hold the fingerprint'; };
  wrap.addEventListener('pointerdown', start);
  addEventListener('pointerup', stop);
  addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !done) start(e); });
  addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  // The print leans toward the cursor.
  screen.addEventListener('pointermove', e => {
    const r = wrap.getBoundingClientRect();
    aimX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
    aimY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)));
  });

  function tick(now) {
    const dt = Math.min(50, now - last); last = now; frame++;
    p = holding ? Math.min(LOOK.noFinish ? .99 : 1, p + dt / LOOK.holdMs) : Math.max(0, p - dt / 500);
    press += ((holding ? 1 : 0) - press) * Math.min(1, dt / 160);

    // Tilt: drift + strong cursor lean, pressed mostly flat while holding.
    const flat = (1 - press * .7) * (LOOK.tilt ? LOOK.tiltAmount : 0);
    const lean = LOOK.follow ? 1 : 0;
    const tx = (Math.sin(now / 1900) * 9 - aimY * 20 * lean) * flat;
    const ty = (Math.cos(now / 2400) * 11 + aimX * 26 * lean) * flat;
    rx += (tx - rx) * Math.min(1, dt / 200);
    ry += (ty - ry) * Math.min(1, dt / 200);
    print.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${(1 - press * .04).toFixed(3)})`;
    if (hud.field) { hud.field.style.setProperty('--fx', (ry * 1.4).toFixed(1)); hud.field.style.setProperty('--fy', (-rx * 1.4).toFixed(1)); }

    // Colour split: a cyan copy slides out from behind the print with the tilt (svg units).
    if (layer.backNear) {
      const k = LOOK.splitAmount;
      layer.backNear.setAttribute('transform', `translate(${((-ry * .26 - .9) * k).toFixed(2)} ${((rx * .26 - .6) * k).toFixed(2)})`);
      layer.lines.setAttribute('y', ((now / 90) % 3.2).toFixed(2)); // scanlines drift down
    }
    // Foil glint sweeps every ~2.6 s (faster while scanning), angle follows the tilt.
    aimGlint(((now * LOOK.glintSpeed / (holding ? 900 : 2600)) % 1) * 1.6 - .3 + ry * .03, 62 + ry * 4 - rx * 2);

    // Glitches: now and then when idle, often while scanning.
    if (LOOK.glitch && now > nextGlitch) {
      glitch(now, holding ? 90 + Math.random() * 80 : 70 + Math.random() * 90);
      nextGlitch = now + (holding ? 250 + Math.random() * 450 : 1400 + Math.random() * 2600) / LOOK.glitchRate;
    }
    drawGlitch(now);

    // Scan line (animation A): steady rise; ridges flash cyan as it passes, then go black.
    const reach = p;
    const lineY = box.bottom - (box.bottom - box.top) * reach;
    line.setAttribute('y1', lineY); line.setAttribute('y2', lineY);
    if (layer.glow) {
      layer.glow.setAttribute('y1', lineY); layer.glow.setAttribute('y2', lineY);
      layer.trail.setAttribute('y', lineY);
      layer.trail.setAttribute('height', Math.max(0, Math.min(80, box.bottom - lineY)));
    }
    let read = 0;
    ridges.forEach(r => {
      const isRead = +r.dataset.y < reach;
      if (isRead) read++;
      if (isRead && !r.classList.contains('on')) {
        r.classList.add('hit');
        setTimeout(() => r.classList.remove('hit'), 260);
      }
      r.classList.toggle('on', isRead);
    });

    // Particles: a slow drift off the print, a stream from the scan line while holding.
    for (let n = (holding ? .9 : .18) * LOOK.particleAmount; n > 0; n--) {
      if (Math.random() >= Math.min(1, n)) continue;
      if (holding) spawn(120 + (Math.random() - .5) * box.rx * 2, lineY, (Math.random() - .5) * .8, -.4 - Math.random() * 1.2, 700 + Math.random() * 600);
      else { const [x, y] = onPrint(); spawn(x, y, (Math.random() - .5) * .2, -.15 - Math.random() * .35, 1800 + Math.random() * 1600); }
    }
    drawDust(dt);

    // HUD readouts and the ruler marker.
    if (hud.marker) {
      hud.marker.setAttribute('transform', `translate(0 ${lineY.toFixed(1)})`);
      if (frame % 3 === 0) {
        hud.ridges.textContent = `RIDGES ${String(read).padStart(3, '0')} / ${String(ridges.length).padStart(3, '0')}`;
        hud.match.textContent = `MATCH ${(p * 99.7).toFixed(1).padStart(4, '0')}%`;
        hud.tilt.textContent = `TILT X ${sign(rx)} Y ${sign(ry)}`;
        hud.state.textContent = holding ? 'SCANNING' : 'STANDBY';
      }
    }
    if (p >= 1) return finish(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function finish(t0) {
    done = true;
    wrap.classList.remove('holding');
    screen.classList.remove('scanning');
    wrap.classList.add('matched');
    $('#signinText').classList.add('ok');
    $('#signinText h1').textContent = 'Match';
    $('#signinHint').textContent = 'Identity confirmed';
    if (hud.state) { hud.state.textContent = 'IDENTITY CONFIRMED'; hud.match.textContent = 'MATCH 99.7%'; }
    // Cyan wave from the core outward, a glint pass, a glitch burst and a particle burst.
    ridges.forEach(r => {
      r.classList.add('on');
      setTimeout(() => r.classList.add('lit'), 80 + r.dataset.d * 420);
      setTimeout(() => r.classList.remove('lit'), 460 + r.dataset.d * 420);
    });
    for (let i = 0; i < 70 * LOOK.particleAmount; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4;
      spawn(120 + Math.cos(a) * 20, 140 + Math.sin(a) * 24, Math.cos(a) * v, Math.sin(a) * v, 600 + Math.random() * 700);
    }
    if (LOOK.glitch) glitch(t0, 260);
    let last2 = t0;
    (function after(now) {
      const k = Math.min(1, (now - t0) / 700);
      aimGlint(-.3 + k * 1.6, 62);
      drawGlitch(now);
      drawDust(Math.min(50, now - last2)); last2 = now;
      if (now - t0 < 1400) requestAnimationFrame(after);
    })(t0);
    setTimeout(() => {
      print.style.transform = ''; // hand over to the CSS shrink into the badge
      wrap.classList.add('done');
      screen.classList.add('welcome');
    }, 1100);
    setTimeout(() => screen.classList.add('gone'), 3300);
    setTimeout(() => screen.remove(), 4400);
  }
}

export function initSignin() {
  applyLook();
  initSigninDev();
  buildPrint().catch(buildDrawnPrint);
  signIn();
}
