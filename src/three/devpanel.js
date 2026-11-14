import { STYLES } from './effects.js';
import {
  DEFAULTS, ORGAN_LIST, BODY_CM, RIG_MODELS, LIMBS, SIDES, LIMB_JOINTS, JOINT_PROPS, jk, rk, limbDefaults,
  LINE_COLORS, applyLook, applyDefaultLook,
} from './look.js';

/*
  FX dev panel for trying looks. Only loads with ?dev in the URL. Toggle with the ` (backtick) key.
  Settings are saved in this browser only. "Copy settings" puts them on the
  clipboard so they can be made the defaults below.
*/


// Which side the sliders edit: left when mirrored, otherwise the picked side.
const editSide = (f, m, limb) => (f[rk(m, limb, 'mirror')] || f[rk(m, limb, 'side')] === 0 ? 'L' : 'R');
const rigShown = (f, mi, limb) => f[`rigModel_${limb}`] === mi;
const STORE_KEY = 'vitalis-fx';
const VERSION = 3;  // bump to push new defaults over saved settings
const HALFTONE = 0, OUTLINE = 3;  // indexes in STYLES

// Severity bands from plan.md 5.2.
const band = s => (s < .33 ? 'OK' : s < .66 ? 'Watch' : 'Act');

// Panel layout. `only` = show for these body styles. `when` = show if it returns true.
const CONTROLS = [
  { section: 'Framing' },
  { k: 'size', label: 'Model size', min: .7, max: 2.6, step: .01, unit: 'x' },
  { k: 'lift', label: 'Model height', min: -.2, max: .4, step: .01, unit: 'cm' },
  { k: 'autoTurn', label: 'Auto turn', type: 'check' },

  { section: 'Body' },
  { type: 'styles' },
  { k: 'dot', label: 'Dot size', min: 3, max: 16, step: 1, unit: 'px', only: [HALFTONE, OUTLINE] },
  { k: 'edge', label: 'Edge dots', min: 0, max: 1, step: .01, unit: '%', only: [HALFTONE] },
  { k: 'shade', label: 'Shading dots', min: 0, max: 1, step: .01, unit: '%', only: [HALFTONE] },
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

  { section: 'Organs' },
  { k: 'orgStyle', label: 'Organ style', type: 'choice', options: ['Halftone', 'Silhouette'] },
  { k: 'orgEdge', label: 'Edge dots', min: 0, max: 1, step: .01, unit: '%', when: f => f.orgStyle === 0 },
  { k: 'orgShade', label: 'Shading dots', min: 0, max: 1, step: .01, unit: '%', when: f => f.orgStyle === 0 },
  { k: 'orgDot', label: 'Dot color', type: 'color', when: f => f.orgStyle === 0 },
  { k: 'tintHeart', label: 'Heart', type: 'color' },
  { k: 'tintLungs', label: 'Lungs', type: 'color' },
  { k: 'tintBones', label: 'Skeleton', type: 'color' },
  { k: 'tintMuscles', label: 'Muscles', type: 'color' },
  { k: 'tintBrain', label: 'Brain', type: 'color' },
  { k: 'tintDigestion', label: 'Digestion', type: 'color' },

  // One section per limb ("Arm rigs", "Leg rigs"), each with its own Skeleton / Muscles switch.
  ...LIMBS.flatMap(([limb, limbName]) => [
  { section: `${limbName.slice(0, -1)} rigs` },
  { k: `rigModel_${limb}`, label: 'Model', type: 'choice', options: RIG_MODELS.map(r => r[1]) },
  { k: 'armJoints', label: 'Show joint markers', type: 'check' },
  ...RIG_MODELS.flatMap(([m], mi) => {
    const shown = f => rigShown(f, mi, limb);
    const on = f => shown(f) && f[rk(m, limb, 'on')];
    const cutLabel = limb === 'arms' ? 'Armpit height' : 'Crotch height';
    return [
      { k: rk(m, limb, 'on'), label: `Pose ${limbName.toLowerCase()} to match body`, type: 'check', when: shown },
      { k: rk(m, limb, 'mirror'), label: 'Mirror both sides', type: 'check', when: on },
      { k: rk(m, limb, 'side'), label: 'Editing', type: 'choice', options: ['Left on screen', 'Right on screen'], when: f => on(f) && !f[rk(m, limb, 'mirror')] },
      { type: 'action', act: 'copyLR', m, limb, text: 'Copy this side to the other side', when: f => on(f) && !f[rk(m, limb, 'mirror')] },
      ...SIDES.flatMap(sd => LIMB_JOINTS[limb].flatMap(([j, name]) => [
        { type: 'subhead', text: name, when: f => on(f) && editSide(f, m, limb) === sd },
        ...JOINT_PROPS.map(([pr, label, min, max, step, unit]) =>
          ({ k: jk(m, sd, j, pr), label, min, max, step, unit, when: f => on(f) && editSide(f, m, limb) === sd })),
      ])),
      { type: 'subhead', text: 'Which parts move', when: on },
      { k: rk(m, limb, 'start'), label: `${limbName} start at (from centre)`, min: 0, max: .16, step: .001, unit: 'cmOut', when: on },
      ...(m === 'muscles' ? [
        { k: rk(m, limb, 'cut'), label: cutLabel, min: limb === 'arms' ? .6 : .35, max: limb === 'arms' ? .85 : .6, step: .001, unit: 'cmUp', when: on },
        { k: rk(m, limb, 'soft'), label: 'Joint softness', min: .002, max: .08, step: .001, unit: 'cmOut', when: on },
      ] : []),
      { type: 'action', act: 'resetLimb', m, limb, text: `Reset ${limbName.toLowerCase()}`, when: on },
    ];
  }),
  { type: 'note', text: 'Open Body → Bones or Muscles. Turns chain like a real limb: the first joint carries the next two. Each pivot height is also where that part starts. Skeleton: if a rib, hip or hand bone moves with the wrong limb, change "start at". Muscles: the limb is cut from the body below the armpit / crotch height; raise softness if a joint looks creased.' },
  ]),

  { section: 'Organ position' },
  { k: 'posOrgan', label: 'Organ', type: 'choice', options: ORGAN_LIST.map(o => o[1]) },
  ...ORGAN_LIST.flatMap(([id], i) => [
    { k: `pos_${id}_x`, label: 'X · left / right', min: -.1, max: .1, step: .001, unit: 'cm', when: f => f.posOrgan === i },
    { k: `pos_${id}_y`, label: 'Y · up / down', min: -.1, max: .1, step: .001, unit: 'cm', when: f => f.posOrgan === i },
    { k: `pos_${id}_z`, label: 'Z · depth (+ = front)', min: -.1, max: .1, step: .001, unit: 'cm', when: f => f.posOrgan === i },
    { k: `pos_${id}_s`, label: 'Size', min: .5, max: 1.5, step: .01, unit: 'x', when: f => f.posOrgan === i },
  ]),
  { type: 'note', text: 'Open the organ (or its layer) to see it move. Double-click a slider to reset it.' },

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
    const v = saved.v || 1;
    if (v < 2) saved.bgIntensity = 0;                            // v2: background dots turned off
    if (v < 3 && saved.armElbow === 8) saved.armElbow = -12;     // v3: elbow bends in by default
    if (saved.rigModel !== undefined) {   // one Model switch became one per limb section
      saved.rigModel_arms = saved.rigModel_legs = saved.rigModel;
      delete saved.rigModel;
      delete saved.rigLimb;
    }
    // Rig keys gained a limb: rig_bones_on -> rig_bones_arms_on, armpit -> cut.
    for (const [m] of RIG_MODELS) {
      for (const name of ['on', 'start', 'mirror', 'side', 'armpit', 'soft']) {
        const old = `rig_${m}_${name}`;
        if (saved[old] === undefined) continue;
        saved[rk(m, 'arms', name === 'armpit' ? 'cut' : name)] = saved[old];
        delete saved[old];
      }
    }
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...fx, v: VERSION })); } catch {}
}

