import { $, $$ } from '../util.js';
import { SYS, VITALS, ROUTINE, SHIP_TIME, STREAK } from '../data/mock.js';
import { JUDGE, STATUS_WORD } from '../data/health-rules.js';
import { openCheckin } from './checkin.js';
import { state } from '../state.js';

/* Today's checks drawer, opened by the "Check in" button on the right rail: the health
   routine, your latest readings, the streak, and a reminder when a check is due.
   Every reading here is made up. */

let streak = STREAK;
let streakEarned = false;
let toastTimer;

export function formatVital(k, v) {
  if (v === null || v === undefined) return '—';
  if (k === 'bp') return v[0] + '/' + v[1];
  return String(v);
}

// { status, say } for a check-in reading, or null if it has not been taken.
export function vitalStatus(k) {
  const v = VITALS[k].value;
  if (v === null) return null;
  return JUDGE[k](v);
}

// The first unfinished check whose time has passed.
function dueItem() {
  return ROUTINE.find(r => !r.done && r.time <= SHIP_TIME);
}

export function renderToday() {
  const done = ROUTINE.filter(r => r.done).length;
  const allDone = done === ROUTINE.length;
  if (allDone && !streakEarned) { streak++; streakEarned = true; }
  const due = dueItem();

  const routine = ROUTINE.map(r => {
    let mark = '';
    if (r.done) mark = '✓';
    else if (r === due) mark = 'Due';
    const cls = (r.done ? 'done' : '') + (r === due ? ' due' : '');
    return `<li class="${cls}"><button data-r="${r.id}"><time>${r.time}</time><span>${r.label}</span><i>${mark}</i></button></li>`;
  }).join('');

  const vitals = Object.entries(VITALS).map(([k, v]) => {
    const s = vitalStatus(k);
    const status = s ? s.status : 'none';
    const word = s ? STATUS_WORD[s.status] : 'Not taken';
    return `<li><button data-check="${k}" title="${s ? s.say : 'Tap to check in'}">
      <i class="dot ${status}"></i><span class="v-name">${v.name}<small>${v.when} · ${word}</small></span>
      <b>${formatVital(k, v.value)}<small>${v.value === null ? '' : v.unit}</small></b></button></li>`;
  }).join('');

  $('#today').innerHTML = `
    <div class="t-head">
      <span>Today<small>Ship time ${SHIP_TIME}</small></span>
      <b class="streak${allDone ? ' up' : ''}">${streak}<small>day streak</small></b>
    </div>
    <div class="t-bar"><i style="width:${(done / ROUTINE.length) * 100}%"></i></div>
    <p class="t-count">${allDone ? 'Every check done today' : `${done} of ${ROUTINE.length} done today`}</p>
    <ul class="routine">${routine}</ul>
    <h3 class="t-label">Your readings</h3>
    <ul class="vitals">${vitals}</ul>
    <button class="checkin-btn" id="checkinBtn">Check in <span>→</span></button>`;

  $$('#today [data-r]').forEach(b => b.addEventListener('click', () => {
    const r = ROUTINE.find(x => x.id === b.dataset.r);
    if (r.check) { openCheckin(r.check); return; }
    r.done = !r.done; // exercise is ticked off by hand
    renderToday();
  }));
  $$('#today [data-check]').forEach(b => b.addEventListener('click', () => openCheckin(b.dataset.check)));
  $('#checkinBtn').addEventListener('click', () => openCheckin(due ? due.check : 'bp'));
  updateStatusLine();
}

// The "N things to watch" line under the day number, counting body systems and check-ins.
function updateStatusLine() {
  let watch = 0, act = 0;
  Object.values(SYS).forEach(s => { if (s.state === 'watch') watch++; if (s.state === 'act') act++; });
  Object.keys(VITALS).forEach(k => {
    const s = vitalStatus(k);
    if (s && s.status === 'watch') watch++;
    if (s && s.status === 'act') act++;
  });
  let dot = 'ok';
  if (watch) dot = 'watch';
  if (act) dot = 'act';
  // Nudge the Check in button when something needs doing.
  const btn = $('#checkinOpen');
  if (btn) btn.classList.toggle('due', dot !== 'ok');
}

export function showToast(html, kind = '', ms = 7000) {
  const t = $('#toast');
  t.className = 'toast on ' + kind;
  t.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  const go = t.querySelector('[data-check]');
  if (go) go.addEventListener('click', () => { t.classList.remove('on'); openCheckin(go.dataset.check); });
}

// Remind the astronaut about a due check a few seconds after they reach the body view.
function scheduleReminder() {
  const wait = setInterval(() => {
    if ($('#signin') || state.view !== 'body') return;
    clearInterval(wait);
    setTimeout(() => {
      const due = dueItem();
      if (!due || !due.check) return;
      showToast(`<span class="t-time">${due.time}</span><span>Time to check your ${due.label.toLowerCase()}</span><button data-check="${due.check}">Check in →</button>`, 'prompt', 12000);
    }, 2500);
  }, 1000);
}

export function openToday() {
  renderToday();
  $('#todayDrawer').classList.add('on');
  $('#toast').classList.remove('on');
}

export function closeToday() {
  $('#todayDrawer').classList.remove('on');
}

export function initToday() {
  renderToday();
  $('#checkinOpen').addEventListener('click', openToday);
  $$('#todayDrawer [data-close]').forEach(el => el.addEventListener('click', closeToday));
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#todayDrawer').classList.contains('on')) closeToday();
  });
  $$('.tab').forEach(t => t.addEventListener('click', () => $('#toast').classList.remove('on')));
  scheduleReminder();
}
