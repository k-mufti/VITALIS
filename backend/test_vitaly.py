"""Offline checks for Vitaly: watchdog rules, self-help guides, symptom matching, voice commands.
No network needed. Run: python test_vitaly.py"""
from app import director
from app.devices.simulated import DEVICES
from app.engine.physiology import mission_state
from app.state import sim
from app.vitaly import brain, ears, guides, profile, protocols, quick, watchdog


def fire(event):
    sim.reset()
    sim.fresh_readings(DEVICES)
    watchdog.tick(sim)
    if event:
        director.trigger(sim, event)
        sim.fresh_readings(DEVICES)
    watchdog.tick(sim)
    return {i["kind"]: i for i in sim.incidents if i["state"] == "open"}


# Quiet baseline: no alerts
assert fire(None) == {}

# Every emergency is detected with the right severity, and the big one hides its side effects
expect = {
    "cardiac_arrest": ("cardiac_arrest", "emergency"), "slow_heart": ("slow_heart", "emergency"),
    "bp_crash": ("bp_crash", "emergency"), "cabin_leak": ("pressure_low", "emergency"),
    "fire_smoke": ("fire", "emergency"), "cabin_overpressure": ("pressure_high", "warning"),
    "o2_high": ("o2_high", "warning"), "cabin_hot": ("temp_high", "warning"),
    "cabin_co2": ("co2_high", "warning"), "noisy_module": ("noise_high", "warning"),
    "radiation_storm": ("radiation_storm", "emergency"),
}
for event, (kind, severity) in expect.items():
    found = fire(event)
    assert kind in found and found[kind]["severity"] == severity, (event, found.keys())
arrest = fire("cardiac_arrest")
assert set(arrest) == {"cardiac_arrest"}, arrest.keys()  # no extra low-BP / low-oxygen alerts

# The medical profile turns an irregular rhythm into an emergency for Crew 03
assert "irregular_rhythm" in profile.profile("03")["escalate"]
af = fire("irregular_rhythm")["irregular_rhythm"]
assert af["severity"] == "emergency"

# Standalone: every alert carries a guide the crew member can do themselves, and nothing is dispatched
for kind, p in protocols.PROTOCOLS.items():
    assert len(p["guide"]) >= 2 and p["say"], kind
    for line in [p["say"], *p["guide"]]:
        assert "{value}" not in line, f"{kind}: lines must be static so they can be voiced in advance"
        assert "on the way" not in line and "medical officer" not in line.lower(), f"{kind}: must not rely on help arriving"
assert af["guide"] == protocols.PROTOCOLS["irregular_rhythm"]["guide"] and "help" not in af

# Alerts resolve when the problem goes away
fire("cabin_leak")
director.trigger(sim, "reset")
sim.fresh_readings(DEVICES)
watchdog.tick(sim)
assert not [i for i in sim.incidents if i["state"] == "open"]

# Sharp spike: heart rate jumping 25+ bpm within a minute
sim.reset()
sim.hr_trace.extend([(100.0, 60.0), (110.0, 62.0)])
sim.record({"metric": "heart_rate", "value": 92.0, "quality": "good", "cadence": "continuous", "ts": 0})
assert "heart_spike" in watchdog.detect(sim, 120.0)

