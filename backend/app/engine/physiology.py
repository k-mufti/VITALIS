"""Physiology + mission risk engine.

Input: mission environment (app/missions.py, fed by Horizons/DONKI/NOAA), device readings, and
the body state (sim.mods). Output per organ: current value, severity (0..1, how bad now),
projection over the mission, mission_risk (0..1, how much THIS mission threatens it),
NASA HRP tags, what could go wrong, and countermeasures.
"""
import copy

from .. import constants as C
from .. import hrp
from .. import missions as M
from ..state import ORGANS

B = C.BASELINE

# ASSUMPTION: how much each mission's hazards weigh on each organ over the remaining mission.
HAZARD_WEIGHT = {
    "mars": {"bones": 1.25, "heart": 1.1, "sleep": 1.0, "eyes": 1.15, "muscles": 1.0, "lungs": 0.6},
    "moon": {"bones": 0.8, "heart": 0.9, "sleep": 0.9, "eyes": 0.7, "muscles": 0.8, "lungs": 1.0},
    "iss": {"bones": 1.0, "heart": 0.9, "sleep": 0.9, "eyes": 1.0, "muscles": 0.9, "lungs": 0.6},
}

NAMES = {"heart": "Heart", "bones": "Bones", "sleep": "Sleep & mind", "eyes": "Eyes", "lungs": "Lungs", "muscles": "Muscles"}

UNITS = {
    "heart": ("beats a minute at rest", "54-62"),
    "bones": ("% of preflight density", "97-100"),
    "sleep": ("hours slept", "7-8 h"),
    "eyes": ("mm optic nerve sheath (ultrasound)", "under 5.0 mm"),
    "lungs": ("breaths a minute", "14-18"),
    "muscles": ("recovery out of 100", "80-95"),
}

SOURCES = {
    "bones": "NASA HRP: bone loss 1-1.5% per month in weight-bearing bones",
    "heart": "NASA HRP: Cardiovascular Adaptations",
    "sleep": "NASA HRP: Inadequate Sleep and Irregular Schedules",
    "eyes": "NASA HRP: Spaceflight Associated Neuro-ocular Syndrome, NASA's leading spaceflight health risk",
    "muscles": "NASA HRP: Reduced Cardiorespiratory and Musculoskeletal Fitness",
    "lungs": "NASA HRP: Hypoxia; Host-Microorganism Interactions",
}

WHAT_COULD_GO_WRONG = {
    "bones": [
        ("Hip or spine fracture after landing", "arrival", ["density below 92%", "back pain under load"]),
        ("Kidney stones from calcium released by bone", None, ["side or back pain", "less urine"]),
    ],
    "heart": [
        ("Dizziness or fainting when standing up after landing", "arrival", ["resting rate climbing", "light-headed when moving"]),
        ("Irregular heart rhythm", None, ["skipped beats", "racing heart at rest"]),
    ],
    "sleep": [
        ("Slower reactions and mistakes during critical tasks", "soon", ["reaction test slower than usual", "under 6 h sleep"]),
        ("Low mood and crew conflict from isolation", None, ["mood score dropping", "withdrawing from crew"]),
    ],
    "eyes": [
        ("Blurry near vision from optic disc swelling (SANS)", "arrival", ["near vision getting worse", "optic nerve sheath over 5 mm"]),
        ("Lasting changes to eye shape after the mission", None, ["folds in the back of the eye on imaging"]),
    ],
    "muscles": [
        ("Weak legs at landing, harder first surface walk", "arrival", ["recovery score falling", "missed workouts"]),
    ],
    "lungs": [
        ("Breathing problems from cabin air or dust", None, ["oxygen below 95%", "breathing faster at rest"]),
    ],
}

