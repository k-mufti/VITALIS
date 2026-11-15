"""Device adapter interface. Real hardware (smartwatch, glucose patch, ultrasound, dosimeter) plugs in by
implementing metrics(); nothing else in the backend changes. In the demo, all adapters are simulated.

Each metric is read on its own schedule from devices/catalog.py: the watch streams every second,
the blood pressure cuff is daily, the ultrasound weekly (squeezed into demo seconds).
sim.measure_now makes every device take an unscheduled reading on the next read.

Every reading carries a quality flag, as real wearables do:
  good     use it
  noisy    the device's motion sensor flagged movement; the value is unreliable
  dropout  no signal (electrode lifted, sensor off); no value
The engine only uses good readings, and counts the rest to say how confident it is."""
import random
import time

from . import live
from .catalog import DEFAULT_RESOLUTION, RESOLUTION, describe

# ASSUMPTION: share of continuous wearable readings lost to motion or dropout in daily life.
NOISY_RATE = 0.015
DROPOUT_RATE = 0.005


class DeviceAdapter:
    name = "device"
    label = "Device"

    def __init__(self):
        self._last = {}

    def due(self, sim, metric):
        """True if this metric's next scheduled reading is due (or an unscheduled check was asked for)."""
        now = time.time()
        every = describe(metric)["demo_every_s"]
        if sim.measure_now or now - self._last.get(metric, 0) >= every:
            self._last[metric] = now
            return True
        return False

    def read(self, sim):
        """Return a list of Vital dicts for the metrics that are due."""
        out = []
        for metric, value_fn in self.metrics(sim).items():
            if not self.due(sim, metric):
                continue
            real = live.override(sim, self.name, metric)   # a fresh reading from the real watch, if connected
            if real:
                out.append(vital(self.name, metric, real[0], "good", real[1]))
                continue
            quality = "good"
            value = value_fn()
            # Continuous worn sensors suffer motion and contact loss; scheduled checks are supervised.
            if describe(metric)["cadence"] == "continuous" and self.name == "wearable" and not sim.measure_now:
                r = random.random()
                if r < DROPOUT_RATE:
                    quality, value = "dropout", None
                elif r < DROPOUT_RATE + NOISY_RATE:
                    quality, value = "noisy", value * (1 + random.gauss(0, 0.25))
            out.append(vital(self.name, metric, value, quality))
        return out

    def metrics(self, sim):
        """{metric: zero-arg function returning the value}. Functions so we only compute what is due."""
        raise NotImplementedError


def vital(device, metric, value, quality="good", extra=None):
    meta = describe(metric)
    if value is not None:
        # Report in the device's own steps: whole beats, whole mg/dL, half breaths.
        step = RESOLUTION.get(metric, DEFAULT_RESOLUTION)
        value = round(round(value / step) * step, 2)
    return {"device": device, "metric": metric, "value": value, "quality": quality,
            "unit": meta["unit"], "ts": time.time(),
            "sensor": meta["sensor"], "method": meta["method"], "cadence": meta["cadence"], **(extra or {})}


def noise(scale):
    return random.gauss(0, scale)
