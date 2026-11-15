import { $, $$ } from '../util.js';
import { live, onData, organ, api } from '../data/client.js';
import { SYS, VITALS } from '../data/mock.js';
import { setHoverOrgan } from '../three/api.js';
import { openSystem } from './detail.js';

/* "Your health": the right panel of the Body view. A ring on top says how today looks at a
   glance; below, the main vital signs (General tab) and every reading grouped by body system.

   Each reading is one row: what it is, a 7-day trend line, the number, and one word for how it
   looks. Your usual range is in the row's tooltip, not on screen. Rows that belong to an organ
   open that organ when clicked. Live values come from the backend (devices + organ engine,
   trends from /api/trends); with the backend off the demo numbers in mock.js are used. */

// Latest device reading, or null.
function vital(metric) {
  const v = live.vitals[metric];
  if (v && typeof v.value === 'number') return v.value;
  return null;
}

// Organ-backed reading: value + usual from the organ engine, look from its level.
function organReading(id) {
  const o = organ(id);
  return { value: o.value, usual: o.usual ? `Usual ${o.usual.replace('-', '–')}` : '', level: o.level || 'low', note: o.note };
}

// Compare to a usual range. Returns 'ok' | 'high' | 'low'.
function range(v, lo, hi) {
  if (v === null || v === undefined) return null;
  if (v > hi) return 'high';
  if (v < lo) return 'low';
  return 'ok';
}

// A row's look from an organ level, with the direction taken from the usual range.
function organLook(level, v, lo, hi) {
  if (level === 'low') return 'ok';
  return range(v, lo, hi) || 'high';
}

const parseUsual = s => {
  const m = String(s || '').match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  return m ? [+m[1], +m[2]] : [-Infinity, Infinity];
};

/* Every reading. get() returns { value (text), unit, usual (text), look: ok|high|low|null }.
   sys = organ id the row opens. trend = series name in /api/trends. */
