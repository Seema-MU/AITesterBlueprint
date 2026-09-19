# 📈 progress.md — Session Log

**Project:** `chapter_08_AIAgents/TestPlan_TestCase_Agent`
**B.L.A.S.T. step:** Protocol 0 — Initialization
**Logging cadence:** 10-minute blocks (escalate to 30 min / hourly once the build starts)
**Session:** 2026-09-19, start **14:46 IST** (UTC+05:30), environment win32, branch `master`

> **Rules for this log:** append-only, newest at the bottom. Every block records **what was done · the error (if any) · the result · the evidence.** No block is left blank — "no change" is itself a result. Never paste a credential or token value into this file.

---

## Block 1 · T+00 (14:46) — Baseline & Protocol read

**Done**
- Read `BLAST.md` (full, 80 lines) and `Prompt_Used.md` (27 lines) in the project folder.
- Confirmed **Protocol 0 = Initialization** → create `task_plan.md`, `findings.md`, `progress.md` (+ a constitution file), then **halt before `tools/`.**

**Error:** none.

**Result**
- Protocol 0 scope is clear: 4 memory files, then STOP.
- **Discovery:** this `BLAST.md` copy **ends at Phase 4 — there is no Phase 5 (Trigger).** Recorded as Open Decision **D-1**.
- **Discovery:** `Prompt_Used.md` line 1 says `chapter_07_AI_Agents` while its body and the live objective say `chapter_08_AIAgents/TestPlan_TestCase_Agent` — a stale copy-paste. Flagged.

**Evidence:** `BLAST.md` lines 7–24 (Protocol 0), line 80 (end of file); `Prompt_Used.md` line 1.

---

## Block 2 · T+10 — Inventory sweep

**Done**
- Listed the project folder: only `BLAST.md` + `Prompt_Used.md` — greenfield.
- Searched the whole repo for existing `task_plan.md` / `findings.md` / `progress.md` / `gemini.md` / `LLM.md` → **zero matches**.
- Repo-wide grep for Jira references → **23 files**.

**Error:** none.

**Result**
- No prior memory files to continue from; this is a clean Protocol 0.
- Jira surface is real and non-trivial: `.mcp.json`, `.mcp/jira-launch.js`, `chapter_03_Locat_TC_Gen/src/jira_client.py`, `TestPlans/SCRUM-1..3`.
- `chapter_08_AIAgents/` is **untracked** in git.

**Evidence:** directory listing of project folder; repo glob for memory files (no matches); grep `jira` → 23 files; `git status` → `?? chapter_08_AIAgents/`.

---

## Block 3 · T+20 — Jira plumbing read (3 paths found)

**Done**
- Read `.mcp.json` + `.mcp/jira-launch.js` → MCP server path, env-file token bridging.
- Read `chapter_03_Locat_TC_Gen/src/jira_client.py` → Python REST path, ADF flattener, AC regex, 401/404 mapping.
- Verified configured env keys in `.commandcode/skills/testPlan_gen/.env` — **key names only, values never read or printed.**

**Error:** none.

