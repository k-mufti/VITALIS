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
import time

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import Response, StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import director, history, hrp, officer, provenance, trends, triage  # noqa: E402
from . import constants as C  # noqa: E402
from . import missions as M  # noqa: E402
from .analysis import heart as heart_analysis  # noqa: E402
from .analysis import radiation as radiation_analysis  # noqa: E402
from .analysis import training as training_analysis  # noqa: E402
from .analysis.common import Reader  # noqa: E402
from .devices import catalog, native  # noqa: E402
from .vitaly import brain, crew, ears, guides, profile, protocols, voice, watchdog  # noqa: E402
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
        sim.measure_now = False
        if watchdog.tick(sim):
            prewarm_new_alerts()
            if clients:
                await broadcast({"type": "incidents", "incidents": watchdog.active(sim)})
        if clients:
            for v in vitals:
                if v["quality"] == "good":  # flagged readings are counted, not shown
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
    # Voice every checklist line and common phrase in advance (from disk after the first run).
    voice.prewarm(*voice.COMMON, *protocols.all_lines(profile.profile(crew.PATIENT_ID)["name"]), *guides.all_lines())
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
    devices = []
    for d in DEVICES:
        metrics = [k for k, v in catalog.METRICS.items() if v["device"] == d.name]
        devices.append({"name": d.name, "label": d.label, "simulated": True,
                        "kind": catalog.DEVICES[d.name]["kind"], "real": catalog.DEVICES[d.name]["real"],
                        "metrics": [{"metric": k, **catalog.METRICS[k]} for k in metrics]})
    return {"latest": sim.latest, "devices": devices,
            "not_measurable_in_flight": {k: v["how"] for k, v in catalog.ORGAN_MEASUREMENT.items()
                                         if v["method"] == catalog.ESTIMATED}}


@app.get("/api/vitals/raw")
def get_vitals_raw():
    """Latest readings in each device's own record format (HealthKit sample, Dexcom EGV)."""
    return {"simulated": True, "devices": native.records(sim)}


@app.get("/api/trends")
def get_trends(days: int = 7):
    """Last few mission days of every reading, for the trend lines (simulated, see trends.py)."""
    return trends.week(sim, max(2, min(days, 30)))


@app.post("/api/countermeasure")
async def post_countermeasure(body: CountermeasureIn):
    for cm in COUNTERMEASURES.get(body.organ, []):
        if cm["id"] == body.id:
            before = mission_state(sim)["organs"][body.organ]
            apply_change(sim.mods, sim.relief, cm)
            sim.events.insert(0, f"countermeasure:{body.id}")
            sim.fresh_readings(DEVICES)
            state = mission_state(sim)
            triage.update(sim, state)
            watchdog.tick(sim)
            await broadcast({"type": "state", "state": state})
            await push_incidents()
            return {"ok": True, "before": before, "after": state["organs"][body.organ]}
    raise HTTPException(status_code=404, detail="unknown organ or countermeasure id")


@app.get("/api/history")
def get_history():
    """Medical history for the crew member: milestones, events, countermeasures, escalations."""
    return history.build(sim)


@app.get("/api/triage")
def get_triage():
    return triage.view(sim)


@app.post("/api/director/event")
async def post_director_event(body: EventIn):
    result = director.trigger(sim, body.type)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["error"])
    # Unscheduled check on every device, then push the new state and alerts right away.
    sim.fresh_readings(DEVICES)
    state = mission_state(sim)
    triage.update(sim, state)
    watchdog.tick(sim)
    await broadcast({"type": "state", "state": state})
    await push_incidents()
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


@app.get("/api/radiation/curve")
def get_radiation_curve(mission: str | None = None):
    """Cumulative dose over the whole mission, for the dose graph."""
    check_mission(mission)
    return radiation_analysis.curve(mission or sim.mission, sim.day, sim.mods["extra_dose"])


# ---------- analysis pipelines (backend only; see DATA.md) ----------

def _reader():
    return Reader(sim, sim.mods, sim.relief, sim.mission, sim.day, live=True)


def _analysis(system):
    if system == "heart":
        return heart_analysis.analyze(_reader())
    if system == "muscles":
        return training_analysis.analyze(_reader())
    if system == "radiation":
        return radiation_analysis.analyze(_reader(), noaa.latest(), sim.storm)
    raise HTTPException(status_code=404, detail="unknown system, use heart, muscles or radiation")


