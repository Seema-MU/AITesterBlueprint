# 🗺️ task_plan.md — TestPlan & TestCase Agent

**Project:** `chapter_08_AIAgents/TestPlan_TestCase_Agent`
**B.L.A.S.T. step:** Protocol 0 — Initialization & Halt (`BLAST.md` lines 7–24)
**Status:** 🟡 Protocol 0 files created — **execution halted** pending Discovery answers + approved Blueprint
**Owner:** Seema (QA)
**Last updated:** 2026-09-19 14:46 IST

> Companion memory files: [`findings.md`](./findings.md) · [`progress.md`](./progress.md) · [`LLM.md`](./LLM.md)
> `LLM.md` is this project's **Project Constitution** — the role BLAST.md assigns to `gemini.md`.

---

## 1. North Star

**One sentence:** Give the agent a **Jira ID**, and it returns (a) a gap-analyzed **test plan** and (b) **automation/regression test cases** — traceable, review-gated, and never fabricated.

**Singular desired outcome:** `JIRA-KEY` in → `TestPlans/<KEY>_<ts>_Test_Plan.md` + **E2E regression test cases as a `.md`/`.csv` file** out, with a human approval gate in between.

**📌 "Automation regression" — DEFINED (2026-09-19, resolves D-7):**
*By reading the Jira ticket, produce the **regression E2E test cases** for that ticket, in a `.md` or `.csv` file, which is then fed into the automation suite.*

Implications — these settle four earlier ambiguities:
- **Generation, not selection.** The ticket is the input; we author new E2E regression cases. We do not query an existing suite and pick from it (`/rest/api/3/search` JQL is therefore *optional*, only useful for finding sibling tickets).
- **E2E flavour.** Cases describe user-level journeys through the UI, not unit/API-level checks — which matches the repo's Playwright/Selenium Page Object Model assets.
- **Deliverable is a data file, not runnable code.** `.md` (human review) and `.csv` (machine ingestion) are the outputs. **Emitting the automation code itself is NOT required**, and *running* or *importing* the cases is explicitly downstream and out of scope.
- **The file is a contract.** Its columns are the interface between this agent and your automation suite (I-6). **Seema supplied the schema on 2026-09-19** (14 columns as listed; **12 after the duplicate pair was removed**) — it supersedes our drafted one and is frozen in [`LLM.md`](./LLM.md) §3.5. Key structural consequence: the contract mixes **authoring** columns (we fill) with **execution** columns (Actual Result, Status, Executed QA Name — we leave blank, because we generate cases rather than run them).

**Non-goal:** A "press button, get finished QA" machine. The plan is a *draft a human approves*, not a final artifact.

---

## 2. Protocol 0 — Deliverables Checklist

- [x] `task_plan.md` — phases, goals, checklists (this file)
- [x] `findings.md` — research, discoveries, constraints, live fetch commands
- [x] `progress.md` — what was done, errors, results, per time block
- [x] `LLM.md` — Project Constitution: data schemas, behavioral rules, architectural invariants
- [x] Discovery Questions answered (§4) — DQ-1/4/5 answered 2026-09-19; DQ-2/3 inferred from the build directive
- [x] Data Schema confirmed in `LLM.md` (§3) — the 12-column contract was supplied by Seema
- [x] `task_plan.md` Blueprint approved — **superseded by the explicit "build it now" directive**

