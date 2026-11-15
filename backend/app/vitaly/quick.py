"""Instant answers for everyday questions, written from live data with no AI call.

"How am I?", "how's my heart?", "what's my oxygen?", "how much radiation?" are asked over and over. Matching them by keywords and filling a sentence from the live
state takes a millisecond and can't get a number wrong. Numbers are rounded the way a person
says them ("about 65"), so the sentence rarely changes and its audio can be voiced in advance.
Only questions that match nothing here go to the AI.
"""
import re
import time

from ..analysis.common import Reader


def val(sim, metric):
    """Latest smoothed reading, or the body model's value before any reading has arrived."""
    return Reader(sim, sim.mods, sim.relief, sim.mission, sim.day, live=True)(metric)

# (intent, pattern). First match wins, so specific intents come before broad ones.
INTENTS = [
    ("todo", r"\bwhat (should|do|can) i do\b|\bwhat now\b|\bnext steps?\b|\bwhat'?s the plan\b"),
    ("alerts", r"\b(what('?s| is) (wrong|happening|going on)|any (alerts?|problems?|issues?)|is (anything|something) wrong)\b"),
    ("heart", r"\b(heart|pulse|bpm|cardio|rhythm|blood pressure|bp)\b"),
    ("oxygen", r"\b(oxygen|o2|spo2|breath(e|ing)?|lungs?)\b"),
    ("cabin", r"\b(cabin|air|pressure|co2|carbon dioxide|temperature|hot|cold|smoke)\b"),
    ("radiation", r"\b(radiation|dose|sievert|msv|storm|flare|dosimeter|solar (storm|flare|wind|particle|activity|weather))\b"),
    ("sleep", r"\b(sleep|slept|tired|fatigue|rest(ed)?|exhausted)\b"),
    ("muscles", r"\b(muscles?|legs?|strength|workout|exercise|training)\b"),
    ("bones", r"\b(bones?|density|hips?|spine)\b"),
    ("eyes", r"\b(eyes?|vision|optic|blurr?y|(can'?t|cannot|can) i see)\b"),
    ("ears", r"\b(ears?|hearing|noise|loud|balance|dizzy|nause)\b"),
    ("comms", r"\b(delay|comms?|signal|houston|mission control|flight surgeon)\b|\b(message|call|talk|reach|contact|radio|send|reply)\b.{0,25}\bearth\b|\bearth\b.{0,20}\b(delay|message|reply|response)\b"),
    ("mission", r"\b(what day|which day|mission day|how far|arriv(e|al)|landing|when do we land)\b"),
    ("status", r"\b(how am i|how'?m i|am i (ok|okay|alright|fine|healthy)|status|overall|how('?s| is) (my )?(body|health)|report)\b"),
]
INTENTS = [(name, re.compile(p, re.I)) for name, p in INTENTS]


def intent(question):
    for name, pattern in INTENTS:
        if pattern.search(question):
            return name
    return None


def about(v, step):
    """Round the way people speak: about 65, not 64.7."""
    return int(round(v / step) * step)


def answer(question, state, sim):
    """Spoken answer for an everyday question, or None to let the AI handle it."""
    name = intent(question)
    if not name:
        return None
    return ANSWERS[name](state, sim)


def open_alerts(sim):
    order = {"emergency": 0, "warning": 1}
    return sorted((i for i in sim.incidents if i["state"] == "open"), key=lambda i: order.get(i["severity"], 2))


def organ_line(o):
    bad = [c for c in o.get("checks", []) if c["verdict"] != "ok"]
    if not bad:
        return f"Your {o['name'].lower()} {'are' if o['name'].endswith('s') else 'is'} fine."
    c = bad[0]
    return f"{c['name']} is {c['value']} {c['unit']}, healthy is {c['healthy']}."


def status(state, sim):
    alerts = open_alerts(sim)
    if alerts:
        return f"Active alert: {alerts[0]['title'].lower()}. {alerts[0]['say'].split('. ')[1] if '. ' in alerts[0]['say'] else ''}".strip()
    watch = [state["organs"][k] for k in state["risk_ranking"] if state["organs"][k]["status"] != "OK"]
    if not watch:
        return "Everything is in your normal range. No alerts."
    names = " and ".join(o["name"].lower() for o in watch[:2])
    return f"No alerts. {names.capitalize()} need a look: {watch[0]['note']}"


def heart(state, sim):
    o = state["organs"]["heart"]
    hr = val(sim, "heart_rate") or o["value"]
    sys_, dia = val(sim, "bp_sys"), val(sim, "bp_dia")
    line = f"Heart rate about {about(hr, 2)}, blood pressure about {about(sys_, 5)} over {about(dia, 5)}." if sys_ else f"Heart rate about {about(hr, 2)}."
    if (val(sim, "ecg_irregular") or 0) >= 0.5:
        return line + " Your rhythm is irregular. Stay strapped in; the medical officer has your ECG."
    return line + (" All in your normal range." if o["status"] == "OK" else f" {o['note']}")


