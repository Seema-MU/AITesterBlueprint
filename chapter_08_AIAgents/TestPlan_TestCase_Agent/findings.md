# 🔎 findings.md — Research, Discoveries & Constraints

**Project:** `chapter_08_AIAgents/TestPlan_TestCase_Agent`
**B.L.A.S.T. step:** Protocol 0 — Research (feeds Phase 1 Discovery + Phase 2 Link)
**Written:** 2026-09-19 14:46 IST
**Method:** Read-only inspection of this repo. No live Jira call was made and no credentials were read or printed.

---

## 1. Executive Summary

The single most important finding: **this repo already contains a working Jira-driven test-plan pipeline.** We are not starting from zero.

| Capability we need | Already exists at | Reuse? |
| ------------------ | ----------------- | ------ |
| Talk to Jira (MCP) | `.mcp.json` + `.mcp/jira-launch.js` | ✅ Yes |
| Talk to Jira (shell) | `.commandcode/skills/testPlan_gen/scripts/fetch_jira.sh` | ✅ Yes |
| Talk to Jira (Python) | `chapter_03_Locat_TC_Gen/src/jira_client.py` | ✅ Yes — incl. ADF flattener |
| Ticket → test plan | `.commandcode/skills/testPlan_gen/SKILL.md` + template | ✅ Yes |
| Plan template | `chapter_02_PromptEng/promt_templates/STLC/testPlanTemplate.md` | ✅ Yes |
| Test-case template | `.../STLC/testCaseGenerator.md` | ✅ Yes |
| Real outputs to pattern-match | `TestPlans/SCRUM-1..3_Test_Plan.md` | ✅ Yes |
| Automation framework | `chapter_02_PromptEng/PlaywriteFramework/` (Playwright TS) | ✅ Yes |
| Second framework | `chapter_02_PromptEng/SaleniumFramework/` (Selenium Java) | ⚠️ Optional |
| Markdown → docx/pdf | `.commandcode/skills/testPlan_gen/scripts/md2docx.py` | ✅ Yes |

**Gap that is actually new:** the existing skill explicitly **stops before** test cases and automation ("Do not proceed to write test cases or automation until a human approves"). Our project's job is to build the **post-approval half**: reading the ticket and **generating its E2E regression test cases**, emitted as an `.md`/`.csv` file to be fed into the automation suite.

**✅ Definition confirmed by Seema, 2026-09-19:** *"by seeing the Jira ticket I should get the regression test cases (E2E) for that in a md/csv file which I can next feed to my automation suite."* This is **generation from the ticket**, not selection from an existing suite — which retires the earlier ambiguity (was Open Question #1, now closed). Note the consequence: **we do not emit runnable Playwright/Selenium code in v1.** The two existing frameworks in §5 remain relevant only as evidence for what *shape* the cases should take (journeys via a Page Object Model), not as build targets.

---

## 2. How a Jira Ticket Can Be Fetched — Three Working Paths

All three are already present and configured. `DQ/Open Decision D-2` asks which becomes canonical; the recommendation is **MCP first, Python as the deterministic fallback, `curl` for debugging.**

### Path A — Jira MCP server ⭐ recommended

`⌀ .mcp.json` (repo root) declares the server; `.mcp/jira-launch.js` boots it.

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": [".mcp/jira-launch.js"],
      "env": {}
    }
  }
}
```

The launcher's job is credential bridging — it reads `.commandcode/skills/testPlan_gen/.env` (gitignored, so **the token never lands in a committed file**) and maps our names onto the ones the package expects:

| Our variable (in `.env`) | Mapped to (package convention) |
| ------------------------ | ------------------------------ |
| `JIRA_BASE_URL` | `ATLASSIAN_SITE_NAME` (scheme + path + `.atlassian.net` stripped) |
| `JIRA_EMAIL` | `ATLASSIAN_USER_EMAIL` |
| `JIRA_TOKEN` | `ATLASSIAN_API_TOKEN` |

It requires `@aashari/mcp-server-atlassian-jira`, which **is already declared** in the root `package.json` (`^3.3.0`). If the token is missing it prints `[jira-mcp] WARNING: JIRA_TOKEN not found` and continues — so a silent "no tools" symptom usually means the env bridge failed.

- ✅ **Status of credentials:** all three keys **are present** in `.commandcode/skills/testPlan_gen/.env` (verified: file exists, 3 keys, values never read).
- ⚠️ **Not verified:** that the server actually completes its handshake in a live session. This is a **Phase 2 Link** task, not a finding — do not assume it works.

### Path B — `curl` (the existing script, verbatim)

`.commandcode/skills/testPlan_gen/scripts/fetch_jira.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
KEY="${1:?usage: fetch_jira.sh <ISSUE-KEY>}"
: "${JIRA_BASE_URL:?set JIRA_BASE_URL}"
: "${JIRA_EMAIL:?set JIRA_EMAIL}"
: "${JIRA_TOKEN:?set JIRA_TOKEN}"

