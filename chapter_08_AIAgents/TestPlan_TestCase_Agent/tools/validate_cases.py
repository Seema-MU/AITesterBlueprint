"""Contract guards for the regression case file (BLAST Layer 3).

Enforces the rules in LLM.md §6/§8. Every check is deterministic; nothing here
calls an LLM. A failure must never be reported as success.
"""

from __future__ import annotations

import csv

from . import contract


def read_csv_header(path: str) -> list[str]:
    with open(path, newline="", encoding="utf-8") as handle:
        return next(csv.reader(handle), [])


def read_csv_rows(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def validate(cases: list[dict], rows: list[dict], csv_path: str | None = None,
             md_count: int | None = None) -> dict:
    """Run every contract guard. Returns {ok, grounding_ok, issues, metrics}.

    Two severities, because they are different failures:
      * **contract** — the file itself is malformed (bad header, blanks in
        authored columns, filled execution columns, row parity). Unusable.
      * **grounding** — the file is well-formed but a case's provenance is
        unreliable (an invented trace). Reportable and countable; the case may
        still be valid, so it does not make the file invalid.
    """
    issues: list[dict] = []

    def fail(code: str, message: str, severity: str = "contract"):
        issues.append({"code": code, "message": message, "severity": severity})

    # --- Column contract ---------------------------------------------------
    if csv_path:
        headers = read_csv_header(csv_path)
        drift = contract.contract_drift(headers)
        if drift:
            fail("CONTRACT-DRIFT", f"CSV header does not match the frozen contract: {drift}")
        dupes = contract.duplicate_headers(headers)
        if dupes:
            fail("DUPLICATE-HEADER",
                 f"Duplicate column names {dupes} — CSV parsers silently drop the earlier columns.")

    # --- Per-row rules -----------------------------------------------------
    authored_blank = 0
    execution_filled = 0
    orphans = 0
    not_e2e = 0
    invented_traces = 0

    for idx, case in enumerate(cases, start=1):
        trace = case.get("trace") or []
        if not trace or all(not str(t).strip() for t in trace):
            orphans += 1
            fail("ORPHAN-TRACE",
                 f"Row {idx} ({case.get('scenario_tid', '?')}) has no trace to an AC or gap id.")
        if case.get("is_e2e") is False:
            not_e2e += 1
            fail("NOT-E2E", f"Row {idx} ({case.get('scenario_tid', '?')}) is not an E2E case.")
        if not case.get("trace_verified", True):
            invented_traces += 1
            rejected = "; ".join(case.get("trace_rejected") or []) or "unresolved"
            fail("INVALID-TRACE",
                 f"Row {idx} ({case.get('scenario_tid', '?')}) carries a trace that does not "
                 f"resolve to a known gap id or acceptance-criteria reference: {rejected!r}.",
                 "grounding")

    for idx, row in enumerate(rows, start=1):
        for header in contract.AUTHORED_HEADERS:
            if header in contract.AUTHORED_OPTIONAL:
                continue
            if not str(row.get(header, "")).strip():
                authored_blank += 1
                fail("AUTHORED-BLANK", f"Row {idx}: authored column '{header}' is empty.")
        for header in contract.EXECUTION_HEADERS:
            if str(row.get(header, "")).strip():
                execution_filled += 1
                fail("EXECUTION-FILLED",
                     f"Row {idx}: execution column '{header}' must be empty — cases are generated, not executed.")

    # --- Parity ------------------------------------------------------------
    if md_count is not None and md_count != len(cases):
        fail("MD-CSV-DRIFT",
             f"Markdown has {md_count} rows but the case list has {len(cases)}.")
    if csv_path:
        csv_count = len(read_csv_rows(csv_path))
        if csv_count != len(cases):
            fail("MD-CSV-DRIFT",
                 f"CSV has {csv_count} rows but the case list has {len(cases)}.")

    contract_issues = [i for i in issues if i["severity"] == "contract"]
    grounding_issues = [i for i in issues if i["severity"] == "grounding"]
    metrics = {
        "cases": len(cases),
        "authored_blank": authored_blank,
        "execution_filled": execution_filled,
        "orphan_traces": orphans,
        "not_e2e": not_e2e,
        "invented_traces": invented_traces,
    }
    return {
        "ok": not contract_issues,
        "grounding_ok": not grounding_issues,
        "issues": issues,
        "contract_issues": contract_issues,
        "grounding_issues": grounding_issues,
        "metrics": metrics,
    }
