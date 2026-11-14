"""Shared layers of the analysis pipeline.

Every system analysis (heart, training, radiation) runs the same five layers:
  1. raw signal      the reading, with its quality flag and age (inputs())
  2. derived measure turn readings into something meaningful (each system module)
  3. baseline        compare with this crew member's preflight normal (vs_baseline())
  4. confidence      how much to trust the result: data quality, freshness, measured or modelled
  5. risk + action   severity 0..1, a cause chain, and what to do (each system module)

Live analyses read the latest good device readings. Projections (future days) and the offline
fallback read the noise-free signal model instead, and say so through a lower confidence.
"""
import time

from .. import constants as C
from ..devices.catalog import describe
from ..engine import signals


class Reader:
    """Where an analysis gets its numbers: live readings when available, else the signal model."""

    def __init__(self, sim, mods, relief, mission_id, day, live):
        self.sim, self.mods, self.relief, self.mission_id, self.day, self.live = sim, mods, relief, mission_id, day, live

    def __call__(self, metric):
        if self.live:
            v = self.sim.recent(metric)
            if v is not None:
                return v
        return signals.value(metric, self.mods, self.relief, self.mission_id, self.day, bool(self.sim.storm))

    def model(self, metric, mods=None, day=None):
        """Noise-free value, optionally for a different body state or day (used for history)."""
        return signals.value(metric, mods or self.mods, self.relief, self.mission_id,
                             self.day if day is None else day, bool(self.sim.storm))


def inputs(reader, metrics):
    """Layer 1: each input with its value, quality and freshness."""
    now = time.time()
    out = []
    for metric in metrics:
        meta = describe(metric)
        last = reader.sim.latest.get(metric) if reader.live else None
        age = round(now - last["ts"], 1) if last else None
        share = reader.sim.good_share(metric) if reader.live else None
        out.append({
            "metric": metric, "sensor": meta["sensor"], "cadence": meta["cadence"], "unit": meta["unit"],
            "value": round(reader(metric), 2),
            "source": "reading" if last else "model",
            "good_share": None if share is None else round(share, 3),
            "age_s": age,
            # Fresh = within 1.5x its schedule. A weekly scan read 3 "weeks" ago is stale.
            "fresh": bool(last) and age <= 1.5 * meta["demo_every_s"] + 1,
        })
    return out


def vs_baseline(metric, value):
    """Layer 3: value against this crew member's preflight baseline."""
    base = C.BASELINE.get(metric)
    if base in (None, 0):
        return {"baseline": base, "delta": None, "pct": None}
    return {"baseline": base, "delta": round(value - base, 2), "pct": round(100 * (value - base) / base, 1)}


def confidence(ins):
    """Layer 4: 0..1. Readings beat the model; dropouts and stale scans lower it.
    Returns (score, reasons) so the number can always be explained."""
    if not ins:
        return 0.0, ["no inputs"]
    scores, reasons = [], []
    for i in ins:
        if i["source"] == "model":
            scores.append(0.5)
            continue
        s = 1.0
        if i["good_share"] is not None and i["good_share"] < 0.98:
            s -= min(0.4, (1 - i["good_share"]) * 4)
            reasons.append(f"{i['sensor']}: {round(100 * (1 - i['good_share']))}% of {i['metric']} readings flagged (motion or dropout)")
        if not i["fresh"]:
            s -= 0.2
            reasons.append(f"{i['metric']} is overdue ({i['cadence']} check)")
        scores.append(max(0.2, s))
    if all(i["source"] == "model" for i in ins):
        reasons.append("no live readings: values come from the body model")
    return round(sum(scores) / len(scores), 2), reasons


def component(cid, name, value, unit, severity, status_text, baseline=None):
    """One derived measure with its contribution to the system score."""
    return {"id": cid, "name": name, "value": None if value is None else round(value, 2), "unit": unit,
            "severity": round(max(0.0, min(1.0, severity)), 3),
            "status": "act" if severity >= 0.66 else "watch" if severity >= 0.33 else "ok",
            "says": status_text, **(baseline or {})}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))
