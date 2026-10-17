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

