"""Checks: every number an organ shows, set against a healthy range from a named source.

This is what the app shows when an organ is clicked: measured value -> healthy range -> verdict,
with the source of the range and why the value is where it is. Ranges come from clinical
guidelines or NASA specs where one exists; where none does (HRV, muscle thickness), the
crew member's own preflight value is the reference and the source says so.

`approx` marks ranges we are less sure of; the UI can show them with a "~" so nobody over-trusts.
"""
from .. import constants as C
from ..sources import googlehealth

PERSONAL = "Your preflight baseline"

# id: healthy text, source, how to grade (ok while value in the ok band, act outside the watch band)
REF = {
    "resting_hr": {"healthy": "60-100 bpm (yours 58)", "source": "American Heart Association"},
    "blood_pressure": {"healthy": "under 120/80", "source": "AHA/ACC 2017 guideline"},
    "hr_recovery": {"healthy": "over 12 bpm in the first minute", "source": "Cole et al., NEJM 1999"},
    "hrv": {"healthy": f"near your {C.BASELINE['hrv']} ms", "source": PERSONAL},
    "stroke_volume": {"healthy": "60-100 mL per beat", "source": "Standard adult range", "approx": True},
    "cardiac_output": {"healthy": "4-8 L per minute", "source": "Standard adult range"},
    "pulse_pressure": {"healthy": "about 40 mmHg; over 60 suggests stiff arteries", "source": "Clinical rule of thumb", "approx": True},
    "arterial_stiffness": {"healthy": "pulse no faster than preflight", "source": PERSONAL},
    "spo2": {"healthy": "95-100%", "source": "Clinical standard (WHO pulse oximetry)"},
    "resp_rate": {"healthy": "12-20 a minute", "source": "Clinical standard"},
    "ppo2": {"healthy": f"{C.PPO2_RANGE_KPA[0]}-{C.PPO2_RANGE_KPA[1]} kPa", "source": "ISS cabin atmosphere spec", "approx": True},
    "cabin_pressure": {"healthy": f"{C.CABIN_PRESSURE_RANGE_KPA[0]}-{C.CABIN_PRESSURE_RANGE_KPA[1]} kPa",
                       "source": "ISS cabin atmosphere spec", "approx": True},
    "co2": {"healthy": f"under {C.CO2_COMFORT_MMHG} mmHg", "source": "ISS operations target", "approx": True},
    "noise": {"healthy": f"under {C.NOISE_24H_LIMIT_DBA} dBA over 24 h",
              "source": "NIOSH 85 dBA / 8 h, 3 dB exchange rate"},
    "hearing": {"healthy": f"less than {C.HEARING_SHIFT_DB} dB worse than preflight", "source": "OSHA standard threshold shift"},
    "motion_sickness": {"healthy": "0-2 out of 10", "source": "Self-report scale", "approx": True},
    "onsd": {"healthy": "under 5.0 mm", "source": "Optic nerve ultrasound studies (cutoffs vary 5.0-5.7 mm)", "approx": True},
    "bone": {"healthy": "as little loss as possible; NASA sees 1-1.5% a month", "source": "NASA HRP bone risk"},
    "sleep": {"healthy": "7 h or more", "source": "AASM / CDC adult guideline"},
    "reaction": {"healthy": f"near your {C.BASELINE['reaction_ms']} ms", "source": PERSONAL},
    "mood": {"healthy": "3-5 out of 5", "source": "Self-report scale"},
    "acwr": {"healthy": f"{C.ACWR_LOW}-{C.ACWR_HIGH}", "source": "Gabbett, BJSM 2016"},
    "muscle_thickness": {"healthy": "near preflight", "source": PERSONAL},
    "strength": {"healthy": "near 100% of preflight load", "source": PERSONAL},
    "recovery": {"healthy": "60-100", "source": "VITALIS score (HRV, resting HR, sleep)"},
}


