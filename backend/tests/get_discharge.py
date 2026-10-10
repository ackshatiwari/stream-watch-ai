import requests

def get_latest_discharge(gauge_id: str):
    """
    Get the latest discharge reading for a given USGS gauge ID.
    """

    url = "https://waterservices.usgs.gov/nwis/iv/"
    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": "00060", # 00060 represents discharge
        "siteStatus": "all",
    }

    res = requests.get(url, params=params, timeout=15) 
    res.raise_for_status()

    data = res.json() 

    time_series = data["value"]["timeSeries"] # contains discharge and time
    if not time_series:
        return None  # gauge has no discharge data

    series = time_series[0]

    # Extract the discharge readings
    readings = series["values"][0]["value"]

    if not readings:
        return None

    # get the latest discharge reading
    latest = readings[-1] 
    value = float(latest["value"])
    if value == float(series["variable"]["noDataValue"]):
        return None  # sensor gap

    return {
        "gauge_id": gauge_id,
        "site_name": series["sourceInfo"]["siteName"],
        "discharge_cfs": value,               # cubic feet per second
        "measured_at": latest["dateTime"],    # ISO timestamp with offset
        "provisional": "P" in latest["qualifiers"],
    }


def get_mean_discharge(gauge_id: str, start_date: str = None, end_date: str = None):
    """
    Gets the mean discharge rate based on the provided date range.
    The latest mean is only available until yesterday, so instantaneous values
    will be gotten from get_latest_discharge().
    """

    url = "https://waterservices.usgs.gov/nwis/dv/"
    params = {
        "format": "json",
        "sites": gauge_id,
        "parameterCd": "00060",   # discharge
        "statCd": "00003",        # daily mean
        "siteStatus": "all",
    }

    if start_date:
        params["startDT"] = start_date
        params["endDT"] = end_date or start_date 
    elif end_date:
        params["startDT"] = end_date
        params["endDT"] = end_date

    res = requests.get(url, params=params, timeout=15)
    res.raise_for_status()

    time_series = res.json()["value"]["timeSeries"]
    if not time_series:
        return None

    series = time_series[0]
    no_data = float(series["variable"]["noDataValue"])

    results = []
    for r in series["values"][0]["value"]:
        value = float(r["value"])
        if value == no_data:
            continue  # skip sensor gaps
        results.append({
            "date": r["dateTime"][:10],
            "mean_discharge_cfs": value,
            "provisional": "P" in r["qualifiers"],
        })

    return results


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
        print(f"Latest Discharge for {gauge}:\n{get_latest_discharge(gauge)}\n")
        print(f"Mean Discharge (Latest Day):\n{get_mean_discharge(gauge)}\n")
        print(f"Mean Discharge (2026-10-01 to 2026-10-09):\n{get_mean_discharge(gauge, '2026-10-01', '2026-10-09')}\n")