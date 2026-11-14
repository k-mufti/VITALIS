import { $, $$ } from '../util.js';
import { SYS } from '../data/mock.js';
import { twin } from './scene.js';
import { loadOrgan } from './organs.js';

/* Anatomy panel on the left of the Body view. Replaces the buttons on the body.

   Tabs are layers of the body, from the outside in. Picking a tab changes what the
   3D body shows; the list below holds that layer's parts, grouped by body region.
   Hover a row to find it on the body, click it to open the system.

   Rows carry data-sys, so the Detail view's existing click handler opens them
   (initTwin runs before initDetail in main.js).
   TODO(backend): read values from src/data/client.js once it exists. */

export const LAYERS = [
  { id: 'skin',     label: 'Skin',     note: 'Everything we track, seen from the outside.' },
  { id: 'muscle',   label: 'Muscle',   note: 'Muscles under the skin.' },
  { id: 'skeleton', label: 'Skeleton', note: 'Bones and joints.' },
  { id: 'organs',   label: 'Organs',   note: 'Organs, seen through the body.' },
];

// Which layer each part lives in, and where on the body.
const PARTS = [
  { sys: 'sleep',   name: 'Brain · sleep', layer: 'organs',   region: 'Head',  unit: 'h' },
  { sys: 'heart',   name: 'Heart',         layer: 'organs',   region: 'Chest', unit: 'bpm' },
  { sys: 'lungs',   name: 'Lungs',         layer: 'organs',   region: 'Chest', unit: '/min' },
  { sys: 'muscles', name: 'Muscles',       layer: 'muscle',   region: 'Legs',  unit: '/100' },
  { sys: null,      name: 'Bones',         layer: 'skeleton', region: 'Whole body', soon: 'Model coming' },
];
const REGION_ORDER = ['Head', 'Chest', 'Legs', 'Whole body'];

// Models each layer shows in the 3D body.
export const LAYER_MODELS = { muscle: ['muscles'], organs: ['heart', 'lungs'] };

function row(p, showLayer) {
  if (!p.sys) {
    return `<div class="an-row soon"><i class="an-dot"></i><span class="an-name">${p.name}</span><span class="an-val">${p.soon}</span></div>`;
  }
  const d = SYS[p.sys];
  let status = 'OK';
  if (d.state === 'watch') status = 'Watch';
  const tag = showLayer ? `<small class="an-tag">${LAYERS.find(l => l.id === p.layer).label}</small>` : '';
  return `<button class="an-row ${d.state}" data-sys="${p.sys}">
    <i class="an-dot"></i>
    <span class="an-name">${p.name}${tag}</span>
    <span class="an-val">${d.value}<small>${p.unit}</small></span>
    <span class="an-status">${status}</span>
  </button>`;
}

// One list per layer, built once so the Detail view's click handlers stay attached.
function list(layer) {
  const parts = layer === 'skin' ? PARTS.filter(p => p.sys) : PARTS.filter(p => p.layer === layer);
  const groups = REGION_ORDER.filter(r => parts.some(p => p.region === r));
  return `<div class="an-list" data-layer="${layer}">
    ${groups.map(r => `<div class="an-group"><h4>${r}</h4>${parts.filter(p => p.region === r).map(p => row(p, layer === 'skin')).join('')}</div>`).join('')}
  </div>`;
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
  $('#anatomy').style.setProperty('--depth', LAYERS.findIndex(l => l.id === id));
  $('#anNote').textContent = LAYERS.find(l => l.id === id).note;
  (LAYER_MODELS[id] || []).forEach(k => loadOrgan(k));
}

export function initAnatomyPanel(setHover) {
  const view = $('#view-body');
  if (!view) return;
  const panel = document.createElement('aside');
  panel.className = 'anatomy';
  panel.id = 'anatomy';
  panel.setAttribute('aria-label', 'Anatomy');
  panel.innerHTML = `
    <p class="an-title">Anatomy</p>
    <div class="an-tabs" role="tablist" aria-label="Body layers">
      ${LAYERS.map((l, i) => `<button class="an-tab" role="tab" data-layer="${l.id}"><span>0${i + 1}</span>${l.label}</button>`).join('')}
    </div>
    <div class="an-depth"><i></i></div>
    <p class="an-note" id="anNote"></p>
    ${LAYERS.map(l => list(l.id)).join('')}
    <p class="an-hint">Hover to find · click to open</p>`;
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
