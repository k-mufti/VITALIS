import { uni, framing, applyFraming, setAuraVisible } from './body.js';
import { renderer, backdrop, twin } from './scene.js';
import { STYLES } from './effects.js';
import { organFx } from './organs.js';

/*
  FX dev panel for trying looks. Only loads with ?dev in the URL. Toggle with the ` (backtick) key.
  Settings are saved in this browser only. "Copy settings" puts them on the
  clipboard so they can be made the defaults below.
*/

const DEFAULTS = {
  // Framing
  size: 2.02, lift: .23, autoTurn: false,
  // Body
  style: 0, dot: 6, edge: .34, shade: .23, aura: 0, auraSize: .245,
  outWidth: .63, outSoft: .98, outColor: 0, outFill: .1, outShade: .31, outDots: .23,
  // Background (off; the other values are kept for when it is turned back on)
  bgIntensity: 0,
  bgCell: 13, bgDot: .42, bgShape: 0, bgAngle: 53,
  bgGlowW: .92, bgGlowH: 1.02, bgGlowY: .5, bgFloor: .43,
  bgGradient: 0, bgColA: '#009dd1', bgColB: '#ff0000', bgPulse: .38, bgPulseSpeed: .73,
  // Adaptive
  adaptive: false, health: 1,
  // Organs (3D models)
  orgStyle: 0, orgEdge: 1, orgShade: 1, orgDot: '#7fe9ff',
  tintHeart: '#0a1f6b', tintLungs: '#1f5fd1', tintBones: '#13308f', tintMuscles: '#1846c4', tintBrain: '#3d6ff0', tintDigestion: '#22409e',
  // Limb rigs (per-model / per-limb values are filled in below)
  rigModel: 0, rigLimb: 0, armJoints: false,
  // Organ position: which organ the sliders move
  posOrgan: 0,
};
// Organs you can nudge: [id in manifest, label]
const ORGAN_LIST = [['heart', 'Heart'], ['lungs', 'Lungs'], ['sleep', 'Brain'], ['digestion', 'Digestion'], ['bones', 'Skeleton'], ['muscles', 'Muscles']];
for (const [id] of ORGAN_LIST) Object.assign(DEFAULTS, { [`pos_${id}_x`]: 0, [`pos_${id}_y`]: 0, [`pos_${id}_z`]: 0, [`pos_${id}_s`]: 1 });
// Organ positions tuned by eye on Nov 14 ([x, y, z, size]).
const TUNED_POS = {
  heart: [0, .048, -.044, 1.07], lungs: [0, .017, .007, 1.05], sleep: [0, .004, .005, 1.14],
  digestion: [0, .048, -.038, 1], bones: [0, 0, 0, 1], muscles: [-.024, 0, 0, 1],
};
for (const [id, [x, y, z, sz]] of Object.entries(TUNED_POS)) {
  Object.assign(DEFAULTS, { [`pos_${id}_x`]: x, [`pos_${id}_y`]: y, [`pos_${id}_z`]: z, [`pos_${id}_s`]: sz });
}
const BODY_CM = 180;  // body height used to show positions in cm

