# Job Tracker AI — MVP-First Build Prompt (v3)

> Supersedes `job-tracker-ai-build-prompt-v2.md`. This version keeps the same stack and architecture
> decisions as v2 but **gates the scope into phases so the app is useful from the very first phase** —
> Phase 0 is a complete, zero-AI job tracker. Paste this whole file as the opening prompt to a coding
> agent and work **one phase at a time**. Items marked `[DECIDE]` are open choices the agent must ask
> about rather than assume.

---

## 0. Operating rules for the agent

1. Do not invent product requirements. Where this spec is silent, ask — do not assume "typical" behaviour.
2. Do not invent SDK signatures, model names, or API response shapes. Read the installed package types.
3. Every LLM response the UI depends on must be schema-validated (Zod) before it touches state. Never render unvalidated model output as structured data.
4. Every AI feature must degrade gracefully with no API key configured: disabled state with a stated reason. Never a crash, never fabricated results.
5. **Never build ahead of the current phase.** Code the phase you are on, no more. The only cross-phase scaffolding allowed is (a) the IndexedDB migration pattern and (b) the LLM provider interface — both exist as thin, empty-ready structures from day one so later phases slot in without rework.
6. Build the phases in order in Section 5. Stop after each phase gate and report: what was built, what is stubbed, what is untested, what you assumed.

---

## 1. Product

A **local-first, single-page Job Tracker with an AI career copilot**. Single user. All data stays in the browser.

The loop the app must eventually support:

```
Save a JD  →  pick a resume version  →  AI match analysis (score + skill gaps)
           →  generate cover letter / follow-up emails / profile intro
           →  drag the card through the pipeline
           →  generate interview prep from that JD
```

Capability reference (do **not** copy its code, copy, or styling — match the capability set only):
`https://career-copilot-ai-eight.vercel.app`

It is a client-rendered SPA: sidebar navigation across views, a "Storage: Local browser only" badge,
light/dark toggle, and a Profile view. The dashboard/analytics look is the **Phase 5** target, not the
Phase 0 target.

---

## 2. Stack and hard constraints

- React 18+, functional components and hooks
- Vite build tooling
- Tailwind CSS — clean, minimal, Linear/Trello-minimal aesthetic
- **TypeScript, strict mode**, no `any` in domain code
- IndexedDB via the `idb` package — a single versioned DB with an explicit migration function per version bump
- Drag and drop via `@dnd-kit/core`
- Zod for schema validation of all forms and all LLM output
- Charts: Recharts (Phase 5 only)
- Resume parsing **in the browser**: `pdfjs-dist` for PDF, `mammoth` for DOCX (Phase 3 only)
- Responsive: usable on laptop and tablet
- **No backend, no auth, no database.** The only outbound network calls permitted are direct calls to the LLM provider the user configures. Everything else is local.

Libraries arrive with their phase — do not install a library before its phase (see Section 5).

---

## 3. Data model

Define Zod schemas first, derive TypeScript types from them (`z.infer`). Store each entity in its own
object store. **Only create the object stores the current phase uses.** The DB has one version counter;
every later phase adds stores via a migration function (`upgrade(db, oldVersion, newVersion)` handling
each step). Never drop a store on upgrade without migrating its data.

Phase 0 stores:

```ts
JobCard {
  id: string
  company: string            // required
  role: string               // required
  jobUrl?: string            // clickable, opens new tab
  dateApplied: string        // ISO date, auto-set on creation, editable
  salaryRange?: string       // free text, e.g. "₹25-30 LPA" or "$150-180K"
  notes?: string             // recruiter name, referral info, etc.
  status: 'wishlist'|'applied'|'followup'|'interview'|'offer'|'rejected'
  history: StatusEvent[]     // { from, to, at } appended on every column move
}

Settings { theme: 'light' | 'dark' }
```

Later phases add these entities (with their stores, via migration) — full definitions in v2 §3, trimmed
per phase in Section 5:

```ts
// Phase 1  — the AI career copilot core
MasterProfile  { id, name, headline, summary, contact, links,
                 experience: Role[], skills: Skill[], education[], certifications[] }
JobSpec        { id, jobCardId, requiredSkills: JDSkill[], preferredSkills: JDSkill[],
                 impliedSkills: JDSkill[], seniority, domain, responsibilities[],
                 hardFilters[], promptVersion, extractedAt }
MatchAnalysis  { id, resumeVersionId, jobCardId, overallScore, subScores,
                 matched: MatchedSkill[], missingBlocking[], missingCoverable[],
                 missingNiceToHave[], atsGapKeywords[], suggestedBullets[],
                 modelUsed, promptVersion, inputHash, createdAt }
Settings       + { provider, apiKey, model, baseUrl? }        // BYOK, stored in IndexedDB, never logged

// Phase 2
Artifact       { id, jobCardId, kind: 'coverLetter'|'followUp'|'dm'|'intro'|'screeningAnswer'|'prep',
                 variant?, content, edited: boolean, modelUsed, createdAt }

// Phase 3
ResumeVersion  { id, label, notes, isPrimary, fileName, fileBlob, rawText,
                 parsed: ParsedResume, createdAt }            // fileBlob stored; base64 on export

// Phase 4
Interview      { id, jobCardId, round, scheduledAt, interviewer?, format, outcome?, notes }
Reminder       { id, jobCardId, dueAt, kind, done }

// Phase 5
// Derived analytics — no store needed; computed from jobCards/matchAnalyses.
```

---

## 4. Standing rules (apply from the phase they arrive in)

1. **Grounding clause** — embed verbatim in every generation prompt (Phase 1+):

   > Use only facts present in the supplied profile and resume. If a claim cannot be supported by the supplied text, omit it. Never invent employers, dates, metrics, or certifications. Where a metric would strengthen the text but is absent from the source, insert the literal placeholder `[ADD METRIC]`.

2. **Deterministic scoring** — the LLM extracts and classifies; **the app computes the number** (Phase 1). Never ask a model for the score.

   ```ts
   matchScore = Math.round(
     0.45 * requiredSkillCoverage +
     0.20 * preferredSkillCoverage +
     0.15 * seniorityFit +
     0.10 * domainFit +
     0.10 * atsKeywordCoverage
   )
   ```

   Coverage = normalized set intersection of JD skills against resume skills. Synonym map
   (`js↔javascript`, `k8s↔kubernetes`, `playwright↔pw`, …) and the weight table live in one editable
   config file. Same inputs must always produce the same score — unit-test determinism.

3. **Cache every LLM result** keyed by `hash(resumeText + jdText + promptVersion + model)` in
   IndexedDB (Phase 1). Re-opening an analysis costs zero tokens and returns the identical result.

4. **Prompt discipline** (Phase 1): all prompts in `/src/lib/prompts/*.ts` as exported template
   functions, each exporting a `PROMPT_VERSION` constant stored on any record it produces. Structured
   calls demand JSON only (no prose, no markdown fences), temperature 0–0.3 for extraction, up to 0.7
   for cover letters and intros. Parse defensively: strip fences → `JSON.parse` in try/catch → Zod
   validate → on failure, retry **once** with the validation error appended → on second failure, show
   an explicit error. Never silently fall back to invented data.

5. **No secrets committed.** `.env.example` only. Keys are configured in Settings and stored in
   IndexedDB. Warn the user plainly that a key held in the browser is visible to anyone with access to
   the device or devtools.

6. **README + DECISIONS.md updated at every phase gate.**

7. **Tests mock the LLM provider. No test may hit a live API.**

---

## 5. Phases — build order, stop and report after each

### Phase 0 — Basic tracker (zero AI, zero API keys)

A complete, genuinely useful local job tracker. **No AI, no provider settings, no resume files.**

In scope:
- Scaffold: Vite + TS strict + Tailwind; Zod; `idb`; `@dnd-kit/core`.
- DB version 1: stores `jobCards`, `settings`; index `jobCards.status`; migration upgrade fn.
- Data model per Section 3 (Phase 0 slice): `JobCard` + `Settings`.
- Kanban, columns **Wishlist → Applied → Follow-up → Interview → Offer → Rejected**:
  - Drag-and-drop cards between columns (`@dnd-kit/core`); each move appends a `StatusEvent`.
  - Add job via slide-over form; edit via modal; delete with confirmation dialog.
  - Card face: company, role, **days since applied**, clickable job-URL icon, status left-border accent.
  - Column headers show live card counts; each column scrolls independently.
  - Search/filter by company or role; sort within a column by date applied (newest/oldest).
  - Forms validate required fields (company, role) via Zod before saving.
- Every CRUD operation persists to IndexedDB immediately — optimistic UI update, rollback on write failure.
- Light/dark mode toggle (Tailwind class strategy), persisted in `settings`.
- Persistent header badge: **"Storage: Local browser only"**; warn that clearing site data erases everything.
- Export/import all data as JSON `{ schemaVersion, exportedAt, jobCards, settings }`, Zod-validated on import.
- Tests: JobCard schema round-trip + invalid-status rejection; export/import validation; store CRUD against `fake-indexeddb`.

