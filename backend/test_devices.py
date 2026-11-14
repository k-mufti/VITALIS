"""Offline checks for in-flight data sources and the Mars trip home. Run: python test_devices.py"""
from app import missions as M
from app.devices import catalog
from app.devices.simulated import DEVICES
from app.engine.physiology import mission_state
from app.state import Sim

# Mars: 240 days out, 300 on the surface, 200 home at the cruise dose rate
m = M.get("mars")
assert M.phase(m, 100) == "cruise" and M.phase(m, 300) == "surface" and M.phase(m, 600) == "return"
assert M.cumulative_dose(m, 740) == round(440 * 1.84 + 300 * 0.64, 6) or abs(M.cumulative_dose(m, 740) - (440 * 1.84 + 300 * 0.64)) < 1e-6
assert M.environment("mars", 600)["dose_rate_msv_per_day"] == 1.84
# Moon and ISS have no separate trip home
assert M.departure_day(M.get("iss")) == M.get("iss")["end_day"]

# Every simulated device reads only metrics in the catalog, and nothing claims to measure bone density
sim = Sim()
seen = set()
for d in DEVICES:
    for v in d.read(sim):
        assert v["metric"] in catalog.METRICS, v["metric"]
        assert v["method"] in (catalog.MEASURED, catalog.SELF_REPORT)
        seen.add(v["metric"])
assert "bone_density_pct" not in seen
assert seen == set(catalog.METRICS), set(catalog.METRICS) - seen

# Scheduled metrics do not repeat on the next tick; continuous ones do
sim.measure_now = False
for d in DEVICES:  # pretend 1.5 s have passed
    d._last = {k: t - 1.5 for k, t in d._last.items()}
again = {v["metric"] for d in DEVICES for v in d.read(sim)}
assert "heart_rate" in again and "onsd_mm" not in again and "bp_sys" not in again, again

# Organs say how they are measured; bones and muscles are estimates
s = mission_state(sim)
assert s["organs"]["bones"]["measurement"]["method"] == "estimated"
assert s["organs"]["muscles"]["measurement"]["method"] == "measured"  # ultrasound + machine loads
assert s["organs"]["eyes"]["measurement"]["method"] == "measured"
print("device checks passed")
