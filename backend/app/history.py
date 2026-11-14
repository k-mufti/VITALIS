"""Medical history: everything that has happened to this crew member on this mission.

Built from the mission environment plus what the sim has recorded (director events,
countermeasures taken, triage alerts). Real missions would read this from the crew's record.
"""
from . import constants as C
from . import missions as M
from .engine.physiology import NAMES, mission_state

# Readable labels for the things the director can throw at the crew.
EVENT_LABELS = {
    "radiation_storm": "Solar particle event, crew sheltered",
    "bad_sleep_week": "Sleep disrupted (heavy workload week)",
    "bp_spike": "Blood pressure spike recorded",
    "skipped_exercise": "Exercise sessions missed",
}

# Baseline mission record, so the history is never empty at the start of the demo.
def baseline_entries(state):
    m = M.get(state["mission"])
    entries = [
        {"day": 0, "date": M.date_for_day(0).isoformat(), "kind": "milestone",
         "title": f"Launch, {state['mission_name']} mission", "detail": "Preflight scans on file: bone density, vision, cardiac."},
        {"day": 30, "date": M.date_for_day(30).isoformat(), "kind": "checkup",
         "title": "30-day standard measures", "detail": "All systems in the crew member's usual range."},
        {"day": 90, "date": M.date_for_day(90).isoformat(), "kind": "checkup",
         "title": "90-day standard measures", "detail": "Bone density down 1.8%, expected for time in microgravity."},
    ]
    if state["day"] >= m["arrival_day"]:
        entries.append({"day": m["arrival_day"], "date": M.date_for_day(m["arrival_day"]).isoformat(),
                        "kind": "milestone", "title": "Arrival and landing",
                        "detail": f"Back under {m['surface']['gravity']} g after the cruise."})
    return [e for e in entries if e["day"] <= state["day"]]


def build(sim):
    state = mission_state(sim)
    entries = baseline_entries(state)

    # Things the crew did or that happened to them, newest first in sim.events.
    for i, event in enumerate(sim.events):
        day = state["day"] - i  # ASSUMPTION: demo events are spread over recent days
        if event.startswith("countermeasure:"):
            cm_id = event.split(":", 1)[1]
            entries.append({"day": day, "date": M.date_for_day(day).isoformat(), "kind": "countermeasure",
                            "title": f"Countermeasure: {cm_id.replace('_', ' ')}", "detail": "Logged by the crew member."})
        else:
            entries.append({"day": day, "date": M.date_for_day(day).isoformat(), "kind": "event",
                            "title": EVENT_LABELS.get(event, event), "detail": ""})

    # Anything escalated to the ground.
    for alert in sim.alerts:
        if alert["level"] == "red":
            entries.append({"day": state["day"], "date": state["date"], "kind": "alert",
                            "title": f"Sent to flight surgeons: {alert['title']}",
                            "detail": f"Earth delay {alert.get('delay_min', 0)} min one way."})

    entries.sort(key=lambda e: e["day"], reverse=True)
    return {
        "crew_id": state["crew_id"], "mission": state["mission"], "mission_name": state["mission_name"],
        "day": state["day"], "date": state["date"],
        "summary": {
            "days_in_space": state["day"],
            "microgravity_months": state["microgravity_months"],
            "radiation_msv": state["radiation_msv"],
            "radiation_pct_of_career_limit": state["radiation_pct_of_career_limit"],
            "radiation_career_limit_msv": C.CAREER_LIMIT_MSV,
            "flagged_systems": [NAMES[k] for k in state["risk_ranking"] if state["organs"][k]["status"] != "OK"],
        },
        "baselines": {
            "preflight_bone_density_pct": 100,
            "usual_resting_heart_rate": C.BASELINE["heart_rate"],
            "usual_sleep_hours": C.BASELINE["sleep_hours"],
            "preflight_onsd_mm": C.ONSD_BASELINE_MM,
        },
        "entries": entries,
    }
