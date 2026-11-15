"""Vitaly's watchdog: fixed rules, run every second on the latest good readings.

Three kinds of problem:
  limit   a reading crosses a safe limit (with per-person limits from the medical profile)
  spike   a sharp change: heart rate moving 25+ bpm within a minute
  drift   far from this person's normal: resting heart rate 15+ above baseline

Readings from a real watch (devices/live.py) are never alerted on by themselves, only asked about; a Director event
layered on top of one is detected like any other (real_plain below).

Rules decide; the AI never does. Each detected problem becomes an incident with an opening line
and a step-by-step guide (protocols.py) that Vitaly walks the crew member through. Standalone:
the guide starts at once and never waits on another person or on Earth.

An emergency also sends a copy of the readings to the flight surgeon on Earth. It travels at the
real comms delay (sped up for the demo, like triage.py), so the screen can show it on its way
while the crew member is already acting. The reply is an acknowledgement, never an instruction
the guide depends on.
"""
import time

from .. import constants as C
from .. import missions as M
from ..triage import _scale as time_scale
from ..sources import googlehealth
from . import crew, profile, protocols

EARTH_REPLY = "Flight surgeon: we have your readings. Keep following the steps. We are standing by."

KEEP_RESOLVED_S = 60
SPIKE_BPM, SPIKE_WINDOW_S = 25, 60
DRIFT_BPM = 15
# ASSUMPTION: how long after a hard knock Vitaly still asks about it (listed in provenance.py).
IMPACT_WINDOW_S = 30

LIMITS = {
    "hr_arrest": 20, "hr_low": 45, "hr_high": 130,
    "spo2_low": 90, "bp_low": 90, "bp_high": 150,
    "pressure_low": 95.0, "pressure_high": 104.5,
    "o2_low": C.PPO2_RANGE_KPA[0], "o2_high": 23.5,
    "co2_high": C.CO2_WATCH_MMHG, "smoke": 0.3,
    "temp_high": 28.0, "temp_low": 17.0, "noise_high": 75.0,
}

# A more serious problem hides the smaller ones it causes (an arrest also drops blood pressure).
SUPPRESSES = {
    "cardiac_arrest": {"slow_heart", "fast_heart", "irregular_rhythm", "heart_spike", "heart_drift", "bp_crash",
                       "bp_high", "low_oxygen_blood"},
    "slow_heart": {"heart_spike", "heart_drift"},
    "irregular_rhythm": {"fast_heart", "heart_spike", "heart_drift"},
    "bp_crash": {"fast_heart", "heart_spike", "heart_drift"},
    "fast_heart": {"heart_drift", "heart_spike"},
    "pressure_low": {"o2_low"},
    "fire": {"temp_high"},
    "impact": {"heart_spike"},  # the jolt and the fright move the heart rate; that's not a second problem
}


def last_two(sim, metric):
    """The two most recent good readings. Critical limits need both to agree: fast (about 1-2 s
    after a sudden change, instead of waiting for a 5 s average) but one noisy reading can't
    raise an alarm on its own."""
    vals = list(sim.history.get(metric) or [])[-2:]
    return vals if vals else None


def below(sim, metric, limit):
    v = last_two(sim, metric)
    return v is not None and max(v) < limit


def above(sim, metric, limit):
    v = last_two(sim, metric)
    return v is not None and min(v) > limit


def real_plain(sim, metric):
    """True if the latest reading of this metric is from the real watch with no Director event on top.
    Those readings are for asking Vitaly about ("Hey Vitaly, how's my heart?"); they never set off an alert by
    themselves, so a real person's heart rate going up and down does not make Vitaly speak."""
    v = sim.latest.get(metric)
    return bool(v and v.get("real") and not v.get("modified"))


