import { $, $$ } from '../util.js';
import { VITALS, ROUTINE, COMMS_DELAY_MIN } from '../data/mock.js';
import { JUDGE, GUIDE, STATUS_WORD } from '../data/health-rules.js';
import { renderToday, showToast } from './today.js';

/* Check-in drawer: the astronaut types or taps their own readings.
   Each field shows how to measure, why it matters in space, and an instant OK / Watch / Act result.
   Readings only live in memory for the demo. */

const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
const SYMPTOMS = ['None', 'Headache', 'Back pain', 'Stuffy nose', 'Dizzy', 'Sick stomach', 'Blurry vision'];
const TITLES = { bp: 'Blood pressure', glucose: 'Blood sugar', temp: 'Temperature', mood: 'How do you feel?', symptoms: 'Anything new?' };

const draft = {};

function inputFor(k) {
  if (k === 'bp') return `<div class="ci-row"><input type="number" inputmode="numeric" data-part="0" placeholder="120" aria-label="Top number"/><em>/</em><input type="number" inputmode="numeric" data-part="1" placeholder="80" aria-label="Bottom number"/><small>mmHg</small></div>`;
  if (k === 'glucose') return `<div class="ci-row"><input type="number" inputmode="numeric" placeholder="95" aria-label="Blood sugar"/><small>mg/dL</small></div>`;
  if (k === 'temp') return `<div class="ci-row"><input type="number" inputmode="decimal" step="0.1" placeholder="37.0" aria-label="Temperature"/><small>°C</small></div>`;
  if (k === 'mood') return `<div class="ci-pick">${MOODS.map((m, i) => `<button type="button" data-v="${i + 1}"><b>${i + 1}</b>${m}</button>`).join('')}</div>`;
  return `<div class="ci-chips">${SYMPTOMS.map(s => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div>`;
}

function section(k) {
  const g = GUIDE[k];
  return `<section class="ci-sec" data-k="${k}">
    <header><h3>${TITLES[k]}</h3><button type="button" class="how-btn" aria-expanded="false">How?</button></header>
    <div class="how" hidden>
      <ol>${g.how.map(s => `<li>${s}</li>`).join('')}</ol>
      <p class="why"><b>Why it matters in space</b>${g.why}</p>
      <p class="src">Source: ${g.src}</p>
    </div>
    ${inputFor(k)}
    <p class="ci-res" aria-live="polite"></p>
  </section>`;
}

// Read the current value of one field, or null if it is empty / half filled.
function readField(sec) {
  const k = sec.dataset.k;
  if (k === 'bp') {
    const [a, b] = $$(`.ci-sec[data-k="bp"] input`).map(i => parseFloat(i.value));
    return a > 0 && b > 0 ? [a, b] : null;
  }
  if (k === 'glucose' || k === 'temp') {
    const v = parseFloat(sec.querySelector('input').value);
    return v > 0 ? v : null;
  }
  if (k === 'mood') {
    const on = sec.querySelector('.ci-pick .on');
    return on ? +on.dataset.v : null;
  }
  const list = [...sec.querySelectorAll('.ci-chips .on')].map(b => b.dataset.v);
  return list.length ? list : null;
}

function update(sec) {
  const k = sec.dataset.k;
  const v = readField(sec);
  draft[k] = v;
  const res = sec.querySelector('.ci-res');
  if (v === null) { res.innerHTML = ''; sec.dataset.status = ''; }
  else {
    const r = JUDGE[k](v);
    sec.dataset.status = r.status;
    res.innerHTML = `<i class="dot ${r.status}"></i><b>${STATUS_WORD[r.status]}</b>${r.say}`;
  }
  const any = Object.values(draft).some(x => x !== null && x !== undefined);
  $('#ciSave').disabled = !any;
}

export function openCheckin(focusKey) {
  Object.keys(draft).forEach(k => delete draft[k]);
  $('#toast').classList.remove('on');
  const box = $('#checkin');
  box.innerHTML = `
    <div class="ci-top"><div><h2>Check in</h2><p>Takes about 2 minutes. Fill in what you have.</p></div><button type="button" class="ci-close" aria-label="Close">Close ✕</button></div>
    <div class="ci-body">${['bp', 'glucose', 'temp', 'mood', 'symptoms'].map(section).join('')}</div>
    <div class="ci-foot"><button type="button" id="ciSave" class="checkin-btn" disabled>Save check-in <span>→</span></button>
      <p class="fine">VITALIS suggests. The crew doctor decides.</p></div>`;

  $$('#checkin .ci-sec').forEach(sec => {
    sec.querySelectorAll('input').forEach(i => i.addEventListener('input', () => update(sec)));
    sec.querySelectorAll('.ci-pick button').forEach(b => b.addEventListener('click', () => {
      sec.querySelectorAll('.ci-pick button').forEach(x => x.classList.toggle('on', x === b));
      update(sec);
    }));
    sec.querySelectorAll('.ci-chips button').forEach(b => b.addEventListener('click', () => {
      const none = b.dataset.v === 'None';
      if (none) sec.querySelectorAll('.ci-chips button').forEach(x => x.classList.toggle('on', x === b && !b.classList.contains('on')));
      else {
        b.classList.toggle('on');
        sec.querySelector('[data-v="None"]').classList.remove('on');
      }
      update(sec);
    }));
    const how = sec.querySelector('.how-btn');
    how.addEventListener('click', () => {
      const panel = sec.querySelector('.how');
      panel.hidden = !panel.hidden;
      how.setAttribute('aria-expanded', String(!panel.hidden));
      how.textContent = panel.hidden ? 'How?' : 'Hide';
    });
  });
  box.querySelector('.ci-close').addEventListener('click', closeCheckin);
  $('#ciSave').addEventListener('click', save);

  document.body.classList.add('ci-open');
  box.classList.add('open');
  const target = box.querySelector(`.ci-sec[data-k="${focusKey}"]`);
  if (target) {
    target.classList.add('focus');
    setTimeout(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const first = target.querySelector('input');
      if (first) first.focus({ preventScroll: true });
    }, 450);
  }
}

export function closeCheckin() {
  document.body.classList.remove('ci-open');
  $('#checkin').classList.remove('open');
}

function save() {
  let act = 0, watch = 0;
  Object.entries(draft).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    const r = JUDGE[k](v);
    if (r.status === 'act') act++;
    if (r.status === 'watch') watch++;
    if (VITALS[k]) { VITALS[k].value = v; VITALS[k].when = 'Just now'; }
    ROUTINE.forEach(item => { if (item.check === k) item.done = true; });
  });
  closeCheckin();
  renderToday();
  const done = ROUTINE.filter(r => r.done).length;
  if (act) {
    showToast(`<span class="t-time">Flagged</span><span>The crew doctor has been told. A copy is on its way to Earth and arrives in about ${Math.round(COMMS_DELAY_MIN)} min.</span>`, 'act', 10000);
  } else if (watch) {
    showToast(`<span class="t-time">Saved</span><span>${watch} reading${watch > 1 ? 's' : ''} to keep an eye on. ${done} of ${ROUTINE.length} checks done today.</span>`, 'watch');
  } else {
    showToast(`<span class="t-time">Saved</span><span>All normal. ${done} of ${ROUTINE.length} checks done today.</span>`, 'ok');
  }
}

export function initCheckin() {
  $('#ciShade').addEventListener('click', closeCheckin);
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('#checkin').classList.contains('open')) closeCheckin(); });
}
