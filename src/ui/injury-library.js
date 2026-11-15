/* Injury drill data: where on the body, and what to do for each kind of injury.
   Used by injury.js. No AI yet: the typed name is matched against WORDS below.

   Body spots: x = world units from the centre line (+ = screen right = the astronaut's LEFT),
   v = height from the feet (0..1), radius = size of the red glow, dist = how close the camera gets,
   back = on the back of the body. Measured on the body model (A-pose). */

const side = (s, name) => (s > 0 ? 'Left ' : 'Right ') + name;

function arm(s) {
  return {
    id: s > 0 ? 'l-arm' : 'r-arm', name: side(s, 'arm'), spot: { x: .84 * s, v: .68, radius: .42, dist: 4.4 },
    parts: [
      // bone = where that part is on the skeleton model, whose arms hang a little wider and lower than the skin's.
      { id: 'shoulder', name: 'Shoulder', spot: { x: .6 * s,  v: .805, radius: .17, dist: 2.5 }, bone: { x: .44 * s, v: .79 } },
      { id: 'bicep',    name: 'Bicep',    spot: { x: .7 * s,  v: .735, radius: .14, dist: 2.3 }, bone: { x: .655 * s, v: .718 } },
      { id: 'tricep',   name: 'Tricep',   spot: { x: .7 * s,  v: .735, radius: .14, dist: 2.3, back: true }, bone: { x: .655 * s, v: .718 } },
      { id: 'elbow',    name: 'Elbow',    spot: { x: .86 * s, v: .68,  radius: .12, dist: 2.2 }, bone: { x: .91 * s, v: .656 } },
      { id: 'forearm',  name: 'Forearm',  spot: { x: 1.0 * s, v: .62, radius: .13, dist: 2.3 }, bone: { x: 1.06 * s, v: .6 } },
      { id: 'wrist',    name: 'Wrist',    spot: { x: 1.04 * s, v: .605, radius: .1, dist: 2.0 }, bone: { x: 1.225 * s, v: .53 } },
      { id: 'hand',     name: 'Hand',     spot: { x: 1.08 * s, v: .57, radius: .12, dist: 2.1 }, bone: { x: 1.29 * s, v: .497 } },
      { id: 'fingers',  name: 'Fingers',  spot: { x: 1.12 * s, v: .535, radius: .09, dist: 1.8 }, bone: { x: 1.34 * s, v: .454 } },
    ],
  };
}

function leg(s) {
  return {
    id: s > 0 ? 'l-leg' : 'r-leg', name: side(s, 'leg'), spot: { x: .36 * s, v: .28, radius: .7, dist: 6.5 },
    parts: [
      { id: 'hip',   name: 'Hip',   spot: { x: .3 * s,  v: .52, radius: .2,  dist: 2.9 } },
      { id: 'thigh', name: 'Thigh', spot: { x: .32 * s, v: .4,  radius: .2,  dist: 3.0 } },
      { id: 'knee',  name: 'Knee',  spot: { x: .36 * s, v: .29, radius: .14, dist: 2.5 } },
      { id: 'shin',  name: 'Shin',  spot: { x: .42 * s, v: .19, radius: .15, dist: 2.6 } },
      { id: 'calf',  name: 'Calf',  spot: { x: .42 * s, v: .21, radius: .15, dist: 2.6, back: true } },
      { id: 'ankle', name: 'Ankle', spot: { x: .46 * s, v: .055, radius: .11, dist: 2.2 } },
      { id: 'foot',  name: 'Foot',  spot: { x: .46 * s, v: .03, radius: .13, dist: 2.3 } },
    ],
  };
}

