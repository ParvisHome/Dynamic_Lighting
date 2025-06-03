# =============================================================================
# const.py
# =============================================================================
"""Constants for the Dynamic Light Scheduler integration."""
from datetime import timedelta

DOMAIN = "dynamic_light_scheduler"
PLATFORMS = ["light"]

# Configuration keys
CONF_TARGET_LIGHT = "target_light"
CONF_SCHEDULE_POINTS = "schedule_points"
CONF_UPDATE_INTERVAL = "update_interval"

# Default values
DEFAULT_UPDATE_INTERVAL = 120  # 2 minutes in seconds
DEFAULT_SCHEDULE_POINTS = [
    {"hour": 0, "brightness": 10},
    {"hour": 6, "brightness": 30},
    {"hour": 8, "brightness": 70},
    {"hour": 12, "brightness": 90},
    {"hour": 18, "brightness": 80},
    {"hour": 21, "brightness": 40},
    {"hour": 23, "brightness": 15}
]

# Service names
SERVICE_UPDATE_SCHEDULE = "update_schedule"
SERVICE_SET_POINT = "set_schedule_point"

# Data keys
DATA_COORDINATOR = "coordinator"

# Update interval
SCAN_INTERVAL = timedelta(seconds=DEFAULT_UPDATE_INTERVAL)