def grade(value, ok, watch, higher_is_worse=True):
    """'ok' inside the ok limit, 'watch' up to the watch limit, 'act' beyond."""
    if not higher_is_worse:
        value, ok, watch = -value, -ok, -watch
    if value <= ok:
        return "ok"
    if value <= watch:
        return "watch"
    return "act"


def check(cid, name, value, unit, verdict, why="", healthy=None):
    ref = REF[cid]
    return {"id": cid, "name": name, "value": value, "unit": unit, "healthy": healthy or ref["healthy"],
            "source": ref["source"], "approx": ref.get("approx", False), "verdict": verdict, "why": why}


def heart_checks(a, reader):
    d = {p["id"]: p for p in a["derived"]}
    hr, sys_, dia = reader("heart_rate"), reader("bp_sys"), reader("bp_dia")
    hrr = d["hr_recovery"]["value"]
    sv = reader("stroke_volume_ml")
    pp = d["pulse_pressure"]["value"]
    why = "; ".join(f"{c['cause']}: {', '.join(c['effects'])}" for c in a["chain"][:2])
    own = googlehealth.resting_baseline(C.BASELINE["heart_rate"])   # None: real watch, own rate not learned yet
    bp_verdict = "ok" if sys_ < 120 and dia < 80 else "watch" if sys_ < 140 and dia < 90 else "act"
    # "yours N" must be the wearer's own number while a real watch is the source, never the simulated crew member's 58
    hr_healthy = "60-100 bpm" + (f" (yours {own:.0f})" if own is not None else "")
    hrv_real = bool((reader.sim.latest.get("hrv") or {}).get("real"))
    hrv_healthy = "no fixed range: compare with your own trend" if hrv_real else None
    return [
        check("resting_hr", "Resting heart rate", round(hr), "bpm",
              "ok" if 60 <= hr <= 100 and (own is None or hr - own <= 8) else "watch" if hr <= 100 else "act", why, hr_healthy),
        check("blood_pressure", "Blood pressure", f"{sys_:.0f}/{dia:.0f}", "mmHg", bp_verdict,
              "AHA: 120-129 elevated, 130-139 stage 1, 140+ stage 2"),
        check("hr_recovery", "Heart-rate recovery", round(hrr), "bpm in 1 min",
              grade(hrr, 18, C.HRR_ABNORMAL_BPM, higher_is_worse=False), "falls as fitness drops"),
        check("hrv", "Heart rate variability", round(reader("hrv")), "ms", d["hrv"]["status"],
              "lower with stress and poor sleep", hrv_healthy),
        check("stroke_volume", "Blood pumped per beat", round(sv), "mL", grade(sv, 60, 50, higher_is_worse=False),
              f"{d['cardiac_output']['stroke_volume']['pct']:+.0f}% from preflight: less blood volume in microgravity"),
        check("cardiac_output", "Cardiac output", round(d["cardiac_output"]["value"], 1), "L/min",
              grade(d["cardiac_output"]["value"], 4, 3.5, higher_is_worse=False), "stroke volume x heart rate"),
        check("pulse_pressure", "Pulse pressure", round(pp), "mmHg", grade(pp, 50, 60), "widens as arteries stiffen"),
        check("arterial_stiffness", "Arterial stiffness", f"{d['arterial_stiffness']['value']:.0f}% faster", "pulse",
              d["arterial_stiffness"]["status"], "from pulse transit time (ECG beat to fingertip)"),
    ]


