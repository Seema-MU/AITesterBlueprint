# Architecture (B.L.A.S.T. Layer 1)

Technical SOPs. **The Golden Rule: if the logic changes, update the SOP before updating the code.**

| SOP | Covers |
| --- | ------ |
| [01_fetch_ticket.md](./01_fetch_ticket.md) | Jira fetch, ADF flattening, error taxonomy |
| [02_gap_analysis.md](./02_gap_analysis.md) | The requirement checklist and its verdicts |
| [03_test_plan.md](./03_test_plan.md) | Scenario derivation and template rendering |
| [04_e2e_cases.md](./04_e2e_cases.md) | E2E case generation and the 12-column contract |
| [05_review_gate.md](./05_review_gate.md) | The mandatory human approval gate |
| [06_evidence_gate.md](./06_evidence_gate.md) | The evidence gate and trace validation |

Layer map:

```
architecture/   Layer 1 — SOPs (this folder)
planner.py, case_builder.py, llm_client.py, app.py   Layer 2 — navigation
tools/          Layer 3 — deterministic Python, no LLM
```

## Operating note — restart after editing a module

Streamlit hot-reloads the **entry script** (`app.py`) but does **not** reload imported
modules. A long-running server can therefore serve current page code against stale library
code, producing errors that make no sense against the source on disk. A real example: after
`build_cases()` gained a required parameter, the running server still had the old module and
raised

```
build_cases() takes from 3 to 4 positional arguments but 5 were given
```

**Rule:** after editing anything outside `app.py` — `tools/*.py`, `planner.py`,
`case_builder.py`, `llm_client.py`, `settings_manager.py` — **stop and restart the server**.
Health checks do not catch this: `/health` proves *a* server is listening, not *which code*
it is running. The sidebar shows a `build <hash>` stamp derived from the **live imported**
signatures; if it does not change after an edit, the server is stale.

`AppTest` (used by `.tmp/ui_test.py`) imports modules in-process, so it never reproduces this
class of failure — restart discipline is the only defence.

Inputs/outputs, invariants and schemas live in [`../LLM.md`](../LLM.md) (the constitution).
