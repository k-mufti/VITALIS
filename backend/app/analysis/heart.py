"""Heart pipeline: is the heart and its plumbing coping with spaceflight?

Inputs (all flight-realistic): ECG shirt (resting heart rate, HRV, pulse transit time, heart rate
during and after each workout), blood pressure cuff (daily), Doppler ultrasound (weekly).

Derived measures, each against Crew 03's preflight baseline:
  resting heart rate   rises with sleep debt, stress and deconditioning
  HRV (RMSSD)          falls with stress and poor recovery (autonomic balance)
  blood pressure       systolic; spikes are the acute risk
  pulse pressure       systolic - diastolic; widening hints at stiffer arteries
  arterial stiffness   from pulse transit time: stiffer arteries carry the pulse faster
  heart-rate recovery  drop in the first minute after exercise; <= 12 bpm is abnormal (Cole 1999)
  cardiac output       stroke volume (ultrasound) x heart rate; microgravity shrinks stroke volume

Score = weighted sum of each measure's severity. Weights are ours (ASSUMPTION); thresholds that
come from the literature are named in constants.py.
"""
from .. import constants as C
from .common import clamp, component, confidence, inputs, vs_baseline

METRICS = ["heart_rate", "hrv", "pulse_transit_ms", "bp_sys", "bp_dia", "hr_recovery_bpm", "stroke_volume_ml", "ecg_irregular"]

WEIGHTS = {"resting_hr": 0.18, "hrv": 0.12, "blood_pressure": 0.20, "pulse_pressure": 0.05,
           "arterial_stiffness": 0.10, "hr_recovery": 0.15, "cardiac_output": 0.10, "rhythm": 0.10}
# Any of these at its worst is dangerous on its own, whatever the weighted sum says.
CRITICAL = ("resting_hr", "blood_pressure", "cardiac_output", "rhythm")

# Body-state knobs that push the heart, in plain words.
DRIVERS = {
    "sleep_debt": lambda v: f"{v:.1f} h sleep debt",
    "stress": lambda v: "stress",
    "bp_offset": lambda v: f"blood pressure up {v:.0f} mmHg",
    "missed_exercise_days": lambda v: f"{v:.0f} missed workouts",
    "pressure_drop_kpa": lambda v: f"cabin pressure down {v:.0f} kPa (less oxygen)",
    "co2_offset": lambda v: f"cabin CO2 up {v:.1f} mmHg",
}


