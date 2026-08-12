"""LLM integration: local LM Studio (OpenAI-compatible) with Groq fallback."""

import requests

LOCAL_MODEL = "google/gemma-3-1b"
LOCAL_MODEL_ALT = "gemma3:1b"  # Ollama naming
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

LOCAL_TIMEOUT = 60
GROQ_TIMEOUT = 90
TEMPERATURE = 0.2


class LLMError(Exception):
    """Raised when every configured LLM provider fails, with a user-readable message."""


def _call_openai_compatible(url, api_key, model, system_prompt, user_prompt, timeout):
    """POST to an OpenAI-compatible /chat/completions endpoint and return the reply text."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": TEMPERATURE,
    }
    response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        raise LLMError(
            f"LLM request failed: HTTP {response.status_code} ({response.reason})"
        )
    content = response.json()["choices"][0]["message"]["content"]
    return content.strip()


def _build_prompts(template_text, jira_details, num_cases):
    filled_template = template_text.replace("[NUMBER]", str(num_cases))
    system_prompt = (
        "You are a Senior QA Engineer. Follow the template below exactly. "
        "Output ONLY the markdown table specified by the template — no preamble, "
        "no notes, no extra text, no invented sections. "
        f"You MUST produce EXACTLY {num_cases} rows — no more, no fewer.\n\n"
        f"=== TEMPLATE ===\n{filled_template}\n=== END TEMPLATE ==="
    )
    unit = "test case" if num_cases == 1 else "test cases"
    user_prompt = (
        f"Generate exactly {num_cases} {unit} for the Jira issue below. "
        f"Strictly limit the table to {num_cases} rows.\n\n"
        f"ISSUE KEY: {jira_details['issue_key']}\n"
        f"SUMMARY: {jira_details['summary']}\n"
        f"PRIORITY: {jira_details['priority']}\n"
        f"LABELS: {jira_details['labels']}\n"
        f"ACCEPTANCE CRITERIA: {jira_details['acceptance_criteria'] or 'Not specified'}\n"
        f"DESCRIPTION:\n{jira_details['description']}"
    )
    return system_prompt, user_prompt


def _generate_with_local(settings, system_prompt, user_prompt):
    local_url = settings.get("local_llm_url", "")
    if not local_url:
        raise LLMError("Local LLM endpoint URL is not configured in Settings.")
    url = local_url.rstrip("/") + "/chat/completions"
    model = LOCAL_MODEL
    try:
        return _call_openai_compatible(url, None, model, system_prompt, user_prompt, LOCAL_TIMEOUT)
    except LLMError:
        # The server may not have this model loaded — try the alternate name.
        return _call_openai_compatible(url, None, LOCAL_MODEL_ALT, system_prompt, user_prompt, LOCAL_TIMEOUT)


def _generate_with_groq(settings, system_prompt, user_prompt):
    api_key = settings.get("groq_api_key", "")
    if not api_key:
        raise LLMError("Groq API key is not configured in Settings.")
    return _call_openai_compatible(GROQ_URL, api_key, GROQ_MODEL, system_prompt, user_prompt, GROQ_TIMEOUT)


def _ping_models(url, api_key):
    """Return the list of model ids exposed by an OpenAI-compatible endpoint."""
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    response = requests.get(url.rstrip("/") + "/models", headers=headers, timeout=10)
    if response.status_code != 200:
        raise LLMError(f"Models endpoint returned HTTP {response.status_code} ({response.reason})")
    data = response.json()
    return [item["id"] for item in data.get("data", [])]


def test_local_connection(settings):
    """Check the LM Studio endpoint. Returns (ok: bool, message: str)."""
    local_url = settings.get("local_llm_url", "")
    if not local_url:
        return False, "Local LLM endpoint URL is not configured in Settings."
    try:
        models = _ping_models(local_url, None)
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        return False, f"Could not reach LM Studio at {local_url}: {exc}"
    except LLMError as exc:
        return False, str(exc)
    if not models:
        return False, f"LM Studio at {local_url} responded, but no models were listed."
    if LOCAL_MODEL in models or LOCAL_MODEL_ALT in models:
        status = "OK"
    else:
        status = f"responding (model '{LOCAL_MODEL}' not found; available: {', '.join(models)})"
    return True, f"LM Studio connection OK ({status})."


def test_groq_connection(settings):
    """Check the Groq API. Returns (ok: bool, message: str)."""
    api_key = settings.get("groq_api_key", "")
    if not api_key:
        return False, "Groq API key is not configured in Settings."
    try:
        models = _ping_models(GROQ_URL.replace("/chat/completions", ""), api_key)
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        return False, f"Could not reach Groq: {exc}"
    except LLMError as exc:
        return False, str(exc)
    status = "OK" if GROQ_MODEL in models else f"responding (model '{GROQ_MODEL}' not found)"
    return True, f"Groq connection OK ({status})."


def generate_test_cases(settings, jira_details, template_text, num_cases):
    """Generate test cases. Local first when preferred, Groq as fallback."""
    system_prompt, user_prompt = _build_prompts(template_text, jira_details, num_cases)
    preference = settings.get("llm_provider_preference", "local")

    if preference == "groq":
        return _generate_with_groq(settings, system_prompt, user_prompt)

    try:
        return _generate_with_local(settings, system_prompt, user_prompt)
    except (requests.RequestException, LLMError, KeyError, TypeError) as local_error:
        if settings.get("groq_api_key"):
            try:
                return _generate_with_groq(settings, system_prompt, user_prompt)
            except (requests.RequestException, LLMError, KeyError, TypeError) as groq_error:
                raise LLMError(
                    f"Local LLM unreachable and Groq fallback failed. "
                    f"Local: {local_error} | Groq: {groq_error}"
                ) from groq_error
        raise LLMError(f"Local LLM unreachable ({local_error}) and no Groq API key is configured.") from local_error
