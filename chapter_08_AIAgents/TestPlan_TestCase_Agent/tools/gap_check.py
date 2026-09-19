"""Requirement gap analysis — deterministic (BLAST Layer 3).

Runs a fixed checklist over the fetched ticket and classifies every item as
present / ambiguous / missing. This is the highest-value part of the pipeline:
a missing acceptance criterion is a FINDING, never a blank to fill in
(invariant I-4). No LLM is involved here.
"""

from __future__ import annotations

import re

MISSING = "missing"
AMBIGUOUS = "ambiguous"
PRESENT = "present"

BLOCKS_ALL = ["test_plan", "test_design", "automation"]

# Words that signal a still-open requirement.
_VAGUE = ["tbd", "to be decided", "not confirmed", "not specified", "future enhancement",
          "phase 2", "phase 3", "optional", "if any", "as needed", "etc."]

_TEST_DATA = ["test account", "test data", "seed", "sample data", "test user",
              "dummy", "fixture", "sandbox"]
_ENVIRONMENT = ["environment", "dev", "qa", "sit", "uat", "staging", "sandbox",
                "localhost", "test server"]
_PERFORMANCE = ["performance", "load time", "latency", "response time", "throughput",
                "concurrent", "seconds", "ms", "sla"]
_SECURITY = ["security", "encrypt", "https", "token", "authentication", "authorization",
             "brute force", "rate limit", "throttl", "vulnerab", "owasp", "session"]
_ACCESSIBILITY = ["accessib", "wcag", "aria", "screen reader", "keyboard", "contrast", "a11y"]
_ERRORS = ["error message", "error code", "validation message", "invalid", "failure",
           "failed", "retry", "fallback", "exception", "not found", "denied"]
_BOUNDARY = ["max", "min", "limit", "length", "boundary", "timeout", "threshold",
             "maximum", "minimum", "at least", "up to", "characters"]
_PERMISSIONS = ["role", "permission", "admin", "enterprise", "sso", "access level",
                "privilege", "guest", "owner", "member"]
_INTEGRATION = ["integration", "api", "third-party", "third party", "provider", "oauth",
                "webhook", "external", "service"]
_FALLBACK = ["fallback", "unavailable", "if it fails", "failure path", "timeout",
             "degrade", "graceful"]

# Product-ish tokens that are too generic to treat as a naming signal.
_STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "into", "when", "then",
    "user", "users", "page", "test", "case", "cases", "plan", "should", "must",
    "will", "can", "not", "are", "was", "were", "has", "have", "been", "they",
    "their", "there", "which", "what", "where", "after", "before", "also",
    "login", "logout", "sign", "dashboard", "system", "feature", "story",
    "task", "bug", "epic", "new", "add", "get", "set", "use", "using", "all",
}


def _haystack(ticket: dict) -> str:
    """All requirement-bearing text: description, ACs, metadata, and attachments.

    Attachments matter: on tickets like KAN-4 the description is empty and the
    PRD lives in an attached file. Omitting them makes every gap check report
    'missing' against a title.
    """
    parts = [
        ticket.get("summary", ""),
        ticket.get("description_text", ""),
        ticket.get("acceptance_criteria", ""),
        ticket.get("attachment_text", ""),
        " ".join(ticket.get("labels", []) or []),
        " ".join(ticket.get("components", []) or []),
        " ".join(ticket.get("fix_versions", []) or []),
    ]
    return "\n".join(p for p in parts if p).lower()


def _hits(text: str, words: list[str]) -> list[str]:
    return [w for w in words if w in text]


def _vague_hits(text: str) -> list[str]:
    return [w for w in _VAGUE if w in text]


def _snippet(text: str, needle: str, width: int = 150) -> str:
    """Return a short quoted excerpt around the first occurrence of needle."""
    idx = text.find(needle)
    if idx < 0:
        return ""
    start = max(0, idx - 40)
    excerpt = text[start:start + width].replace("\n", " ").strip()
    return f"…{excerpt}…" if start else excerpt


def find_name_collisions(summary: str, description: str) -> list[tuple[str, str]]:
    """Find near-identical product names across summary and description.

    Catches the real 'VMO.com' vs 'VWO' class of defect — same length, same
    first letter, one differing character. Returns pairs (summary_token, desc_token).
    """
    def tokens(text: str) -> set[str]:
        return {
            w for w in re.findall(r"\b[A-Za-z][A-Za-z0-9]{2,}\b", text or "")
            if len(w) >= 3 and w.lower() not in _STOPWORDS
        }

    found = []
    seen = set()
    for a in sorted(tokens(summary)):
        for b in sorted(tokens(description)):
            if a.lower() == b.lower() or len(a) != len(b):
                continue
            if a[0].lower() != b[0].lower():
                continue
            if sum(1 for x, y in zip(a.lower(), b.lower()) if x != y) != 1:
                continue
            # Dedupe case-insensitively: 'VMO'/'VWO' and 'VMO'/'vwo' are one finding.
            signature = tuple(sorted((a.lower(), b.lower())))
            if signature in seen:
                continue
            seen.add(signature)
            found.append((a, b))
    return found


