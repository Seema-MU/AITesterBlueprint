"""LLM access (BLAST Layer 2 — navigation/reasoning).

Local LM Studio (OpenAI-compatible) first, Groq as an automatic fallback.
Only prompting and provider routing live here — no business logic.
"""

from __future__ import annotations

import json
import re

import requests

LOCAL_TIMEOUT = 180
GROQ_TIMEOUT = 240
TEMPERATURE = 0.2
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"  # _list_models appends /models

DEFAULT_LOCAL_MODEL = "google/gemma-3-1b"
DEFAULT_LOCAL_MODEL_ALT = "gemma3:1b"  # Ollama naming
# llama-3.3-70b-versatile was retired by Groq; this is the current default.
DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"


class LLMError(Exception):
    """Raised when every configured provider fails, with a readable message."""


# --------------------------------------------------------------------------- #
# Low-level transport
# --------------------------------------------------------------------------- #

def _post_chat(url: str, api_key: str | None, model: str, system: str, user: str,
               timeout: int, temperature: float = TEMPERATURE) -> str:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        detail = response.text[:300].replace("\n", " ")
        raise LLMError(f"HTTP {response.status_code} ({response.reason}) — {detail}")
    try:
        return response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMError(f"Unexpected response shape from the model: {exc}") from exc


def _list_models(url: str, api_key: str | None) -> list[str]:
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    response = requests.get(url.rstrip("/") + "/models", headers=headers, timeout=15)
    if response.status_code != 200:
        raise LLMError(f"Models endpoint returned HTTP {response.status_code} ({response.reason})")
    return [item.get("id", "") for item in response.json().get("data", [])]


def _local_chat_url(settings: dict) -> str:
    return (settings.get("local_llm_url") or "").rstrip("/") + "/chat/completions"


# --------------------------------------------------------------------------- #
# Connection tests
# --------------------------------------------------------------------------- #

def test_local_connection(settings: dict) -> tuple[bool, str]:
    url = settings.get("local_llm_url") or ""
    if not url:
        return False, "Local LLM endpoint URL is not configured."
    try:
        models = _list_models(url, None)
    except requests.RequestException as exc:
        return False, f"Could not reach {url}: {exc}"
    except LLMError as exc:
        return False, str(exc)
    if not models:
        return True, f"Reached {url}, but it listed no models. Load a model in LM Studio."
    wanted = settings.get("local_llm_model") or DEFAULT_LOCAL_MODEL
    if wanted in models or DEFAULT_LOCAL_MODEL_ALT in models:
        return True, f"OK — '{wanted}' is available. {len(models)} model(s) exposed."
    return True, f"Reached {url}, but '{wanted}' was not listed. Available: {', '.join(models[:8])}"


def test_groq_connection(settings: dict) -> tuple[bool, str]:
    key = settings.get("groq_api_key") or ""
    if not key:
        return False, "Groq API key is not configured."
    try:
        models = _list_models(GROQ_BASE_URL, key)
    except requests.RequestException as exc:
        return False, f"Could not reach Groq: {exc}"
    except LLMError as exc:
        return False, str(exc)
    wanted = settings.get("groq_model") or DEFAULT_GROQ_MODEL
    if wanted in models:
        return True, f"OK — '{wanted}' is available."
    return True, f"Groq reachable, but '{wanted}' was not listed. Available: {', '.join(models[:6])}"


# --------------------------------------------------------------------------- #
# Generation with failover
# --------------------------------------------------------------------------- #

def _generate_local(settings: dict, system: str, user: str) -> str:
    url = _local_chat_url(settings)
    if not url.startswith("http"):
        raise LLMError("Local LLM endpoint URL is not configured.")
    model = settings.get("local_llm_model") or DEFAULT_LOCAL_MODEL
    try:
        return _post_chat(url, None, model, system, user, LOCAL_TIMEOUT)
    except LLMError:
        if model != DEFAULT_LOCAL_MODEL_ALT:
            return _post_chat(url, None, DEFAULT_LOCAL_MODEL_ALT, system, user, LOCAL_TIMEOUT)
        raise


def _generate_groq(settings: dict, system: str, user: str) -> str:
    key = settings.get("groq_api_key") or ""
    if not key:
        raise LLMError("Groq API key is not configured.")
    return _post_chat(GROQ_CHAT_URL, key, settings.get("groq_model") or DEFAULT_GROQ_MODEL,
                      system, user, GROQ_TIMEOUT)


def _summarise(exc: Exception) -> str:
    """Shorten a transport error to something readable in a UI."""
    text = str(exc)
    lowered = text.lower()
    if "actively refused" in lowered or "connection refused" in lowered or "max retries" in lowered:
        return "connection refused — is the LLM server running?"
    if "timed out" in lowered or "timeout" in lowered:
        return "request timed out"
    if "no such host" in lowered or "name or service not known" in lowered:
        return "host not found — check the endpoint URL"
    return text[:140]


def complete(settings: dict, system: str, user: str) -> tuple[str, str]:
    """Generate a completion. Returns (text, provider_used)."""
    preference = settings.get("llm_provider_preference", "local")

    if preference == "groq":
        return _generate_groq(settings, system, user), "groq"

    try:
        return _generate_local(settings, system, user), "local"
    except (requests.RequestException, LLMError) as local_error:
        local_short = _summarise(local_error)
        endpoint = settings.get("local_llm_url") or "(no URL)"
        if settings.get("groq_api_key"):
            try:
                return _generate_groq(settings, system, user), "groq (local failed)"
            except (requests.RequestException, LLMError) as groq_error:
                raise LLMError(
                    f"Local LLM at {endpoint} failed ({local_short}) and the Groq fallback also failed "
                    f"({_summarise(groq_error)})."
                ) from groq_error
        raise LLMError(
            f"Local LLM at {endpoint} unavailable ({local_short}) and no Groq API key is set as a fallback."
        ) from local_error


# --------------------------------------------------------------------------- #
# JSON extraction (1B models rarely return clean JSON)
# --------------------------------------------------------------------------- #

def extract_json(text: str):
    """Best-effort JSON extraction from model output. Raises ValueError on failure."""
    if not text:
        raise ValueError("Empty model response.")

    candidates = []
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        candidates.append(fenced.group(1).strip())
    candidates.append(text.strip())

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except ValueError:
            pass

    # Scan for the first balanced array or object.
    for opener, closer in (("[", "]"), ("{", "}")):
        start = text.find(opener)
        if start < 0:
            continue
        depth = 0
        in_string = False
        escape = False
        for idx in range(start, len(text)):
            char = text[idx]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:idx + 1])
                    except ValueError:
                        break
    raise ValueError("Could not find valid JSON in the model response.")
