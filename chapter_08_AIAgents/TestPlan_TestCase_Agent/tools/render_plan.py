"""Deterministic test-plan renderer (BLAST Layer 3).

Fills templates/test_plan_template.md from the ticket, the gap analysis, and the
scenario list. Structure comes from the template; only content varies — this is
the "template-fill over free-generation" rule in LLM.md §7.
"""

from __future__ import annotations

import re

TOKEN_RE = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2}


def md_cell(text) -> str:
    """Make a value safe inside a markdown table cell."""
    return str(text or "").replace("|", "\\|").replace("\n", " ").strip()


def _bullets(items, empty="*None identified.*") -> str:
    cleaned = [str(i).strip() for i in items or [] if str(i).strip()]
    if not cleaned:
        return empty
    return "\n".join(f"* {i}" for i in cleaned)


def _table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "*None identified.*"
    head = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = ["| " + " | ".join(md_cell(c) for c in row) + " |" for row in rows]
    return "\n".join([head, sep, *body])


def unfilled_tokens(text: str) -> list[str]:
    """Return any {{TOKEN}} left unreplaced — a build failure signal."""
    return sorted(set(TOKEN_RE.findall(text)))


def render(template: str, mapping: dict[str, str]) -> str:
    """Replace every {{TOKEN}} in the template."""
    def substitute(match):
        return str(mapping.get(match.group(1), match.group(0)))
    return TOKEN_RE.sub(substitute, template)


# --------------------------------------------------------------------------- #
# Section builders
# --------------------------------------------------------------------------- #

def scenario_table(scenarios: list[dict]) -> str:
    rows = []
    for s in sorted(scenarios, key=lambda x: (PRIORITY_RANK.get(x.get("priority", "P2"), 9), x.get("id", ""))):
        rows.append([
            s.get("id", ""), s.get("priority", ""),
            ", ".join(s.get("trace", []) or []) or "—",
            s.get("scenario", ""), s.get("precondition", "—"), s.get("expected", ""),
        ])
    return _table(["ID", "Priority", "Trace", "Scenario", "Precondition", "Expected Result"], rows)


def traceability_table(scenarios: list[dict]) -> str:
    grouped: dict[str, list[str]] = {}
    for s in scenarios:
        for t in s.get("trace", []) or ["—"]:
            grouped.setdefault(t, []).append(s.get("id", ""))
    rows = [[req, ", ".join(ids)] for req, ids in sorted(grouped.items())]
    return _table(["Requirement / Gap", "Scenario(s)"], rows)


def gaps_section(gaps: dict) -> str:
    order = {"missing": 0, "ambiguous": 1, "present": 2}
    icon = {"missing": "❌", "ambiguous": "⚠️", "present": "✅"}
    blocks = []
    for status in ("missing", "ambiguous", "present"):
        group = [i for i in gaps.get("items", []) if i["status"] == status]
        if not group:
            continue
        title = {"missing": "Missing / blocking", "ambiguous": "Ambiguous",
                 "present": "Present (usable as-is)"}[status]
        lines = [f"### {icon[status]} {title}"]
        for item in sorted(group, key=lambda x: x["id"]):
            lines.append(f"**{item['id']} · {item['category'].replace('_', ' ')}**")
            lines.append(item["statement"])
            if item.get("evidence"):
                lines.append(f"*Evidence:* `{md_cell(item['evidence'])[:200]}`")
            if item.get("question"):
                lines.append(f"*Question:* {item['question']}")
            lines.append("")
        blocks.append("\n".join(lines))
    counts = gaps.get("counts", {})
    header = (f"**Summary:** {counts.get('present', 0)} present · "
              f"{counts.get('ambiguous', 0)} ambiguous · "
              f"{counts.get('missing', 0)} missing\n")
    return header + "\n".join(blocks)


