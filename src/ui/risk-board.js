import { $, $$ } from '../util.js';
import { live, onData, rankedOrgans, missionInfo, setMission, setPreviewDay } from '../data/client.js';
import { setHoverOrgan } from '../three/api.js';
import { openSystem } from './detail.js';

/* Risk panel on the right of the body: every system ranked worst first, with how bad it is
   now and what it could lead to. Click a card to fly into that organ. The body stays
   clickable too, so both routes open the same detail view. */

const LEVEL_WORD = { low: 'Low', mild: 'Mild', extreme: 'Extreme' };

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
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${effect}
    </div>
  </button>`;
}

function renderList() {
  const organs = rankedOrgans();
  $('#riskList').innerHTML = organs.map(card).join('');
  $$('#riskList .risk').forEach(b => {
    const id = b.dataset.sys;
    b.addEventListener('click', () => openSystem(id));
    b.addEventListener('pointerenter', () => setHoverOrgan(id));
    b.addEventListener('pointerleave', () => setHoverOrgan(null));
  });
}

function renderMission() {
  const m = missionInfo();
  const day = m.day;
  $('#riskSub').textContent = `${m.mission_name} · day ${day}`;
  $('#bodyDay').textContent = day;
  $$('#missionBtns button').forEach(b => b.classList.toggle('on', b.dataset.mission === m.mission));
  const range = $('#dayRange');
  range.max = m.end_day || 740;
  if (live.previewDay === null) range.value = day;
  const label = $('#dayLabel');
  label.textContent = `Day ${day} · ${m.phase || 'cruise'}`;
  label.classList.toggle('preview', live.previewDay !== null);
  if (live.previewDay !== null) label.textContent += ' · preview';
}

export function initRiskBoard() {
  renderMission();
  renderList();

  $$('#missionBtns button').forEach(b => b.addEventListener('click', async () => {
    if (!live.online) return;
    await setMission(b.dataset.mission);
  }));

  // Drag the slider to see the body later in the mission. Release near today to go back live.
  const range = $('#dayRange');
  let timer = null;
  range.addEventListener('input', () => {
    if (!live.online) return;
    const day = +range.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const liveDay = (live.state && live.state.day) || 0;
      setPreviewDay(day === liveDay ? null : day);
    }, 90);
  });
  range.addEventListener('dblclick', () => setPreviewDay(null));

  onData(type => {
    if (type !== 'state') return;
    renderMission();
    renderList();
  });

  // Drawer: the Today panel keeps the right side, so this panel slides in from
  // "Things to watch →". Closes on ✕, Escape, a click outside, or after picking a system.
  const panel = $('.risk-panel');
  const setOpen = on => panel.classList.toggle('open', on);
  $('#riskOpen').addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  $('#riskClose').addEventListener('click', () => setOpen(false));
  $('#riskList').addEventListener('click', e => { if (e.target.closest('.risk')) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  addEventListener('pointerdown', e => {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(e.target) || e.target.closest('#riskOpen')) return;
    setOpen(false);
  });
}
