import { $$ } from '../util.js';
import { onData, organ } from '../data/client.js';
import { setHoverOrgan } from '../three/api.js';

/* The labelled spots over the 3D body. They stay clickable: the body and the risk panel
   are two ways into the same detail view (rules.md section 1.5). */

const SPOT_SUFFIX = { sleep: ' h' };
// Labels on these sit to the left of their dot, so the six spots never overlap each other.
const LEFT_LABEL = ['eyes', 'lungs', 'muscles'];

export function initBodyView() {
  $$('.spot').forEach(s => {
    s.classList.toggle('l', LEFT_LABEL.includes(s.dataset.sys));
    s.addEventListener('pointerenter', () => setHoverOrgan(s.dataset.sys));
    s.addEventListener('pointerleave', () => setHoverOrgan(null));
  });
  refresh();
  onData(type => {
    if (type === 'state') refresh();
  });
}

// Spot numbers and the amber ring come from the same data as the risk panel.
function refresh() {
  $$('.spot').forEach(s => {
    const o = organ(s.dataset.sys);
    s.querySelector('em').textContent = o.value + (SPOT_SUFFIX[s.dataset.sys] || '');
    s.classList.toggle('watch', o.level !== 'low');
  });
}
