import { initSignin } from './signin.js';
import { initTwin, renderTwin } from './three/api.js';
import { initBodyView } from './ui/body-view.js';
import { initNav } from './nav.js';
import { initDetail, tickDetail } from './ui/detail.js';
import { initCrew } from './ui/crew.js';
import { initAsk } from './ui/ask.js';
import { initData } from './data/client.js';

/* VITALIS demo. Every reading here is made up.
   Boot + main loop only. Features live in src/three, src/ui and src/data. */

initSignin();
initTwin();
initBodyView();
initNav();
initDetail();
initCrew();
initAsk();
initData();

(function loop(now) {
  const pulse = tickDetail(now);
  renderTwin(now, pulse);
  requestAnimationFrame(loop);
})(performance.now());
