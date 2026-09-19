"""Settings persistence (BLAST Layer 2).

Credentials live in .env (invariant I-1) and are read into memory; user-editable
preferences live in config.json. Neither file is ever committed.
"""

from __future__ import annotations

import json
import os

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
ENV_FILE = os.path.join(APP_DIR, ".env")

# Optional fallback: the repo already holds working Jira credentials here.
REPO_ENV_FALLBACK = os.path.normpath(
    os.path.join(APP_DIR, "..", "..", ".commandcode", "skills", "testPlan_gen", ".env")
)

DEFAULT_SETTINGS = {
    "jira_url": "",
    "jira_email": "",
    "jira_token": "",
    "qa_name": "",
    "local_llm_url": "http://localhost:1234/v1",
    "local_llm_model": "google/gemma-3-1b",
    "groq_api_key": "",
    "groq_model": "llama-3.3-70b-versatile",
    "llm_provider_preference": "local",
    "output_dir": "TestPlans",
}

SECRET_KEYS = ("jira_token", "groq_api_key")


def read_env_file(path: str) -> dict:
    """Parse a KEY=VALUE .env file. Returns {} when absent."""
    values: dict[str, str] = {}
    if not path or not os.path.exists(path):
        return values
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def bootstrap_from_env() -> dict:
    """Seed settings from .env, falling back to the repo's existing credentials."""
    env = read_env_file(ENV_FILE)
    if not env:
        env = read_env_file(REPO_ENV_FALLBACK)
    source = ENV_FILE if os.path.exists(ENV_FILE) else (
        REPO_ENV_FALLBACK if os.path.exists(REPO_ENV_FALLBACK) else ""
    )
    if not env:
        return {}
    seeded = {
        "jira_url": env.get("JIRA_URL") or env.get("JIRA_BASE_URL", ""),
        "jira_email": env.get("JIRA_EMAIL", ""),
        "jira_token": env.get("JIRA_TOKEN", ""),
        "qa_name": env.get("QA_NAME", ""),
        "local_llm_url": env.get("LOCAL_LLM_URL", ""),
        "local_llm_model": env.get("LOCAL_LLM_MODEL", ""),
        "groq_api_key": env.get("GROQ_API_KEY", ""),
        "groq_model": env.get("GROQ_MODEL", ""),
    }
    seeded = {k: v for k, v in seeded.items() if v}
    if seeded:
        seeded["_env_source"] = source
    return seeded


def load_settings() -> dict:
    """Load settings with a strict precedence: defaults < .env < config.json.

    Every key present in .env overrides the default, including keys whose default
    is non-empty (local_llm_url, groq_model, ...). Applying env values only when
    the current value was falsy meant a real .env was silently ignored whenever a
    default existed.
    """
    settings = dict(DEFAULT_SETTINGS)
    env_values = bootstrap_from_env()

    # 1 — .env overrides defaults.
    for key, value in env_values.items():
        if key.startswith("_"):
            continue
        if value:
            settings[key] = value

    # 2 — config.json (explicit user edits in the UI) wins over both.
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as handle:
                saved = json.load(handle)
            if isinstance(saved, dict):
                settings.update({k: v for k, v in saved.items()
                                 if k in DEFAULT_SETTINGS and v})
        except (OSError, ValueError):
            pass

    settings["_env_source"] = env_values.get("_env_source", "")
    return settings


def save_settings(settings: dict) -> None:
    """Persist user-editable preferences to config.json (secrets included, gitignored)."""
    clean = {k: settings.get(k, DEFAULT_SETTINGS.get(k, "")) for k in DEFAULT_SETTINGS}
    with open(CONFIG_FILE, "w", encoding="utf-8") as handle:
        json.dump(clean, handle, indent=2)


def settings_ready(settings: dict) -> bool:
    """True when the Jira credentials needed to fetch an issue are present."""
    return bool(settings.get("jira_url") and settings.get("jira_email") and settings.get("jira_token"))


def llm_ready(settings: dict) -> bool:
    """True when at least one LLM provider is configured."""
    return bool(settings.get("local_llm_url") or settings.get("groq_api_key"))


def output_dir(settings: dict) -> str:
    """Absolute output directory, created on demand."""
    configured = settings.get("output_dir") or "TestPlans"
    path = configured if os.path.isabs(configured) else os.path.join(APP_DIR, configured)
    os.makedirs(path, exist_ok=True)
    return path


def tmp_dir() -> str:
    """BLAST Layer 3 intermediate-file directory."""
    path = os.path.join(APP_DIR, ".tmp")
    os.makedirs(path, exist_ok=True)
    return path


def mask(value: str) -> str:
    """Render a secret for display without revealing it."""
    if not value:
        return "(not set)"
    return "•" * 8 + f" ({len(value)} chars)"
