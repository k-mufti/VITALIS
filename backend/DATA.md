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
| **Worn:** smartwatch (Apple Watch Ultra class) | Heart rate, HRV, pulse transit time, breathing, SpO2, wrist temperature, heart rhythm, sleep, sound level, exercise minutes, heart rate during and after workouts | continuous / nightly / per session |
| **Worn:** blood sugar patch | Glucose | every 5 min |
| **Med bay kit:** blood pressure cuff | Systolic, diastolic | daily |
| **Med bay kit:** handheld ultrasound | Optic nerve sheath, heart stroke volume (Doppler), thigh muscle thickness | weekly |
| **Med bay kit:** radiation badge | Total dose, dose rate | continuous |
| Ship: exercise machines | Resistive load | per session |
| Ship: crew tablet | Reaction time, mood, hearing test, balance and nausea check | daily / monthly |
| Ship: cabin air monitor | CO2, oxygen partial pressure, total cabin pressure, temperature, smoke | continuous |

Readings come in each device's own steps (whole beats, whole mg/dL) and `/api/vitals/raw` gives them in the
device's own record format: Apple HealthKit samples for the watch and cuff, Dexcom EGV records for the
glucose patch (`app/devices/native.py`). Real hardware would hand over the same records.

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

## 6. Cabin atmosphere and ears

The cabin air monitor lets the engine tell a **ship problem** from a **body problem**.

- **Oxygen** follows pressure: ppO2 = cabin pressure × 0.21. When a leak drops pressure, the lungs get less oxygen. Blood oxygen falls and resting heart rate rises. The heart's cause chain traces it back to the leak.
- **High CO2** speeds breathing and nudges heart rate up. The lungs note says it's the ship's air.
- **Ears** (new organ):
  - noise exposure vs a 24 h limit of 80.2 dBA, from NIOSH's 85 dBA over 8 h with a 3 dB exchange rate
  - hearing test vs the OSHA 10 dB standard threshold shift
  - cabin pressure (eardrum and sinus squeeze)
  - balance and nausea after gravity changes (NASA HRP sensorimotor risk)
- **Director events:** `cabin_co2`, `cabin_leak` (−10 kPa), `noisy_module` (+14 dBA).

## 7. Checks (what an organ shows when clicked)

Every organ state has `checks`, built by `analysis/checks.py`. Each check has:
- the measured value
- the healthy range and its **source**
- a verdict (ok / watch / act)
- why

Sources include the AHA blood pressure guideline, Cole 1999 (heart-rate recovery), WHO pulse oximetry, NIOSH and OSHA (noise, hearing), the ISS atmosphere spec, AASM (sleep) and Gabbett 2016 (training load). Where no universal norm exists (HRV, muscle thickness), the reference is the crew member's own preflight value. Ranges marked `approx` (CO2 target, ISS pressure and O2 band, stroke volume, nerve sheath cutoff) should be checked against the primary source before quoting.

## 8. Vitaly (voice assistant, `app/vitaly/`)

Standalone by design: Vitaly guides the crew member directly. It never dispatches anyone and never waits on Earth.

- **Summon:** say "Hey Vitaly" or press **T**. The screen switches to a pulsing orb: teal calm, amber warning, red emergency.
- **Watchdog** (`watchdog.py`): fixed rules, every second, on the latest good readings. It catches:
  - limit crossings: heart rate, blood oxygen, blood pressure, cabin pressure, O2, CO2, temperature, smoke, noise, solar storm
  - sharp spikes: heart rate changing 25+ bpm within 60 s
  - drift: resting heart rate 15+ above baseline

  Critical limits use the two latest readings (about 2 s to detect a sudden arrest or smoke). A serious problem hides the side effects it causes.
