"""
Offline unit tests for services/observations.py. Every USGS call is replaced with a hand-made response.
Run from backend/: python -m unittest discover -s tests/unit_tests -p "*test*.py"
"""

import unittest
from unittest.mock import patch

from services.observations import (
    get_daily_mean,
    get_hourly_data,
    get_latest_data,
    summarize_hourly,
)

# the placeholder USGS puts in place of a missing reading (ice, broken sensor, maintenance)
NO_DATA = -999999

LITTLE_FALLS = "01646500"
GOOSE_CREEK = "01644000"  # only reports 00060 and 00065


# ---------------------------------------------------------------------------
# Hand-made USGS JSON responses
# ---------------------------------------------------------------------------
def make_series(param_id: str, readings: list[tuple], unit: str = "ft3/s",
                site_name: str = "POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA") -> dict:
    """
    Builds one USGS timeSeries entry (one sensor). readings is a list of (dateTime, value, qualifiers).
    """
    return {
        "sourceInfo": {"siteName": site_name},
        "variable": {
            "variableCode": [{"value": param_id}],
            "unit": {"unitCode": unit},
            "noDataValue": NO_DATA,
        },
        "values": [{
            "value": [
                {"dateTime": t, "value": str(v), "qualifiers": q}
                for t, v, q in readings
            ],
        }],
    }


def make_payload(*series: dict) -> dict:
    return {"value": {"timeSeries": list(series)}}


def make_hourly(means: list) -> dict:
    """
    Builds get_hourly_data output for discharge, one hour per mean (None = an hour with no readings).
    """
    return {
        "00060": {
            "parameter": "discharge",
            "unit": "ft3/s",
            "hourly": [
                {"hour": f"2026-10-16T{h:02d}:00:00-04:00", "mean": m, "readings": 0 if m is None else 4}
                for h, m in enumerate(means)
            ],
        }
    }


