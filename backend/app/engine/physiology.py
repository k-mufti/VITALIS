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
from ..analysis import heart as heart_analysis
from ..analysis import training as training_analysis
from ..analysis import checks as organ_checks
from ..analysis.common import Reader
from ..devices.catalog import ORGAN_MEASUREMENT, describe
from . import signals
from .signals import bone_density_pct, onsd_mm  # noqa: F401  (re-exported for older imports)
from ..sources import googlehealth
from ..state import ORGANS

B = C.BASELINE

# ASSUMPTION: how much each mission's hazards weigh on each organ over the remaining mission.
HAZARD_WEIGHT = {
    "mars": {"bones": 1.25, "heart": 1.1, "sleep": 1.0, "eyes": 1.15, "muscles": 1.0, "lungs": 0.6, "ears": 0.7},
    "moon": {"bones": 0.8, "heart": 0.9, "sleep": 0.9, "eyes": 0.7, "muscles": 0.8, "lungs": 1.0, "ears": 0.8},
    "iss": {"bones": 1.0, "heart": 0.9, "sleep": 0.9, "eyes": 1.0, "muscles": 0.9, "lungs": 0.6, "ears": 0.7},
}

NAMES = {"heart": "Heart", "bones": "Bones", "sleep": "Sleep & mind", "eyes": "Eyes", "lungs": "Lungs", "muscles": "Muscles",
         "ears": "Ears & balance"}

UNITS = {
    "heart": ("beats a minute at rest", "54-62"),
    "bones": ("% of preflight density (estimated)", "97-100"),
    "sleep": ("hours slept", "7-8 h"),
    "eyes": ("mm optic nerve sheath (ultrasound)", "under 5.0 mm"),
    "lungs": ("breaths a minute", "14-18"),
    "muscles": ("strength estimate out of 100", "80-95"),
    "ears": ("dBA noise, day average", "under 70"),
}

SOURCES = {
    "bones": "NASA HRP: bone loss 1-1.5% per month in weight-bearing bones",
    "heart": "NASA HRP: Cardiovascular Adaptations",
    "sleep": "NASA HRP: Inadequate Sleep and Irregular Schedules",
    "eyes": "NASA HRP: Spaceflight Associated Neuro-ocular Syndrome, NASA's leading spaceflight health risk",
    "muscles": "NASA HRP: Reduced Cardiorespiratory and Musculoskeletal Fitness",
    "lungs": "NASA HRP: Hypoxia; Host-Microorganism Interactions",
    "ears": "NASA HRP: Altered Sensorimotor and Vestibular Function; NIOSH noise limits",
}

