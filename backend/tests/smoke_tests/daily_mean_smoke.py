"""
Smoke test for services.observations.get_daily_mean against the live USGS API.
Run from backend/: python -m tests.smoke_tests.daily_mean_smoke
"""

from services.gauge_registry import GAUGE_REGISTRY
from services.observations import get_daily_mean
from services.params import PARAMS

START_DATE, END_DATE = "2026-10-01", "2026-10-09"


def try_daily_mean(gauge_id: str, param_id: str, start_date: str = None, end_date: str = None):
    # the service raises instead of returning None, so print the error and keep looping
    try:
        return get_daily_mean(gauge_id, param_id, start_date, end_date)
    except Exception as e:
        return f"ERROR {type(e).__name__}: {e}"


if __name__ == "__main__":
    # every gauge in the registry, and only the parameters each one reports
    for gauge_id, gauge in GAUGE_REGISTRY.items():
        for param_id in gauge["params"]:
            name = PARAMS[param_id]
            print(f"Daily mean {name} (Latest Day) for {gauge_id}:\n{try_daily_mean(gauge_id, param_id)}\n")
            print(f"Daily mean {name} ({START_DATE} to {END_DATE}) for {gauge_id}:\n"
                  f"{try_daily_mean(gauge_id, param_id, START_DATE, END_DATE)}\n")
