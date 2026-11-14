# VITALIS Plan

Single source of truth for what we are building, how the pieces connect, and who owns what.
If you change a contract in this file, say so in your commit message and tell your teammate.

## 1. The product

VITALIS is a "twin medical bay" for astronauts on a Mars mission. A stylized 3D twin of the
astronaut's body shows every organ system, driven by data from wearable devices. It flags
problems early, explains them in plain words, plays an animation of the fix, projects how the
body changes over the mission, and escalates serious issues to Earth with a real Mars comms delay.

Pitch line: "On Mars, the doctor is 20 minutes away. VITALIS makes every astronaut their own first responder."
Product angle: ready for real devices (smartwatch, blood sugar sensor, med bay kit). In the demo the
data is simulated, but it flows through the same device interface real hardware would use.

### 1.1 Core flow: risk-first, not click-anywhere

The user does NOT explore the body by clicking organs freely. The app tells them where to look:

1. The mission (Mars by default) + live device data produce a ranked list of the highest-risk
   organs/systems (e.g. 1. Bones, 2. Sleep & mind, 3. Heart). This "Risk Board" is the main screen,
   shown next to the 3D twin, with each risk's level in the blue scale.
2. The twin only highlights the ranked systems (glowing blue, darker = worse). The body itself is
   not a click target.
3. Clicking a risk card flies the camera into that organ/bone model and opens the detail view:
   - Current state: live value, usual range, trend, severity.
   - What could go wrong on THIS mission: specific risks, how likely, when in the mission, early signs.
   - What to do: ranked countermeasures + fix animation.
4. Back returns to the Risk Board. The ranking updates live as data and director events change.

Challenge: NASA Space Apps 2026, "Create Health Monitoring Software for Astronauts on Space Missions".
Submission deadline: Sunday Nov 15, 11:59 PM (submit early).

## 2. Current state (Sat Nov 14 morning)

Working prototype, vanilla JS, no build step, three.js from CDN via importmap.

- `index.html`: all screens in one file (sign-in, Body, Detail, Crew, Ask).
- `src/`: the old single `app.js` was split into modules by owner (section 4) with no behavior change.
  3D body = FBX + custom shader with cyan highlight and "glass" mode. Organ SVG drawings, crew view,
  scripted Ask answers.
- `styles.css`: all styles.
- `assets/models/body.glb` (580 KB, meshopt): the body model. Source FBX kept locally in `assets/models/source/` (gitignored).
- All data is hardcoded in `src/data/mock.js`. No backend yet.
- Run it: `python3 -m http.server 8000` then open http://localhost:8000

Gaps vs. the plan: no Risk Board (body is currently entered by clicking spots), no backend, no live data, no bones system, no timeline projection,
no fix animations, no triage queue, no voice, no halftone style, no Engineer Mode, no director panel.

Added Sat afternoon to cover the challenge text directly (branch `feature/challenge-gaps`):
- Self check-in drawer (`src/ui/checkin.js`): astronaut enters blood pressure, blood sugar,
  temperature, mood and symptoms by hand. Instant OK / Watch / Act result with a plain next step.
  "Act" results say the crew doctor is told and a copy goes to Earth with the comms delay.
- How to measure + why it matters in space + source, for every check-in field and every body system
  (`src/data/health-rules.js`, also shown in the Detail view).
- Today panel on the Body view (`src/ui/today.js`): timed health routine with a "Due" item,
  a reminder prompt after sign-in, latest self readings with status dots, and a day streak (gamification).
- Status colors: green / amber / red dots for OK / Watch / Act (see 5.2).
- Crew view now shows NASA HRP's five hazards: radiation, isolation, distance, gravity, cabin air (CO₂).

## 3. Stack decisions

- Frontend: stay on vanilla JS + ES modules + three.js (CDN importmap). No React migration,
  no bundler. It already works and a rewrite would burn the weekend.