// Limb rigs: per model (bones / muscles), limb (arms / legs), side (L / R on screen) and joint.
// Joint keys look like ja_bones_L_el_rx; rig keys like rig_muscles_legs_cut.
const RIG_MODELS = [['bones', 'Skeleton'], ['muscles', 'Muscles']];
const LIMBS = [['arms', 'Arms'], ['legs', 'Legs']];
const SIDES = ['L', 'R'];
const LIMB_JOINTS = {
  arms: [['sh', 'Shoulder', .06, .822], ['el', 'Elbow', .06, .682], ['wr', 'Wrist', .06, .485]],
  legs: [['hp', 'Hip', .05, .52], ['kn', 'Knee', .05, .285], ['an', 'Ankle', .045, .04]],
};
const JOINT_PROPS = [
  ['rz', 'Swing out (+) / in (−)', -120, 120, .5, '°'],
  ['rx', 'Swing forward (+) / back (−)', -120, 120, .5, '°'],
  ['ry', 'Twist', -180, 180, .5, '°'],
  ['px', 'Pivot · from centre', 0, .22, .001, 'cmOut'],
  ['py', 'Pivot · height', 0, .95, .001, 'cmUp'],
  ['pz', 'Pivot · depth (+ = front)', -.12, .12, .001, 'cm'],
];
const jk = (m, sd, j, pr) => `ja_${m}_${sd}_${j}_${pr}`;
const rk = (m, limb, name) => `rig_${m}_${limb}_${name}`;
const limbDefaults = {};
for (const [m] of RIG_MODELS) for (const [limb] of LIMBS) {
  Object.assign(limbDefaults, {
    [rk(m, limb, 'on')]: true, [rk(m, limb, 'mirror')]: true, [rk(m, limb, 'side')]: 0,
    [rk(m, limb, 'start')]: limb === 'arms' ? .09 : .015,
  });
  if (m === 'muscles') Object.assign(limbDefaults, { [rk(m, limb, 'cut')]: limb === 'arms' ? .76 : .47, [rk(m, limb, 'soft')]: .02 });
  for (const sd of SIDES) for (const [j, , px, py] of LIMB_JOINTS[limb]) {
    Object.assign(limbDefaults, { [jk(m, sd, j, 'rx')]: 0, [jk(m, sd, j, 'ry')]: 0, [jk(m, sd, j, 'rz')]: 0,
      [jk(m, sd, j, 'px')]: px, [jk(m, sd, j, 'py')]: py, [jk(m, sd, j, 'pz')]: 0 });
  }
}
Object.assign(DEFAULTS, limbDefaults);

