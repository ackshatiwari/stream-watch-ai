"""
Shared HTTP and parsing helpers for the USGS water services.
All USGS URLs live here, so moving to a different USGS API only touches this file.
"""

import requests

IV_URL = "https://waterservices.usgs.gov/nwis/iv/"      # instantaneous values (15-min readings)
DV_URL = "https://waterservices.usgs.gov/nwis/dv/"      # daily values
STAT_URL = "https://waterservices.usgs.gov/nwis/stat/"  # daily statistics (percentiles)

DEFAULT_TIMEOUT = 15

# one session so repeated calls reuse the same connection
_session = requests.Session()


def fetch_json(url: str, params: dict, timeout: int = DEFAULT_TIMEOUT) -> dict:
    res = _session.get(url, params=params, timeout=timeout)
    res.raise_for_status()
    return res.json()


def fetch_text(url: str, params: dict, timeout: int = DEFAULT_TIMEOUT) -> str:
    res = _session.get(url, params=params, timeout=timeout)
    res.raise_for_status()
    return res.text


def iter_valid_readings(series: dict):
    """
    Yields (dateTime, value, qualifiers) for every reading in one timeSeries entry,
    skipping the no-data sentinel (e.g. -999999) USGS uses for sensor gaps.
    """
    no_data = float(series["variable"]["noDataValue"])

    for block in series["values"]:
        for r in block["value"]:
            value = float(r["value"])
            if value == no_data:
                continue
            yield r["dateTime"], value, r["qualifiers"]


def series_param_code(series: dict) -> str:
    return series["variable"]["variableCode"][0]["value"]


def series_unit(series: dict) -> str:
    return series["variable"]["unit"]["unitCode"]
