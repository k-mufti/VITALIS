"""JPL Horizons: real Earth-Mars one-way light time for a date.

https://ssd-api.jpl.nasa.gov/doc/horizons.html  (quantity 21 = one-way light time, minutes)
Falls back to a simple circular-orbit model if the API is unreachable.
"""
import datetime as dt
import math

import httpx

from . import cache

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
status = {"horizons": "not loaded"}
_lt_by_date = {}


def _model_light_time_min(date):
    """Circular, coplanar orbits. Good to roughly +-10%. Fallback only."""
    days = (date - dt.date(2000, 1, 1)).days
    earth = math.radians(100.46 + 360 * days / 365.256)
    mars = math.radians(355.45 + 360 * days / 686.98)
    r1, r2 = 1.0, 1.524
    au = math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * math.cos(earth - mars))
    return au * 499.005 / 60


def _parse(text):
    if "$$SOE" not in text:
        return None
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    for line in body.strip().splitlines():
        parts = line.split()
        try:
            return float(parts[-1])
        except (ValueError, IndexError):
            continue
    return None


async def refresh(date):
    key = date.isoformat()
    params = {
        "format": "json", "COMMAND": "'499'", "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
        "START_TIME": f"'{key}'", "STOP_TIME": f"'{(date + dt.timedelta(days=1)).isoformat()}'",
        "STEP_SIZE": "'1 d'", "QUANTITIES": "'21'", "MAKE_EPHEM": "'YES'", "OBJ_DATA": "'NO'",
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(URL, params=params)
            r.raise_for_status()
            minutes = _parse(r.json().get("result", ""))
        if minutes:
            _lt_by_date[key] = minutes
            cache.save("horizons_lt", _lt_by_date)
            status["horizons"] = f"live ({minutes:.1f} min on {key})"
            return
    except Exception:
        pass
    cached = cache.load("horizons_lt") or {}
    if key in cached:
        _lt_by_date[key] = cached[key]
        status["horizons"] = f"cache ({cached[key]:.1f} min on {key})"
    else:
        status["horizons"] = "model (circular orbits, Horizons unreachable)"


def earth_mars_light_time_min(date):
    key = date.isoformat()
    if key in _lt_by_date:
        return _lt_by_date[key]
    return _model_light_time_min(date)
