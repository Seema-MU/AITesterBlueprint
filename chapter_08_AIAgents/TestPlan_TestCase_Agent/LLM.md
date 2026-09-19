# 🧠 LLM.md — Project Constitution

**Project:** `chapter_08_AIAgents/TestPlan_TestCase_Agent`
**B.L.A.S.T. step:** Protocol 0 — the **Project Constitution** (BLAST.md calls this file `gemini.md`; this project names it `LLM.md`)
**Version:** 1.0.0-as-built · **Status:** 🟢 implemented and running
**Last updated:** 2026-09-19 · *rev 0.2 — "automation regression" defined · rev 0.3 — **column contract supplied by Seema adopted**; duplicate-header hazard raised · rev 0.4 — **duplicate pair deleted → 12-column contract** · rev 1.0 — **Phases 2–4 built and verified; schemas realised in code***

> **What this file is:** the non-negotiable contract for the project — data schemas, behavioural rules, and architectural invariants. It is the source of truth when code and prose disagree. **Per the Data-First Rule, no code in `tools/` may be written until the schemas in §3 are confirmed.**
>
> Companions: [`task_plan.md`](./task_plan.md) · [`findings.md`](./findings.md) · [`progress.md`](./progress.md)

---

## 1. Mission & Reasoning Posture

**Mission:** `Jira ID` → a gap-analyzed **test plan** → a **human approval** → **E2E regression test cases** → an **`.md`/`.csv` case file** ready to feed the automation suite.

**The core posture — and the thing that makes this project different from a "generate QA docs" toy:**

> **An LLM is probabilistic. Business logic must be deterministic.**
> So the LLM never *decides* what the requirements are, never *invents* acceptance criteria, and never *owns* a verdict. It reads, analyses, and drafts. Everything that must be true is enforced by deterministic Python, by schema validation, and by a human gate.

Three consequences that drive every rule below:

1. **The ticket is the only source of truth.** Our job is to *find what is missing*, not to fill it in convincingly.
2. **The most valuable output is the gap list**, not the prose. "This ticket has no acceptance criteria" is worth more than ten well-written sections that hide the problem.
3. **A confident wrong answer is the worst outcome.** A fabricated acceptance criterion or invented error message will silently corrupt every test case derived from it.

---

## 2. Architectural Invariants (the A.N.T. 3-layer model)

```
┌─ Layer 1 · architecture/  ── Markdown SOPs: goals, inputs, tool logic, edge cases
│     GOLDEN RULE: if the logic changes, update the SOP before the code.
│
├─ Layer 2 · Navigation ───── the reasoning layer: route data between SOPs and tools,
│     in the right order. It does NOT try to do complex work itself.
│
└─ Layer 3 · tools/ ───────── deterministic, atomic, testable Python scripts
      .env for secrets   ·   .tmp/ for every intermediate file
```

**Invariants — these may not be violated for convenience:**

| ID | Invariant |
| -- | --------- |
| **I-1** | **Secrets never leave `.env`.** Never hardcoded, never logged, never in a generated artifact. |
| **I-2** | **The ticket is fetched exactly once per run.** Content is cached to `.tmp/` and hashed; every later step reads the cache, never the API. |
| **I-3** | **A deterministic tool is pure** — same input → same output. No clock, no randomness, no network unless that *is* its job. No LLM calls inside `tools/`. |
| **I-4** | **No fabricated facts, ever** — no invented ACs, error messages, IDs, links, or test data. A missing value is a *finding*. |
| **I-5** | **Nothing is "final" without a human.** Approval is a state transition performed by a person, never assumed. |
| **I-6** | **Every scenario and every case traces to an AC id or a gap id.** Orphans are build failures. |
| **I-7** | **Every artifact carries its provenance** — `issue_key`, `generated_at`, `source_hash`. |
| **I-8** | **PII never appears in output.** Never name the ticket reporter/creator. |
| **I-9** | **The layer boundary holds** — the reasoning layer routes; it does not embed business logic that belongs in a tool or an SOP. |
| **I-10** | **Every trace resolves.** A case's `trace` must name a gap id that exists in the analysis, or an acceptance-criteria id that exists in the requirement material. Prose, a bare `AC`, or an id that is simply not there is a **defect**, not a formatting choice — invented provenance is worse than an empty field, because a reviewer will believe it. |
| **I-11** | **Evidence is measured, then acted on.** The gap analysis measures; the evidence gate decides. Below the floor the agent generates nothing and says why, because at that point "generating" means inventing. Measuring without deciding is not a control (KAN-4, `findings.md` §12). |

