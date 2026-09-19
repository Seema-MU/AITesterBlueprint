"""Jira Cloud REST API integration — deterministic (no LLM, no side effects).

Fetches one issue and normalizes it to the TicketPayload shape in LLM.md §3.1.
The ticket is fetched exactly once per run (invariant I-2); the caller caches it.
"""

from __future__ import annotations

import base64
import hashlib
import html as html_lib
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from io import BytesIO

import requests

JIRA_ID_RE = re.compile(r"(?i)\b([A-Z][A-Z0-9]+-\d+)\b")
ACCEPTANCE_CRITERIA_RE = re.compile(
    r"(?is)\b(acceptance\s*criteria|definition\s*of\s*done|acceptance\s*test)\b"
    r"[:：]?\s*(.+?)(?=\n\s*\n|\n\s*[A-Z][A-Za-z\s]{3,}\s*[:：]|\Z)"
)

API_TIMEOUT = 20
DESCRIPTION_MAX_CHARS = 12000

# Attachments often carry the real requirements: a PRD, a spec, a mockup.
# Read them, but keep the context bounded (LLM.md §7).
ATTACHMENT_MAX_CHARS = 6000
ATTACHMENT_TOTAL_CHARS = 16000
ATTACHMENT_MAX_BYTES = 2_000_000

TEXT_SUFFIXES = {".md", ".markdown", ".txt", ".csv", ".json", ".xml", ".yaml", ".yml",
                 ".log", ".feature", ".sql", ".ini", ".toml"}
HTML_SUFFIXES = {".html", ".htm"}
DOCX_SUFFIXES = {".docx", ".docm"}

FIELDS = (
    "summary,description,issuetype,priority,status,components,labels,"
    "fixVersions,issuelinks,attachment"
)

# Jira Cloud puts Sprint in a custom field whose id varies by instance.
SPRINT_FIELD_CANDIDATES = ("customfield_10020", "customfield_10018")

BLOCK_TYPES = {
    "paragraph", "heading", "bulletList", "orderedList", "listItem",
    "blockquote", "codeBlock", "rule", "panel", "table", "tableRow",
    "tableCell", "tableHeader", "media", "mediaSingle", "mediaGroup",
}


