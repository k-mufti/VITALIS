import { uni, framing, applyFraming, setAuraVisible } from './body.js';
import { renderer, backdrop, twin } from './scene.js';
import { STYLES } from './effects.js';

/*
  FX dev panel for trying looks. Toggle with the ` (backtick) key.
  Settings are saved in this browser only. "Copy settings" puts them on the
  clipboard so they can be made the defaults in code.
*/

const DEFAULTS = {
  style: 0, dot: 6, edge: .55, shade: .2, backdrop: .5,
  aura: 0, auraSize: .06, size: 1.4, lift: .08, autoTurn: false,
  outWidth: .45, outSoft: .2, outColor: 0, outFill: 0, outShade: 0, outDots: 0,
};
const LINE_COLORS = [['Ink', '#0e0e0e'], ['Cyan', '#0aa5bd'], ['Gray', '#8a8a85'], ['White', '#f5f5f2']];
const OUTLINE = 3;  // index of Outline in STYLES
const STORE_KEY = 'vitalis-fx';

// Sliders: [key, label, min, max, step, only for these style indexes (optional)]
const SLIDERS = [
  ['size', 'Model size', .7, 2.2, .01],
  ['lift', 'Model height', -.2, .3, .01],
  ['dot', 'Dot size', 3, 16, 1, [0, OUTLINE]],
  ['edge', 'Edge dots', 0, 1, .01, 0],
  ['shade', 'Shading dots', 0, 1, .01, 0],
  ['outWidth', 'Line width', .05, 1, .01, OUTLINE],
  ['outSoft', 'Line softness', 0, 1, .01, OUTLINE],
  ['outFill', 'Body tone', 0, 1, .01, OUTLINE],
  ['outShade', 'Body shading', 0, 1, .01, OUTLINE],
  ['outDots', 'Shadow dots', 0, 1, .01, OUTLINE],
  ['backdrop', 'Background dots', 0, 1, .01],
  ['aura', 'Aura', 0, 1, .01],
  ['auraSize', 'Aura size', .01, .25, .005],
];

let fx = load();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(fx)); } catch {}
}

function apply() {
  uni.uStyle.value = fx.style;
  uni.uCell.value = fx.dot * renderer.getPixelRatio();
  uni.uEdge.value = fx.edge;
  uni.uShade.value = fx.shade;
  uni.uAura.value = fx.aura;
  uni.uAuraSize.value = fx.auraSize;
  uni.uOutWidth.value = fx.outWidth;
  uni.uOutSoft.value = fx.outSoft;
  uni.uOutColor.value.set(LINE_COLORS[fx.outColor][1]);
  uni.uOutFill.value = fx.outFill;
  uni.uOutShade.value = fx.outShade;
  uni.uOutDots.value = fx.outDots;
  setAuraVisible(fx.aura > 0);
  backdrop.setStrength(fx.backdrop);
  framing.size = fx.size;
  framing.lift = fx.lift;
  applyFraming();
  twin.autoTurn = fx.autoTurn;
}

