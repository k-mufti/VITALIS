"""Offline checks for Vitaly: watchdog rules, self-help guides, symptom matching, voice commands.
No network needed. Run: python test_vitaly.py"""
from app import director
from app.devices.simulated import DEVICES
from app.engine.physiology import mission_state
from app.state import sim
from app.vitaly import brain, ears, guides, net, profile, protocols, quick, voice, watchdog


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
    # other people, named in more ways: the word "teammate" was not understood and fell through to "you"
    ("my teammate has chest pain", "chest_pain", "other"),
    ("my team mate has a sharp pain in his chest", "chest_pain", "other"),
    ("I have a teammate with chest pain", "chest_pain", "other"),
    ("I think my teammate is having chest pain", "chest_pain", "other"),
    ("my buddy is bleeding from his arm", "bleeding", "other"),
    ("my brother can't breathe", "breathing", "other"),
    ("my friend is choking", "choking", "other"),
    ("my roommate fainted", "fainting", "other"),
    ("I have a sharp pain in my chest", "chest_pain", "self"),
    ("my chest hurts and my teammate is here", "chest_pain", "self"),
    # injuries from the injury drill's library: these used to fall through to the AI ("I think I tore my ACL" got a heart-rate answer)
    ("I think I tore my ACL", "sprain", "self"),
    ("my teammate tore his ACL", "sprain", "other"),
    ("I pulled my hamstring", "sprain", "self"),
    ("my ankle is swollen", "sprain", "self"),
    ("sprained ankle", "sprain", "self"),
    ("she has a nosebleed", "nosebleed", "other"),
    ("nosebleed", "nosebleed", "self"),
    ("he got an electric shock", "shock", "other"),
    ("my back is killing me", "back", "self"),
    ("I have a toothache", "tooth", "self"),
    ("his shoulder popped out", "dislocation", "other"),
    ("what do I do, I think I sprained my wrist", "sprain", "self"),
]
for text, gid, person in cases:
    g = guides.match(text)
    assert g and g["id"] == gid and g["who"] == person, (text, g and (g["id"], g["who"]))
    assert len(g["steps"]) >= 4 and g["say"]
