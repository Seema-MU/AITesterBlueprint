"""Evidence gate and trace validation — deterministic (BLAST Layer 3).

Two controls, both prompted by KAN-4 (findings.md §12):

1. **The evidence gate.** That ticket had a five-word summary, a 0-character
   description, and its requirements unread in an attachment. The gap analysis
   correctly reported 7 missing items out of 8 — and generation proceeded
   anyway, emitting ten confident, invented cases. Measuring is not controlling;
   something has to consume the measurement and change the output.

2. **Trace validation.** The model returned provenance strings like
   ``'AC: User can add an item to cart.'`` — an invented acceptance criterion
   presented in the trace column. A reviewer reading that column would conclude
   the ticket contained those criteria. A trace must resolve to something real.

Deliberately NOT keyed to "does the ticket have an acceptance criteria section":
many tickets legitimately do not, and their requirement text lives in the
description or an attachment. The gate measures requirement-bearing text.
"""

from __future__ import annotations

import re

# Thresholds. Tuned so an ordinary ticket with a real description passes, while
# a title-only ticket does not.
REFUSE_REQUIREMENT_CHARS = 80     # essentially nothing to test
CONSTRAIN_REQUIREMENT_CHARS = 400  # thin: generate, but forbid invention
CONSTRAIN_MISSING_GAPS = 5         # this many unknowns -> constrain

GAP_ID_RE = re.compile(r"(?i)^G-\d+$")
AC_REF_RE = re.compile(r"(?i)^(AC[-_ ]?\d+|AC-derived|derived)$")

# Acceptance-criteria ids as they appear in requirement documents: "AC1:",
# "AC-2", "AC 3", "### AC4:". Used to verify that a trace points at a criterion
# that actually exists rather than one the model invented.
AC_ID_IN_TEXT_RE = re.compile(r"(?i)\bAC[\s\-_]?(\d{1,2})\b")
AC_PREFIXED_REF_RE = re.compile(r"(?i)^AC[\s\-_]?(\d{1,2})$")

PLACEHOLDER_TEXTS = {"", "not specified", "none", "n/a", "no description"}


def known_ac_ids(ticket: dict | None) -> set[str]:
    """Acceptance-criteria ids that actually appear in the requirement material.

    Scans the criteria, the attachments and the description: the criteria
    extractor stops at the first block, while a PRD attachment usually holds the
    full AC1..ACn list.
    """
    if not ticket:
        return set()
    corpus = " ".join(str(ticket.get(f) or "") for f in
                      ("acceptance_criteria", "attachment_text", "description_text"))
    return {f"AC{m.group(1)}" for m in AC_ID_IN_TEXT_RE.finditer(corpus)}


def requirement_chars(ticket: dict) -> int:
    """Total requirement-bearing text: description + criteria + attachments."""
    total = 0
    for field in ("description_text", "acceptance_criteria", "attachment_text"):
        value = str(ticket.get(field) or "").strip()
        if value.lower() in PLACEHOLDER_TEXTS:
            continue
        total += len(value)
    return total


def evidence_basis(ticket: dict) -> str:
    """One plain statement of what this run's cases actually rest on."""
    if ticket.get("acceptance_criteria"):
        source = {
            "extracted_from_attachment": "from an attached requirements file",
            "extracted": "from the ticket description",
            "manual_paste": "from supplied text",
        }.get(ticket.get("ac_source", ""), "from the ticket")
        return f"acceptance criteria {source}"
    if (ticket.get("attachment_text") or "").strip():
        return "attached requirements (no formal acceptance criteria in the ticket)"
    return "the ticket description only (no formal acceptance criteria)"


def assess(ticket: dict, gaps: dict) -> dict:
    """Decide whether this ticket carries enough to generate from.

    Returns {decision: ok|constrain|refuse, reason, requirement_chars,
             missing, basis, sparse}.
    """
    chars = requirement_chars(ticket)
    counts = (gaps or {}).get("counts", {})
    missing = counts.get("missing", 0)

    if chars < REFUSE_REQUIREMENT_CHARS:
        return {
            "decision": "refuse",
            "reason": (
                f"the ticket carries almost no requirement text ({chars} characters). "
                "Generating from this would mean inventing the requirements."
            ),
            "requirement_chars": chars, "missing": missing,
            "basis": evidence_basis(ticket), "sparse": True,
        }

    if chars < CONSTRAIN_REQUIREMENT_CHARS or missing >= CONSTRAIN_MISSING_GAPS:
        return {
            "decision": "constrain",
            "reason": (
                f"limited evidence: {chars} characters of requirement text and "
                f"{missing} missing gap(s). Cases will be generated in sparse-ticket "
                "mode — no invented values, fewer cases rather than padded ones."
            ),
            "requirement_chars": chars, "missing": missing,
            "basis": evidence_basis(ticket), "sparse": True,
        }

    return {
        "decision": "ok",
        "reason": f"{chars} characters of requirement text, {missing} missing gap(s).",
        "requirement_chars": chars, "missing": missing,
        "basis": evidence_basis(ticket), "sparse": False,
    }


def resolve_trace(tokens, gaps: dict, ticket: dict | None = None) -> dict:
    """Classify trace tokens: real gap id, real AC reference, or invented.

    Returns {valid, invalid, unconfirmed}:
      valid        — resolves to a known gap id, or an AC reference that exists
      invalid      — does not resolve: an invented provenance string
      unconfirmed  — resolves, but to a gap that is missing or ambiguous, so the
                     requirement behind the case is not actually settled

    An ``ACn`` reference is only accepted when the requirement material actually
    contains that id. When the material carries no numbered criteria at all we
    cannot verify the reference, so it is accepted — a prose-only AC section must
    not cause every case to be flagged.
    """
    items = (gaps or {}).get("items", [])
    known_gaps = {str(i.get("id", "")).upper(): i.get("status", "unknown") for i in items}
    ac_ids = known_ac_ids(ticket)
    verify_acs = bool(ac_ids)
    # Without the gap analysis we cannot tell a real gap id from an invented one,
    # so we accept a well-formed id rather than misreport it as fabricated.
    verify_gaps = bool(known_gaps)

    valid, invalid, unconfirmed = [], [], []
    for token in tokens or []:
        text = str(token).strip()
        if not text:
            continue

        if GAP_ID_RE.match(text):
            canonical = text.upper()
            if not verify_gaps:
                valid.append(canonical)
                continue
            status = known_gaps.get(canonical)
            if status is None:
                invalid.append(text)
            else:
                valid.append(canonical)
                if status in ("missing", "ambiguous"):
                    unconfirmed.append(canonical)
            continue

        match = AC_PREFIXED_REF_RE.match(text)
        if match:
            canonical = f"AC{match.group(1)}"
            if verify_acs and canonical not in ac_ids:
                invalid.append(text)          # cites a criterion that does not exist
            else:
                valid.append(canonical)
            continue

        if AC_REF_RE.match(text):              # 'AC-derived' / 'derived'
            valid.append(text)
            continue

        invalid.append(text)

    return {"valid": valid, "invalid": invalid, "unconfirmed": unconfirmed}