const CSS = `
#fxPanel { position: fixed; z-index: 40; top: 80px; right: 16px; width: 260px; background: #fff; border: 1px solid #e1e1dc;
  font: 500 13px 'Barlow', sans-serif; color: #0e0e0e; padding: 14px 16px 16px; user-select: none; }
#fxPanel.off { display: none; }
#fxPanel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
#fxPanel h4 { font: 700 13px 'Barlow Condensed', sans-serif; letter-spacing: .2em; }
#fxPanel h4 small { font-weight: 500; color: #8a8a85; letter-spacing: .1em; margin-left: 6px; }
#fxPanel .x { font-size: 18px; line-height: 1; color: #8a8a85; }
#fxPanel .styles { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 14px; }
#fxPanel .styles button { font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase;
  padding: 7px 0; border: 1px solid #e1e1dc; }
#fxPanel .styles button.on { background: #0e0e0e; color: #fff; border-color: #0e0e0e; }
#fxPanel label { display: block; margin-bottom: 10px; }
#fxPanel label.hide { display: none; }
#fxPanel label span { display: flex; justify-content: space-between; font: 600 11px 'Barlow Condensed', sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; margin-bottom: 2px; }
#fxPanel label b { color: #0e0e0e; font-variant-numeric: tabular-nums; }
#fxPanel input[type=range] { width: 100%; accent-color: #0aa5bd; }
#fxPanel .check { display: flex; align-items: center; gap: 8px; font: 600 11px 'Barlow Condensed', sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; }
#fxPanel .row { display: flex; gap: 6px; margin-top: 12px; }
#fxPanel .row button { flex: 1; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase;
  padding: 7px 0; border: 1px solid #0e0e0e; }
#fxPanel .row button:hover { background: #0e0e0e; color: #fff; }
#fxPanel .sub { display: block; font: 600 11px 'Barlow Condensed', sans-serif; letter-spacing: .16em; text-transform: uppercase;
  color: #8a8a85; margin: 4px 0 4px; }
#fxPanel .colors button { display: flex; align-items: center; justify-content: center; gap: 6px; }
#fxPanel .colors i { width: 10px; height: 10px; border: 1px solid #c4c4be; }
#fxToggle { position: fixed; z-index: 40; top: 80px; right: 16px; font: 700 12px 'Barlow Condensed', sans-serif;
  letter-spacing: .2em; padding: 6px 10px; border: 1px solid #0e0e0e; background: #fff; }
#fxToggle.off { display: none; }
`;

function render(panel) {
  panel.innerHTML = `
    <header><h4>FX <small>\` to hide</small></h4><button class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="styles">${STYLES.map((n, i) => `<button data-style="${i}" class="${fx.style === i ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${SLIDERS.map(([k, label, min, max, step, only]) => `
      <label class="${only !== undefined && ![].concat(only).includes(fx.style) ? 'hide' : ''}">
        <span>${label}<b data-out="${k}">${fx[k]}</b></span>
        <input type="range" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${fx[k]}">
      </label>`).join('')}
    ${fx.style === OUTLINE ? `<span class="sub">Line color</span><div class="styles colors">${LINE_COLORS.map(([n, c], i) =>
      `<button data-outcolor="${i}" class="${fx.outColor === i ? 'on' : ''}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>` : ''}
    <label class="check"><input type="checkbox" data-key="autoTurn" ${fx.autoTurn ? 'checked' : ''}> Auto turn</label>
    <div class="row"><button data-act="reset">Reset</button><button data-act="copy">Copy settings</button></div>`;
}

export function initDevPanel() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const panel = document.createElement('div');
  panel.id = 'fxPanel';
  const toggle = document.createElement('button');
  toggle.id = 'fxToggle';
  toggle.textContent = 'FX';
  toggle.className = 'off';
  document.body.append(panel, toggle);
  render(panel);
  apply();

  const show = on => {
    panel.classList.toggle('off', !on);
    toggle.classList.toggle('off', on);
  };
  toggle.addEventListener('click', () => show(true));
  addEventListener('keydown', e => {
    const typing = (e.target.tagName === 'INPUT' && e.target.type === 'text') || e.target.tagName === 'TEXTAREA';
    if (e.key === '`' && !typing) show(panel.classList.contains('off'));
  });

  panel.addEventListener('input', e => {
    const k = e.target.dataset.key;
    if (!k) return;
    if (e.target.type === 'checkbox') {
      fx[k] = e.target.checked;
    } else {
      fx[k] = +e.target.value;
      panel.querySelector(`[data-out="${k}"]`).textContent = fx[k];
    }
    apply();
    save();
  });

  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.outcolor !== undefined) {
      fx.outColor = +b.dataset.outcolor;
      render(panel);
    } else if (b.dataset.style !== undefined) {
      fx.style = +b.dataset.style;
      render(panel);
    } else if (b.dataset.act === 'reset') {
      fx = { ...DEFAULTS };
      render(panel);
    } else if (b.dataset.act === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(fx));
      b.textContent = 'Copied';
      setTimeout(() => b.textContent = 'Copy settings', 1200);
      return;
    } else if (b.dataset.act === 'close') {
      show(false);
      return;
    }
    apply();
    save();
  });
}
