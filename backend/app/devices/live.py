"""Real readings in place of the simulated smartwatch, with the Director's events layered on top.

When the Fitbit has a fresh reading (sources/googlehealth.py), the watch device reports it instead
of the signal model. A fresh reading is one recent enough to call real; otherwise the simulated
value is used and nothing is labelled real.

Director events and countermeasures still work: they change the body model, and the change they
cause (the simulated value with the event minus the simulated value without it) is added to the
real reading. So a real 72 bpm plus an irregular-rhythm event shows an irregular 72, and a
cardiac arrest shows a flat line. The reading is then marked "modified" so the app says it is a
real reading with a simulated event on top, never plain "real".
"""
import random

from ..engine import signals
from ..sources import googlehealth
from ..state import Sim

LIVE_DEVICE = "wearable"                       # the smartwatch
LIVE_METRICS = ("heart_rate", "hrv", "spo2", "resp_rate", "sleep_hours")
_DEFAULT_MODS = Sim().mods                     # the body with no event running


def override(sim, device, metric):
    """(value, extra fields for the reading) from the real watch, or None to use the simulation."""
    if device != LIVE_DEVICE or metric not in LIVE_METRICS:
        return None
    real = googlehealth.fresh(metric)
    if not real:
        return None
    storm = bool(sim.storm)
    now_v = signals.value(metric, sim.mods, sim.relief, sim.mission, sim.day, storm)
    base_v = signals.value(metric, _DEFAULT_MODS, sim.relief, sim.mission, sim.day, storm)
    delta = now_v - base_v
    if now_v == 0 and base_v != 0:                # flatline (cardiac arrest): nothing real to show
        value, modified = 0.0, True
    else:
        value, modified = real["value"] + delta, abs(delta) > 0.5
        if metric == "heart_rate" and sim.mods.get("cardiac") == "arrhythmia":
            value, modified = value + random.gauss(0, 15.0), True   # beat-to-beat jumps, like the simulation
        value = max(0.0, value)
    return value, {"real": True, "source": googlehealth.device_name(), "sampled_at": real["ts"], "modified": modified}
