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

import httpx

import time

from .. import officer
from . import crew, guides, profile, quick

URL = "https://openrouter.ai/api/v1/chat/completions"
# Picked by eval_vitaly.py: best answers of the cheap models tested, ~$0.03 per 1M tokens in and out.
DEFAULT_MODEL = "mistralai/mistral-nemo"
DEFAULT_FALLBACK = "meta-llama/llama-3.1-8b-instruct"
TIMEOUT_S = 8

ACTIONS = ("log_countermeasure", "note_earth")


def settings():
    return {
        "key": os.getenv("OPENROUTER_API_KEY", "").strip(),
        "model": os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        "fallback": os.getenv("OPENROUTER_FALLBACK_MODEL", DEFAULT_FALLBACK).strip() or DEFAULT_FALLBACK,
    }


def status():
    s = settings()
    return {"ai": bool(s["key"]), "model": s["model"], "fallback": s["fallback"]}


# ---------- the snapshot the model reads ----------

def snapshot(state, sim, focus=None):
    """Everything live, as compact text (~1k tokens). Only numbers from here may be spoken."""
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
        lines.append(f"- {o['name']}: {o['status']}, {o['value']} {o['unit']}. {o['note']}"
                     + (f" Not OK: {'; '.join(bad)}." if bad else "") + mark)
    cms = [f"{oid}:{c['id']} ({c['label']})" for oid in state["organs"] for c in state["organs"][oid]["countermeasures"]]
    lines.append("Countermeasures that can be logged: " + "; ".join(cms))
    return "\n".join(lines)


def fmt(v):
    return "?" if v is None else f"{v:.1f}"


# ---------- model calls ----------

PERSONA = ("You are Vitaly, the onboard medical AI on a crewed Mars mission. Calm, brief, precise, like a co-pilot. "
           "You speak out loud, so use plain words and short sentences, no lists, no markdown. "
           "Use only facts and numbers from DATA. Never diagnose; never add medical steps beyond the checklist. "
           "If DATA lists active alerts and the question touches them, name the most serious alert first. "
           "Refer to crew members by name or role, never he or she. "
           "There is no one to call: the crew member handles it with your guidance. Never say help is coming. "
           "If something is life-threatening, say what to do right now.")


async def complete(messages, max_tokens):
    s = settings()
    if not s["key"]:
        return None
    body = {"model": s["model"], "models": [s["model"], s["fallback"]], "messages": messages,
            "max_tokens": max_tokens, "temperature": 0.3}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.post(URL, json=body, headers={"Authorization": f"Bearer {s['key']}"})
            r.raise_for_status()
            data = r.json()
        return {"text": data["choices"][0]["message"]["content"].strip(), "model": data.get("model", s["model"])}
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


async def ask(question, state, sim, focus=None):
    """Spoken answer (max two sentences) and an optional action for the crew member to confirm."""
    guide = guides.match(question)
    if guide:
        return {"say": guide["say"], "action": None, "engine": "guide",
                "guide": {**guide, "readings": readings_line(guide, sim)}}
    cmd = command(question, state, sim)
    if cmd:
        return {"say": cmd[0], "action": cmd[1], "engine": "command"}
    fast = quick.answer(question, state, sim)
    if fast:
        return {"say": fast, "action": None, "engine": "instant"}
    key = cache_key(question, state, sim, focus)
    hit = _replies.get(key)
    if hit and time.time() - hit[0] < REPLY_TTL_S:
        return {**hit[1], "engine": hit[1]["engine"] + " (cached)"}
    reply = await ask_model(question, state, sim, focus)
    if reply["engine"] != "rules":
        _replies[key] = (time.time(), reply)
        if len(_replies) > 300:
            _replies.pop(next(iter(_replies)))
    return reply


def readings_line(guide, sim):
    """What the sensors show right now, said once at the start of a guide about the crew member
    themselves. Vitaly can't see anyone else's body, so there is no line for "other"."""
    if guide["who"] != "self":
        return None
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


# AI replies are reused for the same question while the situation is the same.
REPLY_TTL_S = 120
_replies = {}


def cache_key(question, state, sim, focus):
    words = re.sub(r"[^a-z0-9 ]", "", question.lower())
    words = " ".join(w for w in words.split() if w not in {"hey", "vitaly", "vitali", "please", "um", "uh", "so", "the", "a"})
    situation = (tuple(sorted(i["kind"] for i in sim.incidents if i["state"] == "open")),
                 tuple(state["organs"][k]["status"] for k in sorted(state["organs"])), focus)
    return (words, situation)


async def ask_model(question, state, sim, focus):
    prompt = (f"DATA:\n{snapshot(state, sim, focus)}\n\nCrew member says: \"{question}\"\n\n"
              "Reply with JSON only: {\"say\": \"at most two short sentences\", \"action\": null} "
              "or with action set to one of: "
              "{\"type\": \"log_countermeasure\", \"organ\": \"...\", \"id\": \"...\"}, {\"type\": \"note_earth\", \"text\": \"...\"}. "
              "Only propose an action if they ask for one; the say text should then ask them to confirm.")
    out = await complete([{"role": "system", "content": PERSONA}, {"role": "user", "content": prompt}], 160)
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
