"""Simulated devices. Each reading is the true value from engine/signals.py plus sensor noise.
Real hardware replaces these by implementing DeviceAdapter.metrics(); nothing else changes.

These match what can actually be measured in flight (see devices/catalog.py). There is no bone
density device on purpose: nothing on a spacecraft can measure it, so the engine estimates it."""
from ..engine import signals
from .base import DeviceAdapter, noise

# Sensor noise per metric (one standard deviation), in the metric's unit.
NOISE = {
    "heart_rate": 0.8, "hrv": 2.0, "spo2": 0.4, "resp_rate": 0.5, "skin_temp": 0.1, "pulse_transit_ms": 3.0,
    "session_hr_avg": 2.0, "hr_recovery_bpm": 1.5,
    "sleep_hours": 0.1, "glucose": 3.0, "bp_sys": 2.0, "bp_dia": 1.5,
    "onsd_mm": 0.02, "stroke_volume_ml": 2.0, "quad_thickness_mm": 0.4,
    "reaction_ms": 6.0, "resistive_load_pct": 0.5, "co2_mmhg": 0.05,
}


class SimulatedDevice(DeviceAdapter):
    """A device whose metrics all come from the signal model."""
    reads = ()

    def metrics(self, sim):
        storm = bool(sim.storm)

        def reader(metric):
            def read():
                v = signals.value(metric, sim.mods, sim.relief, sim.mission, sim.day, storm)
                if metric == "dose_rate_usv_h":
                    return v * (1 + noise(0.03))
                return v + noise(NOISE.get(metric, 0.0))
            return read

        return {metric: reader(metric) for metric in self.reads}


class Biomonitor(SimulatedDevice):
    """Smart shirt worn all day: ECG heart rate and HRV, breathing, blood oxygen, skin temperature,
    pulse transit time (ECG beat to fingertip pulse), and heart rate during and after each workout."""
    name, label = "wearable", "Biomonitor shirt"
    reads = ("heart_rate", "hrv", "spo2", "resp_rate", "skin_temp", "pulse_transit_ms", "session_hr_avg", "hr_recovery_bpm")


class SleepBand(SimulatedDevice):
    name, label = "actigraph", "Sleep wristband"
    reads = ("sleep_hours",)


class GlucosePatch(SimulatedDevice):
    name, label = "cgm", "Blood sugar patch"
    reads = ("glucose",)


class BPCuff(SimulatedDevice):
    name, label = "bp_cuff", "Blood pressure cuff"
    reads = ("bp_sys", "bp_dia")


class Ultrasound(SimulatedDevice):
    """Weekly scans: optic nerve sheath (eyes), heart stroke volume (Doppler), thigh muscle thickness."""
    name, label = "ultrasound", "Handheld ultrasound"
    reads = ("onsd_mm", "stroke_volume_ml", "quad_thickness_mm")


class CrewTablet(SimulatedDevice):
    name, label = "tablet", "Crew tablet tests"
    reads = ("reaction_ms", "mood_1to5")


class ExerciseMachines(SimulatedDevice):
    """Treadmill and resistive machine logs: minutes and the load lifted."""
    name, label = "exercise", "Exercise machines"
    reads = ("exercise_min", "resistive_load_pct")


class CabinAir(SimulatedDevice):
    """Ship life-support sensor, not worn: lets the engine tell a cabin air problem from a body problem."""
    name, label = "cabin_air", "Cabin air monitor"
    reads = ("co2_mmhg",)


class Dosimeter(SimulatedDevice):
    """Personal dosimeter: total dose so far and the current dose rate (higher in a storm, even sheltered)."""
    name, label = "dosimeter", "Personal dosimeter"
    reads = ("dose_msv", "dose_rate_usv_h")


DEVICES = [Biomonitor(), SleepBand(), GlucosePatch(), BPCuff(), Ultrasound(), CrewTablet(),
           ExerciseMachines(), CabinAir(), Dosimeter()]
