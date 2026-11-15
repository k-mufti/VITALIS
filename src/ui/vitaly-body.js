import { state } from '../state.js';
import { show } from '../nav.js';
import { triggerInjury, closeInjury } from './injury.js';
import { BODY } from './injury-library.js';
import { api } from '../data/client.js';

/* Vitaly and the body, one system. Two ways something reaches the crew member:

   - The data sees it (watchdog alert: heart, oxygen, cabin air, radiation, a hard knock).
     Vitaly speaks and the body zooms to where it is, with no card: Vitaly reads the steps.
   - The person feels it and tells Vitaly ("my left wrist hurts, I think it's broken").
     Vitaly starts the guide, the body zooms to the place they named, and the injury card
     shows where, what, their own data, the kit and when to call ground.

   Where on the body comes from the words they used, with the injury drill's body map
   (injury-library.js): first this file's own words (instant, includes medical names like ACL),
   then, only if none match, the AI picks a place from the same map (backend vitaly/place.py).
   If they didn't say which side, Vitaly asks before zooming. Only for the crew member themselves:
   the twin is their body, so when they're helping someone else nothing zooms. */

// Words for a spot, most specific first. Each gives a path in injury-library.js's BODY tree.
// 'S' is replaced by l or r for the side they said; if they didn't say, Vitaly asks.
const PLACES = [
  // Medical names people use for a part (a ligament or bone belongs to the joint or part it is in).
  [/\b(a\.? ?c\.? ?l|m\.? ?c\.? ?l|p\.? ?c\.? ?l|l\.? ?c\.? ?l|cruciate|menisc\w*|knee ?caps?|patell\w*)\b/, ['lower', 'S-leg', 'knee']],
  [/\b(rotator cuff|collar ?bones?|clavicles?|labrum|deltoids?)\b/, ['upper', 'S-arm', 'shoulder']],
  [/\b(achilles)\b/, ['lower', 'S-leg', 'ankle']],
  [/\b(heels?|big toe|metatarsals?)\b/, ['lower', 'S-leg', 'foot']],
  [/\b(carpal|scaphoid)\b/, ['upper', 'S-arm', 'wrist']],
  [/\b(funny bone|tennis elbow|golfer'?s elbow)\b/, ['upper', 'S-arm', 'elbow']],
  [/\b(pinky|pinkie|index finger|ring finger|middle finger)\b/, ['upper', 'S-arm', 'fingers']],
  [/\b(femur|quadriceps)\b/, ['lower', 'S-leg', 'thigh']],
  [/\b(tail ?bone|coccyx|lumbar|slipped disc|sciatica)\b/, ['upper', 'lower-back']],
  [/\b(traps|trapezius)\b/, ['upper', 'upper-back']],
  [/\b(glutes?|buttocks?|butt|pelvis)\b/, ['lower', 'hips']],
  [/\b(whiplash|cervical)\b/, ['head', 'neck']],
  [/\b(sternum|breast ?bone|pecs?|pectorals?)\b/, ['upper', 'chest']],
  [/\b(gums?|molars?|wisdom tooth)\b/, ['head', 'jaw']],
  [/\bback of (my |the )?head\b/, ['head', 'backhead']],
  [/\bforehead\b/, ['head', 'forehead']],
  [/\beyes?\b/, ['head', 'S-eye']],
  [/\bnose\b/, ['head', 'nose']],
  [/\b(jaw|tooth|teeth|chin)\b/, ['head', 'jaw']],
  [/\bears?\b/, ['head', 'S-ear']],
  [/\b(neck|throat)\b/, ['head', 'neck']],
  [/\b(fingers?|thumb|knuckles?|fingernails?)\b/, ['upper', 'S-arm', 'fingers']],
  [/\bwrists?\b/, ['upper', 'S-arm', 'wrist']],
  [/\b(hands?|palm)\b/, ['upper', 'S-arm', 'hand']],
  [/\bforearms?\b/, ['upper', 'S-arm', 'forearm']],
  [/\belbows?\b/, ['upper', 'S-arm', 'elbow']],
  [/\btriceps?\b/, ['upper', 'S-arm', 'tricep']],
  [/\b(biceps?|upper arm)\b/, ['upper', 'S-arm', 'bicep']],
  [/\bshoulders?\b/, ['upper', 'S-arm', 'shoulder']],
  [/\b(toes?|foot|feet)\b/, ['lower', 'S-leg', 'foot']],
  [/\bankles?\b/, ['lower', 'S-leg', 'ankle']],
  [/\bcalf|calves\b/, ['lower', 'S-leg', 'calf']],
  [/\b(shins?)\b/, ['lower', 'S-leg', 'shin']],
  [/\bknees?\b/, ['lower', 'S-leg', 'knee']],
  [/\b(thighs?|hamstrings?|quads?|quadriceps|groin)\b/, ['lower', 'S-leg', 'thigh']],
  [/\bhips?\b/, ['lower', 'S-leg', 'hip']],
  [/\bribs?\b/, ['upper', 'S-ribs']],
  [/\b(upper back|shoulder blades?)\b/, ['upper', 'upper-back']],
  [/\b(lower back|back|spine)\b/, ['upper', 'lower-back']],
  [/\b(chest|heart)\b/, ['upper', 'chest']],
  [/\b(belly|stomach|tummy|abdomen|gut)\b/, ['upper', 'belly']],
  [/\barms?\b/, ['upper', 'S-arm']],
  [/\blegs?\b/, ['lower', 'S-leg']],
  [/\bhead\b/, ['head']],
];

// Where each Vitaly guide points when the words name no place, and the name the injury card
// is matched with (injury-library.js). No entry = no zoom (panic, checking someone over).
const GUIDE_BODY = {
  chest_pain: { path: ['upper', 'chest'], name: 'chest pain' },
  breathing: { path: ['upper', 'chest'], name: 'CO2 breathing trouble' },
  choking: { path: ['head', 'neck'], name: 'choking' },
  fainting: { path: ['whole'], name: 'fainted' },
  head_injury: { path: ['head', 'forehead'], name: 'hit head' },
  seizure: { path: ['head'], name: 'seizure' },
  stroke: { path: ['head'], name: 'stroke' },
  eye: { path: ['head', 'S-eye'], name: 'debris in eye' },
  allergy: { path: ['whole'], name: 'allergic reaction' },
  vomiting: { path: ['upper', 'belly'], name: 'motion sickness' },
  poisoning: { path: ['upper', 'belly'], name: 'poisoning' },
  bleeding: { path: ['whole'], name: 'cut' },
  burn: { path: ['whole'], name: 'burn' },
  fracture: { path: ['whole'], name: 'broken bone' },
  cramp: { path: ['lower'], name: 'muscle cramp' },
  // Guides taken from the injury drill's library (backend/app/vitaly/injuries.py).
  sprain: { path: ['whole'], name: 'sprain strain pulled muscle' },
  dislocation: { path: ['whole'], name: 'dislocated' },
  nosebleed: { path: ['head', 'nose'], name: 'nosebleed' },
  puncture: { path: ['whole'], name: 'puncture' },
  back: { path: ['upper', 'lower-back'], name: 'back pain' },
  nail: { path: ['upper', 'S-arm', 'fingers'], name: 'fingernail from glove' },
  ear: { path: ['head', 'S-ear'], name: 'ear pressure' },
  kidney: { path: ['upper', 'lower-back'], name: 'kidney stone' },
  bends: { path: ['whole'], name: 'the bends' },
  radiation: { path: ['whole'], name: 'radiation sickness' },
  cold: { path: ['upper', 'S-arm', 'fingers'], name: 'frostbite' },
  crush: { path: ['upper', 'S-arm', 'fingers'], name: 'crushed in hatch' },
  tooth: { path: ['head', 'jaw'], name: 'toothache' },
  rash: { path: ['whole'], name: 'rash' },
  bruise: { path: ['whole'], name: 'bruise' },
  shock: { path: ['whole'], name: 'electric shock' },
};

// Where each watchdog alert is on the body. The name picks the 3D system the card would show
// (heart, lungs, ears), so the zoom lands on the organ itself.
const ALERT_BODY = {
  cardiac_arrest: [['upper', 'chest'], 'chest pain'],
  slow_heart: [['upper', 'chest'], 'chest pain'],
  irregular_rhythm: [['upper', 'chest'], 'chest pain'],
  fast_heart: [['upper', 'chest'], 'chest pain'],
  heart_spike: [['upper', 'chest'], 'chest pain'],
  heart_drift: [['upper', 'chest'], 'chest pain'],
  bp_crash: [['upper', 'chest'], 'chest pain'],
  bp_high: [['upper', 'chest'], 'chest pain'],
  low_oxygen_blood: [['upper', 'chest'], 'CO2 breathing trouble'],
  pressure_low: [['upper', 'chest'], 'CO2 breathing trouble'],
  o2_low: [['upper', 'chest'], 'CO2 breathing trouble'],
  co2_high: [['upper', 'chest'], 'CO2 breathing trouble'],
  fire: [['upper', 'chest'], 'CO2 breathing trouble'],
  noise_high: [['head', 'l-ear'], 'ear pressure'],
  radiation_storm: [['whole'], 'radiation sickness'],
  impact: [['whole'], 'impact'],
};

// Typed or misheard words ("wirst", "sholder", "ankel"): one letter off still counts. Only for
// words of 5+ letters, so short words can't be mistaken for each other (head / heat / hear).
const FUZZY = [
  ['wrist', 'wrist'], ['finger', 'fingers'], ['thumb', 'fingers'], ['knuckle', 'fingers'], ['forearm', 'forearm'],
  ['elbow', 'elbow'], ['tricep', 'tricep'], ['bicep', 'bicep'], ['shoulder', 'shoulder'],
  ['ankle', 'ankle'], ['thigh', 'thigh'], ['hamstring', 'thigh'], ['groin', 'thigh'], ['calves', 'calf'],
  ['chest', 'chest'], ['stomach', 'belly'], ['belly', 'belly'], ['forehead', 'forehead'],
  ['throat', 'neck'], ['spine', 'lower-back'],
];
const FUZZY_PATH = {
  wrist: ['upper', 'S-arm', 'wrist'], fingers: ['upper', 'S-arm', 'fingers'], forearm: ['upper', 'S-arm', 'forearm'],
  elbow: ['upper', 'S-arm', 'elbow'], tricep: ['upper', 'S-arm', 'tricep'], bicep: ['upper', 'S-arm', 'bicep'],
  shoulder: ['upper', 'S-arm', 'shoulder'], ankle: ['lower', 'S-leg', 'ankle'], thigh: ['lower', 'S-leg', 'thigh'],
  calf: ['lower', 'S-leg', 'calf'], chest: ['upper', 'chest'], belly: ['upper', 'belly'],
  forehead: ['head', 'forehead'], neck: ['head', 'neck'], 'lower-back': ['upper', 'lower-back'],
};

// Letters changed, added, dropped or swapped ("wirst" -> "wrist" is one swap).
function oneOff(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length] <= 1;
}

// Which side they said: 'l', 'r', or null (not said, or both).
export function sideFrom(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const left = /\b(left|lfet|letf)\b/.test(t), right = /\b(right|rihgt|rigth)\b/.test(t);
  if (left && !right) return 'l';
  if (right && !left) return 'r';
  return null;
}

// "my left wrist" -> { path: ['upper', 'S-arm', 'wrist'], side: 'l' }. null if no place was named.
export function placeFor(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const side = sideFrom(t);
  for (const [re, path] of PLACES) {
    if (re.test(t)) return { path, side };
  }
  const words = t.match(/[a-z]+/g) || [];
  for (const w of words) {
    if (w.length < 5) continue;
    const word = w.replace(/s$/, '');
    const hit = FUZZY.find(([k]) => oneOff(word, k) || oneOff(w, k));
    if (hit) return { path: FUZZY_PATH[hit[1]], side };
  }
  return null;
}

// The body map as a menu for the AI: one entry per place, sides folded into 'S' ("lower/S-leg/knee").
const AI_PLACES = [];
(function flatten(nodes, prefix, names) {
  for (const n of nodes) {
    const path = [...prefix, n.id.replace(/^[lr]-/, 'S-')];
    const id = path.join('/');
    const label = [...names, n.name.replace(/^(Left|Right) /, '')];
    if (!AI_PLACES.some(p => p.id === id)) AI_PLACES.push({ id, name: label.join(' > ') });
    if (n.parts) flatten(n.parts, path, label);
  }
})(BODY, [], []);

// Words the app doesn't know: the AI picks from AI_PLACES. null if it can't (no key, slow, no place).
async function askAi(text) {
  try {
    const r = await api.vitalyPlace(text, AI_PLACES);
    if (!r || !AI_PLACES.some(p => p.id === r.place)) return null;
    return { path: r.place.split('/'), side: r.side === 'left' ? 'l' : r.side === 'right' ? 'r' : null };
  } catch (err) {
    return null;
  }
}

const SIDE_NOUN = { arm: 'arm', leg: 'leg', eye: 'eye', ear: 'ear', fingers: 'hand', hand: 'hand', foot: 'foot',
  bicep: 'arm', tricep: 'arm', ribs: null };

// "Which knee, left or right?"
function sideQuestion(path) {
  const last = path[path.length - 1].replace(/^S-/, '');
  const noun = last in SIDE_NOUN ? SIDE_NOUN[last] : last;
  return noun ? `Which ${noun}, left or right?` : 'Which side, left or right?';
}

// Where a guide's injury is: { guide, text, known, path, side, question }. question is set when the
// place has a side they didn't say. null = no zoom for this guide (someone else, or no body place).
export async function placeForGuide(guide, text) {
  if (!guide || guide.who !== 'self') return null;
  const known = GUIDE_BODY[guide.id];
  if (!known) return null;
  let hit = placeFor(text);
  if (!hit && known.path.length <= 1) hit = await askAi(text);   // the guide alone can't place it
  const path = hit ? hit.path : known.path;
  const side = (hit && hit.side) || sideFrom(text);
  const needsSide = path.some(id => id.startsWith('S-')) && !side;
  return { guide, text, known, path, side, question: needsSide ? sideQuestion(path) : null };
}

let zoomed = null;   // 'card' (an injury card is up) or 'alert' (zoom only) while Vitaly has the body

// The zoom needs the body on screen (from an organ's detail view too).
function toBody() {
  if (state.view !== 'body') show('body');
}

// Zoom to the place and open the injury card. side: 'l' / 'r' (their answer), or null: then the area
// around both sides (lower body for a knee) rather than a guess.
export function bodyForPlace(where, side) {
  if (!where) return false;
  const s = side || where.side;
  let path = where.path;
  const cut = path.findIndex(id => id.startsWith('S-'));
  if (cut >= 0) path = s ? path.map(id => id.replace(/^S-/, s + '-')) : path.slice(0, cut);
  if (!path.length) path = ['whole'];
  toBody();
  // The card is matched on what they said first ("tore my ACL"), then on the guide's own name.
  triggerInjury(path, `${where.text} ${where.known.name}`, { vitaly: true, title: where.guide.title, yourData: where.guide.readings });
  zoomed = 'card';
  return true;
}

// A watchdog alert: zoom to where it is, no card. True if the body zoomed.
export function bodyForAlert(kind) {
  const hit = ALERT_BODY[kind];
  if (!hit) return false;
  toBody();
  triggerInjury(hit[0], hit[1], { card: false });
  zoomed = 'alert';
  return true;
}

// Vitaly closed. An alert's zoom goes with it; an injury card stays until it's marked treated.
export function releaseBody() {
  if (zoomed === 'alert') closeInjury();
  zoomed = null;
}
