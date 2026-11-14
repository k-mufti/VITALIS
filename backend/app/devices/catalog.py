"""Where every crew reading comes from, in flight.

There is no full-body scanner on a spacecraft. Crews wear sensors, take quick self-tests, and
scan each other with a small ultrasound. Bone density cannot be measured in flight at all: it is
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
    "wearable": {
        "label": "Biomonitor shirt",
        "real": "Astroskin smart shirt (CSA Bio-Monitor), worn on the ISS since 2018",
    },
    "actigraph": {
        "label": "Sleep wristband",
        "real": "Actiwatch Spectrum, used for ISS sleep studies",
    },
    "cgm": {
        "label": "Blood sugar patch",
        "real": "Continuous glucose monitor (Dexcom-type); flown in private-mission studies (ASSUMPTION for long missions)",
    },
    "bp_cuff": {
        "label": "Blood pressure cuff",
        "real": "Automated cuff, part of ISS standard crew medical checks",
    },
    "ultrasound": {
        "label": "Handheld ultrasound",
        "real": "ISS Ultrasound 2; crew scan each other's eyes with remote guidance from the ground",
    },
    "tablet": {
        "label": "Crew tablet tests",
        "real": "NASA Cognition test battery and reaction-time test (PVT) on a laptop or tablet",
    },
    "exercise": {
        "label": "Exercise machines",
        "real": "ISS treadmill (T2) and resistive device (ARED) log every session",
    },
    "dosimeter": {
        "label": "Personal dosimeter",
        "real": "Crew Active Dosimeter worn by ISS crews; Artemis crews carry personal dosimeters too",
    },
}

METRICS = {
    # metric: device, method, real-life cadence, demo cadence (seconds), unit
    "heart_rate":   {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "bpm"},
    "hrv":          {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "ms"},
    "spo2":         {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "%"},
    "resp_rate":    {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "breaths/min"},
    "skin_temp":    {"device": "wearable",   "method": MEASURED,    "cadence": "continuous", "demo_every_s": 1,  "unit": "C"},
    "sleep_hours":  {"device": "actigraph",  "method": MEASURED,    "cadence": "nightly",    "demo_every_s": 30, "unit": "h"},
    "glucose":      {"device": "cgm",        "method": MEASURED,    "cadence": "every 5 min", "demo_every_s": 5, "unit": "mg/dL"},
    "bp_sys":       {"device": "bp_cuff",    "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "mmHg"},
    "bp_dia":       {"device": "bp_cuff",    "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "mmHg"},
    "onsd_mm":      {"device": "ultrasound", "method": MEASURED,    "cadence": "weekly",     "demo_every_s": 60, "unit": "mm"},
    "reaction_ms":  {"device": "tablet",     "method": MEASURED,    "cadence": "daily",      "demo_every_s": 20, "unit": "ms"},
    "mood_1to5":    {"device": "tablet",     "method": SELF_REPORT, "cadence": "daily",      "demo_every_s": 20, "unit": "1-5"},
    "exercise_min": {"device": "exercise",   "method": MEASURED,    "cadence": "per session", "demo_every_s": 20, "unit": "min/day"},
    "resistive_load_pct": {"device": "exercise", "method": MEASURED, "cadence": "per session", "demo_every_s": 20, "unit": "% of preflight load"},
    "dose_msv":     {"device": "dosimeter",  "method": MEASURED,    "cadence": "continuous", "demo_every_s": 5,  "unit": "mSv"},
    "dose_rate_usv_h": {"device": "dosimeter", "method": MEASURED,  "cadence": "continuous", "demo_every_s": 5,  "unit": "µSv/h"},
}

# How each organ's headline number is obtained. The UI shows this next to the value.
ORGAN_MEASUREMENT = {
    "heart": {"method": MEASURED, "metrics": ["heart_rate", "bp_sys"],
              "how": "Biomonitor shirt (all day) and blood pressure cuff (daily)."},
    "lungs": {"method": MEASURED, "metrics": ["resp_rate", "spo2"],
              "how": "Biomonitor shirt: breathing rate and blood oxygen, all day."},
    "sleep": {"method": MEASURED, "metrics": ["sleep_hours", "reaction_ms", "mood_1to5"],
              "how": "Sleep wristband (nightly), reaction test and mood check on the tablet (daily)."},
    "eyes": {"method": MEASURED, "metrics": ["onsd_mm"],
             "how": "Handheld ultrasound of the optic nerve, weekly. Crewmates scan each other."},
    "bones": {"method": ESTIMATED, "metrics": ["exercise_min", "resistive_load_pct"],
              "how": "No bone scanner in flight. Estimated from time in low gravity and your exercise log. "
                     "Confirmed by a DXA scan after landing.",
              "estimated_from": ["time in microgravity", "exercise machine log"]},
    "muscles": {"method": ESTIMATED, "metrics": ["exercise_min", "resistive_load_pct"],
                "how": "Estimated from exercise machine loads and missed sessions. No muscle scan in flight.",
                "estimated_from": ["exercise machine log", "missed sessions"]},
}


def describe(metric):
    """Catalog entry for a metric, with its device's label folded in."""
    meta = METRICS[metric]
    return {**meta, "sensor": DEVICES[meta["device"]]["label"]}
