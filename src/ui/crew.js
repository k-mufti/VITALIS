import { $, $$ } from '../util.js';
import { CREW } from '../data/mock.js';
import { onData, missionInfo } from '../data/client.js';

/* Crew view: trip progress and crew members. */

const FIGURE = '<path d="M26 2a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M14 23h24c5 0 8 4 8 9v23h-6v35h-9V58h-2v32h-9V55H6V32c0-5 3-9 8-9Z"/>';
const STOP_POS = [0, 50, 76, 100];

export function initCrew() {
  $('#people').innerHTML = CREW.map((c, i) =>
    `<button class="person" data-i="${i}"><svg viewBox="0 0 52 92" style="height:${86 + (i % 3) * 4}px">${FIGURE}</svg><b><i class="dot ${c.watch ? 'amber' : ''}"></i>${c.n}</b><small>${c.role} · ${c.id}</small></button>`).join('');
  $$('.person').forEach(p => p.addEventListener('click', () => {
    $$('.person').forEach(x => x.classList.toggle('on', x === p));
    $('#personNote').textContent = CREW[+p.dataset.i].note;
  }));
  $$('#stops button').forEach((b, i) => b.addEventListener('click', () => {
    $$('#stops button').forEach(x => x.classList.toggle('on', x === b));
    $('.ship').style.left = STOP_POS[i] + '%';
    $('.track .done').style.width = STOP_POS[i] + '%';
    $('#tripNote').textContent = b.dataset.note;
  }));
  showRadiation();
  onData(type => {
    if (type === 'state') showRadiation();
  });
}

// Radiation so far vs the NASA-STD-3001 career limit (600 mSv).
function showRadiation() {
  const m = missionInfo();
  const fact = $('.facts .fact');
  const pct = Math.min(100, Math.round(100 * m.radiation_msv / m.radiation_career_limit_msv));
  fact.querySelector('b').innerHTML = `${Math.round(m.radiation_msv)} <small>of ${m.radiation_career_limit_msv} mSv</small>`;
  fact.querySelector('.meter i').style.width = pct + '%';
}
