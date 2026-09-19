# SOP 03 — Test plan

**Tools:** `tools/render_plan.py` (deterministic) + `planner.py` (LLM for scenarios only).

## Goal
Produce a review-ready test plan as markdown, from the ticket, the gap analysis, and a scenario list.

## Division of labour
| Part | Owner | Why |
| ---- | ----- | --- |
| Document structure, 12 sections, metadata, tables | `render_plan.py` | Structure must never vary |
| Scenarios (id, priority, trace, scenario, precondition, expected) | LLM (`planner.generate_scenarios`) | Judgement about *what* to test |
| Gaps, risks, traceability, open questions | `render_plan.py` | Derived from facts, not prose |
| Fallback scenarios | `render_plan.derive_scenarios` | Keeps the pipeline alive if no LLM |

**Template-fill over free-generation** (LLM.md §7): the model supplies content for a few slots, never the document.

## Scenario rules
- 6–12 scenarios, covering positive, negative, boundary, and error paths.
- Priority by risk: **P0** = business critical, **P1** = important, **P2** = low.
- Every scenario carries a `trace`: an AC reference or a gap id. **No orphans** (I-6).
- Never invent exact error messages, numeric limits, or thresholds the ticket does not state.

## Rendering
1. Load `templates/test_plan_template.md`.
2. `build_mapping(ticket, gaps, scenarios, settings)` → token → markdown.
3. `render()` substitutes `{{TOKEN}}`; `unfilled_tokens()` reports leftovers — **any leftover is a bug**.
4. Markdown table cells escape `|` and collapse newlines (`md_cell`).

## Output
`<output_dir>/<KEY>_<YYYYMMDD-HHMM>_Test_Plan.md`, timestamped so a rerun never overwrites an earlier draft.

## The plan ends with `--- HUMAN REVIEW GATE ---`
When an issue has no acceptance criteria the plan is a **draft by definition** — it states what can be validated and what still cannot. See SOP 05.
