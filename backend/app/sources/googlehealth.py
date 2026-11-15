"""Real data from a Fitbit, through the Google Health API.

Fitbit's own Web API was switched off on 2 November 2026; Google Health API
(https://developers.google.com/health) replaced it. This module signs in as the owner of the watch
(Google OAuth, authorization code with PKCE), keeps the tokens in backend/data/fitbit_tokens.json
(git-ignored), and every 30 seconds fetches the newest readings. The device layer
(devices/live.py) then uses them in place of the simulated smartwatch readings.

What this is, honestly: near-live, not a live stream. The watch uploads through the phone app,
so the newest heart-rate sample is usually a few minutes old (community reports say 5 to 20
minutes, depending on the last phone sync). Every reading carries its own sample time, the app
shows how old it is, and a reading older than its window is not used (the simulated value takes
over and the app says so). Nothing here is made up: if there is no fresh sample, there is no value.

Settings (backend/.env; the secret never leaves the backend):
  GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET   from Google Cloud Console (OAuth client "Web")
  GOOGLE_HEALTH_REDIRECT_URI   default http://localhost:8001/api/fitbit/callback (register it exactly)
  FITBIT_DEVICE_NAME           what the app calls the watch, default "Fitbit Versa 4"
  VITALIS_APP_URL              where to send the browser after sign-in, default http://localhost:8000/

Gaps in Google's documentation that this code is written around (verify on the first live run):
  - There is no documented "last N minutes" filter example for heart rate, so it asks for the newest
    samples (the list is newest first) and picks the latest by its own sample time.
  - How often heart rate is sampled, and the sync delay, are not documented. Both are measured.
"""
import asyncio
import base64
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import time
import urllib.parse
from pathlib import Path

import httpx

from ..vitaly import net

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://health.googleapis.com/v4/users/me/dataTypes"
SCOPE_PREFIX = "https://www.googleapis.com/auth/googlehealth"
SCOPES = [f"{SCOPE_PREFIX}.health_metrics_and_measurements.readonly", f"{SCOPE_PREFIX}.sleep.readonly",
          f"{SCOPE_PREFIX}.activity_and_fitness.readonly"]       # steps, exercise sessions (an older connection lacks it: connect again)

TOKEN_FILE = Path(__file__).resolve().parents[2] / "data" / "fitbit_tokens.json"
POLL_S = 30

# How old a reading may be and still count as "real, now". Heart rate comes all day; the others
# are measured during sleep, so they describe last night and stay valid for a day and a half.
MAX_AGE_S = {"heart_rate": 20 * 60, "hrv": 36 * 3600, "spo2": 36 * 3600, "resp_rate": 36 * 3600, "sleep_hours": 36 * 3600,
             "skin_temp": 36 * 3600,
             "steps": 2 * 3600, "exercise_min": 2 * 3600,       # today's totals, as of the last phone sync
             "session_hr_avg": 48 * 3600}                        # the latest workout

# What each Google data type feeds. (data type id, page size, parser)
_pending = {}        # OAuth state -> (PKCE verifier, created)
BASELINE_MIN_SAMPLES = 10          # heart-rate samples needed before their low end counts as "resting"
BASELINE_MIN_SPAN_S = 20 * 60      # ...and they must cover at least this long (a minute of readings is not a resting rate)
HISTORY_PAGE = 2000                # samples to fetch when catching up (newest first, about an hour at 1 to 3 s apart)
HISTORY_EVERY_S = 600              # catch up this often; the other polls only fetch the newest 30
SLOW_EVERY_S = 300                 # today's steps and exercise change slowly and are bigger to fetch
STEPS_PAGE = 1500                  # step intervals, newest first (about a day at one a minute)
EXERCISE_PAGE = 25                 # Google's maximum for exercise sessions
BASELINE_KEEP_S = 12 * 3600        # how long observed samples are kept for that
RESTING_MAX_AGE_S = 4 * 86400      # the watch's own daily resting heart rate may be this old
_s = {"latest": {}, "recent_hr": [], "hr_seen": {}, "resting": None, "last_ok": None, "last_try": None, "error": None, "errors": {},
      "needs_reconnect": False, "device": None}