// Pick a general area, then narrow down. Any level can be sent.
export const BODY = [
  { id: 'whole', name: 'Whole body', spot: { x: 0, v: .5, radius: 3, dist: 10 } },
  {
    id: 'head', name: 'Head', spot: { x: 0, v: .935, radius: .34, dist: 2.4 },
    parts: [
      { id: 'forehead', name: 'Forehead', spot: { x: 0, v: .965, radius: .12, dist: 1.5 } },
      { id: 'backhead', name: 'Back of head', spot: { x: 0, v: .96, radius: .14, dist: 1.6, back: true } },
      { id: 'l-eye', name: 'Left eye',  spot: { x: .06, v: .942, radius: .06, dist: 1.1 }, eye: true },
      { id: 'r-eye', name: 'Right eye', spot: { x: -.06, v: .942, radius: .06, dist: 1.1 }, eye: true },
      { id: 'nose',  name: 'Nose', spot: { x: 0, v: .935, radius: .06, dist: 1.1 } },
      { id: 'jaw',   name: 'Jaw',  spot: { x: 0, v: .907, radius: .1, dist: 1.4 } },
      { id: 'l-ear', name: 'Left ear',  spot: { x: .14, v: .932, radius: .13, dist: 1.3 } },
      { id: 'r-ear', name: 'Right ear', spot: { x: -.14, v: .932, radius: .13, dist: 1.3 } },
      { id: 'neck',  name: 'Neck', spot: { x: 0, v: .885, radius: .12, dist: 1.6 } },
    ],
  },
  {
    id: 'upper', name: 'Upper body', spot: { x: 0, v: .7, radius: .9, dist: 6 },
    parts: [
      { id: 'chest', name: 'Chest', spot: { x: 0, v: .775, radius: .26, dist: 2.6 } },
      { id: 'l-ribs', name: 'Left ribs',  spot: { x: .26, v: .7, radius: .18, dist: 2.2 } },
      { id: 'r-ribs', name: 'Right ribs', spot: { x: -.26, v: .7, radius: .18, dist: 2.2 } },
      { id: 'belly', name: 'Belly', spot: { x: 0, v: .6, radius: .24, dist: 2.5 } },
      { id: 'upper-back', name: 'Upper back', spot: { x: 0, v: .78, radius: .28, dist: 2.7, back: true } },
      { id: 'lower-back', name: 'Lower back', spot: { x: 0, v: .6, radius: .24, dist: 2.5, back: true } },
      arm(1), arm(-1),
    ],
  },
  {
    id: 'lower', name: 'Lower body', spot: { x: 0, v: .3, radius: 1, dist: 6.5 },
    parts: [
      { id: 'hips', name: 'Hips', spot: { x: 0, v: .5, radius: .36, dist: 3 } },
      leg(1), leg(-1),
    ],
  },
];

/* What to do. Each kind of injury:
   words   = typed words that point to it (any part of a word counts)
   only    = it only fits these parts (part ids, or 'eye'), unless one of its words was typed
   urgent  = ground needs to know now (red); otherwise care on board (amber)
   steps   = what to do, in order. Short, one action each.
   help    = get ground on the line now if any of these happen
   kit     = what to grab from the medical kit
   space   = what is different without gravity
   limits  = what the astronaut should not do for a while
   bones   = add a line about their bone loss (makes a break more likely)
   glow    = move or resize the red spot onto the organ itself, e.g. the heart for chest pain
             (depth = how far under the skin)
   model   = which 3D system to show with the spot lit on it: a key from assets/models/manifest.json,
             or a function of the picked parts. No model = the glow stays on the skin. */