curl -sS -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
  -H "Accept: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${KEY}?fields=summary,description,issuetype,priority,components,labels,fixVersions,issuelinks,attachment" \
| jq '{
    key: .key,
    summary: .fields.summary,
    type: .fields.issuetype.name,
    priority: .fields.priority.name,
    components: [.fields.components[]?.name],
    labels: .fields.labels,
    fixVersions: [.fields.fixVersions[]?.name],
    description: .fields.description,
    links: [.fields.issuelinks[]? | {type: .type.name, key: (.outwardIssue.key // .inwardIssue.key)}],
    attachments: [.fields.attachment[]? | .filename]
  }'
```

**Raw request without `jq`** (the minimum that works):

```bash
curl -sS -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json" \
  "$JIRA_BASE_URL/rest/api/3/issue/SCRUM-1?fields=summary,description,priority,labels"
```

**Windows/PowerShell equivalent** (this project runs on win32 — `jq` is not guaranteed):

```powershell
$pair  = "$env:JIRA_EMAIL`:$env:JIRA_TOKEN"
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$uri   = "$env:JIRA_BASE_URL/rest/api/3/issue/SCRUM-1?fields=summary,description,priority,labels"
Invoke-RestMethod -Uri $uri -Headers @{ Authorization = "Basic $basic"; Accept = "application/json" }
```

**Finding issues for a regression suite** (JQL search — needed for the "regression" half of the objective):

⚠️ **This originally documented `/rest/api/3/search`, which is now `410 Gone`.** Atlassian removed it
(verified live 2026-09-19: *"The requested API has been removed. Please migrate to the
/rest/api/3/search/jql API"*). The replacement also rejects **unbounded** JQL — *"Unbounded JQL queries
are not allowed here. Please add a search restriction"* — so a project or other restriction is mandatory:

```bash
curl -sS -u "$JIRA_EMAIL:$JIRA_TOKEN" -H "Accept: application/json" \
  --get "$JIRA_URL/rest/api/3/search/jql" \
  --data-urlencode 'jql=project = KAN order by created DESC' \
  --data-urlencode 'maxResults=50' \
  --data-urlencode 'fields=summary,status,priority,labels'
```

Our agent does not use JQL (it fetches a single issue by key), so no code depended on this — but the
snippet was wrong and is now corrected.

### Path C — Python `requests` (most reusable)

`chapter_03_Locat_TC_Gen/src/jira_client.py` is a compact, proven implementation. What it does that we need:

- **Endpoint:** `GET {base_url}/rest/api/3/issue/{issue_id}`
- **Auth:** HTTP Basic — `base64("{email}:{token}")` in the `Authorization` header, `Accept: application/json`
- **Timeout:** 15s (`API_TIMEOUT`) — copy this; unbounded calls will hang a Streamlit UI
- **Description is ADF, not text.** `_flatten_adf()` walks the Atlassian Document Format node tree, emits `\n` after block types (`paragraph`, `heading`, `bulletList`, `listItem`, `table`, `panel`, …), turns `inlineCard` into its URL, and `hardBreak` into a newline. **Without this, the "description" is an unusable dict of `type`/`content` nodes.**
- **Acceptance criteria extraction:** `ACCEPTANCE_CRITERIA_RE` looks for `acceptance criteria` / `definition of done` / `acceptance test`, then captures up to the next blank line, the next `Title:`-shaped heading, or end of text.
- **Sanitising:** strips Jira wiki markup `{...}`, collapses `*` emphasis and repeated whitespace, caps at `DESCRIPTION_MAX_CHARS = 6000` with an ellipsis.
- **Key extraction from free text:** `JIRA_ID_RE = \b([A-Z][A-Z0-9]+-\d+)\b`, with a bare-number fallback (`123` → issue `123`).
- **Error mapping:** `401` auth failed · `404` issue not found · other non-200 → HTTP code + reason, all raised as `JiraError` with user-readable text.

**Verdict:** port this file into `tools/fetch_ticket.py` rather than rewriting. It already solves the two hardest sub-problems (ADF flattening, AC extraction).

---

## 3. Jira REST API Notes (v3, Jira Cloud)

| Topic | Finding |
| ----- | ------- |
| Base path | `/rest/api/3/` — **v3 is the Cloud API**; v2 is Server/DC |
| Auth | Basic `email:api_token`. Tokens are created at id.atlassian.com; not the account password |
| Rich text | `fields.description` returns an **ADF document object**, not a string |
| `fields=` | Sparse fieldsets work and are the cheapest way to shrink the payload |
| Search | `/rest/api/3/search` — paginated: `startAt`, `maxResults`, `total`; requires paging for >`maxResults` |
| Attachments | Metadata (filename, content URL) comes back with the issue; the binary needs the authenticated `content` URL |
| Mockups | SCRUM-1 carried `image-20260812-132015.png` — in this pipeline attachments are a **requirement source**, so they must be captured, not dropped |
| Rate limits | Cloud returns `429` with `Retry-After` — must be honoured (not handled by the current script) |
| `jq` dependency | `fetch_jira.sh` requires `jq`; **PowerShell fallback needed on this machine** (win32) |

---

## 4. Existing Test-Plan Pipeline (patterns to copy)

`.commandcode/skills/testPlan_gen/SKILL.md` defines the workflow we should mirror:

1. **Fetch** the ticket — prefer MCP, else `fetch_jira.sh`, else **ask the user to paste it. Never invent ticket content.**
2. **Analyze for gaps** against `references/requirement-checklist.md`, marking every item ✅ present / ⚠️ ambiguous / ❌ missing → output a **"Gaps & Questions for the author"** section (called *the most valuable part*).
3. **Draft** the plan into `references/testPlanTemplate.md`, tagging each scenario **P0/P1/P2** by risk.
4. **STOP for human review** — a mandatory `--- HUMAN REVIEW GATE ---` block.

**Output naming convention (must follow):** `TestPlans/<JIRA-KEY>_<YYYYMMDD-HHMM>_Test_Plan.md` — the timestamp exists so **reruns never overwrite earlier drafts.** SCRUM-1 has no timestamp (it was the first draft and was later approved); SCRUM-2/3 do.

**Guardrails discovered — these are hard constraints, not suggestions:**
- Never mark the plan "final" — a human owns sign-off
- Never fabricate acceptance criteria — a missing AC is a **finding, not a blank to fill**
- Keep every scenario traceable to an AC or a gap
- **Never mention credentials in the test plan**
- **Never reveal PII** of the ticket creator
- **Fetch the ticket exactly once per session**; cache to scratchpad and reuse. Repeated re-reads of a large PRD are *the biggest token cost in this workflow* — start a fresh session per ticket

**Real evidence this works:** `TestPlans/SCRUM-1_Test_Plan.md` is a complete 12-section plan with 18 scenarios (S-01…S-18), a risk table, a traceability matrix, and a signed `HUMAN REVIEW GATE` ("APPROVED on 2026-08-19 by Seema"). Its **"Gaps & Questions"** section is the proof of concept for our gap-analysis layer — for SCRUM-1 it found *no acceptance criteria at all*, an undefined release scope, and a **"VMO.com" vs "VWO" typo that would have pointed tests at the wrong host.**

---

## 5. Test-Case & Automation Assets

**Test-case format** (`chapter_02_PromptEng/promt_templates/STLC/testCaseGenerator.md`):

```
| TID | Category | Description | Pre-conditions | Steps | Expected | Priority |
```

with categories *Functional · Negative · Boundary · Edge* and constraints **use only PRD content · no assumptions · mark unclear items "Needs clarification" · do NOT invent error messages or codes.**

**Automation frameworks already in the repo:**

| Framework | Location | Signals |
| --------- | -------- | ------- |
| **Playwright + TypeScript** ⭐ | `chapter_02_PromptEng/PlaywriteFramework/` | `playwright.config.ts`, `src/pages/login.page.ts` (Page Object), `src/tests/login.spec.ts`, pnpm lock |
| Selenium + Java | `chapter_02_PromptEng/SaleniumFramework/` | `pom.xml`, `src/test/java/.../pages/LoginPage.java`, `ValidLoginTest.java`, `InvalidLoginTest.java` |

The Playwright framework already uses a **Page Object Model** (`login.page.ts` + `login.spec.ts`) — generated regression cases should follow that shape, not emit loose browser calls.

⚠️ **Contradiction to resolve (feeds D-3):** the approved SCRUM-1 plan asserts *"existing repo framework: Selenium — see repo README"*, while the repo README is still an empty placeholder template. The test plan contains **assumptions that are not yet facts** — exactly the kind of unverified claim the human review gate is meant to catch. Confirm the real target before generating automation.

**JSON artefacts the repo already produces:** the root `package.json` also carries `docx` (`^9.7.1`), matching the markdown→docx/pdf export path (`md2docx.py` → `SCRUM-1_Test_Plan.docx` / `.pdf`).

---

## 6. Constraints & Environment

- **Platform:** Windows (win32). Bash scripts from the skill folder will not run as-is in PowerShell — budget for a Python-based fetch as the deterministic path.
- **Root `package.json`** is purely the MCP launcher + docx; it is **not** a JS app. Don't expect `npm test` to mean anything here.
- **`chapter_08_AIAgents/` is untracked** in git (`?? chapter_08_AIAgents/`) — nothing here is committed yet.
- The machine is running a **local LLM (LM Studio, `gemma3:1b`)** per `chapter_03`'s prompt; Groq is the documented fallback. A 1B model is weak at long structured output → prefer **template-filling + schema validation** over free-form generation, and keep prompts short by sending the cached ticket, not the raw API response.
- **`.tmp/` and `.env`** must be gitignored before any tool is written.

---

## 7. Open Questions Surfaced by this Research

1. ~~**"Regression creator" — generate new regression cases from the ticket, or select existing ones into a suite?**~~ **✅ CLOSED 2026-09-19:** generate **E2E regression cases from the ticket**, emit as `.md`/`.csv` for the automation suite. See §1.
2. Should the agent **write back** to Jira/Xray/Zephyr, or only emit files? *(Current draft: emit files only — the file is the hand-off.)*
3. One ticket per session (as the skill mandates) or batch?
4. ~~**What exactly is the CSV column contract the automation suite expects?**~~ **✅ CLOSED 2026-09-19 — Seema supplied the columns directly.** Adopted in `LLM.md` §3.5; the duplicate pair was then deleted on confirmation, giving a **final 12-column contract** (rev 0.4).
   **Three structural discoveries when reading that list:**
   - **The sheet doubles as an execution tracker.** Three of the 12 columns are *execution-time* (`Actual Result`, `Status`, `Executed QA Name`) and can only ever be **blank** — we generate cases, we do not run them. So "correct output" means **deliberately half-empty**, not "no empty cells": the validator must distinguish AUTHORED blanks from EXECUTION blanks or it will reject every *good* file.
   - **`Expected Result` and `Actual Result` each appeared twice.** Verified in the interpreter that `csv.DictReader` keeps only the **last** duplicate — the first pair's values vanished silently, no error raised. Confirmed as a copy-paste leftover; **the second pair is deleted**. This is the kind of defect that would have shipped as "missing data" with no traceable cause.
   - **No traceability column exists**, yet I-6 demands every case trace to an AC or gap. Resolution — `trace` rides inside `Misc (Comments)`, which would otherwise sit empty.
5. Is a Trigger phase required? The `BLAST.md` in this folder stops at Phase 4. (D-1)
6. `Prompt_Used.md` line 1 still says `chapter_07_AI_Agents` while the live prompt says `chapter_08_AIAgents/TestPlan_TestCase_Agent` — a stale copy-paste that contradicts the objective. **Worth correcting so the record is unambiguous.**

---

## 8. Traceability of These Findings

| Finding | Source |
| ------- | ------ |
| Protocol 0 = create 3 memory files, then halt | `BLAST.md` lines 7–24 |
| Ticket fetch via curl + field list | `.commandcode/skills/testPlan_gen/scripts/fetch_jira.sh` |
| ADF flattening + AC regex + 401/404 handling | `chapter_03_Locat_TC_Gen/src/jira_client.py` |
| MCP credential bridging | `.mcp/jira-launch.js`, `.mcp.json`, root `package.json` |
| Gap-analysis + review-gate workflow | `.commandcode/skills/testPlan_gen/SKILL.md` |
| 12-section plan shape, 18 scenarios, gaps output | `TestPlans/SCRUM-1_Test_Plan.md` |
| Case table format + "don't invent" rules | `chapter_02_PromptEng/promt_templates/STLC/testCaseGenerator.md` |
| Playwright/Selenium existence | `chapter_02_PromptEng/{PlaywriteFramework,SaleniumFramework}/` |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_TOKEN` configured | `.commandcode/skills/testPlan_gen/.env` (key names only) |

---

## 11. Live Credentials — Verification Round (2026-09-19, later)

Seema added Jira and Groq details and asked whether they were correct. Four findings, one of which
was a bug in our own code.

### 11.1 The values were in the wrong file — and that file is committable

The credentials were written into **`.env.example`**, not `.env`. `.env.example` is the committed
template, and the repository's root `.gitignore` line 36 carries `!.env.example`, a **negation rule
that re-includes it for commit** — so real credentials sitting there were one `git add` away from
landing in git history. (Nothing was committed: the whole `chapter_08_AIAgents/` tree is still
untracked, `?? chapter_08_AIAgents/`.)

**Action taken:** real values migrated into `.env` (which *is* gitignored, verified with
`git check-ignore -v` → `chapter_08_AIAgents/TestPlan_TestCase_Agent/.gitignore:5:.env`), and
`.env.example` reset to placeholders. Migration was scripted so no secret was printed.

### 11.2 Both credentials are valid — after two fixes

| | Verdict |
| - | ------- |
| **Jira** | ✅ **PASS — connected as `<your-display-name>`** (site `<your-site>.atlassian.net`) |
| **Groq** | ✅ **PASS — key valid**, but the model was wrong (below) |
| **Local LLM** | ✅ **PASS — LM Studio is now up**, `google/gemma-3-1b`, 2 models exposed |

**a) The Groq model was retired.** `.env` named `llama-3.3-70b-versatile`; Groq returns
`model_not_found`. Live `/openai/v1/models` for this key lists 13 models; the usable chat models are
`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `groq/compound(-mini)`, `allam-2-7b`.
`openai/gpt-oss-120b` was verified working and is now the default in both `.env` and
`llm_client.DEFAULT_GROQ_MODEL`.

**b) Our own bug: `test_groq_connection` built the wrong URL.** `GROQ_MODELS_URL` already ended in
`/models`, and `_list_models()` appends `/models` again → `/openai/v1/models/models` → 404. The key
looked invalid when it was fine. Fixed by storing `GROQ_BASE_URL` instead.

**c) Our own bug: `.env` values were silently ignored.** `load_settings()` applied env values only
when the current value was **falsy**, so every key with a non-empty default (`groq_model`,
`local_llm_url`, `local_llm_model`, `output_dir`) kept the default and discarded the real `.env`
entry. This is why the retired model survived the first round of fixes. Precedence is now strict and
documented: **defaults < .env < config.json**.

### 11.3 The new Jira site is the right one for this project

`SCRUM-1` returns 404 there (it lives on the old `<old-site>` site). Projects visible:
`KAN` (AGILEQA) and `SAM1` (Billing System Dev). **`KAN` is the useful one** — KAN-22…KAN-27 are
`VWO-R3…VWO-R8` feature tickets, i.e. exactly the release-shaped input this agent is built for.

KAN-27 was used to prove the live path end to end: 2 220-char description, **acceptance criteria
found**, 9 gaps, and model-authored output — e.g. *"Admin attempts to connect Google Analytics with
invalid credentials" → "Connection is rejected, a clear error message is displayed, and no
integration is saved"*, traced to `AC2`.

### 11.4 Still stale, left alone deliberately

- The **repo-level** `.env` at `.commandcode/skills/testPlan_gen/.env` still holds the expired
  `<old-site>` token. Our project `.env` now takes precedence, so it no longer interferes. Deleting
  someone else's file was not mine to do.
- `.env` sets `JIRA_PROJECT_KEY=KAN`; our agent does not read it (it takes an issue key from the
  prompt). Harmless, but it is unused.

---

## 12. Attachments Carry The Requirements (KAN-4, 2026-09-19)

The most consequential finding so far, because the output *looked* fine.

### 12.1 The shape of the failure

KAN-4 returned a mechanically valid case file — 12 columns, right order, execution cells empty, all
seven guards green. Its content was invented. The table below is the whole reason:

| KAN-4 field | Value |
| ----------- | ----- |
| summary | `add items to cart page` |
| **description** | **0 characters** |
| acceptance criteria | none |
| components / labels | none |
| gaps | 0 present · 1 ambiguous · **7 missing** |
| attachments | `add_to_cart_page_mockup (1).html`, **`sample_prd_add_to_cart (1).md`** |

The requirements were in the attachments. We stored their filenames and never opened them, so the model
had five words and a request for ten cases — and it resolved that tension by inventing eight
"valid X" variations (discount code, payment method, shipping address, email, phone, credit card, gift
card, coupon). Every one is absent from the ticket, and all are checkout concerns on an add-to-cart page.

### 12.2 The tell we nearly missed

The traces read `trace: AC: User can add an item to cart.` — an **invented acceptance criterion
presented as provenance**. That is worse than an empty field: a reviewer reading the trace column would
reasonably conclude the ticket contained those criteria. I-6 exists precisely to prevent this, and it
was satisfied vacuously because the model supplied the strings.

### 12.3 Provider quality is not a detail

Same ticket, same code, same prompt, two providers:

| | `google/gemma-3-1b` (local) | `openai/gpt-oss-120b` (Groq) |
| - | --- | --- |
| traces | 10 fabricated `AC: …` strings | real ids: `AC1`, `AC3`, `AC5`, `AC6`, `G-01`… |
| duplicates | *"…with a valid quantity"* emitted **5 times** | none |
| priorities | flat, uninformative | P0 ×6, P1 ×3 |
| grounding | generic | grid 4-per-row desktop / 2 tablet, breadcrumb, Out of Stock disables the button, quantity defaults to 1 max 999 |

A 1B model pads to satisfy a requested count. **Default to Groq for this workload.**

### 12.4 What "reading attachments" actually required

Nothing exotic: the ticket payload already carried each attachment's authenticated `content` URL. The
work was downloading it, reducing it to text, bounding it, and — the part that matters — **using it in
four places rather than one**:

1. **Acceptance-criteria extraction**, when the description has none → `extracted_from_attachment`.
2. **The gap haystack**, so gaps are measured against the real requirements rather than a title.
   This alone moved KAN-4 from `0 present / 7 missing` to `5 present / 3 missing`.
3. **Both LLM prompts**, as an explicitly authoritative block.
4. **The plan's Overview**, so a reviewer sees what the model saw.

Reducing it to text also produced the test data the ticket never had: SKUs `PRD-001…005`, prices, and the
stock states `In Stock` / `Low Stock` / `Out of Stock`, straight from the HTML mockup.

### 12.5 The general lesson

**A ticket's requirements are wherever the ticket says they are — not only in `description`.** The gap
analysis was working correctly throughout: it truthfully reported 7 missing items. The pipeline simply
never gave it the material, and then let generation proceed anyway. Reading attachments fixed the input;
gating on gap severity (still open) would have stopped the bad output at the source.

---

## 13. Measuring Is Not Controlling (2026-09-19)

### 13.1 The structural gap, not the content gap

KAN-4's bad output had two independent causes. §12 fixed the first (the requirements were unread in an
attachment). The second was structural and would have survived any amount of better input:

```
generate_scenarios(settings, ticket, gaps)           # gaps in
build_cases(settings, ticket, scenarios, max_cases)  # gaps absent
```

The step that **writes** the deliverable could not see the gap analysis at all. So the pipeline
measured 7 missing items, printed them in the plan, and generated anyway. Every component did its job;
no component was responsible for the decision.

> **A measurement that nothing consumes is not a control.** It is a report.

That is now invariant I-11, enforced by `tools/gate.py` (SOP 06).

### 13.2 Why the threshold is not "has acceptance criteria"

The obvious gate — refuse when the ticket has no ACs — would have been wrong, and Seema said so
directly: *"my Jira tickets might not always contain ACs, as they're all the examples I generated."*

A tester routinely writes cases from a good description with no formal criteria section. Gating on ACs
would block the most ordinary input the tool receives, in order to prevent a failure that only occurs
when the ticket is thin *in total*. So the gate measures **requirement-bearing text** across
description, criteria and attachments. Verified: a 752-character description with no ACs passes; a
20-character one is refused. Same ticket style, opposite verdicts, decided by evidence rather than
by the presence of a heading.

### 13.3 Provenance that cannot be checked is not provenance

I-6 ("every case traces to an AC or a gap id") was satisfied **vacuously** on KAN-4: the model supplied
the strings. `trace: AC: User can add an item to cart.` is a sentence the model wrote, formatted to look
like a reference. A reviewer reading that column would conclude the ticket contained those criteria.

Two rounds of hardening were needed. The first resolved traces against known ids — and immediately
exposed a second hole: an `AC<n>` reference was accepted by **pattern**, so `AC9` on a six-criteria
document would have passed. References are now checked against the ids that actually exist, gathered
from criteria **plus attachments plus description** — necessary, because the criteria extractor stops at
the first block (KAN-4's criteria field yielded only `AC1` while the attached PRD held `AC1…AC7`).

**The governing rule is asymmetric on purpose:** verify when we can, accept when we cannot. A prose-only
AC section must not flag every case as fabricated, so an unverifiable `ACn` is accepted. False
accusations of invention are as damaging as missed ones.

### 13.4 The prompt was part of the defect

The scenario prompt's own example read:

```
"trace" - "AC" if derived from acceptance criteria, otherwise a gap id such as "G-03"
```

We were instructing the model to emit a bare `AC` — precisely the token we would later call invalid.
The prompt and the validator disagreed. After tightening it ("never write a bare AC"), the same local
model emitted `AC1`. **A rule enforced only in validation, while the prompt invites the violation, is
not enforced.**

### 13.5 One failure is not the other

Making an invented trace a hard failure broke a well-formed file: one unreliable column turned the whole
deliverable into "invalid". Both are real failures but they are not the same failure:

| | Contract | Grounding |
| - | -------- | --------- |
| What broke | the file's shape | a case's provenance |
| Example | header drift, blank authored cell, filled execution cell | `trace: AC: …` |
| Effect | unusable | usable, but the case may rest on nothing |

They are now reported separately. The UI shows a green *contract valid* pill and, next to it, an amber
*needs clarification* pill and a red *invented trace* pill — so a good file with one bad column reads as
exactly that, instead of as a broken artifact.

Seema named the reference artefact: `chapter_02_PromptEng/vwo-test-plan-draft.md` (= `VWOTestPlan.docx`).

**Finding: our template did not match it.** We had invented a 12-section shape; the expected document
follows the **7-section STLC structure** from `chapter_02_PromptEng/promt_templates/STLC/testPlanTemplate.md`
— which the repo already ships. The expected document is the house standard, so **it wins** (same
principle as the 12-column contract: when an artefact of record exists, adopt it rather than invent).

| Expected document | Our template (before) | Now |
| --- | --- | --- |
| 7 top-level sections, STLC | 12 top-level sections, bespoke | **7 sections, STLC** |
| `Needs clarification` for unknowns | ad-hoc wording | **same vocabulary** |
| `Inference (low confidence)` where inferred | absent | used where priorities are inferred |
| Overview / Objectives / Scope / Platforms / Non-Functional / Out of Scope under §1 | spread across §1–§3 | consolidated under §1 |
| Risk table + prioritization §2 | §3 | **§2** |
| Strategy + Coverage Mapping §3 | §4–§5 | **§3** |
| Environment + Data + **Automation** §4 | §6–§7 | **§4** |
| Defect Management §5 | §8 | **§5** |
| Entry/Exit + **Release Recommendation** §6 | §9 + §12 | **§6** |
| Resources / Dependencies / Deliverables §7 | §10–§11 | **§7** |

**Second finding — why it read as test cases.** The app showed *only* the scenario table for stage 2,
and each row's expected result was the scenario text echoed back (`Behaviour matches: …`). A grid of
circular one-liners is indistinguishable from a test-case list. Fixed by making the full document the
primary surface and de-circularising expectations.

**Third finding — the expected document models the honesty we want.** It marks unknowns explicitly
(`Needs clarification`, `Inference (low confidence)`) rather than filling them in. That is exactly
invariant I-4, and it is now mirrored in our template and in the `NEEDS CLARIFICATION` markers that
ride in `Misc (Comments)` when a ticket has no acceptance criteria.

**Unresolved:** the expected document lists browsers/OS/devices and QA metrics; those remain
`Needs clarification` in our output because the ticket does not carry them. Confirming whether the
agent should propose a default matrix (as the expected document does, flagged as inference) or leave
them blank is open.

**Method:** real `GET /rest/api/3/myself` against the seeded credentials, plus an LLM endpoint probe. No secret was printed at any point (see `.tmp/diag_jira.py`).

### 9.1 The Jira API token is rejected — `401`

| Check | Result | Verdict |
| ----- | ------ | ------- |
| `jira_url` | `https://<old-site>.atlassian.net` | ✅ valid, ends `.atlassian.net`, no stray path |
| `jira_email` | `se***@gmail.com` | ✅ well-formed, no whitespace |
| token shape | 192 chars, prefix `ATATT3` | ✅ the correct Atlassian token format |
| `GET /myself` | `401 Client must be authenticated to access this resource.` | ❌ rejected |

**The decisive evidence:** `chapter_03_Locat_TC_Gen/src/config.json` — the *pre-existing* app — stores **the same token** and fails **identically**. A working app that is also locked out means the credential died, not the code.

⇒ **Root cause: the API token is expired or revoked.** Remedy: generate a new one at id.atlassian.com → Security → API tokens, then paste it into the app's Settings page and press **Test Jira**. Expected message: `OK — connected as <name>`.

### 9.2 No LLM provider is currently reachable

| Provider | State |
| -------- | ----- |
| Local (LM Studio) | ❌ `http://localhost:1234/v1` → `WinError 10061`, connection actively refused — **LM Studio is not running** |
| Groq | ❌ no API key configured |

### 9.3 Consequence — and why it does not block anything

The design anticipated exactly this. `planner.generate_scenarios()` and `case_builder.build_cases()` both catch a dead provider and fall back to deterministic derivation, so a complete, traceable, contract-valid case file is still produced. Verified: **7 scenarios → 7 cases**, all 7 guards green, on the sample ticket.

Two things this proves that a happy-path run would not:
- A dead provider is a **content** problem, not a **plumbing** one — so it degrades instead of halting (matching the rule in `LLM.md` §6).
- The deterministic layer carries the pipeline alone. The LLM is an enhancement, not a dependency.

⚠️ **Honest limitation:** the fallback cases are generic ("Exercise the requirement: …"). They are valid and traceable, but a real LLM (or a human) produces materially better steps. The LLM-authored path remains **unverified against a live model** until one is reachable.

### 9.4 Environment findings

- Python 3.12.10; a project-local `.venv` was created (mirroring chapter_03) holding `streamlit 1.64.0`, `pandas 3.0.6`, `requests 2.34.2`.
- The console is **cp1252** — non-ASCII in `print()` raises `UnicodeEncodeError`. Irrelevant to the Streamlit UI (browser-rendered) but it means **CLI scripts must set `PYTHONIOENCODING=utf-8`**. All file writes specify `encoding="utf-8"` explicitly.
- `chapter_03`'s `.venv` is separate; the new project does not share or depend on it.

### 9.5 Implementation findings

- **Chapter_03's `parse_table` cannot be reused.** It hardcodes `expected_columns=6` and infers headers from the model output. Our contract is a fixed 12 columns, so header handling had to become deterministic (`tools/contract.py`) — which is also what makes `CONTRACT-DRIFT` checkable.
- **The `Misc (Comments)` column solved a real problem.** The supplied contract has no traceability column, yet I-6 requires every case to trace to an AC or gap id. Folding `trace` into `Misc` preserved the invariant without adding a column.
- **Two defects were only found by running it** (duplicate gap findings; a 2-scenario fallback). Neither was visible from reading the code — a reminder that the smoke test earns its place.