def risk_table(gaps: dict, scenarios: list[dict]) -> str:
    rows = []
    for item in gaps.get("items", []):
        if item["status"] == "missing":
            rows.append([item["statement"], "High", "Medium", "High", "Resolve the gap before sign-off"])
        elif item["status"] == "ambiguous":
            rows.append([item["statement"], "Medium", "Medium", "Medium", "Confirm expected behaviour"])
    if not scenarios:
        rows.append(["No test scenarios could be derived from the ticket", "High", "High", "High",
                     "Clarify requirements with the author"])
    return _table(["Risk", "Impact", "Probability", "Risk Level", "Mitigation"], rows)


def open_questions(gaps: dict) -> str:
    questions = [f"{i['id']}: {i['question']}" for i in gaps.get("items", []) if i.get("question")]
    return _bullets(questions, "*No open questions.*")


_NARRATIVE = re.compile(
    r"^as an?\s+.{0,40}?\s+i\s+(?:want|need|should|must|would\s+like)\s+to\s+"
    r"(.+?)(?:\s+so\s+that\s+.*)?$",
    re.I,
)
_REQUIREMENT_VERB = re.compile(
    r"\b(should|must|can|will|allow|support|display|show|validat|ensure|enable|"
    r"prevent|require|persist|redirect|send|generat|calculat|store|update|creat|delet|"
    r"authenticat|log\s?in|sign\s?in|submit|reject|accept|notif)",
    re.I,
)


def _sentences(text: str):
    """Yield candidate requirement sentences from a block of text."""
    for line in (text or "").split("\n"):
        line = re.sub(r"^[\s\-\*•\d\.\)\(]+", "", line).strip()
        if not line:
            continue
        for part in re.split(r"(?<=[.!?])\s+", line):
            part = part.strip()
            if part:
                yield part


_ASSERTION = re.compile(
    r"\b(should|must|shall|will|can|cannot|may|is|are|was|were|enforces|supports|requires)\b",
    re.I,
)


def _expectation(text: str) -> str:
    """Turn a requirement sentence into a non-circular expected result.

    Order matters:
      1. "Validate that X" already states the thing to observe — drop the verb.
      2. A sentence containing a modal or copula is *already* an assertion of
         required behaviour ("Remember me should persist ..."), so it is the
         expectation as written. Rewriting it only mangles the grammar.
      3. Otherwise restate the leading verb of intent as an observable outcome.
    """
    sentence = text.strip().rstrip(".")

    stripped = re.sub(r"(?i)^validate\s+that\s+", "", sentence)
    if stripped != sentence:
        return f"{stripped[:1].upper()}{stripped[1:]}"

    if _ASSERTION.search(sentence):
        return f"{sentence[:1].upper()}{sentence[1:]}"

    for pattern, build in (
        (r"(?i)^(support|provide|allow|enable|offer)\s+(.+)",
         lambda m: f"{m.group(2)[:1].upper()}{m.group(2)[1:]} is available and behaves as described"),
        (r"(?i)^(show|display|render|present)\s+(.+)",
         lambda m: f"{m.group(2)[:1].upper()}{m.group(2)[1:]} is displayed to the user"),
        (r"(?i)^(prevent|block|reject|deny)\s+(.+)",
         lambda m: f"{m.group(2)[:1].upper()}{m.group(2)[1:]} is prevented"),
        (r"(?i)^(remember|persist|store|save)\s+(.+)",
         lambda m: f"{m.group(2)[:1].upper()}{m.group(2)[1:]} persists as described"),
        (r"(?i)^(send|notify|log|track|record)\s+(.+)",
         lambda m: f"{m.group(2)[:1].upper()}{m.group(2)[1:]} is recorded"),
        (r"(?i)^(redirect|navigate)\s+(.+)",
         lambda m: f"The user is taken to {m.group(2)}"),
    ):
        match = re.match(pattern, sentence)
        if match:
            return build(match)

    return f"The expected outcome is observed: {sentence}"


