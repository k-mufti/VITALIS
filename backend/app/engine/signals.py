"""The true (noise-free) value of every crew and ship signal, given the body state.

One source of truth: simulated devices add sensor noise on top of these, and the engine uses
them directly for projections and before any reading has arrived. Coefficients marked
ASSUMPTION are demo models, chosen to move in the direction the cited NASA risk describes.
"""
import math

from .. import constants as C
from .. import missions as M

B = C.BASELINE


def months(mission_id, day):
    return M.microgravity_months(M.get(mission_id), day)


def bone_density_pct(mission_id, day, mods, relief):
    loss = C.BONE_LOSS_PCT_PER_MONTH * months(mission_id, day) * (1 - C.EXERCISE_PROTECTION)
    loss += 0.15 * mods["missed_exercise_days"]  # ASSUMPTION: extra loss per missed exercise day
    return 100 - loss + relief["bones"] * 10


def onsd_mm(mission_id, day, relief):
    widen = C.ONSD_GROWTH_MM_PER_MONTH * months(mission_id, day)
    return C.ONSD_BASELINE_MM + widen - relief["eyes"] * 1.0


def fitness(mods, mission_id, day):
    """Aerobic fitness, 1.0 = preflight. ASSUMPTION: falls with time in microgravity (less with
    exercise), missed sessions, sleep debt and stress. Drives exercise heart rate and recovery."""
    unprotected = months(mission_id, day) * (1 - C.EXERCISE_PROTECTION)
    f = 1 - 0.03 * unprotected - 0.02 * mods["missed_exercise_days"] - 0.03 * mods["sleep_debt"] - 0.04 * mods["stress"]
    return max(0.5, min(1.0, f))