**Result**
- **Three working Jira paths exist.** Recommended: MCP first, Python deterministic fallback, curl for debugging.
- Credentials: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_TOKEN` — all three present.
- Biggest technical trap identified: **`fields.description` is an ADF object, not text** — `jira_client.py` already solves this, so port it rather than rewrite.
- ⚠️ The MCP handshake is **unverified** (no live call made). Deferred to Phase 2 Link — recorded as a task, not assumed working.

**Evidence:** `.mcp/jira-launch.js` (env mapping to `ATLASSIAN_*`); `jira_client.py` (`_flatten_adf`, `_extract_acceptance_criteria`, `API_TIMEOUT = 15`); `.env` key-name listing.

---

## Block 4 · T+30 — Existing pipeline & conventions

**Done**
- Read `.commandcode/skills/testPlan_gen/SKILL.md` (114 lines).
- Read the plan template, the case template, and the **real output** `TestPlans/SCRUM-1_Test_Plan.md`.

**Error:** none.

**Result**
- The existing skill **deliberately stops before test cases/automation** ("Do not proceed to write test cases or automation until a human approves"). **That post-approval half is precisely the gap our project fills.**
- Convention captured: `TestPlans/<KEY>_<YYYYMMDD-HHMM>_Test_Plan.md`, timestamped so reruns never overwrite earlier drafts.
- Guardrails captured as hard constraints: never final · never fabricate ACs · traceable scenarios · **no credentials** · **no PII** · **fetch once per session**.
- SCRUM-1 is proof the gap-analysis works: it found **no acceptance criteria**, undefined release scope, and the **"VMO.com" vs "VWO"** host ambiguity.
- **Contradiction found:** SCRUM-1 claims *"existing repo framework: Selenium"* while the repo README is still an empty template — an assumption logged as fact. Feeds **D-3**.

**Evidence:** `testPlan_gen/SKILL.md` lines 25–63, 97–108; `TestPlans/SCRUM-1_Test_Plan.md` (12 sections, S-01…S-18, `HUMAN REVIEW GATE — APPROVED 2026-08-19`).

---

## Block 5 · T+40 — Automation framework scan

**Done**
- Grepped repo for `selenium|playwright|pytest|webdriver|cypress` (47 files) and inspected the two framework folders.
- Read root `package.json`.

**Error:** none.

**Result**
- **Two real frameworks exist:** Playwright + TypeScript (`chapter_02_PromptEng/PlaywriteFramework/`, Page Object Model: `login.page.ts` + `login.spec.ts`) and Selenium + Java (`SaleniumFramework/`, `pom.xml`, `LoginPage.java`, `ValidLoginTest.java`).
- Root `package.json` is only the MCP launcher + `docx` — **not** a JS app, so `npm test` is meaningless here.
- Platform is **win32**, so the skill's bash `fetch_jira.sh` needs a PowerShell/Python equivalent.

**Evidence:** grep matches; `PlaywriteFramework/playwright.config.ts`, `src/pages/login.page.ts`, `src/tests/login.spec.ts`; `package.json` (deps `@aashari/mcp-server-atlassian-jira`, `docx`).

---

## Block 6 · T+50 — Protocol 0 authoring

**Done**
- Wrote the four memory files: `task_plan.md`, `findings.md`, `progress.md`, `LLM.md`.
- Set the HALT gate and listed the 5 Discovery Questions + 7 open decisions.

**Error:** none.

**Result — Protocol 0 complete, execution halted.**
- Blueprint drafted, schemas drafted, **nothing written to `tools/`** (correctly forbidden).
- Awaiting: Discovery answers, schema sign-off, Blueprint approval.

**Evidence:** this file; `task_plan.md` §2 (HALT gate), §4 (Discovery), §9 (Open Decisions).

---

## Block 7 · T+60 — Requirement clarification received ✅

**Done**
- Seema answered the blocking question in one line: *"test cases for automation regression means by seeing the jira ticket I should get the regression testcases (e2e) for that in a md/csv file which i can next feed to my automation suite."*
- Propagated the decision into all four memory files (no code written — HALT gate still holds).

**Error:** none.

**Result — D-7 is closed, and it resolved three more open items by implication:**

| Item | Resolution |
| ---- | ---------- |
| **D-7** — meaning of "regression creator" | **Generate** E2E regression cases *from the ticket*. Selection-from-suite is out. |
| **D-6** — output format | **`.md` + `.csv`** — md for human review, csv for machine ingestion. |
| **S-4 / D-3** — automation framework | **De-scoped.** v1 emits no runnable code, so the Playwright-vs-Selenium question no longer blocks. Only the *CSV column shape* may need aligning to your suite. |
| **S-1 / S-2** (`LLM.md`) | Re-scoped: `TestCase` → E2E case; `RegressionSuite` **deleted**, replaced by the frozen `RegressionCaseFile` contract. |

**Key design consequence:** the `.csv` is now an **interface**, not a by-product — the boundary between this agent and your automation suite. So its 11-column header was frozen in `LLM.md` §3.5 (additive changes only), with hard-fail guards `CONTRACT-DRIFT` and `MD-CSV-DRIFT` to stop the two formats drifting apart. Both formats render from **one** `cases[]` JSON.

**Files touched:** `task_plan.md` (§1, §3, §4, §5, §6, §7, §9, §10) · `findings.md` (§1, §7) · `LLM.md` (§1, §3.4, §3.5, §3.6, §4, §5, §6, §8, §9) · `progress.md` (this block).

**Evidence:** decision recorded in `task_plan.md` §1 and §9; contract in `LLM.md` §3.5.

---

## Block 8 · T+70 — Column contract received ✅

**Done**
- Seema supplied the exact test-case columns expected in the document (14 as listed, **12 after the duplicate pair was removed in Block 9**).
- Adopted them verbatim as the frozen contract in `LLM.md` §3.5 (rev 0.3), replacing our 11-column draft — the suite's schema wins.
- Re-keyed the internal `TestCase` JSON (§3.4) to those column names so there is **one** mapping, not two.
- Added the AUTHORED-vs-EXECUTION blank-cell policy and three new build guards.
- Propagated to `task_plan.md` (§1, §5, §6, §10) and `findings.md` (§7.4).

**Error:** none.

**Result — contract frozen, with two hazards found while reading the list:**

1. **Duplicate headers.** `Expected Result` (positions 5, 8) and `Actual Result` (6, 9) each appear twice. `csv.DictReader` and `pandas.read_csv` **silently keep only the last duplicate** — columns 5 and 8 would disappear with no error, and Excel renders two identically-named columns. **Handling (interim):** order and meaning preserved; duplicates temporarily disambiguated by step-group prefix. Logged as **S-6** → **resolved in Block 9: the second pair was deleted.** (Verified in the interpreter: `'a','b','c','d'` under duplicate headers came back as only `c`/`d`.)
2. **Part of the sheet is execution-time.** `Actual Result`, `Status` and `Executed QA Name` can only ever be **blank** — we generate cases, we do not run them. So the correct file is deliberately partly empty, and a naive "no empty cells" check would fail every *good* file. **Handling:** split columns into AUTHORED (must be filled) and EXECUTION (must be empty), with `AUTHORED-BLANK` and `EXECUTION-FILLED` as hard-fail guards. *(After the Block 9 deletion this is 3 execution columns, not 4 — `Misc` moved to AUTHORED because it carries `trace`.)*

**Bonus resolution:** the supplied schema has **no traceability column**, but invariant I-6 requires every case to trace to an AC or gap. `trace` now rides inside **`Misc (Comments)`** — the one column that would otherwise sit empty.

**Also noted:** `issue_key` is no longer a column, so provenance lives in the `.md` header + `RunManifest`. Concatenating CSVs across tickets would make rows unattributable (**S-8**).

**Files touched:** `LLM.md` (§3.4, §3.5, §3.6, §6, §8, §9) · `task_plan.md` (§1, §5, §6, §10) · `findings.md` (§7.4) · `progress.md` (this block).

**Evidence:** contract in `LLM.md` §3.5; guards in `LLM.md` §6.

---

## Block 9 · T+80 — Duplicate pair deleted → contract finalised ✅

**Done**
- Confirmed with Seema: the second `Expected Result` / `Actual Result` pair was a **copy-paste leftover** → deleted.
- Reissued the contract as **12 columns** (`LLM.md` §3.5 rev 0.4). No disambiguation needed — the headers are now clean and unique exactly as named.
- Verified programmatically: the 12-column header parses to **12 columns, 12 unique names, 0 collisions**.
- Dropped `steps_to_execute_expected` from the internal case JSON (§3.4) — there is now one `expected_result`, belonging to `test_steps`.
- Reclassified `Misc (Comments)` from execution-time to **AUTHORED** (it carries `trace`).

**Error:** none.

**Result — the output contract is settled.**

| Before | After |
| ------ | ----- |
| 14 columns, 4 duplicate header names | **12 columns, 0 duplicates** |
| Execution-only columns: 4 | **3** (`Actual Result`, `Status`, `Executed QA Name`) |
| `Priority` = col 13, `Is Automated` = col 14 | `Priority` = col 11, `Is Automated` = col 12 |
| Ambiguity: which expected/actual pair is real? | Resolved — the one after `TestSteps` |

**Final header:**
```
Scenario TID,TestCase Description,PreCondition,TestSteps,Expected Result,Actual Result,
Steps to Execute,Status,Executed QA Name,Misc (Comments),Priority,Is Automated
```

**Structural reading:** `TestSteps → Expected Result → Actual Result`; `Steps to Execute` is the granular execution recipe and carries no expected/actual of its own.

**Files touched:** `LLM.md` (§3.4, §3.5, §6, §8, §9, header) · `task_plan.md` (§6, §10) · `findings.md` (§7.4) · `progress.md` (this block).

**Evidence:** `LLM.md` §3.5 rev 0.4; parity check run in the interpreter.

---

## Block 10 · T+90 — Phase 2 (Link): connectivity verified, both integrations blocked

**Done**
- Created the project venv (Python 3.12.10) and installed `streamlit 1.64.0`, `pandas 3.0.6`, `requests 2.34.2`.
- Built `jira.test_connection()` (`GET /rest/api/3/myself`) and `llm_client` connection tests.
- Ran a **live** Jira connection test with the repo's seeded credentials.
- Probed the local LLM endpoint and the Groq key.

**Error / blocker — Jira 401.**
```
env source     : .commandcode/skills/testPlan_gen/.env
jira_url       : https://<old-site>.atlassian.net     (valid, ends .atlassian.net)
jira_email     : se***@gmail.com                     (well-formed, no whitespace)
token          : 192 chars, starts ATATT3=True       (correct Atlassian token format)
GET /rest/api/3/myself → 401 "Client must be authenticated to access this resource."
```

**Diagnosis — this is NOT a code fault.** Two independent checks:
1. The token is well-formed (`ATATT3…`, 192 chars) and the URL resolves — so the request is correct.
2. **chapter_03's own `config.json` holds the same token and returns the same 401.** The pre-existing app is equally locked out, which exonerates the new code.

⇒ **The API token is expired or revoked.** Fix: generate a fresh token at id.atlassian.com → Settings → API tokens, paste it into the app's Settings page.

**Error / blocker — local LLM down.** `http://localhost:1234/v1` → `WinError 10061` connection actively refused; LM Studio is not running. Groq key is also unset, so there is currently **no** LLM provider available.