def detect(sim, now):
    """Problems present right now: {kind: value text}."""
    r = sim.recent
    lim = {**LIMITS, **profile.profile(crew.PATIENT_ID).get("limits", {})}
    found = {}

    hr = r("heart_rate")
    if hr is not None and not real_plain(sim, "heart_rate"):
        latest = last_two(sim, "heart_rate")[-1]
        sim.hr_trace.append((now, latest))
        if below(sim, "heart_rate", lim["hr_arrest"]):
            found["cardiac_arrest"] = "0"
        elif below(sim, "heart_rate", lim["hr_low"]):
            found["slow_heart"] = f"{latest:.0f} bpm"
        elif above(sim, "heart_rate", lim["hr_high"]) and (r("ecg_irregular") or 0) < 0.5:
            found["fast_heart"] = f"{latest:.0f} bpm"
        recent = [v for t, v in sim.hr_trace if now - t <= SPIKE_WINDOW_S]
        if len(recent) >= 3 and max(recent) - min(recent) >= SPIKE_BPM:
            found["heart_spike"] = f"{max(recent) - min(recent):.0f}"
        # Drift is judged against this person's own resting rate: the real wearer's while the real watch is
        # live (unknown until learned: then no drift alert), the simulated crew member's otherwise.
        base = googlehealth.resting_baseline(C.BASELINE["heart_rate"])
        if base is not None and hr - base >= DRIFT_BPM:  # drift is slow: the smoothed value is right
            found["heart_drift"] = f"+{hr - base:.0f} bpm"
    if above(sim, "ecg_irregular", 0.5):
        found["irregular_rhythm"] = f"{hr:.0f} bpm" if hr else "?"
    if not real_plain(sim, "spo2") and below(sim, "spo2", lim["spo2_low"]):
        found["low_oxygen_blood"] = f"{last_two(sim, 'spo2')[-1]:.0f}%"
    sys_, dia = r("bp_sys"), r("bp_dia")
    if sys_ is not None:
        if sys_ < lim["bp_low"]:
            found["bp_crash"] = f"{sys_:.0f}/{dia:.0f}"
        elif sys_ >= lim["bp_high"]:
            found["bp_high"] = f"{sys_:.0f}/{dia:.0f}"

    p, o2, co2 = r("cabin_pressure_kpa"), r("ppo2_kpa"), r("co2_mmhg")
    if p is not None:
        if p < lim["pressure_low"]:
            found["pressure_low"] = f"{p:.1f} kPa"
        elif p > lim["pressure_high"]:
            found["pressure_high"] = f"{p:.1f} kPa"
    if o2 is not None:
        if o2 < lim["o2_low"]:
            found["o2_low"] = f"{o2:.1f} kPa O2"
        elif o2 > lim["o2_high"]:
            found["o2_high"] = f"{o2:.1f} kPa O2"
    if co2 is not None and co2 > lim["co2_high"]:
        found["co2_high"] = f"{co2:.1f} mmHg"
    if above(sim, "smoke_index", lim["smoke"]):  # smoke: act on the first two readings
        found["fire"] = "smoke"
    t = r("cabin_temp_c")
    if t is not None:
        if t > lim["temp_high"]:
            found["temp_high"] = f"{t:.0f} °C"
        elif t < lim["temp_low"]:
            found["temp_low"] = f"{t:.0f} °C"
    noise = r("noise_dba")
    if noise is not None and noise > lim["noise_high"]:
        found["noise_high"] = f"{noise:.0f} dBA"
    if sim.storm:
        found["radiation_storm"] = "storm"
    # The watch's motion sensor felt a hard knock (Director "impact"). It can't say what got hurt, so
    # the alert is a question; what the person answers starts the right guide.
    if sim.impact_at and now - sim.impact_at < IMPACT_WINDOW_S:
        found["impact"] = "hard knock"

    hidden = set()
    for kind in found:
        hidden |= SUPPRESSES.get(kind, set())
    return {k: v for k, v in found.items() if k not in hidden}


def severity_for(kind):
    return profile.profile(crew.PATIENT_ID).get("escalate", {}).get(kind, protocols.PROTOCOLS[kind]["severity"])


def tick(sim, now=None):
    """Run the rules once. Returns True if the incident list changed (so the server pushes it)."""
    now = now or time.time()
    found = detect(sim, now)
    changed = False
    open_by_kind = {i["kind"]: i for i in sim.incidents if i["state"] == "open"}

    for kind, value in found.items():
        if kind in open_by_kind:
            if open_by_kind[kind]["value"] != value:
                open_by_kind[kind]["value"] = value
            continue
        sim.incidents.append(new_incident(sim, kind, value, now))
        changed = True

    for kind, inc in open_by_kind.items():
        if kind not in found:
            inc["state"], inc["resolved_at"] = "resolved", now
            changed = True

    before = len(sim.incidents)
    sim.incidents = [i for i in sim.incidents if i["state"] == "open" or now - i["resolved_at"] < KEEP_RESOLVED_S]
    return changed or len(sim.incidents) != before


def new_incident(sim, kind, value, now):
    p = protocols.PROTOCOLS[kind]
    sim.incident_seq += 1
    who = profile.profile(crew.PATIENT_ID)["name"]
    severity = severity_for(kind)
    return {
        "id": sim.incident_seq, "kind": kind, "title": p["title"], "severity": severity, "value": value,
        "say": protocols.spoken(kind, who), "guide": p["guide"],
        "created": now, "state": "open", "resolved_at": None,
        "earth": earth_copy(sim, now) if severity == "emergency" else None,
    }


def earth_copy(sim, now):
    """When the copy sent to Earth arrives and when the reply lands, at the real one-way delay
    for today (JPL Horizons), divided by the demo time scale so it can be watched."""
    delay_min = M.environment(sim.mission, sim.day)["comms_delay_min"]
    scale = time_scale()
    demo_s = delay_min * 60 / scale
    return {"delay_min": round(delay_min, 2), "time_scale": scale, "sent_at": now,
            "arrives_at": now + demo_s, "reply_at": now + 2 * demo_s, "reply": EARTH_REPLY}


def find(sim, incident_id):
    return next((i for i in sim.incidents if i["id"] == incident_id), None)


def active(sim):
    order = {"emergency": 0, "warning": 1}
    return sorted(sim.incidents, key=lambda i: (i["state"] != "open", order.get(i["severity"], 2), -i["created"]))
