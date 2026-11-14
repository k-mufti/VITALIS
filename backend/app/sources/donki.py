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
# How far back to look. SEP events are rare, so look further back than for flares.
LOOKBACK_DAYS = {"SEP": 730, "FLR": 60}
# The new API rejects long date ranges (HTTP 400), so we ask in chunks. Largest chunk that works wins.
CHUNK_SIZES = [60, 30, 14, 7]

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


async def _get(client, kind, start, end):
    """One request. Returns (events or None, error or None)."""
    params = {"startDate": start.isoformat(), "endDate": end.isoformat()}
    try:
        r = await client.get(f"{BASE}/{kind}", params=params)
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"
    if r.status_code != 200:
        return None, f"HTTP {r.status_code} for {start}..{end}: {r.text[:150].strip()}"
    if "json" not in r.headers.get("content-type", ""):
        return None, f"not JSON ({r.headers.get('content-type')})"
    data = r.json()
    if not isinstance(data, list):
        return None, "unexpected JSON shape (not a list)"
    return data, None


async def _fetch(kind):
    """Walk back LOOKBACK_DAYS in chunks. Returns (events, error)."""
    today = dt.date.today()
    oldest = today - dt.timedelta(days=LOOKBACK_DAYS[kind])
    last_error = None
    async with httpx.AsyncClient(timeout=20) as client:
        for size in CHUNK_SIZES:
            events, end, ok = [], today, True
            while end > oldest:
                start = max(oldest, end - dt.timedelta(days=size))
                data, err = await _get(client, kind, start, end)
                if data is None:
                    last_error, ok = err, False
                    break
                events.extend(data)
                end = start - dt.timedelta(days=1)
            if ok:
                return events, None
    return None, last_error


async def refresh():
    for kind, key in (("SEP", "sep"), ("FLR", "flr")):
        data, err = await _fetch(kind)
        errors[key] = err
        if data is not None:
            _data[key] = data
            cache.save(f"donki_{key}", data)
            status[key] = f"live (ccmc DONKI-API, {len(data)} events in last {LOOKBACK_DAYS[kind]} days)"
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


def measured_sep_events():
    """SEP events seen by a real instrument, one per event time. DONKI also lists model
    forecasts (instrument names starting with 'MODEL:'), which we skip for the replay."""
    seen, out = set(), []
    for e in sep_events():
        instrument = (e.get("instruments") or [{}])[0].get("displayName", "")
        if instrument.startswith("MODEL") or e.get("eventTime") in seen:
            continue
        seen.add(e.get("eventTime"))
        out.append(e)
    return out


def pick_storm(index=0):
    """The event the director replays: real measured events, most recent first."""
    events = measured_sep_events()
    if not events:
        events = SEED_SEP
    return events[index % len(events)]
