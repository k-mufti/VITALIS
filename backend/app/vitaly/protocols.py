"""What Vitaly says and walks you through when the watchdog detects a problem.

Standalone by design: nothing here waits on another person or on Earth. Each protocol is an
opening line plus a guide, a list of short spoken steps the crew member does themselves. Vitaly
reads one step, waits for "next", and goes on.

Steps follow standard first aid and ISS-style emergency practice in plain words. They are demo
procedures, not a medical manual.

No line contains a live number (only {name}), so every line is voiced once in advance and plays
with no delay; the live reading is shown on screen.
"""

PROTOCOLS = {
    # ---------- heart ----------
    "cardiac_arrest": {
        "title": "Cardiac arrest", "severity": "emergency",
        "say": "Cardiac arrest. {name} has no heartbeat. Whoever is closest, I'll talk you through it. Start now.",
        "guide": [
            "Strap them to the C P R restraint, flat on their back, and brace your feet against the wall.",
            "Put the heel of your hand on the center of the chest, other hand on top, and push hard and fast. Two pushes a second.",
            "Keep going. Don't stop for more than a few seconds. If someone else is there, send them for the defibrillator.",
            "When the defibrillator arrives, switch it on and stick the pads on the bare chest, exactly as the pictures show.",
            "Let it check the rhythm. If it says shock, make sure nobody is touching them, then press the button.",
            "Go straight back to pushing on the chest. Keep going until they breathe or move on their own.",
        ],
    },
    "slow_heart": {
        "title": "Heart rate too slow", "severity": "emergency",
        "say": "Your heart rate has dropped very low. Let's deal with it together.",
        "guide": [
            "Stop what you're doing and strap yourself in so you can't drift if you get faint.",
            "Tell me if you feel dizzy, confused, or have chest pain. If you do, say chest pain.",
            "Cough hard, three times. It can nudge the heart rate back up.",
            "Stay strapped in and breathe normally. I'm watching your heart and I'll tell you when it recovers.",
        ],
    },
    "irregular_rhythm": {
        "title": "Irregular heart rhythm", "severity": "warning",
        "say": "Your heart rhythm has gone irregular. This can settle on its own. Let's work through it.",
        "guide": [
            "Stop what you're doing and strap yourself in.",
            "Breathe in slowly for four seconds, and out for six. Keep that going.",
            "Now try this: take a breath, hold it, and bear down like you're straining, for fifteen seconds. Then relax.",
            "If your flight surgeon gave you a rhythm tablet for episodes like this, take it now with water.",
            "Stay resting. I'm watching your rhythm and I'll tell you the moment it's regular again.",
        ],
    },
    "fast_heart": {
        "title": "Heart rate too fast at rest", "severity": "warning",
        "say": "Your heart is racing while you're at rest. Let's slow it down.",
        "guide": [
            "Stop and strap yourself in.",
            "Breathe in slowly for four seconds, and out for six. Do that ten times.",
            "Sip some water. Dehydration makes the heart race.",
            "Stay resting. I'll tell you when your heart rate comes down.",
        ],
    },
    "heart_spike": {
        "title": "Sudden heart rate change", "severity": "warning",
        "say": "Your heart rate just changed sharply. Let's check you're alright.",
        "guide": [
            "Stop what you're doing and hold still for a moment.",
            "Any chest pain, dizziness, or trouble breathing? If so, tell me which.",
            "If you feel fine, rest for two minutes. I'm watching your heart rate settle.",
        ],
    },
    "bp_crash": {
        "title": "Blood pressure too low", "severity": "emergency",
        "say": "Your blood pressure has dropped. Let's bring it back up.",
        "guide": [
            "Strap yourself in flat, and raise your legs against the wall.",
            "Drink a full pouch of water or electrolyte drink, slowly.",
            "Check yourself for bleeding. If you find any, say bleeding.",
            "Stay flat with your legs up. I'm watching your pressure and I'll tell you when it recovers.",
        ],
    },
    "bp_high": {
        "title": "Blood pressure high", "severity": "warning",
        "say": "Your blood pressure is high. Let's bring it down.",
        "guide": [
            "Stop exercising and sit still.",
            "Breathe slowly: in for four seconds, out for six. Keep going for two minutes.",
            "Recheck with the cuff in five minutes.",
        ],
    },
    "low_oxygen_blood": {
        "title": "Blood oxygen low", "severity": "emergency",
        "say": "Your blood oxygen is low. We need to fix that now.",
        "guide": [
            "Put on an oxygen mask from the nearest emergency panel and open the valve.",
            "Sit upright and take slow, deep breaths.",
            "Look at the cabin air panel. If pressure or oxygen is low there, move to another module and close the hatch.",
            "Keep the mask on. I'm watching your oxygen and I'll tell you when it's back above ninety five.",
        ],
    },
    "heart_drift": {
        "title": "Resting heart rate drifting up", "severity": "warning",
        "say": "Your resting heart rate has been climbing above your normal. It's usually tiredness or stress.",
        "guide": [
            "Drink some water now.",
            "Keep today's exercise light.",
            "Protect tonight's sleep: lights down an hour early.",
        ],
    },
    # ---------- cabin ----------
    "pressure_low": {
        "title": "Cabin pressure low", "severity": "emergency",
        "say": "Cabin pressure is dropping. Do this now.",
        "guide": [
            "Put on your emergency mask.",
            "Move to the next module and close the hatch behind you.",
            "Watch the pressure on the panel there. If it holds steady, the leak is behind you.",
            "If it's still falling, move one more module along and close that hatch too.",
            "Stay masked until the pressure reads normal. I'm tracking it with you.",
        ],
    },
    "pressure_high": {
        "title": "Cabin pressure high", "severity": "warning",
        "say": "Cabin pressure is too high. Let's bring it down.",
        "guide": [
            "Close any gas valve you have open.",
            "Clear your ears: pinch your nose and blow gently.",
            "Open the pressure relief valve on the environment panel, a quarter turn.",
            "Close it when the panel reads normal. I'll tell you when.",
        ],
    },
    "o2_low": {
        "title": "Cabin oxygen low", "severity": "warning",
        "say": "Cabin oxygen is low. Let's raise it.",
        "guide": [
            "If you feel short of breath, put on a mask first.",
            "On the environment panel, turn the oxygen feed up one step.",
            "Check that the vents in this module aren't blocked.",
            "I'm watching the oxygen level and I'll tell you when it's back in range.",
        ],
    },
    "o2_high": {
        "title": "Cabin oxygen too high", "severity": "warning",
        "say": "Cabin oxygen is too high. That's a fire risk, so let's be careful.",
        "guide": [
            "Stop any electrical or heating work right now. No sparks.",
            "On the environment panel, turn the oxygen feed down one step.",
            "Leave equipment off until I tell you the level is back to normal.",
        ],
    },
    "co2_high": {
        "title": "Cabin CO2 high", "severity": "warning",
        "say": "Carbon dioxide is building up in here. Let's clear it.",
        "guide": [
            "Move to a module with better airflow.",
            "Check the scrubber: is its fan running, and is the cartridge light green?",
            "If the cartridge light is red, swap in a fresh cartridge.",
            "Tell me if you get a headache. I'm watching the level come down.",
        ],
    },
    "fire": {
        "title": "Smoke detected", "severity": "emergency",
        "say": "Smoke detected. Do this now.",
        "guide": [
            "Put on your mask.",
            "Hit the power and fan cutoff for this module. Fire needs moving air.",
            "Take the extinguisher, find where the smoke is coming from, and spray into the source.",
            "If you can't put it out in thirty seconds, leave the module and close the hatch.",
            "Keep your mask on until the air reads clean. I'm watching it.",
        ],
    },
    "temp_high": {
        "title": "Cabin too hot", "severity": "warning",
        "say": "The cabin is getting too hot. Let's cool things down.",
        "guide": [
            "Drink some water.",
            "Move to a cooler module if there is one.",
            "Check the cooling loop on the environment panel: is the pump light green?",
            "If the pump light is off, switch to the backup pump.",
        ],
    },
    "temp_low": {
        "title": "Cabin too cold", "severity": "warning",
        "say": "The cabin is getting cold. Let's warm things up.",
        "guide": [
            "Put on warm layers.",
            "Check the heater breaker on the environment panel and reset it if it has tripped.",
            "I'll tell you when the temperature is back in range.",
        ],
    },
    "noise_high": {
        "title": "Noise high", "severity": "warning",
        "say": "It's loud enough in here to hurt your hearing over time.",
        "guide": [
            "Put in your earplugs.",
            "Listen for the fan or pump that's making the noise and note which one. It needs servicing.",
        ],
    },
    "radiation_storm": {
        "title": "Solar storm", "severity": "emergency",
        "say": "Solar storm. Radiation is rising. Do this now.",
        "guide": [
            "Take your dosimeter and go to the storm shelter.",
            "Close the shelter hatch and pack the water bags around you.",
            "Stay inside. I'm tracking your dose and I'll tell you when it's safe to come out.",
        ],
    },
}


def spoken(kind, name):
    return PROTOCOLS[kind]["say"].format(name=name)


def all_lines(name):
    """Every line Vitaly can say for an alert, for voicing in advance."""
    out = []
    for p in PROTOCOLS.values():
        out.append(p["say"].format(name=name))
        out.extend(p["guide"])
    return out
