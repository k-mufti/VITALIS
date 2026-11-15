"""Live simulation state for one crew member. One global instance (`sim`)."""
from collections import defaultdict, deque

from . import missions as M

ORGANS = ["heart", "bones", "sleep", "eyes", "lungs", "muscles", "ears"]

# Seconds of continuous readings averaged for the current value (smooths sensor noise).
RECENT_WINDOW = 5

# Upper limits for the body-state knobs, so repeated director clicks stay physiologically sane.
MOD_LIMITS = {"sleep_debt": 4.0, "missed_exercise_days": 14, "bp_offset": 42.0, "stress": 2.0, "co2_offset": 3.0, "pressure_drop_kpa": 12.0, "noise_offset": 20.0,
              "bp_drop": 60.0, "pressure_rise_kpa": 10.0, "o2_boost_kpa": 6.0, "smoke": 1.0, "temp_offset_c": 15.0}

# How many recent quality flags to keep per metric (for the confidence score).
QUALITY_WINDOW = 120


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
            "co2_offset": 0.0,           # mmHg of cabin CO2 above normal (ship, not body)
            "pressure_drop_kpa": 0.0,    # cabin pressure below normal (leak), takes oxygen down with it
            "noise_offset": 0.0,         # dBA above the usual module noise (failing fan, pump)
            "cardiac": "",               # heart emergency: "", "brady", "arrhythmia", "arrest"
            "bp_drop": 0.0,              # mmHg below normal systolic (blood pressure crash)
            "pressure_rise_kpa": 0.0,    # cabin over-pressure
            "o2_boost_kpa": 0.0,         # extra oxygen partial pressure (fire risk)
            "smoke": 0.0,                # 0..1 smoke in the module
            "temp_offset_c": 0.0,        # cabin temperature above normal
        }
        self.relief = {k: 0.0 for k in ORGANS}  # severity removed by countermeasures
        self.history = defaultdict(lambda: deque(maxlen=30))
        self.latest = {}
        self.quality = defaultdict(lambda: deque(maxlen=QUALITY_WINDOW))
        self.events = []
        self.storm = None
        self.storm_count = 0
        self.measure_now = True  # take every reading once at start, then follow each device schedule
        self.alerts = []
        self.alert_seq = 0
        self.incidents = []      # Vitaly watchdog incidents (vitaly/watchdog.py)
        self.incident_seq = 0
        self.hr_trace = deque(maxlen=180)  # (time, heart rate) for spike detection

    def record(self, vital):
        """Keep every quality flag, but only good readings feed the values the engine uses."""
        self.quality[vital["metric"]].append(vital.get("quality", "good"))
        if vital.get("quality", "good") != "good":
            return
        self.latest[vital["metric"]] = vital
        self.history[vital["metric"]].append(vital["value"])

    def good_share(self, metric):
        """Share of recent readings that were usable (1.0 = no motion or dropouts)."""
        flags = self.quality.get(metric)
        if not flags:
            return None
        return sum(1 for f in flags if f == "good") / len(flags)

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
