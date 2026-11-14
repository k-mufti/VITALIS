import { $, $$ } from '../util.js';
import { organ, onData } from '../data/client.js';
import { twin } from './scene.js';
import { loadOrgan } from './organs.js';

/* Body panel on the left of the Body view. Replaces the buttons on the body.

   Tabs peel the body from the outside in: Body, Muscles, Bones, Organs. Picking a tab
   changes what the 3D body shows; the list holds what lives in that layer.
   Hover a row to find it on the body, click it to open it.

   Rows run head to toe (the risk drawer is where systems are ranked). Values and
   Low / Mild / Extreme come from the same organ data as the risk drawer (src/data/client.js).
   Rows carry data-sys, so the Detail view's existing click handler opens them
   (initTwin runs before initDetail in main.js). */

export const LAYERS = [
  { id: 'skin',     label: 'Body' },
  { id: 'muscle',   label: 'Muscles' },
  { id: 'skeleton', label: 'Bones' },
  { id: 'organs',   label: 'Organs' },
];

// What lives in each layer, head to toe, with a plain unit for its reading.
const PARTS = [
  { sys: 'eyes',    name: 'Eyes',    layer: 'organs',   unit: 'mm nerve width' },
  { sys: 'sleep',   name: 'Sleep',   layer: 'organs',   unit: 'h last night' },
  { sys: 'heart',   name: 'Heart',   layer: 'organs',   unit: 'beats/min' },
  { sys: 'lungs',   name: 'Lungs',   layer: 'organs',   unit: 'breaths/min' },
  { sys: 'muscles', name: 'Muscles', layer: 'muscle',   unit: '% recovered' },
  { sys: 'bones',   name: 'Bones',   layer: 'skeleton', unit: '% density' },
];
// Severity word and dot color, same scale as the risk drawer. Low rows stay quiet.
const LEVEL_WORD = { mild: 'Mild', extreme: 'Extreme' };
const LEVEL_DOT = { low: 'ok', mild: 'watch', extreme: 'act' };

// Models each layer shows in the 3D body.
export const LAYER_MODELS = { muscle: ['muscles'], skeleton: ['bones'], organs: ['heart', 'lungs'] };

function row(p) {
  return `<button class="an-row" data-sys="${p.sys}">
    <i class="dot"></i>
    <span class="an-name">${p.name}<em class="an-flag"></em></span>
    <span class="an-val"><b></b><small>${p.unit}</small></span>
  </button>`;
}

// Fill in values and severity from the organ data (called again whenever new data arrives).
function refresh() {
  $$('.an-row[data-sys]').forEach(r => {
    const o = organ(r.dataset.sys);
    const level = o.level || 'low';
    r.querySelector('.dot').className = 'dot ' + (LEVEL_DOT[level] || 'ok');
    const flag = r.querySelector('.an-flag');
    flag.textContent = LEVEL_WORD[level] || '';
    flag.className = 'an-flag ' + level;
    r.querySelector('.an-val b').textContent = o.value ?? '—';
  });
}

// One list per layer, built once so the Detail view's click handlers stay attached.
function list(layer) {
  let parts = PARTS.filter(p => p.layer === layer);
  if (layer === 'skin') parts = PARTS;
  return `<div class="an-list" data-layer="${layer}">${parts.map(row).join('')}</div>`;
}

export function setLayer(id) {
  twin.layer = id;
  $$('.an-tab').forEach(t => {
    const on = t.dataset.layer === id;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  });
  $$('.an-list').forEach(l => l.classList.toggle('on', l.dataset.layer === id));
  (LAYER_MODELS[id] || []).forEach(k => loadOrgan(k));
}

export function initAnatomyPanel(setHover) {
  const view = $('#view-body');
  if (!view) return;
  const panel = document.createElement('aside');
  panel.className = 'anatomy';
  panel.id = 'anatomy';
  panel.setAttribute('aria-label', 'Your body');
  panel.innerHTML = `
    <h3 class="t-label">Your body</h3>
    <div class="an-tabs" role="tablist" aria-label="Body layers">
      ${LAYERS.map(l => `<button class="an-tab" role="tab" data-layer="${l.id}">${l.label}</button>`).join('')}
    </div>
    ${LAYERS.map(l => list(l.id)).join('')}`;
  view.prepend(panel);

  const tabs = $$('.an-tab');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setLayer(t.dataset.layer));
    t.addEventListener('keydown', e => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (next) { e.preventDefault(); next.focus(); setLayer(next.dataset.layer); }
    });
  });
  $$('.an-row[data-sys]').forEach(r => {
    r.addEventListener('pointerenter', () => setHover(r.dataset.sys));
    r.addEventListener('pointerleave', () => setHover(null));
    r.addEventListener('focus', () => setHover(r.dataset.sys));
    r.addEventListener('blur', () => setHover(null));
  });
  refresh();
  onData(type => { if (type === 'state') refresh(); });
  setLayer('skin');
}
