# SOP 02 — Gap analysis

**Tool:** `tools/gap_check.py` · **Deterministic** — no LLM.

## Goal
Classify the ticket against a fixed checklist and answer one question per gap. **A missing requirement is a finding, never a blank to fill in** (I-4).

This is the highest-value stage: a tester's leverage is asking the question *before* the bug ships.

## The checklist
| # | Category | Looks for | Missing ⇒ |
| - | -------- | --------- | --------- |
| 1 | `acceptance_criteria` | AC / definition of done section | ❌ blocks plan + design + automation |
| 2 | `scope` | vague wording (`tbd`, `phase 2`, `optional`); else components/fix versions | ⚠️ or ❌ |
| 3 | `test_data` | test accounts, seed/sample data | ❌ |
| 4 | `environment` | dev/qa/uat/staging, hosts | ❌ |
| 5 | `non_functional` | performance / security / accessibility keywords | ❌ if all absent, ⚠️ if some |
| 6 | `error_handling` | error messages, failure, retry, fallback | ❌ |
| 7 | `boundary` | max/min, limits, timeouts, thresholds | ❌ |
| 8 | `permissions` | roles, permissions, admin, SSO | ❌ |
| 9 | `integration` | external services — and whether a fallback is described | ⚠️ if no fallback |
| 10 | `naming_ambiguity` | near-identical product names across summary/description | ⚠️ |

## Naming-ambiguity heuristic
`find_name_collisions()` compares capitalised tokens in the summary against those in the description and flags pairs that are the same length, share a first letter, and differ by exactly one character. This catches the real **"VMO.com" vs "VWO"** class of defect — a typo that would point tests at the wrong host. A stoplist suppresses ordinary English words.

## Verdicts
- ✅ `present` — the ticket says enough to test it.
- ⚠️ `ambiguous` — mentioned but underspecified.
- ❌ `missing` — absent; goes into `blocking`.

## Output
A `GapAnalysis` (LLM.md §3.2) with `items[]`, per-status `counts`, and a `blocking` id list. Every item carries `statement` (what is wrong), `evidence` (a short quoted excerpt) and `question` (the concrete ask).

## Do not
- Do not soften a missing AC into a vague note — say it plainly.
- Do not invent thresholds, error strings, or limits to fill a gap.
