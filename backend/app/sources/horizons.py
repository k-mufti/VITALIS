"""JPL Horizons: real Earth-Mars one-way light time for every day of the mission.

https://ssd-api.jpl.nasa.gov/doc/horizons.html  (quantity 21 = one-way light time, minutes)
One request fetches the whole mission (one row per day). Falls back to the cache, then to a
simple circular-orbit model if the API is unreachable.
"""
import datetime as dt
import math

import httpx

from . import cache

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
status = {"horizons": "not loaded"}
errors = {"horizons": None}
_lt_by_date = {}


def _model_light_time_min(date):
    """Circular, coplanar orbits. Good to roughly +-10%. Fallback only."""
    days = (date - dt.date(2000, 1, 1)).days
    earth = math.radians(100.46 + 360 * days / 365.256)
    mars = math.radians(355.45 + 360 * days / 686.98)
    r1, r2 = 1.0, 1.524
    au = math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * math.cos(earth - mars))
    return au * 499.005 / 60


def parse(text):
    """Return {iso_date: light_time_min} from a Horizons ephemeris block."""
    out = {}
    if "$$SOE" not in text:
        return out
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    for line in body.strip().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            day = dt.datetime.strptime(parts[0], "%Y-%b-%d").date()
            out[day.isoformat()] = float(parts[-1])
        except ValueError:
            continue
    return out


async def refresh_range(start, stop):
    params = {
        "format": "json", "COMMAND": "'499'", "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
        "START_TIME": f"'{start.isoformat()}'", "STOP_TIME": f"'{stop.isoformat()}'",
        "STEP_SIZE": "'1 d'", "QUANTITIES": "'21'", "MAKE_EPHEM": "'YES'", "OBJ_DATA": "'NO'",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(URL, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        rows = parse(r.json().get("result", ""))
        if not rows:
            raise RuntimeError("no ephemeris rows in response")
        _lt_by_date.update(rows)
        cache.save("horizons_lt", _lt_by_date)
        errors["horizons"] = None
        status["horizons"] = f"live ({len(rows)} days, {start} to {stop})"
        return
    except Exception as e:
        errors["horizons"] = f"{type(e).__name__}: {e}"
    cached = cache.load("horizons_lt") or {}
    _lt_by_date.update(cached)
    if cached:
        status["horizons"] = f"cache ({len(cached)} days)"
    else:
        status["horizons"] = "model (circular orbits, Horizons unreachable)"


async def refresh(date):
    """Single-day refresh, kept for compatibility."""
    await refresh_range(date, date + dt.timedelta(days=1))


def earth_mars_light_time_min(date):
    key = date.isoformat()
    if key in _lt_by_date:
        return _lt_by_date[key]
    return _model_light_time_min(date)


def is_real(date):
    return date.isoformat() in _lt_by_date
