"""Space environment numbers. Every number has a source or is marked ASSUMPTION.
(Physiology numbers get added in the engine step.)"""

DAYS_PER_MONTH = 30.44

# Curiosity RAD measurements (Zeitlin et al. 2013, Hassler et al. 2014):
# 1.84 mSv/day in cruise to Mars, 0.64 mSv/day on the Mars surface.
# https://www.space.com/23875-mars-radiation-life-manned-mission.html
DOSE_MARS_CRUISE_MSV_PER_DAY = 1.84
DOSE_MARS_SURFACE_MSV_PER_DAY = 0.64

# NASA-STD-3001 Vol 1: career limit 600 mSv, 250 mSv per solar particle event.
# https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf
CAREER_LIMIT_MSV = 600
SPE_EVENT_LIMIT_MSV = 250

# Surface gravity as a fraction of Earth's (standard planetary values).
GRAVITY_MARS = 0.38
GRAVITY_MOON = 0.166

# Earth-Mars one-way light time is roughly 4 to 24 minutes depending on orbits (ESA).
MARS_LIGHT_TIME_MIN_RANGE = (4, 24)
EARTH_MOON_LIGHT_TIME_S = 1.28

# NOAA SWPC: a solar proton event starts at 10 protons/cm2-s-sr at >=10 MeV (GOES).
# https://www.swpc.noaa.gov/products/goes-proton-flux
PROTON_EVENT_THRESHOLD_PFU = 10

# ---------- physiology (engine) ----------

# NASA HRP, Risk of Spaceflight-Induced Bone Changes:
# weight-bearing bones lose 1% to 1.5% of density per month on 4-6 month missions.
# https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/
BONE_LOSS_PCT_PER_MONTH = 1.25  # midpoint of 1.0-1.5

# ASSUMPTION: share of bone/muscle loss prevented by the normal in-flight exercise routine.
# NASA says exercise reduces the deficits; the exact share is not a single published number.
EXERCISE_PROTECTION = 0.5

# ASSUMPTION: optic nerve sheath diameter (ultrasound) model for SANS.
# Starts at a normal 4.6 mm and widens with time in microgravity as fluid shifts toward the head.
ONSD_BASELINE_MM = 4.6
ONSD_GROWTH_MM_PER_MONTH = 0.1
ONSD_WATCH_MM = 4.8

# ASSUMPTION: dose added by one director "radiation storm" while the crew shelters.
STORM_DOSE_SHELTERED_MSV = 35

# Crew 03 personal baselines (demo, made up).
BASELINE = {
    "heart_rate": 58,
    "sleep_hours": 7.4,
    "reaction_ms": 250,
    "spo2": 98,
    "resp_rate": 15,
    "glucose": 95,
    "bp_sys": 118,
    "bp_dia": 76,
    "mood_1to5": 4,
}
