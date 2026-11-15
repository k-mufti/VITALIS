"""Offline checks for the real watch (Fitbit through the Google Health API): sign-in, tokens,
parsing, freshness, and layering Director events on real readings. A fake Google answers; no network
and no account needed. Run: python test_fitbit.py"""
import asyncio
import datetime as dt
import json
import os
import tempfile
import time
import urllib.parse
from pathlib import Path

import httpx

from app import director
from app.devices.simulated import DEVICES
from app.sources import googlehealth as gh
from app.state import sim

os.environ.update(GOOGLE_HEALTH_CLIENT_ID="test-client-id", GOOGLE_HEALTH_CLIENT_SECRET="TOPSECRETVALUE",
                  FITBIT_DEVICE_NAME="Fitbit Versa 4")
gh.TOKEN_FILE = Path(tempfile.mkdtemp()) / "fitbit_tokens.json"
iso = lambda t: dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731


def midnight():
    return dt.datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


def payloads(now, hr_age_s=180, hr_bpm=76):
    """What Google's list endpoint returns for each data type (shapes from the API reference)."""
    day = dt.datetime.fromtimestamp(now - 86400, dt.timezone.utc)
    date = {"year": day.year, "month": day.month, "day": day.day}
    src = {"device": {"displayName": "Fitbit Versa 4", "formFactor": "WATCH"}}
    since = midnight()
    mid = since + (now - since) / 2                       # some time today, whatever time the test runs
    iv = lambda a, b: {"startTime": iso(a), "endTime": iso(b)}  # noqa: E731
    return {
        "steps": [{"steps": {"interval": iv(mid + 60, mid + 120), "count": "1500"}},
                  {"steps": {"interval": iv(mid, mid + 60), "count": "3000"}},
                  {"steps": {"interval": iv(since - 7200, since - 7140), "count": "9999"}}],      # yesterday: not counted
        "exercise": [{"exercise": {"interval": iv(mid, mid + 1800), "activeDuration": "1500s", "exerciseType": "RUNNING",
                                   "metricsSummary": {"averageHeartRateBeatsPerMinute": "139"}}},
                     {"exercise": {"interval": iv(since - 86400, since - 84000), "activeDuration": "2400s",
                                   "metricsSummary": {"averageHeartRateBeatsPerMinute": "150"}}}],   # yesterday's run
        "daily-sleep-temperature-derivations": [{"dailySleepTemperatureDerivations": {"date": date, "nightlyTemperatureCelsius": 33.4,
                                                                                      "baselineTemperatureCelsius": 33.1}}],
        "heart-rate": [{"dataSource": src, "heartRate": {"sampleTime": {"physicalTime": iso(now - hr_age_s - 60)}, "beatsPerMinute": "70"}},
                       {"dataSource": src, "heartRate": {"sampleTime": {"physicalTime": iso(now - hr_age_s)}, "beatsPerMinute": str(hr_bpm)}},
                       {"heartRate": {"sampleTime": {"physicalTime": iso(now - hr_age_s - 120)}, "beatsPerMinute": "999"}}],  # impossible: dropped
        "heart-rate-variability": [{"heartRateVariability": {"sampleTime": {"physicalTime": iso(now - 6 * 3600)},
                                                             "rootMeanSquareOfSuccessiveDifferencesMilliseconds": 48.2}}],
        "oxygen-saturation": [{"oxygenSaturation": {"sampleTime": {"physicalTime": iso(now - 7 * 3600)}, "percentage": 96.4}}],
        "daily-respiratory-rate": [{"dailyRespiratoryRate": {"date": date, "breathsPerMinute": 14.6}}],
        "sleep": [{"sleep": {"interval": {"startTime": iso(now - 14 * 3600), "endTime": iso(now - 6 * 3600)}, "summary": {"minutesAsleep": "412"}}}],
    }


