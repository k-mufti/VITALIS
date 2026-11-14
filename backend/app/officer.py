"""Medical officer answers, rule-based from the engine state (no AI yet).
An LLM can be added later behind the same /api/ask route."""


def answer(question, state):
    q = question.lower()
    sources = ["Crew 03 device readings (simulated)"] + [state["organs"][k]["source"] for k in state["risk_ranking"][:3]]
    words = {"heart": "heart", "bone": "bones", "sleep": "sleep", "tired": "sleep", "mind": "sleep",
             "eye": "eyes", "vision": "eyes", "lung": "lungs", "breath": "lungs", "muscle": "muscles", "leg": "muscles"}
    organ = None
    for word, k in words.items():
        if word in q:
            organ = k
            break
    if "radiation" in q or "storm" in q:
        text = (f"You have received about {state['radiation_msv']:.0f} mSv so far, "
                f"{state['radiation_pct_of_career_limit']:.0f}% of the {state['radiation_career_limit_msv']} mSv career limit.")
        if state["storm"]:
            text += f" A solar particle event is active ({state['storm']['eventTime']}): stay in the storm shelter."
        return {"answer": text, "sources": sources + ["NASA-STD-3001 radiation limits", "NASA DONKI"], "engine": "rules"}
    if organ is None:
        top = [state["organs"][k] for k in state["risk_ranking"][:3]]
        parts = [f"{o['rank']}. {o['name']} ({o['status']})" for o in top]
        first = top[0]
        text = (f"Day {state['day']} of the {state['mission_name']} mission. Top risks: " + ", ".join(parts) + ". "
                f"{first['note']} Best next step: {first['countermeasures'][0]['label'].lower()}.")
        return {"answer": text, "sources": sources, "engine": "rules"}
    o = state["organs"][organ]
    text = f"{o['name']} is ranked {o['rank']} and marked {o['status']}. {o['note']}"
    if o["drivers"]:
        text += " Main causes: " + ", ".join(o["drivers"]) + "."
    if o["what_could_go_wrong"]:
        text += f" If it continues: {o['what_could_go_wrong'][0]['title'].lower()}."
    text += f" Suggested: {o['countermeasures'][0]['label'].lower()}."
    return {"answer": text, "sources": [o["source"]] + o["hrp_risks"], "engine": "rules"}
