import { $, $$ } from '../util.js';
import { live, onData, rankedOrgans, missionInfo } from '../data/client.js';
import { setHoverOrgan } from '../three/api.js';
import { openSystem } from './detail.js';

/* The right rail of the Body view: only the systems that need attention, each as its own box,
   worst first, with how bad it is now (Mild / Extreme) and what it could lead to.
   The anatomy panel on the left lists every system head to toe; this rail answers
   "what should I deal with today". Clicking a box flies into that organ, exactly like
   clicking the system on the body (rules.md section 1.5). */

const LEVEL_WORD = { low: 'Low', mild: 'Mild', extreme: 'Extreme' };
const PHASE_WORD = { cruise: 'transit', surface: 'surface' };

function card(o) {
  const level = o.level || 'low';
  const pct = Math.round((o.severity || 0) * 100);
  const wrong = (o.wrong || [])[0];
  let effect = '';
  if (wrong) effect = `<p><b>Could lead to</b>${wrong.title}</p>`;
  return `<button class="risk ${level}" data-sys="${o.id}">
    <i class="rank">${o.rank || ''}</i>
    <div class="risk-main">
      <div class="risk-top"><b>${o.name}</b><span class="lvl ${level}">${LEVEL_WORD[level]}</span></div>
      <em>${o.value} ${o.unit}</em>
      <div class="sev"><i style="width:${pct}%"></i></div>
      ${effect}
    </div>
  </button>`;
}

function renderList() {
  const problems = rankedOrgans().filter(o => (o.level || 'low') !== 'low');
  const sub = $('#riskSub');
  if (!problems.length) {
    $('#riskList').innerHTML = '<p class="risk-clear">Every system is in its usual range today.</p>';
    sub.textContent = 'Nothing needs attention';
    return;
  }
  sub.textContent = `${problems.length} system${problems.length > 1 ? 's' : ''} need${problems.length > 1 ? '' : 's'} attention`;
  $('#riskList').innerHTML = problems.map(card).join('');
  $$('#riskList .risk').forEach(b => {
    const id = b.dataset.sys;
    b.addEventListener('click', () => openSystem(id));
    b.addEventListener('pointerenter', () => setHoverOrgan(id));
    b.addEventListener('pointerleave', () => setHoverOrgan(null));
  });
}

/* The mission is known from the moment the crew member signs in. It is shown in three
   places and chosen in none of them: swapping missions is a demo control (director.js). */
export function renderMission() {
  const m = missionInfo();
  const phase = PHASE_WORD[m.phase] || 'transit';
  const where = `${m.mission_name} ${phase} · day ${m.day}`;
  $('#bodyDay').textContent = m.day;
  const line = $('#missionLine');
  if (line) line.innerHTML = `<b>${m.mission_name}</b> ${phase} · day ${m.day}`;
  const bar = $('#barMission');
  if (bar) bar.innerHTML = `${m.mission_name} <i>/</i> Day ${m.day} <i>/</i> Crew ${m.crew_id || '03'}`;
  const who = $('#whoMission');
  if (who) who.textContent = where;
}

export function initRiskBoard() {
  renderMission();
  renderList();
  onData(type => {
    if (type !== 'state') return;
    renderMission();
    renderList();
  });
}
