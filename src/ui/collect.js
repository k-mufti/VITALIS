import { $, realTag } from '../util.js';
import { state } from '../state.js';
import { live, onData, api } from '../data/client.js';

/* "Collect": every reading VITALIS takes in, grouped by the device it comes from.
   Three groups: worn on the body, the med bay kit, and what the ship already logs.
   Each row is one reading: what it is, the latest value, how often it is taken, and how long ago.
   Click a row to see the record the device itself sends (GET /api/vitals/raw).
   The device list comes from GET /api/vitals; values update live from the socket. */

// Plain names for every reading the backend sends (devices/catalog.py METRICS).
const NAME = {
  heart_rate: 'Heart rate', hrv: 'Recovery (HRV)', spo2: 'Blood oxygen', resp_rate: 'Breathing rate',
  skin_temp: 'Wrist temperature', pulse_transit_ms: 'Pulse travel time', session_hr_avg: 'Workout heart rate',
  hr_recovery_bpm: 'Heart-rate recovery', ecg_irregular: 'Heart rhythm', sleep_hours: 'Sleep last night',
  noise_dba: 'Sound level', exercise_min: 'Exercise today', glucose: 'Blood sugar',
  bp_sys: 'Blood pressure, upper', bp_dia: 'Blood pressure, lower',
  onsd_mm: 'Optic nerve width', stroke_volume_ml: 'Blood pumped per beat', quad_thickness_mm: 'Thigh muscle thickness',
  dose_msv: 'Radiation dose so far', dose_rate_usv_h: 'Radiation right now',
  reaction_ms: 'Reaction time', mood_1to5: 'Mood', motion_sickness_0to10: 'Nausea', hearing_shift_db: 'Hearing change',
  resistive_load_pct: 'Lifting load', co2_mmhg: 'Cabin CO₂', ppo2_kpa: 'Cabin oxygen',
  cabin_pressure_kpa: 'Cabin pressure', cabin_temp_c: 'Cabin temperature', smoke_index: 'Smoke',
};
const UNIT = {
  C: '°C', '1-5': 'of 5', '0-10': 'of 10', 'breaths/min': '/min', 'min/day': 'min',
  '% of preflight load': '%', 'bpm in 1 min': 'bpm', 'mL per beat': 'mL', 'kPa O2': 'kPa',
};
const OFTEN = { continuous: 'All day', 'daily average': 'Daily', 'per session': 'Each workout' };
// Readings that are a yes/no, shown as a word.
const WORD = { ecg_irregular: ['Regular', 'Irregular'], smoke_index: ['None', 'Detected'] };

const GROUPS = [
  { kind: 'worn', title: 'Worn on the body', say: 'On all day and night. Nothing to remember.' },
  { kind: 'kit', title: 'Med bay kit', say: 'Shared by the crew. A few minutes a day or a week.' },
  { kind: 'ship', title: 'The ship', say: 'Already logged by the ship. No extra hardware.' },
];

let devices = null;      // from /api/vitals
let raw = {};            // metric -> device record, from /api/vitals/raw
const open = new Set();  // metrics whose device record is showing

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function ago(ts) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 5) return 'Just now';
  if (s < 90) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}

function valueText(metric, unit) {
  const v = live.vitals[metric];
  if (!v || typeof v.value !== 'number') return '<b>—</b>';
  if (WORD[metric]) return `<b>${WORD[metric][v.value >= 0.5 ? 1 : 0]}</b>`;
  return `<b>${v.value}</b><small>${UNIT[unit] || unit}</small>`;
}