def analyze(reader):
    B = C.BASELINE
    hr = reader("heart_rate")
    hrv = reader("hrv")
    sys_, dia = reader("bp_sys"), reader("bp_dia")
    ptt = reader("pulse_transit_ms")
    hrr = reader("hr_recovery_bpm")
    sv = reader("stroke_volume_ml")
    irregular = reader("ecg_irregular") >= 0.5

    pp = sys_ - dia
    pp_base = B["bp_sys"] - B["bp_dia"]
    hrv_b, ptt_b, sv_b = vs_baseline("hrv", hrv), vs_baseline("pulse_transit_ms", ptt), vs_baseline("stroke_volume_ml", sv)
    co = sv * hr / 1000
    co_base = B["stroke_volume_ml"] * B["heart_rate"] / 1000

    parts = [
        component("resting_hr", "Resting heart rate", hr, "bpm",
                  max((hr - B["heart_rate"] - 2) / 15, (52 - hr) / 12),
                  ("No heartbeat detected." if hr < 20 else
                   f"Heart rate {hr:.0f} bpm: too slow." if hr < 45 else
                   f"Resting heart rate {hr:.0f} bpm, {hr - B['heart_rate']:+.0f} from your normal."),
                  vs_baseline("heart_rate", hr)),
        component("hrv", "Heart rate variability", hrv, "ms", 0.0 if irregular else (-hrv_b["pct"] - 5) / 40,
                  "HRV unreliable during an irregular rhythm." if irregular else
                  f"HRV {hrv:.0f} ms, {hrv_b['pct']:+.0f}% from your normal. Lower means more strain.", hrv_b),
        component("blood_pressure", "Blood pressure", sys_, "mmHg", max((sys_ - 125) / 30, (100 - sys_) / 30),
                  f"Blood pressure {sys_:.0f}/{dia:.0f}" + (": too low." if sys_ < 90 else "."), vs_baseline("bp_sys", sys_)),
        component("pulse_pressure", "Pulse pressure", pp, "mmHg", (pp - 50) / 25,
                  f"Pulse pressure {pp:.0f} mmHg (normal for you {pp_base}).",
                  {"baseline": pp_base, "delta": round(pp - pp_base, 1), "pct": round(100 * (pp - pp_base) / pp_base, 1)}),
        component("arterial_stiffness", "Arterial stiffness", -ptt_b["pct"], "% faster pulse", (-ptt_b["pct"] - 3) / 15,
                  f"Pulse reaches the fingertip {-ptt_b['pct']:.0f}% faster than preflight: arteries {'stiffer' if ptt_b['pct'] < -3 else 'as flexible as usual'}.",
                  ptt_b),
        component("hr_recovery", "Heart-rate recovery", hrr, "bpm in 1 min",
                  (B["hr_recovery_bpm"] - hrr - 4) / (B["hr_recovery_bpm"] - C.HRR_ABNORMAL_BPM - 4),
                  f"Heart rate drops {hrr:.0f} bpm in the first minute after a workout"
                  + (" (abnormal, 12 or less)." if hrr <= C.HRR_ABNORMAL_BPM else f" (your normal {B['hr_recovery_bpm']})."),
                  vs_baseline("hr_recovery_bpm", hrr)),
        component("rhythm", "Heart rhythm", 1.0 if irregular else 0.0, "irregular", 0.7 if irregular else 0.0,
                  "ECG shows an irregular rhythm (likely atrial fibrillation)." if irregular else "Regular rhythm on the ECG."),
        component("cardiac_output", "Cardiac output", co, "L/min",
                  max((-sv_b["pct"] - 5) / 20, (0.8 * co_base - co) / (0.5 * co_base)),
                  f"Heart pumps {sv:.0f} mL a beat ({sv_b['pct']:+.0f}% from preflight), {co:.1f} L a minute.",
                  {"baseline": round(co_base, 2), "delta": round(co - co_base, 2), "stroke_volume": sv_b}),
    ]
    weighted = sum(WEIGHTS[p["id"]] * p["severity"] for p in parts)
    worst_critical = max(p["severity"] for p in parts if p["id"] in CRITICAL)
    severity = clamp(max(weighted, 0.85 * worst_critical))
    ins = inputs(reader, METRICS)
    conf, reasons = confidence(ins)

    worst = max(parts, key=lambda p: p["severity"])
    note = worst["says"] if worst["severity"] >= 0.2 else "Heart and blood vessels are in your usual range."
    return {
        "system": "heart", "severity": round(severity, 3), "value": round(hr), "note": note,
        "derived": parts, "inputs": ins, "confidence": conf, "confidence_reasons": reasons,
        "chain": chain(reader), "weights": WEIGHTS,
    }


def chain(reader):
    """Cause -> effect, worked out from the model: what each body-state knob is doing to the heart
    right now (the difference between the real state and the same state with that knob at zero)."""
    out = []
    for knob, say in DRIVERS.items():
        v = reader.mods.get(knob, 0)
        if v <= 0.05:
            continue
        zero = {**reader.mods, knob: 0}
        effects = []
        for metric, label, unit in (("heart_rate", "resting heart rate", "bpm"), ("hrv", "HRV", "ms"),
                                    ("hr_recovery_bpm", "heart-rate recovery", "bpm"), ("pulse_transit_ms", "pulse transit", "ms"),
                                    ("stroke_volume_ml", "stroke volume", "mL")):
            d = reader.model(metric) - reader.model(metric, mods=zero)
            if abs(d) >= 0.5:
                effects.append(f"{label} {d:+.0f} {unit}")
        if effects:
            out.append({"cause": say(v), "effects": effects})
    months = reader.model("stroke_volume_ml", mods={**reader.mods, "missed_exercise_days": 0}) - C.BASELINE["stroke_volume_ml"]
    if months <= -0.5:
        out.append({"cause": "time in microgravity", "effects": [f"stroke volume {months:+.0f} mL (less blood volume)"]})
    return out
