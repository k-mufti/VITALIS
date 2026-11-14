import { SYS, MOCK_MISSION } from './mock.js';

/* Talks to the backend (plan.md 5.5). If the backend is off, the app keeps running on mock.js.
   Try it in the browser console: vitalis.api.director('bad_sleep_week') */

export const API = 'http://localhost:8001';
const WS_URL = 'ws://localhost:8001/ws';

// Latest data from the backend. Views read from here (or from SYS, which is kept in sync).
export const live = { online: false, state: null, risks: [], vitals: {}, triage: [] };

const listeners = [];
// fn(type, live). type: 'online' | 'offline' | 'state' | 'vital' | 'triage'
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
  director: type => post('/api/director/event', { type }),
  ask: question => post('/api/ask', { question }, 35000),
  spaceWeather: () => request('/api/space-weather'),
  comms: () => request('/api/comms'),
  vitals: () => request('/api/vitals'),
  sources: () => request('/api/sources'),
};

// Mission numbers for the UI: live when online, mock otherwise.
export function missionInfo() {
  if (live.state) return live.state;
  return MOCK_MISSION;
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
    if (msg.type === 'state') applyState(msg.state);
    if (msg.type === 'vital') applyVital(msg);
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
  connectSocket();
  pollTriage();
  setInterval(pollTriage, 2000);
}
