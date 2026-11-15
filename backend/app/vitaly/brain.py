"""Vitaly's AI: one cheap model on OpenRouter, fed a compact snapshot of everything live.

Two jobs, both short:
  (alerts and symptom guides are preloaded text: watchdog.py, protocols.py, guides.py)
  ask(question)     a spoken answer of at most two sentences, plus an optional action to confirm

The model never decides that something is wrong (the watchdog does) and never invents numbers:
it only sees the snapshot. If OpenRouter is unreachable or the key is missing, both jobs fall
back to rule-based answers, so Vitaly never goes silent.

Settings (backend/.env): OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL.
"""
import json
import os
import re

import time

from .. import officer
from . import crew, guides, net, profile, quick, spend

URL = "https://openrouter.ai/api/v1/chat/completions"
# Picked by eval_vitaly.py (10 questions, twice): Gemini 3.1 Flash-Lite got every one right and was the fastest (about
# 0.5 s), at about $0.0003 an answer (3,000 answers per dollar). Mistral Nemo, the earlier pick, got 9 of 10 and is the backup.
DEFAULT_MODEL = "google/gemini-3.1-flash-lite"
DEFAULT_FALLBACK = "mistralai/mistral-nemo"
TIMEOUT_S = 6

ACTIONS = ("log_countermeasure", "note_earth")


def settings():
    return {
        "key": os.getenv("OPENROUTER_API_KEY", "").strip(),
        "model": os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        "fallback": os.getenv("OPENROUTER_FALLBACK_MODEL", DEFAULT_FALLBACK).strip() or DEFAULT_FALLBACK,
    }


def status():
    s = settings()
    return {"ai": bool(s["key"]) and not spend.exhausted(), "model": s["model"], "fallback": s["fallback"], **spend.status()}


# ---------- the snapshot the model reads ----------

def snapshot(state, sim, focus=None, brief=True):
    """Everything live, as compact text. Only numbers from here may be spoken.
    brief: each organ keeps its status, value and note, but the list of what is off ("Not OK: blood oxygen 86%...") is left
    out unless the organ is the one being looked at. That list tempted the model to bring up whatever was flagged
    ("Is it normal to feel queasy?" got "your blood oxygen is 86 percent"). Without the value and note it had nothing to
    quote and made a number up, so those stay."""
    p = profile.profile(crew.PATIENT_ID)
    r = sim.recent
    lines = []
    open_inc = [i for i in sim.incidents if i["state"] == "open"]
    if open_inc:  # first, so small models notice them
        lines.append("ACTIVE ALERTS (most important):")
        for i in open_inc:
            lines.append(f"- [{i['severity']}] {i['title']}: {i['value']}. Guide being followed: {' '.join(i['guide'])}")
    else:
        lines.append("ACTIVE ALERTS: none.")
    lines += [
        f"Crew member: {p['name']} (Crew {crew.PATIENT_ID}), age {p.get('age', '?')}. "
        f"Conditions: {', '.join(p['conditions']) or 'none'}.",
        f"Mission: {state['mission_name']} day {state['day']}, phase {state['phase']}. "
        f"Earth comms delay one way: {state['comms_delay_min']:.1f} min.",
        f"Radiation: {state['radiation_msv']:.0f} mSv of 600 career limit ({state['radiation_pct_of_career_limit']:.0f}%)."
        + (" Solar storm active." if state.get("storm") else ""),
        "Cabin: " + ", ".join(f"{label} {fmt(r(m))}{unit}" for m, label, unit in (
            ("cabin_pressure_kpa", "pressure", " kPa"), ("ppo2_kpa", "oxygen", " kPa"), ("co2_mmhg", "CO2", " mmHg"),
            ("cabin_temp_c", "temperature", " C"), ("noise_dba", "noise", " dBA"))) + ".",
        "Organs (status, value, any check not OK):",
    ]
    for oid in state["risk_ranking"]:
        o = state["organs"][oid]
        bad = [f"{c['name']} {c['value']} {c['unit']} ({c['verdict']}, healthy {c['healthy']})"
               for c in o.get("checks", []) if c["verdict"] != "ok"]
        mark = " <- user is looking at this" if oid == focus else ""
        detail = bad and not (brief and oid != focus)
        lines.append(f"- {o['name']}: {o['status']}, {o['value']} {o['unit']}. {o['note']}"
                     + (f" Not OK: {'; '.join(bad)}." if detail else "") + mark)
    cms = [f"{oid}:{c['id']} ({c['label']})" for oid in state["organs"] for c in state["organs"][oid]["countermeasures"]]
    lines.append("Countermeasures that can be logged: " + "; ".join(cms))
    return "\n".join(lines)


