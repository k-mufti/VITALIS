import { SYS, MOCK_MISSION } from './mock.js';

/* Talks to the backend (plan.md 5.5). If the backend is off, the app keeps running on mock.js.
   Try it in the browser console: vitalis.api.director('bad_sleep_week') */

// Where the backend is. On your own machine: port 8001 next to the app. Online (kareemmuftee.com/vitalis):
// the same site, under the app's folder; nginx forwards /vitalis/api and /vitalis/ws to the backend
// (deploy/nginx-vitalis.conf). ?api=http://localhost:8011 points the app at another backend, for testing.
function backendUrl() {
  const asked = new URLSearchParams(location.search).get('api');
  if (asked) return asked.replace(/\/$/, '');
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) return 'http://localhost:8001';
  return location.origin + location.pathname.replace(/\/[^/]*$/, '');
}
export const API = backendUrl();
const WS_URL = API.replace(/^http/, 'ws') + '/ws';

// Latest data from the backend. Views read from here (or from SYS, which is kept in sync).
export const live = { online: false, state: null, risks: [], vitals: {}, triage: [], incidents: [], previewDay: null, trends: null };

const listeners = [];
// fn(type, live). type: 'online' | 'offline' | 'state' | 'vital' | 'triage' | 'incidents'
export function onData(fn) {
  listeners.push(fn);
}
function emit(type) {
  listeners.forEach(fn => fn(type, live));
}

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 4000);
  try {
    const res = await fetch(API + path, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function post(path, body, timeout) {
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout });
}

function query(params) {
  const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!parts.length) return '';
  return '?' + parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

// Every backend endpoint in one place.
export const api = {
  health: () => request('/api/health', { timeout: 1500 }),
  state: (day, mission) => request('/api/state' + query({ day, mission })),
  risks: mission => request('/api/risks' + query({ mission })),
  setMission: mission => post('/api/mission', { mission }),
  countermeasure: (organ, id) => post('/api/countermeasure', { organ, id }),
  triage: () => request('/api/triage'),
  history: () => request('/api/history'),
  missions: () => request('/api/missions'),
  environment: (mission, day) => request('/api/environment' + query({ mission, day })),
  director: type => post('/api/director/event', { type }),
  ask: question => post('/api/ask', { question }, 35000),
  spaceWeather: () => request('/api/space-weather'),
  radiationCurve: mission => request('/api/radiation/curve' + query({ mission })),
  comms: () => request('/api/comms'),
  vitals: () => request('/api/vitals'),
  vitalsRaw: () => request('/api/vitals/raw'),
  sources: () => request('/api/sources'),
  provenance: () => request('/api/provenance'),
  trends: days => request('/api/trends' + query({ days })),
  vitalyStatus: () => request('/api/vitaly/status'),
  fitbitStatus: () => request('/api/fitbit/status', { timeout: 2500 }),
  vitalyIncidents: () => request('/api/vitaly/incidents'),
  vitalyAsk: (question, focus, current) => post('/api/vitaly/ask', { question, focus, current }, 15000),
  vitalyAction: action => post('/api/vitaly/action', action, 15000),
};

/* One organ, merged from live data and the mock fallback, in the shape the views use.
   Always returns something for every organ id in ORGAN_IDS. */
export const ORGAN_IDS = ['bones', 'sleep', 'eyes', 'heart', 'muscles', 'lungs', 'ears'];
// Shown only when the backend is off, so the panel still reads sensibly in a demo.
const FALLBACK_WRONG = {
  bones: [{ title: 'Hip or spine fracture after landing' }],
  eyes: [{ title: 'Blurry near vision from optic disc swelling (SANS)' }],
  heart: [{ title: 'Dizziness or fainting when standing up after landing' }],
  sleep: [{ title: 'Slower reactions and mistakes during critical tasks' }],
  muscles: [{ title: 'Weak legs at landing, harder first surface walk' }],
  lungs: [{ title: 'Breathing problems from cabin air or dust' }],
  ears: [{ title: 'Hearing loss from months of cabin noise' }],
};
const FALLBACK = {
  ears: { name: 'Ears & balance', value: 64, unit: 'dBA noise, day average', usual: 'under 70', level: 'low',
    note: 'Hearing, balance and cabin pressure are normal.', l2: 'Hearing test', v2: 'Monthly' },
  bones: { name: 'Bones', value: 95.9, unit: '% of preflight density (estimated)', usual: '97-100', level: 'mild',
    note: 'Estimated hip and spine density down 4.1% since launch. Scanned after landing.', l2: 'Next scan', v2: 'After landing' },
  eyes: { name: 'Eyes', value: 5.2, unit: 'mm optic nerve sheath', usual: 'under 5.0 mm', level: 'mild',
    note: 'Fluid shifting toward the head has widened the optic nerve sheath.', l2: 'Near vision', v2: 'Normal' },
};

