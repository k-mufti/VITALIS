import { $, $$, realTag } from '../util.js';
import { state } from '../state.js';
import { api, live, onData, organ, refreshState } from '../data/client.js';
import { GUIDE } from '../data/health-rules.js';
import { focusOrgan, resetView, playFix } from '../three/api.js';
import { ORGANS, animateOrgan, initOrganDrag } from '../three/organ-drawings.js';
import { show } from '../nav.js';

/* Detail view: one body system in the three parts every detail view has (rules.md 1.5).
   Left: current state. Right: what could go wrong on this mission, and what to do about it. */

const LEVEL_WORD = { low: 'Low', mild: 'Mild', extreme: 'Extreme' };
// Longest we wait for the 3D fix animation before showing the result anyway.
const FIX_WAIT_MS = 5000;

const wave = [];
let lastSample = 0;
// The countermeasure being logged, or the last one logged, for the open system.
let action = null;
// True while a button in the plan is held down, so a live update cannot replace it mid-click.
let pressing = false;
// Last HTML written to each box. Live data repaints this view every second; only real changes touch the DOM.
const painted = new WeakMap();

export function openSystem(k) {
  const d = organ(k);
  state.current = k;
  state.pastDay = null;
  if (action && action.phase !== 'busy') action = null;
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
  paintHow(d);
  paintNow(d);
  paintPlan(d);
}

/* How this number is obtained in flight: measured by a sensor, or estimated because nothing on
   board can measure it (bone density, muscle). Comes from backend devices/catalog.py. */
const METHOD_WORD = { measured: 'Measured', estimated: 'Estimated', 'self-report': 'Self-report' };

function paintHow(d) {
  let box = $('#dHow');
  if (!box) {
    box = document.createElement('p');
    box.className = 'd-how';
    box.id = 'dHow';
    $('#dUnit').after(box);
  }
  const m = d.measurement;
  if (!m) {
    setHtml(box, '');
    return;
  }
  // Most recent input with a timestamp, e.g. the last weekly ultrasound.
  const timed = (m.inputs || []).filter(i => i.last_ts).sort((a, b) => b.last_ts - a.last_ts)[0];
  let last = '';
  if (timed && m.method !== 'estimated') {
    last = ` <span class="d-how-last">${timed.sensor.toLowerCase()} · ${timed.cadence} · ${ago(timed.last_ts)}</span>`;
  }
  // If a reading behind this number comes from the real watch, say so.
  const real = (m.inputs || []).map(i => live.vitals[i.metric]).find(v => v && v.real);
  setHtml(box, `<b class="d-how-tag ${m.method}">${METHOD_WORD[m.method] || m.method}</b>${realTag(real)}${m.how}${last}`);
}

function ago(ts) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

function setHtml(box, html) {
  if (painted.get(box) === html) return;
  painted.set(box, html);
  box.innerHTML = html;
}

// Severity from the backend (0..1) as a whole number out of 100.
function points(severity) {
  return Math.round(Math.min(1, Math.max(0, severity || 0)) * 100);
}

function isLive(d) {
  return Boolean(live.state && live.state.organs[d.id]);
}

// Part 1, current state: how bad it is now, where it is heading, and what is causing it.
function paintNow(d) {
  const level = d.level || 'low';
  let html = `<div class="d-now-top"><span class="lvl ${level}">${LEVEL_WORD[level] || level}</span>`;
  if (isLive(d)) {
    const now = points(d.severity);
    html += `<div class="d-sev ${level}"><i style="width:${now}%"></i></div></div>`;
    html += `<p class="d-trend">Severity ${now} of 100${trend(d, now)}</p>`;
  } else {
    html += '</div>';
  }
  const drivers = d.drivers || [];
  if (drivers.length) {
    html += `<p class="d-head">Why it's flagged</p><div class="d-chips">${drivers.map(x => `<span>${x}</span>`).join('')}</div>`;
  }
  setHtml($('#dNow'), html);
}

// Where the backend's projection ends up if the crew member changes nothing.
function trend(d, now) {
  const steps = d.projection || [];
  const last = steps[steps.length - 1];
  if (!last) return '';
  const then = points(last.severity);
  if (then > now) return ` · heading to ${then} by day ${last.day} if nothing changes`;
  if (then < now) return ` · easing to ${then} by day ${last.day}`;
  return ` · holding steady through day ${last.day}`;
}

// Parts 2 and 3: what could go wrong on this mission, and what to do.
function paintPlan(d) {
  if (pressing) return;
  setHtml($('#dPlan'), checksHtml(d) + wrongHtml(d) + actionsHtml(d));
}

/* Checks from the backend: each measured value against a healthy range from a named source.
   "~" marks ranges the backend flags as approximate. */
const VERDICT_WORD = { ok: 'OK', watch: 'Watch', act: 'Act' };

function checksHtml(d) {
  const list = d.checks || [];
  if (!list.length) return '';
  const rows = list.map(c => `<li class="d-check ${c.verdict}">
      <div class="dc-top"><b>${c.name}</b><span class="dc-val">${c.value}<small> ${c.unit}</small></span><span class="dc-verdict">${VERDICT_WORD[c.verdict] || c.verdict}</span></div>
      <p class="dc-ref">Healthy ${c.approx ? '~' : ''}${c.healthy} <em>· ${c.source}</em></p>
      ${c.why && c.verdict !== 'ok' ? `<p class="dc-why">${c.why}</p>` : ''}
    </li>`).join('');
  return `<section><h3>Checks <em>vs healthy range</em></h3><ul class="d-checks">${rows}</ul></section>`;
}