**Result — nothing halted.** Both failures degrade cleanly: the pipeline detects the dead provider, logs a one-line reason, and completes via the deterministic fallback. The app surfaces the Jira 401 as a readable message instead of a stack trace.

**Evidence:** `.tmp/link_test.py`, `.tmp/diag_jira.py`, `.tmp/check_sources.py`.

---

## Block 11 · T+100 — Phase 3 (Architect): the 3-layer build

**Done**
- **Layer 3 — `tools/` (deterministic, no LLM):** `contract.py` (the frozen 12 columns), `jira.py` (fetch + ADF + connection test), `gap_check.py` (10-point checklist), `render_plan.py` (template → markdown), `emit_cases.py` (cases → md + csv), `validate_cases.py` (7 guards).
- **Layer 2 — navigation:** `planner.py`, `case_builder.py`, `llm_client.py`, `settings_manager.py`, `app.py`.
- **Layer 1 — `architecture/`:** SOPs 01–05 + index, including the Golden Rule.
- `templates/test_plan_template.md`, `samples/sample_ticket.json`, `.gitignore`, `.env.example`.

**Error:** none.

**Result:** every tool is atomic and importable; the LLM is confined to `planner`/`case_builder` so the deterministic layer stays pure (invariant I-3).

**Evidence:** directory listing; `tools/__init__.py` marks the layer boundary.

---

## Block 12 · T+110 — Verification: 2 real defects found and fixed

**Done**
- Wrote `.tmp/smoke_test.py` — exercises every deterministic layer against a fixture ticket, no Jira and no LLM.

**Error 1 — duplicate gap findings.** The naming-collision heuristic reported `VMO→VWO` **and** `VMO→vwo`, because the fixture mentioned the product in two casings. *Fix:* dedupe on a case-insensitive signature. Result: one finding instead of two.

**Error 2 — weak fallback scenarios.** Only **2** scenarios were derived, because the derivation filtered whole lines and the fixture had 2 paragraphs; the user-story line also read as narrative rather than a test. *Fix:* split into sentences, convert `As a <role> I want to X so that Y` → `Validate that the user can X`, and prefer sentences carrying a requirement verb. Result: **4** scenarios, e.g. *"Validate that the user can log in to the VWO dashboard at app.vwo.com"*.

**Error 3 (test-only) — `UnicodeEncodeError` on `✓`.** The console is cp1252 and cannot encode the checkmark. Not an app bug (the UI renders in a browser); re-ran with `PYTHONIOENCODING=utf-8`.

**Result:** all deterministic steps pass — 12 unique columns, 0 drift, 0 duplicates, plan renders with **no unfilled tokens**, all 7 contract guards green.

**Evidence:** `.tmp/smoke_test.py` output.

---

## Block 13 · T+120 — Phase 4 (Stylize) + run

**Done**
- Built the Streamlit UI: **Generate** (staged: fetch → plan → **gate** → cases) and **Settings** (Jira, local LLM, Groq, provider preference, output folder, 3 connection tests).
- Preserved the `--- HUMAN REVIEW GATE ---` as a real control: the approve button stays disabled until the reviewer ticks the checkbox.
- Added downloadable `.md` / `.csv` and a clearly-labelled offline sample ticket.
- Started the server and verified it: `GET /_stcore/health → 200 ok`, `GET / → 200`.
- Ran `.tmp/pipeline_test.py` through the real code path: **7 scenarios → 7 cases**, all guards green, 3 artifacts written to `TestPlans/`.
- Polished the provider error text — the raw `ConnectionPool` traceback was ~400 chars in the UI; now it reads *"Local LLM at http://localhost:1234/v1 unavailable (connection refused — is the LLM server running?)"*.

