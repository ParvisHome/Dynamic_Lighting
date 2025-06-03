# =============================================================================
# coordinator.py
# =============================================================================
"""Data update coordinator for Dynamic Light Scheduler."""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any
import math

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON, STATE_OFF
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.event import async_track_time_interval

from .const import (
    DOMAIN,
    CONF_TARGET_LIGHT,
    CONF_SCHEDULE_POINTS,
    CONF_UPDATE_INTERVAL,
    DEFAULT_SCHEDULE_POINTS,
    DEFAULT_UPDATE_INTERVAL,
    SCAN_INTERVAL
)

_LOGGER = logging.getLogger(__name__)

class DynamicLightCoordinator(DataUpdateCoordinator):
    """Coordinator to manage dynamic light scheduling."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry):
        """Initialize the coordinator."""
        self.hass = hass
        self.entry = entry
        self.entity_id = entry.data[CONF_TARGET_LIGHT]
        self.schedule_points = entry.options.get(CONF_SCHEDULE_POINTS, DEFAULT_SCHEDULE_POINTS.copy())
        self.update_interval = entry.options.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL)
        
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=self.update_interval),
        )

    async def _async_update_data(self) -> Dict[str, Any]:
        """Fetch data from API endpoint."""
        try:
            current_time = datetime.now()
            current_hour = current_time.hour + current_time.minute / 60
            
            # Calculate current brightness based on schedule
            target_brightness = self.interpolate_brightness(current_hour)
            
            # Get current light state
            light_state = self.hass.states.get(self.entity_id)
            if light_state is None:
                raise UpdateFailed(f"Light entity {self.entity_id} not found")
            
            current_brightness = 0
            if light_state.state == STATE_ON:
                current_brightness = light_state.attributes.get("brightness_pct", 0)
            
            # Update light if needed
            brightness_diff = abs(target_brightness - current_brightness)
            if brightness_diff >= 1:  # Only update if difference is >= 1%
                await self.set_light_brightness(target_brightness)
            
            return {
                "current_hour": current_hour,
                "target_brightness": target_brightness,
                "current_brightness": current_brightness,
                "schedule_points": self.schedule_points,
                "last_update": current_time,
            }
            
        except Exception as err:
            raise UpdateFailed(f"Error communicating with light: {err}")

    def interpolate_brightness(self, hour: float) -> int:
        """Interpolate brightness value for given hour using smooth curves."""
        if not self.schedule_points:
            return 50
        
        # Sort points by hour
        sorted_points = sorted(self.schedule_points, key=lambda x: x["hour"])
        
        # Handle wrap-around for 24-hour cycle
        extended_points = []
        
        # Add points from previous day
        for point in sorted_points:
            extended_points.append({
                "hour": point["hour"] - 24,
                "brightness": point["brightness"]
            })
        
        # Add current day points
        extended_points.extend(sorted_points)
        
        # Add points from next day
        for point in sorted_points:
            extended_points.append({
                "hour": point["hour"] + 24,
                "brightness": point["brightness"]
            })
        
        # Find surrounding points
        before_point = extended_points[0]
        after_point = extended_points[-1]
        
        for i in range(len(extended_points) - 1):
            if extended_points[i]["hour"] <= hour <= extended_points[i + 1]["hour"]:
                before_point = extended_points[i]
                after_point = extended_points[i + 1]
                break
        
        if before_point["hour"] == after_point["hour"]:
            return round(before_point["brightness"])
        
        # Smooth interpolation using smoothstep function
        t = (hour - before_point["hour"]) / (after_point["hour"] - before_point["hour"])
        smooth_t = t * t * (3 - 2 * t)  # Smoothstep for natural transitions
        
        brightness = before_point["brightness"] + (after_point["brightness"] - before_point["brightness"]) * smooth_t
        return round(max(0, min(100, brightness)))

    async def set_light_brightness(self, brightness: int):
        """Set the target light brightness."""
        if brightness == 0:
            await self.hass.services.async_call(
                "light",
                "turn_off",
                {"entity_id": self.entity_id}
            )
        else:
            await self.hass.services.async_call(
                "light",
                "turn_on",
                {
                    "entity_id": self.entity_id,
                    "brightness_pct": brightness
                }
            )
        
        _LOGGER.debug(f"Set {self.entity_id} brightness to {brightness}%")

    async def update_schedule(self, new_points: List[Dict[str, Any]]):
        """Update the schedule points."""
        self.schedule_points = new_points
        
        # Save to config entry options
        new_options = dict(self.entry.options)
        new_options[CONF_SCHEDULE_POINTS] = new_points
        
        self.hass.config_entries.async_update_entry(
            self.entry,
            options=new_options
        )
        
        # Force immediate update
        await self.async_request_refresh()
        
        _LOGGER.info(f"Updated schedule for {self.entity_id} with {len(new_points)} points")

    async def set_schedule_point(self, hour: float, brightness: int):
        """Set or update a single schedule point."""
        # Find existing point at similar time (within 30 minutes)
        existing_index = None
        for i, point in enumerate(self.schedule_points):
            if abs(point["hour"] - hour) < 0.5:
                existing_index = i
                break
        
        new_point = {"hour": hour, "brightness": brightness}
        
        if existing_index is not None:
            self.schedule_points[existing_index] = new_point
        else:
            self.schedule_points.append(new_point)
            self.schedule_points.sort(key=lambda x: x["hour"])
        
        await self.update_schedule(self.schedule_points)