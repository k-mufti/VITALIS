"""Vitaly's AI: one cheap model on OpenRouter, fed a compact snapshot of everything live.

Two jobs, both short:
  tailor(incident)  one personal line after the preloaded checklist (e.g. about a known condition)
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

from .. import officer
from . import crew, profile

URL = "https://openrouter.ai/api/v1/chat/completions"
# Picked by eval_vitaly.py: best answers of the cheap models tested, ~$0.03 per 1M tokens in and out.
DEFAULT_MODEL = "mistralai/mistral-nemo"
DEFAULT_FALLBACK = "meta-llama/llama-3.1-8b-instruct"
TIMEOUT_S = 8

ACTIONS = ("call_help", "cancel_help", "log_countermeasure", "note_earth")


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
            helpers = ", ".join(f"{t['name']} ({t['role']}, {t['eta_s']} s away)" for t in (i["help"] or {}).get("team", []))
            lines.append(f"- [{i['severity']}] {i['title']}: {i['value']}. Checklist: {'; '.join(i['steps'])}."
                         + (f" Help coming: {helpers}." if helpers else " Help not called."))
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
           "If something is life-threatening, say help is coming and what to do now.")


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


HEART_KINDS = {"irregular_rhythm", "fast_heart", "slow_heart", "heart_spike", "heart_drift", "cardiac_arrest", "bp_crash", "bp_high"}
CABIN_METRICS = {"pressure_low": "cabin_pressure_kpa", "pressure_high": "cabin_pressure_kpa", "o2_low": "ppo2_kpa",
                 "o2_high": "ppo2_kpa", "co2_high": "co2_mmhg", "temp_high": "cabin_temp_c", "temp_low": "cabin_temp_c",
                 "noise_high": "noise_dba", "fire": "smoke_index"}


def tailor_facts(incident, sim):
    """Only the facts that matter for this alert, so a small model can't grab the wrong one."""
    p = profile.profile(crew.PATIENT_ID)
    facts = [f"Alert: {incident['title']}, reading {incident['value']}."]
    if incident["kind"] in HEART_KINDS and p["conditions"]:
        facts.append(f"Crew member's known condition: {p['conditions'][0]}. Kit: {p.get('medical_kit', 'med kit')}.")
    team = (incident.get("help") or {}).get("team", [])
    if team:
        facts.append("Help coming: " + ", ".join(f"{t['name']} ({t['role']}) in {t['eta_s']} s" for t in team) + ".")
    else:
        facts.append("Help not called yet.")
    if incident.get("escalate_at"):
        facts.append("If the crew member doesn't say I'm OK within 15 seconds, help is called.")
    if incident.get("earth"):
        facts.append(f"Flight surgeon on Earth notified; message takes {incident['earth']['delay_min']} minutes.")
    return "\n".join(facts)


async def tailor(incident, state, sim):
    """One personal line to follow the checklist."""
    p = profile.profile(crew.PATIENT_ID)
    prompt = (f"Checklist already spoken: \"{incident['say']}\"\n\nFACTS:\n{tailor_facts(incident, sim)}\n\n"
              "Write ONE extra sentence (max 18 words) for the crew member, using only FACTS: who is coming and how soon, "
              "or their known condition if it is listed. Do not repeat the checklist. Reply with the sentence only.")
    out = await complete([{"role": "system", "content": PERSONA}, {"role": "user", "content": prompt}], 50)
    if out and out["text"]:
        line = first_sentences(clean(out["text"]), 1)
        if line_is_safe(line, incident, p):
            return {"line": line, "engine": out["model"]}
    return {"line": tailor_rules(incident, p), "engine": "rules"}


HELP_CLAIM = re.compile(r"help (is )?(coming|on (its|the) way)|on (their|the) way|will be (here|there)|en route|arriv", re.I)
CONDITION_WORDS = re.compile(r"fibrillation|\bAF\b|rhythm|condition|history", re.I)


def line_is_safe(line, incident, p):
    """Reject AI lines that are wrong in a way that matters in an emergency."""
    if not line or len(line) > 160:
        return False
    if not (incident.get("help") or {}).get("team") and HELP_CLAIM.search(line):
        return False  # says help is coming when it hasn't been called
    if incident["kind"] in HEART_KINDS and p["conditions"] and not CONDITION_WORDS.search(line):
        return False  # a heart alert must mention the known heart condition
    return True


def tailor_rules(incident, p):
    """Accurate fallback line, built only from facts."""
    team = (incident.get("help") or {}).get("team", [])
    first = team[0] if team else None
    if incident["kind"] in HEART_KINDS and p["conditions"]:
        condition = p["conditions"][0].split(" (")[0]
        if first:
            return f"Given your history of {condition}, {first['name']} is bringing your kit, about {first['eta_s']} seconds out."
        return f"Given your history of {condition}, I'll call the medical officer if this continues."
    if first:
        extra = f", with {team[1]['name']}" if len(team) > 1 else ""
        return f"{first['name']} is about {first['eta_s']} seconds away{extra}."
    if incident.get("escalate_at"):
        return "If I don't hear \"I'm OK\" in 15 seconds, I'll call the medical officer."
    return "I'm watching the readings and will tell you when it's clear."


# Voice commands are matched by rules first: instant, free and never confused by a small model.
COMMANDS = [
    ("cancel_help", re.compile(r"\b(cancel|false alarm|stand down|never ?mind|i'?m (ok|okay|fine|good))\b", re.I)),
    ("call_help", re.compile(r"\b(call|get|send|need)\b.{0,20}\b(help|medic|doctor|chen|crew|someone)\b|\bhelp me\b", re.I)),
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


def command(question, state, sim):
    """A recognised voice command -> (say, action), or None to let the AI answer."""
    for kind, pattern in COMMANDS:
        if not pattern.search(question):
            continue
        if kind == "cancel_help":
            if not any(i["state"] == "open" and i["help"] and not i["help"].get("cancelled") for i in sim.incidents):
                return None  # "I'm fine" with nothing to cancel is just conversation
            return "Cancel the help call? Say yes to confirm.", {"type": "cancel_help"}
        if kind == "call_help":
            return "Call the medical officer to you? Say yes to confirm.", {"type": "call_help"}
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
    cmd = command(question, state, sim)
    if cmd:
        return {"say": cmd[0], "action": cmd[1], "engine": "command"}
    prompt = (f"DATA:\n{snapshot(state, sim, focus)}\n\nCrew member says: \"{question}\"\n\n"
              "Reply with JSON only: {\"say\": \"at most two short sentences\", \"action\": null} "
              "or with action set to one of: {\"type\": \"call_help\"}, {\"type\": \"cancel_help\"}, "
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