export function organ(id) {
  const o = live.state && live.state.organs[id];
  if (o) {
    return {
      id, name: o.name, value: o.value, unit: o.unit, usual: o.usual, note: o.note,
      level: o.level, status: o.status, severity: o.severity, rank: o.rank,
      drivers: o.drivers, wrong: o.what_could_go_wrong, countermeasures: o.countermeasures,
      hrpRisks: o.hrp_risks, hazards: o.hazards, projection: o.projection, measurement: o.measurement, checks: o.checks,
      l2: (SYS[id] || FALLBACK[id] || {}).l2 || 'Watching for', v2: (SYS[id] || FALLBACK[id] || {}).v2 || o.status,
      week: (SYS[id] || {}).week,
    };
  }
  const m = SYS[id] || FALLBACK[id] || {};
  let level = m.level;
  if (!level) {
    level = 'low';
    if (m.state === 'watch') level = 'mild';
  }
  return {
    id, status: 'OK', severity: 0, countermeasures: [], drivers: [],
    wrong: FALLBACK_WRONG[id] || [], ...m, level,
  };
}

// Every organ, ranked worst first (live), or a sensible fixed order offline.
export function rankedOrgans() {
  if (live.risks.length) return live.risks.map(o => organ(o.id));
  return ORGAN_IDS.map((id, i) => ({ rank: i + 1, ...organ(id) }));
}

// Real one-way delay to Earth for today, from JPL Horizons via the backend.
// Falls back to the mock mission's value when the backend is off.
export function commsDelayMin() {
  return missionInfo().comms_delay_min;
}

// Mission numbers for the UI: live when online, mock otherwise.
export function missionInfo() {
  if (live.state) return live.state;
  return MOCK_MISSION;
}

// Preview another mission day without leaving live mode. null goes back to live.
export async function setPreviewDay(day) {
  live.previewDay = day;
  if (day === null) {
    if (live.state) applyState(await api.state());
    return;
  }
  applyState(await api.state(day));
}

// Switch the whole mission (mars / moon / iss). The backend pushes the new state.
export async function setMission(mission) {
  await api.setMission(mission);
  applyState(await api.state(live.previewDay ?? undefined));
}

// Pull the latest state now instead of waiting for the next push (after logging a countermeasure).
export async function refreshState() {
  applyState(await api.state(live.previewDay ?? undefined));
}

function applyState(state) {
  live.state = state;
  live.risks = state.risk_ranking.map(id => state.organs[id]);
  syncMock(state);
  emit('state');
}

// Keep SYS in sync so the existing views show live numbers.
function syncMock(state) {
  Object.keys(SYS).forEach(k => {
    const o = state.organs[k];
    if (!o) return;
    SYS[k].value = o.value;
    SYS[k].note = o.note;
    SYS[k].usual = o.usual;
    SYS[k].state = 'watch';
    if (o.status === 'OK') SYS[k].state = 'ok';
    SYS[k].jitter = null;
  });
}

function applyVital(v) {
  live.vitals[v.metric] = v;
  if (v.metric === 'spo2') SYS.lungs.v2 = `${Math.round(v.value)}%`;
  if (v.metric === 'reaction_ms') SYS.sleep.v2 = `${Math.round(v.value)} ms`;
  emit('vital');
}

// Live updates. Until the backend has /ws (build step 4), retry slowly so the console stays quiet.
function connectSocket() {
  const ws = new WebSocket(WS_URL);
  let opened = false;
  ws.onopen = () => { opened = true; };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state' && live.previewDay === null) applyState(msg.state);
    if (msg.type === 'vital' && live.previewDay === null) applyVital(msg);
    if (msg.type === 'incidents') { live.incidents = msg.incidents; emit('incidents'); }
  };
  ws.onclose = () => {
    let wait = 30000;
    if (opened) wait = 3000;
    setTimeout(connectSocket, wait);
  };
}

async function pollTriage() {
  try {
    live.triage = await api.triage();
    emit('triage');
  } catch (err) {
    // no /api/triage yet (build step 7) or backend went away; keep the last list
  }
}

export async function initData() {
  window.vitalis = { live, api };
  try {
    await api.health();
  } catch (err) {
    console.info('VITALIS: backend offline, using mock data. Start it: cd backend && uvicorn app.main:app --port 8001');
    emit('offline');
    return;
  }
  live.online = true;
  emit('online');
  applyState(await api.state());
  try { live.incidents = await api.vitalyIncidents(); emit('incidents'); } catch (err) { /* older backend */ }
  connectSocket();
  pollTriage();
  setInterval(pollTriage, 2000);
}
