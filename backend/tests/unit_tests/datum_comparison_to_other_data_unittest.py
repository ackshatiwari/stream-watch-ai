import math
import unittest
from datetime import date
from unittest.mock import patch

from services.get_percentile import (
    PERCENTILE_COLUMNS,
    STANDARD_NORMAL,
    compare_datum_to_reference,
    fetch_stat_rows,
    get_current_percentile,
    get_reference_table,
    get_todays_percentile,
    percentile_label,
)

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

RDB_HEADER = [
    "# synthetic USGS stat service response",
    "\t".join(["agency_cd", "site_no", "parameter_cd", "month_nu", "day_nu", "count_nu",
               "max_va", "min_va", *PERCENTILE_COLUMNS]),
    "\t".join(["5s", "15s", "5s", "3n", "3n", "8n", "12s", "12s", *["12s"] * len(PERCENTILE_COLUMNS)]),
]

SYNTHETIC_RDB = "\n".join([
    *RDB_HEADER,
    "\t".join(["USGS", "01646500", "00060", "10", "16", "10", "9000", "100",
               "150", "200", "350", "500", "800", "1500", "2000"]),
    "\t".join(["USGS", "01646500", "00060", "10", "17", "20", "8000", "120",
               "160", "", "360", "520", "820", "", "2100"]),
])

# two sensors report 10/16: the second has the longer record, so it should be used
TWO_SENSOR_RDB = "\n".join([
    *RDB_HEADER,
    "\t".join(["USGS", "01646500", "00060", "10", "16", "5", "900", "10",
               "15", "20", "35", "50", "80", "150", "200"]),
    "\t".join(["USGS", "01646500", "00060", "10", "16", "40", "9000", "100",
               "150", "200", "350", "500", "800", "1500", "2000"]),
])


class StatCacheTestCase(unittest.TestCase):
    """
    fetch_stat_rows is cached, so a mocked response would leak into the next test without this.
    """

    def setUp(self):
        fetch_stat_rows.cache_clear()

    def tearDown(self):
        fetch_stat_rows.cache_clear()


@patch("services.get_percentile.fetch_text")
class TestStep1ReferenceTable(StatCacheTestCase):

    def test_parses_the_matching_day(self, mock_fetch):
        mock_fetch.return_value = SYNTHETIC_RDB

        ref = get_reference_table("01646500", "00060", 10, 17)

        self.assertEqual(ref["years"], 20)
        self.assertEqual(ref["min"], 120.0)
        self.assertEqual(ref["max"], 8000.0)
        self.assertEqual(ref["percentiles"][0.50], 520.0)
        # blank percentile columns are skipped
        self.assertNotIn(0.10, ref["percentiles"])
        self.assertNotIn(0.90, ref["percentiles"])

    def test_missing_day_raises(self, mock_fetch):
        mock_fetch.return_value = SYNTHETIC_RDB
        with self.assertRaises(LookupError):
            get_reference_table("01646500", "00060", 1, 1)

    def test_empty_response_raises(self, mock_fetch):
        # USGS sends an empty body when it has no statistics (e.g. Goose Creek gage height)
        mock_fetch.return_value = ""
        with self.assertRaises(LookupError):
            get_reference_table("01646500", "00060", 10, 17)

    def test_uses_the_sensor_with_the_longest_record(self, mock_fetch):
        mock_fetch.return_value = TWO_SENSOR_RDB

        ref = get_reference_table("01646500", "00060", 10, 16)

        self.assertEqual(ref["years"], 40)
        self.assertEqual(ref["percentiles"][0.50], 500.0)

    def test_year_of_statistics_is_fetched_once(self, mock_fetch):
        mock_fetch.return_value = SYNTHETIC_RDB

        get_reference_table("01646500", "00060", 10, 16)
        get_reference_table("01646500", "00060", 10, 17)

        mock_fetch.assert_called_once()

    def test_unsupported_param_raises(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_reference_table("01646500", "not-a-param", 10, 17)
        mock_fetch.assert_not_called()

    def test_unreported_param_raises_before_calling_usgs(self, mock_fetch):
        # Goose Creek only reports discharge and gage height
        with self.assertRaises(ValueError):
            get_reference_table("01644000", "00010", 10, 17)
        mock_fetch.assert_not_called()


class TestLogProbabilityInterpolation(StatCacheTestCase):

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

    @patch("services.get_percentile.fetch_text")
    def test_end_to_end_with_synthetic_rdb(self, mock_fetch):
        mock_fetch.return_value = SYNTHETIC_RDB
        # median on 10/16 is 500, so a reading of 500 is the 50th percentile
        p = get_todays_percentile("01646500", "00060", 500, date(2026, 10, 16))
        self.assertAlmostEqual(p, 0.5, places=12)


class TestPercentileLabel(unittest.TestCase):

    def test_usgs_classes(self):
        cases = {
            0.05: "much below normal",
            0.10: "below normal",
            0.24: "below normal",
            0.25: "normal",
            0.75: "normal",
            0.76: "above normal",
            0.90: "above normal",
            0.91: "much above normal",
        }
        for p, label in cases.items():
            self.assertEqual(percentile_label(p), label, f"percentile {p}")


@patch("services.get_percentile.fetch_text", return_value=SYNTHETIC_RDB)
@patch("services.get_percentile.get_latest_data")
class TestGetCurrentPercentile(StatCacheTestCase):

    LATEST = {
        "gauge_id": "01646500",
        "site_name": "POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA",
        "parameter": "discharge",
        "param_id": "00060",
        "value": 500.0,
        "unit": "ft3/s",
        "measured_at": "2026-10-16T23:45:00.000-04:00",
        "provisional": True,
    }

    def test_combines_latest_reading_and_reference(self, mock_latest, mock_fetch):
        mock_latest.return_value = self.LATEST

        result = get_current_percentile("01646500", "00060")

        # 500 is the 10/16 median
        self.assertEqual(result["percentile"], 0.5)
        self.assertEqual(result["percentile_label"], "normal")
        self.assertEqual(result["value"], 500.0)
        self.assertEqual(result["unit"], "ft3/s")
        self.assertTrue(result["provisional"])
        self.assertEqual(result["reference"]["p50"], 500.0)
        self.assertEqual(result["reference"]["p05"], 150.0)
        self.assertEqual(result["reference"]["years"], 10)

    def test_uses_the_readings_date_not_today(self, mock_latest, mock_fetch):
        # the reading is from 10/16, so the 10/16 row is used even if today is a different day
        mock_latest.return_value = self.LATEST

        result = get_current_percentile("01646500", "00060")

        self.assertEqual(result["reference"]["max"], 9000.0)  # 10/16 row, not 10/17 (8000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