def settings():
    return {
        "client_id": os.getenv("GOOGLE_HEALTH_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("GOOGLE_HEALTH_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("GOOGLE_HEALTH_REDIRECT_URI", "http://localhost:8001/api/fitbit/callback").strip(),
        "device": os.getenv("FITBIT_DEVICE_NAME", "Fitbit Versa 4").strip() or "Fitbit Versa 4",
        "app_url": os.getenv("VITALIS_APP_URL", "http://localhost:8000/").strip(),
    }


def configured():
    s = settings()
    return bool(s["client_id"] and s["client_secret"])


# ---------- tokens ----------

def load_tokens():
    try:
        return json.loads(TOKEN_FILE.read_text())
    except (OSError, ValueError):
        return None


def save_tokens(tokens):
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)   # only this user can read it
    with os.fdopen(fd, "w") as f:
        json.dump(tokens, f)


def connected():
    t = load_tokens()
    return bool(t and t.get("refresh_token"))


def disconnect():
    try:
        TOKEN_FILE.unlink()
    except OSError:
        pass
    _s.update(latest={}, recent_hr=[], hr_seen={}, resting=None, last_ok=None, error=None, errors={}, needs_reconnect=False, device=None)


def login_url():
    """Where to send the browser to sign in with Google. PKCE and a one-use state guard the round trip."""
    s = settings()
    state, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    now = time.time()
    for k in [k for k, (_, t) in _pending.items() if now - t > 600]:
        del _pending[k]
    _pending[state] = (verifier, now)
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": s["client_id"], "redirect_uri": s["redirect_uri"], "response_type": "code",
        "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})


class AuthError(Exception):
    pass


def _oauth_message(r):
    try:
        j = r.json()
        return f"{j.get('error', r.status_code)}: {j.get('error_description', '')}".strip(": ")
    except ValueError:
        return f"HTTP {r.status_code}"


async def exchange(code, state, client=None):
    """Trade the code Google sent back for tokens, and store them."""
    verifier = _pending.pop(state, (None, 0))[0]
    if not verifier:
        raise AuthError("This sign-in link expired or was not started here. Start again.")
    s = settings()
    r = await (client or net.client()).post(TOKEN_URL, data={
        "code": code, "client_id": s["client_id"], "client_secret": s["client_secret"],
        "redirect_uri": s["redirect_uri"], "grant_type": "authorization_code", "code_verifier": verifier}, timeout=15)
    if r.status_code != 200:
        raise AuthError(f"Google refused the sign-in ({_oauth_message(r)}).")
    j = r.json()
    if not j.get("refresh_token"):
        raise AuthError("Google did not send a refresh token. Remove VITALIS in your Google account's third-party access, then connect again.")
    save_tokens({"access_token": j["access_token"], "expires_at": time.time() + int(j.get("expires_in", 3600)),
                 "refresh_token": j["refresh_token"], "scope": j.get("scope", ""), "connected_at": time.time()})
    _s.update(error=None, needs_reconnect=False)


