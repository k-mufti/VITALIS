import { uni, framing, applyFraming, setAuraVisible } from './body.js';
import { renderer, backdrop, twin } from './scene.js';
import { STYLES } from './effects.js';

/*
  FX dev panel for trying looks. Toggle with the ` (backtick) key.
  Settings are saved in this browser only. "Copy settings" puts them on the
  clipboard so they can be made the defaults below.
*/

const DEFAULTS = {
  // Framing
  size: 2.02, lift: .23, autoTurn: false,
  // Body
  style: 0, dot: 6, edge: .34, shade: .23, aura: 0, auraSize: .245,
  outWidth: .63, outSoft: .98, outColor: 0, outFill: .1, outShade: .31, outDots: .23,
  // Background
  bgIntensity: 1, bgCell: 7, bgDot: .48, bgShape: 0, bgAngle: 45,
  bgGlowW: 1, bgGlowH: 1, bgGlowY: .5, bgFloor: 1,
  bgGradient: 0, bgColA: '#c4c4be', bgColB: '#0aa5bd', bgPulse: 0, bgPulseSpeed: .25,
  // Adaptive
  adaptive: false, health: 0,
};
const STORE_KEY = 'vitalis-fx';
const LINE_COLORS = [['Ink', '#0e0e0e'], ['Cyan', '#0aa5bd'], ['Gray', '#8a8a85'], ['White', '#f5f5f2']];
const HALFTONE = 0, OUTLINE = 3;  // indexes in STYLES

// Severity bands from plan.md 5.2.
const band = s => (s < .33 ? 'OK' : s < .66 ? 'Watch' : 'Act');

// Panel layout. `only` = show for these body styles. `when` = show if it returns true.
const CONTROLS = [
  { section: 'Framing' },
  { k: 'size', label: 'Model size', min: .7, max: 2.6, step: .01 },
  { k: 'lift', label: 'Model height', min: -.2, max: .4, step: .01 },
  { k: 'autoTurn', label: 'Auto turn', type: 'check' },

  { section: 'Body' },
  { type: 'styles' },
  { k: 'dot', label: 'Dot size', min: 3, max: 16, step: 1, only: [HALFTONE, OUTLINE] },
  { k: 'edge', label: 'Edge dots', min: 0, max: 1, step: .01, only: [HALFTONE] },
  { k: 'shade', label: 'Shading dots', min: 0, max: 1, step: .01, only: [HALFTONE] },
  { k: 'outWidth', label: 'Line width', min: .05, max: 1, step: .01, only: [OUTLINE] },
  { k: 'outSoft', label: 'Line softness', min: 0, max: 1, step: .01, only: [OUTLINE] },
  { k: 'outFill', label: 'Body tone', min: 0, max: 1, step: .01, only: [OUTLINE] },
  { k: 'outShade', label: 'Body shading', min: 0, max: 1, step: .01, only: [OUTLINE] },
  { k: 'outDots', label: 'Shadow dots', min: 0, max: 1, step: .01, only: [OUTLINE] },
  { type: 'lineColor', only: [OUTLINE] },
  { k: 'aura', label: 'Aura', min: 0, max: 1, step: .01 },
  { k: 'auraSize', label: 'Aura size', min: .01, max: .25, step: .005, when: f => f.aura > 0 },

  { section: 'Background' },
  { k: 'bgIntensity', label: 'Intensity', min: 0, max: 2, step: .01 },
  { k: 'bgCell', label: 'Dot spacing', min: 3, max: 24, step: 1 },
  { k: 'bgDot', label: 'Dot size', min: .1, max: .75, step: .01 },
  { k: 'bgShape', label: 'Dot shape', type: 'choice', options: ['Circle', 'Square', 'Lines'] },
  { k: 'bgAngle', label: 'Grid angle', min: 0, max: 90, step: 1 },
  { k: 'bgGlowW', label: 'Glow width', min: .2, max: 2.5, step: .01 },
  { k: 'bgGlowH', label: 'Glow height', min: .2, max: 2, step: .01 },
  { k: 'bgGlowY', label: 'Glow position', min: .1, max: .9, step: .01 },
  { k: 'bgFloor', label: 'Floor shadow', min: 0, max: 1, step: .01 },
  { k: 'bgGradient', label: 'Gradient', type: 'choice', options: ['Off', 'Radial', 'Vertical'] },
  { k: 'bgColA', label: 'Color', type: 'color', when: f => !f.adaptive },
  { k: 'bgColB', label: 'Gradient color', type: 'color', when: f => f.bgGradient > 0 },
  { k: 'bgPulse', label: 'Pulse', min: 0, max: 1, step: .01 },
  { k: 'bgPulseSpeed', label: 'Pulse speed', min: .05, max: 2, step: .01, when: f => f.bgPulse > 0 || f.adaptive },

  { section: 'Adaptive' },
  { k: 'adaptive', label: 'Follow crew health', type: 'check' },
  { k: 'health', label: 'Test severity', min: 0, max: 1, step: .01, when: f => f.adaptive },
  { type: 'note', text: 'Healthy = pale cyan, calm. Severe = navy, denser, faster pulse. Live data takes over when setOrganSeverity() is called.', when: f => f.adaptive },
];

