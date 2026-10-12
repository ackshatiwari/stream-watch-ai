import sys
from pathlib import Path

import requests

# put the repo root on the path so `backend` resolves when this file is run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.services.params import PARAMS



def get_latest_data(gauge_id: str, param_id: str):
    """
    gets the latest data for a given parameter at a USGS gauge.
    """

    if param_id not in PARAMS:
        raise ValueError(f"Unsupported parameter code: {param_id}")
    

    url = "https://waterservices.usgs.gov/nwis/iv/"
    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": param_id,
        "siteStatus": "all", 
    }

    res = requests.get(url, params=params, timeout=15)
    res.raise_for_status()

    most_recent = None
    # iterate through all time series to find the most recent reading
    for series in res.json()["value"]["timeSeries"]:

        no_data = float(series["variable"]["noDataValue"]) # the value that represents no data

        for block in series["values"]:

            readings = block["value"]
            if not readings:
                continue

            latest = readings[-1] # the most recent reading

            value = float(latest["value"])
            if value == no_data:
                continue

            # keep the most recent reading across all series
            if most_recent is None or latest["dateTime"] > most_recent["measured_at"]:
                most_recent = {
                    "gauge_id": gauge_id,
                    "site_name": series["sourceInfo"]["siteName"],
                    "parameter": PARAMS[param_id],
                    "param_id": param_id,
                    "value": value,
                    "unit": series["variable"]["unit"]["unitCode"],
                    "measured_at": latest["dateTime"],
                    "provisional": "P" in latest["qualifiers"],
                }

    return most_recent


if __name__ == "__main__":
    # these tests use all 9 gauges in a loop
    
    """
    01646500 --> Potomac River near Wash, DC Little Falls Pump Sta
    01646000 --> Difficult Run near Great Falls, VA
    01638500 --> Potomac River at Point of Rocks, MD
    01644000 --> Goose Creek near Leesburg, VA
    01643000 --> Monocacy River at Jug Bridge near Frederick, MD
    01645000 --> Seneca Creek at Dawsonville, MD
    01649500 --> Northeast Branch Anacostia River at Riverdale, MD
    01654000 --> Accotink Creek near Annandale, VA
    01668000 --> Rappahannock River near Fredericksburg, VA
    
    """
    
    for gauge in ['01646500', '01646000', '01638500', '01644000', '01643000', '01645000', '01649500', '01654000', '01668000']:
        for param_id, name in PARAMS.items():
            print(f"Most Recent {name} values for {gauge}:\n{get_latest_data(gauge, param_id)}\n")
