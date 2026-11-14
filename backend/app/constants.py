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