Out of scope until later: every AI feature, resume file parsing, `ResumeVersion`, JD text capture,
provider settings, analytics. Do not install pdfjs/mammoth/Recharts yet.

**Gate:** `npm run build` + `npm test` green; dev-server smoke test; report.

### Phase 1 — One JD · one resume · one score

The first AI slice. **A single master profile and a single pasted JD; no file uploads, no version library.**

In scope:
- Master Profile as an editable form (paste resume text or type structured content). No file parsing.
- Settings: provider config + key + **test-connection** button. Provider list in this order:
  1. **OpenAI-compatible (local)** — e.g. LM Studio at `http://localhost:1234`, key optional/`lm-studio`;
     zero-cost option, default when detected.
  2. OpenAI (and any OpenAI-compatible remote base URL).
  3. Gemini.
  4. Anthropic (browser-direct needs its `anthropic-dangerous-direct-browser-access` header — verify
     current docs before wiring; if a provider cannot be called from the browser, say so in the UI).
- LLM layer: `LLMProvider { complete<T>(prompt, schema), stream? }` interface with one working
  implementation (OpenAI-compatible local); others behind the same interface. Zod validation, one-retry
  discipline, and the llmCache store — all in place.
- JD capture: paste JD text onto any card → extract a **simplified JobSpec** (required skills only,
  each carrying a verbatim evidence snippet from the JD; a skill with no evidence is dropped). Preferred/
  implied skills, seniority, domain, hard filters: extract-but-hide or defer — do not build UI for them.
- Match engine (single resume version vs JD): deterministic score via Section 4 formula; matched skills
  with resume evidence; missing triaged **blocking / coverable / nice-to-have**; ATS keyword gap list.
  Start the synonym map small (~10 pairs).
- Progressive results UI not required; render the full result. "Regenerate" + model/timestamp on panels.
- `[DECIDE]` JD import by URL: out of scope by default (no backend → CORS). Ask before adding.

Out of scope: resume uploads/parsing, multiple versions, best-version recommendation ×N, sub-score
breakdown UI, streaming, bullet-rewrite diff.

**Gate:** local-provider end-to-end: profile → JD → match score rendered. Report.

### Phase 2 — Copilot outputs

- Generators (formal/standard cover letter; day-3/7/14 follow-up sequence; recruiter DM <300 chars),
  each grounded per Section 4 and stored as `Artifact` on the card. Editable, copyable, Regenerate.
- Out of scope: tone/length matrix beyond the defaults, reminders auto-creation, screening answers,
  profile-intro lengths, streaming.

### Phase 3 — Resume library

- Upload multiple `.pdf`/`.docx` resumes; parse text client-side (pdfjs-dist worker config under Vite,
  mammoth returns HTML — convert); store original blob in IndexedDB; re-downloadable.
- `ResumeVersion` label/notes/primary (exactly one primary, enforced in the write path); best match
  score achieved per version.
- Export/import upgraded to include resume blobs as base64.
- Out of scope: version-diff view.

### Phase 4 — Interviews & reminders

- Interviews view (rounds, scheduling, outcome) and Reminders (dueAt, done).
- Interview prep artifact per JD: topic-grouped questions, mark-as-practised.

### Phase 5 — Dashboard & polish

- Analytics dashboard to match the reference app: applications per week; response rate; interview
  conversion; average match % of responded vs ignored; **top recurring missing skills** across all
  analysed JDs ("skills to learn next" with JD counts).
- Best-version recommendation across the resume library; sub-score visuals; version-diff view; keyboard
  dnd sensor; synonym-map tuning; full E2E golden-path Playwright test
  (create profile → upload resume → add card with JD → run analysis → generate cover letter → drag card
  to Applied → export JSON).

---

## 6. Quality bar (per phase)

- Vitest unit tests for everything the phase ships: Phase 0 schemas/store/import; Phase 1 score
  determinism + skill normalization + Zod guards against malformed LLM output; later phases: resume
  parsing, migrations.
- Mock the LLM provider in all tests. No test may hit a live API.
- `tsc` strict clean; `npm run build` green.
- No secrets committed. `.env.example` only.

## 7. Non-goals (all phases)

Backend, accounts, multi-tenancy, job-board scraping, auto-apply, payments, browser extension, mobile
apps. Do not build these.

---

## 8. `[DECIDE]` items and open questions

- JD import by URL — out of scope by default (Section 5, Phase 1).
- Phase 1 default provider — OpenAI-compatible local (LM Studio) when reachable; ask which remote
  providers the user actually holds keys for before wiring them.
- Theme default — light, persisted after first toggle.
- Package manager — npm.