---

## 3. Data Schemas (Data-First Rule)

Written with the real repo as reference: fields mirror the `fetch_jira.sh` field list and `jira_client.py`'s return shape.

### 3.1 `TicketPayload` — IN (normalized, post-fetch)

```json
{
  "issue_key": "SCRUM-1",
  "self": "https://<site>.atlassian.net/rest/api/3/issue/10001",
  "fetched_at": "2026-09-19T14:46:01+05:30",
  "source": "mcp | curl | python | manual_paste",
  "source_hash": "sha256:<hex of raw response>",
  "summary": "Login page to VMO.com website",
  "issue_type": "Story",
  "status": "To Do",
  "priority": "High",
  "components": ["Authentication"],
  "labels": ["regression"],
  "fix_versions": ["R1.2"],
  "sprint": "SPR-7",
  "description_adf": { "type": "doc", "content": [] },
  "description_text": "flattened plain text, cap 6000 chars",
  "acceptance_criteria": [],
  "ac_source": "extracted | extracted_from_attachment | none_found | manual_paste",
  "attachments": [
    {
      "filename": "sample_prd_add_to_cart (1).md",
      "content_url": "https://…/rest/api/3/attachment/content/10001",
      "status": "read | skipped | error",
      "chars": 4034,
      "text": "extracted plain text, capped",
      "note": ""
    }
  ],
  "attachment_text": "all readable attachment text, concatenated",
  "links": [ { "relation": "blocks", "key": "SCRUM-2" } ]
}
```

**Attachments are requirements, not metadata** (rev 1.1). KAN-4 proved it: its description was **empty**,
the summary was four words, and both the PRD *and* the mockup were attachments. Ignoring their content
left the model to invent field names and states, which it did — confidently. Attachments with a readable
type (`.md`, `.txt`, `.csv`, `.json`, `.xml`, `.yaml`, `.html`, `.docx`) are downloaded over the
authenticated `content` URL and reduced to text, bounded by `ATTACHMENT_MAX_CHARS` per file and
`ATTACHMENT_TOTAL_CHARS` overall so context stays predictable (LLM.md §7). A failed attachment is
**reported, never fatal** — the ticket is still analysable from its description.

`attachment_text` feeds three places: the gap haystack (so gaps are measured against real requirements),
both LLM prompts, and the plan's Overview.

**Rules:** `acceptance_criteria: []` combined with `ac_source: "none_found"` is a **valid and important** payload — it means "the ticket has no ACs", which is a headline finding. `description_text` is the *only* description form downstream steps may read; `description_adf` is retained for re-parsing but never shipped to the LLM raw.

### 3.2 `GapAnalysis` — the highest-value output

```json
{
  "issue_key": "SCRUM-1",
  "checked_at": "2026-09-19T14:52:00+05:30",
  "source_hash": "sha256:<same as ticket>",
  "items": [
    {
      "id": "G-01",
      "category": "acceptance_criteria",
      "status": "missing",
      "statement": "No given/when/then or observable pass/fail exists for any requirement",
      "evidence": "fields.description contains prose only",
      "question": "Convert the PRD bullets into testable ACs, or confirm the drafted scenarios as the ACs?",
      "blocks": ["test_plan", "test_design", "automation"]
    }
  ],
  "counts": { "present": 0, "ambiguous": 0, "missing": 0 },
  "blocking": ["G-01"]
}
```

`category` ∈ `acceptance_criteria | scope | naming_ambiguity | test_data | environment | non_functional | error_handling | boundary | permissions | integration | other`
`status` ∈ `present | ambiguous | missing`
`blocks` ∈ `test_plan | test_design | automation` — what this gap holds up.

### 3.3 `TestPlan`

```json
{
  "issue_key": "SCRUM-1",
  "title": "Test Plan — SCRUM-1: Login page to VMO.com website",
  "doc_version": "1.0",
  "status": "draft",
  "generated_at": "2026-09-19T14:55:00+05:30",
  "source_hash": "sha256:<ticket>",
  "template_ref": "references/testPlanTemplate.md@<hash>",
  "sections_filled": 12,
  "sections_left_as_placeholder": [],
  "scenarios": [
    {
      "id": "S-01",
      "priority": "P0",
      "trace": ["AC-1"],
      "scenario": "Email + password with valid credentials signs in and lands on the dashboard",
      "precondition": "Valid account exists",
      "expected": "User authenticated, redirected, success state visible"
    }
  ],
  "requirement_traceability": [ { "requirement": "PRD Login Process", "scenarios": ["S-01", "S-02", "S-03"] } ],
  "entry_criteria": [],
  "exit_criteria": [],
  "risks": [],
  "open_questions": ["G-01"],
  "review": { "gate": "pending", "approved_by": null, "approved_at": null }
}
```

