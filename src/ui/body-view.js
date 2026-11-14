import { $, $$ } from '../util.js';
import { SYS } from '../data/mock.js';
import { setHoverOrgan } from '../three/api.js';
import { onData } from '../data/client.js';

const SPOT_SUFFIX = { sleep: ' h' };

/* Body view: the clickable spots over the 3D body. */

export function initBodyView() {
  $$('.spot').forEach(s => {
    if (SYS[s.dataset.sys].state === 'watch') s.classList.add('watch');
    if (['lungs', 'muscles'].includes(s.dataset.sys)) s.classList.add('l');
    s.addEventListener('pointerenter', () => setHoverOrgan(s.dataset.sys));
    s.addEventListener('pointerleave', () => setHoverOrgan(null));
  });
  onData((type, live) => {
    if (type === 'state') refresh(live);
  });
}

// Update spot numbers and the "things to watch" button from live data.
function refresh(live) {
  $$('.spot').forEach(s => {
    const k = s.dataset.sys;
    s.querySelector('em').textContent = SYS[k].value + (SPOT_SUFFIX[k] || '');
    s.classList.toggle('watch', SYS[k].state === 'watch');
  });
  const flagged = live.risks.filter(o => o.status !== 'OK');
  const btn = $('.status');
  let dot = '';
  if (flagged.length) dot = 'amber';
  btn.innerHTML = `<i class="dot ${dot}"></i>${flagged.length} things to watch <span>→</span>`;
  // Open the highest-ranked system that has a body region today (bones gets one with the Risk Board).
  const first = live.risks.find(o => SYS[o.id]);
  if (first) btn.dataset.sys = first.id;
}
