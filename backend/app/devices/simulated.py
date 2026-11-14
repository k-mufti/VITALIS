"""Simulated devices. Values come from Crew 03's baselines plus the current state of the body.
Real hardware replaces these by implementing DeviceAdapter.metrics(); nothing else changes.

These match what can actually be measured in flight (see devices/catalog.py). There is no bone
density device on purpose: nothing on a spacecraft can measure it, so the engine estimates it."""
from .. import constants as C
from .. import missions as M
from .base import DeviceAdapter, noise

B = C.BASELINE


class Biomonitor(DeviceAdapter):
    """Smart shirt worn all day: heart, breathing, blood oxygen, skin temperature."""
    name = "wearable"
    label = "Biomonitor shirt"

    def metrics(self, sim):
        m = sim.mods
        return {
            "heart_rate": lambda: B["heart_rate"] + 5 * m["sleep_debt"] + 0.25 * m["bp_offset"] + 4 * m["stress"] + noise(0.8),
            "hrv": lambda: 55 - 6 * m["sleep_debt"] - 5 * m["stress"] + noise(2),
            "spo2": lambda: B["spo2"] + noise(0.4),
            "resp_rate": lambda: B["resp_rate"] + 0.05 * m["bp_offset"] + m["stress"] + noise(0.5),
            "skin_temp": lambda: 33.6 + noise(0.1),
        }


class SleepBand(DeviceAdapter):
    """Wrist actigraph: total sleep, scored once a night."""
    name = "actigraph"
    label = "Sleep wristband"

    def metrics(self, sim):
        return {"sleep_hours": lambda: B["sleep_hours"] - sim.mods["sleep_debt"] + noise(0.1)}


class GlucosePatch(DeviceAdapter):
    name = "cgm"
    label = "Blood sugar patch"

    def metrics(self, sim):
        return {"glucose": lambda: B["glucose"] + 8 * sim.mods["stress"] + noise(3)}


class BPCuff(DeviceAdapter):
    name = "bp_cuff"
    label = "Blood pressure cuff"

    def metrics(self, sim):
        m = sim.mods
        return {
            "bp_sys": lambda: B["bp_sys"] + m["bp_offset"] + noise(2),
            "bp_dia": lambda: B["bp_dia"] + 0.5 * m["bp_offset"] + noise(1.5),
        }


class Ultrasound(DeviceAdapter):
    """Weekly optic nerve sheath scan (SANS). Crewmates scan each other with ground guidance."""
    name = "ultrasound"
    label = "Handheld ultrasound"

    def metrics(self, sim):
        from ..engine.physiology import onsd_mm
        return {"onsd_mm": lambda: onsd_mm(sim.mission, sim.day, sim.relief) + noise(0.02)}


class CrewTablet(DeviceAdapter):
    """Daily reaction-time test and mood check."""
    name = "tablet"
    label = "Crew tablet tests"

    def metrics(self, sim):
        m = sim.mods
        return {
            "reaction_ms": lambda: B["reaction_ms"] + 18 * m["sleep_debt"] + 15 * m["stress"] + noise(6),
            "mood_1to5": lambda: max(1, min(5, B["mood_1to5"] - 0.5 * m["sleep_debt"] - m["stress"])),
        }


class ExerciseMachines(DeviceAdapter):
    """Treadmill and resistive machine logs. Inputs to the bone and muscle estimates."""
    name = "exercise"
    label = "Exercise machines"

    def metrics(self, sim):
        missed = sim.mods["missed_exercise_days"]
        return {
            "exercise_min": lambda: 20 if missed > 0 else 90,
            # ASSUMPTION: resistive load drifts down with missed sessions (strength falling).
            "resistive_load_pct": lambda: max(60, 96 - 2.5 * missed + noise(0.5)),
        }


class Dosimeter(DeviceAdapter):
    """Personal dosimeter: total dose so far and the current dose rate."""
    name = "dosimeter"
    label = "Personal dosimeter"

    def metrics(self, sim):
        m = M.get(sim.mission)
        rate_per_day = M.phase_values(m, M.phase(m, sim.day))["dose"]
        return {
            "dose_msv": lambda: M.cumulative_dose(m, sim.day) + sim.mods["extra_dose"],
            # Background rate for this phase, in the unit dosimeters show (micro-sieverts per hour).
            "dose_rate_usv_h": lambda: rate_per_day * 1000 / 24 * (1 + noise(0.03)),
        }


DEVICES = [Biomonitor(), SleepBand(), GlucosePatch(), BPCuff(), Ultrasound(), CrewTablet(), ExerciseMachines(), Dosimeter()]