- Backend: Python FastAPI in `backend/`, served on port 8001. REST + one WebSocket.
- AI medical officer: browser Web Speech API (listen + speak, push-to-talk, text fallback)
  plus an LLM API called only from the backend so the API key never reaches the browser.
- 3D models: `.glb` preferred (smaller, faster than FBX). The body is now `body.glb` too (converted from `malebody.fbx`, all 153,670 triangles kept).

## 4. Target folder structure and ownership

```
index.html              SHARED  (screens, script tags)
styles.css              SHARED  (existing styles, do not reorganize)
styles/
  three.css             3D owner   (create when needed, link in index.html)
  data-ui.css           Backend owner (risk panel, mission picker, history, spot labels)
src/
  main.js               SHARED  (boot + main loop only)
  nav.js                SHARED  (switching views)
  state.js              SHARED  (current view, open system)
  util.js               SHARED  ($, $$, ease)
  signin.js             SHARED  (fingerprint screen, rarely touched)
  three/                3D OWNER
    scene.js            renderer, camera, lights, resize, drag, camera flights
    body.js             body model, skin shader, regions, raycast anchors
    organ-drawings.js   organ drawings in the Detail view + their motion
    api.js              the ONLY functions other code calls (see contract 5.4)
    (add: organs.js, effects.js, fixes.js as you build them)
  ui/                   BACKEND OWNER (views that render data)
    body-view.js  detail.js  crew.js  ask.js
    risk-board.js         risk panel + mission picker + mission-day slider
    history.js            medical history drawer
    (add: triage.js  engineer.js  director.js  voice.js)
  data/                 BACKEND OWNER
    mock.js             demo data (SYS, CREW, histories)
    (add: client.js     REST + WebSocket client, falls back to mock.js)
assets/
  models/               3D OWNER  (.glb files + manifest.json + CREDITS.md)
backend/                BACKEND OWNER
  app/main.py           FastAPI app, routes, WebSocket
  app/devices/          device adapters (watch, cgm, medbay) + simulator
  app/engine/           physiology engine (per organ) + projections
  app/triage.py         triage levels + Earth comms-delay queue
  app/director.py       demo events
  app/officer.py        LLM proxy for the medical officer
  requirements.txt
  .env.example
plan.md  rules.md       SHARED
```

Ownership: 3D owner (partner) = 3D models, `src/three/`, `assets/models/`, `styles/three.css`.
Backend owner (Zaid) = `backend/`, `src/data/`, `src/ui/`, `styles/data-ui.css`.

## 5. Contracts (the glue between our work)

Build against these and we can work in parallel without touching each other's files.

### 5.1 Organ IDs (used everywhere: data, 3D, UI)

| id        | UI label      | Depth  | Notes                                   |
|-----------|---------------|--------|-----------------------------------------|
| `heart`   | Heart         | DEEP   | beats at live HR, fluid shift, cardio   |
| `bones`   | Bones         | DEEP   | density loss over mission days (NEW)    |
| `sleep`   | Sleep & mind  | DEEP   | brain: sleep, mood, reaction test       |
| `lungs`   | Lungs         | light  | existing, tooltip + simple state        |
| `eyes`    | Eyes          | DEEP   | SANS: NASA's #1 spaceflight health risk (NEW, needs a 3D region) |
| `muscles` | Muscles       | light  | existing, tooltip + simple state        |

DEEP = live state + projection + fix animation. Light = status + info only.
Do not rename existing IDs. New organs need a new row here first.

### 5.2 Severity and the blue scale

- `severity` is a float 0 to 1. 0 = healthy, 1 = critical.
- Color: healthy = pale bright cyan, severe = deep saturated navy.
  Lerp between `#7FE9FF` (0) and `#0A1F6B` (1).
- Halftone dots get denser and pulse faster as severity rises, so dark blue stays visible on black.
- Status bands for UI text: 0 to 0.33 "OK", 0.33 to 0.66 "Watch", 0.66 to 1 "Act".
- UI status color (text, dots, borders; NOT the 3D organ blue): OK = `--green`, Watch = `--amber`,
  Act = `--red`. CSS classes `.dot.ok / .watch / .act`, `.spot.act`. Body-system `state` may be
  `ok`, `watch` or `act`. The blue scale stays for the 3D twin; color makes status readable at a glance.

