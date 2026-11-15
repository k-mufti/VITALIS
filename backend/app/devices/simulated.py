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
    "cabin_pressure_kpa": 0.05, "ppo2_kpa": 0.03, "noise_dba": 0.8, "hearing_shift_db": 0.5, "cabin_temp_c": 0.1,
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
                if metric in ("ecg_irregular", "smoke_index") or (metric in ("heart_rate", "bp_sys", "bp_dia") and v == 0):
                    return v  # flags and flatlines are exact
                if metric == "heart_rate" and sim.mods.get("cardiac") == "arrhythmia":
                    return v + noise(15.0)  # irregular rhythm: beat-to-beat rate jumps around
                return v + noise(NOISE.get(metric, 0.0))
            return read

        return {metric: reader(metric) for metric in self.reads}


class Watch(SimulatedDevice):
    """Smartwatch worn all day and night: heart rate, HRV, blood oxygen, breathing, wrist temperature,
    heart rhythm, sleep, sound level, exercise minutes, and heart rate during and after each workout.
    # ASSUMPTION: pulse transit time (heartbeat to wrist pulse) is read by the watch; no consumer
    watch reports it today, though its ECG and optical sensors are what the measurement needs."""
    name, label = "wearable", "Smartwatch"
    reads = ("heart_rate", "hrv", "spo2", "resp_rate", "skin_temp", "pulse_transit_ms", "session_hr_avg", "hr_recovery_bpm",
             "ecg_irregular", "sleep_hours", "noise_dba", "exercise_min")


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
    """Reaction test, mood and nausea check (daily), hearing test with headphones (monthly)."""
    name, label = "tablet", "Crew tablet tests"
    reads = ("reaction_ms", "mood_1to5", "motion_sickness_0to10", "hearing_shift_db")


class ExerciseMachines(SimulatedDevice):
    """Resistive machine log: the load lifted. Exercise minutes come from the watch."""
    name, label = "exercise", "Exercise machines"
    reads = ("resistive_load_pct",)


class CabinAir(SimulatedDevice):
    """Ship life-support sensors, not worn: CO2, oxygen and total pressure. Lets the engine tell a
    cabin air problem from a body problem."""
    name, label = "cabin_air", "Cabin air monitor"
    reads = ("co2_mmhg", "ppo2_kpa", "cabin_pressure_kpa", "cabin_temp_c", "smoke_index")


class Dosimeter(SimulatedDevice):
    """Radiation badge (personal dosimeter): total dose so far and the current dose rate (higher in a storm, even sheltered)."""
    name, label = "dosimeter", "Radiation badge"
    reads = ("dose_msv", "dose_rate_usv_h")


# Two worn devices, one med bay kit (cuff, ultrasound, badge), and what the ship already logs.
DEVICES = [Watch(), GlucosePatch(), BPCuff(), Ultrasound(), Dosimeter(), CrewTablet(), ExerciseMachines(), CabinAir()]
