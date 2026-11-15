import { $, $$ } from '../util.js';
import { SYS, VITALS, STREAK } from '../data/mock.js';
import { JUDGE } from '../data/health-rules.js';
import { state } from '../state.js';

/* Mood drawer, opened by the "Check in" button on the right rail.
   One question, five faces, a week of dots. Every reading here is made up. */

const WORDS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
// Day letters for the last seven days, ending today.
const DAYS = [...Array(7)].map((_, i) => 'SMTWTFS'[(new Date().getDay() + i + 1) % 7]);
const WEEK = [4, 3, 4, 5, 3, 4];        // the last six days (made up); today is added on save
const MOUTH = [-9, -4.5, 0, 5, 10];       // mouth curve per mood: frown to smile

let streak = STREAK;
let today = null;     // mood logged today (1-5)
let pick = null;      // mood tapped but not saved yet
let toastTimer;

// A line-drawn face. The mouth bends with the mood.
const face = (m, cls = '') => {
  const c = MOUTH[m - 1] ?? 0;
  return `<svg class="mface ${cls}" viewBox="0 0 60 60" aria-hidden="true">
    <circle cx="30" cy="30" r="27"/>
    <circle class="eye" cx="21" cy="24" r="2.2"/><circle class="eye" cx="39" cy="24" r="2.2"/>
    <path d="M18 ${39 - c / 2} Q30 ${39 + c} 42 ${39 - c / 2}"/></svg>`;
};

export function renderToday() {
  const shown = pick ?? today;
  const week = [...WEEK, today];
  const strip = week.map((m, i) => `<li class="${i === 6 ? 'now' : ''}">
      <span class="col">${m ? `<i style="bottom:${(m - 1) * 25}%"></i>` : '<i class="empty"></i>'}</span>
      <small>${DAYS[i]}</small></li>`).join('');
  const changed = pick !== null && pick !== today;

  $('#today').innerHTML = `
    <div class="mood">
      <p class="m-q">How are you?</p>
      <div class="m-hero ${shown ? 'set' : ''}" data-m="${shown ?? 0}">
        ${face(shown ?? 3, 'big')}
        <b class="m-word">${shown ? WORDS[shown - 1] : '—'}</b>
      </div>
      <div class="m-pick" role="radiogroup" aria-label="Mood">
        ${WORDS.map((w, i) => `<button role="radio" aria-checked="${shown === i + 1}" aria-label="${w}" data-v="${i + 1}" class="${shown === i + 1 ? 'on' : ''}">${face(i + 1)}</button>`).join('')}
      </div>
      <button class="checkin-btn m-save" id="moodSave" ${changed ? '' : 'disabled'}>${today && !changed ? 'Logged' : 'Save'} <span>${today && !changed ? '✓' : '→'}</span></button>
      <div class="m-week">
        <ol>${strip}</ol>
        <p class="m-streak"><b>${streak}</b> days</p>
      </div>
    </div>`;

  $$('#today .m-pick button').forEach(b => b.addEventListener('click', () => {
    pick = +b.dataset.v;
    renderToday();
  }));
  $('#moodSave').addEventListener('click', save);
  updateStatusLine();
}

function save() {
  if (!pick) return;
  if (!today) streak++;
  today = pick;
  pick = null;
  VITALS.mood.value = today;
  VITALS.mood.when = 'Just now';
  renderToday();
  showToast(`<span class="t-time">Saved</span><span>${WORDS[today - 1]}. Thanks.</span>`, 'ok', 3500);
  setTimeout(closeToday, 900);
}

// Nudge the Check in button while mood hasn't been logged, or a body system needs a look.
function updateStatusLine() {
  let flag = !today;
  Object.values(SYS).forEach(s => { if (s.state === 'watch' || s.state === 'act') flag = true; });
  if (today && JUDGE.mood(today).status !== 'ok') flag = true;
  const btn = $('#checkinOpen');
  if (btn) btn.classList.toggle('due', flag);
}

export function showToast(html, kind = '', ms = 7000) {
  const t = $('#toast');
  t.className = 'toast on ' + kind;
  t.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  const go = t.querySelector('[data-mood]');
  if (go) go.addEventListener('click', () => { t.classList.remove('on'); openToday(); });
}

// A gentle mood reminder a few seconds after reaching the body view.
function scheduleReminder() {
  const wait = setInterval(() => {
    if ($('#signin') || state.view !== 'body') return;
    clearInterval(wait);
    setTimeout(() => {
      if (today) return;
      showToast(`<span class="t-time">Mood</span><span>How are you today?</span><button data-mood>Tell us →</button>`, 'prompt', 12000);
    }, 2500);
  }, 1000);
}

export function openToday() {
  pick = null;
  renderToday();
  $('#todayDrawer').classList.add('on');
  $('#toast').classList.remove('on');
}

export function closeToday() {
  $('#todayDrawer').classList.remove('on');
}

export function initToday() {
  // The drawer heading lives in index.html; set it here so this file owns the mood copy.
  const h = $('#todayDrawer h2');
  if (h) h.textContent = 'Mood';
  renderToday();
  $('#checkinOpen').addEventListener('click', openToday);
  $$('#todayDrawer [data-close]').forEach(el => el.addEventListener('click', closeToday));
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#todayDrawer').classList.contains('on')) closeToday();
  });
  $$('.tab').forEach(t => t.addEventListener('click', () => $('#toast').classList.remove('on')));
  scheduleReminder();
}
