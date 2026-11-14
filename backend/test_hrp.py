"""Checks the NASA HRP mapping is consistent. Run: python test_hrp.py"""
from app import hrp
from app.engine.physiology import mission_state
from app.state import sim

assert len(hrp.HAZARDS) == 5, "NASA lists 5 hazards"
assert len(hrp.RISKS) == 17, "NASA lists 17 risks"
state = mission_state(sim)
for organ in state["organs"]:
    assert organ in hrp.ORGAN_MAP, f"{organ} has no HRP mapping"
    for r in hrp.ORGAN_MAP[organ]["hrp_risks"]:
        assert r in hrp.RISKS, f"{organ}: unknown risk {r}"
    for h in hrp.ORGAN_MAP[organ]["hazards"]:
        assert h in hrp.HAZARDS, f"{organ}: unknown hazard {h}"
assert set(state["risk_ranking"]) == set(state["organs"]), "ranking must list every organ"
assert "sans" in hrp.ORGAN_MAP["eyes"]["hrp_risks"], "eyes must cover SANS"
for organ in state["organs"].values():
    assert organ["hrp_risks"] and organ["hazards"], f"{organ['id']} missing HRP tags"
cov = hrp.framework()["coverage"]
print(f"HRP checks passed: {cov['risks_covered']}/{cov['risks_total']} NASA risks covered by {len(state['organs'])} organ systems")