**✅ HALT GATE LIFTED (2026-09-19).** The user directed Phases 2–4 to be executed in one pass
("lets do phase2, phase 3, phase 4, everything in one go … complete the project and run the project
locally now"). That directive supplies the approval the gate required, so `tools/` was written.

**Delivered:** a Streamlit app (Generate + Settings), the deterministic `tools/` layer, the
navigation layer, SOPs, and a running local server on `http://localhost:8501`.

---

## 3. Blueprint — Phase Plan (B.L.A.S.T.)

### Phase 1 · B — Blueprint (Vision & Logic)
- [x] Ask the 5 Discovery Questions (§4) and record answers
- [x] Confirm the **JSON Data Schema** (Payload in / Payload out) in `LLM.md`
- [x] Literature scan: the repo's own `testPlan_gen` skill + chapter_03 app (see `findings.md`)
- **Exit:** Blueprint approved → HALT gate lifted ✅

### Phase 2 · L — Link (Connectivity)
- [x] Verify `.env` credentials resolve (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_TOKEN`) — present, but **the token is rejected (401)**
- [x] Confirm the canonical Jira access path → **Python `requests`** (deterministic, no `jq` dependency on win32)
- [x] Handshake test built: `jira.test_connection()` via `/rest/api/3/myself`
- [x] Verify the local LLM endpoint → **not running** (connection refused on `:1234`); Groq not configured
- [x] Graceful degradation verified: the pipeline completes via deterministic fallback
- **Exit:** ⚠️ **Both live integrations are implemented and reachable in code, but neither is currently authenticated** — see `findings.md` §9

### Phase 3 · A — Architect (The 3-Layer Build)
- [x] **Layer 1** `architecture/` — SOPs 01–05
- [x] **Layer 2** Navigation — `planner.py`, `case_builder.py`, `llm_client.py`, `settings_manager.py`, `app.py`
- [x] **Layer 3** `tools/` — `contract.py`, `jira.py`, `gap_check.py`, `render_plan.py`, `emit_cases.py`, `validate_cases.py`
- [x] `.env` for secrets, `.tmp/` for intermediates, `.gitignore` covering both
- [x] Each tool runs standalone and is idempotent — verified by `.tmp/smoke_test.py`
- **Exit:** ✅ met

### Phase 4 · S — Stylize (Refinement & UI)
- [x] Streamlit UI with **Generate** and **Settings** pages
- [x] Settings: Jira URL/email/token/name, local LLM URL/model, Groq key/model, provider preference, output folder
- [x] Connection tests for Jira, local LLM, and Groq
- [x] Staged flow with the `--- HUMAN REVIEW GATE ---` preserved in the UI
- [x] Markdown and CSV downloadable from the UI
- [x] Running locally at `http://localhost:8501`
- **Exit:** ✅ met — pending user feedback

### Phase 5 · T — Trigger (⚠️ see Open Decision D-1)
- [ ] Define the trigger surface: slash command / skill / CLI / Streamlit page
- [ ] Define scheduling if regression runs are periodic
- **Note:** the `BLAST.md` in this folder ends at Phase 4 (line 80). Phase 5 "Trigger" is **not present in this copy** — its checklist will be expanded once the source text is supplied.

---

## 4. Phase 1 — Discovery Questions (UNANSWERED — blocks the gate)

BLAST.md requires these 5 answers before any code. My current *hypothesis* per question is in italics — **hypotheses are not answers; please confirm or correct.**

| # | Question | Hypothesis (to confirm) | Answer |
| - | -------- | ----------------------- | ------ |
| DQ-1 | **North Star** — singular desired outcome? | Jira ID → approved test plan + E2E regression case file | ✅ **answered** 2026-09-19 |
| DQ-2 | **Integrations** — which external services, are keys ready? | Jira Cloud (keys ready, 3/3 present) + local LLM (LM Studio) and/or Groq | ⬜ open |
| DQ-3 | **Source of Truth** — where does primary data live? | The Jira ticket: `description` field (ADF) + `attachment` mockups | ⬜ open |
| DQ-4 | **Delivery Payload** — how/where is the result delivered? | `TestPlans/<KEY>_<ts>_Test_Plan.md` **+ `<KEY>_<ts>_Regression_Cases.md` and `.csv`** | ✅ **answered** 2026-09-19 |
| DQ-5 | **Behavioral Rules** — how should the system act? | Never invent ACs; never mark final; no creds/PII in output; fetch once per ticket | ⬜ open (drafted in `LLM.md` §4) |

---

## 5. Data-First Rule — Payload Shapes

Full JSON schemas live in [`LLM.md`](./LLM.md) §3. Coding begins only once these shapes are confirmed:

| Payload | Shape | Status |
| ------- | ----- | ------ |
| `TicketPayload` | In — normalized ticket | 🟡 drafted |
| `GapAnalysis` | present / ambiguous / missing items | 🟡 drafted |
| `TestPlan` | scenarios + gates + open questions | 🟡 drafted |
| `TestCase` (E2E regression) | scenario TID, description, steps, expected | 🟡 drafted — keyed to the columns |
| `RegressionCaseFile` | the `.md` + `.csv` **column contract** | 🟢 **supplied by Seema 2026-09-19 — final: 12 columns**, see `LLM.md` §3.5 |
| `RunManifest` | traceability + source hash | 🟡 drafted |

---

## 6. Definition of Done (project level)

- [ ] `JIRA-KEY` → plan + regression case file in one command, no manual steps between
- [ ] Every scenario and case traces to an AC **or** a gap ID (zero orphans)
- [ ] Zero fabricated acceptance criteria, error strings, IDs, or links
- [ ] Zero credentials or PII in any generated artifact
- [ ] Human review gate present and respected (no auto-approval)
- [ ] The `.csv` parses cleanly (RFC-4180 — quoted fields, escaped commas/newlines) and its header **equals the supplied 12-column contract** in `LLM.md` §3.5, in order, **with no duplicate header names**
- [ ] **AUTHORED** columns always populated — Scenario TID, TestCase Description, PreCondition, TestSteps, Expected Result, Steps to Execute, Misc (Comments), Priority, Is Automated
- [ ] **EXECUTION** columns always empty — Actual Result, Status, Executed QA Name *(we generate cases; we do not run them)*
- [ ] Every case's `trace` (AC/gap ids) is present and lands in `Misc (Comments)`, since the contract has no trace column
- [ ] Cases are genuinely **E2E** (user-journey shaped) and not unit/API checks in disguise
- [ ] The `.md` and `.csv` carry the **same** case set — no drift between the two renders
- [ ] Re-running the same key does not overwrite earlier drafts (timestamped filenames)
- [ ] Ticket fetched exactly once per run; all later steps read the cached copy
- [ ] Each `tools/` script is atomic, testable, and idempotent

---

## 7. Out of Scope (v1)

- **Emitting runnable automation code** (Playwright/Selenium specs) — v1 emits the **md/csv case file only**; the suite owns the code
- **Importing** cases into the automation suite, or setting up its runner
- Executing the generated tests against a live application (generation only, not execution)
- Test-management write-back (pushing cases into Xray/Zephyr/Jira)
- Multi-ticket batch processing in one session
- Production data / unmasked PII handling
- Non-Jira trackers (Azure DevOps, Linear)

---

## 8. Risks & Mitigations

| # | Risk | Impact | Mitigation |
| - | ---- | ------ | ---------- |
| R-1 | Tickets carry **no acceptance criteria** (SCRUM-1 had none) | High — pass/fail becomes subjective | Gap analysis promotes each missing AC to an explicit, blocking question |
| R-2 | Jira `description` is ADF JSON, not text | High — naive parsing yields `{'type':'doc'...}` mush | Reuse the proven ADF flattener in `jira_client.py` |
| R-3 | Large PRD re-read every step burns context/tokens | Medium | Fetch once → cache in `.tmp/` → reuse; fresh session per ticket |
| R-4 | Small local model (`gemma3:1b`) produces malformed tables/schemas | Medium | Schema-validate every LLM output; deterministic template fill, not free-form prose |
| R-5 | Generated Playwright/Selenium code looks right but doesn't compile | Medium | Validate by parsing/type-checking before declaring success |
| R-6 | Secrets leak into plans, logs, or committed files | High | `.env` only, gitignored; no credential in any artifact; scrub before write |
| R-7 | Ambiguity in ticket ("VMO.com" vs "VWO") sends tests to the wrong target | Medium | Surface as a gap question, never silently pick one |

---

## 9. Open Decisions (need a human)

| # | Decision | Options | Needed by |
| - | -------- | ------- | --------- |
| D-1 | Phase 5 (Trigger) is absent from this `BLAST.md` copy — is a Trigger phase required? | Supply source text / treat Phase 4 as terminal | Before Phase 3 |
| D-2 | ~~Canonical Jira access path?~~ | **RESOLVED — Python `requests`** (`tools/jira.py`). The MCP server stays available repo-wide; `curl` needs `jq`, which is not guaranteed on win32 | ✅ closed |
| D-3 | Which automation suite consumes the `.csv`? (column shape only) | Match the Playwright TS suite / match the Selenium Java suite / generic columns | Phase 3 |
| D-4 | ~~LLM provider?~~ | **RESOLVED — local first with Groq fallback**, exactly as chapter_03. Provider preference is a Settings toggle | ✅ closed |
| D-5 | ~~Interface?~~ | **RESOLVED — Streamlit 2-page app** (Generate + Settings), matching chapter_03 | ✅ closed |
| D-6 | ~~Test-case output format?~~ | **RESOLVED 2026-09-19 — both `.md` and `.csv`** (md for review, csv for ingestion) | ✅ closed |
| D-7 | ~~Meaning of "regression creator"~~ | **RESOLVED 2026-09-19 — generate E2E regression cases from the ticket, emit as md/csv** | ✅ closed |

### D-8 · Guaranteed scenario coverage across P0–P3 — **DEFERRED (accepted 2026-09-19)**

Seema: *"we can improve later on how to get full tc coverage — p0, p1, p2, p3 etc."*

Today coverage is **whatever the model produces**. It is reported (the `Coverage:` note in the case-file
header) but not enforced, and the priority tiers are inconsistent:

| | Behaviour today |
| - | --------------- |
| Contract priority values | `P0`, `P1`, `P2` only (`tools/contract.py`) — **no P3 tier exists** |
| Scenario priorities | P0/P1/P2, assigned by risk in `planner` / `derive_scenarios` |
| Case prompt | "prioritise P0, then P1" — P2 is optional and routinely dropped (KAN-1 lost a P2 SSO-failure scenario) |
| `fallback_cases` | selects **P0/P1 only**, so a P2 scenario never gets a case without an LLM |
| Enforcement | none. No `COVERAGE-GAP` guard in `validate_cases`; the gap is a header note, not a pill |

**Design questions to settle when this is picked up:**

1. **Taxonomy** — is P3 wanted? Adding a value to the priority enum is *not* a column change, so it does
   not breach the frozen contract (`LLM.md` §3.5, additive values only).
2. **Enforcement model** — guarantee one case per scenario for P0/P1 (and best-effort for P2/P3), or
   guarantee every scenario? Options: a deterministic second pass for uncovered scenarios (the pattern
   `fallback_cases` already uses), or a targeted re-prompt listing only the missing ids.
3. **Priority-weighted coverage target** — e.g. 100% of P0, 100% of P1, ≥80% of P2, no floor for P3.
4. **Surfacing** — a `COVERAGE-GAP` **grounding** issue plus a warning pill in the UI before approval,
   rather than only a line in the generated file.
5. **Interaction with `max_cases`** — if the cap is lower than the scenario count, coverage cannot be
   complete; the cap should either raise or the shortfall be reported as expected rather than as a defect.

---

## 10. As Built (2026-09-19)

```
TestPlan_TestCase_Agent/
├── app.py                  Streamlit UI — Generate + Settings pages
├── planner.py              navigation: ticket → gaps → scenarios → plan
├── case_builder.py         navigation: approved plan → E2E cases
├── llm_client.py           local LLM + Groq failover, JSON extraction
├── settings_manager.py     config.json + .env seeding, connection state
├── architecture/           Layer 1 — SOPs 01–06
├── tools/                  Layer 3 — deterministic, no LLM
│   ├── contract.py         the frozen 12-column contract
│   ├── jira.py             fetch + ADF flatten + attachment reading + connection test
│   ├── gap_check.py        the 10-point requirement checklist
│   ├── gate.py             evidence gate + trace validation (I-10/I-11)
│   ├── render_plan.py      template → markdown plan
│   ├── emit_cases.py       cases[] → .md + .csv
│   └── validate_cases.py   the 8 guards, split contract vs grounding
├── templates/              test_plan_template.md
├── samples/                sample_ticket.json (offline demo fixture)
├── TestPlans/              generated plans + case files
└── .tmp/                   intermediates + smoke/link/pipeline tests
```

**Run it:**

```powershell
cd chapter_08_AIAgents\TestPlan_TestCase_Agent
.\.venv\Scripts\python.exe -m streamlit run app.py
# → http://localhost:8501
```

**Verified by:** `.tmp/smoke_test.py` (all deterministic layers), `.tmp/pipeline_test.py`
(full run on the sample ticket → 7 scenarios, 7 cases, all guards green).

---

## 11. Change Log

| Date | Change |
| ---- | ------ |
| 2026-09-19 | Protocol 0 executed: 4 memory files created, discovery + inventory recorded, HALT gate set |
| 2026-09-19 | **D-7 + D-6 resolved** — "automation regression" = generate **E2E regression cases from the ticket**, emitted as **`.md` + `.csv`** for the automation suite. Runnable-code emission and suite import declared out of scope. Schemas re-scoped in `LLM.md` §3.5 |
| 2026-09-19 | **Column contract supplied by Seema — adopted** (`LLM.md` §3.5 rev 0.3). Duplicate `Expected Result`/`Actual Result` headers flagged as silently destructive (verified in `DictReader`) |
| 2026-09-19 | **Duplicate pair deleted (S-6 resolved) → final contract is 12 columns**, headers clean and unique. `Steps to Execute` carries no expected/actual of its own. Added AUTHORED-vs-EXECUTION blank-cell policy and the `DUPLICATE-HEADER` / `EXECUTION-FILLED` / `AUTHORED-BLANK` guards. Remaining opens: **S-7** (`Status` blank vs `Not Run`), **S-8** (`issue_key` has no column) |
| 2026-09-19 | **HALT gate lifted** on the user's "do phases 2–4 in one go" directive. **Phase 2 (Link)** executed: Jira path = Python `requests`; token present but **rejected 401**; local LLM **not running**; Groq unset. **Phase 3 (Architect)** built: 6 deterministic `tools/`, 4 navigation modules, 5 SOPs. **Phase 4 (Stylize)** built and **running** on `:8501`. Verified by two test suites. D-2/D-4/D-5 closed |