**Rule:** `trace` must reference an AC id **or** a gap id (I-6). `status` is one of `draft | in_review | approved` — only a human sets `approved`.

### 3.4 `TestCase` — E2E regression case

**Scope — confirmed 2026-09-19:** cases are **generated from the ticket** (not selected from an existing suite) and are **E2E** — user-journey shaped, start-to-finish through the UI. We do **not** emit runnable code in v1; the case file *is* the deliverable.

```json
{
  "scenario_tid": "SCRUM-1-S01-C01",
  "issue_key": "SCRUM-1",
  "scenario_id": "S-01",
  "testcase_description": "Registered user signs in with a valid email and password and lands on the dashboard",
  "precondition": "A registered account exists",
  "test_steps": [
    { "n": 1, "action": "Open the login page", "data": "https://app.<host>/login" },
    { "n": 2, "action": "Sign in as a registered user", "data": "TD-01" }
  ],
  "expected_result": "The login form is displayed and the credentials are accepted",
  "steps_to_execute": [
    { "n": 1, "action": "Navigate to /login", "data": "" },
    { "n": 2, "action": "Enter the registered email", "data": "TD-01" },
    { "n": 3, "action": "Enter the matching password", "data": "TD-01" },
    { "n": 4, "action": "Click Sign In", "data": "" }
  ],
  "priority": "P0",
  "is_automated": "Yes",
  "category": "functional",
  "is_e2e": true,
  "journey": "Login page → authenticated dashboard",
  "test_data_refs": ["TD-01"],
  "clarification_needed": false,
  "trace": ["S-01", "G-05"]
}
```

**Key names map 1:1 onto the emitted columns** (§3.5) — one mapping, not two. `actual results`, `status`, and `executed QA name` are deliberately **absent from this object**: they are execution-time and must never be generated.

`category` ∈ `functional | negative | boundary | edge | security | accessibility | performance | integration` *(internal — no column; used for coverage balance)*
`priority` ∈ `P0 | P1 | P2` → column 11
`is_automated` ∈ `Yes | No` → column 12

**Rules:**
- **`is_e2e` must be true.** A case that asserts one field or one API call is not an E2E case — demote it or drop it. Non-E2E cases are filtered out **before** emission and never reach the file.
- **`trace` is mandatory** — an AC id or a gap id, never empty (I-6). It is emitted into `Misc (Comments)`, since the contract has no trace column (§3.5).
- **`scenario_tid` must be unique and stable** — `<KEY>-S<nn>-C<nn>`; reruns of the same ticket regenerate the same ids.
- If the ticket does not state a fact (an exact error string, a password rule, a timeout), set `clarification_needed: true` and put the gap id in `trace` — **do not invent the value** (I-4). The step may still be written, with the unknown marked `«not specified in ticket»`.
- `expected_result` is **observable**. "User is redirected to `/dashboard` and sees their account name" — not "login works". There is **one** expected result per case: the duplicate `Steps to Execute` expected/actual pair was removed (rev 0.4), so `expected_result` belongs to `test_steps`.

### 3.5 `RegressionCaseFile` — the frozen output contract 🔒

**⚠️ Rev 0.3 — the column list below was supplied directly by Seema (2026-09-19) and SUPERSEDES the earlier 11-column draft.** This confirms `findings.md` §7.4: where the automation suite already defines a schema, **that schema wins**. Treat this list as an API — additive changes only, never reorder, never rename.

**Filenames** (timestamped so reruns never overwrite an earlier draft):
```
TestPlans/<KEY>_<YYYYMMDD-HHMM>_Regression_Cases.md
TestPlans/<KEY>_<YYYYMMDD-HHMM>_Regression_Cases.csv
```

**CSV — 12 columns, exact order** *(rev 0.4 — the duplicate pair was deleted, per Seema 2026-09-19)*:

