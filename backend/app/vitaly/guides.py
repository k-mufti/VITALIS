"""Symptom guides: what Vitaly walks you through when you TELL it something is wrong.

"Sharp pain in my chest", "he's not breathing", "I cut my arm": the watchdog can't see pain or a
wound, so the crew member says it. Matching is by keywords (instant, no AI), and each guide has
two versions: for yourself ("my chest hurts") and for helping someone else ("she has chest
pain"). Vitaly reads one step, waits for "next", and goes on. Nothing waits on another person.

Steps follow standard first aid in plain words, adapted for a spacecraft (strap in, restraints).
They are demo procedures, not a medical manual. No line contains live numbers, so every line is
voiced in advance and plays with no delay.
"""
import re

# Someone else is the patient: "he", "she", "someone", "my crewmate"... or a name ("Amir is...").
OTHER = re.compile(r"\b(he|she|they|him|her|them|his|their|he's|she's|they're|someone|somebody|crew ?mate|commander|"
                   r"engineer|doctor|specialist|patient|person|friend|colleague)\b", re.I)
NAMED = re.compile(r"\b(?!I\b|What\b|How\b|Why\b|Something\b|It\b|This\b|That\b|There\b)[A-Z][a-z]+ (has|is|isn't|can't|won't|fell|passed|hit|cut|burned)\b"
                   r"|\b(with|help) (?!Vitaly\b)[A-Z][a-z]+\b")
# Clearly about the speaker: "my chest", "I can't breathe", "I cut my arm".
SELF = re.compile(r"\bmy (chest|head|arm|leg|throat|hand|heart|breathing|breath|stomach|back)\b|"
                  r"\bi(?:'m| am| have|'ve| feel| can'?t| cannot| cut| hit| burned| burnt| think i)\b", re.I)