let fx = load();
const collapsed = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.backdrop !== undefined && saved.bgIntensity === undefined) saved.bgIntensity = saved.backdrop;  // old key
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(fx)); } catch {}
}

function apply() {
  // Body
  uni.uStyle.value = fx.style;
  uni.uCell.value = fx.dot * renderer.getPixelRatio();
  uni.uEdge.value = fx.edge;
  uni.uShade.value = fx.shade;
  uni.uAura.value = fx.aura;
  uni.uAuraSize.value = fx.auraSize;
  setAuraVisible(fx.aura > 0);
  uni.uOutWidth.value = fx.outWidth;
  uni.uOutSoft.value = fx.outSoft;
  uni.uOutColor.value.set(LINE_COLORS[fx.outColor][1]);
  uni.uOutFill.value = fx.outFill;
  uni.uOutShade.value = fx.outShade;
  uni.uOutDots.value = fx.outDots;
  // Background
  const b = backdrop.uni;
  b.uIntensity.value = fx.bgIntensity;
  b.uCell.value = fx.bgCell;
  b.uDotScale.value = fx.bgDot;
  b.uShape.value = fx.bgShape;
  b.uAngle.value = fx.bgAngle;
  b.uGlowW.value = fx.bgGlowW;
  b.uGlowH.value = fx.bgGlowH;
  b.uGlowY.value = fx.bgGlowY;
  b.uFloor.value = fx.bgFloor;
  b.uGradient.value = fx.bgGradient;
  b.uColA.value.set(fx.bgColA);
  b.uColB.value.set(fx.bgColB);
  b.uPulse.value = fx.bgPulse;
  b.uPulseSpeed.value = fx.bgPulseSpeed;
  b.uAdaptive.value = fx.adaptive ? 1 : 0;
  twin.testSeverity = fx.adaptive ? fx.health : 0;
  // Framing
  framing.size = fx.size;
  framing.lift = fx.lift;
  applyFraming();
  twin.autoTurn = fx.autoTurn;
}

const fmt = (k, v) => (k === 'health' ? `${v} · ${band(v)}` : v);

