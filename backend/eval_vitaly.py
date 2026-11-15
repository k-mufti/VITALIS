"""Compare cheap OpenRouter models on real Vitaly questions. Run: python eval_vitaly.py [model ...]
Uses OPENROUTER_API_KEY from .env. Each answer costs a fraction of a cent."""
import asyncio
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()
from app import director  # noqa: E402
from app.devices.simulated import DEVICES  # noqa: E402
from app.engine.physiology import mission_state  # noqa: E402
from app.state import sim  # noqa: E402
from app.vitaly import brain, watchdog  # noqa: E402

MODELS = sys.argv[1:] or ["meta-llama/llama-3.1-8b-instruct", "mistralai/mistral-nemo", "qwen/qwen3.7-flash"]
CASES = [  # (event, question, words a good answer contains)
    ("irregular_rhythm", "What's going on with my heart?", ["irregular", "rhythm"]),
    ("irregular_rhythm", "How long until help gets here?", ["32", "20"]),
    ("cabin_leak", "Is the air safe to breathe?", ["pressure"]),
    (None, "How much radiation have I had?", ["339"]),
    (None, "Am I healthy enough to land?", ["bone"]),
    ("bad_sleep_week", "Why do I feel so tired?", ["sleep"]),
]


async def run(model):
    os.environ["OPENROUTER_MODEL"] = model
    os.environ["OPENROUTER_FALLBACK_MODEL"] = model
    score, total_t = 0, 0.0
    print(f"\n=== {model}")
    for event, q, words in CASES:
        sim.reset()
        if event:
            director.trigger(sim, event)
        sim.fresh_readings(DEVICES)
        watchdog.tick(sim)
        t = time.time()
        out = await brain.ask(q, mission_state(sim), sim)
        dt = time.time() - t
        total_t += dt
        ok = all(w.lower() in out["say"].lower() for w in words)
        score += ok
        print(f"  {'OK ' if ok else '-- '} {dt:4.1f}s  {q}\n        {out['say']}  [{out['engine']}]")
    print(f"  score {score}/{len(CASES)}, avg {total_t / len(CASES):.1f}s")


async def main():
    for m in MODELS:
        await run(m)
    sim.reset()

asyncio.run(main())