WHAT_COULD_GO_WRONG = {
    "bones": [
        ("Hip or spine fracture after landing", "arrival", ["estimate below 92%", "back pain under load"]),
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
    "ears": [
        ("Hearing loss from months of cabin noise", None, ["hearing test worse", "ringing in the ears"]),
        ("Dizziness and falls after landing while balance readjusts", "arrival", ["nausea score rising", "unsteady when turning the head"]),
        ("Ear and sinus pain from a cabin pressure change", None, ["ears not clearing", "cabin pressure dropping"]),
    ],
}

# `research` = the real NASA HRP study behind a countermeasure (app/hrp.py RESEARCH).
COUNTERMEASURES = {
    "bones": [
        {"id": "ared_60", "label": "60 min resistive exercise", "minutes": 60,
         "mods": {"missed_exercise_days": -3}, "relief": {"bones": 0.08, "muscles": 0.05}},
    ],
    "heart": [
        {"id": "stabilise", "label": "Medical officer treats and stabilises the heart", "minutes": 20,
         "mods": {"cardiac": "", "bp_drop": -60.0}, "relief": {}},
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
    "ears": [
        {"id": "ear_protection", "label": "Earplugs for sleep + fix the noisy fan", "minutes": 20,
         "mods": {"noise_offset": -10.0}, "relief": {"ears": 0.05}},
        {"id": "leak_check", "label": "Find and seal the cabin leak, repressurise", "minutes": 60,
         "mods": {"pressure_drop_kpa": -10.0}, "relief": {}},
    ],
    "lungs": [
        {"id": "air_check", "label": "Cabin air check + scrubber reset", "minutes": 15,
         "mods": {"co2_offset": -2.0}, "relief": {"lungs": 0.05}},
        {"id": "fire_response", "label": "Put out the fire and clear the smoke", "minutes": 20,
         "mods": {"smoke": -1.0, "temp_offset_c": -15.0}, "relief": {}},
        {"id": "atmosphere_trim", "label": "Bring cabin pressure, oxygen and temperature back to normal", "minutes": 15,
         "mods": {"pressure_rise_kpa": -10.0, "o2_boost_kpa": -6.0, "temp_offset_c": -15.0}, "relief": {}},
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

def expected(mods, metric, relief=None, mission_id="mars", day=184.0):
    """What a device should read given the body state (projections, and before any readings)."""
    return signals.value(metric, mods, relief or {k: 0.0 for k in ORGANS}, mission_id, day)


# ---------- organ models ----------

def organ_analysis(sim, organ, mission_id, day, mods, relief, live):
    """Full pipeline result for the deep systems (heart, muscles); None for the simple ones."""
    reader = Reader(sim, mods, relief, mission_id, day, live)
    if organ == "heart":
        return heart_analysis.analyze(reader)
    if organ == "muscles":
        return training_analysis.analyze(reader)
    return None


def organ_severity(sim, organ, mission_id, day, mods, relief, live):
    """Returns (severity 0..1, displayed value)."""
    reader = Reader(sim, mods, relief, mission_id, day, live)
    if organ in ("heart", "muscles"):
        a = organ_analysis(sim, organ, mission_id, day, mods, relief, live)
        return a["severity"], a["value"]
    if organ == "bones":
        density = bone_density_pct(mission_id, day, mods, relief)
        return clamp((100 - density) / 8), density
    if organ == "eyes":
        onsd = reader("onsd_mm") if live and sim.latest.get("onsd_mm") else onsd_mm(mission_id, day, relief)
        return clamp((onsd - C.ONSD_WATCH_MM) / 1.0), onsd
    if organ == "sleep":
        hours = reader("sleep_hours")
        react = reader("reaction_ms")
        mood = reader("mood_1to5")
        sev = max(0, B["sleep_hours"] - hours) / 4.0 + max(0, react - 260) / 200 + max(0, 3 - mood) / 6
        return clamp(sev - relief["sleep"]), hours
    if organ == "ears":
        noise, shift = reader("noise_dba"), reader("hearing_shift_db")
        pressure, sick = reader("cabin_pressure_kpa"), reader("motion_sickness_0to10")
        sev = (0.4 * clamp((noise - 70) / (C.NOISE_24H_LIMIT_DBA - 70)) + 0.3 * clamp(shift / C.HEARING_SHIFT_DB)
               + 0.2 * clamp((C.CABIN_PRESSURE_RANGE_KPA[0] - pressure) / 6) + 0.1 * clamp(sick / 6))
        return clamp(sev - relief["ears"]), noise
    if organ == "lungs":
        spo2 = reader("spo2")
        resp = reader("resp_rate")
        co2 = reader("co2_mmhg")
        ppo2 = reader("ppo2_kpa")
        sev = (max(0, 97.5 - spo2) / 5 + abs(resp - B["resp_rate"]) / 10 + 0.3 * clamp((co2 - C.CO2_COMFORT_MMHG) / 3)
               + 0.4 * clamp((C.PPO2_RANGE_KPA[0] - ppo2) / 2.5))
        return clamp(sev - relief["lungs"]), resp
    return 0.0, 0


def note_for(organ, severity, value, mods):
    if organ == "bones":
        return f"Estimated hip and spine density down {100 - value:.1f}% since launch. Scanned after landing."
    if organ == "eyes":
        if value < 5.0:
            return f"Optic nerve sheath is {value:.1f} mm, in the normal range."
        if severity < 0.33:
            return f"Optic nerve sheath is {value:.1f} mm, just above normal. Keep up the countermeasures."
        return f"Fluid shifting toward the head has widened the optic nerve sheath to {value:.1f} mm."
    if organ == "heart":
        if severity < 0.33:
            return "Resting heart rate is in your usual range."
        own = googlehealth.resting_baseline(B["heart_rate"])    # the real wearer's own rate while a real watch is the source
        if own is None:
            return f"Resting heart rate is {value:.0f} beats a minute. " + ("Needs action today." if severity >= 0.66 else "Worth watching.")
        if severity >= 0.66:
            return f"Resting rate is {value - own:.0f} beats above your usual. Needs action today."
        return f"Resting rate is {value - own:.0f} beats above your usual. Worth watching."
    if organ == "sleep":
        if value >= B["sleep_hours"] - 0.3:
            return "Sleeping as usual. Focus is normal."
        return f"Sleeping {B['sleep_hours'] - value:.1f} h less than usual this week."
    if organ == "muscles":
        if mods["missed_exercise_days"] > 0:
            return f"{mods['missed_exercise_days']:.0f} missed workout days are slowing recovery."
        return "Recovering well from workouts."
    if organ == "ears":
        if mods.get("pressure_drop_kpa", 0) > 2:
            return f"Cabin pressure is down {mods['pressure_drop_kpa']:.0f} kPa: ears and sinuses feel it, and oxygen drops with it."
        if value > 70:
            return f"Noise averaging {value:.0f} dBA today. Above 70 the ears need protection."
        return "Hearing, balance and cabin pressure are normal."
    if organ == "lungs":
        if mods.get("pressure_drop_kpa", 0) > 2:
            return "Cabin pressure is low, so every breath carries less oxygen. The ship's air, not your lungs."
        co2 = C.CO2_BASELINE_MMHG + mods.get("co2_offset", 0.0)
        if co2 > C.CO2_COMFORT_MMHG:
            return f"Breathing faster because cabin CO2 is {co2:.1f} mmHg. The ship's air, not your lungs."
        return "Breathing is steady. Right where it usually is."
    return ""


def drivers_for(organ, mission_id, day, mods, dose_frac):
    out = []
    m = M.get(mission_id)
    low_gravity = M.phase_values(m, M.phase(m, day))["gravity"] < 0.2
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
    if organ in ("lungs", "heart") and C.CO2_BASELINE_MMHG + mods.get("co2_offset", 0) > C.CO2_COMFORT_MMHG:
        out.append("cabin CO2 high (ship air, not your lungs)")
    if organ in ("lungs", "heart", "ears") and mods.get("pressure_drop_kpa", 0) > 2:
        out.append("cabin pressure low (less oxygen)")
    if organ == "ears" and mods.get("noise_offset", 0) > 3:
        out.append("noisy module")
    return out


def apply_change(mods, relief, cm):
    for key, delta in cm.get("mods", {}).items():
        if isinstance(delta, str):  # states like the heart rhythm are set, not added
            mods[key] = delta
            continue
        mods[key] = max(0.0, mods[key] + delta)
    for key, delta in cm.get("relief", {}).items():
        relief[key] = relief[key] + delta


def horizon_day(m, day):
    if day < m["arrival_day"]:
        return m["arrival_day"]
    if day < M.departure_day(m):
        return M.departure_day(m)
    return m["end_day"]


def measurement_for(sim, organ, live):
    """How this organ's number is obtained in flight, and when each input was last taken."""
    meta = ORGAN_MEASUREMENT[organ]
    inputs = []
    for metric in meta["metrics"]:
        d = describe(metric)
        last = sim.latest.get(metric) if live else None
        inputs.append({"metric": metric, "sensor": d["sensor"], "method": d["method"], "cadence": d["cadence"],
                       "last_ts": last["ts"] if last else None})
    out = {"method": meta["method"], "how": meta["how"], "inputs": inputs}
    if meta.get("estimated_from"):
        out["estimated_from"] = meta["estimated_from"]
    return out


def checks_for(sim, organ, mission_id, day, mods, relief, live, analysis, value):
    """What the app shows when the organ is clicked: value, healthy range, source, verdict, why."""
    reader = Reader(sim, mods, relief, mission_id, day, live)
    if organ == "heart":
        return organ_checks.heart_checks(analysis, reader)
    if organ == "muscles":
        return organ_checks.muscle_checks(analysis, reader)
    if organ == "lungs":
        return organ_checks.lung_checks(reader)
    if organ == "ears":
        return organ_checks.ear_checks(reader)
    return organ_checks.simple_checks(organ, reader, value)


def organ_state(sim, organ, mission_id, day, mods, relief, live, dose_frac):
    m = M.get(mission_id)
    severity, value = organ_severity(sim, organ, mission_id, day, mods, relief, live)
    analysis = organ_analysis(sim, organ, mission_id, day, mods, relief, live)
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
    if organ == "heart":      # the wearer's own usual range while a real watch is the source
        own = googlehealth.resting_baseline(B["heart_rate"])
        usual = "60-100" if own is None else f"{own - 4:.0f}-{own + 4:.0f}"
    if organ in ("bones", "sleep", "eyes"):
        shown = round(value, 1)
    else:
        shown = round(value)
    state = {
        "id": organ, "name": NAMES[organ], "rank": None,
        "mission_risk": round(risk, 3), "severity": round(severity, 3), "status": status_for(severity),
        "level": level_for(severity),
        "value": shown, "unit": unit, "usual": usual,
        "note": analysis["note"] if analysis else note_for(organ, severity, value, mods),
        "drivers": drivers_for(organ, mission_id, day, mods, dose_frac),
        "projection": projection, "countermeasures": cms, "what_could_go_wrong": wrong,
        "source": SOURCES[organ],
        "measurement": measurement_for(sim, organ, live),
    }
    if analysis:
        state["analysis"] = analysis
    state["checks"] = checks_for(sim, organ, mission_id, day, mods, relief, live, analysis, value)
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
