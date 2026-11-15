"""Crew medical profiles (demo). A known condition tightens limits and changes instructions.

Crew 03 has a history of paroxysmal atrial fibrillation (episodes of irregular, often fast heart
rhythm that come and go). For them an irregular rhythm is an emergency, not a warning, and the
fast-heart-rate alarm triggers earlier. Fictional demo profile.
"""

PROFILES = {
    "03": {
        "name": "Daniel Reyes",
        "age": 42,
        "conditions": ["paroxysmal atrial fibrillation (history)"],
        "medical_kit": "AF kit in the Lab med locker",
        # Per-person limits that override the defaults in watchdog.LIMITS.
        "limits": {"hr_high": 120},
        # Alerts this condition makes more serious.
        "escalate": {"irregular_rhythm": "emergency"},
        "note_for_ai": "History of paroxysmal atrial fibrillation; an irregular rhythm may be an AF episode.",
    },
}


def profile(crew_id):
    return PROFILES.get(crew_id, {"name": f"Crew {crew_id}", "conditions": [], "limits": {}, "escalate": {}, "note_for_ai": ""})