- **Alert guides** (`protocols.py`): each alert has an opening line and a list of spoken steps the crew member does themselves.
- **Symptom guides** (`guides.py`): what the sensors can't see, the crew member says. "Sharp pain in my chest", "she's not breathing", "I cut my arm" are matched by keywords in a few milliseconds, with separate wording for yourself and for helping someone else. Seventeen guides: chest pain, not breathing (CPR), choking, trouble breathing, bleeding, fainting, burn, seizure (including foaming at the mouth), head injury, severe allergic reaction, possible stroke, poisoning or fumes, broken bone, eye injury, vomiting, panic, and a general "check them over" for when someone is clearly unwell but nothing else matches. For your own symptoms Vitaly first says what your sensors show.
- **Walkthrough:** Vitaly reads one step and waits for "next", "repeat", "back" or "stop". The whole guide arrives in one reply, so stepping needs no server call.
- **Medical profile** (`profile.py`): Crew 03 has a history of paroxysmal AF, so an irregular rhythm is an emergency and the fast-heart-rate limit is 120.
- **Everyday questions** (`quick.py`): answered from live data in about 3 ms, no AI.
- **AI** (`brain.py`): one cheap OpenRouter model (default Mistral Nemo) only for unusual questions; replies are cached for 2 minutes. Voice commands (log a countermeasure, note to Earth) are matched by rules and run after a spoken "yes". Without a key or network, rules answer.
- **Ears** (`ears.py`): Deepgram Nova-3 live speech-to-text. The browser streams the microphone (16 kHz, echo-cancelled) to the backend, which relays it to Deepgram and sends the words back as they are spoken; the key stays on the backend. Deepgram is told to expect the word "Vitaly". The browser decides when you've finished: Deepgram's end-of-phrase signal, plus the microphone level so a pause mid-sentence doesn't cut you off. Chrome's recogniser is the fallback.
- **Voice** (`voice.py`): Deepgram Flux (default `flux-colin-en`; any `flux-<name>-en` or `aura-2-<name>-en` via `DEEPGRAM_TTS_MODEL`, plus `DEEPGRAM_TTS_SPEED` and `DEEPGRAM_TTS_EXPRESSIVITY`), streamed (first audio in about 0.2 s). No guide line contains live numbers, so all of them are voiced once in advance and kept on disk (`data/voice_cache/`, git-ignored); they start in under 50 ms. Every clip carries 100 to 450 ms of silence at each end, so an opening line and step 1 are voiced as one clip instead of two. Chrome's voice is the fallback.
- The steps are standard first aid in plain words, written for the demo. They are not a reviewed medical procedure.
- `eval_vitaly.py` compares models on real questions. `test_vitaly.py` covers the rules and guides.

## 9. API

- `GET /api/analysis`: all three pipelines, layer by layer.
- `GET /api/analysis/{heart|muscles|radiation}`: one pipeline.
- `GET /api/vitals`: latest good readings, the device list and what cannot be measured in flight.
- `GET /api/state`: the full mission state; heart and muscles include their `analysis` block.
- `GET /api/vitaly/incidents`, `POST /api/vitaly/ask`, `POST /api/vitaly/action`, `POST /api/vitaly/prewarm`, `GET /api/vitaly/tts`, `GET /api/vitaly/status`: the Vitaly assistant.

Tests: `test_analysis.py`, `test_devices.py`, `test_engine.py`.

## 10. Real watch (Fitbit through the Google Health API)

The one part of the crew data that can be real. A Fitbit worn by a person replaces the simulated smartwatch readings;
everything else stays simulated and is labelled that way.

- **Why Google Health API:** Fitbit's own Web API was switched off on 2 November 2026. The replacement is
  <https://developers.google.com/health>. Sign-in is Google OAuth (authorization code with PKCE) as the owner of the watch.
- **Setup (once):** Google Cloud Console: enable the Google Health API, OAuth consent screen "External" in Testing mode with
  your own account as a test user, an OAuth client of type "Web" with redirect `http://localhost:8001/api/fitbit/callback`
  (exactly). Put the client ID and secret in `backend/.env` (`GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`). The
  watch's Google account must have a Google Health profile (sign in once in the Google Health app). Then click
  "Connect Fitbit" in the header. In Testing mode the connection expires after 7 days; connect again.