**Error:** none after the Block 12 fixes.

**Result — the project runs.**
```
http://localhost:8501
```
Artifacts produced: `SAMPLE-101_pipelinetest_Test_Plan.md` (14 KB),
`SAMPLE-101_pipelinetest_Regression_Cases.md` (5.6 KB), `.csv` (4.6 KB).

**Evidence:** background task log; health check; `.tmp/pipeline_test.py` output.

### Block 13b — Headless UI verification (Streamlit `AppTest`)

Rather than assume the UI works because the server returns 200, I drove the real app with
Streamlit's official `AppTest` harness (`.tmp/ui_test.py`). Six tests, all passing:

| Test | Result |
| ---- | ------ |
| 1 · App boots | ✅ no exception; title + 3 buttons + prompt input present |
| 2 · Settings page renders | ✅ 9 input fields, 4 buttons (Save, Test Jira, Test local LLM, Test Groq) |
| 3 · Sample ticket loads | ✅ gap table renders with **8 findings** |
| 4 · Test plan generates | ✅ scenario table renders, no exception |
| 5 · **Human review gate** | ✅ approve button **disabled before** ticking, **enabled after** — the gate genuinely blocks |
| 6 · Cases generate | ✅ *"All contract guards passed — 7 cases written."*; table has exactly the **12 contract columns**, 7 rows |

That test 5 assertion is the important one: it proves the gate is a real control rather than a
label, and it is the behavioural enforcement of invariant I-5.

Also found and fixed **E-7** — 9 sites using `use_container_width`, whose removal date
(2025-12-31) has already passed in this environment; replaced with `width="stretch"/"content"`.

**Evidence:** `.tmp/ui_test.py` output.

---

## Block 15 · T+140 — Plan fidelity + UI redesign (feedback round 1)

Seema's feedback, in three parts: (1) the expected test plan is `chapter_02_PromptEng/vwo-test-plan-draft.md`
/ `VWOTestPlan.docx`, but the app shows what looks like **test cases**; (2) what is the sidebar status
block, and is it required? (3) the design looks basic and generic.

### 15.1 The plan-viewing defect — the real complaint

The app rendered **only the scenario table** under "2 · Test plan", with the full plan hidden inside a
collapsed expander. Worse, the "Expected" column read *"Behaviour matches: \<scenario text\>"* — the
scenario echoed back at itself. A table of circular one-liners does read like test cases, not a plan.

| Fix | Detail |
| --- | ------ |
| **Template realigned to the expected document** | Our 12-section shape was replaced with the **7-section STLC structure** that `vwo-test-plan-draft.md` actually uses: 1 Overview/Objectives/Scope → 2 Quality & Risk → 3 Strategy & Coverage → 4 Environment/Data/Automation → 5 Defect Management → 6 Entry/Exit/Release Readiness → 7 Resources/Dependencies/Deliverables, then scenarios + gaps + gate. `Needs clarification` and `Inference (low confidence)` markers now mirror the expected document's own vocabulary. |
| **The document is the hero** | Stage 2 opens on a **"Test plan document"** tab rendering the full plan as a styled document surface; the scenario register and coverage move to sibling tabs. |
| **Expected results de-circularised** | New `_expectation()`: a sentence already containing a modal/copula (*"Remember me should persist…"*) is **already** the assertion, so it is used as written; *"Validate that X"* drops the verb; a leading verb of intent (*Support/Show/Prevent/Send*) is restated as an observable outcome. |
| **Trace now points at a real gap** | Scenarios derived without acceptance criteria traced to the placeholder string `derived-from-description`. They now trace to the **gap id that flags the missing ACs** (`G-01`), satisfying I-6 properly. |
| **Missing ACs are flagged, not papered over** | With no acceptance criteria, an inferred expectation is not an authoritative one, so those cases carry `clarification_needed` and show `NEEDS CLARIFICATION` in `Misc (Comments)`. |

### 15.2 The sidebar status block — answered and fixed

It was a readiness indicator I added. **It was also lying.** It showed `Jira: ✅ configured` and
`Local LLM: ✅ google/gemma-3-1b` while the Jira token was returning 401 and LM Studio was not running,
because it only checked that a *value was non-empty*.

Fixed to distinguish the two states, with the distinction written on the rail itself:
**"Configured" ≠ "working"** → after a test in Settings the pill becomes **Reachable / Unreachable**.
Bare emoji-as-status is gone; every state now carries a word as well as a colour (never colour alone).
The `Claude-style flow: Gaps → Plan → Gate → Cases` caption was internal shorthand and has been removed.

### 15.3 Redesign — direction: "Review desk"

| Dimension | Before | After |
| --- | --- | --- |
| Composition | Sidebar nav + centred stack of default widgets | **Run rail** (numbered stage stepper with done/active/locked states, run identity, environment readiness) + working canvas where the **artefact** is the hero |
| Colour | Streamlit defaults, dark | **Light warm-paper** base with a single **berry** accent; semantic pass/warn/fail reserved strictly for gap status |
| Type | One default size for everything | Compressed product scale for UI; **serif for long-form document body**; tabular figures in registers; headings carry rules |
| Components | `st.dataframe` grids | Purpose-built `tp-*` HTML: cards, stat strip, pill vocabulary, gates, registers with sticky headers |
| Depth | Default | Hairline borders, **zero shadows**; the gate is marked by a left rule, not a shadow |
| States | Only the happy path | Locked stages, guard-failure badges, empty execution cells rendered as `—`, sample data explicitly labelled |

Chosen against the domain reflex: a QA tooling product *defaults* to dark-terminal, so this went light
and document-led instead. Recorded in `.streamlit/config.toml` + the `THEME_CSS` block.

**Security note:** the plan is converted markdown → HTML for the document surface, so ticket-derived
text is untrusted. Angle brackets are neutralised before conversion, and every injected value is
`html.escape`d.

**Error:** none.

**Result:** functional verification green — `.tmp/ui_test.py` **7/7**.

