import { $, $$ } from '../util.js';
import { twin } from './scene.js';
import { loadOrgan } from './organs.js';

/* Body panel on the left of the Body view. Replaces the buttons on the body.

   Tabs peel the body from the outside in: Body, Muscles, Bones, Organs. Picking a tab
   changes what the 3D body shows; the grid shows a picture of each part in that layer
   with its name. Hover a picture to find it on the body, click it to open it.

   Pictures are rendered from the 3D models (assets/thumbs/). Tiles carry data-sys, so the
   Detail view's existing click handler opens them (initTwin runs before initDetail in main.js). */

export const LAYERS = [
  { id: 'skin',     label: 'Body' },
  { id: 'muscle',   label: 'Muscles' },
  { id: 'skeleton', label: 'Bones' },
  { id: 'organs',   label: 'Organs' },
];

// What lives in each layer, head to toe.
const PARTS = [
  { sys: 'eyes',    name: 'Eyes',    layer: 'organs' },
  { sys: 'ears',    name: 'Inner ear', layer: 'organs', noData: true },   // TODO(backend): balance data
  { sys: 'sleep',   name: 'Brain',   layer: 'organs' },
  { sys: 'heart',   name: 'Heart',   layer: 'organs' },
  { sys: 'lungs',   name: 'Lungs',   layer: 'organs' },
  { sys: 'digestion', name: 'Digestion', layer: 'organs', noData: true },   // TODO(backend): digestion data
  { sys: 'kidneys', name: 'Kidneys', layer: 'organs', noData: true },     // TODO(backend): kidney data
  { sys: 'muscles', name: 'Muscles', layer: 'muscle' },
  { sys: 'bones',   name: 'Bones',   layer: 'skeleton' },
];

// Models each layer shows in the 3D body.
export const LAYER_MODELS = { muscle: ['muscles'], skeleton: ['bones'], organs: ['eyes', 'ears', 'sleep', 'heart', 'lungs', 'digestion', 'kidneys'] };

function tile(p) {
  // Parts without data yet (inner ear, digestion, kidneys) have no detail view: clicking zooms the body to them.
  if (p.noData) {
    return `<div class="an-tile no-data" data-part="${p.sys}" tabindex="0">
    <img src="assets/thumbs/${p.sys}.webp" alt="" loading="lazy" />
    <span>${p.name}</span><small>No data yet</small>
  </div>`;
  }
  return `<button class="an-tile" data-sys="${p.sys}" data-part="${p.sys}">
    <img src="assets/thumbs/${p.sys}.webp" alt="" loading="lazy" />
    <span>${p.name}</span>
  </button>`;
}

// One grid per layer, built once so the Detail view's click handlers stay attached.
function grid(layer) {
  let parts = PARTS.filter(p => p.layer === layer);
  if (layer === 'skin') parts = PARTS;
  return `<div class="an-grid" data-layer="${layer}">${parts.map(tile).join('')}</div>`;
}

// Zoom on a part without data (no detail view). Click again, Esc or another tab zooms back out.
let zoomed = null, focusFn = null, resetFn = null;
function zoomOut() {
  if (!zoomed) return;
  zoomed = null;
  $$('.an-tile.no-data').forEach(t => t.classList.remove('on'));
  resetFn?.();
}
function zoomTo(tile) {
  const k = tile.dataset.part;
  if (zoomed === k) { zoomOut(); return; }
  zoomed = k;
  $$('.an-tile.no-data').forEach(t => t.classList.toggle('on', t === tile));
  focusFn?.(k);
}

export function setLayer(id) {
  zoomOut();
  twin.layer = id;
  $$('.an-tab').forEach(t => {
    const on = t.dataset.layer === id;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  });
  $$('.an-grid').forEach(g => g.classList.toggle('on', g.dataset.layer === id));
  (LAYER_MODELS[id] || []).forEach(k => loadOrgan(k));
}

export function initAnatomyPanel(setHover, focus, reset) {
  focusFn = focus;
  resetFn = reset;
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
    ${LAYERS.map(l => grid(l.id)).join('')}`;
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
  $$('.an-tile').forEach(t => {
    t.addEventListener('pointerenter', () => setHover(t.dataset.part));
    t.addEventListener('pointerleave', () => setHover(null));
    t.addEventListener('focus', () => setHover(t.dataset.part));
    t.addEventListener('blur', () => setHover(null));
  });
  $$('.an-tile.no-data').forEach(t => {
    t.addEventListener('click', () => zoomTo(t));
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomTo(t); } });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') zoomOut(); });
  setLayer('skin');
}
