"""Navigation layer: approved plan -> E2E regression test cases.

Cases are GENERATED from the ticket (never selected from an existing suite) and
are END-TO-END: user-journey shaped, not unit or single-API checks.
"""

from __future__ import annotations

import llm_client
from tools import gate

CASE_SYSTEM = """You are a Senior QA Engineer writing END-TO-END regression test cases.

Output ONLY a JSON array. No prose, no markdown fences, no commentary.
Each element must have exactly these keys:
  "scenario_id"          - the scenario id this case covers, e.g. "S-01"
  "testcase_description"- one clear sentence describing the case
  "precondition"         - what must be true before execution, or "None"
  "test_steps"           - array of 2 to 4 high-level step strings
  "steps_to_execute"     - array of 3 to 6 granular, executable step strings
  "expected_result"      - the single observable expected result
  "priority"             - "P0", "P1" or "P2"
  "is_automated"         - "Yes" or "No"
  "journey"              - the user journey in "start -> end" form

HARD RULES:
- Every case must be an END-TO-END user journey. Never output unit tests or
  single-API checks.
- Never invent exact error messages, error codes, numeric limits, timeouts, or
  password rules. If the ticket does not state it, describe the behaviour
  generically instead.
- One JSON array only."""


SPARSE_TICKET_RULES = """
SPARSE TICKET MODE — the material above is thin, so invention is the main risk:
- Do NOT invent field names, values, numeric limits, thresholds, error strings,
  statuses, or states that are not present in the material above.
- Where a needed detail is missing, write the step generically and set the
  expectation to include the marker «not specified in ticket».
- Produce FEWER well-grounded cases rather than padding to reach a count.
  Fewer grounded cases is the correct outcome here.
- trace must be a real reference: an acceptance-criteria id (AC1, AC2, ...) or a
  gap id exactly as listed above (G-01, G-02, ...). Never write prose as a trace."""

PROVENANCE_RULES = """
- trace must be a real reference: an acceptance-criteria id (AC1, AC2, ...) or a
  gap id exactly as listed above (G-01, G-02, ...). Never write a sentence or an
  invented acceptance criterion as a trace."""


def _to_steps(raw) -> list[dict]:
    """Normalise step input (strings or dicts) to [{n, action, data}]."""
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    steps = []
    for idx, item in enumerate(raw, start=1):
        if isinstance(item, dict):
            action = str(item.get("action") or item.get("step") or "").strip()
            data = str(item.get("data") or "").strip()
        else:
            action, data = str(item).strip(), ""
        if action:
            steps.append({"n": idx, "action": action, "data": data})
    return steps


def _clean(value, fallback: str = "") -> str:
    text = str(value if value is not None else "").strip()
    return text or fallback


def normalise_case(raw: dict, idx: int, ticket: dict, by_scenario: dict,
                   gaps: dict | None = None) -> dict | None:
    """Map model output onto the internal case schema (LLM.md §3.4)."""
    if not isinstance(raw, dict):
        return None

    scenario_id = _clean(raw.get("scenario_id"))
    scenario = by_scenario.get(scenario_id) or {}
    if not scenario_id:
        scenario_id = scenario.get("id", f"S-{idx:02d}")

    description = _clean(raw.get("testcase_description") or raw.get("title"))
    if not description:
        return None

    priority = _clean(raw.get("priority"), scenario.get("priority", "P1")).upper()
    if priority not in ("P0", "P1", "P2"):
        priority = scenario.get("priority", "P1")

    test_steps = _to_steps(raw.get("test_steps") or raw.get("steps"))
    exec_steps = _to_steps(raw.get("steps_to_execute")) or test_steps

    trace = list(scenario.get("trace") or ["derived"])
    resolved = gate.resolve_trace(trace, gaps or {"items": []}, ticket)

    # The case needs clarification when its grounding is not settled: an invented
    # trace, a trace pointing at an unresolved gap, or the scenario itself being
    # an inference. This is what the model used to bypass entirely.
    clarification = (
        bool(raw.get("clarification_needed"))
        or bool(scenario.get("_needs_clarification"))
        or bool(resolved["invalid"])
        or bool(resolved["unconfirmed"])
    )

    key = ticket.get("issue_key", "ISSUE")
    return {
        "scenario_tid": f"{key}-{scenario_id}-C{idx:02d}",
        "issue_key": key,
        "scenario_id": scenario_id,
        "testcase_description": description,
        "precondition": _clean(raw.get("precondition"), "None"),
        "test_steps": test_steps,
        "expected_result": _clean(raw.get("expected_result") or raw.get("expected"),
                                  scenario.get("expected", "Behaviour matches the requirement")),
        "steps_to_execute": exec_steps,
        "priority": priority,
        "is_automated": _clean(raw.get("is_automated"), "Yes"),
        "category": _clean(raw.get("category"), "functional").lower(),
        "is_e2e": True,
        "journey": _clean(raw.get("journey"), scenario.get("scenario", "")),
        "test_data_refs": raw.get("test_data_refs") or [],
        "clarification_needed": clarification,
        "trace": list(trace),
        "trace_verified": not resolved["invalid"],
        "trace_rejected": resolved["invalid"],
    }


