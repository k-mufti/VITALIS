"""Each reading, written the way the real device's own software would hand it over.

The simulated devices already report in real steps and units (devices/catalog.py RESOLUTION).
This module re-shapes a reading into the record a real device's software produces, so swapping the
simulator for hardware is a matter of reading these records instead of making them:

  Smartwatch, blood pressure cuff -> an Apple HealthKit sample (type, unit, value, start, end, source)
  Blood sugar patch               -> a Dexcom API "EGV" record (value, trend arrow, rate of change)
  Everything else                 -> a plain VITALIS record; these devices have no common format

Every record says whether it is simulated. Nothing here claims a real device took a reading unless the reading really came from one (devices/live.py).
"""
import datetime as dt
import uuid

from .catalog import DEVICES, METRICS, NATIVE

# What HealthKit calls the source of each device's samples.
SOURCE = {"wearable": "VITALIS Watch", "bp_cuff": "VITALIS Blood Pressure Cuff", "cgm": "VITALIS Glucose Patch"}

GLUCOSE_STEP_MIN = 5  # a continuous glucose monitor reports every 5 minutes


def _iso(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _healthkit(v, kind, unit):
    metric, value, end = v["metric"], v["value"], v["ts"]
    out = {"type": kind, "sourceName": SOURCE[v["device"]], "startDate": _iso(end), "endDate": _iso(end)}
    if metric == "sleep_hours":
        # Sleep is a stretch of time, not a number: one "asleep" sample as long as the night's sleep.
        out.update(value="HKCategoryValueSleepAnalysisAsleepUnspecified", startDate=_iso(end - value * 3600))
    elif metric == "ecg_irregular":
        if not value:
            return None  # the watch only writes this sample when it sees an irregular rhythm
        out.update(value="HKCategoryValueNotApplicable")
    else:
        # HealthKit stores a percentage as a fraction: 98% is 0.98.
        out.update(value=round(value / 100, 2) if unit == "%" else value, unit=unit)
    if metric == "session_hr_avg":
        out["metadata"] = {"HKMetadataKeyHeartRateMotionContext": 2}  # 2 = active (during a workout)
    return out


def _trend(rate):
    """Dexcom's trend arrow from the rate of change, in mg/dL per minute."""
    for limit, up, down in ((1, "flat", "flat"), (2, "fortyFiveUp", "fortyFiveDown"), (3, "singleUp", "singleDown")):
        if abs(rate) < limit:
            return up if rate >= 0 else down
    return "doubleUp" if rate > 0 else "doubleDown"


def _dexcom(v, history):
    # Rate of change over the last 15 minutes (4 readings), as a real monitor smooths it;
    # one reading to the next is mostly sensor noise.
    values = list(history or [])[-4:]
    rate = round((values[-1] - values[0]) / (GLUCOSE_STEP_MIN * (len(values) - 1)), 1) if len(values) > 1 else 0.0
    t = _iso(v["ts"])
    return {"recordId": str(uuid.uuid5(uuid.NAMESPACE_OID, f"egv-{v['ts']}")), "systemTime": t, "displayTime": t,
            "value": int(v["value"]), "unit": "mg/dL", "trend": _trend(rate), "trendRate": rate,
            "rateUnit": "mg/dL/min", "status": None, "displayDevice": "VITALIS", "transmitterGeneration": "g7"}


def record(v, history=None):
    """One reading as its device's native record, or None if the device would write nothing."""
    kind = NATIVE.get(v["metric"])
    if kind and kind[0] == "healthkit":
        rec, fmt = _healthkit(v, kind[1], kind[2]), "Apple HealthKit sample"
    elif kind:
        rec, fmt = _dexcom(v, history), "Dexcom API glucose record (EGV)"
    else:
        rec = {"device": v["sensor"], "reading": v["metric"], "value": v["value"], "unit": v["unit"], "time": _iso(v["ts"])}
        fmt = "VITALIS device record"
    if rec is None:
        return None
    if v.get("real"):   # a reading from the real watch: say so, and name where it came from
        rec = {**rec, "sourceName": f"{v['source']} (Google Health API)"}
        rec["note"] = "Real reading from a worn watch" + (", with a simulated event added on top" if v.get("modified") else "")
        return {"metric": v["metric"], "device": v["device"], "format": fmt, "simulated": False, "record": rec}
    return {"metric": v["metric"], "device": v["device"], "format": fmt, "simulated": True, "record": rec}


def records(sim):
    """The latest reading of every metric as native records, grouped by device in kit order."""
    out = []
    for name, meta in DEVICES.items():
        recs = [record(v, sim.history.get(m)) for m, v in sim.latest.items() if METRICS[m]["device"] == name]
        out.append({"device": name, "label": meta["label"], "kind": meta["kind"], "real": meta["real"],
                    "records": [r for r in recs if r]})
    return out
