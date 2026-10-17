"""
Compares a reading to USGS daily statistics using log probability interpolation
"""

import math
from datetime import date
from functools import lru_cache
from statistics import NormalDist

from services.gauge_registry import validate_gauge_param
from services.observations import get_latest_data
from services.usgs_client import STAT_URL, fetch_text

# percentile classes offered by USGS (https://waterdata.usgs.gov/statistics-documentation/),
# mapped from their daily statistics column to their percentile as a decimal
PERCENTILE_COLUMNS = {
    "p05_va": 0.05,
    "p10_va": 0.10,
    "p25_va": 0.25,
    "p50_va": 0.50,
    "p75_va": 0.75,
    "p90_va": 0.90,
    "p95_va": 0.95,
}

STANDARD_NORMAL = NormalDist()


# ---------------------------------------------------------------------------
# Step 1: Get the reference table for a given gauge, parameter, and calendar day
# ---------------------------------------------------------------------------
@lru_cache(maxsize=128)
def fetch_stat_rows(gauge_id: str, param_id: str) -> tuple[dict, ...]:
    """
    Fetches the full year of daily statistics for a gauge and parameter.
    USGS returns every calendar day in one call and the statistics only change about once a year,
    so the result is cached per (gauge, parameter).
    """
    text = fetch_text(STAT_URL, {
        "format": "rdb",
        "sites": gauge_id,
        "parameterCd": param_id,
        "statReportType": "daily",
        "statTypeCd": "all",
    })

    # drop comments and blank lines
    lines = [line for line in text.splitlines() if line and not line.startswith("#")]
    if len(lines) < 3:
        raise LookupError(f"USGS has no daily statistics for parameter {param_id} at gauge {gauge_id}")

    header = lines[0].split("\t")  # header line with column names
    # lines[1] is the RDB column format line (e.g. 5s, 15s), so the data starts at lines[2]
    return tuple(dict(zip(header, line.split("\t"))) for line in lines[2:])


def get_reference_table(gauge_id: str, param_id: str, month: int, day: int) -> dict:
    """
    Gets the USGS reference table for one calendar day.

    The reference table is a dictionary with the following keys:
    - percentiles: a dictionary of percentiles and their corresponding values
    - min: the record minimum value
    - max: the record maximum value
    - years: the number of years of record
    """
    validate_gauge_param(gauge_id, param_id)

    rows = [
        row for row in fetch_stat_rows(gauge_id, param_id)
        if int(row["month_nu"]) == month and int(row["day_nu"]) == day
    ]
    if not rows:
        raise LookupError(f"no reference statistics for gauge {gauge_id} on {month}/{day}")

    # a gauge with more than one sensor for a parameter has one row per sensor; use the longest record
    row = max(rows, key=lambda r: int(r["count_nu"]))

    percentiles = {
        pct: float(row[col])
        for col, pct in PERCENTILE_COLUMNS.items()
        if row.get(col)  # some sites leave percentiles blank
    }
    return {
        "percentiles": percentiles,
        "min": float(row["min_va"]),
        "max": float(row["max_va"]),
        "years": int(row["count_nu"]),
    }


def compare_datum_to_reference(reading: float, reference: dict) -> float:
    """
    Uses log probability interpolation to find the percentile (0 to 1) of a reading
    against the reference table from step 1.
    """
    # Step 2: Give the minimum and maximum a percentile (Weibull plotting position)
    n = reference["years"]
    p_min = 1 / (n + 1)
    p_max = n / (n + 1)

    points = {p_min: reference["min"], p_max: reference["max"], **reference["percentiles"]}

    # Step 3: Convert the reference points to the two transformed axes (u = ln(x), z = Φ⁻¹(p))
    # ln is undefined at zero, so non-positive values (e.g. zero flow) are dropped
    axes = sorted(
        (math.log(x), STANDARD_NORMAL.inv_cdf(p), x)
        for p, x in points.items()
        if x > 0
    )

    # a reading outside the record is pinned to the record's percentile
    if reading <= axes[0][2]:
        return p_min
    if reading >= axes[-1][2]:
        return p_max

    # Step 4: Take the reading and find which percentile bracket it's in
    for (u1, z1, x1), (u2, z2, x2) in zip(axes, axes[1:]):
        if x1 <= reading <= x2:
            break

    # Step 5: Find how far along the bracket the reading is
    u = math.log(reading)
    t = 0.0 if u2 == u1 else (u - u1) / (u2 - u1)

    # Step 6: Convert the bracket position into a percentile
    z = z1 + t * (z2 - z1)
    return STANDARD_NORMAL.cdf(z)


def get_todays_percentile(gauge_id: str, param_id: str, reading: float, day: date = None) -> float:
    """
    Gets the reference table for a calendar day (today by default) and returns the percentile of the reading.
    """
    day = day or date.today()
    reference = get_reference_table(gauge_id, param_id, day.month, day.day)
    return compare_datum_to_reference(reading, reference)


def percentile_label(p: float) -> str:
    """
    Maps a percentile (0 to 1) to the USGS flow condition classes.
    """
    if p < 0.10:
        return "much below normal"
    if p < 0.25:
        return "below normal"
    if p <= 0.75:
        return "normal"
    if p <= 0.90:
        return "above normal"
    return "much above normal"


def get_current_percentile(gauge_id: str, param_id: str) -> dict:
    """
    Gets the latest reading at a gauge and compares it to the USGS statistics for that calendar day.
    """
    latest = get_latest_data(gauge_id, param_id)

    # use the reading's own date, not date.today(), which can differ near midnight or when a gauge lags
    day = date.fromisoformat(latest["measured_at"][:10])
    reference = get_reference_table(gauge_id, param_id, day.month, day.day)
    p = compare_datum_to_reference(latest["value"], reference)

    return {
        "gauge_id": gauge_id,
        "site_name": latest["site_name"],
        "parameter": latest["parameter"],
        "param_id": param_id,
        "value": latest["value"],
        "unit": latest["unit"],
        "measured_at": latest["measured_at"],
        "provisional": latest["provisional"],
        "percentile": round(p, 3),
        "percentile_label": percentile_label(p),
        "reference": {
            **{f"p{round(pct * 100):02d}": value for pct, value in reference["percentiles"].items()},
            "min": reference["min"],
            "max": reference["max"],
            "years": reference["years"],
        },
    }
