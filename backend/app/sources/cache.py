"""Tiny JSON cache so the demo still works with no Wi-Fi."""
import json
import time
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "cache"


def save(name, data):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"saved_at": time.time(), "data": data}
    (CACHE_DIR / f"{name}.json").write_text(json.dumps(payload, indent=2))


def load(name):
    path = CACHE_DIR / f"{name}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())["data"]
