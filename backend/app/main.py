"""VITALIS backend. Everything the frontend uses (plan.md 5.5).

Data flow:
  NASA/JPL/NOAA sources -> missions.py (space environment by mission day)
  simulated devices     -> sim state (readings + body state)
  engine/physiology.py  -> MissionState: organs, severity, mission_risk ranking, HRP tags
  triage.py             -> alerts, Earth comms delay
  /ws                   -> pushes vitals every 1 s and state every 2 s to the frontend

Run from backend/:  uvicorn app.main:app --reload --port 8001
"""
import asyncio
import contextlib

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import director, history, hrp, officer, triage  # noqa: E402
from . import missions as M  # noqa: E402
from .devices.simulated import DEVICES  # noqa: E402
from .engine.physiology import COUNTERMEASURES, apply_change, mission_state  # noqa: E402
from .sources import donki, horizons, noaa  # noqa: E402
from .state import sim  # noqa: E402

REFRESH_EVERY_S = 600
clients = set()


# ---------- background work ----------

async def refresh_sources():
    m = M.get("mars")
    await asyncio.gather(
        donki.refresh(), noaa.refresh(), horizons.refresh_range(M.date_for_day(0), M.date_for_day(m["end_day"])),
        return_exceptions=True,
    )


async def refresh_loop():
    while True:
        await refresh_sources()
        await asyncio.sleep(REFRESH_EVERY_S)


async def broadcast(message):
    dead = []
    for ws in clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


async def sim_loop():
    """Every second: read all devices. Every 2 seconds: recompute state + triage, push to clients."""
    tick = 0
    while True:
        vitals = []
        for device in DEVICES:
            for v in device.read(sim):
                sim.record(v)
                vitals.append(v)
        if clients:
            for v in vitals:
                await broadcast({"type": "vital", **v})
        if tick % 2 == 0:
            state = mission_state(sim)
            triage.update(sim, state)
            if clients:
                await broadcast({"type": "state", "state": state})
        tick += 1
        await asyncio.sleep(1)


@contextlib.asynccontextmanager
async def lifespan(app):
    tasks = [asyncio.create_task(refresh_loop()), asyncio.create_task(sim_loop())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="VITALIS", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


class CountermeasureIn(BaseModel):
    organ: str
    id: str


class EventIn(BaseModel):
    type: str


class AskIn(BaseModel):
    question: str


class MissionIn(BaseModel):
    mission: str


def check_mission(mission):
    if mission and mission not in M.MISSIONS:
        raise HTTPException(status_code=404, detail=f"unknown mission, use one of {list(M.MISSIONS)}")


# ---------- crew health ----------

@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/state")
def get_state(day: float | None = None, mission: str | None = None):
    check_mission(mission)
    return mission_state(sim, day, mission)


@app.get("/api/risks")
def get_risks(mission: str | None = None):
    check_mission(mission)
    state = mission_state(sim, None, mission)
    return [state["organs"][k] for k in state["risk_ranking"]]


@app.get("/api/organs/{organ_id}")
def get_organ(organ_id: str):
    state = mission_state(sim)
    if organ_id not in state["organs"]:
        raise HTTPException(status_code=404, detail=f"unknown organ, use one of {list(state['organs'])}")
    return state["organs"][organ_id]


@app.get("/api/vitals")
def get_vitals():
    return {"latest": sim.latest, "devices": [{"name": d.name, "label": d.label, "simulated": True} for d in DEVICES]}


@app.post("/api/countermeasure")
def post_countermeasure(body: CountermeasureIn):
    for cm in COUNTERMEASURES.get(body.organ, []):
        if cm["id"] == body.id:
            before = mission_state(sim)["organs"][body.organ]
            apply_change(sim.mods, sim.relief, cm)
            sim.events.insert(0, f"countermeasure:{body.id}")
            after = mission_state(sim)["organs"][body.organ]
            return {"ok": True, "before": before, "after": after}
    raise HTTPException(status_code=404, detail="unknown organ or countermeasure id")


@app.get("/api/history")
def get_history():
    """Medical history for the crew member: milestones, events, countermeasures, escalations."""
    return history.build(sim)


@app.get("/api/triage")
def get_triage():
    return triage.view(sim)


@app.post("/api/director/event")
def post_director_event(body: EventIn):
    result = director.trigger(sim, body.type)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/mission")
def post_mission(body: MissionIn):
    check_mission(body.mission)
    sim.mission = body.mission
    return {"ok": True, "mission": sim.mission}


@app.post("/api/ask")
def post_ask(body: AskIn):
    return officer.answer(body.question, mission_state(sim))


# ---------- space environment + NASA data ----------

@app.get("/api/missions")
def get_missions():
    return {"current": sim.mission, "missions": M.MISSIONS}


@app.get("/api/environment")
def get_environment(mission: str | None = None, day: float | None = None):
    check_mission(mission)
    return M.environment(mission or sim.mission, day)


@app.get("/api/comms")
def get_comms(day: float | None = None):
    env = M.environment(sim.mission, day)
    return {"one_way_min": env["comms_delay_min"], "round_trip_min": env["comms_round_trip_min"],
            "date": env["date"], "source": env["comms_source"]}


@app.get("/api/space-weather")
def get_space_weather():
    return {
        "now": noaa.latest(),
        "recent_solar_particle_events": donki.measured_sep_events()[:10],
        "recent_flares": donki.flares()[:10],
        "active_storm": sim.storm,
        "status": {**donki.status, **noaa.status},
    }


@app.get("/api/hrp")
def get_hrp():
    return hrp.framework()


@app.get("/api/sources")
def get_sources():
    return {"donki": donki.status, "donki_errors": donki.errors, "noaa": noaa.status,
            "horizons": horizons.status, "horizons_errors": horizons.errors}


@app.post("/api/sources/refresh")
async def post_sources_refresh():
    await refresh_sources()
    return get_sources()


# ---------- live updates ----------

@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    await websocket.send_json({"type": "state", "state": mission_state(sim)})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        clients.discard(websocket)
