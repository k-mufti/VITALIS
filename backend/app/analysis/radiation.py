"""Radiation pipeline: dose so far, the budget left, and whether the shelter is working.

Inputs: personal dosimeter (total dose, current dose rate), the mission dose model (published
rates per phase), and space weather (NOAA GOES proton flux, NASA DONKI events).

Derived:
  dose so far          dosimeter total vs the 600 mSv NASA career limit (NASA-STD-3001)
  dose budget          allowance left / days left, against the dose the rest of the mission will add
  limit crossing day   first day the projected dose reaches the career limit
  storm dose           dose from solar storms vs the 250 mSv per-event limit
  shelter check        during a storm: dosimeter rate vs the unsheltered storm rate
  space weather now    GOES >=10 MeV flux vs the 10 pfu storm threshold
"""
from .. import constants as C
from .. import missions as M
from .common import clamp, component, confidence, inputs

METRICS = ["dose_msv", "dose_rate_usv_h"]


def curve(mission_id, day, storm_dose):
    """Cumulative dose over the whole mission. Piecewise linear (one rate per phase), so the corner
    days draw it exactly. Storm dose is a step at today: the sim does not record storm days."""
    m = M.get(mission_id)
    today = float(min(day, m["end_day"]))
    days = sorted({0.0, float(min(m["arrival_day"], m["end_day"])), float(M.departure_day(m)), today, float(m["end_day"])})
    points = [{"day": d, "msv": round(M.cumulative_dose(m, d), 1)} for d in days]

    crosses = None
    for a, b in zip(points, points[1:]):
        lo = a["msv"] + (storm_dose if a["day"] >= today else 0)
        hi = b["msv"] + (storm_dose if b["day"] >= today else 0)
        if lo >= C.CAREER_LIMIT_MSV:
            crosses = round(a["day"])
            break
        if lo < C.CAREER_LIMIT_MSV <= hi and hi > lo:
            crosses = round(a["day"] + (C.CAREER_LIMIT_MSV - lo) / (hi - lo) * (b["day"] - a["day"]))
            break
    return {
        "mission": mission_id, "day": today, "arrival_day": m["arrival_day"],
        "departure_day": M.departure_day(m), "end_day": m["end_day"],
        "career_limit_msv": C.CAREER_LIMIT_MSV, "event_limit_msv": C.SPE_EVENT_LIMIT_MSV,
        "storm_dose_msv": storm_dose, "points": points, "crosses_limit_day": crosses,
        "end_msv": round(points[-1]["msv"] + storm_dose, 1),
        "source": "Mission model: published dose rates per phase (constants.py), plus storm dose.",
    }


def analyze(reader, weather_now=None, storm=None):
    m = M.get(reader.mission_id)
    dose = reader("dose_msv")
    rate = reader("dose_rate_usv_h")
    storm_dose = reader.mods["extra_dose"]
    c = curve(reader.mission_id, reader.day, storm_dose)

    days_left = max(0.0, m["end_day"] - reader.day)
    allowance = C.CAREER_LIMIT_MSV - dose
    still_to_come = c["end_msv"] - dose
    budget_per_day = allowance / days_left if days_left else 0.0
    planned_per_day = still_to_come / days_left if days_left else 0.0
    over_pct = 100 * (planned_per_day / budget_per_day - 1) if budget_per_day > 0 else None

    pct = 100 * dose / C.CAREER_LIMIT_MSV
    background = M.phase_values(m, M.phase(m, reader.day))["dose"] * 1000 / 24

    parts = [
        component("dose_so_far", "Dose so far", dose, "mSv", (pct - 40) / 50,
                  f"{dose:.0f} mSv, {pct:.0f}% of the {C.CAREER_LIMIT_MSV} mSv career limit.",
                  {"baseline": 0, "pct_of_limit": round(pct, 1)}),
        component("budget", "Dose budget", planned_per_day, "mSv/day",
                  0.0 if over_pct is None else clamp(over_pct / 60),
                  budget_text(allowance, days_left, budget_per_day, planned_per_day, c["crosses_limit_day"]),
                  {"allowance_msv": round(allowance, 1), "days_left": days_left,
                   "budget_per_day": round(budget_per_day, 2), "over_budget_pct": None if over_pct is None else round(over_pct)}),
        component("storm_dose", "Storm dose", storm_dose, "mSv", storm_dose / C.SPE_EVENT_LIMIT_MSV,
                  f"{storm_dose:.0f} mSv from solar storms (limit {C.SPE_EVENT_LIMIT_MSV} per event)." if storm_dose
                  else "No storm dose this mission.", {"event_limit_msv": C.SPE_EVENT_LIMIT_MSV}),
    ]

    shelter = None
    if storm:
        unsheltered = background * C.STORM_RATE_X_BACKGROUND
        cut = 100 * (1 - rate / unsheltered)
        shelter = {"rate_usv_h": round(rate, 1), "unsheltered_usv_h": round(unsheltered, 1), "reduction_pct": round(cut)}
        ok = cut >= 50
        parts.append(component("shelter", "Storm shelter", cut, "% dose cut", 0.0 if ok else 0.8,
                               f"Dosimeter reads {rate:.0f} µSv/h, {cut:.0f}% below the unsheltered storm rate: shelter is working."
                               if ok else f"Dosimeter still reads {rate:.0f} µSv/h: shelter is not cutting the dose.",
                               {"assumption": "unsheltered rate and shelter factor are estimates (constants.py)"}))

    weather = None
    if weather_now:
        weather = {"flux_pfu": weather_now["flux_pfu"], "threshold_pfu": weather_now["threshold_pfu"],
                   "storm_now": weather_now["proton_event_now"], "time": weather_now["time_tag"]}

    severity = clamp(max(p["severity"] for p in parts))
    ins = inputs(reader, METRICS)
    conf, reasons = confidence(ins)
    return {
        "system": "radiation", "severity": round(severity, 3), "dose_msv": round(dose, 1),
        "dose_rate_usv_h": round(rate, 2), "background_usv_h": round(background, 1),
        "derived": parts, "inputs": ins, "confidence": conf, "confidence_reasons": reasons,
        "curve": c, "shelter": shelter, "space_weather": weather,
    }


def budget_text(allowance, days_left, budget, planned, crosses):
    if days_left <= 0:
        return "Mission complete."
    if allowance <= 0:
        return "Career limit already reached."
    if planned <= budget:
        return f"{allowance:.0f} mSv left over {days_left:.0f} days: on budget ({planned:.2f} of {budget:.2f} mSv a day)."
    return (f"{allowance:.0f} mSv left over {days_left:.0f} days, but the mission adds {planned:.2f} mSv a day "
            f"against a budget of {budget:.2f}. Limit reached on day {crosses}.")
