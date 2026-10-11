import sys
from pathlib import Path

import requests

# put the repo root on the path so `backend` resolves when this file is run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.services.params import PARAMS

def get_daily_mean(gauge_id: str, param_id: str, start_date: str = None, end_date: str = None):
    """
    Gets the daily mean of one parameter for a given USGS gauge.
    If the gauge does not report that parameter, it is printed as unavailable and None is returned.
    """

    if param_id not in PARAMS:
        raise ValueError(f"Unsupported parameter code: {param_id}")

    name = PARAMS[param_id]

    url = "https://waterservices.usgs.gov/nwis/dv/"
    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": param_id,
        "statCd": "00003",        # daily mean
        "siteStatus": "all",
    }

    if start_date:
        params["startDT"] = start_date
        params["endDT"] = end_date or start_date
    elif end_date:
        params["startDT"] = end_date
        params["endDT"] = end_date

    try:
        res = requests.get(url, params=params, timeout=15)
        res.raise_for_status()

        time_series = res.json()["value"]["timeSeries"]
        if not time_series:
            raise LookupError("no time series returned")

        means = []
        # a gauge can have more than one series (sensor) for the same parameter
        for series in time_series:
            
            no_data = float(series["variable"]["noDataValue"])
            unit = series["variable"]["unit"]["unitCode"]

            for block in series["values"]:
                for r in block["value"]:
                    value = float(r["value"])
                    if value == no_data:
                        continue  # skip sensor gaps
                    means.append({
                        "date": r["dateTime"][:10],
                        "mean": value,
                        "unit": unit,
                        "provisional": "P" in r["qualifiers"],
                    })

        if not means:
            raise LookupError("no readings in the date range")

        return means

    except Exception as e:
        print(f"{name} ({param_id}): data isn't available for gauge {gauge_id} ({e})")
        return None


if __name__ == "__main__":
    # these tests use all 9 gauges in a loop

    for gauge in ['01646500', '01646000', '01638500', '01644000', '01643000', '01645000', '01649500', '01654000', '01668000']:
        for param_id, name in PARAMS.items():
            print(f"Daily mean {name} (Latest Day) for {gauge}:\n{get_daily_mean(gauge, param_id)}\n")
            print(f"Daily mean {name} (2026-10-01 to 2026-10-09) for {gauge}:\n{get_daily_mean(gauge, param_id, '2026-10-01', '2026-10-09')}\n")