⚠️ **Honest gap — the redesign is NOT visually verified.** `agent-browser` is not installed on this
machine, so I could not take a screenshot. I verified that the app boots, that every stage renders
without exception, that the document surface and all `tp-*` markup are emitted, and that the gate
blocks — but **not** how the CSS actually looks. No pixel was checked.

**Evidence:** `.tmp/ui_test.py`; `TestPlans/SAMPLE-101_pipelinetest_Test_Plan.md` (now STLC-shaped,
15.8 KB); health `200 ok`.

---

## Block 16 · T+160 — Credentials verified, both providers now LIVE

Seema added Jira + Groq details and asked me to check them. Verified without printing a single secret
(fingerprints and shapes only). Detail in `findings.md` §11.

**Errors found**

| Code | Error | Root cause | Fix |
| ---- | ----- | ---------- | --- |
| E-12 | Credentials written to `.env.example`, which the root `.gitignore` **un-ignores** (`!.env.example`) | Wrong file — the app reads `.env` | Migrated real values to gitignored `.env`; reset `.env.example` to placeholders. Scripted, so no secret hit the transcript. Nothing was committed (the whole tree is still `??` untracked) |
| E-13 | Groq `model_not_found` — `llama-3.3-70b-versatile` | **Groq retired that model.** 13 models are available to this key; the retired name returns an error | Verified `openai/gpt-oss-120b` works; it is now the default in `.env` **and** `llm_client.DEFAULT_GROQ_MODEL` |
| E-14 | `Test Groq` reported 404 as if the key were bad | **Our bug** — `GROQ_MODELS_URL` ended in `/models` and `_list_models()` appended `/models` again → `/models/models` | Store `GROQ_BASE_URL` instead; the key was valid all along |
| E-15 | `.env` values silently ignored (the retired model survived the first fix) | **Our bug** — `load_settings()` applied env values only when the current value was *falsy*, so every key with a non-empty default kept the default | Precedence is now strict: **defaults < .env < config.json** |

**Results — everything green**

```
JIRA  : PASS — connected as <your-display-name>        (<your-site>.atlassian.net)
GROQ  : PASS — 'openai/gpt-oss-120b' available   (key valid, 13 models)
LOCAL : PASS — LM Studio up, google/gemma-3-1b   (2 models exposed)
.env  : IGNORED by git (rule .gitignore:5)
.env.example : cleaned, no secrets
```

**The LLM path is now live end to end.** KAN-27 (`VWO-R8: Google Analytics and Mixpanel integrations`)
fetched with real acceptance criteria, 9 gaps, and model-authored output traced to `AC1`/`AC2`:

> *"Admin attempts to connect Google Analytics with invalid credentials"* →
> *"Connection is rejected, a clear error message is displayed, and no integration is saved"*

That is materially better than the deterministic fallback, and it retires the caveat I carried from
Block 13 about the LLM path being unverified.

**Also fixed:** `findings.md` §3 documented the JQL endpoint as `/rest/api/3/search`, which now returns
**410 Gone**. Corrected to `/rest/api/3/search/jql`, with a note that unbounded JQL is rejected.

**Note:** `KAN` is the project worth using — KAN-22…KAN-27 are `VWO-R3…VWO-R8` release tickets, which is
exactly the input shape this agent wants. `SCRUM-1` 404s here because it belongs to the old site.

**Verification:** `.tmp/ui_test.py` — **28 assertions, all passing**; health `200 ok`.

---

## Block 18 · T+180 — Attachments are requirements (the KAN-4 root cause)

Seema generated `KAN-4_20260919-1938_Regression_Cases.md`. Mechanically perfect — 12 columns, correct
order, execution cells empty, all guards green — but the **content was fabricated**.

**The evidence.** KAN-4 has a **0-character description**, a four-word summary, no components, no
labels, and **7 of 8 gaps missing** — and two attachments:

```
add_to_cart_page_mockup (1).html
sample_prd_add_to_cart (1).md      <-- the actual requirements
```

We captured attachment **filenames only**. So the model worked from the string "add items to cart page"
and filled the requested 10 cases by inventing *valid discount code / valid payment method / valid
shipping address / valid email address / valid phone number / valid credit card / valid gift card /
valid coupon code*. None of that exists in the ticket, and those are checkout concerns, not add-to-cart.
Traces read `trace: AC: User can add an item to cart.` — an **invented acceptance criterion presented as
provenance**. Provider comparison confirmed the run used the local `gemma-3-1b`, which invented 10 such
strings; Groq on the same ticket produced sensible cart scenarios traced to real gap ids.

**Fix shipped: `tools/jira.py` now reads attachments.**

| Piece | What it does |
| ----- | ------------ |
| `fetch_attachment_text()` | Downloads over the authenticated `content` URL; HTML stripped to text; `.docx` unzipped via stdlib `zipfile` (no new dependency); failures recorded, never fatal |
| `fetch_attachments()` | Bounds the whole read with `ATTACHMENT_MAX_CHARS` / `ATTACHMENT_TOTAL_CHARS` / `ATTACHMENT_MAX_BYTES` |
| `attachment_text(payload)` | Concatenates readable text for downstream use |
| AC fallback | When the description has no criteria, the attachment text is searched — `ac_source: extracted_from_attachment` |
| Gap haystack | `gap_check._haystack()` now includes attachment text, so gaps are measured against real requirements |
| Both prompts | Scenario and case prompts carry an "ATTACHED REQUIREMENTS (authoritative)" block |
| Plan Overview | Attached requirements appear in §1.1; the header shows read status per file |
| UI | Ticket detail lists each attachment with a `read`/`error`/`skipped` pill and its character count |

**Result — the same ticket, before and after:**

| | Before | After |
| - | ------ | ----- |
| Gaps | 0 present · 1 ambiguous · **7 missing** | **5 present** · 1 ambiguous · 3 missing |
| Acceptance criteria | none | **extracted from the PRD** (`extracted_from_attachment`) |
| Attachments | filenames only | mockup **1 228 chars**, PRD **4 034 chars** read |
| Groq scenarios | (ran blind) | grid 4-per-row desktop / 2 tablet, breadcrumb, **Out of Stock disables the button**, quantity **defaults to 1 max 999**, search filters live, API failure shows error + retry |
| Traces | invented `AC: …` strings | **real references — `AC1`, `AC3`, `AC5`, `AC6`** |
| Priorities | all P1 | **P0 ×6, P1 ×3** |

