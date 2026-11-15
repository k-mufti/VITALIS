"""Demo events triggered from the director panel (key D) or the API."""
import time

from . import constants as C
from . import triage
from .engine.physiology import mission_state
from .sources import donki
from .state import MOD_LIMITS

EVENTS = ["radiation_storm", "bad_sleep_week", "bp_spike", "skipped_exercise", "cabin_co2", "cabin_leak", "noisy_module",
          "slow_heart", "irregular_rhythm", "cardiac_arrest", "bp_crash",
          "cabin_overpressure", "fire_smoke", "o2_high", "cabin_hot", "impact", "reset"]


def trigger(sim, kind):
    m = sim.mods
    if kind == "reset":
        sim.reset()
        return {"ok": True, "event": kind}
    if kind == "radiation_storm":
        event = donki.pick_storm(sim.storm_count)
        sim.storm_count += 1
        m["extra_dose"] += C.STORM_DOSE_SHELTERED_MSV
        m["stress"] = min(2.0, m["stress"] + 0.6)
        sim.storm = {"sepID": event.get("sepID"), "eventTime": event.get("eventTime"),
                     "instrument": (event.get("instruments") or [{}])[0].get("displayName"),
                     "link": event.get("link"), "dose_msv": C.STORM_DOSE_SHELTERED_MSV,
                     "note": "Replaying a real measured solar particle event from NASA DONKI."}
        state = mission_state(sim)
        triage.raise_alert(sim, "radiation", "red", "Solar particle event: crew to storm shelter", state["comms_delay_min"])
    elif kind == "bad_sleep_week":
        m["sleep_debt"] += 1.0
        m["stress"] = min(2.0, m["stress"] + 0.4)
    elif kind == "bp_spike":
        m["bp_offset"] += 28
    elif kind == "skipped_exercise":
        m["missed_exercise_days"] += 5
    elif kind == "cabin_co2":
        m["co2_offset"] += 2.0  # ship air scrubber falling behind, not a body problem
    elif kind == "cabin_leak":
        m["pressure_drop_kpa"] += 10.0  # slow leak: pressure and oxygen fall together
    elif kind == "noisy_module":
        m["noise_offset"] += 14.0  # failing fan or pump
    elif kind == "slow_heart":
        m["cardiac"] = "brady"
    elif kind == "irregular_rhythm":
        m["cardiac"] = "arrhythmia"
    elif kind == "cardiac_arrest":
        m["cardiac"] = "arrest"
    elif kind == "bp_crash":
        m["bp_drop"] += 46.0
    elif kind == "cabin_overpressure":
        m["pressure_rise_kpa"] += 6.0
    elif kind == "fire_smoke":
        m["smoke"] = 1.0
    elif kind == "o2_high":
        m["o2_boost_kpa"] += 4.5
    elif kind == "cabin_hot":
        m["temp_offset_c"] += 8.0
    elif kind == "impact":
        sim.impact_at = time.time()  # a hard knock on the watch's motion sensor (vitaly/watchdog.py)
    else:
        return {"ok": False, "error": f"unknown event, use one of {EVENTS}"}
    for key, limit in MOD_LIMITS.items():
        m[key] = min(m[key], limit)
    sim.events.insert(0, kind)
    return {"ok": True, "event": kind, "storm": sim.storm if kind == "radiation_storm" else None}