```csv
Scenario TID,TestCase Description,PreCondition,TestSteps,Expected Result,Actual Result,Steps to Execute,Status,Executed QA Name,Misc (Comments),Priority,Is Automated
```

> ### ✅ Duplicate-header question — RESOLVED: the second pair is deleted
> The original list carried `Expected Result` twice and `Actual Result` twice. Confirmed 2026-09-19: **the second pair (old positions 8–9) was a copy-paste leftover and is removed.** One `Expected Result` (col 5) and one `Actual Result` (col 6) remain, so **no disambiguation is needed** — the headers are now clean and unique exactly as named.
>
> *Why it mattered:* duplicate CSV headers are silently destructive. Verified empirically — `csv.DictReader` keeps only the **last** duplicate, so the original 14-column header would have dropped two columns with no error at all. The 12-column header parses to 12 unique names, zero collisions.
>
> **Structure this produces:** `TestSteps → Expected Result → Actual Result`. The expected/actual pair belongs to the **TestSteps**, and `Steps to Execute` is the granular execution recipe with no separate expected/actual of its own.

| # | Column (emitted header) | Who fills it | Rule |
| - | ----------------------- | ------------ | ---- |
| 1 | `Scenario TID` | ✅ **agent** | `<KEY>-S<nn>-C<nn>` (e.g. `SCRUM-1-S01-C01`) — unique per row, stable across reruns |
| 2 | `TestCase Description` | ✅ **agent** | one line, imperative, no trailing period |
| 3 | `PreCondition` | ✅ **agent** | `;`-joined; `None` if there genuinely are none |
| 4 | `TestSteps` | ✅ **agent** | `1) … \| 2) … \| 3) …` — `n)` prefix, ` \| ` separator |
| 5 | `Expected Result` | ✅ **agent** | observable outcome of the TestSteps |
| 6 | `Actual Result` | ⬜ **blank** | execution-time — see policy below |
| 7 | `Steps to Execute` | ✅ **agent** | granular, executable steps (incl. concrete data) |
| 8 | `Status` | ⬜ **blank** *(or `Not Run`)* | execution-time: `Pass` / `Fail` / `Blocked` / `Not Run` |
| 9 | `Executed QA Name` | ⬜ **blank, always** | **never auto-fill — this is a person's name (I-8, PII)** |
| 10 | `Misc (Comments)` | 🟡 **agent — carries `trace`** | see "fields with no column" below |
| 11 | `Priority` | ✅ **agent** | `P0` / `P1` / `P2` |
| 12 | `Is Automated` | ✅ **agent** | `Yes` / `No` — our judgement of automation suitability |

#### Blank-cell policy — two classes of column

This contract mixes **authoring** and **execution** columns, so "empty" means two different things. A validator MUST NOT treat them alike:

| Class | Columns | Rule |
| ----- | ------- | ---- |
| **AUTHORED** — must be non-empty on generation | 1, 2, 3, 4, 5, 7, 10, 11, 12 | Empty = **build failure**. (`PreCondition` may be `None`; `Misc (Comments)` always carries `trace`, so it is never empty.) |
| **EXECUTION** — must be empty on generation | 6, 8, 9 | Non-empty = **build failure** — we did not run anything. `Status` may be pre-seeded `Not Run` if your suite requires it. |

Deleting the duplicate pair shrank the execution-only set from four columns to **three** (`Actual Result`, `Status`, `Executed QA Name`). `Misc (Comments)` moved into the authored set, because it is where `trace` lives.

**We generate cases; we do not execute them.** That is why columns 6, 8 and 9 ship blank — the same reason *execution* and *import* are out of scope (`task_plan.md` §7). Never let an LLM invent an `Actual Result`.

#### Fields we track internally that have **no column** — where they go

Our case JSON (§3.4) carries fields your 12 columns don't have. They are not dropped:

| Internal field | Destination |
| -------------- | ----------- |
| `trace` (scenario / gap ids) | folded into **`Misc (Comments)`** — preserves I-6 traceability without adding a column. Format: `trace: S-01;G-05` |
| `test_data_refs` | folded into **`PreCondition`** or `Misc` — whichever your suite reads; data values themselves belong in `Steps to Execute` |
| `tags` (`@regression`) | **dropped** — `Is Automated` + `Priority` carry the selection signal your suite needs |
| `journey`, `postconditions`, `is_e2e` | **dropped** — internal only; `is_e2e: false` cases are excluded before emission and never reach the file |

