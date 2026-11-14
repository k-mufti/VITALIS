"""NOAA SWPC: live GOES proton flux (no key). Tells us if a solar proton event is happening right now.
https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json
"""
import httpx

from .. import constants as C
from . import cache

URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json"
status = {"noaa_protons": "not loaded"}
_latest = {"value": None}


def parse(rows):
    """Latest >=10 MeV reading from the SWPC integral proton list."""
    readings = [r for r in rows if str(r.get("energy", "")).replace(" ", "") == ">=10MeV" and r.get("flux") is not None]
    if not readings:
        return None
    last = max(readings, key=lambda r: r.get("time_tag", ""))
    flux = float(last["flux"])
    return {
        "time_tag": last.get("time_tag"), "satellite": last.get("satellite"), "energy": ">=10 MeV",
        "flux_pfu": round(flux, 3), "threshold_pfu": C.PROTON_EVENT_THRESHOLD_PFU,
        "proton_event_now": flux >= C.PROTON_EVENT_THRESHOLD_PFU,
    }


async def refresh():
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(URL)
            r.raise_for_status()
            reading = parse(r.json())
        if reading:
            _latest["value"] = reading
            cache.save("noaa_protons", reading)
            status["noaa_protons"] = f"live ({reading['flux_pfu']} pfu at {reading['time_tag']})"
            return
    except Exception:
        pass
    cached = cache.load("noaa_protons")
    if cached:
        _latest["value"] = cached
        status["noaa_protons"] = f"cache ({cached['time_tag']})"
    else:
        status["noaa_protons"] = "unavailable"


def latest():
    return _latest["value"]
