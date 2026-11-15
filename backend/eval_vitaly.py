"""Compare OpenRouter models on real Vitaly questions. Run: python eval_vitaly.py [model ...]
Uses OPENROUTER_API_KEY from .env. Every call is counted against the spend cap (OPENROUTER_BUDGET_USD, default $1).

Each case is a body state, a question, words a good answer contains (any one of `any`, all of `all`) and words it must
not contain. The injury cases check the failure that started this: asked about a torn ACL, a model answered with the
crew member's heart rate. These go to the model directly (the guides would catch most of them first in the app)."""
import asyncio
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()
from app import director  # noqa: E402
from app.devices.simulated import DEVICES  # noqa: E402
from app.engine.physiology import mission_state  # noqa: E402
from app.sources import googlehealth as gh  # noqa: E402
from app.state import sim  # noqa: E402
from app.vitaly import brain, spend, watchdog  # noqa: E402

MODELS = sys.argv[1:] or ["mistralai/mistral-nemo", "openai/gpt-4o-mini", "google/gemini-3.1-flash-lite", "qwen/qwen3.8-flash",
                          "mistralai/mistral-small-2603"]
FIRST_AID = ["stop", "still", "rest", "ice", "cold", "support", "elevat", "immobil", "splint", "wrap", "brace", "pressure", "strap", "anchor"]
NOT_VITALS = ["bpm", "heart rate", "pulse", "oxygen"]
CASES = [  # (name, setup, question, all, any, must_not)
    ("heart, irregular", "irregular_rhythm", "What's going on with my heart?", ["irregular"], [], []),
    ("torn ACL", None, "I think I tore my ACL.", [], FIRST_AID, NOT_VITALS),
    ("knee gave out", None, "My knee gave out on the treadmill.", [], FIRST_AID, NOT_VITALS),
    ("teammate head hit", None, "My teammate hit his head on the hatch.", [], ["still", "awake", "conscious", "watch", "cold", "ice", "rest", "dizz", "vomit"], NOT_VITALS),
    ("air safe", "cabin_leak", "Is the air safe to breathe?", ["pressure"], [], []),
    ("radiation", None, "How much radiation have I had?", ["339"], [], []),
    ("nausea", None, "Is it normal to feel queasy after a week in space?", [], ["normal", "common", "adapt", "fluid", "motion", "space"], NOT_VITALS),
    ("real watch HR", "real_watch", "Is my resting heart rate a problem?", [], ["99", "62"], ["41", "58"]),
    ("healthy to land", None, "Am I healthy enough to land?", ["bone"], [], []),
    ("off topic", None, "What should I eat before a workout?", [], [], NOT_VITALS),
]


def setup(kind):
    sim.reset()
    gh._s.update(latest={}, resting=None, hr_seen={})
    if kind == "real_watch":   # a real wearer at 99 bpm whose own resting rate is 62 (not the simulated 58)
        import time as _t
        gh._s["latest"]["heart_rate"] = {"value": 99.0, "ts": _t.time() - 60, "kind": "sample", "fetched": _t.time()}
        gh._s["resting"] = {"value": 62.0, "ts": _t.time() - 3600}
    elif kind:
        director.trigger(sim, kind)
    sim.fresh_readings(DEVICES)
    watchdog.tick(sim)


def prepare():
    out = []
    for name, kind, q, all_, any_, bad in CASES:
        setup(kind)
        state = mission_state(sim)
        prompt = (f"DATA:\n{brain.snapshot(state, sim, None)}\n\nCrew member says: \"{q}\"\n\n"
                  "Reply with JSON only: {\"say\": \"at most two short sentences\", \"action\": null}.")
        out.append((name, q, prompt, all_, any_, bad))
    setup(None)
    gh._s.update(latest={}, resting=None)
    return out


async def run(model, cases):
    rows, score, cost, secs = [], 0, 0.0, 0.0
    for name, q, prompt, all_, any_, bad in cases:
        t = time.time()
        res = await brain.complete([{"role": "system", "content": brain.PERSONA}, {"role": "user", "content": prompt}], 110, model=model)
        dt = time.time() - t
        text = ""
        if res:
            parsed = brain.parse_json(res["text"])
            text = brain.first_sentences(brain.clean(parsed["say"] if parsed and parsed.get("say") else res["text"]), 2)
            cost += res.get("cost") or 0
        low = text.lower()
        ok = bool(text) and all(w.lower() in low for w in all_) and (not any_ or any(w.lower() in low for w in any_)) and not any(w.lower() in low for w in bad)
        score += ok
        secs += dt
        rows.append((ok, dt, name, text))
    return model, score, cost, secs, rows


async def main():
    cases = prepare()
    print(f"spend so far ${spend.spent():.4f} of ${spend.budget():.2f}\n")
    results = await asyncio.gather(*[run(m, cases) for m in MODELS])
    for model, score, cost, secs, rows in results:
        print(f"=== {model}: {score}/{len(cases)} right, avg {secs / len(cases):.1f}s, ${cost:.5f} for {len(cases)} answers (${cost / len(cases) * 1000:.2f} per 1000)")
        for ok, dt, name, text in rows:
            print(f"  {'OK ' if ok else '-- '} {dt:4.1f}s {name:18s} {text}")
    print(f"\nspend now ${spend.spent():.4f} of ${spend.budget():.2f}")


asyncio.run(main())