> ⚠️ **`issue_key` is no longer a column.** The earlier draft repeated it per row; your schema does not. Provenance therefore lives in the **`.md` header** and in the `RunManifest` (I-7) — not in the CSV. If you concatenate CSVs from several tickets they become indistinguishable: say the word and I'll append `issue_key` as a 13th column.

**CSV formatting rules:** UTF-8 **without BOM**, CRLF line endings, comma delimiter, RFC-4180 quoting (quote any field containing a comma, quote, or newline; escape `"` as `""`). Headers containing spaces and parentheses (`Misc (Comments)`) are quoted. A blank line is not a row. The file must open cleanly in Excel *and* parse with `csv.DictReader`.

**Markdown mirror (`.md`)** — same case set, review-friendly: a metadata header (`issue_key`, `source_hash`, `generated_at`, link to the test plan), then one row per case in a pipe table with the identical 12 columns, then a `Gaps & Questions` and a `--- HUMAN REVIEW GATE ---` block.

**Invariants for this contract:**
- **Single source of truth.** Both files render from the same `cases[]` JSON in `.tmp/`. **The `.md` and `.csv` must never drift** — generate the CSV from the JSON and the MD from the same JSON, never one from the other.
- **Header-identity check.** The emitted header must equal the §3.5 list **exactly, in order** — compared as a list, not a set. Any diff fails the build (`CONTRACT-DRIFT`).
- **No duplicate headers.** The 12 columns are verified unique; the guard stays anyway, because a future edit could silently reintroduce a collision — and duplicates corrupt data without an error.
- **Class-aware emptiness** — AUTHORED columns non-empty, EXECUTION columns empty (policy above).
- **Provenance** — `source_hash` in the MD header and the `RunManifest`; not in the CSV.
- **Count parity** — `len(csv rows) == len(md rows) == len(cases)`; a mismatch is a hard failure.

### 3.6 `RunManifest` — traceability spine

```json
{
  "run_id": "20260919-1500-SCRUM-1",
  "issue_key": "SCRUM-1",
  "source_hash": "sha256:<ticket>",
  "stages": [
    { "name": "fetch",       "status": "ok", "tool": "fetch_ticket.py",   "artifact": ".tmp/SCRUM-1.ticket.json" },
    { "name": "gap_analysis","status": "ok", "tool": "gap_check.py",      "artifact": ".tmp/SCRUM-1.gaps.json" },
    { "name": "plan",        "status": "ok", "tool": "render_plan.py",    "artifact": "TestPlans/SCRUM-1_20260919-1500_Test_Plan.md" },
    { "name": "human_gate",  "status": "approved", "by": "<reviewer>", "at": "2026-09-19T15:30:00+05:30" },
    { "name": "cases",        "status": "ok", "tool": "build_cases.py",     "artifact": ".tmp/SCRUM-1.cases.json" },
    { "name": "case_file_md",  "status": "ok", "tool": "emit_cases_md.py",   "artifact": "TestPlans/SCRUM-1_20260919-1500_Regression_Cases.md" },
    { "name": "case_file_csv", "status": "ok", "tool": "emit_cases_csv.py",  "artifact": "TestPlans/SCRUM-1_20260919-1500_Regression_Cases.csv" },
    { "name": "validate",      "status": "ok", "tool": "validate_schema.py", "artifact": ".tmp/SCRUM-1.validation.json" }
  ],
  "metrics": { "scenarios": 18, "cases": 15, "e2e": 15, "P0": 4, "P1": 8, "clarification_needed": 2, "gaps_open": 6, "orphan_traces": 0, "authored_blank": 0, "execution_filled": 0, "duplicate_headers": 0, "md_csv_parity": true }
}
```

`status` ∈ `ok | failed | skipped | blocked | pending`. **`orphan_traces` must be `0`** or the build fails (I-6).

---

## 4. Behavioural Rules

### MUST NOT
1. **Never fabricate an acceptance criterion.** Absence is a finding, not a blank to fill.
2. **Never invent exact error messages, error codes, timeouts, password rules, or rate-limit thresholds.**
3. **Never mark a plan, case, or suite "final"/"approved"** — a human owns that transition.
4. **Never re-fetch the ticket** after the first fetch in a run.
5. **Never emit credentials, tokens, or PII** — including the reporter's name (I-1, I-8).
6. **Never pick a side on an ambiguity.** "VMO.com" vs "VWO" gets surfaced, not silently resolved.
7. **Never let an LLM call live in `tools/`** (I-3).
8. **Never write into `tools/` before the HALT gate lifts.**

