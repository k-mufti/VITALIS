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
NAMED = re.compile(r"\b(?!I\b)[A-Z][a-z]+ (has|is|isn't|can't|won't|fell|passed|hit|cut|burned)\b")
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
        "match": r"seizure|convuls|fitting|shaking uncontrollably",
        "other_only": True,
        "say": {"other": "Okay. Stay calm. I'll talk you through it."},
        "steps": {"other": [
            "Don't hold them down, and don't put anything in their mouth.",
            "Move hard or sharp things away, and cushion their head with something soft.",
            "Note the time. Most seizures stop on their own within a few minutes.",
            "When the shaking stops, strap them in on their side and check they're breathing.",
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
    for gid, g in GUIDES.items():
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
