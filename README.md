# VITALIS

Health monitoring software for astronauts on long missions.

VITALIS collects an astronaut's health readings into one system, checks them all day, and tells the
crew what to do when something is wrong. It was built in one weekend for the NASA Space Apps
Challenge 2026.

**Live demo:** https://kareemmuftee.com/vitalis

**Presentation:** [VITALIS slides (Google Slides)](https://docs.google.com/presentation/d/1H89pXaYadHyD9WQUo16FAIu04s4yp_qU/edit?usp=sharing)

---

## The challenge

**NASA Space Apps Challenge 2026: "Create Health Monitoring Software for Astronauts on Space Missions."**

[NASA Space Apps](https://www.spaceappschallenge.org/) is NASA's yearly international hackathon. Teams have one
weekend to build a solution to a challenge written by NASA and its partner space agencies. This year's event ran
on November 14 and 15, 2026.

The challenge asks for software that monitors astronaut health during a mission. The challenge resources point to
NASA's Human Research Program (HRP) and the Canadian Space Agency:

- the **5 hazards** of human spaceflight: radiation, isolation and confinement, distance from Earth, gravity fields,
  and a hostile closed environment
- the **17 HRP risks**, such as bone loss, Spaceflight Associated Neuro-ocular Syndrome (SANS), heart and muscle changes, and radiation
- ongoing HRP research, such as the ARCHeR wrist device worn by the Artemis II crew
- CSA material on radiation monitoring and on why longer missions make health care harder

## The problem

On a Mars mission there is no doctor on board. A message to Earth and back takes between about 11 and 44 minutes,
depending on where the planets are. Health readings are spread over many devices, and nobody can keep track of all of
them, all day. When something goes wrong, the crew has to act before Earth can answer.

## What VITALIS does

**1. Collect.** VITALIS gathers 30 health readings from 8 sources into one system: devices the astronaut wears, the
med bay kit, and the ship's own sensors. The readings are shown on a 3D body you can view layer by layer: skin,
muscles, bones and organs.

**2. Watch and analyse.** Every reading is checked against medical ranges and NASA limits, and compared with the
astronaut's own preflight values. Trends over the past week catch slow changes. Readings are cross-checked with the
cabin air and with live solar storm and radiation data from NASA and NOAA, so the app can tell a ship problem from a
body problem.

**3. Act, with AI.** When something is wrong, Vitaly, the built-in AI assistant, talks the astronaut through each step
out loud. The readings are sent to Earth at the same time, with a countdown to when the reply can arrive. The astronaut
can also name any injury: the AI finds the body part, highlights it in red on the 3D body, and reads out the first-aid
steps.

## Screens

- **Sign-in:** hold the fingerprint to sign in. The mission is shown, not chosen.
- **Body:** the 3D body in the middle, every body system on the left, and the problems ranked worst first on the
  right. The body uses a halftone style: a black silhouette with blue organs and cyan dots.
- **Organ detail:** click a problem card or the body itself. Each organ shows its current state, what could go wrong
  on this mission, and what to do about it, with every check measured against a healthy range and its source.
- **Collect:** every reading, grouped by the device that sends it. Click a reading to see the record that device sends.
- **Radiation and space weather:** live solar proton levels, the dose so far against the NASA career limit, and a storm alert.
- **Check in and medical history:** the astronaut's own daily checks (blood pressure, blood sugar, temperature, mood,
  symptoms), and the mission's medical record.
- **Vitaly:** say "Hey Vitaly" or press **T**. The screen switches to a liquid halftone orb: blue when calm, amber
  for a warning, red for an emergency.
- **Where this data comes from:** a panel (footer link, or press **S**) that shows where every number comes from,
  with a link to check each live value yourself.

## The data

### Where it comes from

| Source | What it gives | How VITALIS uses it |
|---|---|---|
| NOAA SWPC (GOES-18 satellite) | Proton flux, every 5 minutes | Space weather level; a storm starts at 10 pfu |
| NASA DONKI (CCMC) | Measured solar particle events and flares | The storm in the demo replays a real event |
| JPL Horizons | Earth to Mars distance | The real comms delay for every message to Earth |
| Google Health API | A real Fitbit's heart rate, HRV, blood oxygen, breathing, sleep, steps and workouts | Replaces the simulated watch readings when a watch is connected |

### Devices

| Where | Device | Readings |
|---|---|---|
| Worn | Smartwatch (Apple Watch Ultra class) | Heart rate, HRV, blood oxygen, breathing, wrist temperature, heart rhythm, sleep, exercise, noise |
| Worn | Blood sugar patch (Dexcom class) | Blood sugar, every 5 minutes |
| Med bay kit | Blood pressure cuff, handheld ultrasound, radiation badge | Blood pressure, optic nerve and heart ultrasound, thigh muscle, radiation dose |
| Ship | Crew tablet, exercise machines, cabin air monitor | Reaction time, mood, hearing, balance; lifting load; CO₂, oxygen, pressure, temperature, smoke |

Every device is modelled on hardware that flies or has flown. In the demo the crew readings are simulated, and the
app says so on screen. Each simulated device sends records in the same format the real device uses (Apple HealthKit
samples for the watch and cuff, Dexcom records for the blood sugar patch), so real hardware can plug in without
changing the rest of the system.

### Real, published, or an assumption

Every number in VITALIS is one of three kinds, and they are never mixed:

| Kind | Meaning | Examples |
|---|---|---|
| Live | Fetched from a public API while the app runs | JPL Horizons, NASA DONKI, NOAA SWPC |
| Published | A value from a NASA document or a peer-reviewed paper, with its citation in the code | 600 mSv career limit (NASA-STD-3001), Mars dose rates (Curiosity RAD), bone loss per month (NASA HRP) |
| Assumption | Our own modelling choice, marked ASSUMPTION in the code | Storm dose multiplier, exercise protection, how fast SANS grows |

You can check this yourself in `backend/app/provenance.py`, through the "Where this data comes from" panel, or by
running `python verify_sources.py` in `backend/`, which calls every live API and prints pass or fail.

### How the readings are analysed

The heart, muscles and radiation run a five-step pipeline (`backend/app/analysis/`):

1. **Raw signal and quality:** noisy or missing readings are flagged and left out.
2. **Derived measures:** for example heart-rate recovery, arterial stiffness from pulse transit time, and training load against recovery.
3. **Personal baseline:** each value is compared with the astronaut's own preflight value, not a population average.
4. **Confidence:** how much each number can be trusted, and why.
5. **Risk and action:** a severity from 0 to 1 that drives the ranking, the alerts and the suggested countermeasures.

The other systems (bones, eyes, lungs, sleep, ears) use simpler models. The full method, with every formula and
source, is in [`backend/DATA.md`](backend/DATA.md).

## Vitaly, the AI assistant

- **Watchdog:** fixed rules check the latest readings every second: heart rate, blood oxygen, blood pressure, cabin
  pressure, oxygen, CO₂, smoke, noise and solar storms. A sudden emergency is caught in about 2 seconds.
- **Guides:** 33 spoken first-aid guides, such as chest pain, CPR, choking, bleeding, burns, a broken bone or a torn ACL.
  Vitaly reads one step at a time and waits for "next", "repeat", "back" or "stop". Each guide has a version for
  yourself and one for helping a crewmate.
- **Questions:** everyday questions ("How am I doing?", "When will Earth answer?") are answered from live data in a
  few milliseconds. Only unusual questions go to the AI model.
- **Injuries:** name any injury and the AI finds the body part (even through typos or mishearing), asks which side,
  turns that bone or muscle red on the 3D body, and reads the first-aid steps.
- **Voice:** Deepgram live speech-to-text to listen, and Deepgram text-to-speech to talk. Without keys, the browser's
  own voice is used. Without any AI key or network, Vitaly answers from rules and live data.
- **Cost cap:** AI spending is added up and stops at a set limit (default $1).

The first-aid steps are standard first aid in plain words, written for this demo. They are not a reviewed medical procedure.

## How it is built

| Part | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), no build step |
| 3D | three.js, GLB models with custom halftone shaders |
| Backend | Python, FastAPI, REST plus one WebSocket for live readings |
| AI | OpenRouter (Google Gemini 3.1 Flash-Lite, Mistral Nemo as backup), called only from the backend so keys never reach the browser |
| Voice | Deepgram (Nova-3 speech-to-text, Flux text-to-speech), with the browser's Web Speech API as fallback |
| Hosting | Ubuntu server, nginx, systemd |