def _case_prompt(ticket: dict, scenarios: list[dict], max_cases: int) -> str:
    lines = []
    for s in scenarios:
        lines.append(
            f"- {s['id']} [{s['priority']}] {s['scenario']} "
            f"| expected: {s['expected']} | trace: {', '.join(s['trace'])}"
        )
    attached = (ticket.get("attachment_text") or "").strip()
    attachment_block = (
        f"ATTACHED REQUIREMENTS (authoritative — take concrete values, field names, "
        f"and stock/state labels from here):\n{attached[:8000]}\n\n"
        if attached else ""
    )
    return (
        f"ISSUE KEY: {ticket.get('issue_key', '')}\n"
        f"SUMMARY: {ticket.get('summary', '')}\n"
        f"PRIORITY: {ticket.get('priority', '')}\n\n"
        f"ACCEPTANCE CRITERIA:\n{ticket.get('acceptance_criteria') or 'NONE FOUND IN TICKET'}\n\n"
        f"{attachment_block}"
        f"DESCRIPTION (truncated):\n{ticket.get('description_text', '')[:3000]}\n\n"
        f"TEST SCENARIOS (already approved):\n" + "\n".join(lines) + "\n\n"
        f"Write END-TO-END regression test cases covering these scenarios. "
        f"Produce at most {max_cases} cases, prioritising P0 then P1. "
        f"Return the JSON array now."
    )


def fallback_cases(ticket: dict, scenarios: list[dict], gaps: dict,
                   max_cases: int = 15) -> list[dict]:
    """Deterministic case derivation when the LLM is unavailable.

    One E2E case per P0/P1 scenario so the pipeline still produces a valid,
    traceable case file. ``gaps`` is required: without it a real gap id cannot be
    told apart from an invented one, and traces would be misreported.
    """
    key = ticket.get("issue_key", "ISSUE")
    selected = [s for s in scenarios if s.get("priority") in ("P0", "P1")] or scenarios
    cases = []
    for idx, scenario in enumerate(selected[:max_cases], start=1):
        sid = scenario.get("id", f"S-{idx:02d}")
        trace = list(scenario.get("trace") or ["derived"])
        resolved = gate.resolve_trace(trace, gaps, ticket)
        cases.append({
            "scenario_tid": f"{key}-{sid}-C{idx:02d}",
            "issue_key": key,
            "scenario_id": sid,
            "testcase_description": scenario.get("scenario", "Validate the requirement"),
            "precondition": scenario.get("precondition", "As described in the ticket"),
            "test_steps": _to_steps([
                "Reach the state described in the precondition",
                f"Exercise the requirement: {scenario.get('scenario', 'the change under test')}",
                "Observe the result",
            ]),
            "expected_result": scenario.get("expected", "Behaviour matches the requirement"),
            "steps_to_execute": _to_steps([
                "Open the application at the relevant entry point",
                "Reach the state described in the precondition",
                f"Exercise the requirement: {scenario.get('scenario', 'the change under test')}",
                "Observe the resulting state and compare it with the expected result",
            ]),
            "priority": scenario.get("priority", "P1"),
            "is_automated": "Yes",
            "category": "functional",
            "is_e2e": True,
            "journey": scenario.get("scenario", ""),
            "test_data_refs": [],
            "clarification_needed": (
                bool(scenario.get("_needs_clarification"))
                or bool(resolved["invalid"]) or bool(resolved["unconfirmed"])
            ),
            "trace": trace,
            "trace_verified": not resolved["invalid"],
            "trace_rejected": resolved["invalid"],
        })
    return cases


def build_cases(settings: dict, ticket: dict, scenarios: list[dict], gaps: dict,
                max_cases: int = 15) -> tuple[list[dict], str, str]:
    """Generate E2E cases. Returns (cases, provider, note).

    ``gaps`` is required — the evidence gate needs it, and so does trace
    validation. Defaulting it meant a caller could silently skip both.

    Refuses to generate when the ticket carries almost no requirement text: at
    that point "generating" means inventing, and an empty result with a reason is
    the honest output.
    """
    assessment = gate.assess(ticket, gaps)
    if assessment["decision"] == "refuse":
        return [], "none", (
            f"Refused to generate: {assessment['reason']} "
            "Close some of the gaps, or attach the requirements, and run again."
        )

    by_scenario = {s.get("id", ""): s for s in scenarios}
    system_prompt = CASE_SYSTEM
    if assessment["sparse"]:
        system_prompt += "\n" + SPARSE_TICKET_RULES
    else:
        system_prompt += "\n" + PROVENANCE_RULES

    try:
        text, provider = llm_client.complete(
            settings, system_prompt, _case_prompt(ticket, scenarios, max_cases)
        )
        raw = llm_client.extract_json(text)
        if isinstance(raw, dict):
            raw = raw.get("cases") or raw.get("test_cases") or raw.get("items") or []
        if not isinstance(raw, list):
            raise ValueError("Case response was not a JSON array.")

        cases = []
        for idx, item in enumerate(raw[:max_cases], start=1):
            case = normalise_case(item, idx, ticket, by_scenario, gaps)
            if case:
                cases.append(case)
        if cases:
            rejected = sum(1 for c in cases if not c.get("trace_verified"))
            note = f"{len(cases)} E2E cases generated by the model."
            if assessment["sparse"]:
                note += " Generated in sparse-ticket mode."
            if rejected:
                note += f" {rejected} case(s) carried an invented trace and were flagged."
            return cases, provider, note
        note = "Model returned no usable cases; used deterministic derivation."
    except (llm_client.LLMError, ValueError) as exc:
        provider = "none"
        note = f"LLM unavailable ({exc}); used deterministic derivation."

    return fallback_cases(ticket, scenarios, gaps, max_cases), provider, note