function apply() {
  applyLook(fx);
}

// Readable values: cm on a 180 cm body, degrees, percent, multipliers.
const CTRL = Object.fromEntries(CONTROLS.filter(c => c.k).map(c => [c.k, c]));
const signed = n => (n > 0 ? '+' : '') + n;
function fmt(k, v) {
  if (k === 'health') return `${Math.round(v * 100)}% · ${band(v)}`;
  const unit = CTRL[k]?.unit;
  if (unit === 'cm') return `${signed(+(v * BODY_CM).toFixed(1))} cm`;
  if (unit === 'cmUp') return `${(v * BODY_CM).toFixed(1)} cm up`;
  if (unit === 'cmOut') return `${(v * BODY_CM).toFixed(1)} cm`;
  if (unit === '°') return `${signed(+v)}°`;
  if (unit === '%') return `${Math.round(v * 100)}%`;
  if (unit === 'x') return `×${(+v).toFixed(2)}`;
  if (unit === 'px') return `${v} px`;
  return v;
}

function controlHTML(c) {
  if (c.type === 'styles') {
    return `<div class="grid">${STYLES.map((n, i) => `<button data-style="${i}" class="${fx.style === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }
  if (c.type === 'lineColor') {
    return `<span class="sub">Line color</span><div class="grid">${LINE_COLORS.map(([n, col], i) =>
      `<button data-outcolor="${i}" class="${fx.outColor === i ? 'on' : ''}"><i style="background:${col}"></i>${n}</button>`).join('')}</div>`;
  }
  if (c.type === 'note') return `<p class="note">${c.text}</p>`;
  if (c.type === 'subhead') return `<span class="subhead">${c.text}</span>`;
  if (c.type === 'action') return `<button class="act" data-act="${c.act}" data-m="${c.m || ''}" data-limb="${c.limb || ''}">${c.text}</button>`;
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
  return `<div class="slider"><div class="top"><span>${c.label}</span><b data-out="${c.k}">${fmt(c.k, fx[c.k])}</b></div>
    <div class="ctl"><button data-nudge="${c.k}" data-dir="-1" aria-label="Less">−</button>
    <input type="range" data-key="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}" value="${fx[c.k]}" title="Double-click to reset">
    <button data-nudge="${c.k}" data-dir="1" aria-label="More">+</button></div></div>`;
}

function render(panel) {
  let html = `<header><h4>FX <small>\` to hide</small></h4><button class="x" data-act="close" aria-label="Close">×</button></header>`;
  let section = '';
  for (const c of CONTROLS) {
    if (c.section) {
      section = c.section;
      html += `<button class="sec ${collapsed.has(section) ? 'shut' : ''}" data-sec="${section}" data-sec-name="${section}">${section}</button>`;
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
#fxPanel { position: fixed; z-index: 40; top: 80px; right: 16px; width: 300px; max-height: calc(100vh - 100px); overflow-y: auto;
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
#fxPanel .sec.flash { color: #0aa5bd; border-color: #0aa5bd; transition: color .2s, border-color .2s; }
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
#fxPanel .slider { margin-bottom: 12px; }
#fxPanel .subhead { display: block; margin: 16px 0 8px; padding: 3px 8px; background: #0e0e0e; color: #fff;
  font: 700 12px 'Barlow Condensed', sans-serif; letter-spacing: .18em; text-transform: uppercase; }
#fxPanel .act { width: 100%; margin: 2px 0 12px; padding: 7px 0; border: 1px solid #e1e1dc; font: 600 12px 'Barlow Condensed', sans-serif;
  letter-spacing: .12em; text-transform: uppercase; }
#fxPanel .act:hover { border-color: #0e0e0e; }
#fxPanel .slider .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
#fxPanel .slider .top span { font: 600 13px 'Barlow', sans-serif; color: #3d3d3a; }
#fxPanel .slider .top b { font: 600 15px 'Barlow', sans-serif; font-variant-numeric: tabular-nums; color: #0e0e0e; }
#fxPanel .slider .ctl { display: flex; align-items: center; gap: 6px; }
#fxPanel .slider .ctl input { flex: 1; }
#fxPanel .slider .ctl button { width: 22px; height: 22px; flex: none; border: 1px solid #e1e1dc; font: 500 15px/1 'Barlow', sans-serif; color: #3d3d3a; }
#fxPanel .slider .ctl button:hover { border-color: #0e0e0e; color: #0e0e0e; }
#fxPanel input[type=color] { width: 100%; height: 26px; border: 1px solid #e1e1dc; background: none; padding: 2px; cursor: pointer; }
#fxPanel .check { display: flex; align-items: center; gap: 8px; font: 600 11px 'Barlow Condensed', sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; }
#fxPanel .note { font-size: 12px; line-height: 1.4; color: #8a8a85; margin: -2px 0 10px; }
#fxPanel .row { display: flex; gap: 6px; margin-top: 14px; }
#fxPanel .row button { flex: 1; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase;
  padding: 7px 0; border: 1px solid #0e0e0e; }
#fxPanel .row button:hover { background: #0e0e0e; color: #fff; }
#fxToggle { position: fixed; z-index: 40; bottom: 46px; right: 16px; font: 700 12px 'Barlow Condensed', sans-serif;
  letter-spacing: .2em; padding: 6px 10px; border: 1px solid #0e0e0e; background: #fff; }
#fxToggle.off { display: none; }
`;

// Developers only: the panel exists when the page is opened with ?dev (e.g. http://localhost:8000/?dev).
// Everyone else gets the default look, never the settings saved in this browser.
const DEV = new URLSearchParams(location.search).has('dev');

export function initDevPanel() {
  if (!DEV) {
    applyDefaultLook();
    return;
  }
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

  // Clicking a body part (spot, body-panel tile, risk card) jumps the panel to that organ's settings.
  document.addEventListener('click', e => {
    const part = e.target.closest?.('[data-sys]');
    if (!part || panel.contains(part)) return;
    const i = ORGAN_LIST.findIndex(([id]) => id === part.dataset.sys);
    if (i < 0) return;
    fx.posOrgan = i;
    collapsed.delete('Organ position');
    const rigIndex = RIG_MODELS.findIndex(([m]) => m === part.dataset.sys);
    if (rigIndex >= 0) {
      fx.rigModel_arms = rigIndex;
      fx.rigModel_legs = rigIndex;
      collapsed.delete('Arm rigs');
      collapsed.delete('Leg rigs');
    }
    save();
    render(panel);
    show(true);
    const head = panel.querySelector('[data-sec-name="Organ position"]');
    if (head) {
      panel.scrollTo({ top: head.offsetTop - 8, behavior: 'smooth' });
      head.classList.add('flash');
      setTimeout(() => head.classList.remove('flash'), 900);
    }
  }, true);

  // Double-click a slider to put it back to its default.
  panel.addEventListener('dblclick', e => {
    const k = e.target.dataset?.key;
    if (k && e.target.type === 'range') setValue(panel, k, DEFAULTS[k]);
  });

  // Buttons
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.act === 'close') return show(false);
    if (d.nudge) {
      const c = CTRL[d.nudge];
      const next = Math.min(c.max, Math.max(c.min, fx[d.nudge] + c.step * +d.dir));
      setValue(panel, d.nudge, +next.toFixed(4));
      return;
    }
    if (d.act === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(fx));
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy settings'), 1200);
      return;
    }
    const m = d.m, limb = d.limb;   // set on the rig action buttons
    if (d.act === 'copyLR') {
      const from = editSide(fx, m, limb), to = from === 'L' ? 'R' : 'L';
      for (const [j] of LIMB_JOINTS[limb]) for (const [pr] of JOINT_PROPS) fx[jk(m, to, j, pr)] = fx[jk(m, from, j, pr)];
    } else if (d.act === 'resetLimb') {
      for (const k of Object.keys(limbDefaults)) {
        if (k.startsWith(`rig_${m}_${limb}_`) || LIMB_JOINTS[limb].some(([j]) => k.startsWith(`ja_${m}_`) && k.includes(`_${j}_`))) {
          fx[k] = limbDefaults[k];
        }
      }
    } else if (d.sec) {
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

// Set one slider value from code (nudge / reset) and keep the panel in step.
function setValue(panel, k, v) {
  fx[k] = v;
  const input = panel.querySelector(`input[data-key="${k}"]`);
  if (input) input.value = v;
  const out = panel.querySelector(`[data-out="${k}"]`);
  if (out) out.textContent = fmt(k, v);
  apply();
  save();
}

// Which controls are showing right now (used to decide when to re-render).
function visibleKeys() {
  return CONTROLS.filter(c => (!c.only || c.only.includes(fx.style)) && (!c.when || c.when(fx))).map(c => c.k || c.type || c.section);
}