const READINGS = {
  hr: { name: 'Resting heart rate', sys: 'heart', trend: 'heart_rate', get() {
    const r = organReading('heart'), [lo, hi] = parseUsual(r.usual);
    return { value: Math.round(r.value), unit: 'bpm', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  bp: { name: 'Blood pressure', trend: 'bp_sys', get() {
    let s = vital('bp_sys'), d = vital('bp_dia');
    if (s === null && VITALS.bp.value) [s, d] = VITALS.bp.value;
    if (s === null) return { value: '—', unit: '', usual: 'Usual about 118/76', look: null };
    const look = s >= 130 || d >= 85 ? 'high' : s < 90 || d < 60 ? 'low' : 'ok';
    return { value: `${Math.round(s)}/${Math.round(d)}`, unit: 'mmHg', usual: 'Usual about 118/76', look };
  } },
  hrv: { name: 'Recovery (HRV)', hint: 'Higher means better rested', trend: 'hrv', get() {
    const v = vital('hrv');
    return { value: v === null ? '—' : Math.round(v), unit: 'ms', usual: 'Usual about 55', look: v === null ? null : v < 45 ? 'low' : 'ok' };
  } },
  glucose: { name: 'Blood sugar', trend: 'glucose', get() {
    let v = vital('glucose');
    if (v === null) v = VITALS.glucose.value;
    return { value: v === null ? '—' : Math.round(v), unit: 'mg/dL', usual: 'Usual 70–110', look: range(v, 70, 110) };
  } },
  resp: { name: 'Breathing rate', sys: 'lungs', trend: 'resp_rate', get() {
    const r = organReading('lungs'), [lo, hi] = parseUsual(r.usual);
    return { value: Math.round(r.value), unit: '/min', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  spo2: { name: 'Blood oxygen', sys: 'lungs', trend: 'spo2', get() {
    let v = vital('spo2');
    if (v === null) v = parseFloat(SYS.lungs.v2) || null;
    return { value: v === null ? '—' : Math.round(v), unit: '%', usual: 'Usual 95–100', look: v === null ? null : v < 95 ? 'low' : 'ok' };
  } },
  sleep: { name: 'Sleep last night', sys: 'sleep', trend: 'sleep_hours', get() {
    const r = organReading('sleep'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: 'h', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  reaction: { name: 'Reaction time', sys: 'sleep', hint: 'Lower is faster', trend: 'reaction_ms', get() {
    const v = vital('reaction_ms');
    return { value: v === null ? '—' : Math.round(v), unit: 'ms', usual: 'Usual about 250', look: v === null ? null : v > 275 ? 'high' : 'ok' };
  } },
  mood: { name: 'Mood', trend: 'mood_1to5', get() {
    let v = vital('mood_1to5');
    if (v === null) v = VITALS.mood.value;
    return { value: v === null ? '—' : v.toFixed(1).replace('.0', ''), unit: 'of 5', usual: 'Usual about 4', look: v === null ? null : v < 3.5 ? 'low' : 'ok' };
  } },
  onsd: { name: 'Eye swelling', sys: 'eyes', hint: 'Optic nerve width, by ultrasound', trend: 'onsd_mm', get() {
    const r = organReading('eyes');
    return { value: r.value, unit: 'mm', usual: r.usual, look: r.level === 'low' ? 'ok' : 'high' };
  } },
  bone: { name: 'Bone density', sys: 'bones', hint: 'Estimate, % of preflight, scanned after landing', trend: 'bone_pct', get() {
    const r = organReading('bones'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: '%', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  muscle: { name: 'Muscle strength', sys: 'muscles', hint: 'Estimate', trend: 'muscle_score', get() {
    const r = organReading('muscles'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: 'of 100', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  load: { name: 'Lifting load', sys: 'muscles', hint: '% of preflight weight on the exercise machine', trend: 'resistive_load_pct', get() {
    const v = vital('resistive_load_pct');
    return { value: v === null ? '—' : Math.round(v), unit: '%', usual: 'Usual 95–100', look: v === null ? null : v < 85 ? 'low' : 'ok' };
  } },
  exercise: { name: 'Exercise today', sys: 'muscles', trend: 'exercise_min', get() {
    const v = vital('exercise_min');
    return { value: v === null ? '—' : Math.round(v), unit: 'min', usual: 'Goal 90 or more', look: v === null ? null : v < 60 ? 'low' : 'ok' };
  } },
  temp: { name: 'Body temperature', get() {
    const v = VITALS.temp.value;
    return { value: v === null ? '—' : v.toFixed(1), unit: '°C', usual: 'Usual 36.1–37.2', look: range(v, 36.1, 37.2) };
  } },
};

// Tabs, by body system. organs = the organs this system covers (for its sentence and next step).
const TABS = [
  { id: 'general', label: 'General', title: 'Vital signs' },
  { id: 'heart', label: 'Heart', title: 'Heart and blood', organs: ['heart'], rows: ['hr', 'bp', 'hrv', 'glucose'] },
  { id: 'lungs', label: 'Lungs', title: 'Breathing', organs: ['lungs'], rows: ['resp', 'spo2'] },
  { id: 'brain', label: 'Brain', title: 'Brain, sleep and eyes', organs: ['sleep', 'eyes'], rows: ['sleep', 'reaction', 'mood', 'onsd'] },
  { id: 'bones', label: 'Bones', title: 'Bones and muscles', organs: ['bones', 'muscles'], rows: ['bone', 'muscle', 'load', 'exercise'] },
];

const WORD = { ok: 'Normal', high: 'High', low: 'Low' };
// Readings where "high" is good news or bad news reads differently.
const WORD_FOR = { reaction: { high: 'Slow' }, onsd: { high: 'Swollen' }, exercise: { low: 'Short' } };
const word = (k, look) => (WORD_FOR[k] && WORD_FOR[k][look]) || WORD[look] || 'No reading';

let current = 'general';
let shown = null;   // tab drawn last time; the fade-in plays only when it changes

const flagged = tab => tab.rows && tab.rows.some(k => { const l = READINGS[k].get().look; return l && l !== 'ok'; });

// Demo weeks in mock.js, for the trend line when the backend is off.
const OFFLINE_WEEK = { hr: () => SYS.heart.week, sleep: () => SYS.sleep.week, resp: () => SYS.lungs.week, muscle: () => SYS.muscles.week };

// The last 7 days of a reading, ending on the number the row shows. null = no trend to draw.
function series(k, shown) {
  const r = READINGS[k];
  let s = live.trends && r.trend ? live.trends.metrics[r.trend] : null;
  if (!s && OFFLINE_WEEK[k]) s = OFFLINE_WEEK[k]();
  if (!s || s.length < 2) return null;
  s = s.slice();
  const now = parseFloat(shown);   // "117/76" reads as 117, the systolic the trend tracks
  if (Number.isFinite(now)) s[s.length - 1] = now;
  return s;
}

// A small trend line. Quiet weeks stay flat instead of blowing day-to-day noise up into a zigzag.
function spark(k, shown) {
  const s = series(k, shown);
  if (!s) return '<span class="hp-spark"></span>';
  const W = 64, H = 22, P = 3;
  const lo0 = Math.min(...s), hi0 = Math.max(...s), mid = (lo0 + hi0) / 2;
  const span = Math.max(hi0 - lo0, Math.abs(mid) * 0.02, 0.1);
  const x = i => P + i * (W - 2 * P) / (s.length - 1);
  const y = v => H - P - ((v - (mid - span / 2)) / span) * (H - 2 * P);
  const pts = s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="hp-spark" viewBox="0 0 ${W} ${H}" aria-label="Last 7 days"><polyline points="${pts}"/><circle cx="${x(s.length - 1).toFixed(1)}" cy="${y(s[s.length - 1]).toFixed(1)}" r="2.4"/></svg>`;
}

function row(k) {
  const r = READINGS[k], d = r.get();
  const look = d.look || 'none';
  const tag = r.sys ? 'button' : 'div';
  const sys = r.sys ? ` data-sys="${r.sys}"` : '';
  const tip = [d.usual, r.hint].filter(Boolean).join(' · ');
  return `<${tag} class="hp-row ${look}"${sys} title="${tip}">
    <span class="hp-name">${r.name}</span>
    ${spark(k, d.value)}
    <span class="hp-val"><b>${d.value}<small>${d.unit}</small></b><em>${word(k, d.look)}</em></span>
  </${tag}>`;
}

// Which tab a reading lives in (the General tab for readings that fit no system).
const tabOf = k => (TABS.find(t => t.rows && t.rows.includes(k)) || TABS[0]).id;
const ALL_READINGS = [...new Set(TABS.flatMap(t => t.rows || [])), 'temp'];

// Today at a glance: a ring of how many readings are normal, and a chip for each one that is not.
function summaryHtml() {
  const taken = ALL_READINGS.map(k => [k, READINGS[k].get().look]).filter(([, l]) => l);
  const off = taken.filter(([, l]) => l !== 'ok');
  const ok = taken.length - off.length;
  const C = 2 * Math.PI * 26;
  const arc = taken.length ? C * ok / taken.length : C;
  let head = 'All good today';
  if (off.length === 1) head = '1 thing needs a look';
  if (off.length > 1) head = `${off.length} things need a look`;
  let more = '<p>Every reading is in your usual range.</p>';
  if (off.length) {
    // One chip per system, with how many of its readings are off. The tab lists which ones.
    const count = {};
    off.forEach(([k]) => { const t = tabOf(k); count[t] = (count[t] || 0) + 1; });
    more = `<div class="hp-chips">${TABS.filter(t => count[t.id]).map(t =>
      `<button class="hp-chip" data-tab="${t.id}">${t.label} <b>${count[t.id]}</b></button>`).join('')}</div>`;
  }
  return `<div class="hp-sum${off.length ? ' flag' : ''}">
    <div class="hp-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle class="hp-arc" cx="32" cy="32" r="26" stroke-dasharray="${arc.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>
      <span><b>${ok}</b>of ${taken.length}</span>
    </div>
    <div class="hp-sum-text"><h3>${head}</h3><small>${ok} of ${taken.length} readings normal</small>${more}</div>
  </div>`;
}

// The backend's sentence for an organ, with medical terms swapped for plain words.
const PLAIN_NOTE = {
  eyes: o => (o.level || 'low') === 'low'
    ? 'No sign of fluid pressing on the eyes.'
    : 'Fluid shifting toward the head is pressing on the back of the eyes.',
};
const note = o => (PLAIN_NOTE[o.id] ? PLAIN_NOTE[o.id](o) : o.note) || '';

// One sentence for a system: the notes of what needs a look, or the first organ's note.
function sentence(tab) {
  const notes = tab.organs.map(organ).filter(o => (o.level || 'low') !== 'low');
  if (!notes.length) return note(organ(tab.organs[0]));
  return notes.map(note).join(' ');
}

// Countermeasure names in plain words (by backend id). Others are already plain.
const PLAIN_STEP = { lbnp_30: '30 min in the lower-body pressure suit, to pull blood back to the legs' };

// The most useful thing to do for a flagged system (the backend's first countermeasure).
function nextStep(tab) {
  const o = tab.organs.map(organ).find(x => (x.level || 'low') !== 'low' && x.countermeasures && x.countermeasures.length);
  if (!o) return '';
  const c = o.countermeasures[0];
  return `<button class="hp-next" data-sys="${o.id}"><span>Next step</span>${PLAIN_STEP[c.id] || c.label}</button>`;
}

function systemBody(tab) {
  return `<p class="hp-say">${sentence(tab)}</p>
    <div class="hp-rows">${tab.rows.map(row).join('')}</div>
    ${nextStep(tab)}`;
}

// General: the vital signs a doctor asks for first, all on one screen. Which system needs a look is
// already said by the ring above and the marks on the tabs, so this tab is the numbers themselves.
const KEY_READINGS = ['hr', 'bp', 'spo2', 'resp', 'temp', 'glucose', 'sleep'];
function generalBody() {
  return `<div class="hp-rows hp-key">${KEY_READINGS.map(row).join('')}</div>`;
}

export function renderHealth() {
  const box = $('#health');
  if (!box) return;
  const tab = TABS.find(t => t.id === current);
  box.innerHTML = `
    ${summaryHtml()}
    <div class="hp-tabs" role="tablist" aria-label="Body systems">
      ${TABS.map(t => `<button class="hp-tab${t.id === current ? ' on' : ''}${flagged(t) ? ' flag' : ''}" role="tab" aria-selected="${t.id === current}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="hp-body${shown === current ? '' : ' enter'}">
      ${tab.title ? `<h3>${tab.title}</h3>` : ''}
      ${tab.id === 'general' ? generalBody() : systemBody(tab)}
    </div>`;
  shown = current;
}

// The 7-day trends change slowly (director events, logged steps): fetch at most every 10 s.
let trendsAt = 0;
function loadTrends() {
  if (!live.online || Date.now() - trendsAt < 10000) return;
  trendsAt = Date.now();
  api.trends(7).then(t => { live.trends = t; renderHealth(); }).catch(() => {});
}

export function initHealthPanel() {
  const box = $('#health');
  if (!box) return;
  // One set of listeners on the box; the contents are re-rendered as data arrives.
  box.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) { current = t.dataset.tab; renderHealth(); return; }
    const s = e.target.closest('[data-sys]');
    if (s) openSystem(s.dataset.sys);
  });
  box.addEventListener('pointerover', e => {
    const s = e.target.closest('[data-sys]');
    setHoverOrgan(s ? s.dataset.sys : null);
  });
  box.addEventListener('pointerleave', () => setHoverOrgan(null));
  box.addEventListener('keydown', e => {
    if (!e.target.classList.contains('hp-tab') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const i = TABS.findIndex(t => t.id === current);
    current = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    renderHealth();
    box.querySelector('.hp-tab.on')?.focus();
  });

  // Device readings stream in fast; redraw at most once a second.
  let pending = false;
  onData(type => {
    if (type === 'online') {
      api.vitals().then(v => { Object.assign(live.vitals, v.latest || {}); renderHealth(); }).catch(() => {});
    }
    if (type === 'online' || type === 'state') loadTrends();
    if (type === 'vital') {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; renderHealth(); }, 1000);
      return;
    }
    renderHealth();
  });
  renderHealth();
}
