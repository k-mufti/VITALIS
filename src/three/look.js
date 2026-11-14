import { uni, framing, applyFraming, setAuraVisible } from './body.js';
import { renderer, backdrop, twin } from './scene.js';
import { organFx } from './organs.js';

/*
  The VITALIS look: every visual setting for the 3D twin (body style, organ colours and
  positions, skeleton / muscle limb poses, framing) and the code that applies it.
  CHOSEN_LOOK below is the look picked in the FX dev panel (devpanel.js, open the app with ?dev);
  applyDefaultLook() uses it. To change the look, paste "Copy settings" into CHOSEN_LOOK.
*/

export const DEFAULTS = {
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
  tintEyes: '#0f2a80', tintEars: '#1f5fd1', tintKidneys: '#1a3aa8',
  // Limb rigs (per-model / per-limb values are filled in below)
  rigModel_arms: 0, rigModel_legs: 0, armJoints: false,
  // Organ position: which organ the sliders move
  posOrgan: 0,
};
// Organs you can nudge: [id in manifest, label]
export const ORGAN_LIST = [['heart', 'Heart'], ['lungs', 'Lungs'], ['sleep', 'Brain'], ['digestion', 'Digestion'], ['bones', 'Skeleton'], ['muscles', 'Muscles'],
  ['eyes', 'Eyes'], ['ears', 'Inner ear'], ['kidneys', 'Kidneys']];
// Organs shown as a mirrored pair (manifest "pair"); they also get a gap slider.
export const PAIRED = ['eyes', 'ears'];
for (const [id] of ORGAN_LIST) Object.assign(DEFAULTS, { [`pos_${id}_x`]: 0, [`pos_${id}_y`]: 0, [`pos_${id}_z`]: 0, [`pos_${id}_s`]: 1, [`pos_${id}_g`]: 1 });
export const BODY_CM = 180;  // body height used to show positions in cm

// Limb rigs: per model (bones / muscles), limb (arms / legs), side (L / R on screen) and joint.
// Joint keys look like ja_bones_L_el_rx; rig keys like rig_muscles_legs_cut.
export const RIG_MODELS = [['bones', 'Skeleton'], ['muscles', 'Muscles']];
export const LIMBS = [['arms', 'Arms'], ['legs', 'Legs']];
export const SIDES = ['L', 'R'];
export const LIMB_JOINTS = {
  arms: [['sh', 'Shoulder', .06, .822], ['el', 'Elbow', .06, .682], ['wr', 'Wrist', .06, .485]],
  legs: [['hp', 'Hip', .05, .52], ['kn', 'Knee', .05, .285], ['an', 'Ankle', .045, .04]],
};
export const JOINT_PROPS = [
  ['rz', 'Swing out (+) / in (−)', -120, 120, .5, '°'],
  ['rx', 'Swing forward (+) / back (−)', -120, 120, .5, '°'],
  ['ry', 'Twist', -180, 180, .5, '°'],
  ['px', 'Pivot · from centre', 0, .22, .001, 'cmOut'],
  ['py', 'Pivot · height', 0, .95, .001, 'cmUp'],
  ['pz', 'Pivot · depth (+ = front)', -.12, .12, .001, 'cm'],
];
export const jk = (m, sd, j, pr) => `ja_${m}_${sd}_${j}_${pr}`;
export const rk = (m, limb, name) => `rig_${m}_${limb}_${name}`;
export const limbDefaults = {};
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

