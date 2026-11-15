"""More first-aid guides for Vitaly, from the injury drill's library (src/ui/injury-library.js).

The drill already has careful, space-aware first aid for 26 injuries, written by the team. Vitaly had 17 guides of
its own and sent everything else to the AI, which could answer a torn ACL with the crew member's heart rate. Now
the injuries Vitaly lacked ("sprain, torn ligament, ACL", nosebleed, back pain, electric shock and so on) use the
same steps, so what Vitaly says matches what the drill shows.

The steps are exported from the JS by tools/export-injuries.mjs into injury_data.json (run it after editing the
library). Only the matching words live here: each pattern is deliberately narrow, because a loose one ("head", "hot",
"back") would turn an ordinary question into first aid.

Standalone like every Vitaly guide: lines that told the crew member to wait on a call to ground are reworded so the
steps never depend on Earth answering.
"""
import json
import re
from pathlib import Path

from .injury_voice import SAY, VOICE

DATA = json.loads((Path(__file__).with_name("injury_data.json")).read_text())["injuries"]

# id in the library -> (what the crew member says, guide this one must come before, so it is not taken by a broader one)
MATCH = {
    "sprain": (r"sprain|strain(ed)?\b|twisted|rolled (my|his|her|their) ankle|pulled (a |my |his |her |their )?(muscle|hamstring|groin|calf|thigh|back)|"
               r"\btorn?\b|\btore\b|tear(ing)? (a |my |his |her |their )?(muscle|ligament|tendon)|ligament|tendon|\ba\.?\s?c\.?\s?l\b|\bm\.?\s?c\.?\s?l\b|"
               r"menisc|hamstring|(knee|ankle|wrist|elbow) (gave out|buckled|is swollen|swelling|hurts?|is killing)", "fracture"),
    "dislocation": (r"disloc|popped out|out of (its )?socket|(shoulder|hip|finger|elbow|jaw) (is )?(out|popped)", "fracture"),
    "nosebleed": (r"nose ?bleed|bleeding (from )?(my |his |her |their )?nose|bloody nose", "bleeding"),
    "puncture": (r"\bstab(bed)?\b|impal|pierced|(something|a (shard|splinter|piece)|metal|glass) (is )?(stuck|lodged|embedded) in", "bleeding"),
    "back": (r"back pain|(my|his|her|their) back (hurts|is (killing|sore|stiff))|pulled (a |my )?back|slipped disc|lower back|back spasm", None),
    "nail": (r"fingernail|finger nail|nail (tore|ripped|came off|is (torn|ripped|bleeding))|glove (pinch|cut)", None),
    "ear": (r"ear (pain|pressure|hurts|ache|is blocked|is popping)|ears? (hurt|are popping|won'?t pop)|earache", None),
    "kidney": (r"kidney|flank pain|pain in (my|his|her|their) (side|flank)", None),
    "bends": (r"the bends|decompression sickness|joint pain after (a )?(spacewalk|eva)", None),
    "radiation": (r"radiation sickness", None),
    "cold": (r"frost ?bite|frostnip|(fingers?|hands?|toes?) (are |is )?(freezing|frozen|numb and cold)", None),
    "crush": (r"crush(ed)?|pinched (in|by|between)|caught in (the )?(hatch|door)|slammed (my|his|her|their)? ?(finger|hand)", None),
    "tooth": (r"tooth ?ache|\btooth\b|dental|\bgum(s)?\b", None),
    "rash": (r"\brash\b|itchy skin|skin (is )?(red|irritated)", None),
    "bruise": (r"\bbruis(e|ed|ing)\b|\bbumped\b", None),
    "shock": (r"electric(al)? shock|shocked|electrocut|zapped|got a shock", None),
}

# Library lines that say to wait on a call to ground, in words the guide can use without it. Keyed by id and the
# start of the line.
REWORD = {
    ("puncture", "Call ground"): "Leave it where it is. Do not pull anything out.",
    ("dislocation", "Call ground"): "Keep it supported and still. Do not force it back in.",
    ("bends", "Tell ground"): "This is serious. Keep them resting and breathing oxygen from the mask.",
    ("shock", "Call ground"): "Even if they feel fine, keep them resting and watch their heart. Shocks can upset the rhythm.",
    ("kidney", "Rest strapped in. Ground"): "Rest strapped in and keep drinking water.",
}


def _steps(inj_id):
    inj = DATA[inj_id]
    steps = []
    for s in inj["steps"]:
        steps.append(next((new for (i, start), new in REWORD.items() if i == inj_id and s.startswith(start)), s))
    if inj["help"]:
        steps.append("Watch for these warning signs: " + "; ".join(h.rstrip(".").lower() for h in inj["help"]) + ". They mean it is serious.")
    if inj["space"]:
        steps.append("In space, remember: " + inj["space"][0].lower() + inj["space"][1:])
    if inj["limits"]:
        steps.append(inj["limits"])
    return steps


SWITCH = re.compile(r"\{([^{}|]*)\|([^{}]*)\}")


def expand(text, who):
    """Pick the {you|them} wording for this patient."""
    return SWITCH.sub(lambda m: m.group(1) if who == "self" else m.group(2), text)


def build():
    out = {}
    for inj_id, (pattern, before) in MATCH.items():
        inj = DATA[inj_id]
        voice = VOICE.get(inj_id)
        if voice:     # the spoken script (injury_voice.py): a companion talking someone through it
            open_self, open_other, script = voice
            steps = {w: [expand(s, w) for s in script] for w in ("self", "other")}
            say = {"self": open_self or SAY["self"], "other": open_other or SAY["other"]}
            say = {w: expand(t, w) for w, t in say.items()}
        else:         # no script yet: the library's own terse steps
            steps = {"self": _steps(inj_id), "other": _steps(inj_id)}
            say = {"self": "Okay. I'll talk you through it. Stay calm, I'm with you.",
                   "other": "Okay. I'll talk you through helping them. Stay calm."}
        out[inj_id] = {"title": inj["title"], "severity": "emergency" if inj["urgent"] else "warning", "match": pattern, "before": before,
                       "say": say, "steps": steps}
    return out


GUIDES = build()
