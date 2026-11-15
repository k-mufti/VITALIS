import { $, $$ } from '../util.js';
import { showInjury, clearInjury } from '../three/api.js';
import { organ, commsDelayMin, missionInfo } from '../data/client.js';
import { BODY, GENERAL, COMMON, matchInjury } from './injury-library.js';

/* Injury drill. The judges name an injury; we pick where it is on a hidden panel and type
   the name. The body then zooms in step by step (area, part, spot), lights only that spot,
   and an alert tells the astronaut what to do. To the audience it looks like VITALIS caught it.

   Open the hidden panel with the ` key (top left of the keyboard).
   triggerInjury(pathIds, name) is the one entry point, so a second laptop can call it later.
   No AI yet: the name is matched against injury-library.js. */

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Path of nodes from ids, e.g. ['upper', 'l-arm', 'bicep'].
function nodes(ids) {
  const out = [];
  let level = BODY;
  for (const id of ids) {
    const n = level?.find(p => p.id === id);
    if (!n) break;
    out.push(n);
    level = n.parts;
  }
  return out;
}

/* ---------- hidden operator panel ---------- */

let picked = [];   // ids, general to specific

function drawPanel() {
  const path = nodes(picked);
  const level = path.length ? path[path.length - 1].parts : BODY;
  const crumbs = [`<button data-back="0">Body</button>`]
    .concat(path.map((n, i) => `<button data-back="${i + 1}">${esc(n.name)}</button>`)).join('<i>›</i>');
  const name = $('#injName')?.value || '';
  const match = path.length && name.trim() ? matchInjury(name, path) : null;
  let preview = 'Pick where, then type what';
  if (path.length && name.trim()) preview = match ? `Shows: ${match.title}` : 'Not in the list: shows general first steps';
  else if (path.length) preview = 'Type the injury the judges named';

  $('#injWhere').innerHTML = `
    <div class="inj-crumbs">${crumbs}</div>
    ${level ? `<div class="inj-parts">${level.map(p => `<button data-part="${p.id}">${esc(p.name)}${p.parts ? ' <i>›</i>' : ''}</button>`).join('')}</div>` : ''}`;
  $('#injPreview').textContent = preview;
  $('#injPreview').classList.toggle('miss', !!(path.length && name.trim() && !match));
  $('#injSend').disabled = !path.length || !name.trim();
}

function initPanel() {
  const panel = document.createElement('aside');
  panel.className = 'inj-op';
  panel.id = 'injOp';
  panel.hidden = true;
  panel.innerHTML = `
    <header><b>Injury drill</b><span>Only you see this · press \` to hide</span></header>
    <label>Common in space · click to fill</label>
    <div class="inj-common" id="injCommon">
      ${COMMON.map((c, i) => `<button data-common="${i}">${esc(c.label)}</button>`).join('')}
    </div>
    <label>1 · Where</label>
    <div id="injWhere"></div>
    <label for="injName">2 · What happened</label>
    <input id="injName" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. torn bicep" />
    <p class="inj-preview" id="injPreview"></p>
    <div class="inj-actions">
      <button class="inj-send" id="injSend">Send alert</button>
      <button class="inj-clear" id="injClear">Clear</button>
    </div>`;
  document.body.append(panel);

  $('#injWhere').addEventListener('click', e => {
    const back = e.target.closest('[data-back]');
    const part = e.target.closest('[data-part]');
    if (back) picked = picked.slice(0, +back.dataset.back);
    else if (part) picked = [...picked, part.dataset.part];
    else return;
    $$('#injCommon button').forEach(x => x.classList.remove('on'));
    drawPanel();
  });
  // A quick pick fills both steps; Send (or Enter) fires it.
  $('#injCommon').addEventListener('click', e => {
    const b = e.target.closest('[data-common]');
    if (!b) return;
    const c = COMMON[+b.dataset.common];
    picked = [...c.path];
    $('#injName').value = c.name;
    $$('#injCommon button').forEach(x => x.classList.toggle('on', x === b));
    drawPanel();
    $('#injSend').focus();
  });
  $('#injName').addEventListener('input', () => { $$('#injCommon button').forEach(x => x.classList.remove('on')); drawPanel(); });
  $('#injName').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#injSend').disabled) send(); });
  $('#injSend').addEventListener('click', send);
  $('#injClear').addEventListener('click', () => { closeAlert(); picked = []; $('#injName').value = ''; drawPanel(); });

  addEventListener('keydown', e => {
    if (e.key !== '`' && e.key !== '~') return;
    if (e.target.matches?.('input, textarea') && e.target.id !== 'injName') return;
    e.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { drawPanel(); $('#injName').focus(); }
  });
  drawPanel();
}

function send() {
  triggerInjury(picked, $('#injName').value.trim());
  $('#injOp').hidden = true;   // out of sight before the alert lands
}

/* ---------- the alert ---------- */

let runId = 0, clock = null, t0 = 0;