function wrongHtml(d) {
  const items = (d.wrong || []).map(w => {
    const meta = [];
    if (w.likelihood) meta.push(`${w.likelihood} likelihood`);
    if (w.by_day) meta.push(`by day ${w.by_day}`);
    let line = '';
    if (meta.length) line = `<span class="d-meta">${meta.join(' · ')}</span>`;
    let signs = '';
    if (w.signs && w.signs.length) signs = `<p><em>Watch for</em>${w.signs.join(' · ')}</p>`;
    return `<li class="d-risk ${w.likelihood || ''}"><b>${w.title}</b>${line}${signs}</li>`;
  }).join('');
  if (!items) return '';
  return `<section><h3>What could go wrong <em>on this mission</em></h3><ul class="d-risks">${items}</ul></section>`;
}

function duration(minutes) {
  if (minutes >= 120 && minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

function actionsHtml(d) {
  const list = d.countermeasures || [];
  if (!isLive(d)) {
    return `<section><h3>What to do</h3><p class="d-off">The risk engine is offline, so there are no steps to log right now. Start the backend to see them.</p></section>`;
  }
  if (!list.length) {
    return `<section><h3>What to do</h3><p class="d-off">Nothing to do for this system today.</p></section>`;
  }
  const busy = Boolean(action && action.phase === 'busy');
  const previewing = live.previewDay !== null;
  const now = points(d.severity);
  const buttons = list.map((c, i) => {
    const after = points(d.severity + c.effect);
    const helps = after < now;
    const running = busy && action.organ === d.id && action.id === c.id;
    let tag = '';
    if (i === 0 && helps) tag = '<span class="d-tag">Best next step</span>';
    let gain = 'little to gain right now';
    if (helps) gain = `severity ${now} → ${after}`;
    let study = '';
    if (c.research) study = `<span class="d-study">NASA study: ${c.research}</span>`;
    let go = 'Mark done <i>→</i>';
    if (running) go = 'Logging…';
    return `<button class="d-act${running ? ' busy' : ''}" data-cm="${c.id}"${busy || previewing ? ' disabled' : ''}>
      ${tag}<b>${c.label}</b>
      <span class="d-meta">${duration(c.minutes)} · ${gain}</span>${study}
      <span class="d-go">${go}</span>
    </button>`;
  }).join('');
  let lock = '';
  if (previewing) lock = `<p class="d-off">You are previewing day ${live.previewDay}. Go back to today to log a step.</p>`;
  return `<section><h3>What to do</h3><div class="d-acts">${buttons}</div>${lock}${resultHtml(d)}</section>`;
}

// What the last logged countermeasure changed: severity when it was pressed against severity now.
// Heart, sleep and lungs follow device readings, which take a moment to respond, so this reads the
// live state on every repaint instead of the before/after in the POST reply.
function resultHtml(d) {
  if (!action || action.organ !== d.id) return '';
  if (action.phase === 'failed') return `<p class="d-result bad">Could not reach the backend. Nothing was logged.</p>`;
  if (action.phase !== 'done') return '';
  const before = points(action.before), now = points(d.severity);
  if (now >= before) return `<p class="d-result"><b>Logged</b>${action.label}. No change in severity yet.</p>`;
  const word = LEVEL_WORD[d.level] || d.level;
  let level = `Now ${word}`;
  if (d.level === action.level) level = `Still ${word}`;
  return `<p class="d-result"><b>Logged</b>${action.label}. Severity ${before} → ${now}. ${level}.</p>`;
}

// The fix animation belongs to the 3D side (plan.md 5.4). It must never block or fail the log.
function fixAnimation(k, id) {
  let done;
  try {
    done = playFix(k, id);
  } catch (err) {
    console.error(err);
  }
  const timeout = new Promise(resolve => setTimeout(resolve, FIX_WAIT_MS));
  return Promise.race([Promise.resolve(done).catch(err => console.error(err)), timeout]);
}

// Log one countermeasure: tell the backend, play the fix on the body, then show what changed.
async function runAction(k, id) {
  const d = organ(k);
  const cm = (d.countermeasures || []).find(c => c.id === id);
  if (!cm || (action && action.phase === 'busy')) return;
  action = { organ: k, id, label: cm.label, phase: 'busy', before: d.severity, level: d.level };
  paintPlan(d);
  try {
    await api.countermeasure(k, id);
    await fixAnimation(k, id);
    action.phase = 'done';
    // Refresh the ranking and every view now instead of waiting for the next push.
    await refreshState();
  } catch (err) {
    console.error(err);
    if (action.phase === 'busy') action.phase = 'failed';
  }
  if (state.current !== k) return;
  paintNow(organ(k));
  paintPlan(organ(k));
  // The plan scrolls on short screens: make sure the outcome is in view.
  const result = $('#dPlan .d-result');
  if (result) result.scrollIntoView({ block: 'nearest' });
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

// The two boxes this view adds to the page: current state under the note, and the plan on the right.
function buildPanels() {
  const now = document.createElement('div');
  now.className = 'd-now';
  now.id = 'dNow';
  $('#dNote').after(now);

  const plan = document.createElement('aside');
  plan.className = 'd-plan';
  plan.id = 'dPlan';
  $('#view-detail').append(plan);

  plan.addEventListener('pointerdown', () => { pressing = true; });
  addEventListener('pointerup', () => { pressing = false; });
  addEventListener('pointercancel', () => { pressing = false; });
  plan.addEventListener('click', e => {
    if (!state.current) return;
    const cm = e.target.closest('[data-cm]');
    if (cm) runAction(state.current, cm.dataset.cm);
  });
}

export function initDetail() {
  buildPanels();
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
