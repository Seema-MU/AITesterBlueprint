"""Jira Cloud REST API integration."""

import base64
import re

import requests

JIRA_ID_RE = re.compile(r"(?i)\b([A-Z][A-Z0-9]+-\d+)\b")
ACCEPTANCE_CRITERIA_RE = re.compile(
    r"(?is)\b(acceptance\s*criteria|definition\s*of\s*done|acceptance\s*test)\b"
    r"[:：]?\s*(.+?)(?=\n\s*\n|\n\s*[A-Z][A-Za-z\s]{3,}\s*[:：]|\Z)"
)

API_TIMEOUT = 15
DESCRIPTION_MAX_CHARS = 6000


class JiraError(Exception):
    """Raised when a Jira API call fails, with a user-readable message."""


def extract_jira_id(prompt):
    """Extract a Jira issue key (e.g. VWO-49) or bare numeric ID from a prompt."""
    if not prompt:
        return None
    match = JIRA_ID_RE.search(prompt)
    if match:
        return match.group(1).upper()
    numeric = re.search(r"(?<!\d)(\d{2,6})(?!\d)", prompt)
    return numeric.group(1) if numeric else None


def _auth_header(settings):
    credentials = f"{settings.get('jira_email', '')}:{settings.get('jira_token', '')}"
    encoded = base64.b64encode(credentials.encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {encoded}", "Accept": "application/json"}


BLOCK_TYPES = {
    "paragraph", "heading", "bulletList", "orderedList", "listItem",
    "blockquote", "codeBlock", "rule", "panel", "table", "tableRow",
    "tableCell", "tableHeader", "media", "mediaSingle", "mediaGroup",
}


def _flatten_adf(node):
    """Recursively extract plain text from a Jira ADF node tree."""
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type", "")
    if node_type == "text":
        return node.get("text", "")
    if node_type == "hardBreak":
        return "\n"
    if node_type == "inlineCard" and node.get("attrs", {}).get("url"):
        return node["attrs"]["url"]
    parts = [_flatten_adf(child) for child in node.get("content", [])]
    joined = "".join(parts)
    if node_type in BLOCK_TYPES:
        return joined + "\n"
    return joined


def _clean_description(description):
    """Normalize a Jira description (string or ADF dict) to readable text."""
    if not description:
        return "Not specified"
    if isinstance(description, dict):
        text = _flatten_adf(description)
    else:
        text = description
        text = re.sub(r"\{[^}]*\}", "", text)
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > DESCRIPTION_MAX_CHARS:
        text = text[:DESCRIPTION_MAX_CHARS] + "…"
    return text


def _extract_acceptance_criteria(description):
    """Try to pull the Acceptance Criteria section out of the description."""
    if not description:
        return ""
    flat = _flatten_adf(description) if isinstance(description, dict) else description
    match = ACCEPTANCE_CRITERIA_RE.search(flat)
    if match:
        return _clean_description(match.group(2))
    return ""


def fetch_issue(settings, issue_id):
    """Fetch issue details from the Jira Cloud REST API."""
    base_url = settings.get("jira_url", "").rstrip("/")
    if not base_url:
        raise JiraError("Jira URL is not configured. Open the Settings page and save it.")
    url = f"{base_url}/rest/api/3/issue/{issue_id}"
    try:
        response = requests.get(url, headers=_auth_header(settings), timeout=API_TIMEOUT)
    except requests.RequestException as exc:
        raise JiraError(f"Could not reach Jira: {exc}") from exc

    if response.status_code == 401:
        raise JiraError("Jira authentication failed. Check your email and API token in Settings.")
    if response.status_code == 404:
        raise JiraError(f"Jira issue '{issue_id}' not found.")
    if response.status_code != 200:
        raise JiraError(f"Jira API error: HTTP {response.status_code} ({response.reason}).")

    data = response.json()
    fields = data.get("fields", {})
    description = fields.get("description") or "Not specified"

    return {
        "issue_key": data.get("key", issue_id),
        "summary": fields.get("summary") or "Not specified",
        "description": _clean_description(description),
        "acceptance_criteria": _extract_acceptance_criteria(description),
        "labels": ", ".join(fields.get("labels", [])) or "None",
        "priority": (fields.get("priority") or {}).get("name") or "Not specified",
    }