The PRD also supplied concrete test data the mockup alone could not: SKUs `PRD-001…005`, prices, and the
stock states `In Stock` / `Low Stock` / `Out of Stock`.

⚠️ **Still true, and worth acting on:** the local `gemma-3-1b` remains weak — it emitted
*"User can add a product to cart with a valid quantity"* **five times** and traced everything to the
useless label `AC`. Groq's `openai/gpt-oss-120b` output is in a different league. **Set the provider
preference to Groq in Settings.**

**Verification:** smoke + pipeline + UI suites all pass; `unfilled tokens: none`; artifact grew to
17 587 chars with the attached requirements included. Also corrected: the AC-present gap statement said
"found in the ticket description" even when it came from an attachment.

**Not fixed (not selected):** the gap-severity gate, and `clarification_needed` still only being set on
the deterministic fallback path — so an LLM run on a genuinely empty ticket would still not flag its
inferences.

---

## Block 19 · T+200 — Evidence gate + trace validation shipped

Both deferred controls, built after Seema's constraint: **"my Jira tickets might not always contain
ACs, as they're all the examples I generated."** That constraint changed the design.

### 19.1 The gate is not keyed to acceptance criteria

Keying the gate to "has an AC section" would have blocked the most ordinary case of all — a ticket
with a good description and no formal criteria. The gate measures **requirement-bearing text** instead:
`description + criteria + attachments`, with placeholders counting as zero.

| Decision | Trigger | Behaviour |
| -------- | ------- | --------- |
| `refuse` | < 80 chars | No cases emitted; the approve button is disabled and states why |
| `constrain` | < 400 chars, or ≥ 5 missing gaps | Sparse-ticket mode: no invented values, `«not specified in ticket»` markers, **fewer cases rather than padded ones** |
| `ok` | otherwise | Normal generation |

Verified against five fixtures — including the case that matters most: **no ACs but a full description → `ok`**, not blocked.

### 19.2 Trace validation, and the hole it exposed

Traces are now resolved, not trusted: real gap id (and *unconfirmed* if that gap is missing or
ambiguous), a real AC reference, an explicit fallback marker, or **invalid**.

Building it surfaced a further hole in my own first attempt: `AC<n>` was being accepted by
**pattern**, never checked against the criteria that exist. A model could cite `AC9` on a document with
six criteria and it would pass. Now `known_ac_ids()` scans criteria **plus attachments plus
description** — necessary because the criteria extractor stops at the first block (on KAN-4 it returned
only `AC1`, while the attached PRD held `AC1…AC7`).

`AC9` and `AC99` → rejected. Bare `AC` → rejected. `AC: User can add an item to cart.` → rejected.
Prose-only AC sections → accepted, because an unverifiable reference must not flag every case.

### 19.3 Two defects found by running it, not by reading it

**E-16 — false positive: every real gap id reported as invented.** The pipeline test regressed with
`invented_traces: 8`. Cause: `build_cases(..., max_cases, gaps=None)` allowed a caller to omit the gap
analysis, so `known_gaps` was empty and `G-01`…`G-06` were all misclassified as fabricated. Two
fixes: `gaps` is now a **required** parameter of `build_cases` and `fallback_cases` (a skipped control
must be impossible, not quiet), and `resolve_trace` now *accepts* gap ids it cannot verify — the same
"cannot verify → accept" rule already used for ACs.

**E-17 — collapsing two severities into one verdict.** With `INVALID-TRACE` as a hard failure, a run
whose only defect was a bad trace column reported the whole file as broken. `validate_cases` now
separates **contract** failures (malformed file → `ok: false`) from **grounding** failures (unreliable
provenance → `grounding_ok: false`, reported and counted). The UI shows a green contract pill plus an
amber clarification pill plus a red invented-trace pill.

**E-18 — stale test assertion.** The UI test asserted "all guards passed", a pill I renamed to
"contract valid". Test updated, not the code.

### 19.4 Also tightened

The scenario prompt previously invited `trace: "AC"` — literally its example. That is now an explicit
rejection ("never write a bare AC"), and after the change the local model emits `AC1` instead of
`AC: User can add an item to cart.` The prompt was contributing to the defect.

One quality signal added without becoming a false-positive guard: when every case in a file traces to
the same reference, the case-file header notes that the trace column does not discriminate — the local
model produced 12 scenarios all on `AC1`.

**Verification:** smoke ✓ · pipeline ✓ · UI **28/28** ✓ · gate suite **5/5** ✓ · AC verification **8/8** ✓.
SOP 06 added; `LLM.md` gained invariants I-10/I-11 and the severity table.

---

## Block 20 · T+220 — KAN-1 clears the gate; a stale server caused the real failure

Seema asked whether KAN-1 could be tested at all, "as it's all only PRD without AC". Her screenshot
showed the gate panel reading **EVIDENCE: SUFFICIENT — 9294 characters of requirement text** and, below
it, a red error:

```
Failed to generate cases: build_cases() takes from 3 to 4 positional arguments but 5 were given
```

Two separate things, and the visible failure was not the one being asked about.

### 20.1 KAN-1 does not block — verified on the real ticket

```
description_text : 9294 chars        acceptance criteria : 0 chars (none_found)
attachment_text  : 0 chars           known AC ids        : (none)
gaps             : 6 present · 2 ambiguous · 2 missing
GATE             : ok — 9294 characters of requirement text, 2 missing gap(s)
                 : basis = the ticket description only (no formal acceptance criteria)
RESULT           : 8 scenarios, 7 cases via groq, real content (2FA happy path,
                   wrong OTP, SSO, email-format validation), 0 invented traces
```

This is precisely the case the gate was designed **not** to block. A 9 294-character PRD with no
formal criteria section is the tool's normal input. The design decision in Block 19 — measuring
requirement-bearing text instead of looking for an AC heading — is what makes this work.

