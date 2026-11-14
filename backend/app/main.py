"""VITALIS backend, step 1: the foundation.

Serves a fixed MissionState (Mars, day 184) that matches the contract in plan.md 5.3,
so the frontend can talk to a real server from the start. Later steps replace the
fixture with the simulator + engine without changing these routes.

Run from backend/:  uvicorn app.main:app --reload --port 8001
"""
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

FIXTURE = Path(__file__).parent / "fixtures" / "state_day184.json"

app = FastAPI(title="VITALIS")

# Allow the frontend on any localhost port (python -m http.server 8000).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_state():
    return json.loads(FIXTURE.read_text())


@app.get("/api/health")
def health():
    return {"ok": True, "step": 1}


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
