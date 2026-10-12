import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


from backend.services.params import PARAMS




def get_hourly_data(gauge_id: str, param_ids: list[str], days: int = 7) -> dict:
    """
    Fetches 7 days of instantaneous USGS readings for a gauge.
    """
    for p in param_ids:
        if p not in PARAMS:
            raise ValueError(f"Unsupported parameter code: {p}")

    # 1. Fetch raw readings
    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": ",".join(param_ids),
        "period": f"P{days}D",
        "siteStatus": "active",
    }
    res = requests.get("https://waterservices.usgs.gov/nwis/iv/", params=params, timeout=30)
    res.raise_for_status()
    raw = res.json()

    # 2. For each parameter, keep the series with the newest valid reading
    most_recent = {}
    for series in raw["value"]["timeSeries"]:
        param_id = series["variable"]["variableCode"][0]["value"]
        no_data = float(series["variable"]["noDataValue"])

        rows = [
            (r["dateTime"], float(r["value"]))
            for block in series["values"]
            for r in block["value"]
            if float(r["value"]) != no_data          # drop -999999 gaps
        ]
        if not rows:
            continue

        newest = max(t for t, _ in rows)
        if param_id not in most_recent or newest > most_recent[param_id]["newest"]:
            most_recent[param_id] = {
                "rows": rows,
                "newest": newest,
                "unit": series["variable"]["unit"]["unitCode"],
            }

    # 3. Resample each parameter to 1-hour averages
    results = {}
    for param_id, info in most_recent.items():
        times, values = zip(*info["rows"])
        s = pd.Series(
            values,
            index=pd.to_datetime(times, utc=True).tz_convert("America/New_York"),
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


if __name__ == "__main__":
    data = get_hourly_data("01646500", ["00060", "00010"], days=2)  # Little Falls
    for param_id, info in data.items():
        print(f"\n{info['parameter']} ({info['unit']}): {len(info['hourly'])} hours")
        for h in info["hourly"][-5:]:  # last 5 hours
            print(f"  {h['hour']}  mean={h['mean']}  readings={h['readings']}")