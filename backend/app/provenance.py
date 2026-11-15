"""Where every number in VITALIS comes from.

Three kinds, kept strictly apart:
  live       - fetched from a public API while the app runs. Anyone can re-run the URL.
  published  - a measured value from a NASA document or a peer-reviewed paper.
  assumption - our own modelling choice. Marked ASSUMPTION in the code. Not a NASA number.

This is the honest answer to "is your data real". /api/provenance serves it and the
Sources panel in the app shows it.
"""
import datetime as dt

from . import constants as C
from .sources import cache, donki, googlehealth, horizons, noaa


def _age(ts):
    if not ts:
        return None
    return round((dt.datetime.now().timestamp() - ts) / 60, 1)


def _kind(status):
    if status.startswith("live"):
        return "live"
    if status.startswith("cache"):
        return "cache"
    return "fallback"


def live_sources():
    """Each entry carries the exact URL to check by hand, so nothing has to be taken on trust."""
    lt_today = horizons.earth_mars_light_time_min(dt.date.today())
    sep = donki.measured_sep_events()
    flr = donki.flares()
    now = noaa.latest()

    out = [{
        "id": "horizons",
        "name": "JPL Horizons",
        "org": "NASA Jet Propulsion Laboratory",
        "what": "Earth-Mars distance, one row per mission day, turned into the comms delay",
        "status": horizons.status["horizons"],
        "kind": _kind(horizons.status["horizons"]),
        "error": horizons.errors["horizons"],
        "fetched_min_ago": _age(cache.saved_at("horizons_lt")),
        "sample": f"{lt_today:.2f} min one way on {dt.date.today()}",
        "docs": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
        "verify": ("https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='499'"
                   "&EPHEM_TYPE='OBSERVER'&CENTER='500@399'"
                   f"&START_TIME='{dt.date.today()}'&STOP_TIME='{dt.date.today() + dt.timedelta(days=1)}'"
                   "&STEP_SIZE='1%20d'&QUANTITIES='21'&MAKE_EPHEM='YES'&OBJ_DATA='NO'"),
    }, {
        "id": "donki_sep",
        "name": "NASA DONKI, solar particle events",
        "org": "NASA CCMC",
        "what": "The radiation storm the director replays is a real measured event",
        "status": donki.status["sep"],
        "kind": _kind(donki.status["sep"]),
        "error": donki.errors["sep"],
        "fetched_min_ago": _age(cache.saved_at("donki_sep")),
        "sample": f"{len(sep)} measured events; latest {sep[0]['eventTime'] if sep else 'none'}",
        "docs": "https://ccmc.gsfc.nasa.gov/news/major-updates/",
        "verify": f"{donki.BASE}/SEP?startDate={(dt.date.today() - dt.timedelta(days=60)).isoformat()}&endDate={dt.date.today().isoformat()}",
    }, {
        "id": "donki_flr",
        "name": "NASA DONKI, solar flares",
        "org": "NASA CCMC",
        "what": "Recent solar activity shown alongside the crew's radiation dose",
        "status": donki.status["flr"],
        "kind": _kind(donki.status["flr"]),
        "error": donki.errors["flr"],
        "fetched_min_ago": _age(cache.saved_at("donki_flr")),
        "sample": f"{len(flr)} flares; latest class {flr[0].get('classType') if flr else 'none'}",
        "docs": "https://ccmc.gsfc.nasa.gov/news/major-updates/",
        "verify": f"{donki.BASE}/FLR?startDate={(dt.date.today() - dt.timedelta(days=60)).isoformat()}&endDate={dt.date.today().isoformat()}",
    }, {
        "id": "noaa",
        "name": "NOAA SWPC, GOES proton flux",
        "org": "NOAA Space Weather Prediction Center",
        "what": "Whether a solar proton event is happening right now",
        "status": noaa.status["noaa_protons"],
        "kind": _kind(noaa.status["noaa_protons"]),
        "error": None,
        "fetched_min_ago": _age(cache.saved_at("noaa_protons")),
        "sample": f"{now['flux_pfu']} pfu at >=10 MeV ({'event' if now['proton_event_now'] else 'quiet'})" if now else "none",
        "docs": "https://www.swpc.noaa.gov/products/goes-proton-flux",
        "verify": noaa.URL,
    }]
    out.extend(_watch_row())
    return out


def _watch_row():
    """The real watch, only once Fitbit is set up. Honest about the delay: it is not a live stream."""
    if not googlehealth.configured():
        return []
    r = googlehealth.report()
    hr = r["metrics"].get("heart_rate")
    live = r["state"] == "live"
    if hr:
        sample = f"{round(hr['value'])} bpm, taken {round(hr['age_s'] / 60, 1)} min ago" + ("" if live else " (too old to use)")
    else:
        sample = "no reading yet" if r["connected"] else "not connected"
    kind = "live" if live else ("cache" if hr else "fallback")
    return [{
        "id": "googlehealth", "name": f"Google Health API, {r['device']}", "org": "Google (Fitbit)",
        "what": "Real heart rate, recovery, blood oxygen, breathing and sleep from a watch worn by a person. "
                "It reaches us through the phone app, so it is minutes old, not a live stream.",
        "status": kind, "kind": kind, "error": r["error"],
        "fetched_min_ago": round(r["last_ok_s_ago"] / 60, 1) if r["last_ok_s_ago"] is not None else None,
        "sample": sample,
        "docs": "https://developers.google.com/health",
        "verify": "https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list",
    }]


