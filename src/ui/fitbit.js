import { $ } from '../util.js';
import { API, api, live } from '../data/client.js';

/* The real watch. A chip in the header says whether the Fitbit is connected and how old its newest
   reading is; click it for what is real and what is still simulated. Served by GET /api/fitbit/status.

   It is never called "live streaming": the watch uploads through the phone app, so a reading is
   usually minutes old. The chip says how many. If the newest reading is too old to count as real, it says
   so and the simulated heart rate is used instead.

   States:  off (not set up: hidden)  ready (set up, not signed in: "Connect Fitbit")
            live (a fresh reading)    stale (connected, nothing fresh)    error (sign in again) */

const NAME = { heart_rate: 'Heart rate', spo2: 'Blood oxygen', hrv: 'Recovery (HRV)', resp_rate: 'Breathing rate', skin_temp: 'Wrist temperature',
  sleep_hours: 'Sleep last night', steps: 'Steps today', exercise_min: 'Exercise today', session_hr_avg: 'Workout heart rate' };
const UNIT = { heart_rate: 'bpm', hrv: 'ms', spo2: '%', resp_rate: '/min', skin_temp: '°C', sleep_hours: 'h', steps: 'steps', exercise_min: 'min', session_hr_avg: 'bpm' };
const DECIMALS = { sleep_hours: 1, skin_temp: 1 };      // everything else is whole numbers, except overnight readings (one decimal)

let status = null;
let fetchedAt = 0;
let note = '';        // result of the last sign-in attempt, from the URL

const minutes = s => (s < 90 ? `${Math.max(0, Math.round(s))} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initFitbit() {
  const mount = document.querySelector('.bar-right');
  if (!mount) return;
  mount.insertAdjacentHTML('afterbegin', `
    <div class="fb-wrap" id="fbWrap" hidden>
      <button class="fb" id="fb" aria-expanded="false" aria-controls="fbPop">
        <i class="fb-dot"></i><span class="fb-label" id="fbLabel">Fitbit</span><b id="fbValue"></b><em id="fbWord"></em>
      </button>
      <div class="fb-pop" id="fbPop" hidden></div>
    </div>`);

  const params = new URLSearchParams(location.search);
  if (params.has('fitbit')) {
    note = params.get('fitbit') === 'connected' ? 'Connected.' : `Could not connect: ${params.get('reason') || 'cancelled'}`;
    history.replaceState(null, '', location.pathname);
  }

  $('#fb').addEventListener('click', () => {
    if (!status) return;
    if (status.state === 'ready' || status.state === 'error') { location.href = `${API}/api/fitbit/connect`; return; }
    togglePop();
  });
  $('#fbPop').addEventListener('click', e => {
    if (e.target.id === 'fbDisconnect') {
      fetch(`${API}/api/fitbit/disconnect`, { method: 'POST' }).then(r => r.json()).then(s => { status = s; fetchedAt = Date.now(); paint(); }).catch(() => {});
    }
    if (e.target.id === 'fbReconnect') location.href = `${API}/api/fitbit/connect`;
  });
  document.addEventListener('click', e => { if (!e.target.closest('#fbWrap')) togglePop(false); });

  const poll = () => api.fitbitStatus().then(s => { status = s; fetchedAt = Date.now(); paint(); }).catch(() => {});
  poll();
  setInterval(poll, 8000);
  setInterval(paint, 1000);      // ages tick up between polls
  if (note) setTimeout(() => togglePop(true), 600);
}

function togglePop(force) {
  const pop = $('#fbPop'), btn = $('#fb');
  const show = force === undefined ? pop.hidden : force;
  pop.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
  if (show) paintPop();
}

// Age of a reading now: its age when the status was fetched, plus the time since.
const ageNow = m => m.age_s + (Date.now() - fetchedAt) / 1000;

function paint() {
  const s = status;
  const wrap = $('#fbWrap');
  if (!wrap || !s) return;
  wrap.hidden = s.state === 'off';
  if (s.state === 'off') return;
  const btn = $('#fb');
  btn.dataset.state = s.state;
  const hr = s.metrics.heart_rate;
  const label = $('#fbLabel'), value = $('#fbValue'), word = $('#fbWord');
  if (s.state === 'ready') { label.textContent = 'Connect Fitbit'; value.textContent = ''; word.textContent = ''; }
  else if (s.state === 'error') { label.textContent = 'Reconnect Fitbit'; value.textContent = ''; word.textContent = ''; }
  else if (s.state === 'live') {
    label.textContent = s.device;
    value.textContent = `${Math.round(hr.value)} bpm`;
    word.textContent = `real · ${minutes(ageNow(hr))} ago`;
  } else {
    label.textContent = s.device;
    value.textContent = hr ? `last ${minutes(ageNow(hr))} ago` : 'waiting';
    word.textContent = 'using simulated';
  }
  footer(s);
  if (!$('#fbPop').hidden) paintPop();
}

// The page footer says crew readings are simulated. While the real watch is live, say what is real.
const FOOT = document.querySelector('.foot');
const FOOT_TEXT = FOOT ? FOOT.firstChild : null;     // the sentence, before the "where this data comes from" link
const FOOT_ORIGINAL = FOOT_TEXT ? FOOT_TEXT.textContent : '';
function footer(s) {
  if (!FOOT_TEXT) return;
  const text = s.state === 'live'
    ? `Demo · Real = from a ${s.device}, minutes old · everything else is simulated · mission data is live `
    : FOOT_ORIGINAL;
  if (FOOT_TEXT.textContent !== text) FOOT_TEXT.textContent = text;
}

function paintPop() {
  const s = status;
  const pop = $('#fbPop');
  if (!s) return;
  // Every row shows a number. A reading that really comes from the watch is tagged "real" with its age;
  // the rest show the app's own current value with no tag (the footer says everything else is simulated).
  const rows = Object.entries(NAME).map(([k, name]) => {
    const m = s.metrics[k];
    const real = m && m.fresh;
    const v = live.vitals[k];
    const n = real ? m.value : v && typeof v.value === 'number' ? v.value : null;
    const dp = DECIMALS[k] ?? (real && m.kind === 'night' ? 1 : 0);
    const val = n === null ? '—' : `${dp ? (+n).toFixed(dp) : Math.round(n).toLocaleString()} <small>${UNIT[k]}</small>`;
    return `<div class="fb-row"><span>${name}</span><b>${val}</b></div>`;
  }).join('');
  const b = s.baseline_hr;
  const base = s.state !== 'live' ? '' : b
    ? `<p class="fb-base">Resting <b>${b.value} bpm</b> · ${b.source === 'watch' ? 'from your watch' : 'from your recent readings'}</p>`
    : '<p class="fb-base">Learning your resting heart rate…</p>';
  pop.innerHTML = `
    <p class="fb-h"><span>${esc(s.device)}</span>${s.state === 'live' ? '<b class="fb-live"><i></i>Live</b>' : '<b class="fb-paused">Paused</b>'}</p>
    ${note ? `<p class="fb-note">${esc(note)}</p>` : ''}
    <div class="fb-rows">${rows}</div>
    ${base}
    ${s.error ? `<p class="fb-err">${esc(s.error)}</p>` : ''}
    <div class="fb-actions">${s.state === 'error' ? '<button class="fb-btn" id="fbReconnect">Connect again</button>'
      : `${s.needs_activity_scope ? '<button class="fb-btn" id="fbReconnect">Allow steps and exercise</button> ' : ''}<button class="fb-btn ghost" id="fbDisconnect">Disconnect</button>`}</div>`;
}