# `research` = the real NASA HRP study behind a countermeasure (app/hrp.py RESEARCH).
COUNTERMEASURES = {
    "bones": [
        {"id": "ared_60", "label": "60 min resistive exercise", "minutes": 60,
         "mods": {"missed_exercise_days": -3}, "relief": {"bones": 0.08, "muscles": 0.05}},
    ],
    "heart": [
        {"id": "lbnp_30", "label": "30 min lower body negative pressure", "minutes": 30, "mods": {}, "relief": {"heart": 0.12}},
        {"id": "cardio_45", "label": "45 min cycling", "minutes": 45, "research": "Zero T2",
         "mods": {"missed_exercise_days": -1}, "relief": {"heart": 0.06}},
    ],
    "sleep": [
        {"id": "sleep_plan", "label": "Protected 8 h sleep + light schedule", "minutes": 480, "research": "ARCHeR (Artemis II)",
         "mods": {"sleep_debt": -0.8, "stress": -0.3}, "relief": {}},
        {"id": "call_home", "label": "Video message home + crew time", "minutes": 30,
         "mods": {"stress": -0.5}, "relief": {"sleep": 0.05}},
    ],
    "eyes": [
        {"id": "thigh_cuff", "label": "Thigh cuffs during the day (keeps fluid in the legs)", "minutes": 480,
         "research": "Thigh Cuff", "mods": {}, "relief": {"eyes": 0.12}},
        {"id": "b_complex", "label": "Daily B vitamin supplement", "minutes": 1,
         "research": "B-Complex", "mods": {}, "relief": {"eyes": 0.04}},
    ],
    "muscles": [
        {"id": "ared_60", "label": "60 min resistive exercise", "minutes": 60,
         "mods": {"missed_exercise_days": -3}, "relief": {"bones": 0.08, "muscles": 0.05}},
    ],
    "lungs": [
        {"id": "air_check", "label": "Cabin air check + breathing exercises", "minutes": 15, "mods": {}, "relief": {"lungs": 0.05}},
    ],
}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def status_for(severity):
    if severity < 0.33:
        return "OK"
    if severity < 0.66:
        return "Watch"
    return "Act"


def level_for(severity):
    """Plain word for the risk panel: how bad this is right now."""
    if severity < 0.33:
        return "low"
    if severity < 0.66:
        return "mild"
    return "extreme"


def likelihood(risk):
    if risk < 0.33:
        return "low"
    if risk < 0.66:
        return "medium"
    return "high"


# ---------- readings ----------

def expected(mods, metric):
    """What a device should read given the body state (used for projections and before any readings)."""
    if metric == "heart_rate":
        return B["heart_rate"] + 5 * mods["sleep_debt"] + 0.25 * mods["bp_offset"] + 4 * mods["stress"]
    if metric == "sleep_hours":
        return B["sleep_hours"] - mods["sleep_debt"]
    if metric == "reaction_ms":
        return B["reaction_ms"] + 18 * mods["sleep_debt"] + 15 * mods["stress"]
    if metric == "mood_1to5":
        return clamp(B["mood_1to5"] - 0.5 * mods["sleep_debt"] - mods["stress"], 1, 5)
    if metric == "bp_sys":
        return B["bp_sys"] + mods["bp_offset"]
    if metric == "resp_rate":
        return B["resp_rate"] + 0.05 * mods["bp_offset"] + mods["stress"]
    return B.get(metric, 0)


def reading(sim, mods, metric, live):
    """Live: average of recent device readings. Otherwise the expected value."""
    if live:
        value = sim.recent(metric)
        if value is not None:
            return value
    return expected(mods, metric)


# ---------- organ models ----------

def bone_density_pct(mission_id, day, mods, relief):
    m = M.get(mission_id)
    loss = C.BONE_LOSS_PCT_PER_MONTH * M.microgravity_months(m, day) * (1 - C.EXERCISE_PROTECTION)
    loss += 0.15 * mods["missed_exercise_days"]  # ASSUMPTION: extra loss per missed exercise day
    return 100 - loss + relief["bones"] * 10


def onsd_mm(mission_id, day, relief):
    m = M.get(mission_id)
    widen = C.ONSD_GROWTH_MM_PER_MONTH * M.microgravity_months(m, day)
    return C.ONSD_BASELINE_MM + widen - relief["eyes"] * 1.0