def oxygen(state, sim):
    spo2, resp = val(sim, "spo2"), val(sim, "resp_rate")
    ppo2 = val(sim, "ppo2_kpa")
    line = f"Blood oxygen {about(min(spo2, 100), 1)} percent, breathing {about(resp, 1)} a minute."
    if ppo2 is not None and ppo2 < 19.5:
        return line + " Cabin oxygen is low, so put on a mask if you feel short of breath."
    return line + (" That's normal." if spo2 >= 95 else " That's low. Put on an oxygen mask.")


def cabin(state, sim):
    p, o2, co2, t = (val(sim, "cabin_pressure_kpa"), val(sim, "ppo2_kpa"), val(sim, "co2_mmhg"), val(sim, "cabin_temp_c"))
    issues = [c for c in state["organs"]["lungs"]["checks"] if c["verdict"] != "ok" and c["id"] in ("ppo2", "co2", "cabin_pressure")]
    line = f"Cabin pressure {p:.0f} kilopascals, oxygen {o2:.0f}, CO2 {co2:.1f}, temperature {about(t, 1)} degrees."
    if (val(sim, "smoke_index") or 0) > 0.3:
        return "Smoke is detected. Mask on and move away from it. " + line
    if issues:
        return line + f" {issues[0]['name']} is outside the safe range."
    return line + " The air is safe."


def radiation(state, sim):
    line = f"You've had about {about(state['radiation_msv'], 5)} millisieverts, {about(state['radiation_pct_of_career_limit'], 1)} percent of your career limit."
    if state.get("storm"):
        return "A solar storm is active. Stay in the shelter. " + line
    return line + " Space weather is quiet."


def sleep(state, sim):
    hours = val(sim, "sleep_hours") or state["organs"]["sleep"]["value"]
    o = state["organs"]["sleep"]
    if hours < 7:
        return f"You slept about {hours:.1f} hours, under the 7 you need. Protect tonight's sleep and keep today's hard tasks short."
    return f"You slept about {hours:.1f} hours. That's enough. " + ("" if o["status"] == "OK" else o["note"])


def muscles(state, sim):
    a = state["organs"]["muscles"].get("analysis", {})
    status_word = a.get("status", "")
    rec = a.get("recovery")
    line = f"Training is {status_word}" + (f", recovery {rec} out of 100." if rec is not None else ".")
    if status_word == "undertrained":
        return line + " Missed sessions are costing you strength. Do your resistive workout today."
    return line + " " + state["organs"]["muscles"]["note"]


def bones(state, sim):
    o = state["organs"]["bones"]
    return f"Estimated bone loss is {100 - o['value']:.1f} percent since launch. It's checked by scan after landing. Keep up the resistive exercise."


def eyes(state, sim):
    return organ_line(state["organs"]["eyes"]) + " Next eye ultrasound is on the weekly schedule."


def ears(state, sim):
    return organ_line(state["organs"]["ears"])


def todo(state, sim):
    alerts = open_alerts(sim)
    if alerts:
        return alerts[0]["guide"][0]
    top = state["organs"][state["risk_ranking"][0]]
    cm = top["countermeasures"][0] if top["countermeasures"] else None
    return f"Top priority is your {top['name'].lower()}. Best next step: {cm['label'].lower()}." if cm else "Nothing urgent. Keep to today's plan."


def alerts(state, sim):
    found = open_alerts(sim)
    if not found:
        return "No alerts. Everything I'm watching is in range."
    names = ", ".join(i["title"].lower() for i in found[:3])
    return f"{len(found)} active alert{'s' if len(found) > 1 else ''}: {names}."


def comms(state, sim):
    return f"A message takes about {state['comms_delay_min']:.0f} minutes to reach Earth, so {round(2 * state['comms_delay_min']):.0f} minutes for a reply."


def mission(state, sim):
    left = state["arrival_day"] - state["day"]
    where = f"{left} days until arrival" if left > 0 else "we're past arrival"
    return f"It's day {state['day']} of the {state['mission_name']} mission, {where}."


ANSWERS = {"status": status, "heart": heart, "oxygen": oxygen, "cabin": cabin, "radiation": radiation, "sleep": sleep,
           "muscles": muscles, "bones": bones, "eyes": eyes, "ears": ears, "todo": todo,
           "alerts": alerts, "comms": comms, "mission": mission}


def all_answers(state, sim):
    """Every everyday answer for the current state (to voice them in advance)."""
    out = []
    for fn in ANSWERS.values():
        try:
            out.append(fn(state, sim))
        except Exception:
            pass
    return out
