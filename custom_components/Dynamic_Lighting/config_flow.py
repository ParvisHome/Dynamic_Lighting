# =============================================================================
# config_flow.py
# =============================================================================
"""Config flow for Dynamic Light Scheduler integration."""
import logging
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.selector import selector

from .const import DOMAIN, CONF_TARGET_LIGHT, CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL

_LOGGER = logging.getLogger(__name__)

class DynamicLightSchedulerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Dynamic Light Scheduler."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}
        
        if user_input is not None:
            # Validate the input
            try:
                # Check if the target light entity exists
                if user_input[CONF_TARGET_LIGHT] not in self.hass.states.async_entity_ids("light"):
                    errors[CONF_TARGET_LIGHT] = "invalid_entity"
                else:
                    return self.async_create_entry(
                        title=user_input[CONF_NAME],
                        data=user_input
                    )
            except Exception:
                _LOGGER.exception("Unexpected exception")
                errors["base"] = "unknown"

        # Get available light entities
        light_entities = self.hass.states.async_entity_ids("light")
        light_options = [(entity_id, self.hass.states.get(entity_id).attributes.get("friendly_name", entity_id)) 
                        for entity_id in light_entities]

        data_schema = vol.Schema({
            vol.Required(CONF_NAME, default="Dynamic Light Schedule"): str,
            vol.Required(CONF_TARGET_LIGHT): selector({
                "entity": {"domain": "light"}
            }),
            vol.Optional(CONF_UPDATE_INTERVAL, default=DEFAULT_UPDATE_INTERVAL): vol.All(
                vol.Coerce(int), vol.Range(min=30, max=3600)
            )
        })

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return DynamicLightSchedulerOptionsFlow(config_entry)

class DynamicLightSchedulerOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow for Dynamic Light Scheduler."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(
                    CONF_UPDATE_INTERVAL,
                    default=self.config_entry.options.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL)
                ): vol.All(vol.Coerce(int), vol.Range(min=30, max=3600))
            })
        )