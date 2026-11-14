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

# ---------- heart, training, cabin air, storm shelter ----------

# Crew 03 age (demo). Max heart rate from Tanaka et al. (2001): 208 - 0.7 x age.
CREW_AGE = 42
HR_MAX = 208 - 0.7 * CREW_AGE

# Heart-rate recovery: a drop of 12 bpm or less in the first minute after exercise is abnormal
# and predicts cardiac risk (Cole et al., NEJM 1999).
HRR_ABNORMAL_BPM = 12

# Acute:chronic workload ratio (7-day vs 28-day training load). Sweet spot 0.8-1.3; above 1.5
# injury risk climbs (Gabbett, BJSM 2016). Below 0.8 in space means detraining: muscle and bone loss.
ACWR_LOW, ACWR_HIGH, ACWR_DANGER = 0.8, 1.3, 1.5

# ASSUMPTION: daily exercise prescription (ISS crews exercise about 2 h a day including setup).
SESSION_MIN = 90
MISSED_SESSION_MIN = 15

# ASSUMPTION: cabin CO2. ISS runs around 2-4 mmHg; crews report headaches toward the top of that.
CO2_BASELINE_MMHG = 2.6
CO2_COMFORT_MMHG = 3.0
CO2_WATCH_MMHG = 4.0

# Cabin atmosphere, ISS-style sea-level air. ISS spec ranges (approx.): total pressure
# 97.9-102.7 kPa (14.2-14.9 psia), oxygen partial pressure 19.5-23.1 kPa.
CABIN_PRESSURE_KPA = 101.3
CABIN_PRESSURE_RANGE_KPA = (97.9, 102.7)
O2_FRACTION = 0.21
PPO2_RANGE_KPA = (19.5, 23.1)

# Noise. NIOSH recommended limit: 85 dBA averaged over 8 h, 3 dB exchange rate, so a full
# 24 h day of exposure should stay under 85 - 10*log10(24/8) = 80.2 dBA.
NIOSH_8H_DBA = 85
NOISE_24H_LIMIT_DBA = round(85 - 10 * __import__("math").log10(24 / 8), 1)
# ASSUMPTION: typical day-average noise in a crew module.
NOISE_BASELINE_DBA = 64
# Hearing test: a 10 dB average worsening at 2, 3 and 4 kHz is a "standard threshold shift" (OSHA).
HEARING_SHIFT_DB = 10

# ASSUMPTION: during a solar particle event the unshielded dose rate is ~50x background, and the
# storm shelter (water and supplies packed around the crew) cuts that to about a quarter.
STORM_RATE_X_BACKGROUND = 50
SHELTER_FACTOR = 0.25

# Crew 03 personal baselines (demo, made up). Preflight values the pipeline compares against.
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
    "hrv": 55,                 # ms, RMSSD
    "pulse_transit_ms": 240,   # ECG beat to fingertip pulse
    "stroke_volume_ml": 75,    # Doppler ultrasound
    "quad_thickness_mm": 50,   # thigh muscle, ultrasound
    "hr_recovery_bpm": 30,     # drop in the first minute after exercise
    "resistive_load_pct": 100,
    "co2_mmhg": CO2_BASELINE_MMHG,
    "cabin_pressure_kpa": CABIN_PRESSURE_KPA,
    "ppo2_kpa": round(CABIN_PRESSURE_KPA * O2_FRACTION, 1),
    "noise_dba": NOISE_BASELINE_DBA,
    "hearing_shift_db": 0,
    "motion_sickness_0to10": 0,
}