def organ_severity(sim, organ, mission_id, day, mods, relief, live):
    """Returns (severity 0..1, displayed value)."""
    m = M.get(mission_id)
    months = M.microgravity_months(m, day)
    if organ == "bones":
        density = bone_density_pct(mission_id, day, mods, relief)
        return clamp((100 - density) / 8), density
    if organ == "eyes":
        onsd = onsd_mm(mission_id, day, relief)
        return clamp((onsd - C.ONSD_WATCH_MM) / 1.0), onsd
    if organ == "heart":
        hr = reading(sim, mods, "heart_rate", live)
        bp = reading(sim, mods, "bp_sys", live)
        decon = 0.25 * min(1, months / 9) * (1 - C.EXERCISE_PROTECTION)  # ASSUMPTION
        sev = max(0, hr - B["heart_rate"]) / 20 + max(0, bp - 125) / 40 + decon
        return clamp(sev - relief["heart"]), hr
    if organ == "sleep":
        hours = reading(sim, mods, "sleep_hours", live)
        react = reading(sim, mods, "reaction_ms", live)
        mood = reading(sim, mods, "mood_1to5", live)
        sev = max(0, B["sleep_hours"] - hours) / 4.0 + max(0, react - 260) / 200 + max(0, 3 - mood) / 6
        return clamp(sev - relief["sleep"]), hours
    if organ == "muscles":
        sev = 0.06 * months * (1 - C.EXERCISE_PROTECTION) + 0.05 * mods["missed_exercise_days"]
        sev = clamp(sev - relief["muscles"])
        return sev, 100 - 45 * sev
    if organ == "lungs":
        spo2 = reading(sim, mods, "spo2", live)
        resp = reading(sim, mods, "resp_rate", live)
        sev = max(0, 97.5 - spo2) / 5 + abs(resp - B["resp_rate"]) / 10
        return clamp(sev - relief["lungs"]), resp
    return 0.0, 0


def note_for(organ, severity, value, mods):
    if organ == "bones":
        return f"Hip and spine density down {100 - value:.1f}% since launch."
    if organ == "eyes":
        if value < 5.0:
            return f"Optic nerve sheath is {value:.1f} mm, in the normal range."
        if severity < 0.33:
            return f"Optic nerve sheath is {value:.1f} mm, just above normal. Keep up the countermeasures."
        return f"Fluid shifting toward the head has widened the optic nerve sheath to {value:.1f} mm."
    if organ == "heart":
        if severity < 0.33:
            return "Resting heart rate is in your usual range."
        if severity >= 0.66:
            return f"Resting rate is {value - B['heart_rate']:.0f} beats above your usual. Needs action today."
        return f"Resting rate is {value - B['heart_rate']:.0f} beats above your usual. Worth watching."
    if organ == "sleep":
        if value >= B["sleep_hours"] - 0.3:
            return "Sleeping as usual. Focus is normal."
        return f"Sleeping {B['sleep_hours'] - value:.1f} h less than usual this week."
    if organ == "muscles":
        if mods["missed_exercise_days"] > 0:
            return f"{mods['missed_exercise_days']:.0f} missed workout days are slowing recovery."
        return "Recovering well from workouts."
    if organ == "lungs":
        return "Breathing is steady. Right where it usually is."
    return ""


def drivers_for(organ, mission_id, day, mods, dose_frac):
    out = []
    m = M.get(mission_id)
    low_gravity = m[M.phase(m, day)]["gravity"] < 0.2
    if low_gravity and organ in ("bones", "muscles", "heart", "eyes"):
        out.append("microgravity")
    if low_gravity and organ == "eyes":
        out.append("fluid shift toward the head")
    if mods["missed_exercise_days"] > 0 and organ in ("bones", "muscles", "heart"):
        out.append(f"{mods['missed_exercise_days']:.0f} missed exercise days")
    if mods["sleep_debt"] > 0.5 and organ in ("sleep", "heart"):
        out.append(f"{mods['sleep_debt']:.1f} h sleep debt")
    if mods["bp_offset"] > 5 and organ == "heart":
        out.append("blood pressure spike")
    if mods["stress"] > 0.4 and organ in ("sleep", "heart"):
        out.append("stress")
    if dose_frac > 0.4 and organ in ("heart", "sleep"):
        out.append("radiation dose")
    return out