def value(metric, mods, relief, mission_id, day, storm=False):
    """Noise-free value of one metric."""
    m = mods
    unprotected = months(mission_id, day) * (1 - C.EXERCISE_PROTECTION)
    hypoxia = max(0.0, C.PPO2_RANGE_KPA[0] - ppo2(m))       # kPa of oxygen below the safe floor
    high_co2 = max(0.0, cabin_co2(m) - C.CO2_COMFORT_MMHG)
    # ASSUMPTION: low oxygen and high CO2 both push the resting heart rate up.
    rest_hr = (B["heart_rate"] + 5 * m["sleep_debt"] + 0.25 * m["bp_offset"] + 4 * m["stress"]
               + 3.0 * hypoxia + 1.5 * high_co2)

    cardiac = m.get("cardiac", "")
    if metric == "heart_rate":
        if cardiac == "arrest":
            return 0.0
        if cardiac == "brady":
            return 38.0
        if cardiac == "arrhythmia":
            return 118.0  # atrial fibrillation with a fast, irregular rate
        return rest_hr + 0.3 * m.get("bp_drop", 0.0)  # heart speeds up to hold pressure
    if metric == "ecg_irregular":
        return 1.0 if cardiac == "arrhythmia" else 0.0
    if metric == "hrv":
        if cardiac == "arrest":
            return 0.0
        if cardiac == "arrhythmia":
            return 140.0  # irregular beats make beat-to-beat variation huge (not a good sign here)
        return B["hrv"] - 6 * m["sleep_debt"] - 5 * m["stress"]
    if metric == "spo2":
        if cardiac == "arrest":
            return 70.0  # no circulation: the fingertip sensor reads falling, unreliable oxygen
        # ASSUMPTION: blood oxygen falls about 1.5 points per kPa of oxygen below the safe floor.
        return B["spo2"] - 0.2 * high_co2 - 1.5 * hypoxia - 6.0 * m.get("smoke", 0.0)
    if metric == "resp_rate":
        return B["resp_rate"] + 0.05 * m["bp_offset"] + m["stress"] + 0.6 * high_co2 + 0.5 * hypoxia
    if metric == "skin_temp":
        return 33.6
    if metric == "pulse_transit_ms":
        # ASSUMPTION: arteries stiffen in microgravity and with high pressure; stiffer = shorter transit.
        return B["pulse_transit_ms"] - 3.0 * unprotected - 0.8 * m["bp_offset"]
    if metric == "sleep_hours":
        return B["sleep_hours"] - m["sleep_debt"]
    if metric == "glucose":
        return B["glucose"] + 8 * m["stress"]
    if metric == "bp_sys":
        if cardiac == "arrest":
            return 0.0
        return B["bp_sys"] + m["bp_offset"] - m.get("bp_drop", 0.0)
    if metric == "bp_dia":
        if cardiac == "arrest":
            return 0.0
        return B["bp_dia"] + 0.5 * m["bp_offset"] - 0.6 * m.get("bp_drop", 0.0)
    if metric == "onsd_mm":
        return onsd_mm(mission_id, day, relief)
    if metric == "stroke_volume_ml":
        # ASSUMPTION: less blood volume and heart deconditioning in microgravity. Lower body
        # negative pressure (relief) and cycling (fewer missed days) protect it.
        return B["stroke_volume_ml"] * (1 - 0.015 * unprotected - 0.01 * m["missed_exercise_days"]) + 30 * relief["heart"]
    if metric == "quad_thickness_mm":
        # ASSUMPTION: thigh muscle thins in microgravity; resistive exercise slows it.
        return B["quad_thickness_mm"] * (1 - 0.02 * unprotected - 0.004 * m["missed_exercise_days"]) + 20 * relief["muscles"]
    if metric == "reaction_ms":
        return B["reaction_ms"] + 18 * m["sleep_debt"] + 15 * m["stress"]
    if metric == "mood_1to5":
        return max(1.0, min(5.0, B["mood_1to5"] - 0.5 * m["sleep_debt"] - m["stress"]))
    if metric == "exercise_min":
        return session_minutes(m["missed_exercise_days"] > 0)
    if metric == "steps":
        # ASSUMPTION: ordinary movement through the day plus about 100 steps per minute of the exercise session.
        return 4500 + 100 * session_minutes(m["missed_exercise_days"] > 0)
    if metric == "resistive_load_pct":
        # ASSUMPTION: the load you can lift drifts down with muscle loss and missed sessions.
        return max(60.0, 100 - 0.6 * unprotected - 2.5 * m["missed_exercise_days"] + 40 * relief["muscles"])
    if metric == "session_hr_avg":
        # Same protocol workload every day; a less fit body needs a higher heart rate for it.
        return rest_hr + 70 + 40 * (1 - fitness(m, mission_id, day)) + 4.0 * hypoxia
    if metric == "hr_recovery_bpm":
        # Heart-rate drop in the first minute after the session. Under 12 bpm is abnormal (Cole 1999).
        return B["hr_recovery_bpm"] * fitness(m, mission_id, day) + 25 * relief["heart"]
    if metric == "co2_mmhg":
        return cabin_co2(m)
    if metric == "cabin_pressure_kpa":
        return cabin_pressure(m)
    if metric == "ppo2_kpa":
        return ppo2(m)
    if metric == "cabin_temp_c":
        return C.CABIN_TEMP_C + m.get("temp_offset_c", 0.0) + 4.0 * m.get("smoke", 0.0)
    if metric == "smoke_index":
        return m.get("smoke", 0.0)
    if metric == "noise_dba":
        return C.NOISE_BASELINE_DBA + m.get("noise_offset", 0.0)
    if metric == "hearing_shift_db":
        # ASSUMPTION: slow drift from months of module noise, plus a temporary shift after loud days.
        return 0.01 * day * max(0.0, (C.NOISE_BASELINE_DBA - 60) / 10) + 0.5 * m.get("noise_offset", 0.0)
    if metric == "motion_sickness_0to10":
        # Space motion sickness comes with gravity changes (arrival, departure) and fades in days.
        mm = M.get(mission_id)
        since = min(abs(day - mm["arrival_day"]), abs(day - M.departure_day(mm)), day)
        return max(0.0, 6.0 - 2.0 * since) + 0.3 * m.get("pressure_drop_kpa", 0.0)
    if metric == "dose_msv":
        return M.cumulative_dose(M.get(mission_id), day) + m["extra_dose"]
    if metric == "dose_rate_usv_h":
        mm = M.get(mission_id)
        rate = M.phase_values(mm, M.phase(mm, day))["dose"] * 1000 / 24
        if storm:
            rate *= C.STORM_RATE_X_BACKGROUND * C.SHELTER_FACTOR
        return rate
    return B.get(metric, 0.0)


def cabin_co2(mods):
    return C.CO2_BASELINE_MMHG + mods.get("co2_offset", 0.0)


def cabin_pressure(mods):
    return C.CABIN_PRESSURE_KPA - mods.get("pressure_drop_kpa", 0.0) + mods.get("pressure_rise_kpa", 0.0)


def ppo2(mods):
    """Oxygen partial pressure: what the lungs actually get. Falls with cabin pressure."""
    return cabin_pressure(mods) * C.O2_FRACTION + mods.get("o2_boost_kpa", 0.0)


def session_minutes(missed):
    """Minutes on the exercise machines today. A missed day is a short token session."""
    return C.MISSED_SESSION_MIN if missed else C.SESSION_MIN


def trimp(minutes, session_hr, rest_hr):
    """Banister training impulse: minutes x heart-rate reserve used x exponential intensity weight.
    Banister (1991), with the published coefficients 0.64 and 1.92."""
    reserve = (session_hr - rest_hr) / max(1.0, C.HR_MAX - rest_hr)
    reserve = max(0.0, min(1.0, reserve))
    return minutes * reserve * 0.64 * math.exp(1.92 * reserve)
