"""Emit the regression case file as .md + .csv (BLAST Layer 3).

Both formats render from the SAME cases[] list, so they can never drift
(invariant: md/csv parity). Column order and names come from tools/contract.py.
"""

from __future__ import annotations

import csv
import os

from . import contract


def encode_steps(steps: list[dict]) -> str:
    """Encode step dicts as '1) action [data] | 2) ...'.

    A literal '|' inside a step is escaped as '\\|' so the separator stays
    unambiguous.
    """
    if isinstance(steps, str):
        steps = [steps]
    parts = []
    for idx, step in enumerate(steps or [], start=1):
        if isinstance(step, dict):
            action = str(step.get("action", "")).strip()
            data = str(step.get("data", "")).strip()
        else:
            action, data = str(step).strip(), ""
        if not action:
            continue
        text = f"{action} [{data}]" if data else action
        parts.append(f"{idx}) {text.replace('|', chr(92) + '|')}")
    return contract.STEP_SEPARATOR.join(parts)


def _misc(case: dict) -> str:
    """Misc (Comments) carries the trace, since the contract has no trace column."""
    trace = ";".join(case.get("trace", []) or []) or "—"
    note = f"trace: {trace}"
    if not case.get("trace_verified", True):
        rejected = "; ".join(case.get("trace_rejected") or []) or "unresolved"
        note += f" | TRACE UNVERIFIED (invented: {rejected})"
    if case.get("clarification_needed"):
        note += " | NEEDS CLARIFICATION"
    if case.get("journey"):
        note += f" | journey: {case['journey']}"
    return note


def to_row(case: dict) -> dict:
    """Map an internal case (LLM.md §3.4) onto the frozen 12-column contract."""
    return {
        "Scenario TID": case.get("scenario_tid", ""),
        "TestCase Description": case.get("testcase_description", ""),
        "PreCondition": case.get("precondition", "") or "None",
        "TestSteps": encode_steps(case.get("test_steps")),
        "Expected Result": case.get("expected_result", ""),
        "Actual Result": "",          # execution-time — never generated
        "Steps to Execute": encode_steps(case.get("steps_to_execute")),
        "Status": "",                 # execution-time
        "Executed QA Name": "",       # execution-time + PII — never generated
        "Misc (Comments)": _misc(case),
        "Priority": case.get("priority", ""),
        "Is Automated": case.get("is_automated", "Yes"),
    }


def emit_csv(rows: list[dict], path: str) -> None:
    """Write the CSV. UTF-8 (no BOM), CRLF, RFC-4180 quoting."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=contract.HEADERS,
                                quoting=csv.QUOTE_MINIMAL, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _md_cell(value) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def emit_markdown(rows: list[dict], meta: dict, path: str) -> None:
    """Write the review-friendly markdown mirror with the identical 12 columns."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    lines = [
        f"# E2E Regression Test Cases — {meta.get('issue_key', '')}",
        "",
        f"**Ticket:** {meta.get('issue_key', '')} — {meta.get('summary', '')}",
        f"**Generated:** {meta.get('generated_at', '')}",
        f"**Source hash:** `{meta.get('source_hash', '')}`",
        f"**Test plan:** {meta.get('plan_file', '(not written)')}",
        f"**Cases:** {len(rows)}",
        f"**Evidence basis:** {meta.get('basis', 'not recorded')}",
        f"**Grounding:** {meta.get('grounding', 'not recorded')}",
        "",
        "> Columns and order are the frozen contract (`LLM.md` §3.5). "
        "`Actual Result`, `Status`, and `Executed QA Name` are deliberately empty — "
        "this agent generates cases, it does not execute them.",
        "",
        "---",
        "",
        "| " + " | ".join(contract.HEADERS) + " |",
        "| " + " | ".join("---" for _ in contract.HEADERS) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_md_cell(row.get(h, "")) for h in contract.HEADERS) + " |")

    lines += [
        "",
        "---",
        "",
        "## Gaps & Questions",
        "",
        meta.get("gaps_summary", "*See the test plan for the full gap list.*"),
        "",
        "---",
        "",
        "## --- HUMAN REVIEW GATE ---",
        "",
        f"**Status: {meta.get('gate_status', 'PENDING HUMAN REVIEW')}**",
        "",
        "These cases were derived from the approved test plan. Review before feeding them "
        "into the automation suite.",
        "",
    ]
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))


def write_case_files(cases: list[dict], out_dir: str, ticket: dict,
                     stamp: str, meta_extra: dict | None = None,
                     scenario_ids: list[str] | None = None) -> dict:
    """Write both formats from one cases[] list. Returns the written paths.

    ``scenario_ids`` (the plan's full scenario list) enables a coverage note: an
    LLM asked to prioritise P0 then P1 can legitimately drop a lower-priority
    scenario, but dropping it silently would hide the gap.
    """
    key = ticket.get("issue_key", "UNKNOWN")
    rows = [to_row(case) for case in cases]
    base = f"{key}_{stamp}_Regression_Cases"
    md_path = os.path.join(out_dir, base + ".md")
    csv_path = os.path.join(out_dir, base + ".csv")

    flagged = [c for c in cases if c.get("clarification_needed")]
    unverified = sum(1 for c in cases if not c.get("trace_verified", True))
    settled = len(cases) - len(flagged)

    if not flagged:
        grounding = f"all {len(cases)} case(s) rest on settled references"
    else:
        grounding = (
            f"{settled} of {len(cases)} case(s) rest on a settled reference; "
            f"{len(flagged)} {'rests' if len(flagged) == 1 else 'rest'} on an unresolved gap or an "
            f"inferred expectation"
            + (f" ({unverified} carried an invented trace)" if unverified else "")
            + " — marked NEEDS CLARIFICATION in the Misc column"
        )

    distinct = {t for c in cases for t in (c.get("trace") or [])}
    if len(cases) > 3 and len(distinct) == 1:
        grounding += (f". Note: every case traces to the same reference "
                      f"({next(iter(distinct))}), so the trace column does not "
                      f"discriminate between cases")

    if scenario_ids:
        covered = {c.get("scenario_id") for c in cases}
        uncovered = [s for s in scenario_ids if s not in covered]
        if uncovered:
            grounding += (
                f". Coverage: {len(scenario_ids) - len(uncovered)} of {len(scenario_ids)} plan "
                f"scenario(s) have a case; {', '.join(uncovered)} "
                f"{'is' if len(uncovered) == 1 else 'are'} not covered "
                f"(generation prioritises P0, then P1)"
            )

    meta = {
        "issue_key": key,
        "summary": ticket.get("summary", ""),
        "generated_at": ticket.get("fetched_at", ""),
        "source_hash": ticket.get("source_hash", ""),
        "grounding": grounding,
    }
    meta.update(meta_extra or {})

    emit_markdown(rows, meta, md_path)
    emit_csv(rows, csv_path)
    return {"md": md_path, "csv": csv_path, "rows": rows}