def fmt(v):
    return "?" if v is None else f"{v:.1f}"


# ---------- model calls ----------

PERSONA = ("You are Vitaly, the onboard medical AI on a crewed Mars mission. Calm, brief, precise, like a co-pilot. "
           "You speak out loud, so use plain words and short sentences, no lists, no markdown. "
           "ANSWER EXACTLY WHAT WAS ASKED, and nothing else. Do not bring up other readings or alerts unless they directly answer "
           "the question. A question about the heart gets heart numbers; a question about a knee gets nothing about the heart. "
           "Quote numbers exactly as written in DATA. Never work out differences or percentages yourself. "
           "General knowledge about spaceflight medicine and first aid is fine, kept to two short sentences; for facts about the crew "
           "member, use only DATA. "
           "Never diagnose. If asked about an injury or symptom, give the one safest first-aid action in plain words "
           "(stop, keep it still and supported, cold pack, press on bleeding), then one thing to watch for. "
           "If you do not know, say so briefly. "
           "When asked how they are doing or what is wrong, name the most serious active alert first. "
           "Speak to the crew member directly as you; do not say their full name. Refer to anyone else by name or role, never he or she. "
           "There is no one to call: the crew member handles it with your guidance. Never say help is coming. "
           "If something is life-threatening, say what to do right now.")


async def complete(messages, max_tokens, model=None):
    """One model call. None if there is no key, the spend cap is reached, or the call fails. `model` overrides the setting
    (for comparing models)."""
    s = settings()
    if not s["key"] or spend.exhausted():
        return None
    if model:
        s = {**s, "model": model, "fallback": model}
    # provider.sort = latency: OpenRouter picks whichever host is answering fastest right now. The
    # same model took 1.5 s typically and 3 s at worst; this makes it about 0.5 s.
    body = {"model": s["model"], "models": [s["model"], s["fallback"]], "messages": messages,
            "max_tokens": max_tokens, "temperature": 0.3, "provider": {"sort": "latency"}, "usage": {"include": True}}
    try:
        r = await net.client().post(URL, json=body, headers={"Authorization": f"Bearer {s['key']}"}, timeout=TIMEOUT_S)
        r.raise_for_status()
        data = r.json()
        cost = (data.get("usage") or {}).get("cost")
        spend.add(cost)
        return {"text": data["choices"][0]["message"]["content"].strip(), "model": data.get("model", s["model"]), "cost": cost}
    except Exception:
        return None


# Voice commands are matched by rules first: instant, free and never confused by a small model.
COMMANDS = [
    ("note_earth", re.compile(r"\b(tell|send|message|note|notify)\b.{0,30}\b(earth|ground|flight surgeon|houston|mission control)\b", re.I)),
    ("log_countermeasure", re.compile(r"\b(log|record|i did|i've done|i have done|i finished|done with)\b", re.I)),
]
# Words people use -> countermeasure id.
LOG_WORDS = [
    (r"treadmill|run|jog|cycl|bike|cardio", "heart", "cardio_45"),
    (r"resistive|weights?|lift|squat|ared|strength", "muscles", "ared_60"),
    (r"negative pressure|lbnp", "heart", "lbnp_30"),
    (r"sleep", "sleep", "sleep_plan"),
    (r"call(ed)? home|video", "sleep", "call_home"),
    (r"thigh cuff|cuffs", "eyes", "thigh_cuff"),
    (r"vitamin|b complex", "eyes", "b_complex"),
    (r"earplug|ear plug|fan", "ears", "ear_protection"),
    (r"scrubber|air check", "lungs", "air_check"),
]


QUESTION = re.compile(r"^\s*(how|what|when|where|why|who|which|does|do|is|are|can|could|will|would|should)\b", re.I)


def command(question, state, sim):
    """A recognised voice command -> (say, action), or None to let the AI answer.
    Questions ("how long does a message take to reach Earth?") are never commands."""
    if QUESTION.search(question) and not re.search(r"\b(can|could|would|will) you\b", question, re.I):
        return None
    for kind, pattern in COMMANDS:
        if not pattern.search(question):
            continue
        if kind == "note_earth":
            text = re.split(r"\b(?:that|saying|:)\b", question, maxsplit=1)
            body = text[1].strip() if len(text) > 1 and text[1].strip() else question
            return f"Send this to the flight surgeon: {body}. Say yes to confirm.", {"type": "note_earth", "text": body}
        if kind == "log_countermeasure":
            for words, organ, cid in LOG_WORDS:
                if re.search(words, question, re.I):
                    cm = next((c for c in state["organs"][organ]["countermeasures"] if c["id"] == cid), None)
                    if cm:
                        return (f"Log {cm['label'].lower()} for your {state['organs'][organ]['name'].lower()}? Say yes to confirm.",
                                {"type": "log_countermeasure", "organ": organ, "id": cid})
            return None
    return None


