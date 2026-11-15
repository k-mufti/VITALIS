"""Where every crew reading comes from, in flight.

There is no full-body scanner on a spacecraft. The crew kit is kept as small as it can be:
two things worn all day (a smartwatch and a blood sugar patch) and one shared med bay kit
(blood pressure cuff, small ultrasound, radiation badge). The ship adds what it already logs:
exercise machines, tablet tests and cabin air. Bone density cannot be measured in flight at all: it is
scanned on the ground before launch and after landing, so in flight we can only estimate it.

Each metric lists the device, how the value is obtained, how often a real crew would take it,
and what flies today. `demo_every_s` squeezes a real schedule into a watchable demo: a "daily"
blood pressure check shows up every 20 seconds, a "weekly" ultrasound every 60.

method:
  measured     a sensor or test reads it directly
  self-report  the crew member answers a short questionnaire
  estimated    no in-flight instrument; worked out from other data (see `estimated_from`)
"""

MEASURED, SELF_REPORT, ESTIMATED = "measured", "self-report", "estimated"

# The physical devices on board (simulated in the demo).
DEVICES = {
    # kind: worn (on the body all day), kit (shared med bay kit), ship (the ship already logs it)
    "wearable": {
        "label": "Smartwatch", "kind": "worn",
        # ASSUMPTION: a consumer-class watch is flight-qualified for a long mission.
        "real": "Apple Watch Ultra class smartwatch (optical heart sensor, ECG, blood oxygen, wrist temperature, "
                "sleep, sound level). Consumer watches flew for research on Inspiration4 (ASSUMPTION for long missions)",
    },
    "cgm": {
        "label": "Blood sugar patch", "kind": "worn",
        "real": "Continuous glucose monitor (Dexcom-type); flown in private-mission studies (ASSUMPTION for long missions)",
    },
    "bp_cuff": {
        "label": "Blood pressure cuff", "kind": "kit",
        "real": "Automated cuff, part of ISS standard crew medical checks",
    },
    "ultrasound": {
        "label": "Handheld ultrasound", "kind": "kit",
        "real": "ISS Ultrasound 2; crew scan each other's eyes with remote guidance from the ground",
    },
    "dosimeter": {
        "label": "Radiation badge", "kind": "kit",
        "real": "Crew Active Dosimeter worn by ISS crews; Artemis crews carry personal dosimeters too",
    },
    "tablet": {
        "label": "Crew tablet tests", "kind": "ship",
        "real": "NASA Cognition test battery and reaction-time test (PVT) on a laptop or tablet",
    },
    "exercise": {
        "label": "Exercise machines", "kind": "ship",
        "real": "ISS treadmill (T2) and resistive device (ARED) log every session",
    },
    "cabin_air": {
        "label": "Cabin air monitor", "kind": "ship",
        "real": "Ship life-support sensors; the ISS tracks cabin CO2 continuously",
    },
}

