"""Simulated devices. Values come from Crew 03's baselines plus the current state of the body.
Real hardware replaces these by implementing DeviceAdapter.read(); nothing else changes."""
from .. import constants as C
from .base import DeviceAdapter, noise, vital

B = C.BASELINE


class SimulatedWatch(DeviceAdapter):
    name = "watch"
    label = "Smartwatch"

    def read(self, sim):
        m = sim.mods
        hr = B["heart_rate"] + 5 * m["sleep_debt"] + 0.25 * m["bp_offset"] + 4 * m["stress"] + noise(0.8)
        exercise = 90
        if m["missed_exercise_days"] > 0:
            exercise = 20
        return [
            vital("watch", "heart_rate", hr, "bpm"),
            vital("watch", "hrv", 55 - 6 * m["sleep_debt"] - 5 * m["stress"] + noise(2), "ms"),
            vital("watch", "spo2", B["spo2"] + noise(0.4), "%"),
            vital("watch", "resp_rate", B["resp_rate"] + 0.05 * m["bp_offset"] + m["stress"] + noise(0.5), "breaths/min"),
            vital("watch", "skin_temp", 33.6 + noise(0.1), "C"),
            vital("watch", "sleep_hours", B["sleep_hours"] - m["sleep_debt"], "h"),
            vital("watch", "exercise_min", exercise, "min/day"),
        ]


class SimulatedCGM(DeviceAdapter):
    name = "cgm"
    label = "Blood sugar sensor"

    def read(self, sim):
        return [vital("cgm", "glucose", B["glucose"] + 8 * sim.mods["stress"] + noise(3), "mg/dL")]


class SimulatedMedBay(DeviceAdapter):
    name = "medbay"
    label = "Med bay kit"

    def read(self, sim):
        from ..engine.physiology import bone_density_pct, onsd_mm
        m = sim.mods
        mood = max(1, min(5, B["mood_1to5"] - 0.5 * m["sleep_debt"] - m["stress"]))
        return [
            vital("medbay", "bp_sys", B["bp_sys"] + m["bp_offset"] + noise(2), "mmHg"),
            vital("medbay", "bp_dia", B["bp_dia"] + 0.5 * m["bp_offset"] + noise(1.5), "mmHg"),
            vital("medbay", "bone_density_pct", bone_density_pct(sim.mission, sim.day, sim.mods, sim.relief), "% preflight"),
            vital("medbay", "onsd_mm", onsd_mm(sim.mission, sim.day, sim.relief) + noise(0.02), "mm"),
            vital("medbay", "reaction_ms", B["reaction_ms"] + 18 * m["sleep_debt"] + 15 * m["stress"] + noise(6), "ms"),
            vital("medbay", "mood_1to5", mood, "1-5"),
        ]


DEVICES = [SimulatedWatch(), SimulatedCGM(), SimulatedMedBay()]