### 5.3 Data shapes (backend -> frontend)

Vital (one reading from one device):
```json
{ "device": "watch", "metric": "heart_rate", "value": 64, "unit": "bpm", "ts": 1763136000 }
```
Devices: `watch` (heart_rate, hrv, spo2, skin_temp, sleep_hours, steps),
`cgm` (glucose mg/dL), `medbay` (bp_sys, bp_dia, bone_density_pct, reaction_ms, mood_1to5).
Added: `self` (astronaut check-in typed by hand: bp_sys, bp_dia, glucose, body_temp, mood_1to5, symptoms[]).
Same Vital shape, e.g. `{ "device": "self", "metric": "body_temp", "value": 37.2, "unit": "C", "ts": ... }`.
Blood sugar, blood pressure, temperature and mood have no organ: they show in the Body view's
Today panel (`VITALS` in `src/data/mock.js`), judged by `JUDGE` in `src/data/health-rules.js`.

OrganState:
```json
{
  "id": "bones",
  "rank": 1,
  "hrp_risks": ["Spaceflight-Induced Bone Changes", "Injury from Dynamic Loads"],
  "hazards": ["Gravity fields"],
  "mission_risk": 0.71,
  "severity": 0.48,
  "status": "Watch",
  "level": "mild",
  "value": 94.2, "unit": "% of preflight density",
  "usual": "97-100",
  "note": "Hip and spine density down 5.8% since launch.",
  "drivers": ["microgravity", "missed exercise days 176-180"],
  "projection": [{ "day": 184, "severity": 0.48 }, { "day": 240, "severity": 0.61 }],
  "countermeasures": [
    { "id": "ared_60", "label": "60 min resistive exercise", "effect": -0.12, "minutes": 60 }
  ],
  "what_could_go_wrong": [
    { "title": "Hip or spine fracture after landing", "likelihood": "medium", "by_day": 240,
      "signs": ["density below 92%", "back pain under load"] }
  ]
}
```
- `hrp_risks` = official NASA HRP risk names this organ covers; `hazards` = which of NASA's 5 hazards drive it.
  Both come from `backend/app/hrp.py`. Countermeasures may carry `research` = the real HRP study behind them.
- `level` = `low` | `mild` | `extreme`, the word the risk panel shows. Always from the backend.
- `severity` = how bad it is right now (drives the blue color).
- `mission_risk` = severity combined with how much THIS mission's hazards threaten that organ over the
  remaining days (0 to 1). The Risk Board sorts by `mission_risk`, highest first. `rank` = 1-based position.

MissionState:
```json
{
  "mission": "mars", "crew_id": "03", "day": 184, "arrival_day": 240,
  "comms_delay_min": 12.4,
  "radiation_msv": 339, "radiation_career_limit_msv": 600, "radiation_event_limit_msv": 250,
  "risk_ranking": ["bones", "sleep", "eyes", "heart", "muscles", "lungs"],
  "organs": { "heart": {}, "bones": {}, "sleep": {}, "eyes": {}, "lungs": {}, "muscles": {} }
}
```
`risk_ranking` = organ IDs sorted by `mission_risk`. The Risk Board shows the top 3 prominently.
Radiation: cruise dose rate 1.84 mSv/day, surface 0.64 mSv/day (Curiosity RAD). Limits from NASA-STD-3001
(600 mSv career, 250 mSv per solar particle event).

### 5.4 3D API (`src/three/api.js`) - the only 3D functions the rest of the app calls

