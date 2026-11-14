import { $ } from '../util.js';
import { onData, rankedOrgans, missionInfo } from '../data/client.js';
import { showRisks } from '../three/api.js';

/* Mission line (day, phase) for the Body view, and organ severities for the 3D hotspots.
   The right rail's readings are drawn by health-panel.js. */

const PHASE_WORD = { cruise: 'transit', surface: 'surface' };

// Organ severities drive the 3D twin's hotspots. The readings themselves are in the
// "Your health" panel (health-panel.js), which replaced the list of risk cards.
function renderList() {
  showRisks(rankedOrgans().map(o => ({ id: o.id, severity: o.severity || 0 })));
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
