"""Engine checks: run with  python test_engine.py"""
from app import director
from app.engine.physiology import COUNTERMEASURES, apply_change, mission_state
from app.state import sim

sim.reset()
s = mission_state(sim, 184)
o = s["organs"]
# Day 184 matches the agreed demo numbers (and the old fixture)
assert o["bones"]["value"] == 95.9 and o["sleep"]["value"] == 6.2 and o["heart"]["value"] == 64 and o["eyes"]["value"] == 5.2, o
assert s["radiation_msv"] == 338.6 and s["phase"] == "cruise"
assert len(s["risk_ranking"]) == 7 and s["risk_ranking"][0] == "bones"
for organ in o.values():
    assert 0 <= organ["severity"] <= 1 and 0 <= organ["mission_risk"] <= 1
    assert organ["status"] in ("OK", "Watch", "Act") and organ["countermeasures"] and organ["what_could_go_wrong"]

# Time makes microgravity organs worse
later = mission_state(sim, 240)["organs"]
for k in ("bones", "eyes", "muscles"):
    assert later[k]["severity"] > o[k]["severity"], k

# Director events raise severity
before = mission_state(sim, 184)["organs"]["sleep"]["severity"]
director.trigger(sim, "bad_sleep_week")
assert mission_state(sim, 184)["organs"]["sleep"]["severity"] > before
director.trigger(sim, "radiation_storm")
storm = mission_state(sim, 184)
assert storm["storm"] and storm["radiation_msv"] == 338.6 + 35 and any(a["organ"] == "radiation" for a in sim.alerts)

# Countermeasures lower severity
for organ, cms in COUNTERMEASURES.items():
    sim.reset()
    before = mission_state(sim, 184)["organs"][organ]["severity"]
    apply_change(sim.mods, sim.relief, cms[0])
    after = mission_state(sim, 184)["organs"][organ]["severity"]
    assert after <= before, (organ, before, after)
sim.reset()
print("engine checks passed")
