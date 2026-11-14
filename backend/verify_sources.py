"""Check every real data source and the mission physics before building on top of them.

Run from backend/ on a machine with internet:   python verify_sources.py
Successful fetches are saved to data/cache/ so the demo still works offline.
Exit code 0 = all live, 1 = something fell back (details printed).
"""
import asyncio
import datetime as dt

from dotenv import load_dotenv

load_dotenv()

from app import constants as C  # noqa: E402
from app import missions as M  # noqa: E402
from app.sources import donki, horizons, noaa  # noqa: E402

OK, FAIL = "PASS", "FAIL"
results = []


def check(name, passed, detail):
    results.append(passed)
    print(f"  [{OK if passed else FAIL}] {name}: {detail}")


async def main():
    mission = M.current_mission()
    m = M.get(mission)
    today = M.date_for_day(M.current_day())
    arrival = M.date_for_day(m["arrival_day"])

    print("\n1. JPL Horizons (Earth-Mars light time)")
    await horizons.refresh_range(M.date_for_day(0), M.date_for_day(m["end_day"]))
    live_today = horizons.status["horizons"].startswith("live")
    live_arrival = live_today
    lt_today = horizons.earth_mars_light_time_min(today)
    lt_arrival = horizons.earth_mars_light_time_min(arrival)
    lo, hi = C.MARS_LIGHT_TIME_MIN_RANGE
    check("live data (whole mission, 1 row per day)", live_today, horizons.status["horizons"] + (f" | error: {horizons.errors['horizons']}" if horizons.errors["horizons"] else ""))
    check("today in 4-24 min range", lo - 1 <= lt_today <= hi + 1, f"{today}: {lt_today:.2f} min one way")
    check("arrival in 4-24 min range", lo - 1 <= lt_arrival <= hi + 1, f"{arrival}: {lt_arrival:.2f} min one way")

    print("\n2. NASA DONKI via CCMC DONKI-API (solar particle events + flares)")
    await donki.refresh()
    check("SEP live", donki.status["sep"].startswith("live"), donki.status["sep"] + (f" | error: {donki.errors['sep']}" if donki.errors["sep"] else ""))
    check("FLR live", donki.status["flr"].startswith("live"), donki.status["flr"] + (f" | error: {donki.errors['flr']}" if donki.errors["flr"] else ""))
    sep = donki.sep_events()
    if sep:
        e = sep[0]
        check("SEP record has eventTime + sepID", bool(e.get("eventTime") and e.get("sepID")), f"latest {e.get('sepID')}")
    flr = donki.flares()
    if flr:
        f = flr[0]
        print(f"         latest flare: class {f.get('classType')} peak {f.get('peakTime')}")
    measured = donki.measured_sep_events()
    check("measured SEP events (model forecasts removed)", len(measured) > 0, f"{len(measured)} of {len(sep)} records are real measurements")
    storm = donki.pick_storm(0)
    print(f"         director storm will replay: {storm.get('sepID')} ({storm.get('link')})")

    print("\n3. NOAA SWPC (live GOES proton flux)")
    await noaa.refresh()
    now = noaa.latest()
    check("live data", noaa.status["noaa_protons"].startswith("live"), noaa.status["noaa_protons"])
    if now:
        age_h = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(now["time_tag"].replace("Z", "+00:00"))).total_seconds() / 3600
        check("reading is recent (< 2 h old)", age_h < 2, f"{now['time_tag']} ({age_h:.1f} h ago)")
        state = "SOLAR PROTON EVENT NOW" if now["proton_event_now"] else "quiet"
        print(f"         {now['flux_pfu']} pfu at >=10 MeV (event threshold {now['threshold_pfu']}): {state}")

    print(f"\n4. Mission physics: {m['name']} (launch {M.launch_date()}, arrival day {m['arrival_day']}, end day {m['end_day']})")
    print("   day   date        phase    g     dose/day  total mSv  %limit  ugrav months  comms one-way")
    for day in (0, 60, 120, M.current_day(), m["arrival_day"], 400, m["end_day"]):
        e = M.environment(mission, day)
        print(f"   {e['day']:>4}  {e['date']}  {e['phase']:<7}  {e['gravity_g']:<4}  {e['dose_rate_msv_per_day']:<8}  "
              f"{e['radiation_msv']:>8}   {e['radiation_pct_of_career_limit']:>5}%  {e['microgravity_months']:>6}       {e['comms_delay_min']:>5} min")
    end = M.environment(mission, m["end_day"])
    check("dose math: day 184 = 184 x 1.84", M.environment(mission, 184)["radiation_msv"] == round(184 * 1.84, 1), "338.6 mSv")
    over = end["radiation_msv"] > C.CAREER_LIMIT_MSV
    print(f"         full mission dose {end['radiation_msv']} mSv vs career limit {C.CAREER_LIMIT_MSV}: "
          f"{'EXCEEDS the limit (this is a real Mars mission problem, use it in the pitch)' if over else 'within limit'}")

    passed = sum(results)
    print(f"\n{passed}/{len(results)} checks passed. Cache: data/cache/")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
