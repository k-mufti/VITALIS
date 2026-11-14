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

Challenge: NASA Space Apps 2026, "Create Health Monitoring Software for Astronauts on Space Missions".
Submission deadline: Sunday Nov 15, 11:59 PM (submit early).

## 2. Current state (Sat Nov 14 morning)

Working prototype, vanilla JS, no build step, three.js from CDN via importmap.

- `index.html`: all screens in one file (sign-in, Body, Detail, Crew, Ask).
- `src/`: the old single `app.js` was split into modules by owner (section 4) with no behavior change.
  3D body = FBX + custom shader with cyan highlight and "glass" mode. Organ SVG drawings, crew view,
  scripted Ask answers.
- `styles.css`: all styles.
- `malebody.fbx` (5.3 MB): the body model.
- All data is hardcoded in `src/data/mock.js`. No backend yet.
- Run it: `python3 -m http.server 8000` then open http://localhost:8000

Gaps vs. the plan: no backend, no live data, no bones system, no timeline projection,
no fix animations, no triage queue, no voice, no halftone style, no Engineer Mode, no director panel.

## 3. Stack decisions

- Frontend: stay on vanilla JS + ES modules + three.js (CDN importmap). No React migration,
  no bundler. It already works and a rewrite would burn the weekend.
- Backend: Python FastAPI in `backend/`, served on port 8001. REST + one WebSocket.
- AI medical officer: browser Web Speech API (listen + speak, push-to-talk, text fallback)
  plus an LLM API called only from the backend so the API key never reaches the browser.
- 3D models: `.glb` preferred (smaller, faster than FBX). Keep `malebody.fbx` until a replacement is in.

## 4. Target folder structure and ownership

```
index.html              SHARED  (screens, script tags)
styles.css              SHARED  (existing styles, do not reorganize)
styles/
  three.css             3D owner   (create when needed, link in index.html)
  data-ui.css           Backend owner
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
    (add: timeline.js  triage.js  engineer.js  director.js  voice.js)
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
| `muscles` | Muscles       | light  | existing, tooltip + simple state        |

DEEP = live state + projection + fix animation. Light = status + info only.
Do not rename existing IDs. New organs need a new row here first.

### 5.2 Severity and the blue scale

- `severity` is a float 0 to 1. 0 = healthy, 1 = critical.
- Color: healthy = pale bright cyan, severe = deep saturated navy.
  Lerp between `#7FE9FF` (0) and `#0A1F6B` (1).
- Halftone dots get denser and pulse faster as severity rises, so dark blue stays visible on black.
- Status bands for UI text: 0 to 0.33 "OK", 0.33 to 0.66 "Watch", 0.66 to 1 "Act".

### 5.3 Data shapes (backend -> frontend)

Vital (one reading from one device):
```json
{ "device": "watch", "metric": "heart_rate", "value": 64, "unit": "bpm", "ts": 1763136000 }
```
Devices: `watch` (heart_rate, hrv, spo2, skin_temp, sleep_hours, steps),
`cgm` (glucose mg/dL), `medbay` (bp_sys, bp_dia, bone_density_pct, reaction_ms, mood_1to5).

OrganState:
```json
{
  "id": "bones",
  "severity": 0.48,
  "status": "Watch",
  "value": 94.2, "unit": "% of preflight density",
  "usual": "97-100",
  "note": "Hip and spine density down 5.8% since launch.",
  "drivers": ["microgravity", "missed exercise days 176-180"],
  "projection": [{ "day": 184, "severity": 0.48 }, { "day": 240, "severity": 0.61 }],
  "countermeasures": [
    { "id": "ared_60", "label": "60 min resistive exercise", "effect": -0.12, "minutes": 60 }
  ]
}
```

MissionState:
```json
{
  "mission": "mars", "crew_id": "03", "day": 184, "arrival_day": 240,
  "comms_delay_min": 12.4, "radiation_msv": 148, "radiation_limit_msv": 200,
  "organs": { "heart": {}, "bones": {}, "sleep": {}, "lungs": {}, "muscles": {} }
}
```

### 5.4 3D API (`src/three/api.js`) - the only 3D functions the rest of the app calls

```js
initTwin()                               // load scene + body (renders into #stage3d)
renderTwin(now, pulse)                   // called every frame by main.js
setHoverOrgan(organId)                   // highlight while hovering a spot (null clears)
setOrganSeverity(organId, severity)      // 0..1, drives blue + halftone density
focusOrgan(organId)                      // camera flies in, organ glows from inside
resetView(instant)                       // back to full body
playFix(organId, fixId)                  // returns a Promise that resolves when the animation ends
setHeartRate(bpm)                        // heart beats in sync with live data
onOrganClick(callback)                   // callback(organId)
```
3D owner can change anything inside `src/three/` as long as these keep working.

### 5.5 Backend API (port 8001, CORS open for localhost:8000)

| Method | Path                      | Returns / does                                       |
|--------|---------------------------|------------------------------------------------------|
| GET    | `/api/health`             | `{ "ok": true }`                                     |
| GET    | `/api/state`              | MissionState                                         |
| GET    | `/api/state?day=220`      | MissionState projected to that day (timeline scrub)  |
| WS     | `/ws`                     | pushes `{ "type": "vital", ... }` and `{ "type": "state", ... }` |
| POST   | `/api/countermeasure`     | body `{ organ, id }` -> updated OrganState           |
| GET    | `/api/triage`             | list of alerts with level + Earth delay countdown    |
| POST   | `/api/director/event`     | body `{ type }`: `radiation_storm`, `bad_sleep_week`, `bp_spike`, `skipped_exercise`, `reset` |
| POST   | `/api/ask`                | body `{ question }` -> `{ answer, sources }`         |

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
- [ ] Organs glow from inside, `setOrganSeverity` maps to the blue scale
- [ ] `focusOrgan` zoom with the inside glow

Backend owner:
- [ ] FastAPI skeleton, `/api/health`, `/api/state`, CORS
- [ ] Device adapters + simulator streaming vitals over `/ws`
- [ ] Physiology engine for heart, bones, sleep (rates from NASA HRP, cite in code comments)
- [ ] `src/data/client.js` with fallback to mock

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
2. Body view: devices "connected", organs glowing pale blue.
3. Director triggers `skipped_exercise` + `bad_sleep_week`. Bones and sleep darken.
4. Click bones -> camera flies in, organ glows, panel explains the risk and the fix.
5. Pick "60 min resistive exercise" -> fix animation, blue lightens, projection recovers.
6. Scrub timeline to arrival (day 240) with and without the fix.
7. Director triggers `radiation_storm` -> triage goes red, alert queues to Earth with the delay countdown.
8. Hold mic: "Why are my bones flagged?" -> officer answers out loud from the twin's data.
9. Press `E`: Engineer Mode shows the pipeline. Close with the wearable product vision.

## 8. Out of scope for the weekend

Real device integrations, user accounts, a database, multiple missions beyond Mars,
mobile layout, React migration.
