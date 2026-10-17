import math
import sys
import unittest
from datetime import date
from pathlib import Path
from statistics import NormalDist
from unittest.mock import MagicMock, patch

import requests

# put the repo root on the path so `backend` resolves when this file is run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.services.params import PARAMS

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
def get_reference_table(gauge_id: str, param_id: str, month: int, day: int) -> dict:
    """
    This method gets the USGS reference table and returns the percentile values
    and passes it to the compare_datum_to_reference method to determine the 
    percentile of the reading. 
    
    The reference table is a dictionary with the following keys:
    - percentiles: a dictionary of percentiles and their corresponding values
    - min: the record minimum value
    - max: the record maximum value
    - years: the number of years of record

    """

    if param_id not in PARAMS:
        raise ValueError(f"Unsupported parameter code: {param_id}")

    params = {
        "format": "rdb",
        "sites": gauge_id,
        "parameterCd": param_id,
        "statReportType": "daily",
        "statTypeCd": "all",
    }
    res = requests.get("https://waterservices.usgs.gov/nwis/stat/", params=params, timeout=15)
    res.raise_for_status()

    # the lines property is a list of all lines, and it filters out comments and blank lines.
    lines = [line for line in res.text.splitlines() if line and not line.startswith("#")]

    header = lines[0].split("\t") # header lines with column names

    for line in lines[2:]:
        row = dict(zip(header, line.split("\t")))
        if int(row["month_nu"]) != month or int(row["day_nu"]) != day:
            continue

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

    raise LookupError(f"no reference statistics for gauge {gauge_id} on {month}/{day}")