// Parts where a sprain is in the joint (show the bones); anywhere else it is the muscle.
const JOINTS = ['shoulder', 'elbow', 'wrist', 'hand', 'fingers', 'hip', 'hips', 'knee', 'ankle', 'foot', 'neck', 'jaw'];
const inJoint = path => path.some(p => JOINTS.includes(p.id));
export const INJURIES = [
  {
    id: 'cut', title: 'Cut', words: ['cut', 'gash', 'lacerat', 'slice', 'scrape', 'scratch', 'bleed', 'wound', 'graze', 'abrasion'],
    steps: [
      'Anchor yourself and the crew member to a handrail or foot loops.',
      'Put on gloves.',
      'Press gauze firmly on the cut for 10 minutes. Do not lift it to check.',
      'Clean around it with sterile water and close it with closure strips.',
      'Cover with a dressing. Check it again in 2 hours.',
    ],
    help: ['Still bleeding after 10 minutes of firm pressure', 'Deep or gaping, or you can see fat or bone', 'Numb or weak past the cut'],
    kit: 'Gloves, gauze, sterile water, closure strips, dressing',
    space: 'Blood does not drip. It balls up on the skin and can float off. Catch it with gauze.',
  },
  {
    id: 'puncture', title: 'Puncture wound', urgent: true, model: path => (path.some(p => ['chest', 'l-ribs', 'r-ribs'].includes(p.id)) ? 'lungs' : null), words: ['puncture', 'stab', 'pierc', 'impale', 'stuck in', 'shard', 'splinter'],
    steps: [
      'Anchor yourself and the crew member.',
      'Do not pull out anything that is stuck in the skin.',
      'Press gauze around it, not on it, to slow bleeding.',
      'Pad around the object and tape it so it cannot move.',
      'Call ground before taking anything out.',
    ],
    help: ['Bleeding that will not slow', 'In the chest or belly', 'Trouble breathing'],
    kit: 'Gloves, gauze, tape, dressing',
    space: 'Loose fragments can float into eyes and air filters. Bag every piece.',
  },
  {
    id: 'burn', title: 'Burn', words: ['burn', 'scald', 'hot', 'heat', 'fire', 'blister'],
    steps: [
      'Get away from the heat source and switch it off.',
      'Cool the burn with a cold wet towel for 20 minutes.',
      'Take off rings, watch or tight clothing near it before it swells.',
      'Cover loosely with a burn dressing.',
      'Do not pop blisters or put cream on it.',
    ],
    help: ['Bigger than the palm of a hand', 'On the face, hands, joints or groin', 'White, leathery or charred skin'],
    kit: 'Burn dressing, sterile water, towel',
    space: 'Water will not run over the burn. Soak a towel and hold it on.',
  },
  {
    id: 'fracture', title: 'Possible broken bone', urgent: true, bones: true, model: 'bones',
    words: ['fractur', 'broke', 'break', 'crack', 'snap'],
    steps: [
      'Keep it still. Do not try to straighten it.',
      'Splint it as you found it, past the joint above and below.',
      'Check past the injury: warm, pink, and they can feel your touch.',
      'Wrap a cold pack in cloth and hold it on for 15 minutes.',
      'Pain medicine from the kit, as the flight surgeon set out.',
    ],
    help: ['Bone through the skin', 'Cold, numb or blue past the injury', 'Bent the wrong way'],
    kit: 'Splint, elastic wrap, cold pack, pain medicine',
    space: 'Strap the splinted limb to the body or a rail so it cannot drift and knock things.',
    limits: 'No exercise with this limb and no spacewalks until ground clears it.',
  },
  {
    id: 'dislocation', title: 'Dislocated joint', urgent: true, model: 'bones', words: ['disloc', 'popped out', 'out of place', 'out of socket'],
    steps: [
      'Do not try to push it back in.',
      'Support it in the position you found it, with a sling or splint.',
      'Check past the joint: warm, pink, and they can feel your touch.',
      'Cold pack wrapped in cloth for 15 minutes.',
      'Call ground. They talk you through putting it back.',
    ],
    help: ['Cold, numb or blue past the joint', 'Pain getting worse fast'],
    kit: 'Sling, splint, cold pack, pain medicine',
    space: 'Without weight pulling on it, a joint can look fine. Compare it with the other side.',
    limits: 'No exercise with this joint until ground clears it.',
  },
  {
    id: 'sprain', title: 'Sprain or strain', bones: true, model: path => (inJoint(path) ? 'bones' : 'muscles'),
    words: ['sprain', 'strain', 'twist', 'pull', 'tear', 'torn', 'rolled', 'tweak', 'ligament', 'tendon', 'muscle', 'cramp'],
    steps: [
      'Stop using it.',
      'Cold pack wrapped in cloth, 15 minutes, every 2 to 3 hours.',
      'Wrap it with an elastic bandage. Firm, not tight.',
      'Check past it: warm, pink, and they can feel your touch.',
      'Move it gently after 2 days if the pain allows.',
    ],
    help: ['A pop, then it will not work', 'Cannot move it at all', 'Swelling fast or turning purple'],
    kit: 'Cold pack, elastic wrap, pain medicine',
    space: 'Muscles are weaker after months in space, so they tear more easily. Go easy on it.',
    limits: 'No heavy exercise with this part for 3 days.',
  },
  {
    id: 'head', title: 'Head injury', urgent: true, model: 'sleep', words: ['concuss', 'head', 'knock', 'hit', 'bang', 'smack', 'faint', 'passed out', 'dizzy'],
    only: ['forehead', 'backhead', 'head', 'jaw', 'neck'],
    steps: [
      'Stop all work. Strap in and stay still.',
      'Ask: what is your name, where are you, what day is it?',
      'Check the pupils with a light. Both should be the same size.',
      'Cold pack on the bump for 15 minutes.',
      'Someone checks on them every 2 hours for the next day.',
    ],
    help: ['Vomiting', 'Headache getting worse', 'Confused, very sleepy or slurring', 'One pupil bigger than the other', 'Clear fluid from the nose or ears'],
    kit: 'Cold pack, penlight',
    space: 'Head-down fluid shift already raises head pressure in space. Treat any knock seriously.',
    limits: 'No spacewalks, exercise or pain medicine that thins the blood until ground clears it.',
  },
  {
    id: 'eye', title: 'Something in the eye', model: 'eyes', words: ['eye', 'debris', 'dust', 'particle', 'speck', 'grit', 'flake', 'sting', 'irritat', 'scratch', 'chemical'],
    only: ['eye'],
    steps: [
      'Do not rub it.',
      'Hold the eyewash cup over the eye and rinse for 5 minutes.',
      'Blink. Look up, down, left and right.',
      'Check with a light and mirror. Lift the speck off with a wet swab.',
      'Still hurts? Tape a pad over it and rest the eye.',
    ],
    help: ['Blurry or lost vision', 'Something stuck in the eye', 'Chemical splash', 'Will not open from pain'],
    kit: 'Eyewash cup, saline, penlight, swab, eye pad',
    space: 'Dust and metal flakes do not settle. They float. This is one of the most common injuries on the ISS.',
  },
  {
    id: 'nosebleed', title: 'Nosebleed', words: ['nosebleed', 'nose bleed', 'bleed', 'blood'],
    only: ['nose'],
    steps: [
      'Lean forward, not back.',
      'Pinch the soft part of the nose for 10 to 15 minutes. Breathe through the mouth.',
      'Catch blood with gauze so it does not float.',
      'Cold pack on the bridge of the nose.',
      'No blowing the nose for a few hours.',
    ],
    help: ['Not stopped after 20 minutes', 'Came after a hit to the head', 'Feeling faint'],
    kit: 'Gauze, cold pack, gloves',
    space: 'Fluid shifts to the head in space, so nosebleeds are more common. Blood can float into the eyes.',
  },
  {
    id: 'chest', title: 'Chest pain', urgent: true, model: 'heart', glow: { x: .07, v: .725, radius: .2, depth: .18 }, words: ['chest pain', 'heart', 'tight chest', 'pressure', 'angina', 'cardiac', 'palpitat'],
    only: ['chest', 'l-ribs', 'r-ribs', 'upper'],
    steps: [
      'Stop all activity. Strap in and rest.',
      'Take heart rate and blood pressure now, and every 5 minutes.',
      'Put on oxygen if breathing is hard.',
      'Aspirin from the kit, if the flight surgeon protocol says so.',
      'Call ground now with the readings.',
    ],
    help: ['Pain spreading to the arm, jaw or back', 'Short of breath, sweaty or faint', 'Heart rate very fast or uneven'],
    kit: 'Blood pressure cuff, oxygen mask, aspirin, AED',
    space: 'An AED works in space. Strap the crew member down first so the shock does not push them away.',
  },
  {
    id: 'back', title: 'Back pain', model: 'bones', words: ['back', 'spine', 'disc', 'stiff'],
    only: ['upper-back', 'lower-back'],
    steps: [
      'Curl up: pull your knees to your chest and hold for 30 seconds.',
      'Repeat 5 times, then stretch out slowly.',
      'Warm pack on the sore spot for 15 minutes.',
      'Pain medicine from the kit if needed.',
      'No heavy lifting on the resistance machine today.',
    ],
    help: ['Numb or weak legs', 'Cannot control bladder or bowels', 'Pain after a hit or fall'],
    kit: 'Warm pack, pain medicine',
    space: 'The spine stretches up to 5 cm in space, which strains the discs. Most crew get back pain early on.',
  },
  {
    id: 'nail', title: 'Fingernail injury', words: ['nail', 'glove', 'fingertip', 'tip'],
    only: ['fingers', 'hand'],
    steps: [
      'Clean the finger with sterile water.',
      'Trim any loose part of the nail so it cannot catch.',
      'Cover with a small dressing and tape.',
      'Keep it dry. Change the dressing every day.',
    ],
    help: ['Red, hot or pus under the nail', 'Whole nail lifting off'],
    kit: 'Nail clippers, sterile water, dressing, tape',
    space: 'Spacewalk gloves press on the fingertips and can lift nails off.',
    limits: 'No spacewalks until the nail heals and the glove fit is checked.',
  },
  {
    id: 'ear', title: 'Ear pressure injury', model: 'ears', glow: { radius: .12, depth: .2 },
    words: ['ear', 'eardrum', 'pop', 'pressure', 'muffled', 'ringing', 'hearing', 'deaf', 'blocked'],
    only: ['l-ear', 'r-ear'],
    steps: [
      'Stop any pressure change: hold the airlock or suit pressure where it is.',
      'Swallow, yawn, or pinch the nose and blow gently to even the pressure.',
      'Do not put anything in the ear.',
      'Pain medicine from the kit if it aches.',
      'Test hearing: rub fingers by each ear and compare.',
    ],
    help: ['Blood or fluid from the ear', 'Spinning dizziness or vomiting', 'Hearing loss that does not come back'],
    kit: 'Pain medicine, decongestant spray, penlight',
    space: 'Airlock and suit pressure changes squeeze the eardrum. A head cold in space makes it worse, because the sinuses cannot drain.',
    limits: 'No spacewalks or airlock use until the ear clears.',
  },
  {
    id: 'kidney', title: 'Kidney stone', urgent: true, bones: true, model: 'kidneys', glow: { x: 0, v: .645, radius: .32 },
    words: ['kidney', 'stone', 'flank', 'side pain', 'urine', 'pee'],
    only: ['lower-back', 'belly', 'l-ribs', 'r-ribs'],
    steps: [
      'Drink 2 to 3 litres of water through the day.',
      'Pain medicine from the kit, as the flight surgeon set out.',
      'Collect urine in the sample bag to catch the stone.',
      'Take temperature. A fever changes the plan.',
      'Rest strapped in. Ground runs an ultrasound with you.',
    ],
    help: ['Fever or chills', 'Cannot pee', 'Pain that medicine does not touch', 'Vomiting'],
    kit: 'Pain medicine, urine sample bags, thermometer, ultrasound',
    space: 'Calcium lost from bones in space goes through the kidneys and can form stones.',
  },
  {
    id: 'sick', title: 'Space sickness', model: 'digestion', glow: { x: .1, v: .66, radius: .32, depth: .12 },
    words: ['sick', 'nause', 'vomit', 'throw up', 'threw up', 'motion', 'queasy', 'puk'],
    steps: [
      'Strap in and keep your head still.',
      'Fix your eyes on one point. Line your body up with the module floor.',
      'Anti-sickness medicine from the kit.',
      'Keep a sick bag in hand. Sip water slowly.',
      'Rest. Most crew feel better in 2 to 3 days.',
    ],
    help: ['Cannot keep water down for a day', 'Dizzy, dry mouth, very little urine', 'Vomiting blood'],
    kit: 'Sick bags, anti-sickness medicine, water',
    space: 'Most new astronauts get it. The inner ear and eyes disagree about which way is up. Vomit floats, so bag it.',
    limits: 'No spacewalks while sick. Vomit inside a helmet can choke you.',
  },
  {
    id: 'bends', title: 'Decompression sickness', urgent: true, model: 'bones',
    words: ['bends', 'decompress', 'dcs', 'nitrogen', 'after spacewalk', 'after eva'],
    steps: [
      'Tell ground now.',
      'Put on the oxygen mask: pure oxygen, tight fit.',
      'Get back in the suit and raise its pressure. The suit becomes a pressure chamber.',
      'Stay still. Do not rub or exercise the sore joint.',
      'Check vision, strength and feeling every 10 minutes.',
    ],
    help: ['Confused or slurring', 'Blurry vision', 'Trouble breathing', 'Numb or weak arms or legs'],
    kit: 'Oxygen mask, suit pressure kit, pain medicine',
    space: 'Spacewalk suits run at low pressure. Nitrogen in the blood can form bubbles, most often in the shoulders and elbows.',
    limits: 'No spacewalks until ground clears it.',
  },
  {
    id: 'radiation', title: 'Radiation sickness', urgent: true, radiation: true,
    words: ['radiation', 'radiation sick', 'solar', 'flare', 'dose', 'irradiat'],
    steps: [
      'Go to the storm shelter now: the area walled with water and supplies.',
      'Write down your dosimeter reading.',
      'Anti-sickness medicine from the kit.',
      'Drink water. Rest.',
      'Ground will ask for a blood sample in the next days.',
    ],
    help: ['Vomiting within hours of the dose', 'Bleeding gums or easy bruising', 'Fever'],
    kit: 'Dosimeter, anti-sickness medicine, blood sample kit',
    space: 'Outside Earth\'s magnetic field, a solar storm can deliver a large dose in hours.',
    limits: 'Stay in the shelter until the storm passes.',
  },
  {
    id: 'air', title: 'Breathing trouble', urgent: true, model: 'lungs', glow: { x: 0, v: .77, radius: .38, depth: .12 },
    words: ['co2', 'carbon', 'breath', 'suffocat', 'smoke', ' air', 'oxygen', 'hypox', 'choke', 'wheez'],
    steps: [
      'Move to another module with a working fan.',
      'Put on the oxygen mask.',
      'Check the CO₂ reading on the ship display.',
      'Smoke? Press the fire alarm and close the hatch behind you.',
      'Check blood oxygen on the finger sensor. It should be 95% or more.',
    ],
    help: ['Blood oxygen under 90%', 'Lips or fingers turning blue', 'Confused or very sleepy'],
    kit: 'Oxygen mask, finger sensor, smoke mask',
    space: 'Air does not rise or mix by itself. Without a fan, your breath forms a CO₂ bubble around your head.',
  },
  {
    id: 'cold', title: 'Cold injury', model: null,
    words: ['frost', 'cold', 'freez', 'numb finger', 'chill'],
    steps: [
      'Warm the fingers slowly: hold them in your armpits.',
      'Do not rub them.',
      'Soak in warm water, 37 to 39 °C, for 20 minutes if you can.',
      'Wrap each finger loosely in dry gauze.',
      'Pain medicine from the kit. Rewarming hurts.',
    ],
    help: ['Skin hard, white or grey', 'Blisters', 'Still numb after warming'],
    kit: 'Gauze, warm pack, pain medicine',
    space: 'In shadow, spacewalk gloves face −150 °C. If a glove heater fails, fingertips go first.',
    limits: 'No spacewalks until the fingers are checked.',
  },
  {
    id: 'crush', title: 'Crush injury', model: 'bones',
    words: ['crush', 'pinch', 'caught', 'trapped', 'slam', 'hatch', 'jammed'],
    steps: [
      'Free it gently.',
      'Check the shape: bent or out of place means treat it as a break.',
      'Cold pack wrapped in cloth for 15 minutes.',
      'Check the nail: dark blood underneath needs the flight surgeon.',
      'Tape it to the next finger if it hurts to move.',
    ],
    help: ['Misshapen or will not bend', 'Deep cut with it', 'Numb past the injury'],
    kit: 'Cold pack, tape, finger splint',
    space: 'Hatches and heavy gear still have full mass. They move slowly but stop hard.',
  },
  {
    id: 'tooth', title: 'Toothache',
    words: ['tooth', 'teeth', 'dental', 'filling', 'crown', 'gum'],
    only: ['jaw', 'head'],
    steps: [
      'Rinse the mouth with warm salt water.',
      'Pain medicine from the kit.',
      'Lost filling? Pack it with temporary filling from the dental kit.',
      'Clove oil on a cotton swab for the pain.',
      'Soft food. Chew on the other side.',
    ],
    help: ['Face or jaw swelling', 'Fever', 'Bad taste or pus'],
    kit: 'Dental kit, temporary filling, clove oil, pain medicine',
    space: 'The nearest dentist is months away. Crew learn basic dental care before flight.',
  },
  {
    id: 'allergy', title: 'Allergic reaction', urgent: true,
    words: ['allerg', 'hives', 'anaphyla', 'swollen lip', 'swollen face', 'reaction'],
    steps: [
      'Get away from whatever caused it.',
      'Allergy medicine from the kit.',
      'Lips, tongue or throat swelling, or hard to breathe? Use the adrenaline pen in the thigh now.',
      'Oxygen mask on.',
      'Strap in. Someone stays with them.',
    ],
    help: ['Swelling in the mouth or throat', 'Trouble breathing', 'Feeling faint'],
    kit: 'Allergy medicine, adrenaline pen, oxygen mask',
    space: 'New foods, cleaning wipes and lab chemicals are common causes on board.',
  },
  {
    id: 'rash', title: 'Skin rash',
    words: ['rash', 'itch', 'skin irrit', 'red skin', 'dermat'],
    steps: [
      'Clean the skin gently and pat dry.',
      'Hydrocortisone cream, thin layer, twice a day.',
      'Loose clothing over it.',
      'Take a photo for the flight surgeon.',
    ],
    help: ['Spreading fast', 'Blisters or open skin', 'Fever'],
    kit: 'Hydrocortisone cream, wipes, camera',
    space: 'Skin gets thin and dry in space and heals more slowly. Rashes are one of the most common complaints.',
  },
  {
    id: 'faint', title: 'Fainting', urgent: true, model: 'heart', glow: { x: .07, v: .725, radius: .2, depth: .18 },
    words: ['faint', 'passed out', 'pass out', 'blackout', 'black out', 'blacked out', 'lighthead', 'dizzy'],
    steps: [
      'Strap them in so they cannot drift into anything.',
      'Check they are breathing and take a pulse.',
      'Take heart rate and blood pressure.',
      'When awake: drink water with a salt tablet.',
      'Rest for an hour before moving around.',
    ],
    help: ['Does not wake within a minute', 'Uneven heartbeat', 'Chest pain', 'Faints again'],
    kit: 'Blood pressure cuff, salt tablets, water',
    space: 'Blood volume drops in space, so the heart has less to work with. Hard exercise can tip it over.',
  },
  {
    id: 'bruise', title: 'Bruise', bones: true, words: ['bruise', 'bump', 'contus', 'impact', 'hit', 'knock', 'bang', 'swell', 'sore'],
    steps: [
      'Cold pack wrapped in cloth, 15 minutes.',
      'Check it moves normally and is not misshapen.',
      'Compare it with the other side.',
      'Check again in 2 hours. Repeat the cold pack if it swells.',
    ],
    help: ['Swelling fast', 'Cannot move it', 'Pain gets worse, not better'],
    kit: 'Cold pack',
    space: 'Loose objects keep moving in space. Strap down whatever hit you.',
  },
  {
    id: 'shock', title: 'Electric shock', urgent: true, words: ['shock', 'electr', 'zap', 'volt', 'power'],
    steps: [
      'Cut the power before you touch them.',
      'Check they are awake and breathing.',
      'Take heart rate. Watch for an uneven beat.',
      'Look for burns where the current went in and out. Cover them.',
      'Call ground now, even if they feel fine.',
    ],
    help: ['Not breathing or no pulse: start CPR and get the AED', 'Uneven heartbeat', 'Burns on the skin'],
    kit: 'AED, burn dressing, blood pressure cuff',
    space: 'For CPR, strap them to the floor and brace your feet on the ceiling.',
  },
];

