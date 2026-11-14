"""NASA DONKI space weather: real solar energetic particle (SEP) events and solar flares.

DONKI moved on 2026-09-30 to the CCMC DONKI-API (same parameters and JSON, no key needed).
The old api.nasa.gov/DONKI and kauai.ccmc hosts now redirect to an announcement page.
https://ccmc.gsfc.nasa.gov/news/major-updates/

Order of attempts: CCMC DONKI-API -> local cache -> seed events.
Used by the director's "radiation_storm" event so the demo replays a REAL solar event.
"""
import datetime as dt

import httpx

from . import cache

BASE = "https://ccmc.gsfc.nasa.gov/DONKI-API/get"
# Keep the request windows small so the API answers fast and does not rate limit us.
WINDOW_DAYS = {"SEP": 730, "FLR": 60}

# Real SEP events from the DONKI catalog, used only if every fetch fails and there is no cache.
SEED_SEP = [
    {"sepID": "2025-02-25T00:42:00-SEP-001", "eventTime": "2025-02-25T00:42Z",
     "instruments": [{"displayName": "MODEL: REleASE:SOHO/EPHIN 28.2-50.1 MeV"}],
     "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/37525/2"},
    {"sepID": "2024-09-17T07:35:00-SEP-001", "eventTime": "2024-09-17T07:35Z",
     "instruments": [{"displayName": "GOES-P: SEISS >10 MeV"}],
     "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/33467/2"},
    {"sepID": "2024-01-29T05:11:00-SEP-001", "eventTime": "2024-01-29T05:11Z",
     "instruments": [{"displayName": "STEREO A: IMPACT 13-100 MeV"}],
     "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/28836/2"},
    {"sepID": "2023-03-14T11:55:00-SEP-001", "eventTime": "2023-03-14T11:55Z",
     "instruments": [{"displayName": "GOES-P: SEISS >10 MeV"}],
     "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/24233/2"},
]

status = {"sep": "not loaded", "flr": "not loaded"}
errors = {"sep": None, "flr": None}
_data = {"sep": [], "flr": []}


async def _fetch(kind):
    """Returns (events, error). events is a list on success, None on failure."""
    end = dt.date.today()
    start = end - dt.timedelta(days=WINDOW_DAYS[kind])
    params = {"startDate": start.isoformat(), "endDate": end.isoformat()}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BASE}/{kind}", params=params)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code} from {BASE}/{kind}"
        if "json" not in r.headers.get("content-type", ""):
            return None, f"not JSON ({r.headers.get('content-type')}) from {BASE}/{kind}"
        data = r.json()
        if not isinstance(data, list):
            return None, "unexpected JSON shape (not a list)"
        return data, None
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


async def refresh():
    for kind, key in (("SEP", "sep"), ("FLR", "flr")):
        data, err = await _fetch(kind)
        errors[key] = err
        if data is not None:
            _data[key] = data
            cache.save(f"donki_{key}", data)
            status[key] = f"live (ccmc DONKI-API, {len(data)} events in last {WINDOW_DAYS[kind]} days)"
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