### MUST
9. **Fetch once, cache, reuse** — the cached ticket is the only input to later stages.
10. **Trace everything** — each scenario/case → an AC id or gap id (I-6).
11. **Stamp provenance** on every artifact (I-7).
12. **Surface gaps as questions with a concrete proposed answer**, not open-ended worry.
13. **Tag every scenario P0/P1/P2 by risk** — risk drives depth and execution order.
14. **Keep the `--- HUMAN REVIEW GATE ---` block intact** in every plan, and carry its open questions forward.
15. **Timestamp output filenames** so reruns never destroy an earlier draft.
16. **Validate LLM output against §3 schemas** before anything downstream consumes it.
17. **Emit both file formats from the single `cases[]` JSON** — never render the CSV from the MD or vice versa (guarantees §3.5 parity).
18. **Keep cases E2E.** If a case is really a unit or single-API check, drop it — it does not belong in this file.

### Tone of the generated plan
Professional, neutral QA register — evidence-based, no marketing language, no hedging filler. State assumptions *as* assumptions. Where the ticket is silent, say so plainly: **"Not specified in the ticket."**

---

## 5. State Machine

```
   ┌──────────┐  fetch once   ┌───────────────┐  gate: ACs present? no → record gap
   │  IDEA    │ ────────────► │  TICKET_FETCHED│
   └──────────┘   + hash      └───────┬───────┘
                                      ▼
                            ┌──────────────────┐
                            │ GAP_ANALYZED     │  ← the value-creating stage
                            └────────┬─────────┘
                                     ▼
                            ┌──────────────────┐
                            │ PLAN_DRAFTED     │  status = draft
                            └────────┬─────────┘
                                     ▼
                     ╔═══════════════════════════════╗
                     ║  HUMAN REVIEW GATE  (hard)    ║   ← nothing proceeds without a person
                     ╚═══════════════┬═══════════════╝
                        approved ────┴──── rejected → back to PLAN_DRAFTED
                                     ▼
                            ┌──────────────────┐
                            │ CASES_DERIVED    │  from approved scenarios only
                            └────────┬─────────┘
                                     ▼
                            ┌────────────────────┐
                            │ CASE_FILES_EMITTED │  .md + .csv, one JSON source
                            └─────────┬──────────┘
                                      ▼
                            ┌────────────────────┐
                            │ VALIDATED / DONE   │  schema + CSV parse + md/csv parity + orphan check
                            └────────────────────┘
```

**Rejection loop, not a one-way pipe.** The gate can send the plan back; the machine must tolerate re-drafting without re-fetching (I-2).

**Routing (Layer 2) — what runs when:**

| Stage | Deterministic tool | Reasoning-layer job | LLM allowed? |
| ----- | ------------------ | ------------------- | ------------ |
| fetch | `fetch_ticket.py` | pick the path, map errors | no |
| normalize | `flatten_adf.py` | — | no |
| gap analysis | `gap_check.py` (checklist) | judge present/ambiguous/missing, phrase questions | **yes** (with schema validation) |
| plan | `render_plan.py` (template fill) | derive scenarios, assign P0/P1/P2 | **yes** (sections only) |
| **gate** | — | present to human, capture verdict | **no** |
| cases | `build_cases.py` | expand E2E steps + observable expected result from approved scenarios | **yes** |
| case files | `emit_cases_md.py` + `emit_cases_csv.py` | — pure rendering, no judgement | **no** |
| validate | `validate_schema.py` | report failures, parity, orphan traces | no |

---

## 6. Error Taxonomy & Handling

