import { $, $$ } from '../util.js';
import { live, api, onData, setMission, setPreviewDay, refreshState, missionInfo } from '../data/client.js';

/* Director panel, key D. Demo controls only: swap the mission, scrub the mission day, and
   throw events at the crew. A real crew member never sees this, which is why the mission
   picker lives here and not in the app itself. Needs the backend. */

const MISSIONS = [['mars', 'Mars'], ['moon', 'Moon'], ['iss', 'ISS']];
const EVENTS = [
  ['radiation_storm', 'Solar particle event (real NASA DONKI storm)'],
  ['bad_sleep_week', 'Bad sleep week'],
  ['skipped_exercise', 'Skipped exercise'],
  ['bp_spike', 'Blood pressure spike'],
  ['cabin_co2', 'Cabin CO2 rise (ship air)'],
  ['cabin_leak', 'Cabin pressure leak (less oxygen)'],
  ['noisy_module', 'Noisy module (failing fan)'],
  ['slow_heart', 'Heart rate very slow'],
  ['irregular_rhythm', 'Irregular heart rhythm (AF)'],
  ['cardiac_arrest', 'Cardiac arrest'],
  ['bp_crash', 'Blood pressure crash'],
  ['cabin_overpressure', 'Cabin pressure too high'],
  ['fire_smoke', 'Smoke / fire'],
  ['o2_high', 'Cabin oxygen too high'],
  ['cabin_hot', 'Cabin too hot'],
  ['reset', 'Reset the crew member'],
];

function markup() {
  const missions = MISSIONS.map(([id, label]) => `<button data-mission="${id}">${label}</button>`).join('');
  const events = EVENTS.map(([id, label]) => `<button data-event="${id}">${label}</button>`).join('');
  return `<h3>Director <small>D to hide</small></h3>
    <span class="d-label">Mission</span>
    <div class="d-row" id="dMissions">${missions}</div>
    <span class="d-label">Mission day</span>
    <input type="range" id="dDay" min="0" max="740" step="1" value="184" aria-label="Mission day" />
    <em class="d-day" id="dDayLabel">Day 184</em>
    <span class="d-label">Throw an event</span>
    <div class="d-events">${events}</div>
    <p class="d-note" id="dirNote"></p>`;
}

function refresh() {
  const m = missionInfo();
  $$('#dMissions button').forEach(b => b.classList.toggle('on', b.dataset.mission === m.mission));
  const range = $('#dDay');
  range.max = m.end_day || 740;
  if (live.previewDay === null) range.value = m.day;
  const label = $('#dDayLabel');
  label.textContent = `Day ${m.day} · ${m.phase || 'cruise'}`;
  label.classList.toggle('preview', live.previewDay !== null);
  if (live.previewDay !== null) label.textContent += ' · preview';
}

export function initDirector() {
  const panel = document.createElement('div');
  panel.className = 'director';
  panel.id = 'director';
  panel.innerHTML = markup();
  document.body.append(panel);

  const note = msg => { $('#dirNote').textContent = msg; };

  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.key === 'd' || e.key === 'D') && !typing && !e.metaKey && !e.ctrlKey) {
      panel.classList.toggle('on');
      if (panel.classList.contains('on')) refresh();
    }
  });

  $$('#dMissions button').forEach(b => b.addEventListener('click', async () => {
    if (!live.online) return note('Start the backend to switch missions.');
    await setMission(b.dataset.mission);
    note('');
  }));

  // Scrub forward to see the body later in the mission. Double-click to go back to today.
  let timer = null;
  const range = $('#dDay');
  range.addEventListener('input', () => {
    if (!live.online) return note('Start the backend to scrub the mission.');
    const day = +range.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const today = (live.state && live.state.day) || 0;
      setPreviewDay(day === today ? null : day);
    }, 90);
  });
  range.addEventListener('dblclick', () => setPreviewDay(null));

  $$('#director [data-event]').forEach(b => b.addEventListener('click', async () => {
    if (!live.online) return note('Start the backend to throw events.');
    try {
      const r = await api.director(b.dataset.event);
      // Events act on today, so leave any scrubbed preview day and pull the new state now.
      if (live.previewDay !== null) await setPreviewDay(null);
      else await refreshState();
      if (b.dataset.event === 'reset') note('Crew member reset to baseline.');
      else if (r.storm) note(`Replaying real storm ${r.storm.sepID}`);
      else note(`Done: ${b.dataset.event.replace(/_/g, ' ')}`);
    } catch (err) {
      note('That event failed. Check the backend.');
    }
  }));

  // Keep the mission buttons and day label in step with the live state (reset, mission swaps).
  onData(type => {
    if (type === 'state' && panel.classList.contains('on')) refresh();
  });
  refresh();
}
