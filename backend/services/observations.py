"""
Fetches USGS observations for the gauges in the registry: the latest reading,
daily means, and hourly averages of the 15-min readings.

These functions raise instead of returning None:
- ValueError for bad input (unknown gauge, unreported parameter, bad dates)
- LookupError when USGS has no data
- requests exceptions when USGS can't be reached
"""

from datetime import date

import pandas as pd

from services.gauge_registry import validate_gauge_param
from services.params import PARAMS
from services.usgs_client import (
    DV_URL,
    IV_URL,
    fetch_json,
    iter_valid_readings,
    series_param_code,
    series_unit,
)

MAX_DAILY_RANGE_DAYS = 366
MAX_HOURLY_DAYS = 7
LOCAL_TZ = "America/New_York"

# trend = change between the last TREND_WINDOW_HOURS and the window before it
TREND_WINDOW_HOURS = 6
TREND_THRESHOLD = 0.05  # a change under 5% counts as steady


def get_latest_data(gauge_id: str, param_id: str) -> dict:
    """
    Gets the latest reading for a given parameter at a USGS gauge.
    """
    validate_gauge_param(gauge_id, param_id)

    raw = fetch_json(IV_URL, {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": param_id,
        "siteStatus": "all",
    })

    most_recent = None
    # a gauge can have more than one series (sensor) for the same parameter, so keep the newest across all
    for series in raw["value"]["timeSeries"]:
        for measured_at, value, qualifiers in iter_valid_readings(series):
            if most_recent is None or measured_at > most_recent["measured_at"]:
                most_recent = {
                    "gauge_id": gauge_id,
                    "site_name": series["sourceInfo"]["siteName"],
                    "parameter": PARAMS[param_id],
                    "param_id": param_id,
                    "value": value,
                    "unit": series_unit(series),
                    "measured_at": measured_at,
                    "provisional": "P" in qualifiers,
                }

    if most_recent is None:
        raise LookupError(f"no recent {PARAMS[param_id]} readings for gauge {gauge_id}")

    return most_recent


def get_daily_mean(gauge_id: str, param_id: str, start_date: str = None, end_date: str = None) -> list[dict]:
    """
    Gets the daily mean of one parameter for a given USGS gauge.
    Dates are YYYY-MM-DD. With no dates, USGS returns the latest day.
    """
    validate_gauge_param(gauge_id, param_id)

    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": param_id,
        "statCd": "00003",  # daily mean
        "siteStatus": "all",
    }

    if start_date or end_date:
        start = _parse_date(start_date or end_date)
        end = _parse_date(end_date or start_date)
        if start > end:
            raise ValueError(f"start_date {start} is after end_date {end}")
        if (end - start).days > MAX_DAILY_RANGE_DAYS:
            raise ValueError(f"date range is longer than {MAX_DAILY_RANGE_DAYS} days")
        params["startDT"] = start.isoformat()
        params["endDT"] = end.isoformat()

    raw = fetch_json(DV_URL, params)

    means = [
        {
            "date": day[:10],
            "mean": value,
            "unit": series_unit(series),
            "provisional": "P" in qualifiers,
        }
        for series in raw["value"]["timeSeries"]
        for day, value, qualifiers in iter_valid_readings(series)
    ]

    if not means:
        raise LookupError(f"no daily {PARAMS[param_id]} means for gauge {gauge_id} in that date range")

    return means


def get_hourly_data(gauge_id: str, param_ids: list[str], days: int = 7) -> dict:
    """
    Fetches recent instantaneous USGS readings for a gauge and averages them into 1-hour buckets.
    days is clamped to 1 to 7.
    """
    for p in param_ids:
        validate_gauge_param(gauge_id, p)

    days = max(1, min(days, MAX_HOURLY_DAYS))

    # 1. Fetch raw readings
    raw = fetch_json(IV_URL, {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": ",".join(param_ids),
        "period": f"P{days}D",
        "siteStatus": "all",
    }, timeout=30)

    # 2. For each parameter, keep the series with the newest valid reading
    most_recent = {}
    for series in raw["value"]["timeSeries"]:
        param_id = series_param_code(series)
        rows = [(t, v) for t, v, _ in iter_valid_readings(series)]
        if not rows:
            continue

        newest = max(t for t, _ in rows)
        if param_id not in most_recent or newest > most_recent[param_id]["newest"]:
            most_recent[param_id] = {
                "rows": rows,
                "newest": newest,
                "unit": series_unit(series),
            }

    if not most_recent:
        raise LookupError(f"no readings for gauge {gauge_id} in the last {days} days")

    # 3. Resample each parameter to 1-hour averages
    results = {}
    for param_id, info in most_recent.items():
        times, values = zip(*info["rows"])
        s = pd.Series(
            values,
            index=pd.to_datetime(times, utc=True).tz_convert(LOCAL_TZ),
        ).sort_index()

        hourly_mean = s.resample("1h").mean()    # average of readings in each hour
        hourly_count = s.resample("1h").count()  # how many readings went into it

        results[param_id] = {
            "parameter": PARAMS[param_id],
            "unit": info["unit"],
            "hourly": [
                {
                    "hour": hour.isoformat(),
                    "mean": None if pd.isna(m) else round(float(m), 3),
                    "readings": int(c),
                }
                for hour, m, c in zip(hourly_mean.index, hourly_mean, hourly_count)
            ],
        }

    return results


def summarize_hourly(hourly_result: dict) -> dict:
    """
    Shrinks get_hourly_data output to a few numbers per parameter, so it is cheap to send to the LLM.
    """
    summaries = {}
    for param_id, info in hourly_result.items():
        hours = [h for h in info["hourly"] if h["mean"] is not None]
        if not hours:
            continue

        means = [h["mean"] for h in hours]
        low = min(hours, key=lambda h: h["mean"])
        high = max(hours, key=lambda h: h["mean"])

        summaries[param_id] = {
            "parameter": info["parameter"],
            "unit": info["unit"],
            "first_hour": hours[0]["hour"],
            "last_hour": hours[-1]["hour"],
            "latest_mean": hours[-1]["mean"],
            "min": {"value": low["mean"], "hour": low["hour"]},
            "max": {"value": high["mean"], "hour": high["hour"]},
            "overall_mean": round(sum(means) / len(means), 3),
            "hours_with_data": len(hours),
            "trend": _trend(means),
        }

    return summaries


def _trend(means: list[float]) -> str:
    """
    Compares the average of the last window of hours with the window before it.
    """
    w = TREND_WINDOW_HOURS
    if len(means) < 2 * w:
        return "not enough data"

    recent = sum(means[-w:]) / w
    before = sum(means[-2 * w:-w]) / w

    if before == 0:
        return "steady" if recent == 0 else "rising"

    change = (recent - before) / abs(before)
    if change > TREND_THRESHOLD:
        return "rising"
    if change < -TREND_THRESHOLD:
        return "falling"
    return "steady"


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"invalid date {value!r}, expected YYYY-MM-DD") from None