One case was flagged (`clarify=True`), traced to `G-01`, the gap that records "no acceptance criteria".
That is the flag behaving correctly: the case rests on an unresolved gap.

### 20.2 The actual defect: a stale server, and my bad verification

`shell_tasks` showed **only `s6ilktug`** running — started at **14:25**, *before* the gate work. The
restart I issued at 14:57 (`s72vv9vn`, "Restart app with gate and trace validation") is not running and
its log is empty: **it never bound the port.**

Root cause, in two parts:

1. **Streamlit hot-reloads `app.py` but not imported modules.** So the running server had the *new* page
   code (hence the working gate panel and the basis line) calling the *old* `case_builder` module, whose
   `build_cases` took 3–4 positional arguments instead of 5. That arity error is the whole story.
2. **My verification was insufficient.** After starting `s72vv9vn` I checked `/health` and got `200 ok`
   — from the *stale* server already holding the port. **Health proves a listener, not a code version.**
   I reported a successful restart that had not happened.

**E-19 — fixes:**

| Fix | Detail |
| --- | ------ |
| Added a `build <hash>` stamp to the rail | Derived from the **live imported** signatures, not the files on disk. Hashing files would always look current — the disk *is* current while the module is not. Signatures come from the loaded objects, so they detect exactly this mismatch |
| Documented the restart rule | `architecture/README.md` "Operating note": after editing anything outside `app.py`, restart the server. Health checks cannot catch it |
| Corrected my verification method | New `.tmp/verify_fresh.py` compares the **listening process start time** against the **newest source mtime**, and prints the expected fingerprint. Also asserts the port is free and no strays remain before starting |
| Noted the blind spot | `AppTest` imports in-process, so `.tmp/ui_test.py` can **never** reproduce a stale-module failure. That is why 28/28 passing did not catch this |

**Verified fresh:** server started **20:50:59**, newest source edit **20:44:15** → FRESH. Expected build
`91ba0c68`, all signatures current. Port was confirmed free and no stray processes remained before the
restart. Smoke ✓ · pipeline ✓ · UI 28/28 ✓ · gate 5/5 ✓.

**Lesson recorded:** a passing health check after a restart is not evidence the restart worked. Compare
process start time against source mtime, or read the build stamp.

---

## Block 21 · T+240 — KAN-1 output reviewed: grounded, flags correct, coverage gap found

Seema asked "good now?" about `KAN-1_20260919-2055_Regression_Cases.md`. Reviewed it independently
rather than by eye (`.tmp/review_kan1.py`, `.tmp/recheck_bytes.py`).

### 21.1 Verdict — yes, and the verification is not a glance

| Check | Result |
| ----- | ------ |
| Header matches the 12-column contract **in order** | ✅ |
| Duplicate headers | ✅ none |
| Blank authored cells / filled execution cells | ✅ none / none |
| CSV bytes | ✅ UTF-8, no BOM, **CRLF**, 0 bare LFs |
| Traces resolve | ✅ `G-01`, `G-05`×2, `G-06`×3, `G-09` — all real ids, **0 invented** |
| Flags correct (independently recomputed) | ✅ **7/7 agree** |
| Content grounded in the PRD | ✅ valid login → session, wrong password → error and stay, real-time email validation + disabled button, Remember Me across browser restart, 2FA, Forgot Password token email, email auto-focus |

The flag now **discriminates** rather than blanket-flagging: only the case traced to `G-01` (the gap
recording "no acceptance criteria") carries `NEEDS CLARIFICATION`; the six traced to `present` gaps do
not. That is the behaviour Block 19 was aiming for.

### 21.2 A false alarm in my own review

My first byte check reported `CRLF line endings: False`. That was **my test being wrong, not the file**:
I wrote `b'\\r\\n'` inside an f-string, which is literal backslashes rather than CR/LF. Re-checked with
`bytes([0x0D, 0x0A])` → CRLF present, 0 bare LFs, both copies. Worth recording because the failure mode
is exactly the one this project exists to prevent: reporting a defect that the evidence does not support.

### 21.3 Two real findings, both fixed

**F-1 — grammar.** The Grounding line read *"1 rest on an unresolved gap"*. Now conjugated: `1 rests on`
/ `N rest on`.

**F-2 — a silent coverage gap.** The file carried **7 of the plan's 8 scenarios**; `S-06` had no case —
and it was the interesting one: *"Validate error handling when Single Sign-On integration is unavailable"*
(P2). An LLM told to prioritise P0 then P1 can legitimately drop a low-priority scenario, but dropping it
**silently** hides the gap. `write_case_files()` now takes the plan's scenario ids and appends:

```
Coverage: 6 of 9 plan scenario(s) have a case; S-07, S-08, S-09 are not covered
(generation prioritises P0, then P1)
```

Verified on a regeneration (that run produced 9 scenarios and left 3 uncovered — the counts vary per
run, which is itself worth knowing). `app.stage_cases` passes the scenario list.

### 21.4 Restarted, and the lesson applied

`emit_cases.py` changed, so the running server was stale by definition (E-19). Killed, restarted, and
verified with `.tmp/verify_fresh.py`: server started **20:59:03**, newest source edit **20:57:40** →
**FRESH**, build `5656a668`.

**Suites:** smoke ✓ · pipeline ✓ · UI 28/28 ✓ · gate 5/5 ✓ · coverage note verified ✓.

---

## Block 22 · T+250 — _next_

**Planned**
- Re-run KAN-1 in the browser; the rail should read build `5656a668` and the header should carry the
  Coverage note.
- **Deferred by Seema:** guaranteed scenario coverage across P0–P3 — recorded as **D-8** in
  `task_plan.md`, with the open design questions (taxonomy, enforcement model, weights, surfacing,
  interaction with `max_cases`). Current state: coverage is reported, not enforced; the contract has no
  P3 value; `fallback_cases` selects P0/P1 only.
- Still unverified: the visual design (no `agent-browser` on this machine).

**Error:** —

**Result:** —

---

## Running Error Register

