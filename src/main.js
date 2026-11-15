import { initSignin } from './signin.js';
import { initTwin, renderTwin } from './three/api.js';
import { initBodyView } from './ui/body-view.js';
import { initNav } from './nav.js';
import { initDetail, tickDetail } from './ui/detail.js';
import { initToday } from './ui/today.js';
import { initCheckin } from './ui/checkin.js';
import { initRiskBoard } from './ui/risk-board.js';
import { initHealthPanel } from './ui/health-panel.js';
import { initHistory } from './ui/history.js';
import { initDirector } from './ui/director.js';
import { initSources } from './ui/sources.js';
import { initRadiation } from './ui/radiation.js';
import { initVitaly } from './ui/vitaly.js';
import { initInjury } from './ui/injury.js';
import { initCollect } from './ui/collect.js';
import { initFitbit } from './ui/fitbit.js';
import { initData } from './data/client.js';

/* VITALIS demo. Crew readings are simulated; mission data is live from NASA/JPL/NOAA.
   Boot + main loop only. Features live in src/three, src/ui and src/data. */

initSignin();
initTwin();
initBodyView();
initNav();
initDetail();
initToday();
initCheckin();
initRiskBoard();
initHealthPanel();
initHistory();
initDirector();
initSources();
initRadiation();
initVitaly();
initInjury();
initCollect();
initFitbit();
initData();

(function loop(now) {
  const pulse = tickDetail(now);
  renderTwin(now, pulse);
  requestAnimationFrame(loop);
})(performance.now());
