import { $, $$ } from '../util.js';
import { state } from '../state.js';
import { onData, organ } from '../data/client.js';
import { GUIDE } from '../data/health-rules.js';
import { focusOrgan, resetView } from '../three/api.js';
import { ORGANS, animateOrgan, initOrganDrag } from '../three/organ-drawings.js';
import { show } from '../nav.js';

/* Detail view: one body system's reading, week chart, live wave and organ drawing. */

const wave = [];
let lastSample = 0;

export function openSystem(k) {
  const d = organ(k);
  state.current = k;
  state.pastDay = null;
  focusOrgan(k);
  paint(d);
  renderGuide(k);
  $('.big').classList.remove('past');
  // Not every system has a hand-drawn organ yet (bones, eyes). Show the numbers either way.
  $('#organ').innerHTML = ORGANS[k] || '';
  const svg = $('#organ svg');
  if (svg) svg.classList.add('organ-in');
  buildWeek(d);
  wave.length = 0;
  setTimeout(() => show('detail'), 350);
}

// Fill the detail view from one organ's data.
function paint(d) {
  $('#dName').textContent = d.name;
  $('#dValue').textContent = d.value;
  $('#dUnit').textContent = d.unit;
  $('#dUsual').textContent = d.usual;
  $('#d2Label').textContent = d.l2;
  $('#d2Value').textContent = d.v2;
  const note = $('#dNote');
  note.textContent = d.note;
  note.classList.toggle('watch', d.level !== 'low');
  paintWrong(d);
}

// What this could lead to on this mission, and the best thing to do about it.
function paintWrong(d) {
  const box = $('#dWrong');
  if (!box) return;
  const wrong = (d.wrong || []).slice(0, 2).map(w => {
    let when = '';
    if (w.by_day) when = ` <em>by day ${w.by_day}</em>`;
    return `<li>${w.title}${when}</li>`;
  }).join('');
  const best = (d.countermeasures || [])[0];
  let action = '';
  if (best) action = `<p class="do"><b>Best next step</b>${best.label}</p>`;
  if (!wrong && !action) { box.innerHTML = ''; return; }
  box.innerHTML = `<p class="lead"><b>Could lead to</b></p><ul>${wrong}</ul>${action}`;
}

export function leaveDetail(instant) {
  state.current = null;
  resetView(instant);
}

function buildWeek(d) {
  if (!d.week) { $('#week').innerHTML = ''; return; }
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
  const value = organ(k).value;
  if (k === 'lungs') return Math.sin(t * 2 * Math.PI * value / 60);
  if (k === 'heart') {
    const x = (t * value / 60) % 1;
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
  const pulse = animateOrgan(state.current, now / 1000, organ(state.current).value);
  drawWave(state.current, now);
  return pulse;
}

export function initDetail() {
  $$('[data-sys]').forEach(b => b.addEventListener('click', () => openSystem(b.dataset.sys)));
  $('#back').addEventListener('click', () => show('body'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && state.view === 'detail') show('body'); });
  initOrganDrag();

  // Live data: refresh the open system's numbers (not while looking at a past day).
  onData(type => {
    if (type !== 'state' && type !== 'vital') return;
    if (!state.current || state.pastDay !== null) return;
    paint(organ(state.current));
  });
}

// "How to check · why it matters in space" under the note (src/data/health-rules.js).
function renderGuide(k) {
  const g = GUIDE[k], box = $('#dGuide');
  if (!box) return;
  box.open = false;
  box.innerHTML = g ? `<summary>How to check · why it matters</summary><p>${g.how.join(' ')}</p><p class="why"><b>In space</b>${g.why}</p><p class="src">Source: ${g.src}</p>` : '';
}