@app.get("/api/analysis")
def get_analysis():
    """Every deep pipeline, layer by layer: inputs (with quality and age), derived measures against
    the personal baseline, confidence with reasons, cause chains, and the resulting severity."""
    return {s: _analysis(s) for s in ("heart", "muscles", "radiation")}


@app.get("/api/analysis/{system}")
def get_analysis_system(system: str):
    return _analysis(system)


# ---------- Vitaly: watchdog incidents, AI answers, voice actions ----------

class VitalyAsk(BaseModel):
    question: str
    focus: str | None = None


class VitalyAction(BaseModel):
    type: str
    incident_id: int | None = None
    organ: str | None = None
    id: str | None = None
    text: str | None = None


_prewarmed = set()


def prewarm_new_alerts():
    """Make sure a new alert's lines are voiced (they normally already are, from startup)."""
    for inc in sim.incidents:
        key = (inc["id"], inc["created"])
        if inc["state"] != "open" or key in _prewarmed:
            continue
        _prewarmed.add(key)
        voice.prewarm(inc["say"], *inc["guide"], background=False)


async def push_incidents():
    prewarm_new_alerts()
    await broadcast({"type": "incidents", "incidents": watchdog.active(sim)})


class VitalySpeak(BaseModel):
    text: str


@app.get("/api/vitaly/status")
def vitaly_status():
    return {**brain.status(), **voice.status(), **ears.status()}


@app.websocket("/api/vitaly/listen")
async def vitaly_listen(websocket: WebSocket):
    """Live speech-to-text: microphone audio in, words out (Deepgram, key stays here)."""
    await websocket.accept()
    await ears.relay(websocket)


@app.get("/api/vitaly/tts")
async def vitaly_tts_stream(text: str):
    """Vitaly's voice as streamed MP3 (Deepgram Aura): the browser's audio element plays it while it
    arrives, so speech starts in about 0.2 s. 503 means: use the browser voice instead."""
    got = voice.start(text)
    if got is None:
        raise HTTPException(status_code=503, detail="Deepgram voice not available; use the browser voice")
    if isinstance(got, bytes):
        return Response(content=got, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    if not await voice.first_chunk_ok(got):
        raise HTTPException(status_code=503, detail="Deepgram did not answer; use the browser voice")
    return StreamingResponse(got.follow(), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.post("/api/vitaly/tts")
async def vitaly_tts(body: VitalySpeak):
    """Whole MP3 in one response (for tools and tests). 503 means: use the browser voice instead."""
    audio = await voice.speak(body.text)
    if audio is None:
        raise HTTPException(status_code=503, detail="Deepgram voice not available; use the browser voice")
    return Response(content=audio, media_type="audio/mpeg")


@app.get("/api/vitaly/incidents")
def vitaly_incidents():
    return watchdog.active(sim)


@app.post("/api/vitaly/prewarm")
async def vitaly_prewarm():
    """Called when Vitaly is summoned: voice every everyday answer for the current data now, so
    the reply plays instantly by the time the question is finished."""
    texts = brain.quick.all_answers(mission_state(sim), sim)
    voice.prewarm(*texts, background=False)
    return {"lines": len(texts), "ready": sum(voice.cached(t) for t in texts)}


@app.post("/api/vitaly/ask")
async def vitaly_ask(body: VitalyAsk):
    return await brain.ask(body.question[:500], mission_state(sim), sim, body.focus)


@app.post("/api/vitaly/action")
async def vitaly_action(body: VitalyAction):
    """Runs an action the crew member confirmed by voice."""
    if body.type == "log_countermeasure":
        return await post_countermeasure(CountermeasureIn(organ=body.organ or "", id=body.id or ""))
    if body.type == "note_earth":
        text = (body.text or "").strip()[:500]
        if not text:
            raise HTTPException(status_code=400, detail="empty note")
        delay = M.environment(sim.mission, sim.day)["comms_delay_min"]
        note = {"text": text, "delay_min": round(delay, 1), "sent_at": time.time()}
        sim.events.insert(0, "note_earth")
        return {"ok": True, "note": note}
    raise HTTPException(status_code=400, detail=f"unknown action, use one of {list(brain.ACTIONS)}")


@app.get("/api/hrp")
def get_hrp():
    return hrp.framework()


@app.get("/api/provenance")
def get_provenance():
    """Where every number comes from: live APIs, published values, our assumptions."""
    return provenance.report()


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