async def access_token(client=None):
    """A valid access token, refreshed when it is about to expire. None if not connected."""
    t = load_tokens()
    if not t or not t.get("refresh_token"):
        return None
    if t.get("access_token") and t.get("expires_at", 0) - 60 > time.time():
        return t["access_token"]
    s = settings()
    r = await (client or net.client()).post(TOKEN_URL, data={
        "client_id": s["client_id"], "client_secret": s["client_secret"],
        "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}, timeout=15)
    if r.status_code != 200:
        if r.status_code in (400, 401):   # revoked, or expired (7 days in Google's Testing mode)
            _s["needs_reconnect"] = True
            _s["error"] = "The Google connection expired. Connect again."
        raise AuthError(f"Could not refresh the Google token ({_oauth_message(r)}).")
    j = r.json()
    t.update(access_token=j["access_token"], expires_at=time.time() + int(j.get("expires_in", 3600)))
    if j.get("refresh_token"):
        t["refresh_token"] = j["refresh_token"]
    save_tokens(t)
    return t["access_token"]


# ---------- reading the data ----------

def parse_time(text):
    """RFC 3339 ('2026-11-15T14:03:20Z', optional fraction or offset) to epoch seconds."""
    text = str(text).strip().replace("Z", "+00:00")
    m = re.match(r"^(.*?)\.(\d+)(.*)$", text)   # fromisoformat wants 3 or 6 fraction digits on older Pythons
    if m:
        text = f"{m.group(1)}.{m.group(2)[:6].ljust(6, '0')}{m.group(3)}"
    return dt.datetime.fromisoformat(text).timestamp()


def _date_ts(d):
    """A daily summary's date ({'year','month','day'} or 'YYYY-MM-DD') as noon UTC that day."""
    if isinstance(d, dict):
        d = f"{int(d['year']):04d}-{int(d['month']):02d}-{int(d['day']):02d}"
    return parse_time(f"{d}T12:00:00Z")


def _sample_ts(point, key):
    return parse_time(((point.get(key) or {}).get("sampleTime") or {})["physicalTime"])


def _newest(points, key):
    best = None
    for p in points or []:
        try:
            ts = _sample_ts(p, key)
        except (KeyError, ValueError, TypeError):
            continue
        if best is None or ts > best[0]:
            best = (ts, p)
    return best


def parse_heart_rate(points, keep=30):
    """Heart-rate samples oldest to newest, the last `keep` of them: ([(ts, bpm)...], device name)."""
    rows = []
    device = None
    for p in points or []:
        try:
            ts, bpm = _sample_ts(p, "heartRate"), float(p["heartRate"]["beatsPerMinute"])
        except (KeyError, ValueError, TypeError):
            continue
        if 1 <= bpm <= 300:
            rows.append((ts, bpm))
            device = device or ((p.get("dataSource") or {}).get("device") or {}).get("displayName")
    rows.sort()
    return rows[-keep:], device


def parse_sample(points, key, field, low, high):
    best = _newest(points, key)
    if not best:
        return None
    try:
        v = float(best[1][key][field])
    except (KeyError, ValueError, TypeError):
        return None
    return (v, best[0]) if low <= v <= high else None


def parse_daily(points, key, field):
    """Newest daily summary by its date -> (value, ts)."""
    best = None
    for p in points or []:
        try:
            ts, v = _date_ts(p[key]["date"]), float(p[key][field])
        except (KeyError, ValueError, TypeError):
            continue
        if best is None or ts > best[1]:
            best = (v, ts)
    return best


def _duration_s(text):
    """'1800s' or '1800.5s' -> seconds."""
    try:
        return float(str(text).strip().rstrip("s"))
    except ValueError:
        return None


def parse_steps(points, since):
    """Steps counted since `since` (epoch seconds, local midnight): (total, intervals counted), or None if none today."""
    total, n = 0, 0
    for p in points or []:
        try:
            start = parse_time(p["steps"]["interval"]["startTime"])
            count = int(p["steps"]["count"])
        except (KeyError, ValueError, TypeError):
            continue
        if start >= since:
            total += count
            n += 1
    return (total, n) if n else None


def parse_exercise(points, since):
    """Exercise sessions: (minutes of exercise since `since`, sessions today, (average heart rate, ended at) of the newest
    session that has one, or None)."""
    minutes, today, newest = 0.0, 0, None
    for p in points or []:
        e = p.get("exercise") or {}
        try:
            start, end = parse_time(e["interval"]["startTime"]), parse_time(e["interval"]["endTime"])
        except (KeyError, ValueError, TypeError):
            continue
        if start >= since:
            secs = _duration_s(e.get("activeDuration")) if e.get("activeDuration") else None
            minutes += (secs if secs is not None else end - start) / 60
            today += 1
        try:
            hr = float((e.get("metricsSummary") or {})["averageHeartRateBeatsPerMinute"])
        except (KeyError, ValueError, TypeError):
            continue
        if 1 <= hr <= 300 and (newest is None or end > newest[1]):
            newest = (hr, end)
    return round(minutes, 1), today, newest


def parse_sleep(points):
    """Hours asleep in the most recent sleep session -> (hours, ts of waking)."""
    best = None
    for p in points or []:
        s = p.get("sleep") or {}
        try:
            end = parse_time((s.get("interval") or {})["endTime"])
        except (KeyError, ValueError, TypeError):
            continue
        minutes = None
        try:
            minutes = float((s.get("summary") or {})["minutesAsleep"])
        except (KeyError, ValueError, TypeError):
            total = 0.0
            for st in s.get("stages") or []:
                if st.get("type") in ("LIGHT", "DEEP", "REM", "ASLEEP"):
                    try:
                        total += parse_time(st["endTime"]) - parse_time(st["startTime"])
                    except (KeyError, ValueError, TypeError):
                        pass
            minutes = total / 60 if total else None
        if minutes and (best is None or end > best[1]):
            best = (round(minutes / 60, 2), end)
    return best


class ApiError(Exception):
    pass


async def list_points(token, data_type, page_size, client=None):
    r = await (client or net.client()).get(f"{API}/{data_type}/dataPoints", params={"pageSize": page_size},
                                           headers={"Authorization": f"Bearer {token}"}, timeout=12)
    if r.status_code == 401:
        raise AuthError("Google rejected the access token.")
    if r.status_code != 200:
        message = ""
        try:
            message = (r.json().get("error") or {}).get("message", "")
        except ValueError:
            pass
        if "ACCOUNT_NOT_LINKED" in r.text:
            message = "This Google account has no Google Health profile yet. Open the Google Health app and sign in."
        raise ApiError(f"{data_type}: HTTP {r.status_code} {message}".strip())
    return r.json().get("dataPoints", [])


async def poll_once(client=None):
    """Fetch the newest readings and update what the app uses. Safe to call any time."""
    _s["last_try"] = time.time()
    try:
        token = await access_token(client)
    except (AuthError, httpx.HTTPError) as e:
        _s["error"] = str(e) or "Could not reach Google."
        return False
    if not token:
        return False

    catching_up = time.time() - _s.get("history_at", 0) > HISTORY_EVERY_S
    wanted = {"hr": ("heart-rate", HISTORY_PAGE if catching_up else 30), "hrv": ("heart-rate-variability", 5), "dhrv": ("daily-heart-rate-variability", 3),
              "spo2": ("oxygen-saturation", 5), "dspo2": ("daily-oxygen-saturation", 3),
              "rhr": ("daily-resting-heart-rate", 3), "temp": ("daily-sleep-temperature-derivations", 3),
              "resp": ("daily-respiratory-rate", 3), "sleep": ("sleep", 3)}
    slow = time.time() - _s.get("slow_at", 0) > SLOW_EVERY_S
    if slow:
        _s["slow_at"] = time.time()
        wanted.update(steps=("steps", STEPS_PAGE), exercise=("exercise", EXERCISE_PAGE))
    results = await asyncio.gather(*[list_points(token, t, n, client) for t, n in wanted.values()], return_exceptions=True)
    got, errors = dict(zip(wanted, results)), {}
    for k, r in got.items():
        if isinstance(r, AuthError):
            _s["error"] = str(r)
            _s["needs_reconnect"] = True
            return False
        if isinstance(r, Exception):
            errors[k] = str(r) or type(r).__name__
            got[k] = []
    if not slow:   # a type that was not asked for this time keeps its last error (the activity permission, say)
        errors.update({k: v for k, v in _s["errors"].items() if k in ("steps", "exercise") and k not in errors})
    _s["errors"] = errors

    now, latest = time.time(), {}

    def put(metric, found, kind):
        if found:
            latest[metric] = {"value": round(found[0], 1), "ts": found[1], "kind": kind, "fetched": now}

    rows, device = parse_heart_rate(got["hr"], keep=HISTORY_PAGE)
    if catching_up and rows:
        _s["history_at"] = time.time()
    if rows:
        put("heart_rate", (rows[-1][1], rows[-1][0]), "sample")
        _s["recent_hr"] = rows[-30:]
        for ts, bpm in rows:       # remember samples, to learn this person's resting rate
            _s["hr_seen"][ts] = bpm
        for ts in [t for t in _s["hr_seen"] if now - t > BASELINE_KEEP_S]:
            del _s["hr_seen"][ts]
    resting = parse_daily(got["rhr"], "dailyRestingHeartRate", "beatsPerMinute")
    if resting:
        _s["resting"] = {"value": resting[0], "ts": resting[1]}
    put("hrv", parse_sample(got["hrv"], "heartRateVariability", "rootMeanSquareOfSuccessiveDifferencesMilliseconds", 1, 300)
        or parse_daily(got["dhrv"], "dailyHeartRateVariability", "averageHeartRateVariabilityMilliseconds"), "night")
    put("spo2", parse_sample(got["spo2"], "oxygenSaturation", "percentage", 50, 100)
        or parse_daily(got["dspo2"], "dailyOxygenSaturation", "averagePercentage"), "night")
    put("resp_rate", parse_daily(got["resp"], "dailyRespiratoryRate", "breathsPerMinute"), "night")
    put("sleep_hours", parse_sleep(got["sleep"]), "night")
    put("skin_temp", parse_daily(got["temp"], "dailySleepTemperatureDerivations", "nightlyTemperatureCelsius"), "night")
    if slow:
        # Today's totals are as fresh as the last phone sync, and the newest heart-rate sample is the best sign of that.
        since = dt.datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        sync = (latest.get("heart_rate") or _s["latest"].get("heart_rate") or {}).get("ts", 0)
        steps = parse_steps(got.get("steps"), since) if "steps" not in errors else None
        minutes, sessions, last = parse_exercise(got.get("exercise"), since) if "exercise" not in errors else (0, 0, None)
        if steps and sync >= since:
            put("steps", (steps[0], sync), "day")
        # "No exercise today" only counts as a real zero if the watch has synced today (steps or heart rate show it).
        if "exercise" not in errors and sync >= since and (sessions or steps):
            put("exercise_min", (minutes, sync), "day")
        if last:
            put("session_hr_avg", last, "session")
    _s["latest"].update(latest)
    if device:
        _s["device"] = device
    ok = bool(latest) or not errors
    if ok:
        _s["last_ok"] = now
        _s["error"] = None if latest or not errors else _s["error"]
    if not latest and errors:
        _s["error"] = "Google answered but returned no readings: " + "; ".join(errors.values())[:200]
    return bool(latest)


async def loop():
    """Poll while connected. Cheap when nothing is set up."""
    while True:
        if configured() and connected() and not _s["needs_reconnect"]:
            try:
                await poll_once()
            except Exception as e:   # never let a bad response stop the loop
                _s["error"] = f"{type(e).__name__}: {e}"[:200]
        await asyncio.sleep(POLL_S)


# ---------- what the rest of the app sees ----------

def fresh(metric, now=None):
    """The newest real reading of this metric if it is recent enough to call real, else None."""
    r = _s["latest"].get(metric)
    if not r:
        return None
    now = now if now is not None else time.time()
    return r if now - r["ts"] <= MAX_AGE_S.get(metric, 20 * 60) else None


def baseline_hr(now=None):
    """This wearer's own resting heart rate, or None while it is not known yet.
    The watch's own daily resting heart rate if it has one from the last few days; otherwise the low end
    (20th percentile) of the heart-rate samples seen so far, once there are enough of them."""
    now = now if now is not None else time.time()
    r = _s["resting"]
    if r and now - r["ts"] <= RESTING_MAX_AGE_S:
        return {"value": round(r["value"]), "source": "watch", "how": "the watch's daily resting heart rate"}
    stamps = [t for t in _s["hr_seen"] if now - t <= BASELINE_KEEP_S]
    if len(stamps) >= BASELINE_MIN_SAMPLES and max(stamps) - min(stamps) >= BASELINE_MIN_SPAN_S:
        seen = sorted(_s["hr_seen"][t] for t in stamps)
        return {"value": round(seen[int(0.2 * (len(seen) - 1))]), "source": "readings",
                "how": f"the low end of {len(seen)} heart-rate readings over {round((max(stamps) - min(stamps)) / 60)} min"}
    return None


def resting_baseline(default, now=None):
    """The resting heart rate to judge a reading against. While the real watch is the source: this wearer's
    own (None if not learned yet, so nothing is judged against a stranger's number). Otherwise `default`."""
    if not fresh("heart_rate", now):
        return default
    b = baseline_hr(now)
    return b["value"] if b else None


def device_name():
    return _s["device"] or settings()["device"]


def report(now=None):
    """Everything the UI needs to say what is real right now. Never includes a token or secret."""
    now = now if now is not None else time.time()
    s = settings()
    metrics = {}
    for metric, r in _s["latest"].items():
        metrics[metric] = {"value": r["value"], "age_s": max(0, round(now - r["ts"])), "kind": r["kind"],
                           "fresh": fresh(metric, now) is not None, "window_s": MAX_AGE_S.get(metric)}
    if not configured():
        state = "off"
    elif not connected():
        state = "ready"
    elif _s["needs_reconnect"] or (_s["error"] and not _s["latest"]):
        state = "error"
    elif fresh("heart_rate", now):
        state = "live"
    else:
        state = "stale"
    return {"state": state, "configured": configured(), "connected": connected(), "device": device_name(),
            "metrics": metrics, "recent_hr": [[round(t), v] for t, v in _s["recent_hr"][-20:]],
            "last_ok_s_ago": round(now - _s["last_ok"]) if _s["last_ok"] else None,
            "poll_every_s": POLL_S, "error": _s["error"], "errors": _s["errors"],
            "needs_reconnect": _s["needs_reconnect"], "redirect_uri": s["redirect_uri"],
            "baseline_hr": baseline_hr(now),
            # steps and exercise need the activity permission; an older connection does not have it
            "needs_activity_scope": any("HTTP 403" in (_s["errors"].get(k) or "") for k in ("steps", "exercise")),
            "heart_rate_window_min": MAX_AGE_S["heart_rate"] // 60}
