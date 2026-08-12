"""Settings persistence for the Jira Test Case Generator."""

import json
import os

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

DEFAULT_SETTINGS = {
    "jira_url": "",
    "jira_email": "",
    "jira_token": "",
    "local_llm_url": "http://localhost:1234/v1",
    "groq_api_key": "",
    "llm_provider_preference": "local",
}


def load_settings():
    """Load settings from the config file, falling back to defaults on any error."""
    settings = dict(DEFAULT_SETTINGS)
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                settings.update({k: v for k, v in saved.items() if k in DEFAULT_SETTINGS})
    except (OSError, ValueError):
        pass
    return settings


def save_settings(settings):
    """Persist settings to the config file."""
    clean = {k: settings.get(k, DEFAULT_SETTINGS.get(k, "")) for k in DEFAULT_SETTINGS}
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(clean, f, indent=2)


def settings_ready(settings):
    """Return True when the settings needed to fetch a Jira issue are present."""
    return bool(settings.get("jira_url") and settings.get("jira_email") and settings.get("jira_token"))
