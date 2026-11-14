import { $, $$, ease } from './util.js';

/* Fingerprint sign-in screen. */

function buildPrint() {
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
}

function signIn() {
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
}

export function initSignin() {
  buildPrint();
  signIn();
}