assert guides.match("how is my heart") is None
for benign in ("tell me about the ligament in the knee", "what is an ACL", "what is the tallest mountain in the solar system",
               "how does a nosebleed happen", "explain a sprain", "what is wrong with my heart", "am I healthy enough to land", "why do I feel so tired", "I can't see my readings",
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

# The injury guides are spoken to a person, not read as a checklist: warm, complete sentences, nothing left over from the
# templates, and nothing that waits on a call to Earth
from app.vitaly import injuries  # noqa: E402
for gid in injuries.MATCH:
    g = guides.GUIDES[gid]
    for who in ("self", "other"):
        lines = [g["say"][who], *g["steps"][who]]
        assert len(g["steps"][who]) >= 6, (gid, who)
        for line in lines:
            assert "{" not in line and "|" not in line and "}" not in line, (gid, who, line)
            assert "call ground" not in line.lower() and "tell ground" not in line.lower(), (gid, who, line)
            assert line[0].isupper() and line[-1] in ".?!" and len(line) <= 420, (gid, who, line)
        assert "I'm" in g["say"][who] or "I'll" in g["say"][who], (gid, who)         # someone is there
    assert g["steps"]["self"] != g["steps"]["other"] or gid in ("tooth", "rash", "bruise", "crush", "nail", "back"), gid
sp_self, sp_other = guides.GUIDES["sprain"]["steps"]["self"], guides.GUIDES["sprain"]["steps"]["other"]
assert "stop using it" in sp_self[0] and "have them stop using it" in sp_other[0] and "pop" in " ".join(sp_self)

# Changing the patient part-way through a guide
me, them = {"id": "chest_pain", "who": "self"}, {"id": "chest_pain", "who": "other"}
for text in ("it's not for me, it's for my teammate", "no it's my teammate", "it's for someone else", "it's not me", "he is the one with the pain", "not for me"):
    assert guides.retarget(text, me) == "other", text
for text in ("actually it's me", "it's for me", "it's me"):
    assert guides.retarget(text, them) == "self", text
for text in ("next", "repeat that", "how long will this take", "how is my heart"):
    assert guides.retarget(text, me) is None and guides.retarget(text, them) is None, text
assert guides.retarget("it's my teammate", None) is None and guides.retarget("it's for me", {"id": "unresponsive", "who": "other"}) is None   # no self version
g = asyncio.run(brain.ask("no it's not for me, it's for my teammate", state, sim, current=me))["guide"]
assert g["who"] == "other" and g["say"].startswith("Got it, it's not you.") and g["steps"] == guides.GUIDES["chest_pain"]["steps"]["other"] and g["readings"] is None
g = asyncio.run(brain.ask("actually it's me", state, sim, current=them))["guide"]
assert g["who"] == "self" and g["say"].startswith("Got it, it's you.") and g["readings"]                # your own readings come back
assert asyncio.run(brain.ask("my teammate is not breathing", state, sim, current=me))["guide"]["id"] == "unresponsive"   # a new emergency wins
assert "guide" not in asyncio.run(brain.ask("how is my heart", state, sim, current=me))

# While a guide is running, words like "cold pack" or "pressure on it" must not trigger the cabin-air report
assert not brain.instant_allowed("what if the cold pack is not cold enough", me) and not brain.instant_allowed("should I press harder, the pressure hurts", me)
assert brain.instant_allowed("what if the cold pack is not cold enough", None)          # outside a guide it is the cabin question
assert brain.instant_allowed("how am I doing", me) and brain.instant_allowed("when will Earth answer", me) and brain.instant_allowed("how is my heart", me)

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
# Words that only sound like a topic must not trigger an instant answer
for q in ("What should I eat before a workout?", "how much water should I drink when I'm tired", "What is the tallest mountain in the solar system?", "Can we see Earth from here?", "How do astronauts brush their teeth?"):
    assert quick.answer(q, state, sim) is None, q
assert "millisieverts" in quick.answer("Is there a solar storm coming?", state, sim)
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

# Voice settings: Flux and Aura-2 use different endpoints; speed and expressivity are clamped; clips never mix voices
import os  # noqa: E402
os.environ.pop("DEEPGRAM_TTS_MODEL", None); os.environ.pop("DEEPGRAM_TTS_SPEED", None); os.environ.pop("DEEPGRAM_TTS_EXPRESSIVITY", None)
v = voice.settings()
assert v["model"].startswith("flux-") and voice.request_params(v) == (voice.FLUX_URL, {"model": v["model"], "encoding": "mp3"})
os.environ.update(DEEPGRAM_TTS_MODEL="flux-kit-en", DEEPGRAM_TTS_SPEED="1.07", DEEPGRAM_TTS_EXPRESSIVITY="5")
k = voice.settings(); url, params = voice.request_params(k)
assert url == voice.FLUX_URL and params["speed"] == 1.05 and params["expressivity"] == 2 and params["model"] == "flux-kit-en", params
os.environ.update(DEEPGRAM_TTS_MODEL="aura-2-draco-en", DEEPGRAM_TTS_SPEED="0.5", DEEPGRAM_TTS_EXPRESSIVITY="1")
a = voice.settings(); url, params = voice.request_params(a)
assert url == voice.URL and params["speed"] == 0.7 and "expressivity" not in params, params   # Aura-2 has no expressivity, speed min 0.7
assert len({voice._key(x, "Yes?") for x in (v, k, a)}) == 3
for name in ("DEEPGRAM_TTS_MODEL", "DEEPGRAM_TTS_SPEED", "DEEPGRAM_TTS_EXPRESSIVITY"):
    os.environ.pop(name, None)

# The opening line and step 1 are voiced as one clip, in advance
name = profile.profile("03")["name"]
lines = set(protocols.all_lines(name)) | set(guides.all_lines())
for p in protocols.PROTOCOLS.values():
    assert f"{p['say'].format(name=name)} {p['guide'][0]}" in lines
for g in guides.GUIDES.values():
    for who, steps in g["steps"].items():
        assert guides.opening(g["say"][who], steps[0]) in lines and len(guides.opening(g["say"][who], steps[0])) < voice.MAX_CHARS

# The greeting after "Hey Vitaly" is voiced in advance and is the same text in the browser
assert voice.GREETING in voice.COMMON and f"'{voice.GREETING}'" in open("../src/ui/vitaly.js").read()

# One shared, reused connection per event loop (no new TLS handshake per call)
async def _same():
    a = net.client()
    return a is net.client() and not a.is_closed
assert asyncio.run(_same()) and asyncio.run(_same())   # also fine across separate event loops

sim.reset()
print("vitaly checks passed")
