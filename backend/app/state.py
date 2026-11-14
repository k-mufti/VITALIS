"""Live simulation state for one crew member. One global instance (`sim`)."""
from collections import defaultdict, deque

from . import missions as M

ORGANS = ["heart", "bones", "sleep", "eyes", "lungs", "muscles"]

# Seconds of continuous readings averaged for the current value (smooths sensor noise).
RECENT_WINDOW = 5

# Upper limits for the body-state knobs, so repeated director clicks stay physiologically sane.
MOD_LIMITS = {"sleep_debt": 4.0, "missed_exercise_days": 14, "bp_offset": 42.0, "stress": 2.0}


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
        self.measure_now = True  # take every reading once at start, then follow each device schedule
        self.alerts = []
        self.alert_seq = 0

    def record(self, vital):
        self.latest[vital["metric"]] = vital
        self.history[vital["metric"]].append(vital["value"])

    def recent(self, metric):
        """Current value of a metric. Continuous sensors (every second) are smoothed over the last
        few seconds; scheduled checks (daily cuff, weekly ultrasound) use the latest reading, since
        older ones describe the body as it was days ago."""
        values = self.history.get(metric)
        if not values:
            return None
        window = list(values)[-RECENT_WINDOW:] if self.latest[metric]["cadence"] == "continuous" else [values[-1]]
        return sum(window) / len(window)

    def fresh_readings(self, devices):
        """Something just changed the body (director event, countermeasure): drop old readings and
        take a new one from every device, so the change shows at once instead of being averaged away."""
        self.history.clear()
        self.measure_now = True
        for device in devices:
            for v in device.read(self):
                self.record(v)
        self.measure_now = False


sim = Sim()
