# VITALIS backend

```
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```
Open http://localhost:8001/docs for every route. The frontend (python3 -m http.server 8000) connects automatically.

## How it fits together
- `app/sources/` JPL Horizons, NASA DONKI (CCMC DONKI-API), NOAA SWPC, with `data/cache/` fallback
- `app/missions.py` space environment by mission day (phase, gravity, dose, comms delay)
- `app/hrp.py` NASA HRP framework from the challenge resources (5 hazards, 17 risks)
- `app/devices/` simulated watch, blood sugar sensor, med bay kit (real devices plug in here)
- `app/engine/physiology.py` organ severity, mission risk ranking, countermeasures
- `app/triage.py`, `app/director.py`, `app/officer.py` alerts, demo events, rule-based answers
- `app/constants.py` every number with its source (or marked ASSUMPTION)

## Tests
```
python test_engine.py     # engine numbers, events, countermeasures
python test_hrp.py        # NASA framework mapping
python test_step2.py      # parsers + radiation math
python verify_sources.py  # live API check (needs internet), refreshes the cache
```

## Try it
```
curl -X POST localhost:8001/api/director/event -H 'content-type: application/json' -d '{"type":"radiation_storm"}'
curl localhost:8001/api/risks
```