```js
initTwin()                               // load scene + body (renders into #stage3d)
renderTwin(now, pulse)                   // called every frame by main.js
setHoverOrgan(organId)                   // highlight while hovering a Risk Board card (null clears)
showRisks(organIds)                      // highlight only these ranked systems on the body (glow, blue scale)
setOrganSeverity(organId, severity)      // 0..1, drives blue + halftone density
focusOrgan(organId)                      // camera flies in, organ glows from inside
resetView(instant)                       // back to full body
playFix(organId, fixId)                  // returns a Promise that resolves when the animation ends
setHeartRate(bpm)                        // heart beats in sync with live data
```
Organs open from BOTH the risk panel and the body spots; both call `openSystem(id)`, which calls
`focusOrgan`. `REGIONS` in `body.js` needs an entry per organ id or its spot is hidden.
3D owner can change anything inside `src/three/` as long as these keep working.

### 5.5 Backend API (port 8001, CORS open for localhost:8000)

| Method | Path                      | Returns / does                                       |
|--------|---------------------------|------------------------------------------------------|
| GET    | `/api/health`             | `{ "ok": true }`                                     |
| GET    | `/api/state`              | MissionState                                         |
| GET    | `/api/state?day=220`      | MissionState projected to that day (timeline scrub)  |
| GET    | `/api/risks?mission=mars` | ranked OrganState list, highest `mission_risk` first (Risk Board) |
| WS     | `/ws`                     | pushes `{ "type": "vital", ... }` and `{ "type": "state", ... }` |
| POST   | `/api/countermeasure`     | body `{ organ, id }` -> updated OrganState           |
| GET    | `/api/history`            | medical history: mission milestones, events, countermeasures, escalations, preflight baselines |
| GET    | `/api/triage`             | list of alerts with level + Earth delay countdown    |
| POST   | `/api/director/event`     | body `{ type }`: `radiation_storm`, `bad_sleep_week`, `bp_spike`, `skipped_exercise`, `reset` |
| POST   | `/api/ask`                | body `{ question }` -> `{ answer, sources, engine }` (Claude/OpenAI if key set, else rules) |
| POST   | `/api/mission`            | body `{ mission }`: `mars`, `moon`, `iss` (switch the live mission) |
| GET    | `/api/organs/{id}`        | one OrganState                                        |
| GET    | `/api/missions`           | mission presets (gravity, dose rate, arrival/end day) |
| GET    | `/api/environment?mission=&day=` | phase, gravity, dose rate, total dose, % of limit, microgravity months, comms delay |
| GET    | `/api/space-weather`      | live NOAA proton flux (`now`) + recent NASA DONKI solar particle events and flares |
| GET    | `/api/comms`              | one-way + round-trip Earth delay (JPL Horizons)       |
| GET    | `/api/vitals`             | latest reading per metric + device list               |
| GET    | `/api/hrp`                | NASA HRP framework: 5 hazards, 17 risks, organ + mission mapping, coverage, research studies |
| GET    | `/api/sources`            | live / cache / fallback status of every data source (Engineer Mode) |
| POST   | `/api/sources/refresh`    | re-fetch DONKI + Horizons                            |

WebSocket `/ws` messages: `{ "type": "vital", device, metric, value, unit, ts }` every second per metric,
`{ "type": "state", "state": MissionState }` every 2 seconds and on connect.

Frontend access: `src/data/client.js` exports `api` (one function per endpoint), `live` (latest state,
risks, vitals, triage), `onData(fn)` and `missionInfo()`. If the backend is off it falls back to `mock.js`.
In the browser console: `vitalis.api.director('radiation_storm')`.

### 5.7 External data sources (backend/app/sources, numbers in backend/app/constants.py)

| Source | Used for | Fallback |
|--------|----------|----------|
| NASA DONKI SEP + FLR (CCMC DONKI-API, moved there 2026-09-30, no key) | `radiation_storm` replays a real solar particle event | `backend/data/cache/`, then 4 seeded real events |
| JPL Horizons API (quantity 21, light time, 1 row per mission day) | Earth comms delay for triage | cache, then circular-orbit model |
| NOAA SWPC GOES integral protons (no key) | is a solar proton event happening right now (>=10 pfu at >=10 MeV) | cache |
| NASA HRP bone risk (1-1.5%/month) | bone model | constant |
| Curiosity RAD (1.84 / 0.64 mSv/day) | radiation dose | constant |
| NASA-STD-3001 (600 mSv career, 250 mSv per event) | limits | constant |
| Claude or OpenAI API | AI medical officer | rule-based answers from engine state |
Values marked ASSUMPTION in the code are our modeling choices, not published numbers. Say so if judges ask.

