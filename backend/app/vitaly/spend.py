"""A hard cap on what Vitaly's AI can cost.

OpenRouter reports the cost of every call (request "usage": {"include": true}); this adds them up in
data/ai_spend.json (git-ignored) so the total survives restarts, and complete() in brain.py refuses to call the model
once the budget is reached. Vitaly then answers from live data and rules, which still works, only less flexibly.

Settings (backend/.env): OPENROUTER_BUDGET_USD (default 1.00, the most the AI may cost in total while testing).
The counter starts at what was already spent when this was added ($0.01, from the OpenRouter log); the OpenRouter
dashboard stays the authority. Delete data/ai_spend.json to start the count again.
"""
import json
import os
import time
from pathlib import Path

FILE = Path(__file__).resolve().parents[2] / "data" / "ai_spend.json"
STARTED_AT_USD = 0.01
DEFAULT_BUDGET_USD = 1.00


def budget():
    try:
        return float(os.getenv("OPENROUTER_BUDGET_USD", DEFAULT_BUDGET_USD))
    except ValueError:
        return DEFAULT_BUDGET_USD


def load():
    try:
        return json.loads(FILE.read_text())
    except (OSError, ValueError):
        return {"spent_usd": STARTED_AT_USD, "calls": 0, "since": time.time()}


def spent():
    return load()["spent_usd"]


def left():
    return max(0.0, budget() - spent())


def exhausted():
    return spent() >= budget()


def add(cost):
    """Record one call's cost (dollars). Safe to call with None."""
    if not cost:
        return
    data = load()
    data["spent_usd"] = round(data["spent_usd"] + float(cost), 6)
    data["calls"] = data.get("calls", 0) + 1
    try:
        FILE.parent.mkdir(parents=True, exist_ok=True)
        FILE.write_text(json.dumps(data))
    except OSError:
        pass


def status():
    return {"ai_spent_usd": round(spent(), 4), "ai_budget_usd": budget(), "ai_budget_left_usd": round(left(), 4)}