# Measured values from NASA documents and peer-reviewed papers. Not fetched: they do not change.
PUBLISHED = [
    {"value": f"{C.DOSE_MARS_CRUISE_MSV_PER_DAY} mSv/day", "what": "Radiation dose in transit to Mars",
     "source": "Zeitlin et al. 2013, Science — Curiosity RAD during cruise",
     "url": "https://www.swri.org/press-release/swri-led-team-calculates-radiation-exposure-associated-trip-mars"},
    {"value": f"{C.DOSE_MARS_SURFACE_MSV_PER_DAY} mSv/day", "what": "Radiation dose on the Mars surface",
     "source": "Hassler et al. 2014, Science — Curiosity RAD at Gale Crater",
     "url": "https://www.space.com/23875-mars-radiation-life-manned-mission.html"},
    {"value": f"{C.CAREER_LIMIT_MSV} mSv", "what": "Career radiation limit for an astronaut",
     "source": "NASA-STD-3001 Vol 1 [V1 4030]",
     "url": "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf"},
    {"value": f"{C.SPE_EVENT_LIMIT_MSV} mSv", "what": "Limit for one solar particle event",
     "source": "NASA-STD-3001 Vol 1 [V1 4031]",
     "url": "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf"},
    {"value": "1.0-1.5 %/month", "what": "Bone density lost in weight-bearing bones in microgravity",
     "source": "NASA HRP, Risk of Spaceflight-Induced Bone Changes",
     "url": "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/"},
    {"value": "17 risks, 5 hazards", "what": "Every organ is tagged with NASA's own risk names",
     "source": "NASA Human Research Program",
     "url": "https://www.nasa.gov/hrp/risks/"},
    {"value": "SANS", "what": "Eye and brain changes, NASA's leading spaceflight health risk",
     "source": "NASA HRP, Spaceflight Associated Neuro-ocular Syndrome",
     "url": "https://www.nasa.gov/hrp/risks/"},
    {"value": "Thigh Cuff, B-Complex", "what": "The eye countermeasures we offer are real studies in flight",
     "source": "NASA HRP, ongoing research on the ISS",
     "url": "https://www.nasa.gov/hrp/ongoing-hrp-research/"},
    {"value": f"{C.PROTON_EVENT_THRESHOLD_PFU} pfu at >=10 MeV", "what": "When a solar proton event starts",
     "source": "NOAA SWPC proton event threshold",
     "url": "https://www.swpc.noaa.gov/products/goes-proton-flux"},
    {"value": "120/80, 140/90, 180/120", "what": "Blood pressure bands in the self check-in",
     "source": "AHA/ACC 2017 high blood pressure guideline", "url": ""},
    {"value": "54, 70, 180, 200 mg/dL", "what": "Blood sugar bands in the self check-in",
     "source": "ADA Standards of Care; Battelino et al. 2019 time-in-range", "url": ""},
    {"value": "+~1 °C", "what": "Core temperature runs higher on long missions, so the fever line shifts",
     "source": "Stahn et al. 2017, Scientific Reports", "url": ""},
]

# Our own modelling choices. Every one is marked ASSUMPTION in the code.
ASSUMPTIONS = [
    {"value": f"{int(C.EXERCISE_PROTECTION * 100)}%", "what": "Share of bone and muscle loss prevented by the in-flight exercise routine",
     "why": "NASA says exercise reduces the deficit but publishes no single percentage."},
    {"value": "loss x (1 - g)", "what": "How partial gravity slows bone and muscle loss",
     "why": "NASA HRP states it is still unknown whether Moon or Mars gravity mitigates bone loss."},
    {"value": f"{C.ONSD_BASELINE_MM} mm + {C.ONSD_GROWTH_MM_PER_MONTH} mm/month", "what": "Optic nerve sheath width used to model SANS",
     "why": "SANS is tracked by imaging, not by one published growth rate. This is a stand-in so the risk can be shown changing."},
    {"value": f"{C.STORM_DOSE_SHELTERED_MSV} mSv", "what": "Dose added by one solar storm with the crew in shelter",
     "why": "Real dose depends on the event and the shielding. Chosen to be well under the 250 mSv per-event limit."},
    {"value": "0.6 / 1.0 / 0.5 mSv/day", "what": "Dose rates for the Moon and ISS presets",
     "why": "Only the Mars numbers are measured by Curiosity. Mars is the hero mission for this reason."},
    {"value": "severity weights", "what": "How each mission's hazards weigh on each organ",
     "why": "Our ranking model. The inputs are real; the weighting is ours."},
    {"value": "crew readings", "what": "Crew 03's vitals, routine, streak and ship time",
     "why": "Simulated. Real astronaut vitals are private medical data. The devices they flow through are a real interface."},
    {"value": "smartwatch", "what": "One consumer-class watch covers heart, oxygen, breathing, sleep, sound level and pulse timing",
     "why": "Watches like this exist and flew for research on short private missions; none is qualified for a Mars trip, "
            "and none reports pulse transit time today."},
    {"value": "7-day trend lines", "what": "The past week behind each reading in the health panel",
     "why": "The demo stores no past days, so the week is rebuilt from today's body state. Today's point is the live reading."},
]


def report():
    live = live_sources()
    return {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "live_now": sum(1 for s in live if s["kind"] == "live"),
            "from_cache": sum(1 for s in live if s["kind"] == "cache"),
            "fallback": sum(1 for s in live if s["kind"] == "fallback"),
            "published_values": len(PUBLISHED),
            "assumptions": len(ASSUMPTIONS),
        },
        "live": live, "published": PUBLISHED, "assumptions": ASSUMPTIONS,
    }