### 5.6 Model manifest (`assets/models/manifest.json`)

```json
{
  "body":  { "file": "body.glb", "scale": 1.0 },
  "organs": {
    "heart": { "file": "heart.glb", "anchor": [0.09, 0.735], "scale": 1.0 },
    "bones": { "file": "skeleton.glb", "anchor": [0, 0.5], "scale": 1.0 }
  }
}
```
`anchor` = [x from center line, height fraction from feet], same system as `REGIONS` in `src/three/body.js`.

### 5.8 NASA challenge resources and how VITALIS uses them

The challenge's Resources tab gives 5 links (no datasets). All are built into `backend/app/hrp.py`.

| Resource | What we take from it | Where it shows up |
|----------|----------------------|-------------------|
| HRP 5 Hazards (nasa.gov/hrp/hazards) | radiation, isolation, distance, gravity, closed environment | every organ's `hazards`; pitch backbone |
| HRP 17 Risks (nasa.gov/hrp/risks) | official risk names; SANS = NASA's leading risk | every organ's `hrp_risks`; new `eyes` system; 12/17 risks covered (incl. radiation + comms at mission level) |
| Ongoing HRP research | Thigh Cuff, B-Complex, ARCHeR wrist actigraphy | eye countermeasures; ARCHeR = proof wearables fly (pitch) |
| CSA radiation monitoring | neutrons ~30% of ISS radiation; CANS spectrometer | future dosimeter device adapter |
| CSA why science in space | longer missions = more weightlessness, radiation, isolation, delay, less care | pitch problem statement |

Pitch line: "NASA's Artemis II crew already wears a wrist device (ARCHeR). VITALIS turns that kind of data into decisions."

## 6. Milestones

### Phase 0: foundation (Zaid, ASAP, before partner edits code)
- [x] Split `app.js` into the `src/` modules above with NO behavior change
- [x] Move hardcoded data into `src/data/mock.js`
- [x] Wrap current 3D code behind `src/three/api.js` (contract functions stubbed with TODO(3d))
- [x] Add `.env`, `.venv/`, `__pycache__/`, `node_modules/` to `.gitignore`
- [ ] Push to `main`. Partner pulls before writing any code.

### Phase 1: parallel build (Sat afternoon)
3D owner:
- [ ] Find + import organ models (heart, skeleton, brain, lungs, muscles), convert to .glb, fill manifest + CREDITS.md
- [ ] Black silhouette body with halftone rim (`effects.js`)
- [ ] `showRisks(ids)`: ranked systems glow on the body in the blue severity scale
- [x] Eyes + bones have `REGIONS` entries so their spots land on the body (placeholder positions, refine them)
- [ ] Eyes: real organ model + Thigh Cuff fix animation; bones: skeleton model
- [ ] Organs glow from inside, `setOrganSeverity` maps to the blue scale
- [ ] `focusOrgan` zoom with the inside glow

Backend owner:
- [x] Backend, built in layers: see 6.1 (all routes the frontend uses are live; tests: test_engine.py, test_hrp.py, test_step2.py, verify_sources.py)
- [x] `src/data/client.js` with mock fallback; Detail, spots, Crew radiation and Ask use live data
- [x] Risk panel (`src/ui/risk-board.js`): ranked cards with Low/Mild/Extreme + what it could lead to, click -> detail
- [x] Mission picker (Mars / Moon / ISS) + mission-day slider that previews the body later in the mission
- [x] Medical history drawer (`src/ui/history.js`) from `/api/history`
- [x] Detail view sections: Current state / What could go wrong / What to do
- [x] Body spots stay clickable and cover all six systems
- [ ] `src/data/client.js` with fallback to mock

