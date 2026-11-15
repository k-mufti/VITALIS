"""The crew on board (simulated) and how help reaches someone.

Five crew, each with a role and where they are right now. When Vitaly calls for help, it sends
the medical officer plus the nearest other crew member, and estimates how long they take to
float there: modules sit along the ship's spine, about 12 s apart (ASSUMPTION).
"""

# Modules from one end of the ship to the other.
MODULES = ["Command deck", "Lab", "Galley", "Crew cabin 3", "Habitat", "Storm shelter"]
SECONDS_PER_MODULE = 12
SETUP_SECONDS = 8  # grab the med kit, unstrap

CREW = [
    {"id": "01", "name": "Cmdr. Sofia Okafor", "role": "Commander", "location": "Command deck"},
    {"id": "02", "name": "Dr. Lena Chen", "role": "Medical officer", "location": "Lab"},
    {"id": "03", "name": "Daniel Reyes", "role": "Flight engineer", "location": "Crew cabin 3"},  # the user
    {"id": "04", "name": "Amir Haddad", "role": "Flight engineer", "location": "Galley"},
    {"id": "05", "name": "Kenji Nakamura", "role": "Mission specialist", "location": "Habitat"},
]

PATIENT_ID = "03"


def member(crew_id):
    return next(c for c in CREW if c["id"] == crew_id)


def eta_seconds(from_module, to_module):
    gap = abs(MODULES.index(from_module) - MODULES.index(to_module))
    return SETUP_SECONDS + gap * SECONDS_PER_MODULE


def dispatch(patient_id=PATIENT_ID, need_commander=False):
    """Who goes to help, and how long until each arrives. Medical officer always; the nearest other
    crew member as a second pair of hands; the commander too for ship emergencies (fire, pressure)."""
    patient = member(patient_id)
    where = patient["location"]
    others = [c for c in CREW if c["id"] != patient_id]
    team = [c for c in others if c["role"] == "Medical officer"]
    rest = sorted((c for c in others if c not in team), key=lambda c: eta_seconds(c["location"], where))
    if rest:
        team.append(rest[0])
    if need_commander:
        team += [c for c in others if c["role"] == "Commander" and c not in team]
    return {"to": where, "team": [{**c, "eta_s": eta_seconds(c["location"], where)} for c in team]}