# ---------------------------------------------------------------------------
# get_latest_data
# ---------------------------------------------------------------------------
@patch("services.observations.fetch_json")
class TestGetLatestData(unittest.TestCase):

    def test_skips_trailing_no_data_reading(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [
            ("2026-10-16T10:00:00.000-04:00", 8000, ["P"]),
            ("2026-10-16T10:15:00.000-04:00", 8100, ["P"]),
            ("2026-10-16T10:30:00.000-04:00", NO_DATA, ["P", "Eqp"]),
        ]))

        latest = get_latest_data(LITTLE_FALLS, "00060")

        self.assertEqual(latest["value"], 8100.0)
        self.assertEqual(latest["measured_at"], "2026-10-16T10:15:00.000-04:00")
        self.assertEqual(latest["unit"], "ft3/s")
        self.assertEqual(latest["parameter"], "discharge")
        self.assertTrue(latest["provisional"])

    def test_picks_newest_reading_across_sensors(self, mock_fetch):
        mock_fetch.return_value = make_payload(
            make_series("00060", [("2026-10-16T10:45:00.000-04:00", 8200, ["P"])]),
            make_series("00060", [("2026-10-16T11:00:00.000-04:00", 8300, ["A"])]),
        )

        latest = get_latest_data(LITTLE_FALLS, "00060")

        self.assertEqual(latest["value"], 8300.0)
        self.assertFalse(latest["provisional"])

    def test_empty_response_raises(self, mock_fetch):
        mock_fetch.return_value = make_payload()
        with self.assertRaises(LookupError):
            get_latest_data(LITTLE_FALLS, "00060")

    def test_only_no_data_readings_raises(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [
            ("2026-10-16T10:00:00.000-04:00", NO_DATA, ["Ice"]),
        ]))
        with self.assertRaises(LookupError):
            get_latest_data(LITTLE_FALLS, "00060")

    def test_unreported_param_raises_before_calling_usgs(self, mock_fetch):
        with self.assertRaises(ValueError) as ctx:
            get_latest_data(GOOSE_CREEK, "00010")

        self.assertIn("Available", str(ctx.exception))
        mock_fetch.assert_not_called()

    def test_unknown_gauge_raises_before_calling_usgs(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_latest_data("99999999", "00060")
        mock_fetch.assert_not_called()


# ---------------------------------------------------------------------------
# get_daily_mean
# ---------------------------------------------------------------------------
@patch("services.observations.fetch_json")
class TestGetDailyMean(unittest.TestCase):

    def test_parses_daily_means_and_skips_no_data(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [
            ("2026-10-10T00:00:00.000", 1500, ["P"]),
            ("2026-10-11T00:00:00.000", NO_DATA, ["P"]),
            ("2026-10-12T00:00:00.000", 9830, ["A"]),
        ]))

        means = get_daily_mean(LITTLE_FALLS, "00060", "2026-10-10", "2026-10-12")

        self.assertEqual([m["date"] for m in means], ["2026-10-10", "2026-10-12"])
        self.assertEqual(means[0]["mean"], 1500.0)
        self.assertTrue(means[0]["provisional"])
        self.assertFalse(means[1]["provisional"])

    def test_passes_date_range_to_usgs(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [("2026-10-01T00:00:00.000", 1500, ["P"])]))

        get_daily_mean(LITTLE_FALLS, "00060", "2026-10-01", "2026-10-09")

        params = mock_fetch.call_args.args[1]
        self.assertEqual((params["startDT"], params["endDT"]), ("2026-10-01", "2026-10-09"))

    def test_one_date_means_that_single_day(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [("2026-10-05T00:00:00.000", 1500, ["P"])]))

        get_daily_mean(LITTLE_FALLS, "00060", end_date="2026-10-05")

        params = mock_fetch.call_args.args[1]
        self.assertEqual((params["startDT"], params["endDT"]), ("2026-10-05", "2026-10-05"))

    def test_no_dates_asks_for_the_latest_day(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", [("2026-10-16T00:00:00.000", 1500, ["P"])]))

        get_daily_mean(LITTLE_FALLS, "00060")

        params = mock_fetch.call_args.args[1]
        self.assertNotIn("startDT", params)
        self.assertNotIn("endDT", params)

    def test_bad_date_string_raises(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_daily_mean(LITTLE_FALLS, "00060", "10/01/2026", "2026-10-09")
        mock_fetch.assert_not_called()

    def test_start_after_end_raises(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_daily_mean(LITTLE_FALLS, "00060", "2026-10-09", "2026-10-01")
        mock_fetch.assert_not_called()

    def test_range_over_366_days_raises(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_daily_mean(LITTLE_FALLS, "00060", "2024-01-01", "2026-01-01")
        mock_fetch.assert_not_called()

    def test_no_means_raises(self, mock_fetch):
        # e.g. gage height, which USGS has no daily means for at any of the 9 gauges
        mock_fetch.return_value = make_payload()
        with self.assertRaises(LookupError):
            get_daily_mean(LITTLE_FALLS, "00065")


# ---------------------------------------------------------------------------
# get_hourly_data
# ---------------------------------------------------------------------------
@patch("services.observations.fetch_json")
class TestGetHourlyData(unittest.TestCase):

    READINGS = [
        ("2026-10-16T10:00:00.000-04:00", 100, ["P"]),
        ("2026-10-16T10:15:00.000-04:00", 200, ["P"]),
        ("2026-10-16T10:30:00.000-04:00", NO_DATA, ["P"]),
        ("2026-10-16T11:00:00.000-04:00", 300, ["P"]),
    ]

    def test_averages_readings_into_hours(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", self.READINGS))

        hourly = get_hourly_data(LITTLE_FALLS, ["00060"], days=1)["00060"]["hourly"]

        # 10:00 hour = mean of 100 and 200 (the no-data reading is skipped), 11:00 hour = 300
        self.assertEqual([(h["mean"], h["readings"]) for h in hourly], [(150.0, 2), (300.0, 1)])
        self.assertEqual(hourly[0]["hour"], "2026-10-16T10:00:00-04:00")

    def test_days_are_clamped_to_7(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", self.READINGS))

        get_hourly_data(LITTLE_FALLS, ["00060"], days=30)

        self.assertEqual(mock_fetch.call_args.args[1]["period"], "P7D")

    def test_days_are_clamped_to_1(self, mock_fetch):
        mock_fetch.return_value = make_payload(make_series("00060", self.READINGS))

        get_hourly_data(LITTLE_FALLS, ["00060"], days=0)

        self.assertEqual(mock_fetch.call_args.args[1]["period"], "P1D")

    def test_one_unreported_param_raises_before_calling_usgs(self, mock_fetch):
        with self.assertRaises(ValueError):
            get_hourly_data(GOOSE_CREEK, ["00060", "00010"])
        mock_fetch.assert_not_called()

    def test_no_readings_raises(self, mock_fetch):
        mock_fetch.return_value = make_payload()
        with self.assertRaises(LookupError):
            get_hourly_data(LITTLE_FALLS, ["00060"])


# ---------------------------------------------------------------------------
# summarize_hourly
# ---------------------------------------------------------------------------
class TestSummarizeHourly(unittest.TestCase):

    def test_min_max_latest_and_mean(self):
        summary = summarize_hourly(make_hourly([10, None, 30, 5, 20]))["00060"]

        self.assertEqual(summary["latest_mean"], 20)
        self.assertEqual(summary["min"], {"value": 5, "hour": "2026-10-16T03:00:00-04:00"})
        self.assertEqual(summary["max"], {"value": 30, "hour": "2026-10-16T02:00:00-04:00"})
        self.assertEqual(summary["overall_mean"], 16.25)
        # the hour with no data is skipped
        self.assertEqual(summary["hours_with_data"], 4)
        self.assertEqual(summary["first_hour"], "2026-10-16T00:00:00-04:00")
        self.assertEqual(summary["last_hour"], "2026-10-16T04:00:00-04:00")
        self.assertEqual(summary["unit"], "ft3/s")

    def test_rising(self):
        summary = summarize_hourly(make_hourly([100] * 6 + [120] * 6))["00060"]
        self.assertEqual(summary["trend"], "rising")

    def test_falling(self):
        summary = summarize_hourly(make_hourly([100] * 6 + [80] * 6))["00060"]
        self.assertEqual(summary["trend"], "falling")

    def test_steady_under_threshold(self):
        # a 2% change is under the 5% threshold
        summary = summarize_hourly(make_hourly([100] * 6 + [102] * 6))["00060"]
        self.assertEqual(summary["trend"], "steady")

    def test_not_enough_data(self):
        summary = summarize_hourly(make_hourly([100] * 11))["00060"]
        self.assertEqual(summary["trend"], "not enough data")

    def test_param_with_no_data_is_left_out(self):
        self.assertEqual(summarize_hourly(make_hourly([None, None])), {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