### 6.1 Backend build steps (one layer at a time, test before moving on)

The full first draft lives in `_old/backend_full/` (git-ignored) as a reference to copy from.
Routes never change between steps, only what is behind them, so the frontend keeps working.

| Step | Layer | Adds | Test |
|------|-------|------|------|
| 1 [x] | Foundation | FastAPI, CORS, `/api/health`, `/api/state`, `/api/risks`, `/api/organs/{id}` from a fixed fixture | `curl :8001/api/risks`, open `:8001/docs` |
| 2 [x] | Space environment | `constants.py`, `missions.py` (phase, gravity, dose, comms by day), JPL Horizons, NASA DONKI, NOAA SWPC, JSON cache; `/api/missions`, `/api/environment`, `/api/comms`, `/api/space-weather`, `/api/sources` | `python test_step2.py`, `/api/sources` says live or cache |
| 2b [x] | NASA framework | `hrp.py` (5 hazards, 17 risks, organ + mission mapping, research), eyes added, `/api/hrp` | `python test_hrp.py` |
| 3 [x] | Devices | `DeviceAdapter` interface + simulated watch, CGM, med bay; `/api/vitals` | readings change on each call |
| 4 [x] | Engine | physiology + risk ranking replace the fixture, using the step 2 environment and `hrp.py` tags; includes the eyes (SANS) model; `?day=`, `?mission=` | ranking + values match the fixture at day 184; day 240 differs |
| 5 [x] | Live | background sim loop + `/ws` (vitals every 1 s, state every 2 s) | frontend numbers move on their own |
| 6 [x] | Actions | `/api/countermeasure`, `/api/director/event` (storm replays a real DONKI event), `/api/mission` | event raises severity, countermeasure lowers it |
| 7 [x] | Triage | green/amber/red queue, Earth delay countdown, `/api/triage` | storm creates a red alert that gets a reply |
| 8 [~] | Officer | `/api/ask` rule-based from engine state (done); Claude/OpenAI later | answer cites the crew's numbers |

### Phase 2: features (Sat night)
- [ ] Timeline scrub (cruise to arrival) using `/api/state?day=`
- [ ] Countermeasures + `playFix` for bones (exercise) and heart (fluid shift) [3D] wired to `/api/countermeasure` [backend]
- [ ] Triage queue with Mars delay countdown
- [ ] Director panel (key `D`)
- [ ] Bones added as a new organ in UI and 3D

### Phase 3: wow + polish (Sun morning)
- [ ] Voice medical officer (push-to-talk, text fallback, `/api/ask`)
- [ ] Engineer Mode (key `E`): raw streams, engine inputs/outputs, triage log
- [ ] Third fix animation (radiation shield)
- [ ] Record a backup demo video
- [ ] Pitch deck + 3 rehearsals, submit to NASA

## 7. Demo flow (build toward this)

1. Fingerprint sign-in -> Alex Reyes, Commander, Mars mission day 184.
2. Risk Board: "Mars, day 184. Top risks: 1. Bones, 2. Sleep & mind, 3. Heart." Only those glow on the twin.
3. Director triggers `skipped_exercise` + `bad_sleep_week`. Bones and sleep darken, ranking reshuffles live.
4. Click the Bones card -> camera flies into the skeleton. Detail shows current state, what could go
   wrong on this mission (fracture risk by landing), and what to do.
5. Pick "60 min resistive exercise" -> fix animation, blue lightens, projection recovers.
6. Scrub timeline to arrival (day 240) with and without the fix.
7. Director triggers `radiation_storm` -> triage goes red, alert queues to Earth with the delay countdown.
8. Hold mic: "Why are my bones flagged?" -> officer answers out loud from the twin's data.
9. Press `E`: Engineer Mode shows the pipeline. Close with the wearable product vision.

## 8. Out of scope for the weekend

Real device integrations, user accounts, a database, multiple missions beyond Mars,
mobile layout, React migration.
