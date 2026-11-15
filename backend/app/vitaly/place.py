"""Where on the body: the AI's backup for words the app's own list doesn't know.

The browser first matches what was said against its own words (src/ui/vitaly-body.js: wrist, ACL,
rotator cuff, ...). Only when none match ("the bony bit on the outside of my ankle") does it ask here.
The AI may only pick one place from the list the browser sends (the injury drill's body map), and
the answer is checked against that list, so it can't invent a place. Which side counts only if the
person said it; otherwise the browser asks them. No key, the spend cap reached, a slow or odd reply:
the answer is "no place", and the body stays on the whole-body view.
"""
import json
import re

from . import brain

SYSTEM = ("You map what an astronaut said about an injury or pain to ONE place on a body map. "
          "Pick the most specific place that fits, using anatomy: a ligament, tendon or bone belongs to the joint or "
          "part it is in (ACL -> knee, Achilles -> ankle, scaphoid -> wrist). Reply with JSON only.")


async def find(text, places):
    """places: [{"id": "lower/S-leg/knee", "name": "Leg > Knee"}, ...]. Returns {"place": id or None, "side": "left" | "right" | None}."""
    ids = {str(p.get("id")) for p in places if p.get("id")}
    if not text.strip() or not ids:
        return {"place": None, "side": None, "engine": "none"}
    menu = "\n".join(f"{p['id']}: {p.get('name', '')}" for p in places if p.get("id"))
    prompt = (f"PLACES (id: name; S means a side not chosen yet):\n{menu}\n\nThey said: \"{text[:300]}\"\n\n"
              "Reply {\"place\": \"<an id from PLACES, or null if no body place is meant>\", "
              "\"side\": \"left\" or \"right\" only if they said which side, otherwise null}.")
    out = await brain.complete([{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], 40)
    if not out:
        return {"place": None, "side": None, "engine": "none"}
    m = re.search(r"\{.*\}", out["text"], re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        data = {}
    place = data.get("place") if data.get("place") in ids else None
    side = data.get("side") if data.get("side") in ("left", "right") else None
    return {"place": place, "side": side if place else None, "engine": out["model"]}
