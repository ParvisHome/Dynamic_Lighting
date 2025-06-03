# =============================================================================
# __init__.py
# =============================================================================
"""The Dynamic Light Scheduler integration."""
import asyncio
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from .const import DOMAIN, PLATFORMS, DATA_COORDINATOR, SERVICE_UPDATE_SCHEDULE, SERVICE_SET_POINT
from .coordinator import DynamicLightCoordinator

_LOGGER = logging.getLogger(__name__)

# Service schemas
UPDATE_SCHEDULE_SCHEMA = vol.Schema({
    vol.Required("entity_id"): cv.entity_id,
    vol.Required("schedule_points"): vol.All(cv.ensure_list, [
        vol.Schema({
            vol.Required("hour"): vol.All(vol.Coerce(float), vol.Range(min=0, max=24)),
            vol.Required("brightness"): vol.All(vol.Coerce(int), vol.Range(min=0, max=100))
        })
    ])
})

SET_POINT_SCHEMA = vol.Schema({
    vol.Required("entity_id"): cv.entity_id,
    vol.Required("hour"): vol.All(vol.Coerce(float), vol.Range(min=0, max=24)),
    vol.Required("brightness"): vol.All(vol.Coerce(int), vol.Range(min=0, max=100))
})

async def async_setup(hass: HomeAssistant, config: dict):
    """Set up the Dynamic Light Scheduler component."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Dynamic Light Scheduler from a config entry."""
    coordinator = DynamicLightCoordinator(hass, entry)
    
    await coordinator.async_config_entry_first_refresh()
    
    hass.data[DOMAIN][entry.entry_id] = {
        DATA_COORDINATOR: coordinator,
    }
    
    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    
    # Register services
    async def update_schedule_service(call):
        """Handle the update schedule service."""
        entity_id = call.data["entity_id"]
        schedule_points = call.data["schedule_points"]
        
        # Find the coordinator for this entity
        for entry_id, data in hass.data[DOMAIN].items():
            coord = data[DATA_COORDINATOR]
            if coord.entity_id == entity_id:
                await coord.update_schedule(schedule_points)
                break
    
    async def set_point_service(call):
        """Handle the set schedule point service."""
        entity_id = call.data["entity_id"]
        hour = call.data["hour"]
        brightness = call.data["brightness"]
        
        # Find the coordinator for this entity
        for entry_id, data in hass.data[DOMAIN].items():
            coord = data[DATA_COORDINATOR]
            if coord.entity_id == entity_id:
                await coord.set_schedule_point(hour, brightness)
                break
    
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_SCHEDULE, update_schedule_service, schema=UPDATE_SCHEDULE_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_SET_POINT, set_point_service, schema=SET_POINT_SCHEMA
    )
    
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    
    return unload_ok
