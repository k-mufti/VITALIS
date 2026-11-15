"""Offline checks for Vitaly: watchdog rules, escalation, voice commands, AI line safety.
No network needed. Run: python test_vitaly.py"""
from app import director
from app.devices.simulated import DEVICES
from app.engine.physiology import mission_state
from app.state import sim
from app.vitaly import brain, crew, profile, watchdog


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
assert af["severity"] == "emergency" and af["help"], af

# Emergencies call help at once: medical officer + nearest crew, Earth note with the comms delay
team = af["help"]["team"]
assert team[0]["role"] == "Medical officer" and len(team) == 2 and all(t["eta_s"] > 0 for t in team)
assert af["earth"]["arrives_at"] > af["earth"]["sent_at"]
assert any(t["role"] == "Commander" for t in fire("fire_smoke")["fire"]["help"]["team"])  # ship emergency

# Warnings wait 15 s for "I'm OK", then call help on their own
warn = fire("cabin_overpressure")["pressure_high"]
assert warn["escalate_at"] and not warn["help"]
watchdog.tick(sim, now=warn["escalate_at"] + 1)
assert warn["help"] and warn["help"]["reason"] == "no answer in 15 s"
warn = fire("cabin_overpressure")["pressure_high"]
watchdog.acknowledge(sim, warn["id"])
watchdog.tick(sim, now=warn["created"] + 30)
assert not warn["help"], "acknowledged warnings must not escalate"

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

# Voice commands are matched by rules, not the model
sim.reset()
state = mission_state(sim)
say, action = brain.command("I did sixty minutes on the treadmill, log it", state, sim)
assert action == {"type": "log_countermeasure", "organ": "heart", "id": "cardio_45"}, action
assert brain.command("Vitaly, call the medic", state, sim)[1]["type"] == "call_help"
assert brain.command("tell earth that I feel fine", state, sim)[1]["type"] == "note_earth"
assert brain.command("I'm fine", state, sim) is None  # nothing to cancel: just conversation
assert brain.command("how is my heart", state, sim) is None
assert brain.command("How long does a message take to reach Earth?", state, sim) is None
assert brain.command("Can you call the medic", state, sim)[1]["type"] == "call_help"

# Everyday questions are answered instantly from live data, no AI
from app.vitaly import quick  # noqa: E402
for q, word in (("How's my heart?", "Heart rate"), ("What's my oxygen?", "Blood oxygen"), ("How much radiation?", "millisieverts"),
                ("Is the cabin air okay?", "Cabin pressure"), ("What day is it?", "day 184"),
                ("How long does a message take to reach Earth?", "minutes")):
    a = quick.answer(q, state, sim)
    assert a and word in a, (q, a)
assert quick.answer("Tell me a fun fact about Mars", state, sim) is None

# AI lines that would mislead in an emergency are rejected
warn = fire("cabin_overpressure")["pressure_high"]
p = profile.profile(crew.PATIENT_ID)
assert not brain.line_is_safe("Help is coming.", warn, p)
assert brain.line_is_safe("Clear your ears and close any open valves.", warn, p)
af = fire("irregular_rhythm")["irregular_rhythm"]
assert not brain.line_is_safe("Dr. Chen will be here in 32 seconds.", af, p)
assert brain.line_is_safe("With your AF history, Dr. Chen is bringing your kit.", af, p)
assert "fibrillation" in brain.tailor_rules(af, p)
assert brain.first_sentences("Help is coming, Dr. Chen is 32 s away. Stay still. More.", 2).endswith("Stay still.")

sim.reset()
print("vitaly checks passed")