def compare_datum_to_reference(reading: float, reference: dict) -> float:
    """
    Uses log probability interpolation to find the percentile (0 to 1) of today's reading
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

    # Step 4: Take today's reading and find which percentile bracket it's in
    for (u1, z1, x1), (u2, z2, x2) in zip(axes, axes[1:]):
        if x1 <= reading <= x2:
            break

    # Step 5: Find how far along the bracket the reading is
    u = math.log(reading)
    t = 0.0 if u2 == u1 else (u - u1) / (u2 - u1)

    # Step 6: Convert the bracket position into a percentile
    z = z1 + t * (z2 - z1)
    p = STANDARD_NORMAL.cdf(z)

    # Return the percentile of the reading (0 to 1)
    return p


# ---------------------------------------------------------------------------
# This is the main method that calls both of the helper functions above
# ---------------------------------------------------------------------------
def get_todays_percentile(gauge_id: str, param_id: str, reading: float, day: date = None) -> float:
    """
    Gets the reference table for today's calendar day and returns the percentile of the reading.
    """
    day = day or date.today()
    reference = get_reference_table(gauge_id, param_id, day.month, day.day)
    return compare_datum_to_reference(reading, reference)


# ---------------------------------------------------------------------------
# Unit tests on synthetic data
# ---------------------------------------------------------------------------

# synthetic log-normal river: ln(flow) ~ N(ln(1000), 0.8), so every percentile is known exactly
MU, SIGMA = math.log(1000), 0.8
SYNTHETIC_YEARS = 49  # makes p_min = 0.02, p_max = 0.98


def lognormal_value(p: float) -> float:
    return math.exp(MU + SIGMA * STANDARD_NORMAL.inv_cdf(p))


SYNTHETIC_REFERENCE = {
    "percentiles": {p: lognormal_value(p) for p in PERCENTILE_COLUMNS.values()},
    "min": lognormal_value(1 / (SYNTHETIC_YEARS + 1)),
    "max": lognormal_value(SYNTHETIC_YEARS / (SYNTHETIC_YEARS + 1)),
    "years": SYNTHETIC_YEARS,
}

SYNTHETIC_RDB = "\n".join([
    "# synthetic USGS stat service response",
    "\t".join(["agency_cd", "site_no", "parameter_cd", "month_nu", "day_nu", "count_nu",
               "max_va", "min_va", *PERCENTILE_COLUMNS]),
    "\t".join(["5s", "15s", "5s", "3n", "3n", "8n", "12s", "12s", *["12s"] * len(PERCENTILE_COLUMNS)]),
    "\t".join(["USGS", "01646500", "00060", "10", "16", "10", "9000", "100",
               "150", "200", "350", "500", "800", "1500", "2000"]),
    "\t".join(["USGS", "01646500", "00060", "10", "17", "20", "8000", "120",
               "160", "", "360", "520", "820", "", "2100"]),
])


class TestStep1ReferenceTable(unittest.TestCase):

    @patch("requests.get")
    def test_parses_the_matching_day(self, mock_get):
        mock_get.return_value = MagicMock(text=SYNTHETIC_RDB)

        ref = get_reference_table("01646500", "00060", 10, 17)

        self.assertEqual(ref["years"], 20)
        self.assertEqual(ref["min"], 120.0)
        self.assertEqual(ref["max"], 8000.0)
        self.assertEqual(ref["percentiles"][0.50], 520.0)
        # blank percentile columns are skipped
        self.assertNotIn(0.10, ref["percentiles"])
        self.assertNotIn(0.90, ref["percentiles"])

    @patch("requests.get")
    def test_missing_day_raises(self, mock_get):
        mock_get.return_value = MagicMock(text=SYNTHETIC_RDB)
        with self.assertRaises(LookupError):
            get_reference_table("01646500", "00060", 1, 1)

    def test_unsupported_param_raises(self):
        with self.assertRaises(ValueError):
            get_reference_table("01646500", "not-a-param", 10, 17)


class TestLogProbabilityInterpolation(unittest.TestCase):

    def test_reference_points_return_their_own_percentile(self):
        for p, x in SYNTHETIC_REFERENCE["percentiles"].items():
            self.assertAlmostEqual(compare_datum_to_reference(x, SYNTHETIC_REFERENCE), p, places=9)

    def test_recovers_exact_percentile_of_lognormal_data(self):
        # log probability interpolation is exact for log-normal data, so any reading inside the record matches
        for p in [0.03, 0.07, 0.15, 0.33, 0.42, 0.61, 0.77, 0.85, 0.93, 0.97]:
            self.assertAlmostEqual(compare_datum_to_reference(lognormal_value(p), SYNTHETIC_REFERENCE), p, places=9)

    def test_weibull_record_min_and_max(self):
        self.assertAlmostEqual(compare_datum_to_reference(SYNTHETIC_REFERENCE["min"], SYNTHETIC_REFERENCE), 0.02)
        self.assertAlmostEqual(compare_datum_to_reference(SYNTHETIC_REFERENCE["max"], SYNTHETIC_REFERENCE), 0.98)

    def test_readings_outside_the_record_are_pinned(self):
        self.assertAlmostEqual(compare_datum_to_reference(1, SYNTHETIC_REFERENCE), 0.02)
        self.assertAlmostEqual(compare_datum_to_reference(10**7, SYNTHETIC_REFERENCE), 0.98)

    def test_hand_computed_bracket(self):
        # p25 = 100, p50 = 1000: a reading of 10**2.5 sits halfway along the log axis
        ref = {"percentiles": {0.25: 100.0, 0.50: 1000.0}, "min": 10.0, "max": 10000.0, "years": 9}
        expected = STANDARD_NORMAL.cdf(0.5 * STANDARD_NORMAL.inv_cdf(0.25))
        self.assertAlmostEqual(compare_datum_to_reference(10**2.5, ref), expected, places=12)

    def test_increases_with_reading(self):
        readings = [lognormal_value(p) for p in [0.05, 0.2, 0.5, 0.8, 0.95]]
        results = [compare_datum_to_reference(x, SYNTHETIC_REFERENCE) for x in readings]
        self.assertEqual(results, sorted(results))

    def test_zero_flow_record_minimum_is_ignored(self):
        ref = {**SYNTHETIC_REFERENCE, "min": 0.0}
        self.assertAlmostEqual(compare_datum_to_reference(lognormal_value(0.5), ref), 0.5, places=9)

    @patch("requests.get")
    def test_end_to_end_with_synthetic_rdb(self, mock_get):
        mock_get.return_value = MagicMock(text=SYNTHETIC_RDB)
        # median on 10/16 is 500, so a reading of 500 is the 50th percentile
        p = get_todays_percentile("01646500", "00060", 500, date(2026, 10, 16))
        self.assertAlmostEqual(p, 0.5, places=12)


if __name__ == "__main__":
    unittest.main(verbosity=2)