def fake_google(now, hr_age_s=180, hr_bpm=76, fail=(), only=None):
    calls = {"token": [], "api": []}
    data = payloads(now, hr_age_s, hr_bpm)
    if only is not None:
        data.update(only)

    def handler(request):
        url = request.url
        if url.host == "oauth2.googleapis.com":
            form = dict(urllib.parse.parse_qsl(request.content.decode()))
            calls["token"].append(form)
            if form["grant_type"] == "authorization_code":
                if form["code"] != "good-code":
                    return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Bad code"})
                return httpx.Response(200, json={"access_token": "ACCESSVALUE1", "expires_in": 3599, "refresh_token": "REFRESHVALUE", "scope": "x"})
            if form["refresh_token"] != "REFRESHVALUE":
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "ACCESSVALUE2", "expires_in": 3599})
        kind = url.path.split("/dataTypes/")[1].split("/")[0]
        calls["api"].append((kind, dict(url.params), request.headers.get("authorization")))
        if kind in fail:
            return httpx.Response(403, json={"error": {"message": "no scope"}})
        return httpx.Response(200, json={"dataPoints": data.get(kind, [])})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


async def main():
    now = time.time()

    # --- parsing ---
    p = payloads(now)
    rows, device = gh.parse_heart_rate(p["heart-rate"])
    assert len(rows) == 2 and rows[-1][1] == 76.0 and device == "Fitbit Versa 4", rows
    assert gh.parse_sample(p["heart-rate-variability"], "heartRateVariability", "rootMeanSquareOfSuccessiveDifferencesMilliseconds", 1, 300)[0] == 48.2
    assert gh.parse_daily(p["daily-respiratory-rate"], "dailyRespiratoryRate", "breathsPerMinute")[0] == 14.6
    assert gh.parse_sleep(p["sleep"])[0] == round(412 / 60, 2)
    assert gh.parse_heart_rate([]) == ([], None) and gh.parse_sleep([{"sleep": {}}]) is None and gh.parse_daily([{"x": 1}], "y", "z") is None
    assert abs(gh.parse_time("2026-11-15T14:03:20.5Z") - gh.parse_time("2026-11-15T14:03:20Z") - 0.5) < 1e-6
    assert gh.parse_time("2026-11-15T14:03:20+00:00") == gh.parse_time("2026-11-15T14:03:20Z")

    # --- steps, exercise and skin temperature ---
    since = midnight()
    assert gh.parse_steps(p["steps"], since) == (4500, 2) and gh.parse_steps(p["steps"], since + 10 * 86400) is None
    mins, sessions, last = gh.parse_exercise(p["exercise"], since)
    assert mins == 25.0 and sessions == 1 and last[0] == 139.0, (mins, sessions, last)   # today's active minutes; the newest session's heart rate
    assert gh.parse_exercise([], since) == (0.0, 0, None) and gh.parse_steps([{"steps": {}}], since) is None
    assert gh.parse_daily(p["daily-sleep-temperature-derivations"], "dailySleepTemperatureDerivations", "nightlyTemperatureCelsius")[0] == 33.4
    assert "activity_and_fitness.readonly" in " ".join(gh.SCOPES)

    # --- sign-in: PKCE, one-use state, no secret in the URL ---
    url = gh.login_url()
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
    assert url.startswith(gh.AUTH_URL) and q["access_type"] == "offline" and q["prompt"] == "consent" and q["code_challenge_method"] == "S256"
    assert q["redirect_uri"] == "http://localhost:8001/api/fitbit/callback" and "TOPSECRET" not in url
    assert all(s in q["scope"] for s in ("health_metrics_and_measurements.readonly", "sleep.readonly"))
    client, calls = fake_google(now)
    try:
        await gh.exchange("good-code", "never-started", client)
        raise AssertionError("an unknown state must be refused")
    except gh.AuthError:
        pass
    assert not gh.connected()
    await gh.exchange("good-code", q["state"], client)
    assert gh.connected() and calls["token"][0]["code_verifier"] and calls["token"][0]["client_secret"] == "TOPSECRETVALUE"
    assert oct(gh.TOKEN_FILE.stat().st_mode & 0o777) == "0o600"   # only this user can read the tokens
    try:
        await gh.exchange("good-code", q["state"], client)   # the state is single use
        raise AssertionError("state reused")
    except gh.AuthError:
        pass
    q2 = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(gh.login_url()).query))
    try:
        await gh.exchange("bad-code", q2["state"], client)
        raise AssertionError("bad code accepted")
    except gh.AuthError as e:
        assert "TOPSECRET" not in str(e)

    # --- polling and freshness ---
    assert await gh.poll_once(client)
    sent = {k: auth for k, _, auth in calls["api"]}
    assert set(sent) >= {"heart-rate", "heart-rate-variability", "oxygen-saturation", "daily-respiratory-rate", "sleep"}
    assert all(a.startswith("Bearer ACCESSVALUE") for a in sent.values()) and all(c[1] == {"pageSize": c[1]["pageSize"]} for c in calls["api"])
    r = gh.report()
    assert r["state"] == "live" and r["metrics"]["heart_rate"]["value"] == 76.0 and r["metrics"]["heart_rate"]["fresh"]
    assert r["metrics"]["sleep_hours"]["value"] == 6.9 and r["device"] == "Fitbit Versa 4"
    blob = json.dumps(r)
    assert not any(secret in blob for secret in ("TOPSECRETVALUE", "ACCESSVALUE", "REFRESHVALUE")), "report must never carry a secret"
    assert gh.fresh("heart_rate", now + 25 * 60) is None and gh.fresh("hrv", now + 25 * 60) is not None   # HR window 20 min, overnight 36 h
    assert gh.report(now + 25 * 60)["state"] == "stale"
    got = gh._s["latest"]
    assert got["steps"]["value"] == 4500 and got["exercise_min"]["value"] == 25.0 and got["session_hr_avg"]["value"] == 139.0
    assert got["skin_temp"]["value"] == 33.4 and gh.fresh("steps") and gh.fresh("session_hr_avg")
    n_calls = len(calls["api"]); await gh.poll_once(client)               # a second poll soon after: only the quick types are asked for
    assert {k for k, _, _ in calls["api"][n_calls:]}.isdisjoint({"steps", "exercise"}) and gh._s["latest"]["steps"]["value"] == 4500

    # one data type refused: the rest still work, and it is reported
    client2, _ = fake_google(now, fail=("oxygen-saturation", "daily-oxygen-saturation"))
    gh._s["latest"].clear()
    assert await gh.poll_once(client2) and "spo2" not in gh._s["latest"] and "spo2" in gh.report()["errors"]

    # the activity permission not granted: steps and exercise stay simulated, the rest still works, and the error is kept
    client3, _ = fake_google(now, fail=("steps", "exercise"))
    gh._s.update(latest={}, slow_at=0)
    assert await gh.poll_once(client3) and not {"steps", "exercise_min", "session_hr_avg"} & set(gh._s["latest"]) and "heart_rate" in gh._s["latest"]
    assert {"steps", "exercise"} <= set(gh.report()["errors"])
    await gh.poll_once(client3)
    assert {"steps", "exercise"} <= set(gh.report()["errors"])             # still reported on a quick poll
    assert gh.report()["needs_activity_scope"] is True
    # a day with steps but no workout: exercise today is a real zero. No steps and no workout (not synced today): nothing real.
    idle = {"exercise": []}
    gh._s.update(latest={}, slow_at=0); client4, _ = fake_google(now, only=idle)
    assert await gh.poll_once(client4) and gh.report()["needs_activity_scope"] is False   # permission fine once it answers and gh._s["latest"]["exercise_min"]["value"] == 0.0 and "session_hr_avg" not in gh._s["latest"]
    gh._s.update(latest={}, slow_at=0); client5, _ = fake_google(now, only={"exercise": [], "steps": []})
    assert await gh.poll_once(client5) and "exercise_min" not in gh._s["latest"] and "steps" not in gh._s["latest"]
    gh._s.update(latest={}, slow_at=0)

    # a revoked refresh token asks for a sign-in again
    tokens = gh.load_tokens(); tokens.update(refresh_token="REVOKED", expires_at=0); gh.save_tokens(tokens)
    gh._s["latest"].clear()
    assert not await gh.poll_once(client2)
    assert gh.report()["state"] == "error" and gh.report()["needs_reconnect"]
    tokens.update(refresh_token="REFRESHVALUE"); gh.save_tokens(tokens); gh._s["needs_reconnect"] = False
    assert await gh.poll_once(client2)

    # --- the device layer: real values replace the simulation, events layer on top ---
    gh._s["latest"]["heart_rate"] = {"value": 80.0, "ts": time.time() - 120, "kind": "sample", "fetched": time.time()}
    watch = next(d for d in DEVICES if d.name == "wearable")

    def hr():
        sim.measure_now = True
        v = next(x for x in watch.read(sim) if x["metric"] == "heart_rate")
        sim.measure_now = False
        return v

    sim.reset()
    v = hr()
    assert v["real"] and v["value"] == 80 and not v["modified"] and v["source"] == "Fitbit Versa 4" and v["quality"] == "good"
    director.trigger(sim, "cardiac_arrest")
    v = hr()
    assert v["real"] and v["modified"] and v["value"] == 0, v          # flatline over a real heart
    director.trigger(sim, "reset")
    director.trigger(sim, "slow_heart")
    v = hr()
    assert v["real"] and v["modified"] and v["value"] < 60, v          # event pulls the real number down
    director.trigger(sim, "reset")
    assert hr()["value"] == 80 and not hr()["modified"]                # event over: plain real again
    gh._s["latest"]["heart_rate"]["ts"] = time.time() - 30 * 60        # 30 min old: too old to call real
    v = hr()
    assert not v.get("real") and "source" not in v, v                  # back to simulated, and not labelled real
    sim.measure_now = True
    other = [x for d in DEVICES if d.name != "wearable" for x in d.read(sim)]
    sim.measure_now = False
    assert other and not any(x.get("real") for x in other)             # only the watch can be real

    t = time.time() - 60
    gh._s["latest"].update(steps={"value": 4500.0, "ts": t, "kind": "day", "fetched": t}, exercise_min={"value": 25.0, "ts": t, "kind": "day", "fetched": t},
                           session_hr_avg={"value": 139.0, "ts": t, "kind": "session", "fetched": t}, skin_temp={"value": 33.4, "ts": t, "kind": "night", "fetched": t})
    sim.reset(); sim.measure_now = True
    real_now = {x["metric"]: x for x in watch.read(sim) if x.get("real")}
    sim.measure_now = False
    assert {"steps", "exercise_min", "session_hr_avg", "skin_temp"} <= set(real_now) and real_now["steps"]["value"] == 4500 and real_now["exercise_min"]["value"] == 25
    for k in ("steps", "exercise_min", "session_hr_avg", "skin_temp"):
        gh._s["latest"].pop(k, None)
    sim.reset(); sim.measure_now = True
    steps_sim = next(x for x in watch.read(sim) if x["metric"] == "steps")   # no real steps: the simulated value, not labelled real
    sim.measure_now = False
    assert not steps_sim.get("real") and 4000 < steps_sim["value"] < 15000, steps_sim

    # --- records say what is real ---
    from app.devices import native
    gh._s["latest"]["heart_rate"]["ts"] = time.time() - 60
    sim.reset(); sim.fresh_readings(DEVICES)
    rec = next(x for d in native.records(sim) for x in d["records"] if x["metric"] == "heart_rate")
    assert rec["simulated"] is False and "Google Health API" in rec["record"]["sourceName"]
    gh._s["latest"].clear(); sim.reset(); sim.fresh_readings(DEVICES)
    rec = next(x for d in native.records(sim) for x in d["records"] if x["metric"] == "heart_rate")
    assert rec["simulated"] is True

    # --- alerts judge a real heart against its own resting rate, not the simulated crew member's 58 ---
    from app import constants as C
    from app.analysis.common import vs_baseline
    from app.engine.physiology import mission_state
    from app.vitaly import watchdog

    def live_hr(bpm):
        gh._s["latest"]["heart_rate"] = {"value": float(bpm), "ts": time.time() - 60, "kind": "sample", "fetched": time.time()}
        sim.reset(); sim.fresh_readings(DEVICES)
        return watchdog.detect(sim, time.time())

    gh._s.update(hr_seen={}, resting=None)
    assert C.BASELINE["heart_rate"] == 58 and gh.baseline_hr() is None
    found = live_hr(80)                                                  # a fresh real reading is now in use
    assert gh.resting_baseline(58) is None                              # real watch, own rate not learned: nothing judged yet
    assert found == {}                                                   # a real reading never raises an alert by itself
    assert vs_baseline("heart_rate", 80)["delta"] is None
    gh._s["resting"] = {"value": 66.0, "ts": time.time() - 3600}        # the watch's own daily resting heart rate
    assert gh.baseline_hr()["value"] == 66 and vs_baseline("heart_rate", 80)["delta"] == 14.0
    for bpm in (82, 150, 40, 12):                                        # bounces up, races, drops, near zero: still no alert
        assert live_hr(bpm) == {}, (bpm, watchdog.detect(sim, time.time()))
    assert not sim.incidents or all(i["state"] != "open" for i in sim.incidents)
    live_hr(82)
    own = mission_state(sim)["organs"]["heart"]["checks"][0]
    assert own["id"] == "resting_hr" and own["verdict"] == "watch"       # 82 vs 66: more than 8 above their own
    live_hr(72)
    assert mission_state(sim)["organs"]["heart"]["checks"][0]["verdict"] == "ok"   # 72 vs 66: fine (was "watch" against 58)

    # a Director event on top of the real heart is detected like any other (that is how you trigger Vitaly on demand)
    live_hr(80)
    director.trigger(sim, "cardiac_arrest"); sim.fresh_readings(DEVICES)
    assert "cardiac_arrest" in watchdog.detect(sim, time.time())
    director.trigger(sim, "reset"); sim.fresh_readings(DEVICES)
    assert watchdog.detect(sim, time.time()) == {}                       # event over: quiet again
    gh._s["latest"]["spo2"] = {"value": 80.0, "ts": time.time() - 60, "kind": "night", "fetched": time.time()}
    sim.reset(); sim.fresh_readings(DEVICES)
    assert "low_oxygen_blood" not in watchdog.detect(sim, time.time())   # a real low blood-oxygen reading is not alerted on either
    del gh._s["latest"]["spo2"]
    gh._s["resting"] = {"value": 66.0, "ts": time.time() - 6 * 86400}   # too old to trust
    gh._s["hr_seen"] = {time.time() - 20 * i: 90 + i for i in range(40)}   # a minute of elevated readings: not a resting rate
    assert gh.baseline_hr() is None
    gh._s["hr_seen"] = {time.time() - 120 * i: 70 + i for i in range(12)}  # 12 readings over 22 minutes
    b = gh.baseline_hr()
    assert b and b["value"] == 72 and b["source"] == "readings" and "12 heart-rate readings over 22 min" in b["how"], b   # low end
    gh._s["latest"]["heart_rate"]["ts"] = time.time() - 30 * 60          # watch data stale: the simulation, and 58, are back
    assert gh.resting_baseline(58) == 58 and vs_baseline("heart_rate", 80)["delta"] == 22.0
    gh._s.update(hr_seen={}, resting=None)

    # --- disconnect forgets everything ---
    gh.disconnect()
    assert not gh.connected() and gh.report()["metrics"] == {} and gh.report()["state"] == "ready"
    os.environ["GOOGLE_HEALTH_CLIENT_ID"] = ""
    assert gh.report()["state"] == "off"


asyncio.run(main())
sim.reset()
print("fitbit checks passed")