GUIDES = {
    "unresponsive": {
        "title": "Not breathing / unresponsive", "severity": "emergency",
        "match": r"not breathing|isn'?t breathing|stopped breathing|no pulse|unresponsive|unconscious|won'?t wake|not responding|collapsed|passed out and|c ?p ?r",
        "other_only": True,
        "say": {"other": "Okay. I'll talk you through C P R. Start now."},
        "steps": {"other": [
            "Shake their shoulders and shout their name. If there's no response and no normal breathing, carry on.",
            "Strap them to the C P R restraint, flat on their back, and brace your feet against the wall.",
            "Put the heel of your hand on the center of the chest, other hand on top, and push hard and fast. Two pushes a second.",
            "Keep going. Don't stop for more than a few seconds. If anyone else is nearby, shout for the defibrillator.",
            "When the defibrillator is there, switch it on and stick the pads on the bare chest, exactly as the pictures show.",
            "If it says shock, make sure nobody is touching them, then press the button. Then go straight back to pushing.",
            "Keep going until they breathe or move on their own. You're doing it right.",
        ]},
    },
    "choking": {
        "title": "Choking", "severity": "emergency",
        "match": r"chok(e|ing)|can'?t swallow|something stuck in (my|his|her|their) throat",
        "say": {"self": "Okay. If you can cough, cough hard. I'll guide you.",
                "other": "Okay. I'll talk you through it. Act now."},
        "steps": {
            "self": [
                "Cough as hard as you can, again and again.",
                "If that's not clearing it, make a fist just above your belly button, grab it with your other hand, and pull sharply in and up.",
                "Or brace against a handrail and drive your upper belly onto its edge, hard, several times.",
                "Once it's out, breathe slowly. Tell me if your throat still hurts or breathing feels tight.",
            ],
            "other": [
                "Ask them: are you choking? If they can cough or speak, tell them to keep coughing hard.",
                "If they can't, get behind them, hook a foot under a rail to anchor yourself, and wrap your arms around their waist.",
                "Make a fist just above their belly button, grab it with your other hand, and pull sharply in and up. Up to five times.",
                "Check their mouth. If you can see the object, hook it out with a finger.",
                "If they go limp and stop breathing, say not breathing and I'll guide you through C P R.",
            ],
        },
    },
    "chest_pain": {
        "title": "Chest pain", "severity": "emergency",
        "match": r"chest (pain|hurts?|ache|tight|pressure)|pain in (my|his|her|their|the) chest|(sharp|crushing|stabbing|tight)\w* .{0,20}chest|heart attack|chest .{0,15}(pain|hurt|tight)",
        "say": {"self": "Okay. Stop what you're doing. I'm with you, and we'll take this one step at a time.",
                "other": "Okay. Stay with them. I'll talk you through it one step at a time."},
        "steps": {
            "self": [
                "Strap yourself in, half sitting, with your knees bent. Loosen anything tight around your chest and neck.",
                "Breathe slowly. In through your nose, out through your mouth.",
                "Open the med kit and take the aspirin. Chew one tablet, don't swallow it whole. Skip this if you're allergic to aspirin.",
                "Tell me about the pain. Is it spreading to your arm, jaw, or back, or do you feel sick or sweaty? Just say yes or no.",
                "Stay still and keep breathing slowly. I'm watching your heart the whole time.",
                "If the pain isn't easing after five minutes, stay strapped in and keep resting. Say worse if it gets worse.",
            ],
            "other": [
                "Help them strap in, half sitting, with knees bent. Loosen anything tight around their chest and neck.",
                "Tell them to breathe slowly, in through the nose and out through the mouth.",
                "Get the aspirin from the med kit and have them chew one tablet. Skip this if they're allergic to aspirin.",
                "Ask them: is the pain spreading to the arm, jaw, or back? Do they feel sick or sweaty?",
                "Stay with them and keep them still and calm. Fetch the defibrillator and keep it beside you, just in case.",
                "If they collapse and stop breathing, say not breathing and I'll guide you through C P R.",
            ],
        },
    },
    "breathing": {
        "title": "Trouble breathing", "severity": "emergency",
        "match": r"can'?t breathe|trouble breathing|hard to breathe|short(ness)? of breath|struggling to breathe|can'?t catch (my|his|her|their) breath|wheez",
        "say": {"self": "Okay. I'm here. Let's get your breathing under control.",
                "other": "Okay. I'll talk you through helping them breathe."},
        "steps": {
            "self": [
                "Stop moving. Sit upright and lean slightly forward with your hands on your knees.",
                "Put on an oxygen mask from the nearest emergency panel and open the valve.",
                "Breathe in through your nose for two seconds, then out through pursed lips for four. Keep that rhythm.",
                "Look around: any smoke, or a strange smell? If so, say smoke.",
                "Keep the mask on and keep that rhythm. I'm watching your oxygen.",
            ],
            "other": [
                "Sit them upright, leaning slightly forward. Don't lay them flat.",
                "Put an oxygen mask on them from the nearest emergency panel and open the valve.",
                "Coach their breathing: in through the nose for two seconds, out through pursed lips for four.",
                "If they use an inhaler, help them take it now.",
                "If their lips turn blue or they stop breathing, say not breathing and I'll guide you through C P R.",
            ],
        },
    },
    "bleeding": {
        "title": "Bleeding", "severity": "emergency",
        "match": r"bleed(ing)?|cut (my|his|her|their)|deep cut|gash|blood (is )?(coming|everywhere|won'?t stop)",
        "say": {"self": "Okay. We'll stop the bleeding. Follow me.",
                "other": "Okay. I'll talk you through stopping the bleeding."},
        "steps": {
            "self": [
                "Press hard, directly on the wound, with a clean cloth or your hand. Don't let go.",
                "Raise the wound above your heart if you can.",
                "Keep pressing for a full ten minutes. Don't lift the cloth to look.",
                "If blood soaks through, put another cloth on top and press harder.",
                "When it slows, wrap a bandage firmly over the cloth. Blood floats in here, so wipe up any drops.",
            ],
            "other": [
                "Put on gloves if they're in reach. Press hard, directly on the wound, with a clean cloth.",
                "Raise the wound above their heart if you can.",
                "Keep pressing for a full ten minutes. Don't lift the cloth to look.",
                "If blood soaks through, add another cloth on top and press harder.",
                "If it's an arm or leg and it won't stop, put the tourniquet from the med kit above the wound and tighten until the bleeding stops.",
                "When it's under control, bandage firmly and keep them still and warm.",
            ],
        },
    },
    "fainting": {
        "title": "Faint or dizzy", "severity": "warning",
        "match": r"faint|dizzy|light.?headed|going to pass out|blacking out|room is spinning|passed out",
        "say": {"self": "Okay. Let's make sure you don't pass out.",
                "other": "Okay. I'll talk you through it."},
        "steps": {
            "self": [
                "Strap yourself in right now, flat if you can, with your legs raised against the wall.",
                "Breathe slowly and deeply.",
                "Drink some water or an electrolyte drink, in small sips.",
                "Stay flat for five minutes. I'm watching your blood pressure and heart rate.",
                "Get up slowly. If the dizziness comes back, strap in again.",
            ],
            "other": [
                "Strap them in flat, with their legs raised.",
                "Check they're breathing normally. If not, say not breathing.",
                "Loosen tight clothing and keep them cool.",
                "When they're awake, give small sips of water. Keep them flat for five minutes.",
            ],
        },
    },
    "burn": {
        "title": "Burn", "severity": "warning",
        "match": r"\bburn(ed|t)?\b|scald",
        "say": {"self": "Okay. Let's treat that burn.", "other": "Okay. I'll talk you through treating the burn."},
        "steps": {
            "self": [
                "Cool the burn with a water pouch or wet cloth for ten minutes. Not ice.",
                "Take off rings or anything tight near it before it swells.",
                "Cover it loosely with a burn dressing or clean film from the med kit.",
                "Don't pop any blisters. Tell me if it's bigger than your palm.",
            ],
            "other": [
                "Cool the burn with a water pouch or wet cloth for ten minutes. Not ice.",
                "Take off rings or anything tight near it before it swells.",
                "Cover it loosely with a burn dressing or clean film from the med kit.",
                "Don't pop any blisters. Keep them warm and resting.",
            ],
        },
    },
    "seizure": {
        "title": "Seizure", "severity": "emergency",
        "match": r"seizure|convuls|fitting|shaking uncontrollably|foaming|frothing|jerking|twitching all over|eyes? (have |are )?rolled",
        "other_only": True,
        "say": {"other": "Okay. Stay calm. I'll talk you through it."},
        "steps": {"other": [
            "Don't hold them down, and don't put anything in their mouth.",
            "Move hard or sharp things away, and cushion their head with something soft.",
            "Turn them onto their side so foam or vomit drains out of the mouth, and hold them there gently.",
            "Note the time. Most seizures stop on their own within a few minutes.",
            "When the shaking stops, keep them on their side, strap them in, and check they're breathing.",
            "If it lasts longer than five minutes, or they don't start breathing, say not breathing.",
        ]},
    },
    "head_injury": {
        "title": "Head injury", "severity": "warning",
        "match": r"hit (my|his|her|their) head|head injury|banged (my|his|her|their) head|concuss",
        "say": {"self": "Okay. Let's check you over.", "other": "Okay. I'll talk you through checking them."},
        "steps": {
            "self": [
                "Stop and strap in. Stay still for a moment.",
                "Hold something cold on the bump for ten minutes.",
                "Tell me: do you feel sick, confused, sleepy, or is your vision blurry? Yes or no.",
                "Rest for the next hour, no screens. Tell me straight away if a headache builds or you feel sick.",
            ],
            "other": [
                "Keep them still and strap them in.",
                "Hold something cold on the bump for ten minutes.",
                "Ask them their name and where they are. Check that both pupils are the same size.",
                "Watch them for the next hour. If they get confused, sleepy, or sick, keep them awake and resting.",
            ],
        },
    },
    "allergy": {
        "title": "Severe allergic reaction", "severity": "emergency",
        "match": r"allerg|anaphyla|throat (is )?(closing|swelling|tight)|(face|lips?|tongue) (is |are )?swell|swollen (face|lips?|tongue)|hives|broke out in",
        "say": {"self": "Okay. This could be a serious allergic reaction. Act fast, I'm with you.",
                "other": "Okay. This could be a serious allergic reaction. I'll talk you through it."},
        "steps": {
            "self": [
                "Get the adrenaline auto-injector from the med kit. It's the pen with the orange tip.",
                "Pull off the safety cap, press the orange tip hard into your outer thigh, and hold it for ten seconds.",
                "Strap in, half sitting if breathing is hard, or flat with legs raised if you feel faint.",
                "Put on an oxygen mask if your breathing is tight.",
                "If you're no better in five minutes, use the second pen in the other thigh.",
            ],
            "other": [
                "Get the adrenaline auto-injector from the med kit. It's the pen with the orange tip.",
                "Pull off the safety cap, press the orange tip hard into their outer thigh, through clothing is fine, and hold for ten seconds.",
                "Sit them up if breathing is hard, or lay them flat with legs raised if they feel faint. Strap them in.",
                "Put an oxygen mask on them if breathing is tight.",
                "If they're no better in five minutes, use the second pen in the other thigh.",
                "If they stop breathing, say not breathing and I'll guide you through C P R.",
            ],
        },
    },
    "stroke": {
        "title": "Possible stroke", "severity": "emergency",
        "match": r"stroke|face (is )?droop|droop(ing|y) face|slurr|can'?t (speak|talk|lift|move) |(arm|leg|side) (is |has gone )?(weak|numb)|numb on one side|sudden(ly)? confus",
        "say": {"self": "Okay. Let's check you quickly. Stay still.",
                "other": "Okay. Let's check them quickly. I'll talk you through it."},
        "steps": {
            "self": [
                "Strap yourself in and stay still. Note the time this started.",
                "Try to smile, and raise both arms. Does one side of your face droop or one arm drift down? Yes or no.",
                "Say a simple sentence out loud. Is it slurred or hard to get out? Yes or no.",
                "Don't eat, drink, or take any tablets, not even aspirin.",
                "Keep your head slightly raised and rest. I'm watching your blood pressure and heart.",
            ],
            "other": [
                "Strap them in and keep them still. Note the time this started.",
                "Ask them to smile and to raise both arms. Look for one side of the face drooping or one arm drifting down.",
                "Ask them to repeat a simple sentence. Listen for slurred or strange speech.",
                "Give them nothing to eat or drink, and no tablets, not even aspirin.",
                "Keep their head slightly raised, stay with them, and keep them calm.",
                "If they go unresponsive and stop breathing, say not breathing.",
            ],
        },
    },
    "poisoning": {
        "title": "Swallowed or breathed something harmful", "severity": "emergency",
        "match": r"poison|swallowed|drank (the|some|a) (wrong|chemical|cleaning|coolant)|overdos|too many (pills|tablets)|inhaled|breathed in (fumes|gas|chemical)|ammonia|coolant leak",
        "say": {"self": "Okay. Let's limit the damage. Follow me.", "other": "Okay. I'll talk you through it."},
        "steps": {
            "self": [
                "If it's fumes, put on a mask and move to another module right now.",
                "If you swallowed something, don't make yourself sick. Rinse your mouth and spit.",
                "Find the container or label and keep it with you, so you know exactly what it was.",
                "Sip a little water unless swallowing hurts.",
                "Strap in and rest. Tell me straight away if you feel drowsy, sick, or short of breath.",
            ],
            "other": [
                "If it's fumes, put on your own mask first, then move them to another module.",
                "If they swallowed something, don't make them sick. Have them rinse their mouth and spit.",
                "Find the container or label and keep it, so you know exactly what it was.",
                "If they're drowsy, strap them in on their side so they can't choke.",
                "If they stop breathing, say not breathing and I'll guide you through C P R.",
            ],
        },
    },
    "fracture": {
        "title": "Possible broken bone", "severity": "warning",
        "match": r"broke(n)? (my|his|her|their|the|an?) |broken (bone|arm|leg|wrist|ankle|finger|rib)|fractur|dislocat|bone (is )?sticking|can'?t move (my|his|her|their) (arm|leg|wrist|ankle|shoulder|fingers?)|twisted (my|his|her|their)|sprain",
        "say": {"self": "Okay. Let's keep it still and protect it.", "other": "Okay. I'll talk you through protecting the injury."},
        "steps": {
            "self": [
                "Stop using it and keep it exactly as it is. Don't try to straighten it.",
                "If there's a wound, cover it with a clean dressing and press gently around it, not on the bone.",
                "Splint it: pad it, then tape it to something rigid from the med kit, or strap an arm against your chest.",
                "Hold a cold pack on it for ten minutes.",
                "Check your fingers or toes beyond the injury. Tell me if they're numb, cold, or turning pale.",
            ],
            "other": [
                "Keep the injured part exactly as it is. Don't try to straighten it.",
                "If there's a wound, cover it with a clean dressing and press gently around it, not on the bone.",
                "Splint it: pad it, then tape it to something rigid from the med kit, or strap an arm against their chest.",
                "Hold a cold pack on it for ten minutes.",
                "Check the fingers or toes beyond the injury. They should be warm and pink, with feeling.",
            ],
        },
    },
    "eye": {
        "title": "Eye injury", "severity": "warning",
        "match": r"(something|chemical|liquid|dust|metal|shard|debris|splash\w*) .{0,15}(in|into) (my|his|her|their) eyes?|eyes? (is |are )?(burning|bleeding|injur)|can'?t see (anything|out of)|gone blind|lost (my|his|her|their) vision|eye injury",
        "say": {"self": "Okay. Don't rub it. Let's take care of your eye.", "other": "Okay. Don't let them rub it. I'll talk you through it."},
        "steps": {
            "self": [
                "Don't rub the eye.",
                "Take the eyewash goggles from the med kit, put them on, and flush the eye for fifteen minutes. Keep blinking.",
                "If something is stuck in the eye, don't try to pull it out.",
                "Cover the eye loosely with a clean pad and rest with both eyes closed.",
            ],
            "other": [
                "Stop them rubbing the eye.",
                "Fit the eyewash goggles from the med kit and flush the eye for fifteen minutes. Ask them to keep blinking.",
                "If something is stuck in the eye, don't try to pull it out.",
                "Cover the eye loosely with a clean pad and have them rest with both eyes closed.",
            ],
        },
    },
    "vomiting": {
        "title": "Vomiting", "severity": "warning",
        "match": r"vomit|throwing up|threw up|being sick|puking|can'?t keep (anything|food|water) down",
        "say": {"self": "Okay. Let's settle your stomach.", "other": "Okay. I'll talk you through looking after them."},
        "steps": {
            "self": [
                "Keep a sick bag sealed against your mouth. Loose vomit is a hazard in here.",
                "Strap in and keep your head still. Fix your eyes on one point.",
                "When it settles, take small sips of water, one mouthful every few minutes.",
                "If it keeps going, take the anti-sickness tablet from the med kit.",
                "Tell me if there's blood in it, or you can't keep water down for six hours.",
            ],
            "other": [
                "Give them a sick bag and have them hold it sealed against the mouth.",
                "Strap them in, upright or on their side, never flat on their back.",
                "When it settles, small sips of water, one mouthful every few minutes.",
                "If it keeps going, give the anti-sickness tablet from the med kit.",
                "If they're too drowsy to hold the bag, keep them on their side and stay with them.",
            ],
        },
    },
    "panic": {
        "title": "Panic", "severity": "warning",
        "match": r"panic|hyperventilat|freaking out|can'?t calm down|anxiety attack",
        "say": {"self": "Okay. You're safe. I'm right here. Let's slow everything down.",
                "other": "Okay. Stay calm yourself. I'll talk you through helping them."},
        "steps": {
            "self": [
                "Hold on to something solid and look at one fixed point.",
                "Breathe in through your nose for four seconds. Hold for two. Out through your mouth for six.",
                "Again. In for four. Hold for two. Out for six. Keep that going.",
                "Name five things you can see around you, out loud.",
                "Your heart rate and oxygen are being watched the whole time. This will pass in a few minutes.",
            ],
            "other": [
                "Get in front of them at eye level and speak slowly and quietly.",
                "Breathe with them: in through the nose for four seconds, hold for two, out for six.",
                "Keep that rhythm going with them for two minutes.",
                "Ask them to name five things they can see.",
                "Stay with them until their breathing is normal. It usually passes in a few minutes.",
            ],
        },
    },
    # Someone is clearly in trouble but nothing above matched: check the basics, then ask.
    "assess": {
        "title": "Check them over", "severity": "warning",
        "match": r"\b(is|looks?|seems?|feels?|went|gone|turned|has gone)\b.{0,30}\b(hurt|injured|unwell|sick|ill|pale|blue|grey|gray|limp|confused|not moving|not waking|in pain|wrong with)\b|something('?s| is) wrong with|needs? help|is down\b",
        "other_only": True, "needs_person": True,   # only when they are clearly talking about someone else
        "say": {"other": "Okay. Let's check them over together, step by step."},
        "steps": {"other": [
            "Speak to them and tap their shoulders. Do they answer you? If they don't respond at all, say not breathing.",
            "Watch their chest for ten seconds. If they aren't breathing normally, say not breathing.",
            "Look them over from head to toe for bleeding. If you find any, say bleeding.",
            "Strap them in somewhere they can rest, on their side if they're drowsy.",
            "Now tell me the main thing you can see: for example chest pain, seizure, choking, burn, or trouble breathing.",
        ]},
    },
}
for g in GUIDES.values():
    g["pattern"] = re.compile(g["match"], re.I)

# "I'm fine" style talk that happens to contain a keyword shouldn't start a guide.
NEGATED = re.compile(r"\b(no|not|don'?t have|isn'?t|without|any)\b.{0,12}\b(pain|bleeding|burn|dizzy|choking)\b", re.I)


def who(text):
    """'other' if they're describing someone else, else 'self'."""
    if SELF.search(text):
        return "self"
    if OTHER.search(text) or NAMED.search(text):
        return "other"
    return "self"


def match(text):
    """The guide for what the crew member just said, or None."""
    if NEGATED.search(text):
        return None
    someone = bool(OTHER.search(text) or NAMED.search(text)) and not SELF.search(text)
    for gid, g in GUIDES.items():
        if g.get("needs_person") and not someone:
            continue
        if g["pattern"].search(text):
            person = "other" if g.get("other_only") else who(text)
            return {"id": gid, "title": g["title"], "severity": g["severity"], "who": person,
                    "say": g["say"][person], "steps": g["steps"][person]}
    return None


def all_lines():
    out = []
    for g in GUIDES.values():
        out.extend(g["say"].values())
        for steps in g["steps"].values():
            out.extend(steps)
    return out