METRICS = {
    # metric: device, method, real-life cadence, demo cadence (seconds), unit
    "heart_rate":   {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "bpm"},
    "hrv":          {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "ms"},
    "spo2":         {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "%"},
    "resp_rate":    {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "breaths/min"},
    "skin_temp":    {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "C"},
    "sleep_hours":  {"device": "wearable",   "method": MEASURED,    "cadence": "nightly",    "demo_every_s": 30, "unit": "h"},
    "glucose":      {"device": "cgm",        "method": MEASURED,    "cadence": "every 5 min", "demo_every_s": 5, "unit": "mg/dL"},
    "bp_sys":       {"device": "bp_cuff",    "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "mmHg"},
    "bp_dia":       {"device": "bp_cuff",    "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "mmHg"},
    "onsd_mm":      {"device": "ultrasound", "method": MEASURED,    "cadence": "weekly",     "demo_every_s": 60, "unit": "mm"},
    "reaction_ms":  {"device": "tablet",     "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "ms"},
    "mood_1to5":    {"device": "tablet",     "method": SELF_REPORT, "cadence": "daily",      "demo_every_s": 20, "unit": "1-5"},
    "exercise_min": {"device": "wearable",   "method": MEASURED,    "cadence": "per session", "demo_every_s": 20, "unit": "min/day"},
    "steps":        {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "steps"},
    "resistive_load_pct": {"device": "exercise", "method": MEASURED, "cadence": "per session", "demo_every_s": 20, "unit": "% of preflight load"},
    "pulse_transit_ms": {"device": "wearable", "method": MEASURED,  "cadence": "continuous", "demo_every_s": 1,  "unit": "ms"},
    "session_hr_avg": {"device": "wearable",   "method": MEASURED,  "cadence": "per session", "demo_every_s": 20, "unit": "bpm"},
    "hr_recovery_bpm": {"device": "wearable",  "method": MEASURED,  "cadence": "per session", "demo_every_s": 20, "unit": "bpm in 1 min"},
    "stroke_volume_ml": {"device": "ultrasound", "method": MEASURED, "cadence": "weekly",     "demo_every_s": 60, "unit": "mL per beat"},
    "quad_thickness_mm": {"device": "ultrasound", "method": MEASURED, "cadence": "weekly",    "demo_every_s": 60, "unit": "mm"},
    "cabin_pressure_kpa": {"device": "cabin_air", "method": MEASURED, "cadence": "continuous", "demo_every_s": 5, "unit": "kPa"},
    "ppo2_kpa":     {"device": "cabin_air",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "kPa O2"},
    "noise_dba":    {"device": "wearable",   "method": MEASURED,    "cadence": "daily average", "demo_every_s": 20, "unit": "dBA"},
    "hearing_shift_db": {"device": "tablet", "method": MEASURED,    "cadence": "monthly",    "demo_every_s": 60, "unit": "dB"},
    "motion_sickness_0to10": {"device": "tablet", "method": SELF_REPORT, "cadence": "daily", "demo_every_s": 20, "unit": "0-10"},
    "ecg_irregular": {"device": "wearable", "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "0/1"},
    "cabin_temp_c": {"device": "cabin_air",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "C"},
    "smoke_index":  {"device": "cabin_air",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "0-1"},
    "co2_mmhg":     {"device": "cabin_air",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "mmHg"},
    "dose_msv":     {"device": "dosimeter",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "mSv"},
    "dose_rate_usv_h": {"device": "dosimeter", "method": MEASURED,  "cadence": "continuous", "demo_every_s": 5,  "unit": "µSv/h"},
}

# Smallest step each device reports. A real watch shows 64 bpm, not 64.3; a glucose patch shows
# 98 mg/dL. Simulated readings are rounded the same way so they look like the real thing.
RESOLUTION = {
    "heart_rate": 1, "hrv": 1, "spo2": 1, "resp_rate": 0.5, "session_hr_avg": 1, "hr_recovery_bpm": 1,
    "exercise_min": 1, "steps": 1, "noise_dba": 1, "glucose": 1, "bp_sys": 1, "bp_dia": 1, "reaction_ms": 1,
    "dose_rate_usv_h": 0.01, "co2_mmhg": 0.01,
}
DEFAULT_RESOLUTION = 0.1

# The record type the real device's own software uses for each reading (see devices/native.py).
# Apple HealthKit type + unit for the watch and the cuff; Dexcom "EGV" for the glucose patch.
NATIVE = {
    "heart_rate":      ("healthkit", "HKQuantityTypeIdentifierHeartRate", "count/min"),
    "session_hr_avg":  ("healthkit", "HKQuantityTypeIdentifierHeartRate", "count/min"),
    "hrv":             ("healthkit", "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "ms"),
    "spo2":            ("healthkit", "HKQuantityTypeIdentifierOxygenSaturation", "%"),
    "resp_rate":       ("healthkit", "HKQuantityTypeIdentifierRespiratoryRate", "count/min"),
    "skin_temp":       ("healthkit", "HKQuantityTypeIdentifierAppleSleepingWristTemperature", "degC"),
    "hr_recovery_bpm": ("healthkit", "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute", "count/min"),
    "exercise_min":    ("healthkit", "HKQuantityTypeIdentifierAppleExerciseTime", "min"),
    "steps":           ("healthkit", "HKQuantityTypeIdentifierStepCount", "count"),
    "noise_dba":       ("healthkit", "HKQuantityTypeIdentifierEnvironmentalAudioExposure", "dBASPL"),
    "sleep_hours":     ("healthkit", "HKCategoryTypeIdentifierSleepAnalysis", None),
    "ecg_irregular":   ("healthkit", "HKCategoryTypeIdentifierIrregularHeartRhythmEvent", None),
    "bp_sys":          ("healthkit", "HKQuantityTypeIdentifierBloodPressureSystolic", "mmHg"),
    "bp_dia":          ("healthkit", "HKQuantityTypeIdentifierBloodPressureDiastolic", "mmHg"),
    "glucose":         ("dexcom", "egv", "mg/dL"),
}

# How each organ's headline number is obtained. The UI shows this next to the value.
ORGAN_MEASUREMENT = {
    "heart": {"method": MEASURED,
              "metrics": ["heart_rate", "hrv", "pulse_transit_ms", "bp_sys", "bp_dia", "hr_recovery_bpm", "stroke_volume_ml"],
              "how": "Smartwatch (heart rate all day, heart-rate recovery after each workout), blood pressure cuff (daily) "
                     "and heart ultrasound (weekly)."},
    "lungs": {"method": MEASURED, "metrics": ["resp_rate", "spo2", "ppo2_kpa", "co2_mmhg"],
              "how": "Smartwatch (breathing rate, blood oxygen) checked against the cabin air monitor (O2, CO2, pressure)."},
    "ears": {"method": MEASURED, "metrics": ["noise_dba", "hearing_shift_db", "cabin_pressure_kpa", "motion_sickness_0to10"],
             "how": "Smartwatch sound level (daily), hearing test on the tablet (monthly), cabin pressure, and a daily balance "
                    "and nausea check."},
    "sleep": {"method": MEASURED, "metrics": ["sleep_hours", "reaction_ms", "mood_1to5"],
              "how": "Smartwatch sleep tracking (nightly), reaction test and mood check on the tablet (daily)."},
    "eyes": {"method": MEASURED, "metrics": ["onsd_mm"],
             "how": "Handheld ultrasound of the optic nerve, weekly. Crewmates scan each other."},
    "bones": {"method": ESTIMATED, "metrics": ["exercise_min", "resistive_load_pct"],
              "how": "No bone scanner in flight. Estimated from time in low gravity and your exercise log. "
                     "Confirmed by a DXA scan after landing.",
              "estimated_from": ["time in microgravity", "exercise machine log"]},
    "muscles": {"method": MEASURED,
                "metrics": ["quad_thickness_mm", "resistive_load_pct", "exercise_min", "session_hr_avg", "hrv"],
                "how": "Thigh muscle ultrasound (weekly) and exercise machine loads, plus training load against "
                       "recovery from the watch."},
}


def describe(metric):
    """Catalog entry for a metric, with its device's label folded in."""
    meta = METRICS[metric]
    return {**meta, "sensor": DEVICES[meta["device"]]["label"]}