// The look chosen in the FX panel on Nov 14 ("Copy settings", final skeleton + muscle fit).
// Paste a newer copy here to change the defaults.
export const CHOSEN_LOOK = {
  size: 2.08, lift: 0.23, autoTurn: false, style: 0, dot: 6, edge: 0.34, shade: 0.23, aura: 0, auraSize: 0.245,
  outWidth: 0.63, outSoft: 0.98, outColor: 0, outFill: 0.1, outShade: 0.31, outDots: 0.23, bgIntensity: 0,
  bgCell: 13, bgDot: 0.42, bgShape: 0, bgAngle: 53, bgGlowW: 0.92, bgGlowH: 1.02, bgGlowY: 0.5, bgFloor: 0.43,
  bgGradient: 0, bgColA: '#009dd1', bgColB: '#ff0000', bgPulse: 0.38, bgPulseSpeed: 0.73, adaptive: false,
  health: 1, orgStyle: 0, orgEdge: 1, orgShade: 1, orgDot: '#7fe9ff', tintHeart: '#0a1f6b',
  tintLungs: '#1f5fd1', tintBones: '#13308f', tintMuscles: '#1846c4', tintBrain: '#3d6ff0',
  tintDigestion: '#22409e', rigModel_arms: 0, rigModel_legs: 0, armJoints: false,
  posOrgan: 7, pos_heart_x: 0, pos_heart_y: 0.048, pos_heart_z: -0.044, pos_heart_s: 1.07, pos_lungs_x: 0,
  pos_lungs_y: 0.017, pos_lungs_z: 0.007, pos_lungs_s: 1.05, pos_sleep_x: 0, pos_sleep_y: 0.004,
  pos_sleep_z: 0.005, pos_sleep_s: 1.14, pos_digestion_x: 0, pos_digestion_y: 0.048, pos_digestion_z: -0.038,
  pos_digestion_s: 1, pos_bones_x: 0, pos_bones_y: 0, pos_bones_z: 0, pos_bones_s: 1, pos_muscles_x: 0,
  pos_muscles_y: -0.005, pos_muscles_z: 0, pos_muscles_s: 1,
  rig_bones_arms_on: true, rig_bones_arms_mirror: true, rig_bones_arms_side: 0, rig_bones_arms_start: 0.09,
  ja_bones_L_sh_rx: 6.5, ja_bones_L_sh_ry: 7, ja_bones_L_sh_rz: 25.5, ja_bones_L_sh_px: 0.039,
  ja_bones_L_sh_py: 0.819, ja_bones_L_sh_pz: 0.036, ja_bones_L_el_rx: 19.5, ja_bones_L_el_ry: -10,
  ja_bones_L_el_rz: 5.5, ja_bones_L_el_px: 0.22, ja_bones_L_el_py: 0.303, ja_bones_L_el_pz: 0.011,
  ja_bones_L_wr_rx: -1.5, ja_bones_L_wr_ry: -4, ja_bones_L_wr_rz: 12.5, ja_bones_L_wr_px: 0.02,
  ja_bones_L_wr_py: 0.3, ja_bones_L_wr_pz: 0.12, ja_bones_L_hp_rx: 2.5, ja_bones_L_hp_ry: 0,
  ja_bones_L_hp_rz: 9.5, ja_bones_L_hp_px: 0.05, ja_bones_L_hp_py: 0.52, ja_bones_L_hp_pz: 0,
  ja_bones_L_kn_rx: -2, ja_bones_L_kn_ry: 0, ja_bones_L_kn_rz: -3, ja_bones_L_kn_px: 0.05,
  ja_bones_L_kn_py: 0.285, ja_bones_L_kn_pz: 0, ja_bones_L_an_rx: 0, ja_bones_L_an_ry: 0, ja_bones_L_an_rz: 0,
  ja_bones_L_an_px: 0.045, ja_bones_L_an_py: 0.04, ja_bones_L_an_pz: 0,
  ja_bones_R_sh_rx: 0, ja_bones_R_sh_ry: 0, ja_bones_R_sh_rz: 25.5, ja_bones_R_sh_px: 0.06,
  ja_bones_R_sh_py: 0.822, ja_bones_R_sh_pz: 0, ja_bones_R_el_rx: 0, ja_bones_R_el_ry: 0, ja_bones_R_el_rz: -4,
  ja_bones_R_el_px: 0.06, ja_bones_R_el_py: 0.682, ja_bones_R_el_pz: 0, ja_bones_R_wr_rx: 0,
  ja_bones_R_wr_ry: 0, ja_bones_R_wr_rz: -1.5, ja_bones_R_wr_px: 0.06, ja_bones_R_wr_py: 0.485,
  ja_bones_R_wr_pz: 0, ja_bones_R_hp_rx: 0, ja_bones_R_hp_ry: 0, ja_bones_R_hp_rz: 0, ja_bones_R_hp_px: 0.05,
  ja_bones_R_hp_py: 0.52, ja_bones_R_hp_pz: 0, ja_bones_R_kn_rx: 0, ja_bones_R_kn_ry: 0, ja_bones_R_kn_rz: 0,
  ja_bones_R_kn_px: 0.05, ja_bones_R_kn_py: 0.285, ja_bones_R_kn_pz: 0, ja_bones_R_an_rx: 0,
  ja_bones_R_an_ry: 0, ja_bones_R_an_rz: 0, ja_bones_R_an_px: 0.045, ja_bones_R_an_py: 0.04,
  ja_bones_R_an_pz: 0,
  rig_bones_legs_on: true, rig_bones_legs_mirror: true, rig_bones_legs_side: 0, rig_bones_legs_start: 0.015,
  rig_muscles_arms_on: true, rig_muscles_arms_mirror: true, rig_muscles_arms_side: 0,
  rig_muscles_arms_start: 0.09, rig_muscles_arms_cut: 0.76, rig_muscles_arms_soft: 0.02,
  ja_muscles_L_sh_rx: -15, ja_muscles_L_sh_ry: 0, ja_muscles_L_sh_rz: -11.5, ja_muscles_L_sh_px: 0.06,
  ja_muscles_L_sh_py: 0.822, ja_muscles_L_sh_pz: 0, ja_muscles_L_el_rx: 0, ja_muscles_L_el_ry: 0,
  ja_muscles_L_el_rz: -0.5, ja_muscles_L_el_px: 0.06, ja_muscles_L_el_py: 0.682, ja_muscles_L_el_pz: 0,
  ja_muscles_L_wr_rx: 0, ja_muscles_L_wr_ry: 0, ja_muscles_L_wr_rz: 0, ja_muscles_L_wr_px: 0.06,
  ja_muscles_L_wr_py: 0.485, ja_muscles_L_wr_pz: 0,
  ja_muscles_R_sh_rx: 0, ja_muscles_R_sh_ry: 0, ja_muscles_R_sh_rz: 25.5, ja_muscles_R_sh_px: 0.06,
  ja_muscles_R_sh_py: 0.822, ja_muscles_R_sh_pz: 0, ja_muscles_R_el_rx: 0, ja_muscles_R_el_ry: 0,
  ja_muscles_R_el_rz: -0.5, ja_muscles_R_el_px: 0.06, ja_muscles_R_el_py: 0.682, ja_muscles_R_el_pz: 0,
  ja_muscles_R_wr_rx: 0, ja_muscles_R_wr_ry: 0, ja_muscles_R_wr_rz: 0, ja_muscles_R_wr_px: 0.06,
  ja_muscles_R_wr_py: 0.485, ja_muscles_R_wr_pz: 0,
  rig_muscles_legs_on: true, rig_muscles_legs_mirror: true, rig_muscles_legs_side: 0,
  rig_muscles_legs_start: 0.015, rig_muscles_legs_cut: 0.47, rig_muscles_legs_soft: 0.02,
  tintEyes: '#0f2a80',
  tintEars: '#1f5fd1',
  tintKidneys: '#1a3aa8',
  pos_heart_g: 1,
  pos_lungs_g: 1,
  pos_sleep_g: 1,
  pos_digestion_g: 1,
  pos_bones_g: 1,
  pos_muscles_g: 1,
  pos_eyes_x: 0,
  pos_eyes_y: 0.005,
  pos_eyes_z: 0,
  pos_eyes_s: 1,
  pos_eyes_g: 1.19,
  pos_ears_x: 0,
  pos_ears_y: 0,
  pos_ears_z: 0,
  pos_ears_s: 1,
  pos_ears_g: 1,
  pos_kidneys_x: 0,
  pos_kidneys_y: 0.033,
  pos_kidneys_z: -0.01,
  pos_kidneys_s: 0.68,
  pos_kidneys_g: 1,
};
Object.assign(DEFAULTS, CHOSEN_LOOK);

export const LINE_COLORS = [['Ink', '#0e0e0e'], ['Cyan', '#0aa5bd'], ['Gray', '#8a8a85'], ['White', '#f5f5f2']];

// Push a full set of look values (DEFAULTS shape) into the 3D twin.
export function applyLook(fx) {
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
  organFx.tints.eyes = fx.tintEyes;
  organFx.tints.ears = fx.tintEars;
  organFx.tints.kidneys = fx.tintKidneys;
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
  // Organ positions (FX panel nudges, see organs.js organFx.place)
  for (const [id] of ORGAN_LIST) {
    organFx.place[id] = { x: fx[`pos_${id}_x`], y: fx[`pos_${id}_y`], z: fx[`pos_${id}_z`], s: fx[`pos_${id}_s`], g: fx[`pos_${id}_g`] ?? 1 };
  }
  // Framing
  framing.size = fx.size;
  framing.lift = fx.lift;
  applyFraming();
  twin.autoTurn = fx.autoTurn;
}

// The shipped look.
export function applyDefaultLook() {
  applyLook({ ...DEFAULTS });
}