# Symptoms the crew member reports: matched by rules, for themselves or for someone else
cases = [
    ("I have a sharp pain in my chest", "chest_pain", "self"),
    ("someone else has a sharp pain in their chest", "chest_pain", "other"),
    ("my crewmate has chest pain", "chest_pain", "other"),
    ("my chest hurts", "chest_pain", "self"),
    ("Amir is not breathing", "unresponsive", "other"),
    ("I can't breathe", "breathing", "self"),
    ("she is choking", "choking", "other"),
    ("I cut my arm and it's bleeding", "bleeding", "self"),
    ("I feel dizzy", "fainting", "self"),
    ("he hit his head", "head_injury", "other"),
    ("my crewmate Amir is foaming at the mouth", "seizure", "other"),
    ("my crewmate is bleeding from a deep cut in the arm", "bleeding", "other"),
    ("her face is swelling and her throat is closing", "allergy", "other"),
    ("his face is drooping and his speech is slurred", "stroke", "other"),
    ("she swallowed some coolant", "poisoning", "other"),
    ("I think I broke my wrist", "fracture", "self"),
    ("he got something in his eye", "eye", "other"),
    ("she keeps throwing up", "vomiting", "other"),
    ("I'm having a panic attack", "panic", "self"),
    ("something is wrong with Kenji", "assess", "other"),
]
for text, gid, person in cases:
    g = guides.match(text)
    assert g and g["id"] == gid and g["who"] == person, (text, g and (g["id"], g["who"]))
    assert len(g["steps"]) >= 4 and g["say"]
assert guides.match("how is my heart") is None
for benign in ("what is wrong with my heart", "am I healthy enough to land", "why do I feel so tired", "I can't see my readings",
               "is the cabin air okay", "how much radiation have I had", "what should I do", "is anything wrong",
               "I did sixty minutes on the treadmill, log it", "tell earth that I feel fine", "next", "repeat that"):
    assert guides.match(benign) is None, (benign, guides.match(benign)["id"])
assert guides.match("I don't have any pain") is None

# ask(): a symptom returns the whole guide at once (the browser then steps through it with no server calls)
sim.reset()
state = mission_state(sim)
import asyncio  # noqa: E402
r = asyncio.run(brain.ask("sharp pain in my chest", state, sim))
assert r["engine"] == "guide" and r["guide"]["id"] == "chest_pain" and "heart rate" in r["guide"]["readings"]
r = asyncio.run(brain.ask("someone else has a sharp pain in their chest", state, sim))
assert r["guide"]["who"] == "other" and r["guide"]["readings"] is None  # can't see someone else's body

# Voice commands are matched by rules, not the model
say, action = brain.command("I did sixty minutes on the treadmill, log it", state, sim)
assert action == {"type": "log_countermeasure", "organ": "heart", "id": "cardio_45"}, action
assert brain.command("tell earth that I feel fine", state, sim)[1]["type"] == "note_earth"
assert brain.command("how is my heart", state, sim) is None
assert brain.command("How long does a message take to reach Earth?", state, sim) is None

# Everyday questions are answered instantly from live data, no AI
for q, word in (("How's my heart?", "Heart rate"), ("What's my oxygen?", "Blood oxygen"), ("How much radiation?", "millisieverts"),
                ("Is the cabin air okay?", "Cabin pressure"), ("What day is it?", "day 184"),
                ("How long does a message take to reach Earth?", "minutes")):
    a = quick.answer(q, state, sim)
    assert a and word in a, (q, a)
assert quick.answer("Tell me a fun fact about Mars", state, sim) is None
assert brain.first_sentences("Stay calm, Dr. Chen wrote the plan. Stay still. More.", 2).endswith("Stay still.")

# Ears: Deepgram's messages are cut down to what the browser needs; the key is never in the URL
import json  # noqa: E402
res = lambda text, final, stop: json.dumps({"type": "Results", "is_final": final, "speech_final": stop, "channel": {"alternatives": [{"transcript": text}]}})
assert ears.slim(res("hey Vitaly", False, False)) == {"type": "words", "text": "hey Vitaly", "final": False, "stopped": False}
assert ears.slim(res("", True, True)) == {"type": "words", "text": "", "final": True, "stopped": True}
assert ears.slim(res("", False, False)) is None
assert ears.slim(json.dumps({"type": "UtteranceEnd", "channel": [0, 1]})) == {"type": "stopped"}
assert ears.slim(json.dumps({"type": "SpeechStarted", "channel": [0, 1]})) is None and ears.slim("not json") is None
assert "keyterm=Vitaly" in ears.url("nova-3") and "keyterm" not in ears.url("nova-2") and "token" not in ears.url("nova-3").lower()

sim.reset()
print("vitaly checks passed")
