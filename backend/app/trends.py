"""The last few mission days of every reading, for the small trend lines in the health panel.

ASSUMPTION: the demo stores no past days, so the week is rebuilt from today's body state.
Sleep debt builds up over the week and missed workouts are the most recent days; a blood
pressure spike or stress from a director event shows on today only. Slow changes (bone, eyes,
muscle) follow the engine day by day. The frontend ends each line on the live reading it shows.
"""
import random

from .engine.physiology import expected, organ_severity

DEVICE_METRICS = ["heart_rate", "bp_sys", "hrv", "glucose", "resp_rate", "spo2",
                  "sleep_hours", "reaction_ms", "mood_1to5", "resistive_load_pct"]
# Day-to-day wobble so the lines look like real readings. Seeded by day: same week on every call.
WOBBLE = {"heart_rate": 1.2, "bp_sys": 2.5, "hrv": 2.5, "glucose": 4, "resp_rate": 0.4, "spo2": 0.3,
          "sleep_hours": 0.25, "reaction_ms": 6, "mood_1to5": 0.2, "resistive_load_pct": 0.6}
# Organ engine values: trend name -> organ id.
ORGAN_VALUES = {"bone_pct": "bones", "onsd_mm": "eyes", "muscle_score": "muscles"}
EXERCISE_MIN_DONE, EXERCISE_MIN_MISSED = 90, 20  # same as devices/simulated.py


def week(sim, days=7):
    today = int(sim.day)
    missed = int(round(sim.mods["missed_exercise_days"]))
    metrics = {k: [] for k in [*DEVICE_METRICS, *ORGAN_VALUES, "exercise_min"]}
    for i in range(days):
        day = today - (days - 1) + i
        days_ago = days - 1 - i
        mods = dict(sim.mods)
        mods["sleep_debt"] *= (i + 1) / days
        mods["missed_exercise_days"] = max(0, missed - days_ago)
        if days_ago:
            mods["bp_offset"] = 0.0
            mods["stress"] = 0.0
        rng = random.Random(f"{sim.mission}-{day}")
        for k in DEVICE_METRICS:
            metrics[k].append(round(expected(mods, k, sim.relief, sim.mission, day) + rng.gauss(0, WOBBLE[k]), 1))
        for k, organ in ORGAN_VALUES.items():
            _, value = organ_severity(sim, organ, sim.mission, day, mods, sim.relief, False)
            metrics[k].append(round(value, 2))
        metrics["exercise_min"].append(EXERCISE_MIN_MISSED if days_ago < missed else EXERCISE_MIN_DONE)
    return {"days": list(range(today - days + 1, today + 1)), "metrics": metrics, "simulated": True}
