# =============================================================================
# light.py
# =============================================================================
"""Light platform for Dynamic Light Scheduler."""
import logging
from typing import Any, Dict, Optional

from homeassistant.components.light import LightEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, DATA_COORDINATOR, CONF_TARGET_LIGHT
from .coordinator import DynamicLightCoordinator

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Dynamic Light Scheduler light platform."""
    coordinator = hass.data[DOMAIN][config_entry.entry_id][DATA_COORDINATOR]
    
    async_add_entities([
        DynamicLightSchedulerEntity(coordinator, config_entry)
    ])

class DynamicLightSchedulerEntity(CoordinatorEntity, LightEntity):
    """Representation of a Dynamic Light Scheduler entity."""

    def __init__(self, coordinator: DynamicLightCoordinator, config_entry: ConfigEntry):
        """Initialize the entity."""
        super().__init__(coordinator)
        self.config_entry = config_entry
        self._attr_name = f"{config_entry.title} Scheduler"
        self._attr_unique_id = f"{DOMAIN}_{config_entry.entry_id}"
        self._target_entity_id = config_entry.data[CONF_TARGET_LIGHT]

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, self.config_entry.entry_id)},
            "name": self.config_entry.title,
            "manufacturer": "Dynamic Light Scheduler",
            "model": "Light Scheduler",
            "sw_version": "1.0.0",
        }

    @property
    def is_on(self) -> bool:
        """Return if the scheduler is active."""
        return True  # Scheduler is always considered "on" when configured

    @property
    def brightness(self) -> Optional[int]:
        """Return current target brightness."""
        if self.coordinator.data:
            # Convert percentage to 0-255 range
            brightness_pct = self.coordinator.data.get("target_brightness", 0)
            return round(brightness_pct * 255 / 100)
        return None

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        """Return additional state attributes."""
        if not self.coordinator.data:
            return {}
        
        data = self.coordinator.data
        return {
            "target_entity": self._target_entity_id,
            "target_brightness_pct": data.get("target_brightness", 0),
            "current_brightness_pct": data.get("current_brightness", 0),
            "current_hour": round(data.get("current_hour", 0), 2),
            "schedule_points": data.get("schedule_points", []),
            "schedule_point_count": len(data.get("schedule_points", [])),
            "last_update": data.get("last_update"),
        }

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn on the scheduler (force refresh)."""
        await self.coordinator.async_request_refresh()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn off the scheduler (not implemented - scheduler is always active)."""
        pass  # Could implement pause functionality here