// Not in the list: a safe first look at any injury.
export const GENERAL = {
  id: 'general', title: null,
  steps: [
    'Stop what you are doing and anchor yourself.',
    'Look at it and compare with the other side: swelling, bleeding, shape.',
    'Check they can move it and feel your touch.',
    'Cold pack wrapped in cloth for 15 minutes if it swells or hurts.',
    'Tell the flight surgeon on the next call.',
  ],
  help: ['Bleeding that will not stop', 'Numb, cold or blue past the injury', 'Pain getting worse fast'],
  kit: 'Gloves, gauze, cold pack',
  space: 'Strap down anything loose first. Tools and blood both float.',
};

// Best match for what the judges named. path = the picked parts, general to specific.
export function matchInjury(text, path = []) {
  const t = ` ${(text || '').toLowerCase()} `;
  const tags = path.flatMap(p => [p.id, p.eye ? 'eye' : null]).filter(Boolean);
  let best = null, bestScore = 0;
  INJURIES.forEach(inj => {
    const hits = inj.words.filter(w => t.includes(w)).length;
    const here = !inj.only || inj.only.some(o => tags.includes(o));
    // Words alone are not enough for a part-specific injury (a "bleed" on the arm is a cut, not a nosebleed).
    if (!here && !inj.only.some(o => t.includes(o.replace('-', ' ')))) return;
    const score = hits * 2 + (inj.only && here ? 1 : 0);
    if (hits && score > bestScore) { best = inj; bestScore = score; }
  });
  return best;
}

