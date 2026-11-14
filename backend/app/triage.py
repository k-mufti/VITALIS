"""Triage: green = self-care, amber = notify a crewmate, red = send to Earth flight surgeons.
Red alerts travel at the real comms delay (sped up by TRIAGE_TIME_SCALE for the demo)."""
import os
import time

REPLY = {
    "heart": "Flight surgeon: do 30 min lower body negative pressure today, recheck resting rate tomorrow.",
    "bones": "Flight surgeon: add a second resistive session daily until density stabilizes.",
    "sleep": "Flight surgeon: protected 8 h sleep for 3 nights, no critical tasks until reaction time recovers.",
    "muscles": "Flight surgeon: resume the full exercise routine, add protein at each meal.",
    "lungs": "Flight surgeon: run a cabin air check and report oxygen readings every 4 h.",
    "eyes": "Flight surgeon: wear thigh cuffs during the day and send an eye ultrasound tomorrow.",
    "radiation": "Flight surgeon: stay in the storm shelter until the particle flux drops. Log your dosimeter.",
}


def _scale():
    return max(1.0, float(os.getenv("TRIAGE_TIME_SCALE", "60")))


def _open(sim, organ):
    for a in sim.alerts:
        if a["organ"] == organ and a["state"] != "closed":
            return a
    return None


def raise_alert(sim, organ, level, title, delay_min):
    existing = _open(sim, organ)
    if existing and existing["level"] == level:
        return existing
    if existing:
        existing["state"] = "closed"
    sim.alert_seq += 1
    now = time.time()
    alert = {"id": sim.alert_seq, "organ": organ, "level": level, "title": title,
             "created": now, "state": "open", "to_earth": level == "red"}
    if level == "red":
        one_way_s = delay_min * 60
        demo_s = one_way_s / _scale()
        alert.update({"delay_min": round(delay_min, 2), "demo_one_way_s": round(demo_s, 1),
                      "arrives_at": now + demo_s, "reply_at": now + 2 * demo_s + 2})
    sim.alerts.insert(0, alert)
    del sim.alerts[30:]
    return alert


def update(sim, state):
    for organ, o in state["organs"].items():
        if o["status"] == "Act":
            raise_alert(sim, organ, "red", f"{o['name']}: {o['note']}", state["comms_delay_min"])
        elif o["status"] == "Watch":
            raise_alert(sim, organ, "amber", f"{o['name']}: {o['note']}", state["comms_delay_min"])
        else:
            a = _open(sim, organ)
            if a:
                a["state"] = "closed"


def view(sim):
    now = time.time()
    out = []
    for a in sim.alerts:
        item = dict(a)
        if a["to_earth"]:
            if now < a["arrives_at"]:
                item["earth_status"] = "sending"
                item["seconds_left"] = round(a["arrives_at"] - now, 1)
            elif now < a["reply_at"]:
                item["earth_status"] = "received, reply on the way"
                item["seconds_left"] = round(a["reply_at"] - now, 1)
            else:
                item["earth_status"] = "reply received"
                item["reply"] = REPLY.get(a["organ"], "Flight surgeon: acknowledged.")
        out.append(item)
    return out
