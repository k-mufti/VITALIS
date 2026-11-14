"""VITALIS backend.

Step 1 (foundation): health, state, risks, organs. Organ data still comes from a fixed fixture.
Step 2 (space environment): mission physics + JPL Horizons, NASA DONKI, NOAA SWPC with cache fallback.
  The environment numbers in /api/state (date, phase, comms delay, radiation) are now computed.

Run from backend/:  uvicorn app.main:app --reload --port 8001
"""
import asyncio
import contextlib
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from . import missions as M  # noqa: E402
from .sources import donki, horizons, noaa  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "state_day184.json"
REFRESH_EVERY_S = 600  # NOAA flux updates every few minutes; 10 min is plenty for the demo


async def refresh_sources():
    m = M.get(M.current_mission())
    today = M.date_for_day(M.current_day())
    arrival = M.date_for_day(m["arrival_day"])
    await asyncio.gather(
        donki.refresh(), noaa.refresh(), horizons.refresh(today), horizons.refresh(arrival),
        return_exceptions=True,
    )


async def refresh_loop():
    while True:
        await refresh_sources()
        await asyncio.sleep(REFRESH_EVERY_S)


@contextlib.asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(refresh_loop())
    yield
    task.cancel()


app = FastAPI(title="VITALIS", lifespan=lifespan)

# Allow the frontend on any localhost port (python -m http.server 8000).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_state():
    """Organs from the fixture (until the engine step), environment computed live."""
    state = json.loads(FIXTURE.read_text())
    state.update(M.environment())
    state["storm"] = None
    return state


# ---------- step 1: foundation ----------

@app.get("/api/health")
def health():
    return {"ok": True, "step": 2}


@app.get("/api/state")
def get_state():
    return load_state()


@app.get("/api/risks")
def get_risks():
    state = load_state()
    return [state["organs"][k] for k in state["risk_ranking"]]


@app.get("/api/organs/{organ_id}")
def get_organ(organ_id: str):
    state = load_state()
    if organ_id not in state["organs"]:
        raise HTTPException(status_code=404, detail=f"unknown organ, use one of {list(state['organs'])}")
    return state["organs"][organ_id]


# ---------- step 2: space environment ----------

@app.get("/api/missions")
def get_missions():
    return {"current": M.current_mission(), "missions": M.MISSIONS}


@app.get("/api/environment")
def get_environment(mission: str | None = None, day: float | None = None):
    if mission and mission not in M.MISSIONS:
        raise HTTPException(status_code=404, detail=f"unknown mission, use one of {list(M.MISSIONS)}")
    return M.environment(mission, day)


@app.get("/api/comms")
def get_comms(day: float | None = None):
    env = M.environment(None, day)
    return {"one_way_min": env["comms_delay_min"], "round_trip_min": env["comms_round_trip_min"],
            "date": env["date"], "source": horizons.status["horizons"]}


@app.get("/api/space-weather")
def get_space_weather():
    return {
        "now": noaa.latest(),
        "recent_solar_particle_events": donki.sep_events()[:10],
        "recent_flares": donki.flares()[:10],
        "status": {**donki.status, **noaa.status},
    }


@app.get("/api/sources")
def get_sources():
    return {"donki": donki.status, "noaa": noaa.status, "horizons": horizons.status}


@app.post("/api/sources/refresh")
async def post_sources_refresh():
    await refresh_sources()
    return get_sources()
