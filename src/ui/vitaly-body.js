import { state } from '../state.js';
import { show } from '../nav.js';
import { triggerInjury, closeInjury } from './injury.js';

/* Vitaly and the body, one system. Two ways something reaches the crew member:

   - The data sees it (watchdog alert: heart, oxygen, cabin air, radiation, a hard knock).
     Vitaly speaks and the body zooms to where it is, with no card: Vitaly reads the steps.
   - The person feels it and tells Vitaly ("my left wrist hurts, I think it's broken").
     Vitaly starts the guide, the body zooms to the place they named, and the injury card
     shows where, what, their own data, the kit and when to call ground.

   Where on the body comes from the words they used, with the injury drill's body map
   (injury-library.js). Only for the crew member themselves: the twin is their body, so when
   they're helping someone else nothing zooms. */

// Words for a spot, most specific first. Each gives a path in injury-library.js's BODY tree.
// 'S' is replaced by l or r for the side they said (left if they didn't say).
const PLACES = [
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
  eye: { path: ['head', 'l-eye'], name: 'debris in eye' },
  allergy: { path: ['whole'], name: 'allergic reaction' },
  vomiting: { path: ['upper', 'belly'], name: 'motion sickness' },
  poisoning: { path: ['upper', 'belly'], name: 'poisoning' },
  bleeding: { path: ['whole'], name: 'cut' },
  burn: { path: ['whole'], name: 'burn' },
  fracture: { path: ['whole'], name: 'broken bone' },
  strain: { path: ['lower', 'l-leg', 'thigh'], name: 'pulled muscle' },
  cramp: { path: ['lower', 'l-leg', 'calf'], name: 'muscle cramp' },
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

// "my left wrist" -> ['upper', 'l-arm', 'wrist']. null if no place was named.
export function placeFor(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const side = /\bright\b/.test(t) && !/\bleft\b/.test(t) ? 'r' : 'l';
  for (const [re, path] of PLACES) {
    if (re.test(t)) return path.map(id => id.replace(/^S-/, side + '-'));
  }
  return null;
}

let zoomed = null;   // 'card' (an injury card is up) or 'alert' (zoom only) while Vitaly has the body

// The zoom needs the body on screen (from an organ's detail view too).
function toBody() {
  if (state.view !== 'body') show('body');
}

// Vitaly started a guide for something the crew member said. True if the body zoomed.
export function bodyForGuide(guide, text) {
  if (!guide || guide.who !== 'self') return false;
  const known = GUIDE_BODY[guide.id];
  if (!known) return false;
  const path = placeFor(text) || known.path;
  toBody();
  // The card is matched on what they said first ("broke my wrist"), then on the guide's own name.
  triggerInjury(path, `${text} ${known.name}`, { vitaly: true, title: guide.title, yourData: guide.readings });
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
