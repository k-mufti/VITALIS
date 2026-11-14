import { $$ } from '../util.js';
import { SYS } from '../data/mock.js';
import { setHoverOrgan } from '../three/api.js';

/* Body view: the clickable spots over the 3D body. */

export function initBodyView() {
  $$('.spot').forEach(s => {
    if (SYS[s.dataset.sys].state === 'watch') s.classList.add('watch');
    if (['lungs', 'muscles'].includes(s.dataset.sys)) s.classList.add('l');
    s.addEventListener('pointerenter', () => setHoverOrgan(s.dataset.sys));
    s.addEventListener('pointerleave', () => setHoverOrgan(null));
  });
}
