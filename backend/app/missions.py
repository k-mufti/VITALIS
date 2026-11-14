"""Mission presets and the space environment on any mission day:
phase, gravity, radiation dose rate, total dose, time in microgravity, Earth comms delay."""
import datetime as dt
import os

from . import constants as C
from .sources import horizons

# Mars is the hero mission and uses measured numbers. ASSUMPTION values are marked.
MISSIONS = {
    # ASSUMPTION: 240 days out, 300 days on the surface, 200 days home (departure on day 540).
    # The trip home is deep-space cruise again, so it uses the cruise gravity and dose rate.
    "mars": {
        "name": "Mars", "arrival_day": 240, "departure_day": 540, "end_day": 740,
        "cruise": {"gravity": 0.0, "dose": C.DOSE_MARS_CRUISE_MSV_PER_DAY},
        "surface": {"gravity": C.GRAVITY_MARS, "dose": C.DOSE_MARS_SURFACE_MSV_PER_DAY},
    },
    "moon": {
        "name": "Moon (Artemis)", "arrival_day": 4, "end_day": 34,
        "cruise": {"gravity": 0.0, "dose": 1.0},              # ASSUMPTION
        "surface": {"gravity": C.GRAVITY_MOON, "dose": 0.6},  # ASSUMPTION
    },
    "iss": {
        "name": "ISS", "arrival_day": 0, "end_day": 180,
        "cruise": {"gravity": 0.0, "dose": 0.5},              # ASSUMPTION
        "surface": {"gravity": 0.0, "dose": 0.5},             # ASSUMPTION (in orbit the whole time)
    },
}


def current_mission():
    return os.getenv("MISSION", "mars")


def current_day():
    return float(os.getenv("MISSION_DAY", "184"))


def launch_date():
    return dt.date.fromisoformat(os.getenv("MISSION_LAUNCH_DATE", "2026-05-14"))


def get(mission_id):
    return MISSIONS.get(mission_id, MISSIONS["mars"])


def departure_day(m):
    """Day the crew leaves the destination. Missions without a trip home leave on the last day."""
    return m.get("departure_day", m["end_day"])


def date_for_day(day):
    return launch_date() + dt.timedelta(days=int(day))


def phase(m, day):
    if day < m["arrival_day"]:
        return "cruise"
    if day < departure_day(m):
        return "surface"
    return "return"


def phase_values(m, p):
    """Gravity and dose rate for a phase. The trip home is cruise again."""
    if p == "return":
        return m["cruise"]
    return m[p]


def _integrate(m, day, fn):
    """Sum fn(phase values) per day from day 0 to `day` across cruise, surface and the trip home."""
    dep = departure_day(m)
    cruise_days = min(day, m["arrival_day"])
    surface_days = max(0.0, min(day, dep) - m["arrival_day"])
    return_days = max(0.0, day - dep)
    return (cruise_days + return_days) * fn(m["cruise"]) + surface_days * fn(m["surface"])


def microgravity_months(m, day):
    # ASSUMPTION: partial gravity slows bone/muscle loss in proportion to (1 - g).
    # NASA HRP notes it is unknown if Moon/Mars gravity mitigates bone loss.
    days = _integrate(m, day, lambda p: 1.0 - p["gravity"])
    return days / C.DAYS_PER_MONTH


def cumulative_dose(m, day):
    return _integrate(m, day, lambda p: p["dose"])


def comms_delay_min(mission_id, day):
    if mission_id == "moon":
        return C.EARTH_MOON_LIGHT_TIME_S / 60
    if mission_id == "iss":
        return 0.0
    m = get(mission_id)
    dep = departure_day(m)
    if day >= dep and m["end_day"] > dep:
        # Heading home: the gap to Earth shrinks from the Earth-Mars distance at departure.
        at_departure = horizons.earth_mars_light_time_min(date_for_day(dep))
        return at_departure * max(0.02, (m["end_day"] - day) / (m["end_day"] - dep))
    if day >= m["arrival_day"]:
        return horizons.earth_mars_light_time_min(date_for_day(day))
    # In transit: the ship flies from Earth to where Mars will be on arrival day, so approximate
    # its distance as (fraction of trip done) x (Earth-Mars distance on arrival day).
    at_arrival = horizons.earth_mars_light_time_min(date_for_day(m["arrival_day"]))
    return at_arrival * max(0.02, day / m["arrival_day"])


def environment(mission_id=None, day=None):
    mission_id = mission_id or current_mission()
    if day is None:
        day = current_day()
    m = get(mission_id)
    p = phase(m, day)
    dose = cumulative_dose(m, day)
    delay = comms_delay_min(mission_id, day)
    return {
        "mission": mission_id, "mission_name": m["name"], "day": int(day), "date": date_for_day(day).isoformat(),
        "phase": p, "arrival_day": m["arrival_day"], "end_day": m["end_day"],
        "gravity_g": phase_values(m, p)["gravity"], "dose_rate_msv_per_day": phase_values(m, p)["dose"],
        "departure_day": departure_day(m),
        "radiation_msv": round(dose, 1),
        "radiation_career_limit_msv": C.CAREER_LIMIT_MSV,
        "radiation_event_limit_msv": C.SPE_EVENT_LIMIT_MSV,
        "radiation_pct_of_career_limit": round(100 * dose / C.CAREER_LIMIT_MSV, 1),
        "microgravity_months": round(microgravity_months(m, day), 2),
        "comms_delay_min": round(delay, 2), "comms_round_trip_min": round(2 * delay, 2),
        "comms_source": comms_source(mission_id, day),
    }


def comms_source(mission_id, day):
    if mission_id != "mars":
        return "light time constant"
    m = get(mission_id)
    check_day = max(day, m["arrival_day"])
    if horizons.is_real(date_for_day(check_day)):
        return "JPL Horizons"
    return "orbit model (Horizons not loaded)"