def derive_scenarios(ticket: dict, gaps: dict | None = None) -> list[dict]:
    """Fallback scenario derivation when the LLM is unavailable.

    Splits the acceptance criteria (preferred) or the description into candidate
    requirement sentences, converting user-story narrative into a testable form.

    When the ticket has no acceptance criteria, every scenario traces to the
    gap that flags that absence (I-6) and is marked as needing clarification,
    because an inferred expectation is not an authoritative one.
    """
    from_acs = bool(ticket.get("acceptance_criteria"))
    source = ticket.get("acceptance_criteria") or ticket.get("description_text", "")

    # Trace to the real gap id rather than a placeholder string.
    if from_acs:
        trace = ["AC-derived"]
        needs_clarification = False
    else:
        ac_gap = next(
            (i["id"] for i in (gaps or {}).get("items", [])
             if i.get("category") == "acceptance_criteria"),
            None,
        )
        trace = [ac_gap] if ac_gap else ["derived"]
        needs_clarification = True

    candidates: list[str] = []
    for sentence in _sentences(source):
        text = sentence
        narrative = _NARRATIVE.match(sentence)
        if narrative:
            text = "Validate that the user can " + narrative.group(1).strip()
        elif not from_acs and not _REQUIREMENT_VERB.search(sentence):
            continue  # descriptive prose, not a requirement
        if len(text) < 15 or len(text) > 200:
            continue
        if text.endswith(":"):
            continue
        cleaned = text.rstrip(".")
        if cleaned not in candidates:
            candidates.append(cleaned)

    if not candidates:
        candidates = [f"Validate the behaviour described in {ticket.get('issue_key', 'the ticket')}"]

    scenarios = []
    for idx, text in enumerate(candidates[:12], start=1):
        priority = "P0" if idx <= 3 else ("P1" if idx <= 8 else "P2")
        scenarios.append({
            "id": f"S-{idx:02d}",
            "priority": priority,
            "trace": list(trace),
            # With real ACs the criterion IS the expectation; without them we
            # must state an inference and flag it rather than imply authority.
            "expected": text if from_acs else _expectation(text),
            "scenario": text,
            "precondition": "As described in the ticket",
            "_needs_clarification": needs_clarification,
        })
    return scenarios


def _gap_state(gaps: dict, category: str) -> str:
    """Return present/ambiguous/missing for a gap category."""
    for item in (gaps or {}).get("items", []):
        if item.get("category") == category:
            return item.get("status", "unknown")
    return "unknown"