function controlHTML(c) {
  if (c.type === 'styles') {
    return `<div class="grid">${STYLES.map((n, i) => `<button data-style="${i}" class="${fx.style === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }
  if (c.type === 'lineColor') {
    return `<span class="sub">Line color</span><div class="grid">${LINE_COLORS.map(([n, col], i) =>
      `<button data-outcolor="${i}" class="${fx.outColor === i ? 'on' : ''}"><i style="background:${col}"></i>${n}</button>`).join('')}</div>`;
  }
  if (c.type === 'note') return `<p class="note">${c.text}</p>`;
  if (c.type === 'check') {
    return `<label class="check"><input type="checkbox" data-key="${c.k}" ${fx[c.k] ? 'checked' : ''}> ${c.label}</label>`;
  }
  if (c.type === 'choice') {
    return `<span class="sub">${c.label}</span><div class="grid three">${c.options.map((n, i) =>
      `<button data-choice="${c.k}" data-val="${i}" class="${fx[c.k] === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }
  if (c.type === 'color') {
    return `<label class="color"><span>${c.label}<b data-out="${c.k}">${fx[c.k]}</b></span><input type="color" data-key="${c.k}" value="${fx[c.k]}"></label>`;
  }
  return `<label><span>${c.label}<b data-out="${c.k}">${fmt(c.k, fx[c.k])}</b></span>
    <input type="range" data-key="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}" value="${fx[c.k]}"></label>`;
}

function render(panel) {
  let html = `<header><h4>FX <small>\` to hide</small></h4><button class="x" data-act="close" aria-label="Close">×</button></header>`;
  let section = '';
  for (const c of CONTROLS) {
    if (c.section) {
      section = c.section;
      html += `<button class="sec ${collapsed.has(section) ? 'shut' : ''}" data-sec="${section}">${section}</button>`;
      continue;
    }
    if (collapsed.has(section)) continue;
    if (c.only && !c.only.includes(fx.style)) continue;
    if (c.when && !c.when(fx)) continue;
    html += controlHTML(c);
  }
  html += `<div class="row"><button data-act="reset">Reset</button><button data-act="copy">Copy settings</button></div>`;
  panel.innerHTML = html;
}

const CSS = `
#fxPanel { position: fixed; z-index: 40; top: 80px; right: 16px; width: 270px; max-height: calc(100vh - 100px); overflow-y: auto;
  background: #fff; border: 1px solid #e1e1dc; font: 500 13px 'Barlow', sans-serif; color: #0e0e0e; padding: 14px 16px 16px;
  user-select: none; scrollbar-width: thin; }
#fxPanel.off { display: none; }
#fxPanel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
#fxPanel h4 { font: 700 13px 'Barlow Condensed', sans-serif; letter-spacing: .2em; }
#fxPanel h4 small { font-weight: 500; color: #8a8a85; letter-spacing: .1em; margin-left: 6px; }
#fxPanel .x { font-size: 18px; line-height: 1; color: #8a8a85; }
#fxPanel .sec { display: flex; justify-content: space-between; width: 100%; margin: 14px 0 10px; padding: 0 0 6px;
  border-bottom: 1px solid #0e0e0e; font: 700 12px 'Barlow Condensed', sans-serif; letter-spacing: .2em; text-transform: uppercase; }
#fxPanel .sec::after { content: '−'; }
#fxPanel .sec.shut::after { content: '+'; }
#fxPanel .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px; }
#fxPanel .grid.three { grid-template-columns: 1fr 1fr 1fr; }
#fxPanel .grid button { display: flex; align-items: center; justify-content: center; gap: 6px; font: 600 12px 'Barlow Condensed', sans-serif;
  letter-spacing: .12em; text-transform: uppercase; padding: 7px 0; border: 1px solid #e1e1dc; }
#fxPanel .grid button.on { background: #0e0e0e; color: #fff; border-color: #0e0e0e; }
#fxPanel .grid i { width: 10px; height: 10px; border: 1px solid #c4c4be; }
#fxPanel label { display: block; margin-bottom: 10px; }
#fxPanel label span, #fxPanel .sub { display: flex; justify-content: space-between; font: 600 11px 'Barlow Condensed', sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; margin-bottom: 3px; }
#fxPanel label b { color: #0e0e0e; font-variant-numeric: tabular-nums; }
#fxPanel input[type=range] { width: 100%; accent-color: #0aa5bd; }
#fxPanel input[type=color] { width: 100%; height: 26px; border: 1px solid #e1e1dc; background: none; padding: 2px; cursor: pointer; }
#fxPanel .check { display: flex; align-items: center; gap: 8px; font: 600 11px 'Barlow Condensed', sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; }
#fxPanel .note { font-size: 12px; line-height: 1.4; color: #8a8a85; margin: -2px 0 10px; }
#fxPanel .row { display: flex; gap: 6px; margin-top: 14px; }
#fxPanel .row button { flex: 1; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase;
  padding: 7px 0; border: 1px solid #0e0e0e; }
#fxPanel .row button:hover { background: #0e0e0e; color: #fff; }
#fxToggle { position: fixed; z-index: 40; top: 80px; right: 16px; font: 700 12px 'Barlow Condensed', sans-serif;
  letter-spacing: .2em; padding: 6px 10px; border: 1px solid #0e0e0e; background: #fff; }
#fxToggle.off { display: none; }
`;

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

  // Sliders, colours, checkboxes
  panel.addEventListener('input', e => {
    const k = e.target.dataset.key;
    if (!k) return;
    const before = JSON.stringify(visibleKeys());
    if (e.target.type === 'checkbox') fx[k] = e.target.checked;
    else if (e.target.type === 'color') fx[k] = e.target.value;
    else fx[k] = +e.target.value;
    const out = panel.querySelector(`[data-out="${k}"]`);
    if (out) out.textContent = fmt(k, fx[k]);
    apply();
    save();
    // Re-render only if this change shows or hides other controls (keeps slider drags smooth).
    if (JSON.stringify(visibleKeys()) !== before) render(panel);
  });

  // Buttons
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.act === 'close') return show(false);
    if (d.act === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(fx));
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy settings'), 1200);
      return;
    }
    if (d.sec) {
      if (collapsed.has(d.sec)) collapsed.delete(d.sec);
      else collapsed.add(d.sec);
    } else if (d.act === 'reset') {
      fx = { ...DEFAULTS };
    } else if (d.style !== undefined) {
      fx.style = +d.style;
    } else if (d.outcolor !== undefined) {
      fx.outColor = +d.outcolor;
    } else if (d.choice) {
      fx[d.choice] = +d.val;
    }
    render(panel);
    apply();
    save();
  });
}

// Which controls are showing right now (used to decide when to re-render).
function visibleKeys() {
  return CONTROLS.filter(c => (!c.only || c.only.includes(fx.style)) && (!c.when || c.when(fx))).map(c => c.k || c.type || c.section);
}
