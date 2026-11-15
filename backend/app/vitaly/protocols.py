"""Preloaded emergency checklists. Vitaly speaks `say` the instant a problem is detected; the AI
only adds one tailored line afterwards. Steps follow standard first aid and ISS-style emergency
practice in plain words; they are demo procedures, not a medical manual.

severity  "emergency" takes over and calls help at once; "warning" takes over, asks the crew
          member to answer, and calls help if there is no answer in 15 s.
help      "now" dispatch the help crew immediately; "if_no_answer" only if they don't respond.
ship      a ship emergency: the commander is called too.
`say` has no live numbers (only {name}), so every line is voiced once in advance and plays with
no delay; the live reading is shown on screen and spoken in the follow-up line.
"""

PROTOCOLS = {
    # ---------- asked for by voice ----------
    "help_requested": {
        "title": "Help requested", "severity": "warning", "help": "now", "ship": False,
        "say": "Calling the medical officer to you now.",
        "steps": ["Stay where you are", "Medical officer is on the way"],
    },
    # ---------- heart ----------
    "cardiac_arrest": {
        "title": "Cardiac arrest", "severity": "emergency", "help": "now", "ship": False,
        "say": "Cardiac arrest. {name} has no heartbeat. Medical officer is on the way. "
               "Nearest crew: start chest compressions now, hard and fast, center of the chest.",
        "steps": ["Strap the patient to the CPR restraint", "Chest compressions, 100 to 120 a minute",
                  "Bring the defibrillator and follow its voice prompts", "Medical officer takes over on arrival"],
    },
    "slow_heart": {
        "title": "Heart rate too slow", "severity": "emergency", "help": "now", "ship": False,
        "say": "Your heart rate has dropped very low. Strap in and stay still. Help is on the way.",
        "steps": ["Strap in, stay still", "Tell the medical officer if you feel faint or confused",
                  "Medical officer checks rhythm and blood pressure"],
    },
    "irregular_rhythm": {
        "title": "Irregular heart rhythm", "severity": "warning", "help": "if_no_answer", "ship": False,
        "say": "Your heart rhythm is irregular. Stop what you're doing, strap in, and breathe slowly.",
        "steps": ["Stop activity, strap in", "Slow breathing", "Medical officer reviews the ECG strip"],
    },
    "fast_heart": {
        "title": "Heart rate too fast at rest", "severity": "warning", "help": "if_no_answer", "ship": False,
        "say": "Your heart rate is too fast for resting. Stop, strap in, and breathe slowly. Say I'm OK if you're fine.",
        "steps": ["Stop activity", "Slow breathing for two minutes", "Recheck heart rate"],
    },
    "heart_spike": {
        "title": "Sudden heart rate change", "severity": "warning", "help": "if_no_answer", "ship": False,
        "say": "Your heart rate just changed sharply. Stop and rest. Say I'm OK if you're fine.",
        "steps": ["Stop activity", "Rest for two minutes", "Recheck heart rate"],
    },
    "bp_crash": {
        "title": "Blood pressure too low", "severity": "emergency", "help": "now", "ship": False,
        "say": "Your blood pressure has dropped. Strap in flat with your legs up against the wall. Drink fluids if you can. Help is on the way.",
        "steps": ["Strap in flat, legs raised", "Fluids if able", "Medical officer checks for bleeding or dehydration"],
    },
    "bp_high": {
        "title": "Blood pressure high", "severity": "warning", "help": "if_no_answer", "ship": False,
        "say": "Your blood pressure is high. Stop exercise, sit quietly, and recheck in five minutes.",
        "steps": ["Stop exercise", "Rest five minutes", "Recheck with the cuff"],
    },
    "low_oxygen_blood": {
        "title": "Blood oxygen low", "severity": "emergency", "help": "now", "ship": False,
        "say": "Your blood oxygen is low. Put on an oxygen mask now. Help is on the way.",
        "steps": ["Oxygen mask on", "Check the cabin air reading", "Medical officer assesses breathing"],
    },
    "heart_drift": {
        "title": "Resting heart rate drifting up", "severity": "warning", "help": None, "ship": False,
        "say": "Your resting heart rate is well above your normal. Rest and sleep are the fix today.",
        "steps": ["Protect tonight's sleep", "Lighter exercise today", "Recheck tomorrow morning"],
    },
    # ---------- cabin ----------
    "pressure_low": {
        "title": "Cabin pressure low", "severity": "emergency", "help": "now", "ship": True,
        "say": "Cabin pressure is dropping. Put on your emergency mask, move to the safe module and close the hatch. Crew is looking for the leak.",
        "steps": ["Emergency mask on", "Move to the safe module, close the hatch", "Crew isolates modules to find the leak"],
    },
    "pressure_high": {
        "title": "Cabin pressure high", "severity": "warning", "help": "if_no_answer", "ship": True,
        "say": "Cabin pressure is too high. Stop any gas flow you're working with and clear your ears.",
        "steps": ["Close any open gas valves", "Equalise your ears", "Crew vents to normal pressure"],
    },
    "o2_low": {
        "title": "Cabin oxygen low", "severity": "warning", "help": "if_no_answer", "ship": True,
        "say": "Cabin oxygen is low. Put on a mask if you feel short of breath. Oxygen supply is being raised.",
        "steps": ["Mask if short of breath", "Crew raises oxygen supply", "Watch your blood oxygen"],
    },
    "o2_high": {
        "title": "Cabin oxygen too high", "severity": "warning", "help": "if_no_answer", "ship": True,
        "say": "Cabin oxygen is too high. That's a fire risk. Stop any electrical work and keep sparks away.",
        "steps": ["Stop electrical and heating work", "No sparks or flames", "Crew reduces oxygen supply"],
    },
    "co2_high": {
        "title": "Cabin CO2 high", "severity": "warning", "help": None, "ship": True,
        "say": "Cabin CO2 is high. Move to a module with better airflow. The scrubber needs a check.",
        "steps": ["Move to better airflow", "Check the CO2 scrubber", "Watch for headache"],
    },
    "fire": {
        "title": "Smoke detected", "severity": "emergency", "help": "now", "ship": True,
        "say": "Smoke detected. Put on your mask now. Turn off the fans and move away from the smoke. Crew is on the way with an extinguisher.",
        "steps": ["Mask on", "Fans and power off in the module", "Move away; crew brings the extinguisher", "Close the hatch if the fire spreads"],
    },
    "temp_high": {
        "title": "Cabin too hot", "severity": "warning", "help": None, "ship": True,
        "say": "The cabin is too hot. Drink water and move to a cooler module. Crew is checking the cooling loop.",
        "steps": ["Drink water", "Move to a cooler module", "Crew checks the cooling loop"],
    },
    "temp_low": {
        "title": "Cabin too cold", "severity": "warning", "help": None, "ship": True,
        "say": "The cabin is too cold. Put on warm layers. Crew is checking the heaters.",
        "steps": ["Warm layers on", "Crew checks the heaters"],
    },
    "noise_high": {
        "title": "Noise high", "severity": "warning", "help": None, "ship": True,
        "say": "Noise is high. Put in earplugs. A fan or pump needs a look.",
        "steps": ["Earplugs in", "Find the noisy fan or pump"],
    },
    "radiation_storm": {
        "title": "Solar storm", "severity": "emergency", "help": None, "ship": True,
        "say": "Solar storm. Go to the storm shelter now and take your dosimeter. I'll track your dose.",
        "steps": ["Go to the storm shelter", "Take your dosimeter", "Stay until the all-clear"],
    },
}


def spoken(kind, value, name):
    return PROTOCOLS[kind]["say"].format(value=value, name=name)


def all_lines(name):
    """Every checklist line, for voicing in advance."""
    return [p["say"].format(value="", name=name) for p in PROTOCOLS.values()]
