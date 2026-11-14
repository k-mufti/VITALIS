"""NASA DONKI space weather: real solar energetic particle (SEP) events and solar flares.

Order of attempts: api.nasa.gov -> CCMC mirror (no key) -> local cache -> seed events.
Used by the director's "radiation_storm" event so the demo replays a REAL solar event.
"""
import datetime as dt
import os

import httpx

from . import cache

NASA = "https://api.nasa.gov/DONKI"
CCMC = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"

# Real SEP events from the DONKI catalog, used only if every fetch fails and there is no cache.
SEED_SEP = [
    {"sepID": "2025-02-25T00:42:00-SEP-001", "eventTime": "2025-02-25T00:42Z",
     "instruments": [{"displayName": "MODEL: REleASE:SOHO/EPHIN 28.2-50.1 MeV"}],
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/37525/2"},
    {"sepID": "2024-09-17T07:35:00-SEP-001", "eventTime": "2024-09-17T07:35Z",
     "instruments": [{"displayName": "GOES-P: SEISS >10 MeV"}],
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/33467/2"},
    {"sepID": "2024-01-29T05:11:00-SEP-001", "eventTime": "2024-01-29T05:11Z",
     "instruments": [{"displayName": "STEREO A: IMPACT 13-100 MeV"}],
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/28836/2"},
    {"sepID": "2023-03-14T11:55:00-SEP-001", "eventTime": "2023-03-14T11:55Z",
     "instruments": [{"displayName": "GOES-P: SEISS >10 MeV"}],
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/24233/2"},
]

status = {"sep": "not loaded", "flr": "not loaded"}
_data = {"sep": [], "flr": []}


async def _fetch(kind, start, end):
    key = os.getenv("NASA_API_KEY", "DEMO_KEY")
    attempts = [
        ("api.nasa.gov", f"{NASA}/{kind}", {"startDate": start, "endDate": end, "api_key": key}),
        ("ccmc", f"{CCMC}/{kind}", {"startDate": start, "endDate": end}),
    ]
    async with httpx.AsyncClient(timeout=8) as client:
        for name, url, params in attempts:
            try:
                r = await client.get(url, params=params)
                r.raise_for_status()
                data = r.json()
                if isinstance(data, list):
                    return name, data
            except Exception:
                continue
    return None, None


async def refresh():
    end = dt.date.today()
    start = end - dt.timedelta(days=3 * 365)
    for kind, key in (("SEP", "sep"), ("FLR", "flr")):
        source, data = await _fetch(kind, start.isoformat(), end.isoformat())
        if data is not None:
            _data[key] = data
            cache.save(f"donki_{key}", data)
            status[key] = f"live ({source}, {len(data)} events)"
            continue
        cached = cache.load(f"donki_{key}")
        if cached:
            _data[key] = cached
            status[key] = f"cache ({len(cached)} events)"
        elif key == "sep":
            _data[key] = SEED_SEP
            status[key] = f"seed ({len(SEED_SEP)} real events)"
        else:
            status[key] = "unavailable"


def sep_events():
    return sorted(_data["sep"], key=lambda e: e.get("eventTime", ""), reverse=True)


def flares():
    return sorted(_data["flr"], key=lambda e: e.get("peakTime") or e.get("beginTime") or "", reverse=True)


def pick_storm(index=0):
    """The event the director replays. Most recent first."""
    events = sep_events()
    if not events:
        events = SEED_SEP
    return events[index % len(events)]
