"""Quick offline checks for step 2 parsers and physics. Run: python test_step2.py"""
from app import missions as M
from app.sources import horizons, noaa

# Horizons parser on a sample ephemeris block (quantity 21 = one-way light time, minutes)
sample = "header\n$$SOE\n 2026-Nov-14 00:00     16.123456\n 2026-Nov-15 00:00     16.2\n$$EOE\nfooter"
assert abs(horizons._parse(sample) - 16.123456) < 1e-6

# NOAA parser picks the latest >=10 MeV reading
rows = [
    {"time_tag": "2026-11-14T10:00:00Z", "satellite": 18, "flux": 0.3, "energy": ">=10 MeV"},
    {"time_tag": "2026-11-14T10:05:00Z", "satellite": 18, "flux": 12.5, "energy": ">=10 MeV"},
    {"time_tag": "2026-11-14T10:05:00Z", "satellite": 18, "flux": 900, "energy": ">=1 MeV"},
]
r = noaa.parse(rows)
assert r["flux_pfu"] == 12.5 and r["proton_event_now"] is True

# Physics: Mars day 184 = 184 x 1.84 mSv in cruise
env = M.environment("mars", 184)
assert env["phase"] == "cruise" and env["gravity_g"] == 0.0 and env["radiation_msv"] == 338.6
# Day 300 = 240 cruise days + 60 surface days
env = M.environment("mars", 300)
assert env["phase"] == "surface" and env["radiation_msv"] == round(240 * 1.84 + 60 * 0.64, 1)
lo, hi = 2, 26
assert lo < M.environment("mars", 240)["comms_delay_min"] < hi
print("step 2 checks passed")