def apply_change(mods, relief, cm):
    for key, delta in cm.get("mods", {}).items():
        mods[key] = max(0.0, mods[key] + delta)
    for key, delta in cm.get("relief", {}).items():
        relief[key] = relief[key] + delta


def horizon_day(m, day):
    if day < m["arrival_day"]:
        return m["arrival_day"]
    return m["end_day"]


def organ_state(sim, organ, mission_id, day, mods, relief, live, dose_frac):
    m = M.get(mission_id)
    severity, value = organ_severity(sim, organ, mission_id, day, mods, relief, live)
    hz = horizon_day(m, day)
    future, _ = organ_severity(sim, organ, mission_id, hz, mods, relief, False)
    weight = HAZARD_WEIGHT.get(mission_id, HAZARD_WEIGHT["mars"])[organ]
    risk = 0.4 * severity + 0.6 * future * weight
    if organ in ("heart", "sleep"):
        risk += 0.2 * dose_frac  # ASSUMPTION: radiation adds cardiovascular and brain risk
    risk = clamp(risk)

    projection = []
    step = max(1, int((hz - day) / 8))
    d = int(day)
    while d <= hz:
        sev_d, _ = organ_severity(sim, organ, mission_id, d, mods, relief, False)
        projection.append({"day": d, "severity": round(sev_d, 3)})
        d += step

    wrong = []
    for title, when, signs in WHAT_COULD_GO_WRONG[organ]:
        by_day = None
        if when == "arrival":
            by_day = hz
        elif when == "soon":
            by_day = int(day) + 3
        wrong.append({"title": title, "likelihood": likelihood(risk), "by_day": by_day, "signs": signs})

    before, _ = organ_severity(sim, organ, mission_id, day, mods, relief, False)
    cms = []
    for cm in COUNTERMEASURES[organ]:
        mods2, relief2 = copy.deepcopy(mods), copy.deepcopy(relief)
        apply_change(mods2, relief2, cm)
        after, _ = organ_severity(sim, organ, mission_id, day, mods2, relief2, False)
        item = {"id": cm["id"], "label": cm["label"], "minutes": cm["minutes"], "effect": round(after - before, 3)}
        if cm.get("research"):
            item["research"] = cm["research"]
        cms.append(item)
    cms.sort(key=lambda c: c["effect"])

    unit, usual = UNITS[organ]
    if organ in ("bones", "sleep", "eyes"):
        shown = round(value, 1)
    else:
        shown = round(value)
    state = {
        "id": organ, "name": NAMES[organ], "rank": None,
        "mission_risk": round(risk, 3), "severity": round(severity, 3), "status": status_for(severity),
        "level": level_for(severity),
        "value": shown, "unit": unit, "usual": usual,
        "note": note_for(organ, severity, value, mods),
        "drivers": drivers_for(organ, mission_id, day, mods, dose_frac),
        "projection": projection, "countermeasures": cms, "what_could_go_wrong": wrong,
        "source": SOURCES[organ],
    }
    state.update(hrp.tags_for(organ))
    return state


def mission_state(sim, day=None, mission_id=None):
    """Full MissionState (plan.md 5.3). No day/mission = live, using device readings."""
    live = day is None and mission_id is None
    if day is None:
        day = sim.day
    day = float(day)
    mission_id = mission_id or sim.mission
    env = M.environment(mission_id, day)
    dose = env["radiation_msv"] + sim.mods["extra_dose"]
    dose_frac = dose / C.CAREER_LIMIT_MSV
    organs = {}
    for organ in ORGANS:
        organs[organ] = organ_state(sim, organ, mission_id, day, sim.mods, sim.relief, live, dose_frac)
    ranking = sorted(ORGANS, key=lambda k: organs[k]["mission_risk"], reverse=True)
    for i, k in enumerate(ranking):
        organs[k]["rank"] = i + 1
    state = dict(env)
    state.update({
        "crew_id": sim.crew_id,
        "radiation_msv": round(dose, 1),
        "radiation_pct_of_career_limit": round(100 * dose_frac, 1),
        "storm_dose_msv": sim.mods["extra_dose"],
        "storm": sim.storm,
        "risk_ranking": ranking,
        "organs": organs,
    })
    return state
