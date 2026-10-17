"""

This file serves as a registry for USGS gauges. It contains a dictionary of gauge IDs and their corresponding information.
The information includes the gauge id mapped to the common name, and available parameters.
The gauges are as follows:


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

from services.params import PARAMS

# params are the codes from services/params.py that each gauge actively reports
GAUGE_REGISTRY = {
    "01646500": {
        "name": "Potomac River near Wash, DC Little Falls Pump Sta",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "63680", "99133"],
    },
    "01646000": {
        "name": "Difficult Run near Great Falls, VA",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "99133"],
    },
    "01638500": {
        "name": "Potomac River at Point of Rocks, MD",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "63680"],
    },
    "01644000": {
        "name": "Goose Creek near Leesburg, VA",
        "params": ["00060", "00065"],
    },
    "01643000": {
        "name": "Monocacy River at Jug Bridge near Frederick, MD",
        "params": ["00060", "00065"],
    },
    "01645000": {
        "name": "Seneca Creek at Dawsonville, MD",
        "params": ["00060", "00065"],
    },
    "01649500": {
        "name": "Northeast Branch Anacostia River at Riverdale, MD",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "63680"],
    },
    "01654000": {
        "name": "Accotink Creek near Annandale, VA",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "99133"],
    },
    "01668000": {
        "name": "Rappahannock River near Fredericksburg, VA",
        "params": ["00060", "00065", "00010", "00095", "00300", "00400", "99133"],
    },
}


def validate_gauge_param(gauge_id: str, param_id: str) -> None:
    """
    Raises ValueError when the gauge is unknown, the parameter is unsupported,
    or the gauge doesn't report that parameter. The message lists what is available.
    """
    if gauge_id not in GAUGE_REGISTRY:
        raise ValueError(f"Unknown gauge {gauge_id}. Known gauges: {', '.join(GAUGE_REGISTRY)}")

    if param_id not in PARAMS:
        raise ValueError(f"Unsupported parameter code: {param_id}")

    gauge = GAUGE_REGISTRY[gauge_id]
    if param_id not in gauge["params"]:
        available = ", ".join(f"{p} ({PARAMS[p]})" for p in gauge["params"])
        raise ValueError(
            f"{gauge['name']} ({gauge_id}) doesn't report {PARAMS[param_id]} ({param_id}). "
            f"Available: {available}"
        )


def list_gauges() -> list[dict]:
    """
    Returns every gauge with its name and the parameters it reports.
    """
    return [
        {
            "gauge_id": gauge_id,
            "name": gauge["name"],
            "params": [{"param_id": p, "name": PARAMS[p]} for p in gauge["params"]],
        }
        for gauge_id, gauge in GAUGE_REGISTRY.items()
    ]

