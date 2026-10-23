"""
Smoke test for services.observations.get_hourly_data and summarize_hourly against the live USGS API.
Run from backend/: python -m tests.smoke_tests.seven_day_iv_hourly_data_smoke
"""

import json

from services.observations import get_hourly_data, summarize_hourly


if __name__ == "__main__":
    data = get_hourly_data("01646500", ["00060", "00010"], days=2)  # Little Falls

    # the full hourly data, as the dashboard charts will get it
    for param_id, info in data.items():
        print(f"\n{info['parameter']} ({info['unit']}): {len(info['hourly'])} hours")
        for h in info["hourly"][-5:]:  # last 5 hours
            print(f"  {h['hour']}  mean={h['mean']}  readings={h['readings']}")

    # the summary, as the agent will get it
    print("\nSummary for the agent:")
    print(json.dumps(summarize_hourly(data), indent=2))
