"""
Smoke test for services.observations.get_latest_data against the live USGS API.
Run from backend/: python -m tests.smoke_tests.get_discharge
"""

from services.gauge_registry import GAUGE_REGISTRY
from services.observations import get_latest_data
from services.params import PARAMS


if __name__ == "__main__":
    # every gauge in the registry, and only the parameters each one reports
    for gauge_id, gauge in GAUGE_REGISTRY.items():
        for param_id in gauge["params"]:
            try:
                result = get_latest_data(gauge_id, param_id)
            except Exception as e:
                result = f"ERROR {type(e).__name__}: {e}"
            print(f"Most Recent {PARAMS[param_id]} values for {gauge_id} ({gauge['name']}):\n{result}\n")
