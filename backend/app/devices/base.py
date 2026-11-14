"""Device adapter interface. Real hardware (biomonitor shirt, ultrasound, dosimeter) plugs in by
implementing read(); nothing else in the backend changes. In the demo, all adapters are simulated.

Each metric is read on its own schedule from devices/catalog.py: the shirt streams every second,
the blood pressure cuff is daily, the ultrasound weekly (squeezed into demo seconds).
A director event sets sim.measure_now, which makes every device take an unscheduled reading
on the next tick, like a flight surgeon asking for a check."""
import random
import time

from .catalog import describe


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
            if self.due(sim, metric):
                out.append(vital(self.name, metric, value_fn()))
        return out

    def metrics(self, sim):
        """{metric: zero-arg function returning the value}. Functions so we only compute what is due."""
        raise NotImplementedError


def vital(device, metric, value):
    meta = describe(metric)
    return {"device": device, "metric": metric, "value": round(value, 2 if metric == "dose_rate_usv_h" else 1),
            "unit": meta["unit"], "ts": time.time(),
            "sensor": meta["sensor"], "method": meta["method"], "cadence": meta["cadence"]}


def noise(scale):
    return random.gauss(0, scale)
