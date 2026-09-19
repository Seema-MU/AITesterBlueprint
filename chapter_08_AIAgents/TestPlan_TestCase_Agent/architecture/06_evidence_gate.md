# SOP 06 — Evidence gate & trace validation

**Tool:** `tools/gate.py` · **Deterministic** — no LLM.

Two controls that exist because of KAN-4 (`findings.md` §12): a ticket with a five-word
summary, an empty description, and 7 of 8 gaps missing still produced ten confident,
invented test cases. The gap analysis had correctly reported the problem; nothing
consumed that report.

---

## 1. The evidence gate

**Question:** does this ticket carry enough to generate from?

**Deliberately NOT keyed to "does it have an acceptance criteria section".** Many tickets
legitimately have none — a tester writes them from the description. Keying the gate to ACs
would block the most ordinary case of all. The gate measures **requirement-bearing text**:

```
requirement_chars = len(description_text) + len(acceptance_criteria) + len(attachment_text)
```

Placeholders (`""`, `"Not specified"`, `"None"`) count as zero.

| Decision | Trigger | Behaviour |
| -------- | ------- | --------- |
| `refuse` | `< 80` chars | **No cases generated.** The UI blocks the approve button and states why. An empty result with a reason is the honest output |
| `constrain` | `< 400` chars, **or** `>= 5` missing gaps | Generate in **sparse-ticket mode**: the prompt forbids invented field names, values, limits, statuses and error strings; missing details are written generically with the marker `«not specified in ticket»`; **fewer grounded cases beat a padded count** |
| `ok` | otherwise | Normal generation, with the provenance rules attached |

`evidence_basis()` states in one line what the run's cases actually rest on — acceptance
criteria (and from where), attached requirements, or the description alone. It is written
into the case-file header so a reader never has to guess.

## 2. Trace validation

**Question:** does each case's `trace` point at something real?

A trace is accepted only when it resolves:

| Token | Verdict |
| ----- | ------- |
| `G-06` where G-06 exists | ✅ valid — and **unconfirmed** if that gap is `missing`/`ambiguous`, because the requirement behind the case is unsettled |
| `G-99` where no such gap exists | ❌ invalid |
| `AC3` where the material contains `AC3` | ✅ valid |
| `AC99` where it does not | ❌ invalid |
| `AC` (bare) | ❌ invalid |
| `AC: User can add an item to cart.` | ❌ invalid — an invented criterion presented as provenance |
| `derived` / `AC-derived` | ✅ valid — an explicit fallback marker |

**AC ids are verified, not pattern-matched.** `known_ac_ids()` scans the criteria, the
attachments and the description together — the criteria extractor stops at the first block,
while a PRD attachment holds the full `AC1…ACn` list (on KAN-4 the criteria field yielded
only `AC1`; the attachment held `AC1…AC7`).

**When we cannot verify, we accept.** If the material contains no numbered criteria, an
`ACn` reference cannot be checked, so it is accepted — a prose-only AC section must not flag
every case. Same for gap ids when no gap analysis is supplied.

## 3. Consequences

- `clarification_needed` is set when the grounding is unsettled: an invented trace, a trace
  at an unresolved gap, or a scenario that is itself an inference. It surfaces as
  `NEEDS CLARIFICATION` and `TRACE UNVERIFIED` in `Misc (Comments)`.
- `validate_cases` reports **grounding** issues separately from **contract** issues (LLM.md
  §6). A bad trace column does not make an otherwise well-formed file invalid — it is
  reported, counted, and warned about.
- `gaps` is a **required** parameter of `build_cases` and `fallback_cases`. Defaulting it
  meant a caller could silently skip both the gate and trace validation, and every real gap
  id would then be misreported as invented. A skipped control must be impossible, not quiet.

## 4. Thresholds

`REFUSE_REQUIREMENT_CHARS = 80`, `CONSTRAIN_REQUIREMENT_CHARS = 400`,
`CONSTRAIN_MISSING_GAPS = 5`. Tuned so an ordinary ticket passes and a title-only ticket
does not. Changing them changes this SOP first (Golden Rule).
