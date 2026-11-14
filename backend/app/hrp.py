"""NASA Human Research Program framework, from the resources NASA gave this challenge.

Every organ system in VITALIS is tagged with:
  - the official HRP risk names it covers (17 risks, nasa.gov/hrp/risks)
  - the hazards that drive it (5 hazards, nasa.gov/hrp/hazards)
and its countermeasures point at real ongoing HRP research where one exists.
"""

SOURCES = {
    "hazards": "https://www.nasa.gov/hrp/hazards/",
    "risks": "https://www.nasa.gov/hrp/risks/",
    "research": "https://www.nasa.gov/hrp/ongoing-hrp-research/",
    "csa_radiation": "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp",
    "csa_science": "https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp",
}

# The 5 hazards of human spaceflight (nasa.gov/hrp/hazards). `fact` = what the page says.
HAZARDS = {
    "radiation": {"name": "Space radiation", "fact": "Invisible and among the most hazardous aspects of spaceflight."},
    "isolation": {"name": "Isolation and confinement", "fact": "Small crews isolated for months or years show behavioral responses."},
    "distance": {"name": "Distance from Earth", "fact": "Mars averages about 140 million miles away; a Mars mission takes about 3 years."},
    "gravity": {"name": "Gravity fields", "fact": "Muscles, bones, inner ear and organs must adapt; Mars gravity is 3/8 of Earth's for up to 2 years."},
    "environment": {"name": "Hostile/closed environments", "fact": "Temperature, pressure, lighting, noise, microbes and immune responses must be managed."},
}

# The 17 HRP risks (nasa.gov/hrp/risks), grouped as on the page.
RISKS = {
    # Human physiology
    "immune": {"name": "Altered Immune System Responses", "group": "physiology"},
    "sensorimotor": {"name": "Altered Sensorimotor and Vestibular Function", "group": "physiology"},
    "cardiovascular": {"name": "Cardiovascular Adaptations", "group": "physiology"},
    "decompression": {"name": "Decompression Sickness", "group": "physiology"},
    "microbes": {"name": "Host-Microorganism Interactions", "group": "physiology"},
    "hypoxia": {"name": "Hypoxia", "group": "physiology"},
    "nutrition": {"name": "Inadequate Food and Nutrition", "group": "physiology"},
    "eva": {"name": "Injury and Compromised Performance from Spacewalks", "group": "physiology"},
    "fitness": {"name": "Reduced Cardiorespiratory and Musculoskeletal Fitness", "group": "physiology"},
    "sans": {"name": "Spaceflight Associated Neuro-ocular Syndrome (SANS)", "group": "physiology",
             "note": "NASA's leading spaceflight-related health risk"},
    "bone": {"name": "Spaceflight-Induced Bone Changes", "group": "physiology"},
    # Behavioral performance and human factors
    "behavioral": {"name": "Behavioral Changes and Psychiatric Disorders", "group": "behavior"},
    "teamwork": {"name": "Inadequate Teamwork", "group": "behavior"},
    "sleep": {"name": "Inadequate Sleep and Irregular Schedules", "group": "behavior"},
    "ops_support": {"name": "Inadequate Systems Operations Support", "group": "behavior"},
    "dynamic_loads": {"name": "Injury from Dynamic Loads", "group": "behavior"},
    # Space radiation
    "cancer": {"name": "Radiation-Induced Cancers", "group": "radiation"},
}

# How each VITALIS organ system maps onto NASA's framework.
ORGAN_MAP = {
    "bones": {"hrp_risks": ["bone", "dynamic_loads"], "hazards": ["gravity"]},
    "heart": {"hrp_risks": ["cardiovascular", "fitness"], "hazards": ["gravity", "radiation"]},
    "muscles": {"hrp_risks": ["fitness"], "hazards": ["gravity"]},
    "sleep": {"hrp_risks": ["sleep", "behavioral", "teamwork"], "hazards": ["isolation", "distance", "radiation"]},
    "eyes": {"hrp_risks": ["sans"], "hazards": ["gravity"]},
    "lungs": {"hrp_risks": ["hypoxia", "microbes"], "hazards": ["environment"]},
    "ears": {"hrp_risks": ["sensorimotor", "decompression"], "hazards": ["gravity", "environment"]},
}

# Risks we track for the whole mission instead of one organ.
MISSION_LEVEL = {
    "radiation_dose": {"hrp_risks": ["cancer"], "hazards": ["radiation"],
                       "how": "total dose vs NASA-STD-3001 600 mSv career limit (environment)"},
    "comms_delay": {"hrp_risks": ["ops_support"], "hazards": ["distance"],
                    "how": "Earth delay from JPL Horizons drives what the crew must handle alone (triage)"},
}

# Real ongoing HRP research behind our countermeasures and devices (nasa.gov/hrp/ongoing-hrp-research).
RESEARCH = {
    "thigh_cuff": {"study": "Thigh Cuff", "what": "Tight thigh cuffs keep fluid in the legs and may help prevent eye disorders."},
    "b_complex": {"study": "B-Complex", "what": "Daily B vitamin supplement to prevent or reduce brain and eye changes."},
    "zero_t2": {"study": "Zero T2", "what": "How exercise without a treadmill affects health and performance."},
    "archer": {"study": "ARCHeR (Artemis II)", "what": "Wrist-worn actigraphy tracking motion, sleep and light exposure."},
    "immune_biomarkers": {"study": "Immune Biomarkers (Artemis II)", "what": "Blood and saliva samples to see how deep space affects immunity."},
    "standard_measures": {"study": "Standard Measures", "what": "Consistent physiological and psychological measurements from every crew member."},
}


def tags_for(organ):
    """HRP risk names + hazard names for one organ, ready to put in an OrganState."""
    m = ORGAN_MAP[organ]
    return {
        "hrp_risks": [RISKS[r]["name"] for r in m["hrp_risks"]],
        "hazards": [HAZARDS[h]["name"] for h in m["hazards"]],
    }


def framework():
    """Everything for /api/hrp: hazards, risks, organ mapping, research, sources."""
    covered = sorted({r for m in list(ORGAN_MAP.values()) + list(MISSION_LEVEL.values()) for r in m["hrp_risks"]})
    return {
        "hazards": HAZARDS, "risks": RISKS, "organ_map": ORGAN_MAP, "mission_level": MISSION_LEVEL, "research": RESEARCH,
        "coverage": {"risks_covered": len(covered), "risks_total": len(RISKS), "covered": covered},
        "sources": SOURCES,
    }