async def ask(question, state, sim, focus=None, current=None):
    """Spoken answer (max two sentences) and an optional action for the crew member to confirm.
    `current` is the guide being walked through ({"id", "who"}), so "it's for my teammate" can change the patient."""
    guide = guides.match(question)
    if not guide:
        patient = guides.retarget(question, current)
        if patient:
            guide = guides.build(current["id"], patient, ack=True)
    if guide:
        return {"say": guide["say"], "action": None, "engine": "guide",
                "guide": {**guide, "readings": readings_line(guide, sim, state)}}
    cmd = command(question, state, sim)
    if cmd:
        return {"say": cmd[0], "action": cmd[1], "engine": "command"}
    fast = quick.answer(question, state, sim) if instant_allowed(question, current) else None
    if fast:
        return {"say": fast, "action": None, "engine": "instant"}
    key = cache_key(question, state, sim, focus, current)
    hit = _replies.get(key)
    if hit and time.time() - hit[0] < REPLY_TTL_S:
        return {**hit[1], "engine": hit[1]["engine"] + " (cached)"}
    reply = await ask_model(question, state, sim, focus, current)
    if reply["engine"] != "rules":
        _replies[key] = (time.time(), reply)
        if len(_replies) > 300:
            _replies.pop(next(iter(_replies)))
    return {**reply}


def readings_line(guide, sim, state=None):
    """What the sensors show right now, said once at the start of a guide about the crew member
    themselves. Vitaly can't see anyone else's body, so there is no line for "other"."""
    if guide["who"] != "self":
        return None
    if state and guide["id"] in ("fracture", "sprain", "cramp"):
        return injury_line(guide["id"], state)
    hr, spo2 = quick.val(sim, "heart_rate"), quick.val(sim, "spo2")
    irregular = quick.val(sim, "ecg_irregular") >= 0.5
    p = profile.profile(crew.PATIENT_ID)
    if guide["id"] in ("chest_pain", "fainting"):
        line = f"Your heart rate is about {quick.about(hr, 2)}, rhythm {'irregular' if irregular else 'regular'}, oxygen {quick.about(min(spo2, 100), 1)} percent."
        if irregular and p["conditions"]:
            line += " That looks like your atrial fibrillation."
        elif not irregular and 50 <= hr <= 100 and spo2 >= 95:
            line += " Those look steady, which is a good sign."
        return line
    if guide["id"] == "breathing":
        return f"Your blood oxygen is {quick.about(min(spo2, 100), 1)} percent and cabin oxygen is {quick.val(sim, 'ppo2_kpa'):.0f} kilopascals."
    return None


def injury_line(gid, state):
    """The crew member says what hurts; their own data says whether it fits. Never a diagnosis:
    a break needs a scan, so the line points to the med bay ultrasound."""
    if gid == "fracture":
        b = state["organs"].get("bones") or {}
        v = b.get("value")
        if not isinstance(v, (int, float)) or v >= 100:
            return "Treat it as a break until it's checked. The med bay ultrasound can show a crack in the bone."
        return (f"Your bones are an estimated {round(100 - v, 1)} percent thinner than at launch, so treat it as a break "
                "until it's checked. The med bay ultrasound can show a crack in the bone.")
    a = (state["organs"].get("muscles") or {}).get("analysis") or {}
    status, acwr, rec = a.get("status"), a.get("acwr"), a.get("recovery")
    if status is None or acwr is None or rec is None:
        return None
    pct = abs(round(100 * (acwr - 1)))
    if status in ("overreaching", "high load"):
        return f"That fits your data: your training load this week is {pct} percent above your four-week normal, and recovery is {rec:.0f} out of 100."
    if status == "under-recovered":
        return f"That fits your data: you've kept training hard while your recovery is low, {rec:.0f} out of 100."
    if status == "undertrained":
        return f"Your training load is {pct} percent below your four-week normal. Muscles that do less get weaker and strain more easily."
    return "Your training load has been normal this week, so this looks like a one-off, not overuse."


# AI replies are reused for the same question while the situation is the same.
REPLY_TTL_S = 120
_replies = {}


