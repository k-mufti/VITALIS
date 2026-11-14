import { $, $$, ease } from './util.js';

/* Fingerprint sign-in screen.
   The print is a real ridge drawing (assets/fingerprints, from the EPS set). It traces in on load,
   fills black from the core outward while you hold, then a cyan wave runs out on a match.
   Compare other prints and animations in tools/fingerprint-lab.html. */

const PRINT = 'assets/fingerprints/print-21.svg';
let ridges = [];

// Load the chosen print, fit it into the 240 x 280 sign-in box and tag each ridge with its distance from the core (0..1).
async function buildPrint() {
  const res = await fetch(PRINT);
  if (!res.ok) throw new Error('Print not found');
  const src = new DOMParser().parseFromString(await res.text(), 'image/svg+xml').documentElement;
  const [x, y, w, h] = src.getAttribute('viewBox').trim().split(/\s+/).map(Number);
  const s = Math.min(220 / w, 264 / h);
  const g = $('#ridges');
  g.setAttribute('transform', `translate(${120 - (x + w / 2) * s} ${140 - (y + h / 2) * s}) scale(${s})`);
  g.innerHTML = src.innerHTML;
  ridges = [...g.querySelectorAll('path')];
  const cx = x + w / 2, cy = y + h * .45; // the whorl's core sits a little above the middle
  ridges.forEach(p => {
    const b = p.getBBox();
    const d = Math.min(1, Math.hypot((b.x + b.width / 2 - cx) / w, (b.y + b.height / 2 - cy) / h) * 1.6);
    p.dataset.d = d;
    p.setAttribute('pathLength', 1);
    p.style.setProperty('--delay', (d * .9).toFixed(2) + 's');
  });
  // Trace in, then switch to quick fill changes for the hold.
  requestAnimationFrame(() => $('#print').classList.add('ready'));
  setTimeout(() => $('#print').classList.add('settled'), 2800);
}

// Fallback if the print file cannot load: the older drawn concentric print.
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
    out += `<path class="drawn" d="${d}" data-d="${(i / 18).toFixed(2)}"/>`;
  }
  $('#ridges').innerHTML = out;
  ridges = $$('#ridges path');
  $('#print').classList.add('ready', 'settled');
}

function signIn() {
  const wrap = $('#printWrap'), line = $('#scanLine');
  let p = 0, holding = false, done = false, last = performance.now();
  // Scan line sweeps up and down over the print while holding.
  const sweep = now => { const y = 20 + 240 * (.5 + .5 * Math.sin(now / 170)); line.setAttribute('y1', y); line.setAttribute('y2', y); };
  const start = e => { if (done) return; e?.preventDefault(); holding = true; wrap.classList.add('holding'); $('#signinHint').textContent = 'Keep holding…'; };
  const stop = () => { if (done || !holding) return; holding = false; wrap.classList.remove('holding'); $('#signinHint').textContent = 'Press and hold the fingerprint'; };
  wrap.addEventListener('pointerdown', start);
  addEventListener('pointerup', stop);
  addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !done) start(e); });
  addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });

  function tick(now) {
    const dt = now - last; last = now;
    p = holding ? Math.min(1, p + dt / 1500) : Math.max(0, p - dt / 500);
    if (holding) sweep(now);
    // Ridges read from the core outward as the hold goes on.
    const reach = ease(p) * 1.05;
    ridges.forEach(r => r.classList.toggle('on', +r.dataset.d < reach));
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
    // Cyan wave from the core outward.
    ridges.forEach(r => {
      r.classList.add('on');
      setTimeout(() => r.classList.add('lit'), 80 + r.dataset.d * 420);
      setTimeout(() => r.classList.remove('lit'), 460 + r.dataset.d * 420);
    });
    setTimeout(() => { wrap.classList.add('done'); $('#signin').classList.add('welcome'); }, 1100);
    setTimeout(() => $('#signin').classList.add('gone'), 3300);
    setTimeout(() => $('#signin').remove(), 4400);
  }
}

export function initSignin() {
  buildPrint().catch(buildDrawnPrint);
  signIn();
}
