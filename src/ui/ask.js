import { $, $$ } from '../util.js';
import { heartHistory, sleepHistory } from '../data/mock.js';
import { live, api } from '../data/client.js';

/* Ask view: scripted answers for now. Will call POST /api/ask later (plan.md 5.5). */

function chart({ title, value, unit, chg, data, usual, min, max, forecast = [] }) {
  const n = data.length + forecast.length, W = 300, H = 70;
  const X = i => (i / (n - 1)) * W, Y = y => H - ((y - min) / (max - min)) * H;
  const line = data.map((y, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(y)}`).join('');
  const fc = forecast.length ? `M${X(data.length - 1)} ${Y(data.at(-1))}` + forecast.map((y, i) => `L${X(data.length + i)} ${Y(y)}`).join('') : '';
  return `<div class="chart"><h3>${title}</h3><b>${value}<small>${unit}</small></b>${chg ? `<span class="chg">${chg}</span>` : ''}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect class="band" x="0" width="${W}" y="${Y(usual[1])}" height="${Y(usual[0]) - Y(usual[1])}"/><path class="ln" d="${line}"/>${fc ? `<path class="fc" d="${fc}"/>` : ''}</svg>
    <div class="axis"><span>3 days ago</span><span>${forecast.length ? 'Now → +3 days' : 'Now'}</span></div><p class="usual">Shaded = usual for Reyes</p></div>`;
}

const hr = heartHistory;
const sl = sleepHistory;
const ANSWERS = [
  { re: /flag|why|03|reyes/i,
    a: `Two things changed over the last 3 days:<ul><li>Resting heart rate went up, from about 58 to 64.</li><li>Sleep went down, from about 7 hours to 6.2.</li></ul>Neither is alarming on its own. Together they’re worth a check-in with the crew doctor.`,
    src: 'NASA-STD-3001 Vol. 1 (crew health) · NASA Human Research Program, sleep loss risk',
    proof: () => chart({ title: 'Resting heart rate', value: 64, unit: 'bpm', chg: '+6', data: hr, usual: [54, 62], min: 52, max: 68 }) +
      chart({ title: 'Sleep', value: 6.2, unit: 'hours', chg: '−0.9', data: sl, usual: [7, 8], min: 5.8, max: 8.2 }) +
      `<div class="verdict"><h3>Suggestion</h3><b>Watch · not urgent</b></div>` },
  { re: /next|happen|forecast|future|will/i,
    a: `If nothing changes, resting heart rate could reach about 66 in 3 days.<br><br>Better sleep usually brings it back down within a few days. This is an estimate, not a diagnosis.`,
    src: 'Reyes’ own 30-day history (demo data)',
    proof: () => chart({ title: 'Resting heart rate · next 3 days', value: '~66', unit: 'bpm', data: hr, forecast: [65, 65, 66, 66], usual: [54, 62], min: 52, max: 68 }) +
      `<div class="verdict"><h3>Confidence</h3><b>Medium</b></div>` },
  { re: /report|summary|crew/i,
    a: `<b>Crew report · Day 184</b><ul><li>4 of 6 crew are in their normal range.</li><li>Reyes (03): heart rate up, sleep down.</li><li>Nakamura (05): sore lower back, resting.</li><li>Radiation is 339 of 600 mSv (56% of the career limit).</li><li>Cabin air and temperature are normal.</li></ul>`,
    src: 'All crew sensors · last 24 hours (demo data)',
    proof: () => `<div class="verdict"><h3>Crew</h3><b>4 OK · 2 watch</b></div><div class="verdict"><h3>Radiation</h3><b>339 / 600 mSv</b></div><div class="verdict"><h3>Ship</h3><b>All OK</b></div>` },
];

// Proof panel for live answers: the top 3 risks the officer looked at.
function liveProof() {
  return live.risks.slice(0, 3).map(o =>
    `<div class="verdict"><h3>${o.rank}. ${o.name}</h3><b>${o.status} · ${o.value} ${o.unit}</b></div>`).join('');
}

async function askLive(q, a, th) {
  let text = 'I could not reach the medical officer. Try again in a moment.';
  let src = '';
  try {
    const r = await api.ask(q);
    text = r.answer;
    src = r.sources.join(' · ');
  } catch (err) {
    console.error(err);
  }
  a.innerHTML = `<span class="who-tag">Vitalis</span><p>${text}</p>` + (src ? `<p class="src"><b>Sources</b>${src}</p>` : '');
  $('#proof').innerHTML = `<h3>What I looked at</h3>` + liveProof();
  th.scrollTop = th.scrollHeight;
}

export function ask(q, instant) {
  q = q.trim(); if (!q) return;
  const th = $('#thread');
  const qEl = document.createElement('div'); qEl.className = 'q'; qEl.textContent = q; th.append(qEl);
  const hit = ANSWERS.find(x => x.re.test(q));
  const a = document.createElement('div'); a.className = 'a'; a.innerHTML = `<span class="who-tag">Vitalis</span><span class="thinking"></span>`; th.append(a);
  th.scrollTop = th.scrollHeight;
  if (live.online) {
    askLive(q, a, th);
    return;
  }
  setTimeout(() => {
    a.innerHTML = `<span class="who-tag">Vitalis</span>` + (hit ? hit.a + `<p class="src"><b>Sources</b>${hit.src}</p>` : `I can only answer questions about this demo crew’s health. Try one of the questions below.`);
    if (hit) $('#proof').innerHTML = `<h3>What I looked at</h3>` + hit.proof();
    th.scrollTop = th.scrollHeight;
  }, instant ? 0 : 900);
}

export function initAsk() {
  $('#askForm').addEventListener('submit', e => { e.preventDefault(); ask($('#askInput').value); $('#askInput').value = ''; });
  $$('.chips button').forEach(b => b.addEventListener('click', () => ask(b.textContent)));
}
