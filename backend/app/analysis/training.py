"""Muscle pipeline: training load against recovery, plus direct measures of muscle and strength.

Nothing on board measures "muscle strain" directly. Sports science gets at it the same way we do:
how much work the body did, and how well it bounced back.

  training load       each day's session as a Banister TRIMP (minutes x heart-rate reserve used,
                      weighted for intensity). Needs the shirt's session heart rate + machine logs.
  acute:chronic ratio last 7 days of load / last 28 days (Gabbett 2016). 0.8-1.3 is the sweet spot;
                      over 1.5 injury risk rises; under 0.8 means detraining, which in space is
                      muscle and bone loss.
  recovery score      HRV, resting heart rate and sleep against baseline, 0-100.
  strength            load lifted on the resistive machine, % of preflight.
  muscle thickness    thigh muscle by weekly ultrasound, % of preflight.

Status combines them: undertrained, optimal, high load, overreaching, or under-recovered
(working hard on a body that has not recovered).
"""
import math

from .. import constants as C
from ..engine import signals
from .common import clamp, component, confidence, inputs, vs_baseline

METRICS = ["exercise_min", "session_hr_avg", "heart_rate", "hrv", "sleep_hours", "resistive_load_pct", "quad_thickness_mm"]
WEIGHTS = {"muscle_thickness": 0.35, "strength": 0.30, "training_balance": 0.20, "recovery": 0.15}


def history(reader, days=28):
    """Daily training log for the last `days` days, ending today.

    The sim keeps one body state, not a diary, so earlier days are rebuilt from the model:
    the full prescription on normal days, a token session on the most recent missed days,
    and each day's heart rate from that day's fitness. Today uses live readings when present.
    A small fixed day-to-day wobble keeps the log from looking machine-made."""
    today = int(reader.day)
    missed = int(round(reader.mods["missed_exercise_days"]))
    log = []
    for d in range(today - days + 1, today + 1):
        is_missed = d > today - missed
        minutes = signals.session_minutes(is_missed)
        if not is_missed:
            minutes += 6 * math.sin(d * 1.7)
        rest = reader.model("heart_rate", day=d)
        sess = reader.model("session_hr_avg", day=d)
        if d == today:
            minutes, sess, rest = reader("exercise_min"), reader("session_hr_avg"), reader("heart_rate")
        log.append({"day": d, "minutes": round(minutes, 1), "session_hr": round(sess, 1),
                    "load": round(signals.trimp(minutes, sess, rest), 1), "missed": is_missed})
    return log


def analyze(reader):
    B = C.BASELINE
    log = history(reader)
    loads = [e["load"] for e in log]
    acute = sum(loads[-7:]) / 7
    chronic = sum(loads) / len(loads)
    acwr = acute / chronic if chronic else 0.0

    hrv, rest, sleep = reader("hrv"), reader("heart_rate"), reader("sleep_hours")
    rec = recovery_score(hrv, rest, sleep)
    load = reader("resistive_load_pct")
    quad = reader("quad_thickness_mm")
    quad_b = vs_baseline("quad_thickness_mm", quad)

    status = training_status(acwr, rec)
    balance_sev = clamp((C.ACWR_LOW - acwr) / 0.5) + clamp((acwr - C.ACWR_DANGER) / 0.5)
    if status == "under-recovered":
        balance_sev = max(balance_sev, 0.5)

    parts = [
        component("muscle_thickness", "Thigh muscle thickness", quad, "mm", (-quad_b["pct"] - 3) / 15,
                  f"Thigh muscle {quad:.1f} mm on ultrasound, {quad_b['pct']:+.1f}% from preflight.", quad_b),
        component("strength", "Strength", load, "% of preflight load", (100 - load - 3) / 20,
                  f"Lifting {load:.0f}% of your preflight load.", vs_baseline("resistive_load_pct", load)),
        component("training_balance", "Training load balance", acwr, "acute:chronic", balance_sev,
                  STATUS_SAYS[status].format(pct=abs(round(100 * (acwr - 1)))),
                  {"acute_load": round(acute, 1), "chronic_load": round(chronic, 1), "status": status,
                   "sweet_spot": [C.ACWR_LOW, C.ACWR_HIGH]}),
        component("recovery", "Recovery", rec, "out of 100", (60 - rec) / 40,
                  f"Recovery {rec:.0f}/100 from HRV, resting heart rate and sleep.", {"baseline": 100}),
    ]
    severity = clamp(sum(WEIGHTS[p["id"]] * p["severity"] for p in parts))
    ins = inputs(reader, METRICS)
    conf, reasons = confidence(ins)
    worst = max(parts, key=lambda p: p["severity"])
    note = worst["says"] if worst["severity"] >= 0.2 else "Training and recovery are balanced. Muscle is holding."
    return {
        "system": "muscles", "severity": round(severity, 3), "value": round(100 - 45 * severity), "note": note,
        "status": status, "acwr": round(acwr, 2), "recovery": rec,
        "derived": parts, "inputs": ins, "confidence": conf, "confidence_reasons": reasons,
        "log": log, "weights": WEIGHTS,
    }


def recovery_score(hrv, rest_hr, sleep):
    """0-100. Half HRV (the most sensitive), a quarter each resting heart rate and sleep."""
    B = C.BASELINE
    hrv_part = clamp((hrv / B["hrv"] - 0.6) / 0.4)
    rest_part = clamp(1 - max(0.0, rest_hr - B["heart_rate"]) / 15)
    sleep_part = clamp(sleep / B["sleep_hours"])
    return round(100 * (0.5 * hrv_part + 0.25 * rest_part + 0.25 * sleep_part))


def training_status(acwr, recovery):
    if acwr > C.ACWR_DANGER:
        return "overreaching"
    if acwr >= 1.0 and recovery < 50:
        return "under-recovered"
    if acwr > C.ACWR_HIGH:
        return "high load"
    if acwr < C.ACWR_LOW:
        return "undertrained"
    return "optimal"


STATUS_SAYS = {
    "undertrained": "Training load is {pct}% below your 4-week normal: muscle and bone lose their protection.",
    "optimal": "Training load is in the sweet spot for your 4-week normal.",
    "high load": "Training load is {pct}% above your 4-week normal. Watch recovery.",
    "overreaching": "Training load jumped {pct}% above your 4-week normal: injury risk is up.",
    "under-recovered": "Working hard on a body that has not recovered. Ease off today.",
}
