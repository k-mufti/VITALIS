import { $, $$ } from '../util.js';
import { SYS } from '../data/mock.js';
import { twin } from './scene.js';
import { loadOrgan } from './organs.js';

/* Body panel on the left of the Body view. Replaces the buttons on the body.

   Tabs peel the body from the outside in: Body, Muscles, Bones, Organs. Picking a tab
   changes what the 3D body shows; the list holds what lives in that layer.
   Hover a row to find it on the body, click it to open it.

   Rows carry data-sys, so the Detail view's existing click handler opens them
   (initTwin runs before initDetail in main.js).
   TODO(backend): read values from src/data/client.js once it exists. */

export const LAYERS = [
  { id: 'skin',     label: 'Body' },
  { id: 'muscle',   label: 'Muscles' },
  { id: 'skeleton', label: 'Bones' },
  { id: 'organs',   label: 'Organs' },
];

// What lives in each layer, with a plain unit for its reading.
const PARTS = [
  { sys: 'heart',   name: 'Heart',   layer: 'organs',   unit: 'beats/min' },
  { sys: 'lungs',   name: 'Lungs',   layer: 'organs',   unit: 'breaths/min' },
  { sys: 'sleep',   name: 'Sleep',   layer: 'organs',   unit: 'h last night' },
  { sys: 'muscles', name: 'Muscles', layer: 'muscle',   unit: '% recovered' },
  { sys: null,      name: 'Bones',   layer: 'skeleton', soon: 'Coming soon' },
];
const STATUS_WORD = { watch: 'Watch', act: 'Act' };   // OK rows stay quiet

// Models each layer shows in the 3D body.
export const LAYER_MODELS = { muscle: ['muscles'], organs: ['heart', 'lungs'] };

function row(p) {
  if (!p.sys) {
    return `<div class="an-row soon"><i class="dot none"></i><span class="an-name">${p.name}</span><span class="an-val">${p.soon}</span></div>`;
  }
  const d = SYS[p.sys];
  const state = d.state || 'ok';
  const flag = STATUS_WORD[state] ? `<em class="an-flag ${state}">${STATUS_WORD[state]}</em>` : '';
  return `<button class="an-row" data-sys="${p.sys}">
    <i class="dot ${state}"></i>
    <span class="an-name">${p.name}${flag}</span>
    <span class="an-val">${d.value}<small>${p.unit}</small></span>
  </button>`;
}

// One list per layer, built once so the Detail view's click handlers stay attached.
function list(layer) {
  let parts = PARTS.filter(p => p.layer === layer);
  if (layer === 'skin') parts = PARTS.filter(p => p.sys);
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
  setLayer('skin');
}
