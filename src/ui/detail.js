import { $, $$ } from '../util.js';
import { state } from '../state.js';
import { SYS } from '../data/mock.js';
import { focusOrgan, resetView } from '../three/api.js';
import { ORGANS, animateOrgan, initOrganDrag } from '../three/organ-drawings.js';
import { show } from '../nav.js';

/* Detail view: one body system's reading, week chart, live wave and organ drawing. */

const wave = [];
let lastSample = 0;

export function openSystem(k) {
  const d = SYS[k];
  state.current = k;
  state.pastDay = null;
  focusOrgan(k);
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

export function leaveDetail(instant) {
  state.current = null;
  resetView(instant);
}

function buildWeek(d) {
  const lo = Math.min(...d.week), hi = Math.max(...d.week);
  $('#week').innerHTML = d.week.map((x, i) =>
    `<button class="${i === 6 ? 'today on' : ''}" data-i="${i}"><i style="height:${14 + ((x - lo) / (hi - lo || 1)) * 40}px"></i><span>${i === 6 ? 'TODAY' : 'DAY ' + (178 + i)}</span></button>`).join('');
  $$('#week button').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    $$('#week button').forEach(x => x.classList.toggle('on', x === b));
    state.pastDay = i === 6 ? null : i;
    $('#dValue').textContent = d.week[i];
    $('.big').classList.toggle('past', state.pastDay !== null);
    $('#dUnit').textContent = d.unit + (state.pastDay !== null ? ` · day ${178 + i}` : '');
  }));
}

/* ---------- live wave ---------- */
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

function drawWave(k, now) {
  if (now - lastSample > 50) { wave.push(sample(k, now / 1000)); if (wave.length > 120) wave.shift(); lastSample = now; }
  const n = wave.length; if (n < 2) return;
  $('#wavePath').setAttribute('d', wave.map((y, i) => `${i ? 'L' : 'M'}${(200 * (i + 120 - n) / 119).toFixed(1)} ${(25 - y * 18).toFixed(1)}`).join(''));
}

// Called every frame from main.js. Returns the pulse for the 3D body (0 when no system is open).
export function tickDetail(now) {
  if (state.view !== 'detail' || !state.current) return 0;
  const pulse = animateOrgan(state.current, now / 1000, SYS[state.current].value);
  drawWave(state.current, now);
  return pulse;
}

export function initDetail() {
  $$('[data-sys]').forEach(b => b.addEventListener('click', () => openSystem(b.dataset.sys)));
  $('#back').addEventListener('click', () => show('body'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && state.view === 'detail') show('body'); });
  initOrganDrag();

  // Small live wobble on the big number
  setInterval(() => {
    if (!state.current || state.pastDay !== null || !SYS[state.current].jitter) return;
    const [a, b] = SYS[state.current].jitter;
    $('#dValue').textContent = a + Math.floor(Math.random() * (b - a + 1));
  }, 3500);
}