def build_mapping(ticket: dict, gaps: dict, scenarios: list[dict], settings: dict,
                  doc_version: str = "1.0") -> dict[str, str]:
    key = ticket.get("issue_key", "")
    summary = ticket.get("summary", "")
    components = ", ".join(ticket.get("components") or []) or "Not specified"
    blocking = gaps.get("blocking", [])
    counts = gaps.get("counts", {})
    ac_present = bool(ticket.get("acceptance_criteria"))

    nfr_gap = next((i for i in gaps.get("items", []) if i.get("category") == "non_functional"), None)
    non_functional = (
        "Performance, security, and accessibility requirements are stated in the ticket."
        if nfr_gap and nfr_gap["status"] == "present"
        else f"{nfr_gap['statement'] if nfr_gap else 'No non-functional requirements stated.'} (see Gaps & Questions)"
    )

    return {
        # ---- header block ----
        "PROJECT_NAME": summary or key,
        "ISSUE_KEY": key,
        "SUMMARY": summary,
        "ISSUE_TYPE": ticket.get("issue_type", ""),
        "PRIORITY": ticket.get("priority", ""),
        "STATUS": ticket.get("status", ""),
        "COMPONENTS": components,
        "LABELS": ", ".join(ticket.get("labels") or []) or "None",
        "FIX_VERSIONS": ", ".join(ticket.get("fix_versions") or []) or "Needs clarification",
        "SPRINT": ticket.get("sprint") or "Not specified",
        "DOC_VERSION": doc_version,
        "GENERATED_AT": ticket.get("fetched_at", ""),
        "PREPARED_BY": settings.get("qa_name") or "QA (generated)",
        "REVIEWED_BY": "Needs clarification",
        "APPROVED_BY": "Needs clarification",
        "PLANNED_START": "Needs clarification",
        "PLANNED_COMPLETION": "Needs clarification",
        "TARGET_RELEASE": ", ".join(ticket.get("fix_versions") or []) or "Needs clarification",
        "SOURCE_HASH": ticket.get("source_hash", ""),
        "ATTACHMENTS": ", ".join(
            f"{a.get('filename', '')}"
            + (f" ({a.get('chars')} chars read)" if a.get("status") == "read" else
               f" [{a.get('status', 'unknown')}]")
            for a in ticket.get("attachments") or []
        ) or "None",

        # ---- 1. Overview, Objectives & Scope ----
        "OVERVIEW": (
            f"This Test Plan defines the quality assurance strategy, scope, risks, and release "
            f"criteria for **{summary}** (Jira {key}; priority {ticket.get('priority', 'n/a')}).\n\n"
            f"What the ticket says:\n\n{ticket.get('description_text', 'Not specified')}\n\n"
            + (f"Attached requirements (read from the ticket's files):\n\n"
               f"{ticket.get('attachment_text')}\n\n"
               if (ticket.get("attachment_text") or "").strip() else "")
            + f"It records what can be validated today and which requirements remain too "
              f"ambiguous to test — see *Gaps & Questions*."
        ),
        "OBJECTIVES": _bullets([
            f"Validate the functionality described in {key} against the ticket requirements.",
            "Verify the critical user journeys end to end.",
            "Confirm failure and error paths behave predictably.",
            "Confirm that existing functionality is not adversely affected by the change.",
            f"Resolve or explicitly accept the {len(blocking)} blocking gap(s) before sign-off.",
            "Provide objective quality evidence to support the release decision.",
        ]),
        "IN_SCOPE": _bullets([
            f"Functional behaviour of: {summary}.",
            f"Components: {components}.",
            "End-to-end journeys derived from the ticket requirements.",
            "Integration points and their failure paths, where described.",
        ]),
        "PLATFORMS": _bullets([
            "Browsers: Needs clarification (proposed: Chrome, Firefox, Safari, Edge).",
            "Operating systems: Needs clarification (proposed: Windows, macOS).",
            "Device classes: Needs clarification (proposed: desktop, tablet, mobile).",
        ]),
        "NON_FUNCTIONAL": f"{non_functional}",
        "OUT_OF_SCOPE": _bullets([
            "Features not described in this ticket.",
            "Server-side internals beyond the integration boundary, unless the ticket exposes them.",
            "Anything the ticket defers to a later phase.",
            "Performance and load testing of infrastructure outside the changed surface.",
        ]),

        # ---- 2. Quality & Risk Assessment ----
        "RISK_TABLE": risk_table(gaps, scenarios),
        "RISK_PRIORITIZATION": (
            "Testing priority is driven by business criticality, customer impact, technical "
            f"complexity, and the gaps below. {counts.get('missing', 0)} item(s) are currently "
            "missing and " + f"{counts.get('ambiguous', 0)} ambiguous; high-risk areas receive "
            "greater test depth and earlier execution. "
            + ("Historical defect data was not provided, so priorities are inference-based."
               if not ac_present else "Priorities trace to the ticket's acceptance criteria.")
        ),

        # ---- 3. Test Strategy & Coverage ----
        "TEST_TYPES": _bullets([
            "Functional testing — the UI flows described by the ticket.",
            "Negative testing — invalid input and denied access (behaviour observed, never invented).",
            "Boundary and equivalence classes — exact boundaries Needs clarification.",
            "Smoke testing on every build.",
            "Regression testing around the changed surface.",
            "Exploratory testing based on the identified risks.",
            "Compatibility testing — the browser matrix Needs clarification.",
            "Performance and accessibility — Needs clarification unless stated in the ticket.",
        ]),
        "TEST_DESIGN": _bullets([
            "Positive scenarios for each requirement.",
            "Negative scenarios for each failure path the ticket describes.",
            "Boundary conditions for numeric and length limits, where stated.",
            "Error handling: exact messages are recorded verbatim from the application, never invented.",
            "Role and permission combinations — Needs clarification if roles are undocumented.",
            "Integration failure and recovery paths.",
        ]),
        "TRACEABILITY_TABLE": traceability_table(scenarios),
        "COVERAGE_NOTE": (
            f"covering {len(scenarios)} scenario(s) with "
            f"{counts.get('missing', 0)} blocking gap(s) open. Each scenario traces to a "
            "requirement or a gap id; nothing is traced to an invented requirement."
        ),

        # ---- 4. Test Environment, Data & Automation ----
        "ENVIRONMENTS_TABLE": _table(
            ["Environment", "Purpose", "Owner", "Status"],
            [["DEV", "Developer validation", "Engineering", "Needs clarification"],
             ["QA/SIT", "Functional & integration testing", "QA", "Needs clarification"],
             ["UAT", "Business validation", "Product/Business", "Needs clarification"],
             ["Staging", "Production-like validation", "Engineering/QA", "Needs clarification"]],
        ),
        "ENVIRONMENT_NOTES": _bullets([
            "Environment URLs: Needs clarification.",
            "Application version under test: Needs clarification.",
            "Browser/device matrix: Needs clarification.",
        ]),
        "TEST_DATA_STRATEGY": _bullets([
            "Positive data: a valid account or entity for each journey.",
            "Negative data: invalid, missing, and malformed inputs.",
            "Boundary data: minimum and maximum lengths and thresholds.",
            "Test accounts and environments: Needs clarification — see Gaps & Questions.",
            "Production-derived data only where permitted, and masked.",
        ]),
        "AUTOMATION_STRATEGY": _bullets([
            "Objective: improve repeatability of the regression and smoke checks.",
            "Scope: the end-to-end journeys in the Test Scenarios table.",
            "Framework: the repository's existing Playwright + TypeScript suite "
            "(`chapter_02_PromptEng/PlaywriteFramework/`) consumes the generated case file.",
            "This agent emits the case file (`Regression_Cases.md` + `.csv`), not runnable code.",
            "Manual testing remains for exploratory, visual, and usability judgement.",
            "CI/CD integration and reporting: follows the consuming suite's setup.",
        ]),
        "ENV_RISKS": _bullets([
            item["statement"] for item in gaps.get("items", [])
            if item["category"] in ("environment", "test_data", "integration")
        ] or ["No environment or data risks identified from the ticket."]),

        # ---- 6. Entry / Exit ----
        "ENTRY_CRITERIA": _bullets([
            "Requirements clarified, or every gap below explicitly accepted.",
            "Testable build deployed to a stable environment.",
            "Required test data and accounts available.",
            "Critical dependencies reachable.",
        ]),
        "EXIT_CRITERIA": _bullets([
            "All P0 scenarios executed.",
            "Critical journeys passed.",
            "Planned regression completed.",
            "No unresolved Critical defects, unless explicitly accepted.",
            "Test results and residual risk communicated to stakeholders.",
        ]),

        # ---- 7. Resources, Dependencies & Deliverables ----
        "DEPENDENCIES": _bullets([
            "Valid application credentials and test accounts.",
            "Access to a test or staging environment.",
            "Sample data to exercise the journeys.",
            "Browser availability for the agreed matrix.",
        ]),
        "ASSUMPTIONS": _bullets([
            "The ticket description is the authoritative requirement source.",
            "Requirements will be clarified before the plan is treated as approved.",
            "Environments and test data will be provided by the delivery team.",
            "The repository's existing automation framework remains available.",
        ]),
        "CONSTRAINTS": _bullets([
            f"{len(blocking)} blocking gap(s) currently prevent definitive sign-off.",
            "No planned dates were supplied with the ticket.",
            "Without acceptance criteria, pass/fail is subjective until the scenarios are confirmed.",
        ]),

        # ---- tail ----
        "SCENARIO_TABLE": scenario_table(scenarios),
        "GAPS_SECTION": gaps_section(gaps),
        "OPEN_QUESTIONS": open_questions(gaps),
        "GATE_STATUS": "PENDING HUMAN REVIEW",
    }


def render_plan(template_text: str, ticket: dict, gaps: dict, scenarios: list[dict],
                settings: dict) -> tuple[str, list[str]]:
    """Render the plan. Returns (markdown, unreplaced_tokens)."""
    mapping = build_mapping(ticket, gaps, scenarios, settings)
    markdown = render(template_text, mapping)
    return markdown, unfilled_tokens(markdown)