```
index.html            every screen
styles.css, styles/   styles
src/
  three/              3D body, organs, halftone look, injury highlights
  ui/                 screens and panels (body, detail, collect, radiation, Vitaly, ...)
  data/               backend client, with a fallback to built-in demo data
backend/app/
  sources/            JPL Horizons, NASA DONKI, NOAA SWPC, Google Health (with a cache fallback)
  devices/            the device catalog, simulated devices, native record formats
  analysis/           heart, muscles, radiation pipelines and health checks
  engine/             body model, organ severity, mission risk ranking, projections
  vitaly/             watchdog, guides, injuries, AI, voice
  hrp.py              NASA HRP hazards and risks, mapped to each organ
  constants.py        every number with its source, or marked ASSUMPTION
deploy/               server setup and update scripts
```

`plan.md` holds the contracts between the frontend and the backend, and `rules.md` holds the team's working rules.

## Run it locally

You need Python 3 and a recent Chrome.

```bash
./run.sh
```

This sets up the backend the first time, then starts the backend on port 8001 and the app on port 8000. Open
http://localhost:8000. The API docs are at http://localhost:8001/docs.

The app runs with no keys at all: live space data needs no key, and Vitaly falls back to rules and the browser's
voice. To turn on the extra features, fill in `backend/.env` (copied from `backend/.env.example`):

