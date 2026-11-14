"""Live simulation state for one crew member. One global instance (`sim`)."""
from collections import defaultdict, deque

from . import missions as M

ORGANS = ["heart", "bones", "sleep", "eyes", "lungs", "muscles"]


class Sim:
    def __init__(self):
        self.reset()

    def reset(self):
        self.mission = M.current_mission()
        self.day = M.current_day()
        self.crew_id = "03"
        # Things that push the body off baseline. Director events and countermeasures change these.
        self.mods = {
            "sleep_debt": 1.2,           # hours below baseline sleep
            "missed_exercise_days": 2,   # recent days without the exercise routine
            "bp_offset": 0.0,            # mmHg added to systolic
            "stress": 0.0,               # 0..2
            "extra_dose": 0.0,           # mSv from storms on top of the normal dose rate
        }
        self.relief = {k: 0.0 for k in ORGANS}  # severity removed by countermeasures
        self.history = defaultdict(lambda: deque(maxlen=30))
        self.latest = {}
        self.events = []
        self.storm = None
        self.storm_count = 0
        self.alerts = []
        self.alert_seq = 0

    def record(self, vital):
        self.latest[vital["metric"]] = vital
        self.history[vital["metric"]].append(vital["value"])

    def recent(self, metric):
        values = self.history.get(metric)
        if not values:
            return None
        return sum(values) / len(values)


sim = Sim()