function readingRow(m) {
  const v = live.vitals[m.metric];
  const isOpen = open.has(m.metric);
  const rec = raw[m.metric];
  let record = '';
  if (isOpen) {
    record = rec
      ? `<div class="col-rec"><span>${rec.format} · ${rec.simulated ? 'simulated' : 'real'}</span><pre>${JSON.stringify(rec.record, null, 2)}</pre></div>`
      : '<div class="col-rec"><span>No record yet</span></div>';
  }
  return `<button class="col-row${isOpen ? ' open' : ''}" data-metric="${m.metric}" aria-expanded="${isOpen}">
      <span class="col-name">${NAME[m.metric] || m.metric}${realTag(v)}</span>
      <span class="col-often">${OFTEN[m.cadence] || cap(m.cadence)}</span>
      <span class="col-val">${valueText(m.metric, m.unit)}</span>
      <span class="col-ago">${v ? ago(v.ts) : 'Waiting'}</span>
    </button>${record}`;
}

// The backend marks unproven hardware claims with "(ASSUMPTION ...)". Say it in plain words.
const plainReal = s => s.replace(/\s*\(ASSUMPTION[^)]*\)/, '. Not yet flown on a long mission');

function deviceCard(d) {
  return `<article class="col-dev">
    <header><h4>${d.label}</h4><span class="col-live"><i></i>${d.live_source ? 'Real · ' + d.live_source : 'Sending'}</span></header>
    <p class="col-real">${d.live_source ? 'A real watch worn by a person. Its readings reach us through the phone app, so they are minutes old. Anything it cannot measure stays simulated.' : plainReal(d.real)}</p>
    <div class="col-rows">${d.metrics.map(readingRow).join('')}</div>
  </article>`;
}

function render() {
  const box = $('#collect');
  if (!box) return;
  if (!devices) {
    box.innerHTML = `<div class="col-head"><h2>Everything we collect</h2>
      <p>${live.online ? 'Loading devices…' : 'Devices are not connected. Start the backend to see every reading live.'}</p></div>`;
    return;
  }
  const count = kind => devices.filter(d => d.kind === kind).length;
  const total = devices.reduce((n, d) => n + d.metrics.length, 0);
  box.innerHTML = `
    <div class="col-head">
      <h2>Everything we collect</h2>
      <p><b>${total} readings</b> from ${count('worn')} worn devices, 1 med bay kit and the ship, in one place.
        Click a reading to see the record its device sends.</p>
    </div>
    <div class="col-grid">${GROUPS.map(g => `<section class="col-group">
      <h3>${g.title}</h3><p class="col-say">${g.say}</p>
      ${devices.filter(d => d.kind === g.kind).map(deviceCard).join('')}
    </section>`).join('')}</div>
    <p class="col-note">${devices.some(d => d.live_source)
      ? 'Readings tagged Real come from a real watch, minutes old. Everything else is simulated, in the units, steps and record formats real devices use.'
      : 'Demo: readings are simulated. The units, steps and record formats are the ones real devices use.'}</p>`;
}

function loadRaw() {
  if (!live.online || !open.size) return;
  api.vitalsRaw().then(r => {
    raw = {};
    r.devices.forEach(d => d.records.forEach(x => { raw[x.metric] = x; }));
    if (state.view === 'collect') render();
  }).catch(() => {});
}

export function initCollect() {
  const box = $('#collect');
  if (!box) return;
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-metric]');
    if (!row) return;
    const m = row.dataset.metric;
    if (open.has(m)) open.delete(m); else open.add(m);
    render();
    loadRaw();
  });

  onData(type => {
    if (type === 'online') {
      api.vitals().then(v => { devices = v.devices; Object.assign(live.vitals, v.latest || {}); render(); }).catch(() => {});
    }
    if (type === 'offline') render();
  });
  // The device list changes when the real watch connects or its data goes stale.
  setInterval(() => { if (state.view === 'collect' && live.online) api.vitals().then(v => { devices = v.devices; }).catch(() => {}); }, 10000);
  // Readings stream in every second; redraw once a second, and only while this view is showing.
  setInterval(() => { if (state.view === 'collect') render(); }, 1000);
  setInterval(() => { if (state.view === 'collect') loadRaw(); }, 2000);
  render();
}