| Key | Turns on |
|---|---|
| `OPENROUTER_API_KEY` | Vitaly's AI answers and injury lookup |
| `DEEPGRAM_API_KEY` | Vitaly's voice and live speech-to-text |
| `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET` | A real Fitbit through the Google Health API |

### Demo controls

- Press **D** to open the director panel: switch the mission (Mars, Moon, ISS), move through mission days, and
  trigger events such as a radiation storm, a blood pressure spike, a cabin leak or a hard knock to the watch.
- Press **T** or say "Hey Vitaly" to talk to Vitaly.
- From the browser console: `vitalis.api.director('radiation_storm')`.

### Tests

```bash
cd backend
.venv/bin/python test_engine.py      # body model, events, countermeasures
.venv/bin/python test_analysis.py    # heart, muscles, radiation pipelines
.venv/bin/python test_devices.py     # device catalog and record formats
.venv/bin/python test_hrp.py         # NASA HRP mapping
.venv/bin/python test_vitaly.py      # Vitaly's rules and guides
.venv/bin/python verify_sources.py   # live API check (needs internet)
```

## What is real and what is simulated

- **Real today:** solar flares and storms from NASA, radiation levels from NOAA, the distance to Earth from NASA JPL,
  and a real Fitbit when one is connected.
- **Simulated:** the rest of the crew readings. Each record uses the same format the real device sends.
- **Next:** connect real devices. The rest of the system does not change.

VITALIS is a hackathon prototype, not a medical device. Nothing in it has been clinically reviewed.

## Team

**Kareem Muftee** 
**Zaid Khayyat** 

for NASA Space Apps
Challenge 2026.

## Credits

- Live data: [NASA DONKI](https://kauai.ccmc.gsfc.nasa.gov/DONKI/), [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/),
  [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
- Science: [NASA Human Research Program](https://www.nasa.gov/hrp/), NASA-STD-3001, Curiosity RAD, and the papers
  cited in [`backend/app/constants.py`](backend/app/constants.py) and [`backend/DATA.md`](backend/DATA.md)
- 3D models: see [`assets/models/CREDITS.md`](assets/models/CREDITS.md)
- Fingerprint artwork: see [`assets/fingerprints/CREDITS.md`](assets/fingerprints/CREDITS.md)