| # | Block | Error / Symptom | Root cause | Action taken | Status |
| - | ----- | --------------- | ---------- | ------------ | ------ |
| E-1 | 10 | Jira `401` on `/rest/api/3/myself` | API token expired/revoked — proven by chapter_03's `config.json` holding the same token and failing identically | Surfaced as a readable message; **user must issue a new token** | 🔴 open (external) |
| E-2 | 10 | Local LLM connection refused (`WinError 10061`) | LM Studio not running on `:1234`; Groq key unset | Deterministic fallback; one-line reason logged | 🟡 open (external) |
| E-3 | 12 | `naming_ambiguity` reported twice (`VMO→VWO`, `VMO→vwo`) | Case-sensitive token comparison | Deduped on a case-insensitive signature | ✅ fixed |
| E-4 | 12 | Fallback derived only 2 weak scenarios | Line-level split; narrative user-story kept verbatim | Sentence split + narrative→testable conversion + requirement-verb filter → 4 scenarios | ✅ fixed |
| E-5 | 12 | `UnicodeEncodeError: '\u2713'` | cp1252 console cannot encode `✓` | Not an app bug (UI renders in-browser); re-ran with `PYTHONIOENCODING=utf-8` | ✅ test-only |
| E-6 | 13 | Provider error text ~400 chars in the UI | Raw `ConnectionPool` traceback passed through | `_summarise()` reduces it to a human sentence | ✅ fixed |
| E-7 | 13 | 10 × `use_container_width` deprecation warnings (removal date 2025-12-31 already passed) | Streamlit 1.64 renamed the parameter to `width` | Replaced `use_container_width=True/False` with `width="stretch"/"content"` (9 sites) | ✅ fixed |
| E-8 | 15 | **Circular expected results** — "Expected: Behaviour matches: \<scenario\>" | The fallback echoed the scenario text as its own expectation | New `_expectation()` with assertion-aware ordering | ✅ fixed |
| E-9 | 15 | **Broken grammar** — "Me should persist the session … persists as described" | The `remember` verb-map branch matched "Remember me …" and captured the wrong group | Modals/copulas are now treated as an existing assertion and used verbatim | ✅ fixed |
| E-10 | 15 | **Misleading status** — `Jira: ✅` and `Local LLM: ✅` shown while Jira returned 401 and LM Studio was down | Readiness checked only that a value was non-empty | Split **Configured** from **Reachable**; bare emoji replaced with worded pills | ✅ fixed |
| E-11 | 15 | **Plan looked like test cases** | Template used a 12-section shape that did not match the expected document, and only the scenario table was visible | Realigned to the 7-section STLC structure; made the document the hero tab | ✅ fixed |
| E-12 | 16 | Credentials in `.env.example` (un-ignored by `!.env.example`) | Wrong file — app reads `.env` | Migrated to gitignored `.env`; example reset to placeholders | ✅ fixed |
| E-13 | 16 | Groq `model_not_found` | `llama-3.3-70b-versatile` retired by Groq | `openai/gpt-oss-120b` verified and made the default | ✅ fixed |
| E-14 | 16 | `Test Groq` 404 looked like a bad key | `GROQ_MODELS_URL` + `_list_models` appended `/models` twice | Store `GROQ_BASE_URL` | ✅ fixed |
| E-15 | 16 | `.env` values silently ignored | Env applied only when the current value was falsy | Strict precedence: defaults < .env < config.json | ✅ fixed |
| E-16 | 19 | **Every real gap id reported as invented** (`invented_traces: 8`) | `gaps` was optional on `build_cases`, so `known_gaps` was empty | `gaps` now **required**; `resolve_trace` accepts unverifiable ids | ✅ fixed |
| E-17 | 19 | A bad trace column marked the whole file invalid | Contract and grounding failures shared one verdict | Severity split; UI shows both | ✅ fixed |
| E-18 | 19 | UI test asserted a pill label I had renamed | Stale test | Test updated | ✅ test-only |
| E-19 | 20 | **Stale server** — page code current, imported module old → `build_cases() takes from 3 to 4 positional arguments but 5 were given` | Streamlit hot-reloads `app.py` but **not** imported modules; and a restart that never bound the port went unnoticed because `/health` was answered by the stale process | Fresh restart; `build <hash>` stamp from live signatures; restart rule documented; `verify_fresh.py` compares process start vs source mtime | ✅ fixed |

## Running Decision Register

| # | Decision | Made in block | Status |
| - | -------- | ------------- | ------ |
| D-1 | Phase 5 (Trigger) missing from `BLAST.md` copy | 1 | ⬜ needs human |
| D-2 | Canonical Jira path (MCP / curl / Python) | 3 | ✅ **RESOLVED in 10** — Python `requests` |
| D-3 | Which suite consumes the `.csv` (column shape only) | 4–5 | 🟡 non-blocking — no code emission |
| D-4 | LLM provider (local / Groq / both) | 3 | ✅ **RESOLVED in 10** — local first, Groq fallback |
| D-5 | Interface (skill / Streamlit / CLI) | 6 | ✅ **RESOLVED in 13** — Streamlit 2-page app |
| D-6 | Test-case output format | 5 | ✅ **RESOLVED in 7** — `.md` + `.csv` |
| D-7 | Meaning of "regression creator" | 4 | ✅ **RESOLVED in 7** — generate E2E cases from the ticket |

### Contract decisions (from the supplied column list)

| # | Decision | Raised in block | Status |
| - | -------- | --------------- | ------ |
| C-1 / S-6 | Duplicate `Expected Result` / `Actual Result` headers — keep both pairs, delete the second, or design-vs-execution? | 8–9 | ✅ **RESOLVED in 9** — second pair deleted; final contract is **12 columns** |
| C-2 / S-7 | `Status` — emit blank, or pre-seed `Not Run`? | 8 | ⬜ needs human (depends on your importer) |
| C-3 / S-8 | `issue_key` has no column — append as a 13th, or rely on the `.md` header + manifest? | 8 | ⬜ needs human |
| C-4 | `trace` rides in `Misc (Comments)` (no trace column exists, yet I-6 requires it) | 8 | ✅ applied |