// Quick picks for the hidden panel: the injuries most likely in space, ready to send.
// path = where on the body, name = what gets typed.
export const COMMON = [
  { label: 'Something in the eye', path: ['head', 'l-eye'], name: 'debris in eye' },
  { label: 'Space sickness', path: ['upper', 'belly'], name: 'motion sickness' },
  { label: 'Back pain', path: ['upper', 'lower-back'], name: 'back pain' },
  { label: 'Nosebleed', path: ['head', 'nose'], name: 'nosebleed' },
  { label: 'Fingernail (spacewalk glove)', path: ['upper', 'r-arm', 'fingers'], name: 'fingernail from glove' },
  { label: 'Skin rash', path: ['upper', 'l-arm', 'forearm'], name: 'rash' },
  { label: 'Head bump', path: ['head', 'forehead'], name: 'hit head' },
  { label: 'Crushed finger (hatch)', path: ['upper', 'l-arm', 'fingers'], name: 'crushed in hatch' },
  { label: 'Cut hand', path: ['upper', 'r-arm', 'hand'], name: 'cut' },
  { label: 'Burn', path: ['upper', 'l-arm', 'hand'], name: 'burn' },
  { label: 'Pulled muscle (exercise)', path: ['lower', 'l-leg', 'thigh'], name: 'pulled thigh muscle' },
  { label: 'Sprained ankle', path: ['lower', 'r-leg', 'ankle'], name: 'sprained ankle' },
  { label: 'Broken wrist', path: ['upper', 'l-arm', 'wrist'], name: 'broken wrist' },
  { label: 'Ear pressure', path: ['head', 'l-ear'], name: 'ear pressure' },
  { label: 'Kidney stone', path: ['upper', 'lower-back'], name: 'kidney stone' },
  { label: 'Toothache', path: ['head', 'jaw'], name: 'toothache' },
  { label: 'Cold fingers (spacewalk)', path: ['upper', 'r-arm', 'fingers'], name: 'frostbite' },
  { label: 'Decompression sickness', path: ['upper', 'l-arm', 'shoulder'], name: 'the bends' },
  { label: 'Breathing trouble (CO₂)', path: ['upper', 'chest'], name: 'CO2 breathing trouble' },
  { label: 'Chest pain', path: ['upper', 'chest'], name: 'chest pain' },
  { label: 'Fainting', path: ['whole'], name: 'fainted' },
  { label: 'Allergic reaction', path: ['whole'], name: 'allergic reaction' },
  { label: 'Radiation sickness', path: ['whole'], name: 'radiation sickness' },
];