class JiraError(Exception):
    """A Jira API failure carrying a stable code (LLM.md §6)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def extract_jira_id(prompt: str) -> str | None:
    """Extract a Jira issue key (SCRUM-1) or a bare numeric id from free text."""
    if not prompt:
        return None
    match = JIRA_ID_RE.search(prompt)
    if match:
        return match.group(1).upper()
    numeric = re.search(r"(?<!\d)(\d{2,6})(?!\d)", prompt)
    return numeric.group(1) if numeric else None


def _auth_header(settings: dict) -> dict:
    credentials = f"{settings.get('jira_email', '')}:{settings.get('jira_token', '')}"
    encoded = base64.b64encode(credentials.encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {encoded}", "Accept": "application/json"}


def flatten_adf(node) -> str:
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
    joined = "".join(flatten_adf(child) for child in node.get("content", []))
    if node_type in BLOCK_TYPES:
        return joined + "\n"
    return joined


def clean_description(description) -> str:
    """Normalize a Jira description (ADF dict or wiki string) to readable text."""
    if not description:
        return "Not specified"
    if isinstance(description, dict):
        text = flatten_adf(description)
    else:
        text = re.sub(r"\{[^}]*\}", "", description)
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > DESCRIPTION_MAX_CHARS:
        text = text[:DESCRIPTION_MAX_CHARS] + "…"
    return text


def extract_acceptance_criteria(description) -> str:
    """Pull the Acceptance Criteria section out of the description, if present."""
    if not description:
        return ""
    flat = flatten_adf(description) if isinstance(description, dict) else description
    match = ACCEPTANCE_CRITERIA_RE.search(flat)
    return clean_description(match.group(2)) if match else ""


def _sprint_name(fields: dict) -> str:
    for field_id in SPRINT_FIELD_CANDIDATES:
        value = fields.get(field_id)
        if isinstance(value, list) and value:
            name = value[-1].get("name") if isinstance(value[-1], dict) else None
            if name:
                return name
    return ""


def _html_to_text(raw: str) -> str:
    """Strip an HTML document down to readable text."""
    raw = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</(p|div|li|tr|h[1-6])>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    text = html_lib.unescape(raw)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _docx_to_text(raw: bytes) -> str:
    """Extract text from a .docx without a third-party dependency."""
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        names = archive.namelist()
        parts = [n for n in names if n == "word/document.xml"]
        if not parts:
            parts = [n for n in names if n.startswith("word/") and n.endswith(".xml")]
        chunks = []
        for name in parts:
            try:
                xml = archive.read(name).decode("utf-8", errors="ignore")
            except (KeyError, OSError):
                continue
            xml = re.sub(r"(?i)</w:p>", "\n", xml)
            xml = re.sub(r"(?is)<w:tab[^>]*/>", " ", xml)
            xml = re.sub(r"<[^>]+>", "", xml)
            chunks.append(html_lib.unescape(xml))
    text = "\n".join(chunks)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def fetch_attachment_text(settings: dict, attachment: dict,
                          max_chars: int = ATTACHMENT_MAX_CHARS) -> dict:
    """Download one attachment and extract its text.

    Returns the attachment dict extended with status/chars/text/note. Never
    raises: a failed attachment is reported, not fatal, because a ticket with an
    unreadable attachment is still worth analysing from its description.
    """
    result = dict(attachment)
    result.update({"status": "skipped", "chars": 0, "text": "", "note": ""})

    url = attachment.get("content_url") or ""
    filename = attachment.get("filename") or ""
    if not url:
        result["note"] = "no content URL"
        return result

    suffix = os.path.splitext(filename)[1].lower()
    readable = suffix in TEXT_SUFFIXES or suffix in HTML_SUFFIXES or suffix in DOCX_SUFFIXES
    if not readable:
        result["note"] = f"unsupported type ({suffix or 'no extension'}) — not read"
        return result

    try:
        response = requests.get(url, headers=_auth_header(settings),
                                timeout=API_TIMEOUT, allow_redirects=True)
    except requests.RequestException as exc:
        result.update({"status": "error", "note": f"download failed: {type(exc).__name__}"})
        return result

    if response.status_code != 200:
        result.update({"status": "error",
                       "note": f"HTTP {response.status_code} ({response.reason})"})
        return result
    if len(response.content) > ATTACHMENT_MAX_BYTES:
        result.update({"status": "error",
                       "note": f"too large ({len(response.content)} bytes)"})
        return result

    try:
        if suffix in DOCX_SUFFIXES:
            text = _docx_to_text(response.content)
        else:
            raw = response.content.decode("utf-8", errors="replace")
            text = _html_to_text(raw) if suffix in HTML_SUFFIXES else raw
    except (zipfile.BadZipFile, OSError, ValueError) as exc:
        result.update({"status": "error", "note": f"could not parse: {type(exc).__name__}"})
        return result

    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        result.update({"status": "error", "note": "no readable text"})
        return result

    truncated = len(text) > max_chars
    result.update({
        "status": "read",
        "chars": len(text),
        "text": text[:max_chars],
        "note": f"truncated to {max_chars} chars" if truncated else "",
    })
    return result


def fetch_attachments(settings: dict, attachments: list[dict],
                      total_budget: int = ATTACHMENT_TOTAL_CHARS) -> list[dict]:
    """Download and extract every readable attachment, bounded by a total budget."""
    remaining = total_budget
    results = []
    for attachment in attachments or []:
        if remaining <= 0:
            skipped = dict(attachment)
            skipped.update({"status": "skipped", "chars": 0, "text": "",
                            "note": "attachment budget exhausted"})
            results.append(skipped)
            continue
        read = fetch_attachment_text(settings, attachment, max_chars=min(ATTACHMENT_MAX_CHARS, remaining))
        remaining -= read.get("chars", 0)
        results.append(read)
    return results


def attachment_text(payload: dict) -> str:
    """Concatenate the readable attachment text of a ticket payload."""
    blocks = []
    for attachment in payload.get("attachments") or []:
        text = (attachment.get("text") or "").strip()
        if text:
            blocks.append(f"--- {attachment.get('filename', 'attachment')} ---\n{text}")
    return "\n\n".join(blocks)


def test_connection(settings: dict) -> tuple[bool, str]:
    """Verify Jira credentials and reachability via /myself. Returns (ok, message)."""
    base_url = (settings.get("jira_url") or "").rstrip("/")
    if not base_url:
        return False, "Jira URL is not configured."
    if not settings.get("jira_email") or not settings.get("jira_token"):
        return False, "Jira email and API token are both required."
    try:
        response = requests.get(f"{base_url}/rest/api/3/myself",
                                headers=_auth_header(settings), timeout=API_TIMEOUT)
    except requests.RequestException as exc:
        return False, f"Could not reach {base_url}: {exc}"
    if response.status_code == 401:
        return False, "Authentication failed (401). Check the email and the API token."
    if response.status_code == 403:
        return False, "Authenticated, but this account is not permitted (403)."
    if response.status_code != 200:
        return False, f"HTTP {response.status_code} ({response.reason})."
    data = response.json()
    who = data.get("displayName") or data.get("emailAddress") or "authenticated user"
    return True, f"OK — connected as {who}."


def fetch_issue(settings: dict, issue_id: str, include_attachments: bool = True) -> dict:
    """Fetch one issue and return a normalized TicketPayload (LLM.md §3.1).

    Attachments are downloaded and reduced to text: on many tickets the PRD or
    spec lives in an attachment while the description is empty, so ignoring them
    leaves the agent analysing a title.
    """
    base_url = (settings.get("jira_url") or "").rstrip("/")
    if not base_url:
        raise JiraError("JIRA-URL", "Jira URL is not configured. Open Settings and save it.")

    url = f"{base_url}/rest/api/3/issue/{issue_id}?fields={FIELDS}"
    try:
        response = requests.get(url, headers=_auth_header(settings), timeout=API_TIMEOUT)
    except requests.Timeout as exc:
        raise JiraError("JIRA-TIMEOUT", f"Jira did not respond within {API_TIMEOUT}s.") from exc
    except requests.RequestException as exc:
        raise JiraError("JIRA-UNREACHABLE", f"Could not reach Jira: {exc}") from exc

    if response.status_code == 401:
        raise JiraError("JIRA-401", "Jira authentication failed — check the email and API token in Settings.")
    if response.status_code == 403:
        raise JiraError("JIRA-403", f"No permission to read issue '{issue_id}'.")
    if response.status_code == 404:
        raise JiraError("JIRA-404", f"Jira issue '{issue_id}' not found. Check the key.")
    if response.status_code == 429:
        raise JiraError("JIRA-429", "Jira rate limit hit — wait a moment and retry.")
    if response.status_code != 200:
        raise JiraError("JIRA-5XX", f"Jira API error: HTTP {response.status_code} ({response.reason}).")

    raw = response.text
    data = json.loads(raw)
    fields = data.get("fields", {}) or {}
    description = fields.get("description") or ""

    attachments = [
        {"filename": a.get("filename", ""), "content_url": a.get("content", "")}
        for a in (fields.get("attachment") or [])
    ]
    if include_attachments and attachments:
        attachments = fetch_attachments(settings, attachments)

    acceptance = extract_acceptance_criteria(description)
    ac_source = "extracted" if acceptance else "none_found"
    if not acceptance:
        # The criteria may live in an attached PRD rather than the description.
        for attachment in attachments:
            found = extract_acceptance_criteria(attachment.get("text") or "")
            if found:
                acceptance, ac_source = found, "extracted_from_attachment"
                break

    return {
        "issue_key": data.get("key", issue_id),
        "self": data.get("self", ""),
        "fetched_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "source": "python",
        "source_hash": "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "summary": fields.get("summary") or "Not specified",
        "issue_type": (fields.get("issuetype") or {}).get("name") or "Not specified",
        "status": (fields.get("status") or {}).get("name") or "Not specified",
        "priority": (fields.get("priority") or {}).get("name") or "Not specified",
        "components": [c.get("name", "") for c in (fields.get("components") or []) if c.get("name")],
        "labels": fields.get("labels") or [],
        "fix_versions": [v.get("name", "") for v in (fields.get("fixVersions") or []) if v.get("name")],
        "sprint": _sprint_name(fields),
        "description_adf": description if isinstance(description, dict) else {},
        "description_text": clean_description(description) if description else "Not specified",
        "acceptance_criteria": acceptance,
        "ac_source": ac_source,
        "attachments": attachments,
        "attachment_text": attachment_text({"attachments": attachments}),
        "links": [
            {
                "relation": (link.get("type") or {}).get("name", ""),
                "key": (link.get("outwardIssue") or link.get("inwardIssue") or {}).get("key", ""),
            }
            for link in (fields.get("issuelinks") or [])
        ],
    }