// The look chosen in the FX panel on Nov 14 ("Copy settings", muscle arms updated later that day). Paste a newer copy here to change the defaults.
const CHOSEN_LOOK = {
  size: 2.02, lift: 0.23, autoTurn: false, style: 0, dot: 6, edge: 0.34, shade: 0.23, aura: 0, auraSize: 0.245,
  outWidth: 0.63, outSoft: 0.98, outColor: 0, outFill: 0.1, outShade: 0.31, outDots: 0.23, bgIntensity: 0,
  bgCell: 13, bgDot: 0.42, bgShape: 0, bgAngle: 53, bgGlowW: 0.92, bgGlowH: 1.02, bgGlowY: 0.5, bgFloor: 0.43,
  bgGradient: 0, bgColA: '#009dd1', bgColB: '#ff0000', bgPulse: 0.38, bgPulseSpeed: 0.73, adaptive: false,
  health: 1, orgStyle: 0, orgEdge: 1, orgShade: 1, orgDot: '#7fe9ff', tintHeart: '#0a1f6b',
  tintLungs: '#1f5fd1', tintBones: '#13308f', tintMuscles: '#1846c4', tintBrain: '#3d6ff0',
  tintDigestion: '#22409e', armJoints: false,
  rigModel: 1, rig_bones_arms_on: true, rig_bones_arms_start: 0.09, rig_bones_arms_mirror: true,
  rig_bones_arms_side: 0, rig_muscles_arms_on: true, rig_muscles_arms_start: 0.09, rig_muscles_arms_cut: 0.76,
  rig_muscles_arms_soft: 0.02, rig_muscles_arms_mirror: true, rig_muscles_arms_side: 0,
  posOrgan: 5, pos_heart_x: 0, pos_heart_y: 0.048, pos_heart_z: -0.044, pos_heart_s: 1.07, pos_lungs_x: 0,
  pos_lungs_y: 0.017, pos_lungs_z: 0.007, pos_lungs_s: 1.05, pos_sleep_x: 0, pos_sleep_y: 0.004,
  pos_sleep_z: 0.005, pos_sleep_s: 1.14, pos_digestion_x: 0, pos_digestion_y: 0.048, pos_digestion_z: -0.038,
  pos_digestion_s: 1, pos_bones_x: 0, pos_bones_y: 0, pos_bones_z: 0, pos_bones_s: 1, pos_muscles_x: 0,
  pos_muscles_y: -0.005, pos_muscles_z: 0, pos_muscles_s: 1,
  ja_bones_L_sh_rz: 25.5, ja_bones_L_sh_rx: 6.5, ja_bones_L_sh_ry: 7, ja_bones_L_sh_px: 0.039,
  ja_bones_L_sh_py: 0.819, ja_bones_L_sh_pz: 0.036, ja_bones_L_el_rz: 5.5, ja_bones_L_el_rx: 19.5,
  ja_bones_L_el_ry: -10, ja_bones_L_el_px: 0.22, ja_bones_L_el_py: 0.303, ja_bones_L_el_pz: 0.011,
  ja_bones_L_wr_rz: 12.5, ja_bones_L_wr_rx: -1.5, ja_bones_L_wr_ry: -4, ja_bones_L_wr_px: 0.02,
  ja_bones_L_wr_py: 0.3, ja_bones_L_wr_pz: 0.12,
  ja_bones_R_sh_rz: 25.5, ja_bones_R_sh_rx: 0, ja_bones_R_sh_ry: 0, ja_bones_R_sh_px: 0.06,
  ja_bones_R_sh_py: 0.822, ja_bones_R_sh_pz: 0, ja_bones_R_el_rz: -4, ja_bones_R_el_rx: 0, ja_bones_R_el_ry: 0,
  ja_bones_R_el_px: 0.06, ja_bones_R_el_py: 0.682, ja_bones_R_el_pz: 0, ja_bones_R_wr_rz: -1.5,
  ja_bones_R_wr_rx: 0, ja_bones_R_wr_ry: 0, ja_bones_R_wr_px: 0.06, ja_bones_R_wr_py: 0.485,
  ja_bones_R_wr_pz: 0,
  ja_muscles_L_sh_rz: -11.5, ja_muscles_L_sh_rx: -15, ja_muscles_L_sh_ry: 0, ja_muscles_L_sh_px: 0.06,
  ja_muscles_L_sh_py: 0.822, ja_muscles_L_sh_pz: 0, ja_muscles_L_el_rz: -0.5, ja_muscles_L_el_rx: 0,
  ja_muscles_L_el_ry: 0, ja_muscles_L_el_px: 0.06, ja_muscles_L_el_py: 0.682, ja_muscles_L_el_pz: 0,
  ja_muscles_L_wr_rz: 0, ja_muscles_L_wr_rx: 0, ja_muscles_L_wr_ry: 0, ja_muscles_L_wr_px: 0.06,
  ja_muscles_L_wr_py: 0.485, ja_muscles_L_wr_pz: 0,
  ja_muscles_R_sh_rz: 25.5, ja_muscles_R_sh_rx: 0, ja_muscles_R_sh_ry: 0, ja_muscles_R_sh_px: 0.06,
  ja_muscles_R_sh_py: 0.822, ja_muscles_R_sh_pz: 0, ja_muscles_R_el_rz: -0.5, ja_muscles_R_el_rx: 0,
  ja_muscles_R_el_ry: 0, ja_muscles_R_el_px: 0.06, ja_muscles_R_el_py: 0.682, ja_muscles_R_el_pz: 0,
  ja_muscles_R_wr_rz: 0, ja_muscles_R_wr_rx: 0, ja_muscles_R_wr_ry: 0, ja_muscles_R_wr_px: 0.06,
  ja_muscles_R_wr_py: 0.485, ja_muscles_R_wr_pz: 0,
};
Object.assign(DEFAULTS, CHOSEN_LOOK);
// Which side the sliders edit: left when mirrored, otherwise the picked side.
const editSide = (f, m, limb) => (f[rk(m, limb, 'mirror')] || f[rk(m, limb, 'side')] === 0 ? 'L' : 'R');
const rigShown = (f, mi, li) => f.rigModel === mi && f.rigLimb === li;
const STORE_KEY = 'vitalis-fx';
const VERSION = 3;  // bump to push new defaults over saved settings
const LINE_COLORS = [['Ink', '#0e0e0e'], ['Cyan', '#0aa5bd'], ['Gray', '#8a8a85'], ['White', '#f5f5f2']];
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

  { section: 'Limb rigs' },
  { k: 'rigModel', label: 'Model', type: 'choice', options: RIG_MODELS.map(r => r[1]) },
  { k: 'rigLimb', label: 'Limb', type: 'choice', options: LIMBS.map(l => l[1]) },
  { k: 'armJoints', label: 'Show joint markers', type: 'check' },
  ...RIG_MODELS.flatMap(([m], mi) => LIMBS.flatMap(([limb, limbName], li) => {
    const shown = f => rigShown(f, mi, li);
    const on = f => shown(f) && f[rk(m, limb, 'on')];
    const cutLabel = limb === 'arms' ? 'Armpit height' : 'Crotch height';
    return [
      { k: rk(m, limb, 'on'), label: `Pose ${limbName.toLowerCase()} to match body`, type: 'check', when: shown },
      { k: rk(m, limb, 'mirror'), label: 'Mirror both sides', type: 'check', when: on },
      { k: rk(m, limb, 'side'), label: 'Editing', type: 'choice', options: ['Left on screen', 'Right on screen'], when: f => on(f) && !f[rk(m, limb, 'mirror')] },
      { type: 'action', act: 'copyLR', text: 'Copy this side to the other side', when: f => on(f) && !f[rk(m, limb, 'mirror')] },
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
      { type: 'action', act: 'resetLimb', text: `Reset ${limbName.toLowerCase()}`, when: on },
    ];
  })),
  { type: 'note', text: 'Open Body → Bones or Muscles. Turns chain like a real limb: the first joint carries the next two. Each pivot height is also where that part starts. Skeleton: if a rib, hip or hand bone moves with the wrong limb, change "start at". Muscles: the limb is cut from the body below the armpit / crotch height; raise softness if a joint looks creased.' },

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
  // Organs
  organFx.style = fx.orgStyle;
  organFx.edge = fx.orgEdge;
  organFx.shade = fx.orgShade;
  organFx.dotColor = fx.orgDot;
  organFx.tints.heart = fx.tintHeart;
  organFx.tints.lungs = fx.tintLungs;
  organFx.tints.bones = fx.tintBones;
  organFx.tints.muscles = fx.tintMuscles;
  organFx.tints.sleep = fx.tintBrain;
  organFx.tints.digestion = fx.tintDigestion;
  organFx.rigs.showJoints = fx.armJoints;
  for (const [m] of RIG_MODELS) for (const [limb] of LIMBS) {
    const rig = organFx.rigs[m][limb];
    rig.on = fx[rk(m, limb, 'on')];
    rig.start = fx[rk(m, limb, 'start')];
    if (m === 'muscles') {
      rig.cut = fx[rk(m, limb, 'cut')];
      rig.soft = fx[rk(m, limb, 'soft')];
    }
    for (const sd of SIDES) {
      const from = fx[rk(m, limb, 'mirror')] ? 'L' : sd;   // mirrored: both sides use the left values
      LIMB_JOINTS[limb].forEach(([j], i) => {
        for (const [pr] of JOINT_PROPS) rig[sd][i][pr] = fx[jk(m, from, j, pr)];
      });
    }
  }
  // Framing
  framing.size = fx.size;
  framing.lift = fx.lift;
  applyFraming();
  twin.autoTurn = fx.autoTurn;
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
  if (c.type === 'action') return `<button class="act" data-act="${c.act}">${c.text}</button>`;
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
    fx = { ...DEFAULTS };
    apply();
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
      fx.rigModel = rigIndex;
      collapsed.delete('Limb rigs');
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
    const m = RIG_MODELS[fx.rigModel][0], limb = LIMBS[fx.rigLimb][0];
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