# Instant answers whose trigger words turn up in first-aid talk ("the cold pack", "pressure on it", "I'm tired"): while a guide is
# running, those sentences go to the contextual AI instead. Status questions ("how am I doing", "when will Earth answer") still
# get their instant answer.
GUIDE_BLOCKED_INTENTS = {"cabin", "muscles", "sleep", "bones", "eyes", "ears", "mission"}


def instant_allowed(question, current):
    """False when a guide is running and the instant answer would only be a keyword accident."""
    in_guide = bool(current and current.get("id") in guides.GUIDES)
    return not (in_guide and quick.intent(question) in GUIDE_BLOCKED_INTENTS)


def guide_context(current):
    """One line saying which guide the crew member is in the middle of, and the step they are on (or None)."""
    g = guides.GUIDES.get((current or {}).get("id"))
    who = (current or {}).get("who")
    if not g or who not in g["steps"]:
        return None
    steps, i = g["steps"][who], max(0, min(int((current or {}).get("step") or 0), len(g["steps"][who]) - 1))
    return (f"The crew member is being talked through first aid for \"{g['title']}\" ({'for themselves' if who == 'self' else 'for someone else'}), "
            f"now on step {i + 1} of {len(steps)}: \"{steps[i]}\" Answer what they just said in that context, as someone standing beside them: "
            "acknowledge it, then say what it means for the step or what to do next. Remind them they can say next when they are ready.")


def cache_key(question, state, sim, focus, current=None):
    words = re.sub(r"[^a-z0-9 ]", "", question.lower())
    words = " ".join(w for w in words.split() if w not in {"hey", "vitaly", "vitali", "please", "um", "uh", "so", "the", "a"})
    situation = (tuple(sorted(i["kind"] for i in sim.incidents if i["state"] == "open")),
                 tuple(state["organs"][k]["status"] for k in sorted(state["organs"])), focus)
    return (words, situation, (current or {}).get("id"), (current or {}).get("step"))


async def ask_model(question, state, sim, focus, current=None):
    context = guide_context(current)
    prompt = (f"DATA:\n{snapshot(state, sim, focus)}\n\n" + (f"{context}\n\n" if context else "") + f"Crew member says: \"{question}\"\n\n"
              "Reply with JSON only: {\"say\": \"at most two short sentences\", \"action\": null} "
              "or with action set to one of: "
              "{\"type\": \"log_countermeasure\", \"organ\": \"...\", \"id\": \"...\"}, {\"type\": \"note_earth\", \"text\": \"...\"}. "
              "Only propose an action if they ask for one; the say text should then ask them to confirm.")
    out = await complete([{"role": "system", "content": PERSONA}, {"role": "user", "content": prompt}], 110)
    if out:
        parsed = parse_json(out["text"])
        if parsed and parsed.get("say"):
            return {"say": first_sentences(clean(parsed["say"]), 2), "action": valid_action(parsed.get("action"), state),
                    "engine": out["model"]}
        if out["text"] and "{" not in out["text"]:
            return {"say": first_sentences(clean(out["text"]), 2), "action": None, "engine": out["model"]}
    rules = officer.answer(question, state)
    return {"say": first_sentences(rules["answer"], 2), "action": None, "engine": "rules"}


# ---------- helpers ----------

def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def valid_action(a, state):
    if not isinstance(a, dict) or a.get("type") not in ACTIONS:
        return None
    if a["type"] == "log_countermeasure":
        organ = state["organs"].get(a.get("organ"))
        if not organ or a.get("id") not in {c["id"] for c in organ["countermeasures"]}:
            return None
    if a["type"] == "note_earth" and not str(a.get("text", "")).strip():
        return None
    return a


def clean(text):
    return re.sub(r"[*_#`>]", "", text).replace("\n", " ").strip().strip('"')


ABBREVIATIONS = ("Dr.", "Cmdr.", "Mr.", "Ms.", "Mrs.", "vs.", "e.g.", "i.e.", "approx.")


def first_sentences(text, n):
    """First n sentences. Doesn't split after a number ("1.") or a title ("Dr. Chen")."""
    out, start = [], 0
    for m in re.finditer(r"(?<=[A-Za-z)%][.!?])\s+", text):
        piece = text[start:m.start()].strip()
        if piece.endswith(ABBREVIATIONS):
            continue
        out.append(piece)
        start = m.end()
        if len(out) == n:
            return " ".join(out)
    out.append(text[start:].strip())
    return " ".join(p for p in out[:n] if p)
