"""Device adapter interface. Real hardware (Apple Watch, Dexcom, med bay kit) plugs in by
implementing read(); nothing else in the backend changes. In the demo, all adapters are simulated."""
import random
import time


class DeviceAdapter:
    name = "device"
    label = "Device"

    def read(self, sim):
        """Return a list of Vital dicts: {device, metric, value, unit, ts}."""
        raise NotImplementedError


def vital(device, metric, value, unit):
    return {"device": device, "metric": metric, "value": round(value, 1), "unit": unit, "ts": time.time()}


def noise(scale):
    return random.gauss(0, scale)