| Code | Cause | Handling | Halts run? |
| ---- | ----- | -------- | ---------- |
| `JIRA-401` | Bad email/token | Tell the user to check `.env`. Never print the token. | ✅ |
| `JIRA-403` | No permission on the issue/project | Surface the project key and the permission needed | ✅ |
| `JIRA-404` | Key not found / typo | Ask for the correct key | ✅ |
| `JIRA-429` | Rate limited | Honour `Retry-After`, retry once with backoff | ⏸ retry once |
| `JIRA-5xx` | Jira outage | Retry once, then halt with the status code | ⏸ then ✅ |
| `JIRA-TIMEOUT` | Slow API | 15s timeout (`API_TIMEOUT`), retry once, then halt | ⏸ then ✅ |
| `ADF-PARSE-FAIL` | Unexpected node type | Fall back to `str(description)`, flag `description_text` as degraded | ❌ continue |
| `NO-AC` | Ticket has no acceptance criteria | **Do not halt.** Record as a blocking gap; plan proceeds marked `draft` | ❌ continue |
| `TEMPLATE-MISSING` | Template file absent | Halt with the resolved path (see chapter_03's exact wording) | ✅ |
| `LLM-INVALID` | Output fails schema validation | One bounded retry at lower temperature; then halt | ⏸ then ✅ |
| `ORPHAN-TRACE` | Scenario/case with no AC or gap id | Fail the build (I-6) | ✅ |
| `SECRET-DETECTED` | Credential-shaped string in an artifact | Refuse to write; scrub and re-render | ✅ |
| `CSV-INVALID` | `.csv` won't parse (bad quoting, embedded newline) | Re-render from `cases[]` with RFC-4180 quoting; halt if it persists | ⏸ then ✅ |
| `CONTRACT-DRIFT` | Column header ≠ the frozen §3.5 list (compared as an ordered list) | **Hard fail** — the header is an API; never auto-rename | ✅ |
| `DUPLICATE-HEADER` | Two emitted columns share a name | **Hard fail** — CSV parsers silently keep only the last; disambiguate per §3.5 | ✅ |
| `EXECUTION-FILLED` | An execution column (Actual Result / Status / Executed QA Name) came out non-empty | **Hard fail** — we generate cases, we do not execute them (I-4) | ✅ |
| `AUTHORED-BLANK` | An authored column (Scenario TID, Description, Steps, Expected, Priority, Is Automated) is empty | **Hard fail** — the case is incomplete | ✅ |
| `MD-CSV-DRIFT` | `.md` and `.csv` case counts differ | **Hard fail** — both must render from the one `cases[]` JSON | ✅ |
| `NOT-E2E` | A case is a unit/single-API check | Drop it, or rewrite as a journey; never ship it as E2E | ❌ continue |
| `EVIDENCE-REFUSED` | Ticket carries almost no requirement text | **No cases emitted.** Report the reason and the gaps to close. An empty result is the honest output (I-11) | ⏹ stops generation |
| `INVALID-TRACE` | A trace is prose, a bare `AC`, or an id absent from the material | Flag the case (`TRACE UNVERIFIED` + `NEEDS CLARIFICATION` in `Misc`), count it, and report it as a **grounding** issue (I-10) | ❌ continue, flagged |

**Severity, not just pass/fail.** `validate_cases` separates two kinds of failure because they mean different things:

| Severity | Meaning | Effect on `ok` |
| -------- | ------- | -------------- |
| **contract** | The file itself is malformed — header drift, duplicate headers, blanks in authored columns, filled execution columns, row parity, a missing trace | `ok: false`. The file is unusable |
| **grounding** | The file is well-formed but a case's provenance is unreliable — an invented trace | `ok` stays true; reported via `grounding_ok`, the counts, and a warning. The case may still be valid |

Collapsing these two into one verdict produced a false alarm: a run whose only defect was a bad trace column was reported as a broken file.

**Principle:** a *content* problem (no ACs) never halts — it becomes an output. A *plumbing* problem (auth, missing template, secret leak) halts immediately. And **never report success for an artifact that failed validation.**

---

## 7. Determinism & Token Discipline

- **Template-fill over free-generation.** The 12-section plan comes from a template; the LLM supplies section content and scenarios, never structure.
- **Fetch once, then read the cache.** Re-reading a large PRD is the single biggest token cost in this workflow (per the existing skill).
- **One ticket per session**; start fresh per ticket so context stays lean.
- **Send `description_text`, never `description_adf`,** to the model.
- **Bounded retries** — max one retry per LLM stage.
- **A 1B local model is weak at long structured output** (`gemma3:1b`): keep prompts short, demand compact JSON/tables, and validate every response. Prefer the Groq fallback when output shape matters more than locality.
- **Idempotency:** re-running the same ticket with the same hash must produce byte-identical deterministic artifacts (filenames differ only by timestamp).

---

## 8. Validation Gates

An artifact may not move downstream until:

1. **Schema-valid** against §3 (`validate_schema.py`).
2. **Trace-complete** — zero orphan traces (I-6).
3. **Secret-free and PII-free** — scanned before write (I-1, I-8).
4. **Provenance-stamped** — `issue_key`, `generated_at`, `source_hash` (I-7).
5. **Human-approved**, for anything past the plan stage (I-5).
6. **Parseable + parity-checked**, for the case files — the `.csv` loads with `csv.DictReader`, the header **equals the frozen §3.5 list in order**, **no two headers collide**, every AUTHORED column is populated, every EXECUTION column is empty, and md/csv case counts match.

---

## 9. Open Schema Decisions (need sign-off before `tools/` is written)

| # | Decision | Current draft | Why it matters |
| - | -------- | ------------- | -------------- |
| S-1 | ~~Meaning of "regression creator"~~ | **RESOLVED 2026-09-19 — generate E2E regression cases from the ticket** (see §3.4) | ✅ closed |
| S-2 | ~~Case output format~~ | **RESOLVED 2026-09-19 — `.md` + `.csv`, both rendered from one `cases[]` JSON** (see §3.5) | ✅ closed |
| S-3 | AC ids — synthesise `AC-1…n` when the ticket has none? | Drafted as gap-referenced (`G-xx`) instead | Synthesised ids risk implying authority the ticket doesn't have |
| S-4 | ~~Playwright vs Selenium as the automation target~~ | **CLOSED 2026-09-19 — v1 emits no code.** Only the CSV *column shape* may need suite alignment (D-3) | ✅ closed |
| S-5 | Does `LLM.md` fully replace `gemini.md`, or must both exist? | `LLM.md` only | BLAST.md names `gemini.md`; the prompt asks for `LLM.md` |
| S-6 | ~~**Duplicate columns**~~ | **RESOLVED 2026-09-19 — the second `Expected Result`/`Actual Result` pair (old positions 8–9) was a copy-paste leftover and is DELETED.** Contract is now **12 columns**, headers clean and unique — no disambiguation needed (see §3.5) | ✅ closed |
| S-7 | `Status` — emit **blank** or pre-seed `Not Run`? | blank | Some suites reject an empty status column; depends on your importer |
| S-8 | `issue_key` — your schema has no provenance column. Append it as a 13th column, or rely on the `.md` header + manifest? | rely on the header/manifest | Concatenating CSVs from several tickets becomes unattributable without it |

---

## 10. Amendment Process

This file is the constitution: **change it before changing code.** Any new field, rule, or invariant is added here first, dated in `progress.md`, and the SOP in `architecture/` updated to match — *SOP before code* (Golden Rule).

---

## 11. Implementation Map (rev 1.0 — as built)

Every schema and rule above is now realised in code. Where to look:

| Constitution | Implemented in |
| ------------ | -------------- |
| §3.1 `TicketPayload` | `tools/jira.py::fetch_issue` |
| §3.2 `GapAnalysis` | `tools/gap_check.py::analyze` |
| §3.3 `TestPlan` | `tools/render_plan.py` + `planner.py` |
| §3.4 `TestCase` | `case_builder.py::normalise_case` |
| §3.5 `RegressionCaseFile` (12 columns) | `tools/contract.py` + `tools/emit_cases.py` |
| §3.6 `RunManifest` | `app.py` session notes + run log |
| §2 invariants I-1…I-9 | enforced in `tools/validate_cases.py`, `settings_manager.py`, `tools/contract.py` |
| §4 behavioural rules | prompts in `planner.py` / `case_builder.py`; hard-stops in `app.py` |
| §5 state machine | `app.py` staged flow (`stage_fetch` → `stage_plan` → gate → `stage_cases`) |
| §6 error taxonomy | `tools/jira.py::JiraError`, `llm_client.py`, `tools/validate_cases.py` |
| §7 determinism / token discipline | `tools/` contains **no** LLM calls; the ticket is fetched once |
| §8 validation gates | `tools/validate_cases.py::validate` |

**Verified (2026-09-19):** `.tmp/smoke_test.py` — all deterministic layers; `.tmp/pipeline_test.py` — full run producing 7 scenarios and 7 cases with all guards green.

**Two live integrations remain unauthenticated** (`findings.md` §9): the Jira token is expired (401 — chapter_03's copy of the same token fails identically), and no LLM provider is running. Both degrade gracefully; neither is a code defect.

**Still open:** S-3 (synthesised AC ids), S-5 (`gemini.md` vs `LLM.md`), S-7 (`Status` blank vs `Not Run`), S-8 (`issue_key` provenance column), D-1 (Phase 5 Trigger), D-3 (which suite consumes the CSV).
