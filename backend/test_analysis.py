"""Offline checks for the analysis pipelines (heart, training load, radiation). Run: python test_analysis.py"""
from app import constants as C
from app import director
from app.analysis import heart, radiation, training
from app.analysis.common import Reader
from app.devices.simulated import DEVICES
from app.engine import signals
from app.engine.physiology import COUNTERMEASURES, apply_change, mission_state
from app.state import sim


def reader(live=False):
    return Reader(sim, sim.mods, sim.relief, sim.mission, sim.day, live)


# ---------- training load maths ----------
# Banister TRIMP: no load without effort, more for harder sessions of the same length
assert signals.trimp(60, 58, 58) == 0
assert signals.trimp(60, 150, 58) > signals.trimp(60, 120, 58) > 0

# Steady training sits in the sweet spot; skipping a week drops the acute:chronic ratio below it
sim.reset()
sim.mods["missed_exercise_days"] = 0
steady = training.analyze(reader())
assert C.ACWR_LOW <= steady["acwr"] <= C.ACWR_HIGH and steady["status"] == "optimal", steady["acwr"]
sim.reset()
director.trigger(sim, "skipped_exercise")
skipped = training.analyze(reader())
assert skipped["acwr"] < C.ACWR_LOW and skipped["status"] == "undertrained", skipped["acwr"]
assert len(skipped["log"]) == 28 and skipped["log"][-1]["missed"]

# Bad sleep lowers recovery
sim.reset()
rested = training.recovery_score(C.BASELINE["hrv"], C.BASELINE["heart_rate"], C.BASELINE["sleep_hours"])
assert rested == 100
director.trigger(sim, "bad_sleep_week")
assert training.analyze(reader())["recovery"] < 50

# ---------- heart ----------
sim.reset()
h = heart.analyze(reader())
ids = {p["id"] for p in h["derived"]}
assert ids == {"resting_hr", "hrv", "blood_pressure", "pulse_pressure", "arterial_stiffness", "hr_recovery", "cardiac_output"}
assert abs(sum(heart.WEIGHTS.values()) - 1) < 1e-9
assert h["value"] == 64 and h["chain"], h
# A blood pressure spike raises the score and shows up as stiffer arteries (shorter pulse transit)
director.trigger(sim, "bp_spike")
h2 = heart.analyze(reader())
stiff = {p["id"]: p for p in h2["derived"]}["arterial_stiffness"]
assert h2["severity"] > h["severity"] and stiff["value"] > 10, (h2["severity"], stiff)
# Heart-rate recovery under the clinical cutoff is flagged act
sim.reset()
sim.mods.update({"missed_exercise_days": 14, "sleep_debt": 4, "stress": 2})
hrr = {p["id"]: p for p in heart.analyze(reader())["derived"]}["hr_recovery"]
assert hrr["value"] <= C.HRR_ABNORMAL_BPM + 6 and hrr["status"] in ("watch", "act"), hrr

# ---------- radiation ----------
sim.reset()
r = radiation.analyze(reader())
assert r["curve"]["crosses_limit_day"] and {p["id"] for p in r["derived"]} >= {"dose_so_far", "budget", "storm_dose"}
budget = {p["id"]: p for p in r["derived"]}["budget"]
assert budget["over_budget_pct"] > 0  # Mars adds more than the career limit allows
director.trigger(sim, "radiation_storm")
rs = radiation.analyze(reader(), storm=sim.storm)
assert rs["shelter"]["reduction_pct"] == round(100 * (1 - C.SHELTER_FACTOR))
assert rs["dose_msv"] == r["dose_msv"] + C.STORM_DOSE_SHELTERED_MSV

# ---------- data quality and confidence ----------
sim.reset()
sim.fresh_readings(DEVICES)
live = heart.analyze(reader(live=True))
assert live["confidence"] > 0.9 and all(i["source"] == "reading" for i in live["inputs"]), live["confidence"]
model_only = heart.analyze(reader(live=False))
assert model_only["confidence"] == 0.5
# Flagged readings are counted but never used
sim.record({"metric": "heart_rate", "value": 250.0, "quality": "noisy", "cadence": "continuous", "ts": 0})
assert sim.recent("heart_rate") < 100 and sim.good_share("heart_rate") < 1

# ---------- cabin CO2 is the ship, not the lungs ----------
sim.reset()
director.trigger(sim, "cabin_co2")
lungs = mission_state(sim)["organs"]["lungs"]
assert "cabin CO2" in lungs["note"] and any("CO2" in d for d in lungs["drivers"]), lungs
apply_change(sim.mods, sim.relief, COUNTERMEASURES["lungs"][0])
assert sim.mods["co2_offset"] == 0

sim.reset()
print("analysis checks passed")