- **What it reads** (`sources/googlehealth.py`, every 30 s): heart rate (newest samples), HRV, blood oxygen, breathing rate, sleep and
  nightly skin temperature; every 5 min today's steps and exercise sessions (needs the `activity_and_fitness.readonly` permission: connect
  again after it is added to the consent screen). Steps and minutes of exercise are today's totals as of the last phone sync; "exercise today"
  is a real zero only if the watch has synced today. Workout heart rate is the average of the newest tracked workout (valid for 48 h). Tokens are kept in `backend/data/fitbit_tokens.json` (git-ignored, file mode 600). The secret never reaches the browser.
- **Not a live stream:** the watch uploads through the phone app, so the newest heart-rate sample is usually minutes old (community
  reports: 5 to 20 min). Every reading carries its own sample time and the app shows its age. Heart rate counts as real for
  20 minutes; HRV, oxygen, breathing and sleep are measured overnight and count for 36 hours. Older than that, the simulated value
  takes over and nothing is labelled real. If no sample exists there is no value; nothing is made up.
- **In the engine** (`devices/live.py`): a fresh real reading replaces the simulated one for the smartwatch device only. Director events
  still work: the change an event causes in the body model is added on top of the real value (an arrest shows a flat line), and the
  reading is tagged "Real + event". Everything downstream (organs, analysis, Vitaly's watchdog) sees these readings like any other.
- **In the app:** header chip (connected, reading, age; "Connect Fitbit" when not signed in; hidden when not set up), a "Real" tag on
  readings in Your health, Collect and the organ detail, the footer, the Sources panel, and `GET /api/vitals/raw` (records say
  `simulated: false` and name the Google Health API).
- **Endpoints:** `GET /api/fitbit/status`, `GET /api/fitbit/connect`, `GET /api/fitbit/callback`, `POST /api/fitbit/disconnect`.
- **Unverified until the first live run** (Google's docs do not say): the heart-rate sampling interval, the exact sync delay, and the
  filter syntax for "last N minutes" (the code asks for the newest samples instead, so it does not depend on it). Sleep is listed with
  the default data-source family; Google says sleep listing normally uses its `reconcile` method, so it may need switching.
- **Muscles:** real exercise minutes and workout heart rate feed the muscle training-load analysis (`analysis/training.py`), so a real day with no
  workout reads as undertrained there. That is the system working on real data.
- **Real readings never raise an alert by themselves** (`watchdog.real_plain`): a real heart rate or blood oxygen going up, down or odd does not make
  Vitaly speak; it is only used when you ask ("Hey Vitaly, how's my heart?"). A Director event layered on top of a real reading (tagged "Real + event") is
  detected like any other, so you can still trigger Vitaly on demand.
- **Whose resting heart rate:** the simulated crew member's baseline is 58 bpm (`constants.BASELINE`); judged against that, a real person at rest
  (often 65 to 85) would set off Vitaly's "drifting up" alert (15 above baseline) the moment the watch went live. So while a fresh real heart rate
  is in use, everything that compares heart rate with a baseline uses the wearer's own resting rate instead: Vitaly's drift alert, the heart
  analysis, the organ's resting-heart-rate verdict and the history page (`googlehealth.resting_baseline`). It is the watch's daily resting heart rate
  if it has one from the last 4 days, otherwise the low end (20th percentile) of at least 10 heart-rate readings spread over at least 20 minutes, from the last 12 hours (every 10 minutes it fetches the newest 2000 samples to catch up).
  Until one of those exists, nothing is judged against a baseline at all (no drift alert) rather than against someone else's number. When the
  real data goes stale, the simulation and its 58 bpm baseline are back. Other readings (HRV, oxygen, breathing, sleep) are still compared
  with the simulated crew member's baselines, so a real HRV below 55 ms can show as "low"; that does not trigger a voice alert.