def analyze(ticket: dict) -> dict:
    """Run the checklist and return a GapAnalysis (LLM.md §3.2)."""
    text = _haystack(ticket)
    summary = ticket.get("summary", "")
    description = ticket.get("description_text", "")
    items: list[dict] = []

    def add(category, status, statement, evidence="", question="", blocks=None):
        items.append({
            "id": f"G-{len(items) + 1:02d}",
            "category": category,
            "status": status,
            "statement": statement,
            "evidence": evidence,
            "question": question,
            "blocks": blocks or [],
        })

    # 1 — Acceptance criteria
    if ticket.get("acceptance_criteria"):
        where = {
            "extracted": "the ticket description",
            "extracted_from_attachment": "an attached requirements file",
            "manual_paste": "manually supplied text",
        }.get(ticket.get("ac_source", ""), "the ticket")
        add("acceptance_criteria", PRESENT,
            f"Acceptance criteria found in {where}.",
            _snippet(ticket["acceptance_criteria"], ticket["acceptance_criteria"][:20]))
    else:
        add("acceptance_criteria", MISSING,
            "No acceptance criteria / definition of done in the ticket. Pass/fail is subjective without them.",
            f"ac_source={ticket.get('ac_source', 'none_found')}",
            "Convert the requirements into testable ACs, or confirm the drafted scenarios as the ACs?",
            BLOCKS_ALL)

    # 2 — Scope
    vague = _vague_hits(text)
    if vague:
        add("scope", AMBIGUOUS,
            f"Release scope is not pinned down — wording such as {', '.join(repr(v) for v in vague[:3])} appears.",
            _snippet(text, vague[0]),
            "Which items ship in this release, and which are deferred?",
            ["test_plan"])
    elif not (ticket.get("components") or ticket.get("fix_versions")):
        add("scope", MISSING,
            "No components or fix version set, so the release scope cannot be bounded.",
            "components=[] fixVersions=[]",
            "Which components and release does this belong to?",
            ["test_plan"])

    # 3 — Test data
    if _hits(text, _TEST_DATA):
        add("test_data", PRESENT, "Test data or test accounts are referenced.",
            _snippet(text, _hits(text, _TEST_DATA)[0]))
    else:
        add("test_data", MISSING,
            "No test data, test accounts, or seed data are defined.",
            "no test-data keywords found in summary/description",
            "What test accounts and data can QA use?",
            ["test_design", "automation"])

    # 4 — Environment
    if _hits(text, _ENVIRONMENT):
        add("environment", PRESENT, "Test environment or target host is referenced.",
            _snippet(text, _hits(text, _ENVIRONMENT)[0]))
    else:
        add("environment", MISSING, "No test environment or target host is named.",
            "no environment keywords found",
            "Which environment and URL should this be tested against?",
            ["test_plan", "automation"])

    # 5 — Non-functional
    missing_nfr = []
    if not _hits(text, _PERFORMANCE):
        missing_nfr.append("performance")
    if not _hits(text, _SECURITY):
        missing_nfr.append("security")
    if not _hits(text, _ACCESSIBILITY):
        missing_nfr.append("accessibility")
    if missing_nfr:
        add("non_functional", MISSING if len(missing_nfr) == 3 else AMBIGUOUS,
            f"No stated non-functional requirement for: {', '.join(missing_nfr)}.",
            "checked for performance / security / accessibility keywords",
            f"What are the expected targets for {', '.join(missing_nfr)}?",
            ["test_design"])
    else:
        add("non_functional", PRESENT, "Performance, security, and accessibility are all addressed.",
            "all three keyword groups found")

    # 6 — Error handling
    if _hits(text, _ERRORS):
        add("error_handling", PRESENT, "Failure and error behaviour is referenced.",
            _snippet(text, _hits(text, _ERRORS)[0]))
    else:
        add("error_handling", MISSING,
            "No failure behaviour or error messages specified.",
            "no error-handling keywords found",
            "What should the user see on each failure path?",
            ["test_design"])

    # 7 — Boundary values
    if _hits(text, _BOUNDARY):
        add("boundary", PRESENT, "Limits or thresholds are stated.",
            _snippet(text, _hits(text, _BOUNDARY)[0]))
    else:
        add("boundary", MISSING, "No limits, thresholds, or boundary values given.",
            "no boundary keywords found",
            "What are the maximum/minimum values and timeouts?",
            ["test_design"])

    # 8 — Roles / permissions
    if _hits(text, _PERMISSIONS):
        add("permissions", PRESENT, "Roles or permission levels are mentioned.",
            _snippet(text, _hits(text, _PERMISSIONS)[0]))
    else:
        add("permissions", MISSING, "No user roles or permission levels described.",
            "no role/permission keywords found",
            "Which roles are in scope, and what may each do?",
            ["test_design"])

    # 9 — Integrations & their failure paths
    if _hits(text, _INTEGRATION):
        if _hits(text, _FALLBACK):
            add("integration", PRESENT, "External integrations and their failure paths are both referenced.",
                _snippet(text, _hits(text, _INTEGRATION)[0]))
        else:
            add("integration", AMBIGUOUS,
                "External integrations are referenced but no fallback or degraded behaviour is described.",
                _snippet(text, _hits(text, _INTEGRATION)[0]),
                "What should happen when an external provider is unavailable?",
                ["test_design"])

    # 10 — Naming ambiguity
    for a, b in find_name_collisions(summary, description):
        add("naming_ambiguity", AMBIGUOUS,
            f"The summary says '{a}' but the description says '{b}' — likely a typo that would point tests at the wrong target.",
            f"summary='{a}' description='{b}'",
            f"Is the correct name '{a}' or '{b}'?",
            ["test_plan", "automation"])

    counts = {PRESENT: 0, AMBIGUOUS: 0, MISSING: 0}
    for item in items:
        counts[item["status"]] += 1

    return {
        "issue_key": ticket.get("issue_key", ""),
        "checked_at": ticket.get("fetched_at", ""),
        "source_hash": ticket.get("source_hash", ""),
        "items": items,
        "counts": counts,
        "blocking": [i["id"] for i in items if i["status"] == MISSING],
    }
