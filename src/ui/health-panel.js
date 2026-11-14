import { $, $$ } from '../util.js';
import { live, onData, organ, api } from '../data/client.js';
import { SYS, VITALS } from '../data/mock.js';
import { setHoverOrgan } from '../three/api.js';
import { openSystem } from './detail.js';

/* "Your health": the right panel of the Body view. Every reading we have, grouped by body
   system in tabs, the way the "Your body" panel groups the parts.

   Each reading is one row: what it is, your usual, the number, and one word for how it looks.
   Rows that belong to an organ open that organ when clicked. Live values come from the
   backend (devices + organ engine); with the backend off the demo numbers in mock.js are used. */

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
   sys = organ id the row opens. */
const READINGS = {
  hr: { name: 'Resting heart rate', sys: 'heart', get() {
    const r = organReading('heart'), [lo, hi] = parseUsual(r.usual);
    return { value: Math.round(r.value), unit: 'bpm', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  bp: { name: 'Blood pressure', get() {
    let s = vital('bp_sys'), d = vital('bp_dia');
    if (s === null && VITALS.bp.value) [s, d] = VITALS.bp.value;
    if (s === null) return { value: '—', unit: '', usual: 'Usual about 118/76', look: null };
    const look = s >= 130 || d >= 85 ? 'high' : s < 90 || d < 60 ? 'low' : 'ok';
    return { value: `${Math.round(s)}/${Math.round(d)}`, unit: 'mmHg', usual: 'Usual about 118/76', look };
  } },
  hrv: { name: 'Heart rate variability', hint: 'Higher means better rested', get() {
    const v = vital('hrv');
    return { value: v === null ? '—' : Math.round(v), unit: 'ms', usual: 'Usual about 55', look: v === null ? null : v < 45 ? 'low' : 'ok' };
  } },
  glucose: { name: 'Blood sugar', get() {
    let v = vital('glucose');
    if (v === null) v = VITALS.glucose.value;
    return { value: v === null ? '—' : Math.round(v), unit: 'mg/dL', usual: 'Usual 70–110', look: range(v, 70, 110) };
  } },
  resp: { name: 'Breathing rate', sys: 'lungs', get() {
    const r = organReading('lungs'), [lo, hi] = parseUsual(r.usual);
    return { value: Math.round(r.value), unit: 'a minute', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  spo2: { name: 'Blood oxygen', sys: 'lungs', get() {
    let v = vital('spo2');
    if (v === null) v = parseFloat(SYS.lungs.v2) || null;
    return { value: v === null ? '—' : Math.round(v), unit: '%', usual: 'Usual 95–100', look: v === null ? null : v < 95 ? 'low' : 'ok' };
  } },
  sleep: { name: 'Sleep last night', sys: 'sleep', get() {
    const r = organReading('sleep'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: 'hours', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  reaction: { name: 'Reaction time', sys: 'sleep', hint: 'Lower is faster', get() {
    const v = vital('reaction_ms');
    return { value: v === null ? '—' : Math.round(v), unit: 'ms', usual: 'Usual about 250', look: v === null ? null : v > 275 ? 'high' : 'ok' };
  } },
  mood: { name: 'Mood', get() {
    let v = vital('mood_1to5');
    if (v === null) v = VITALS.mood.value;
    return { value: v === null ? '—' : v.toFixed(1).replace('.0', ''), unit: 'of 5', usual: 'Usual about 4', look: v === null ? null : v < 3.5 ? 'low' : 'ok' };
  } },
  onsd: { name: 'Optic nerve', sys: 'eyes', hint: 'Wider means fluid pressing on the eye', get() {
    const r = organReading('eyes');
    return { value: r.value, unit: 'mm wide', usual: r.usual, look: r.level === 'low' ? 'ok' : 'high' };
  } },
  bone: { name: 'Bone density', sys: 'bones', get() {
    const r = organReading('bones'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: '% of preflight', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  muscle: { name: 'Muscle recovery', sys: 'muscles', get() {
    const r = organReading('muscles'), [lo, hi] = parseUsual(r.usual);
    return { value: r.value, unit: 'of 100', usual: r.usual, look: organLook(r.level, r.value, lo, hi) };
  } },
  exercise: { name: 'Exercise today', sys: 'muscles', get() {
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
  { id: 'general', label: 'General' },
  { id: 'heart', label: 'Heart', title: 'Heart and blood', organs: ['heart'], rows: ['hr', 'bp', 'hrv', 'glucose'] },
  { id: 'lungs', label: 'Lungs', title: 'Breathing', organs: ['lungs'], rows: ['resp', 'spo2'] },
  { id: 'brain', label: 'Brain', title: 'Brain, sleep and eyes', organs: ['sleep', 'eyes'], rows: ['sleep', 'reaction', 'mood', 'onsd'] },
  { id: 'bones', label: 'Bones', title: 'Bones and muscles', organs: ['bones', 'muscles'], rows: ['bone', 'muscle', 'exercise'] },
];

const WORD = { ok: 'Normal', high: 'High', low: 'Low' };
// Readings where "high" is good news or bad news reads differently.
const WORD_FOR = { reaction: { high: 'Slow' }, onsd: { high: 'Swollen' }, exercise: { low: 'Short' } };
const word = (k, look) => (WORD_FOR[k] && WORD_FOR[k][look]) || WORD[look] || 'No reading';

let current = 'general';
let shown = null;   // tab drawn last time; the fade-in plays only when it changes

const flagged = tab => tab.rows && tab.rows.some(k => { const l = READINGS[k].get().look; return l && l !== 'ok'; });

function row(k) {
  const r = READINGS[k], d = r.get();
  const look = d.look || 'none';
  const tag = r.sys ? 'button' : 'div';
  const sys = r.sys ? ` data-sys="${r.sys}"` : '';
  return `<${tag} class="hp-row ${look}"${sys}>
    <span class="hp-name">${r.name}<small>${d.usual}${r.hint ? ` · ${r.hint}` : ''}</small></span>
    <span class="hp-val"><b>${d.value}<small>${d.unit}</small></b><em>${word(k, d.look)}</em></span>
  </${tag}>`;
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

// General: how each system is doing in a word, then the one check-in reading that fits nowhere else.
function generalBody() {
  const systems = TABS.slice(1);
  const needs = systems.filter(flagged);
  let say = 'Everything is in your usual range today.';
  if (needs.length === 1) say = `${needs[0].title} needs a look today. Everything else is normal.`;
  if (needs.length > 1) say = `${needs.length} systems need a look today. Everything else is normal.`;
  const list = systems.map(t => {
    const bad = flagged(t);
    // Name what is off, e.g. "Resting heart rate high".
    const off = t.rows.map(k => [k, READINGS[k].get().look]).filter(([, l]) => l && l !== 'ok')
      .map(([k, l]) => `${READINGS[k].name} ${word(k, l).toLowerCase()}`).join(' · ');
    return `<button class="hp-row hp-sys ${bad ? 'high' : 'ok'}" data-tab="${t.id}">
      <span class="hp-name">${t.title}${off ? `<small>${off}</small>` : ''}</span>
      <span class="hp-val"><em>${bad ? 'Needs a look' : 'Normal'}</em></span>
    </button>`;
  }).join('');
  return `<p class="hp-say">${say}</p>
    <div class="hp-rows">${list}${row('temp')}</div>`;
}

export function renderHealth() {
  const box = $('#health');
  if (!box) return;
  const tab = TABS.find(t => t.id === current);
  box.innerHTML = `
    <div class="hp-tabs" role="tablist" aria-label="Body systems">
      ${TABS.map(t => `<button class="hp-tab${t.id === current ? ' on' : ''}${flagged(t) ? ' flag' : ''}" role="tab" aria-selected="${t.id === current}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="hp-body${shown === current ? '' : ' enter'}">
      ${tab.title ? `<h3>${tab.title}</h3>` : ''}
      ${tab.id === 'general' ? generalBody() : systemBody(tab)}
    </div>`;
  shown = current;
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