def lung_checks(reader):
    spo2, resp, ppo2, co2, p = (reader("spo2"), reader("resp_rate"), reader("ppo2_kpa"),
                                 reader("co2_mmhg"), reader("cabin_pressure_kpa"))
    lo_o2 = ppo2 < C.PPO2_RANGE_KPA[0]
    cabin = "cabin air" if lo_o2 or co2 > C.CO2_COMFORT_MMHG else ""
    return [
        check("spo2", "Blood oxygen", round(min(spo2, 100)), "%", grade(spo2, 95, 90, higher_is_worse=False),
              "low because cabin oxygen is low" if lo_o2 else ""),
        check("resp_rate", "Breathing rate", round(resp), "a minute", "ok" if 12 <= resp <= 20 else "watch" if resp <= 24 else "act",
              f"faster because of the {cabin}" if cabin and resp > 17 else ""),
        check("ppo2", "Cabin oxygen", round(ppo2, 1), "kPa", grade(ppo2, C.PPO2_RANGE_KPA[0], 17.0, higher_is_worse=False),
              "oxygen pressure the lungs get; falls with cabin pressure"),
        check("co2", "Cabin CO2", round(co2, 1), "mmHg", grade(co2, C.CO2_COMFORT_MMHG, C.CO2_WATCH_MMHG),
              "ship air scrubber" if co2 > C.CO2_COMFORT_MMHG else ""),
        check("cabin_pressure", "Cabin pressure", round(p, 1), "kPa",
              grade(p, C.CABIN_PRESSURE_RANGE_KPA[0], 92.0, higher_is_worse=False), ""),
    ]


def ear_checks(reader):
    noise, shift, p, sick = (reader("noise_dba"), reader("hearing_shift_db"), reader("cabin_pressure_kpa"),
                             reader("motion_sickness_0to10"))
    return [
        check("noise", "Noise exposure", round(noise), "dBA", grade(noise, 70, C.NOISE_24H_LIMIT_DBA),
              "worn noise dosimeter, day average"),
        check("hearing", "Hearing change", f"{max(0, shift):.0f}", "dB worse", grade(shift, 5, C.HEARING_SHIFT_DB),
              "tablet hearing test with headphones"),
        check("cabin_pressure", "Cabin pressure", round(p, 1), "kPa",
              grade(p, C.CABIN_PRESSURE_RANGE_KPA[0], 92.0, higher_is_worse=False),
              "pressure changes squeeze the eardrums and sinuses" if p < C.CABIN_PRESSURE_RANGE_KPA[0] else ""),
        check("motion_sickness", "Balance and nausea", round(sick), "out of 10", grade(sick, 2, 5),
              "the inner ear readjusts after every gravity change"),
    ]


def muscle_checks(a, reader):
    d = {p["id"]: p for p in a["derived"]}
    return [
        check("acwr", "Training load ratio", a["acwr"], "7-day / 28-day", d["training_balance"]["status"],
              d["training_balance"]["says"]),
        check("muscle_thickness", "Thigh muscle", f"{d['muscle_thickness']['pct']:+.1f}%", "vs preflight",
              d["muscle_thickness"]["status"], "weekly ultrasound"),
        check("strength", "Strength", round(d["strength"]["value"]), "% of preflight", d["strength"]["status"],
              "resistive machine log"),
        check("recovery", "Recovery", a["recovery"], "out of 100", d["recovery"]["status"],
              "HRV, resting heart rate and sleep"),
    ]


def simple_checks(organ, reader, value):
    if organ == "bones":
        loss = 100 - value
        return [check("bone", "Hip and spine density (estimated)", f"-{loss:.1f}%", "vs preflight", grade(loss, 3, 8),
                      "estimated from time in low gravity and exercise; scanned after landing")]
    if organ == "eyes":
        return [check("onsd", "Optic nerve sheath", round(value, 1), "mm", grade(value, 5.0, 5.7),
                      "fluid shifts toward the head in microgravity")]
    if organ == "sleep":
        return [
            check("sleep", "Sleep", round(reader("sleep_hours"), 1), "h", grade(reader("sleep_hours"), 7, 6, higher_is_worse=False), ""),
            check("reaction", "Reaction time", round(reader("reaction_ms")), "ms",
                  grade(reader("reaction_ms") - C.BASELINE["reaction_ms"], 20, 50), "slower when tired"),
            check("mood", "Mood", round(reader("mood_1to5")), "out of 5", grade(reader("mood_1to5"), 3, 2, higher_is_worse=False), ""),
        ]
    return []