// Zoom in step by step, then show the alert. pathIds general to specific, name = what was typed.
export function triggerInjury(pathIds, name) {
  const path = nodes(pathIds);
  if (!path.length) return;
  const inj = matchInjury(name, path) || GENERAL;
  const model = typeof inj.model === 'function' ? inj.model(path) : inj.model;
  const run = ++runId;
  closeAlert(true);
  document.body.classList.add('injury-on');
  flash();
  // One camera step per level picked, about a second each, like a scan narrowing down.
  // The last step brings in the hurt bone, muscle or organ (if the injury has one) with the spot lit on it.
  const last = path.length - 1;
  path.forEach((n, i) => setTimeout(() => {
    if (run !== runId) return;
    // Bones sit under the skin: aim the glow a little inside so thin bones (forearm, shin) light up.
    // Arm parts know where they are on the skeleton itself (n.bone): use that, through the middle of the arm.
    let sink = {};
    if (model === 'bones') sink = n.bone ? { ...n.bone, z: 0, radius: Math.max(.13, n.spot.radius) } : { depth: Math.min(.08, n.spot.radius * .5) };
    showInjury(i === last ? { ...n.spot, ...sink, ...inj.glow } : n.spot, i === last ? model : null);
  }, i * 950));
  setTimeout(() => run === runId && openAlert(path, name, inj), path.length * 950 + 250);
}

function flash() {
  const f = document.createElement('div');
  f.className = 'inj-flash';
  document.body.append(f);
  f.addEventListener('animationend', () => f.remove());
}

// "Left arm · Bicep": the last two picks read best.
function placeName(path) {
  const names = path.map(n => n.name);
  if (names.length > 2) names.splice(0, names.length - 2);
  return names.join(' · ');
}

// A line from their own data: dose so far for radiation, bone loss for injuries a break could hide behind.
function bonesLine(inj) {
  if (inj.radiation) {
    const m = missionInfo();
    const dose = Math.round(m.radiation_msv), limit = Math.round(m.radiation_career_limit_msv);
    if (!dose || !limit) return '';
    return `<p class="inj-you"><b>Your data</b>You have taken ${dose} mSv this mission, ${Math.round(dose / limit * 100)}% of your career limit of ${limit} mSv.</p>`;
  }
  if (!inj.bones) return '';
  const b = organ('bones');
  if (!b || typeof b.value !== 'number' || !String(b.unit).includes('%') || b.value >= 100) return '';
  const lost = (100 - b.value).toFixed(1);
  const say = {
    fracture: `Your bones are ${lost}% thinner than at launch. Breaks happen more easily out here.`,
    kidney: `Your bones are ${lost}% thinner than at launch. That calcium passes through your kidneys, which is how stones form.`,
  }[inj.id] || `Your bones are ${lost}% thinner than at launch. Treat it as a possible break until it moves normally.`;
  return `<p class="inj-you"><b>Your data</b>${say}</p>`;
}

function openAlert(path, name, inj) {
  const title = inj.title || (name ? name[0].toUpperCase() + name.slice(1) : 'Injury');
  const delay = Math.round(commsDelayMin() || 0);
  const urgent = !!inj.urgent;
  t0 = performance.now();

  const box = document.createElement('section');
  box.className = 'inj-alert' + (urgent ? ' urgent' : '');
  box.id = 'injAlert';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-label', 'Injury alert');
  box.innerHTML = `
    <header class="inj-band">
      <span><i></i>Injury detected</span>
      <b id="injClock">0:00</b>
    </header>
    <div class="inj-main">
      <p class="inj-where">${esc(placeName(path))}</p>
      <h2>${esc(title)}</h2>
      <p class="inj-src">Picked up by suit motion sensors and heart rate</p>
      ${bonesLine(inj)}
      <h3>Do this now</h3>
      <ol class="inj-steps">
        ${inj.steps.map((s, i) => `<li><button data-step="${i}"><i>${i + 1}</i><span>${esc(s)}</span></button></li>`).join('')}
      </ol>
      <h3>Call ground now if</h3>
      <ul class="inj-help">${inj.help.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      <dl class="inj-facts">
        <div><dt>Medical kit</dt><dd>${esc(inj.kit)}</dd></div>
        <div><dt>In space</dt><dd>${esc(inj.space)}</dd></div>
        ${inj.limits ? `<div><dt>Until cleared</dt><dd>${esc(inj.limits)}</dd></div>` : ''}
      </dl>
    </div>
    <footer class="inj-foot">
      <button class="inj-ground" id="injGround">${urgent ? 'Call ground now' : 'Tell ground'}${delay ? `<small>Message takes ${delay} min to reach Earth</small>` : ''}</button>
      <button class="inj-say" id="injSay" aria-label="Read the steps out loud">Read aloud</button>
      <button class="inj-done" id="injDone">Treated</button>
    </footer>`;
  document.body.append(box);

  box.querySelector('.inj-steps').addEventListener('click', e => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    b.classList.toggle('done');
    const all = [...box.querySelectorAll('[data-step]')].every(s => s.classList.contains('done'));
    box.classList.toggle('all-done', all);
  });
  $('#injGround').addEventListener('click', e => {
    const b = e.currentTarget;
    b.classList.add('sent');
    b.innerHTML = `Sent to ground${delay ? `<small>Reply in about ${delay * 2} min</small>` : ''}`;
  });
  $('#injSay').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const text = [`${title}. ${placeName(path)}.`, ...inj.steps.map((s, i) => `Step ${i + 1}. ${s}`)].join(' ');
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  });
  $('#injDone').addEventListener('click', () => closeAlert());

  clock = setInterval(() => {
    const s = Math.floor((performance.now() - t0) / 1000);
    const c = $('#injClock');
    if (c) c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}

// keep3d = a new alert is about to replace this one, so leave the camera where it is.
function closeAlert(keep3d) {
  clearInterval(clock);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const box = $('#injAlert');
  if (box) { box.classList.add('out'); setTimeout(() => box.remove(), 300); box.id = ''; }
  if (keep3d) return;
  runId++;   // stop a zoom that is still on its way
  document.body.classList.remove('injury-on');
  clearInjury();
}

export function initInjury() {
  initPanel();
}
