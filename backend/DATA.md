# How VITALIS uses its data

Everything here runs in the backend. The app only shows the results.

## 1. Where data comes from

**Live external data**

| Source | What it measures | How we use it |
|---|---|---|
| NOAA SWPC, GOES-18 satellite | Proton flux ≥10 MeV, every 5 min | Space-weather level; storm at 10 pfu (NOAA S1) |
| NASA DONKI (CCMC) | Measured solar particle events and flares | The storm the director replays is a real event |
| JPL Horizons | Earth–Mars distance → one-way light time | Comms delay for every alert sent to Earth |

**Crew and ship devices** (simulated; each matches hardware that flies or has flown, see `app/devices/catalog.py`)

| Device | Readings | Cadence |
|---|---|---|
| Biomonitor shirt (like CSA Astroskin) | ECG heart rate, HRV, pulse transit time, breathing, SpO2, skin temp, heart rate during and after workouts | continuous / per session |
| Blood pressure cuff | Systolic, diastolic | daily |
| Handheld ultrasound | Optic nerve sheath, heart stroke volume (Doppler), thigh muscle thickness | weekly |
| Exercise machines | Minutes, resistive load | per session |
| Sleep wristband, crew tablet | Sleep, reaction time, mood | nightly / daily |
| Cabin air monitor (ship) | CO2 | continuous |
| Personal dosimeter | Total dose, dose rate | continuous |

Nothing on board can measure bone density, so it is **estimated** and labelled that way.

## 2. The pipeline

Heart, muscles and radiation run the full five layers (`app/analysis/`). Bones, eyes, lungs and sleep use simpler single-step models.

1. **Raw signal + quality.** Each reading carries `good`, `noisy` (the device's motion sensor flagged it) or `dropout`. Only good readings are used. Flagged ones are counted.
2. **Derived measure.** Readings become meaningful numbers (formulas below).
3. **Personal baseline.** Each value is compared with Crew 03's preflight value (`constants.BASELINE`), not a population average.
4. **Confidence (0–1, with reasons).** Live readings start at 1.0. Flagged readings and overdue scheduled checks lower it. Model-only values score 0.5.
5. **Risk and action.** Each measure gets a severity from 0 to 1. A weighted sum gives the system score, which drives status, ranking, alerts and countermeasures. A **cause chain** says which body-state factor moves which measure, worked out by re-running the model with that factor at zero.

Values for future days (projections) use the noise-free signal model (`app/engine/signals.py`). The simulated devices use the same model plus sensor noise, so both always agree.

## 3. Heart (`analysis/heart.py`)

| Measure | From | Severity starts | Weight |
|---|---|---|---|
| Resting heart rate | ECG | +2 bpm over baseline | 0.20 |
| HRV (RMSSD) | ECG beat-to-beat | 5% under baseline | 0.15 |
| Blood pressure | Cuff | systolic 125 | 0.20 |
| Pulse pressure | systolic − diastolic | 50 mmHg | 0.05 |
| Arterial stiffness | Pulse transit time (ECG beat → fingertip pulse); stiffer arteries carry the pulse faster | 3% faster than baseline | 0.10 |
| Heart-rate recovery | Drop in the first minute after a workout | 4 bpm under baseline; **≤12 bpm is abnormal** (Cole et al., NEJM 1999) | 0.20 |
| Cardiac output | Stroke volume (Doppler) × heart rate | stroke volume 5% under baseline | 0.10 |

The weights are ours. The clinical cutoffs come from the cited literature.

## 4. Muscles: training load versus recovery (`analysis/training.py`)

No instrument measures muscle strain. We use the sports-science approach: work done against recovery, plus direct measures.

- **Training load per day:** Banister TRIMP = minutes × HRr × 0.64 × e^(1.92 × HRr), where HRr = (session HR − resting HR) / (max HR − resting HR). Max HR = 208 − 0.7 × age (Tanaka 2001).
- **Acute:chronic workload ratio:** 7-day mean load / 28-day mean load (Gabbett, BJSM 2016).
  - 0.8–1.3 is the sweet spot.
  - Above 1.5 means overreaching (injury risk).
  - Below 0.8 means undertrained, which in space means muscle and bone lose their protection.
- **Recovery (0–100):** 50% HRV, 25% resting heart rate, 25% sleep, each against baseline.
- **Status:**
  - undertrained, optimal, high load or overreaching, by the ratio
  - **under-recovered** when the ratio is ≥ 1.0 and recovery is below 50
- **Direct measures:** thigh muscle thickness (ultrasound) and resistive load, both as % of preflight.
- **Score weights:** thickness 0.35, strength 0.30, training balance 0.20, recovery 0.15.

The sim keeps one body state, not a diary, so the 28-day log is rebuilt from the model. Recent missed days count as token sessions, and today uses live readings.

## 5. Radiation (`analysis/radiation.py`)

- **Dose so far:** dosimeter total vs the 600 mSv career limit (NASA-STD-3001).
- **Dose budget:** allowance left ÷ days left, against what the rest of the mission will add. Reports % over budget and the day the limit is crossed.
- **Storm dose:** vs the 250 mSv per-event limit.
- **Shelter check:** during a storm, the dosimeter rate vs the unsheltered storm rate. The storm rate multiplier (50× background) and shelter factor (0.25) are assumptions.
- **Mission dose model:**
  - Mars cruise 1.84 mSv/day and surface 0.64 mSv/day (Curiosity RAD).
  - 240 days out, 300 on the surface, 200 home (the phase split is an assumption).

## 6. API

- `GET /api/analysis`: all three pipelines, layer by layer.
- `GET /api/analysis/{heart|muscles|radiation}`: one pipeline.
- `GET /api/vitals`: latest good readings, the device list and what cannot be measured in flight.
- `GET /api/state`: the full mission state; heart and muscles include their `analysis` block.

Tests: `test_analysis.py`, `test_devices.py`, `test_engine.py`.
