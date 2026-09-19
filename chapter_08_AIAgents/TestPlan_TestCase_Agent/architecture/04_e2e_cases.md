# SOP 04 — E2E regression test cases

**Tools:** `case_builder.py` (LLM) + `tools/emit_cases.py` + `tools/validate_cases.py` (deterministic).

## Goal
Turn the approved plan into **end-to-end regression test cases**, emitted as `.md` + `.csv` for the automation suite.

**Generation, not selection.** The ticket is the input; we author new cases. We do not query an existing suite and pick from it.

## The frozen 12-column contract (LLM.md §3.5)

```
Scenario TID, TestCase Description, PreCondition, TestSteps, Expected Result,
Actual Result, Steps to Execute, Status, Executed QA Name, Misc (Comments),
Priority, Is Automated
```

Defined once in `tools/contract.py`. **Additive changes only — never reorder, never rename.** Header identity is compared as an ordered list, not a set.

### Authoring vs execution columns
| Class | Columns | Rule |
| ----- | ------- | ---- |
| **AUTHORED** | Scenario TID, TestCase Description, PreCondition, TestSteps, Expected Result, Steps to Execute, Misc (Comments), Priority, Is Automated | must be populated |
| **EXECUTION** | Actual Result, Status, Executed QA Name | must be **empty** |

**We generate cases; we do not execute them.** A non-empty `Actual Result` is a build failure — never let a model invent one. `Executed QA Name` is a person's name and is never auto-filled (I-8).

## Encoding rules
- `TestSteps` / `Steps to Execute`: `1) action [data] | 2) …` — `n)` prefix, ` | ` separator; a literal `|` inside a step is escaped `\|`.
- `PreCondition`: `;`-joined, or `None`.
- `Misc (Comments)`: carries `trace: S-01;G-05` (the contract has no trace column) plus `NEEDS CLARIFICATION` where relevant.
- CSV: UTF-8 **without BOM**, CRLF, comma delimiter, RFC-4180 quoting.

## Steps
1. `build_cases()` → JSON array of E2E cases; normalised onto the internal schema (`normalise_case`).
   **Runs the evidence gate first** (SOP 06): an under-specified ticket is refused rather than
   invented, and a thin one is generated in sparse-ticket mode.
2. `fallback_cases()` → one case per P0/P1 scenario if the LLM is unavailable.
3. `emit_cases.write_case_files()` → both formats from **one** `cases[]` list (guarantees parity).
4. `validate_cases.validate()` → run every guard.

## Guards (LLM.md §6)
`CONTRACT-DRIFT` · `DUPLICATE-HEADER` · `AUTHORED-BLANK` · `EXECUTION-FILLED` · `ORPHAN-TRACE` · `NOT-E2E` · `MD-CSV-DRIFT` · `INVALID-TRACE`

Two severities: **contract** failures make the file unusable (`ok: false`); **grounding**
failures — an invented trace — leave the file valid but are reported via `grounding_ok`,
counted in the metrics, and warned about in the UI.

Duplicate headers matter: `csv.DictReader` and pandas keep only the **last** duplicate, silently dropping the earlier column with no error.

Every case's `trace` must resolve to a gap id that exists or an acceptance-criteria id that
exists in the requirement material (I-10, SOP 06).

## Output
`<output_dir>/<KEY>_<timestamp>_Regression_Cases.md` and `.csv`.

## Do not
- Emit runnable Playwright/Selenium code (v1 scope ends at the case file).
- Report success when a guard failed.
