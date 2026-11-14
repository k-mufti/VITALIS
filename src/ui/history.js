import { $ } from '../util.js';
import { api, live, missionInfo } from '../data/client.js';

/* Medical history drawer: this crew member's mission record so far.
   Live from GET /api/history, with a short offline version when the backend is off. */

const KIND_LABEL = { milestone: 'Mission', checkup: 'Check', event: 'Event', countermeasure: 'Action', alert: 'Earth' };

function offline() {
  const m = missionInfo();
  return {
    crew_id: '03', mission_name: m.mission_name, day: m.day, date: m.date || '',
    summary: {
      days_in_space: m.day, microgravity_months: 6.04,
      radiation_msv: m.radiation_msv, radiation_pct_of_career_limit: 56.4,
      radiation_career_limit_msv: m.radiation_career_limit_msv, flagged_systems: [],
    },
    baselines: { preflight_bone_density_pct: 100, usual_resting_heart_rate: 58, usual_sleep_hours: 7.4, preflight_onsd_mm: 4.6 },
    entries: [{ day: 0, date: '', kind: 'milestone', title: 'Launch', detail: 'Start the backend to load the full record.' }],
  };
}

function tile(label, value, small) {
  let sub = '';
  if (small) sub = `<small>${small}</small>`;
  return `<div><span>${label}</span><b>${value}</b>${sub}</div>`;
}

function render(h) {
  const s = h.summary;
  $('#histWho').textContent = `Crew ${h.crew_id} · ${h.mission_name} · day ${h.day}`;
  let flagged = 'None';
  if (s.flagged_systems.length) flagged = s.flagged_systems.join(', ');
  $('#histSum').innerHTML =
    tile('Days in space', s.days_in_space) +
    tile('Months weightless', s.microgravity_months) +
    tile('Radiation so far', s.radiation_msv, `of ${s.radiation_career_limit_msv} mSv career limit (${s.radiation_pct_of_career_limit}%)`) +
    tile('Systems flagged', s.flagged_systems.length, flagged);

  $('#histTimeline').innerHTML = h.entries.map(e => {
    let detail = '';
    if (e.detail) detail = `<p>${e.detail}</p>`;
    return `<div class="tl ${e.kind}">
      <div class="when">Day ${e.day}<small>${e.date}</small></div>
      <div><i>${KIND_LABEL[e.kind] || e.kind}</i><b>${e.title}</b>${detail}</div>
    </div>`;
  }).join('');

  const b = h.baselines;
  $('#histBase').innerHTML =
    tile('Bone density', b.preflight_bone_density_pct + '%', 'preflight') +
    tile('Resting heart rate', b.usual_resting_heart_rate, 'usual for this crew member') +
    tile('Sleep', b.usual_sleep_hours + ' h', 'usual for this crew member') +
    tile('Optic nerve sheath', b.preflight_onsd_mm + ' mm', 'preflight');
}

async function open() {
  $('#history').classList.add('on');
  let data = offline();
  if (live.online) {
    try {
      data = await api.history();
    } catch (err) {
      console.error(err);
    }
  }
  render(data);
}

function close() {
  $('#history').classList.remove('on');
}

export function initHistory() {
  $('#historyBtn').addEventListener('click', open);
  $('#historyClose').addEventListener('click', close);
  $('#historyScrim').addEventListener('click', close);
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#history').classList.contains('on')) close();
  });
}
