# Job Tracker AI — Advanced Build Prompt (v2)

> Supersedes `job-tracker-ai-build-prompt.md`. This version is built on the stack you already chose
> (Vite SPA + IndexedDB + Tailwind + dnd-kit, local-first, no backend) instead of proposing a new one.
> Paste this whole file as the opening prompt to a coding agent. Items marked `[DECIDE]` are open choices
> the agent must ask about rather than assume.

---

## 0. Operating rules for the agent

You are a senior full-stack engineer. For this entire session:

1. Do not invent product requirements. Where this spec is silent, ask — do not assume "typical" behaviour.
2. Do not invent SDK signatures, model names, or API response shapes. Read the installed package types.
3. Every LLM response the UI depends on must be schema-validated (Zod) before it touches state. Never render unvalidated model output as structured data.
4. Every AI feature must degrade gracefully with no API key configured: disabled state with a stated reason. Never a crash, never fabricated results.
5. Build in the order in Section 14. Stop after each milestone and report: what was built, what is stubbed, what is untested, what you assumed.

---

## 1. Product

A **local-first, single-page Job Tracker with an AI career copilot**. Single user. All data stays in the browser.

The loop the app must support:

```
Save a JD  →  pick a resume version  →  AI match analysis (score + skill gaps)
           →  generate cover letter / follow-up emails / profile intro
           →  drag the card through the pipeline
           →  generate interview prep from that JD
```

Capability reference (do **not** copy its code, copy, or styling — match the capability set only):
`https://career-copilot-ai-eight.vercel.app`

---

## 2. Stack and hard constraints

- React 18+, functional components and hooks
- Vite build tooling
- Tailwind CSS — clean, minimal, Linear/Trello-minimal aesthetic
- **TypeScript, strict mode**, no `any` in domain code
- IndexedDB via the `idb` package — a single versioned DB with an explicit migration function per version bump
- Drag and drop via `@dnd-kit/core`
- Zod for schema validation of all forms and all LLM output
- Resume parsing **in the browser**: `pdfjs-dist` for PDF, `mammoth` for DOCX
- Charts: Recharts
- Responsive: usable on laptop and tablet
- **No backend, no auth, no database.** The only outbound network calls permitted are direct calls to the LLM provider the user configures. Everything else is local.

---

## 3. Data model

Define Zod schemas first, derive TypeScript types from them (`z.infer`). Store each entity in its own object store.

### 3.1 JobCard (extends the base card)

```ts
JobCard {
  id: string
  company: string            // required
  role: string               // required
  jobUrl?: string            // LinkedIn or other job URL, rendered clickable
  resumeVersionId?: string   // FK → ResumeVersion, replaces the free-text "resume used"
  dateApplied: string        // auto-set on creation, editable
  salaryRange?: string       // free text, e.g. "₹25-30 LPA" or "$150-180K"
  notes?: string             // recruiter name, referral info, etc.
  status: 'wishlist'|'applied'|'followup'|'interview'|'offer'|'rejected'
  // --- AI additions ---
  jdRawText?: string
  jdSpecId?: string          // FK → JobSpec
  latestMatchId?: string     // FK → MatchAnalysis
  matchScore?: number        // denormalized 0-100 for fast card render
  nextActionAt?: string
  history: StatusEvent[]     // { from, to, at } appended on every column move
}
```

Keep a **resume-name dropdown** as the base spec asked, but source it from stored `ResumeVersion` records rather than free text. Migrate any legacy free-text value into a placeholder `ResumeVersion` on DB upgrade.

### 3.2 New entities

```ts
MasterProfile  { id, name, headline, summary, contact, links,
                 experience: Role[], skills: Skill[], education[], certifications[] }

ResumeVersion  { id, label, notes, isPrimary, fileName, fileBlob, rawText,
                 parsed: ParsedResume, createdAt }
// label is the version tag: "SDE_Resume_v3", "QA_Lead_Resume"
// Exactly one isPrimary at a time — enforce in the write path, not just the UI

ParsedResume   { skills: Skill[], roles: Role[], education[], certifications[], totalYears }
Skill          { name, normalized, category, years?, proficiency?, evidence: string[] }

JobSpec        { id, jobCardId, requiredSkills: JDSkill[], preferredSkills: JDSkill[],
                 impliedSkills: JDSkill[], seniority, domain, responsibilities[],
                 hardFilters[], promptVersion, extractedAt }
JDSkill        { name, normalized, importance: 'required'|'preferred'|'implied',
                 evidence: string }   // evidence = verbatim snippet from the JD

MatchAnalysis  { id, resumeVersionId, jobCardId, overallScore, subScores,
                 matched: MatchedSkill[], missingBlocking[], missingCoverable[],
                 missingNiceToHave[], atsGapKeywords[], suggestedBullets[],
                 modelUsed, promptVersion, inputHash, createdAt }

Artifact       { id, jobCardId, kind: 'coverLetter'|'followUp'|'dm'|'intro'|'screeningAnswer'|'prep',
                 variant?, content, edited: boolean, modelUsed, createdAt }

Interview      { id, jobCardId, round, scheduledAt, interviewer?, format, outcome?, notes }
Reminder       { id, jobCardId, dueAt, kind, done }
```

---

## 4. Kanban pipeline (base behaviour, kept in full)

Columns, in order: **Wishlist → Applied → Follow-up → Interview → Offer → Rejected**.

- Drag and drop cards between columns via `@dnd-kit/core`; each move appends a `StatusEvent` to `history`.
- Add a job via a slide-over form; edit via modal; delete with a confirmation dialog.
- Card face shows: company, role, resume version tag, **days since applied**, match % badge (when analysed), and a clickable job-URL icon.
- Column headers show live card counts.
- Search/filter bar: by company or role. Extend with filters for status, resume version, and match-% range.
- Sort within a column by date applied (newest / oldest) and by match %.
- Every CRUD operation persists to IndexedDB immediately — optimistic UI update, rollback on write failure.
- Each column scrolls independently. Cards carry a left-border accent colour per status.
- Forms validate required fields (company, role) via Zod before saving.

---

## 5. Resume version management

- Upload multiple `.pdf` / `.docx` resumes; parse text client-side; store the original blob in IndexedDB so the file can be re-downloaded.
- Each version has a **label** (version tag) and free-text notes; one version is **primary** and is the default for matching.
- After upload, run AI parsing to extract structured skills, tools, per-skill years, roles, education, certifications — each skill carrying the resume line that evidences it.
- Resume list shows: label, upload date, parsed skill count, primary badge, and best match score achieved against any stored JD.
- **Version diff view**: pick any two versions → added skills, removed skills, and changed bullet phrasing side by side.

---

## 6. Job description intelligence

- Paste JD text onto any card (Wishlist cards especially — analyse before applying).
- AI extracts a structured `JobSpec`: required / preferred / implied skills, seniority, domain, responsibilities, hard filters (years, location, work authorisation).
- **Every extracted skill must carry a verbatim evidence snippet from the JD.** A skill with no evidence snippet is dropped, not displayed.
- `[DECIDE]` JD import by URL: out of scope by default, since a no-backend SPA cannot fetch arbitrary pages without CORS proxying. Ask before adding it.

---

## 7. Match engine — the core screen

For a `(ResumeVersion, JobCard)` pair, produce:

- **Overall match %** — one 0–100 integer.
- **Sub-scores** — hard skills, tools/frameworks, domain fit, seniority fit, ATS keyword coverage.
- **Matched skills** — each with the resume evidence line that proves it.
- **Missing skills**, triaged:
  - **Blocking** — explicitly required, absent from the resume
  - **Coverable** — adjacent or transferable; name the existing resume skill that is adjacent
  - **Nice-to-have** — preferred/implied only
- **ATS keyword gap** — literal JD keywords absent from the resume text.
- **Best-version recommendation** — run the analysis across all stored resume versions and say which scores highest for this JD, and why.
- **Improvement diff** — rewritten resume bullets that close the gaps, before/after. Rewrites may only use experience already present in the resume or master profile.

### 7.1 Scoring must be deterministic

The LLM extracts and classifies. **The app computes the number.** Never ask a model for the score.

```ts
matchScore = Math.round(
  0.45 * requiredSkillCoverage +
  0.20 * preferredSkillCoverage +
  0.15 * seniorityFit +
  0.10 * domainFit +
  0.10 * atsKeywordCoverage
)
```

- Coverage = normalized set intersection of JD skills against resume skills.
- Maintain a **synonym map** (`js↔javascript`, `k8s↔kubernetes`, `RTL↔react testing library`, `playwright↔pw`) and normalize both sides before intersecting. Keep it in an editable config file.
- Put the weight table in the same config file so it is tunable without touching logic.
- Same inputs must always produce the same score. Write unit tests that assert this.

---

## 8. Generation suite

Each generator takes: master profile + selected resume version + JD + tone, and returns editable, copyable, versioned output stored as an `Artifact` on the card.

- **Cover letter** — tone `formal | conversational | direct`; length `short (~150w) | standard (~300w)`. Must reference at least two concrete achievements from the resume, with numbers where the resume has them.
- **Follow-up email sequence** — day 3 (post-apply nudge), day 7 (value-add), day 14 (final check-in), plus a post-interview thank-you. Each with subject line and body. Generating the sequence offers to create matching `Reminder` records — user confirms, never auto-created silently.
- **Recruiter DM / LinkedIn note** — under 300 characters.
- **Profile intro / About me** — three lengths from the master profile: one-line headline, ~50-word elevator pitch, ~150-word bio. Reusable across all applications, editable, stored on the profile rather than per-card.
- **Screening answers** — "why this role", notice period, salary framing — grounded only in profile data.

**Grounding clause to embed verbatim in every generation prompt:**

> Use only facts present in the supplied profile and resume. If a claim cannot be supported by the supplied text, omit it. Never invent employers, dates, metrics, or certifications. Where a metric would strengthen the text but is absent from the source, insert the literal placeholder `[ADD METRIC]`.

---

## 9. Interview prep

Select any card → generate role-specific technical questions, answer key points, and a study-topic list, derived from that card's JD plus the master profile. Store as an `Artifact` of kind `prep`. Group questions by topic; let the user mark each as practised.

---

## 10. Analytics

Applications per week; response rate; interview conversion rate; average match % of responded vs ignored applications; and — most valuable — **top recurring missing skills across all analysed JDs**, surfaced as "skills to learn next" with a count of how many JDs demanded each.

---

## 11. LLM provider layer

- **Bring-your-own-key**, configured in Settings, stored in IndexedDB, never logged, never bundled.
- Provider-agnostic interface behind one abstraction:

```ts
interface LLMProvider {
  complete<T>(prompt: PromptTemplate, schema: z.ZodType<T>): Promise<T>
  stream(prompt: PromptTemplate): AsyncIterable<string>
}
```

- Implement for Anthropic, OpenAI, and Google Gemini. Selectable in Settings with a "test connection" button.
- **Browser-direct calls need per-provider opt-in flags/headers, and CORS behaviour differs by provider. Read each provider's current browser-usage documentation before writing the client — do not guess the header or flag names.** If a provider cannot be called from the browser, say so in the UI rather than failing silently.
- Warn the user plainly in Settings that a key held in the browser is visible to anyone with access to the device or devtools.

### 11.1 Prompt discipline

- All prompts live in `/src/lib/prompts/*.ts` as exported template functions. Never inline in components.
- Every prompt exports a `PROMPT_VERSION` constant, stored on any record it produces.
- Structured calls: demand JSON only (no prose, no markdown fences), temperature 0–0.3 for extraction and scoring, up to 0.7 for cover letters and intros.
- Parse defensively: strip fences → `JSON.parse` in try/catch → Zod validate → on failure, retry **once** with the validation error appended → on second failure, show an explicit error. Never silently fall back to invented data.
- **Cache** every result keyed by `hash(resumeText + jdText + promptVersion + model)` in IndexedDB. Re-opening an analysis costs zero tokens and returns the identical result.

---

## 12. Persistence details

- One `idb` database, explicit `upgrade(db, oldVersion, newVersion)` handling every version step. Never drop a store on upgrade without migrating its data.
- Object stores: `jobCards`, `resumeVersions`, `jobSpecs`, `matchAnalyses`, `artifacts`, `interviews`, `reminders`, `profile`, `settings`, `llmCache`.
- Indexes: `jobCards.status`, `jobCards.company`, `matchAnalyses.jobCardId`, `artifacts.jobCardId`.
- **Export / import all data as JSON** — including resume blobs as base64 — with a schema version field and validation on import. This is the only backup that exists; treat it as a first-class feature, not a nice-to-have.
- Show a persistent "Storage: local browser only" badge, and warn that clearing site data erases everything.

---

## 13. UI/UX

- Views: Board (kanban), Resumes, Job Analysis, Copilot/Generators, Interviews, Reminders, Analytics, Profile, Settings.
- Match results render progressively: score gauge → matched/missing lists → suggested rewrites. Stream where the provider supports it.
- Missing-skill chips colour-coded: red blocking, amber coverable, grey nice-to-have. Clicking a chip offers "add to learning list".
- Every AI panel shows the model used, generation timestamp, and a **Regenerate** button.
- Light/dark mode toggle, persisted.
- Empty states state the next action, not "no data".
- Keyboard accessible; dnd-kit keyboard sensor enabled for drag operations.

---

## 14. Build order — stop and report after each

1. Vite + TS + Tailwind scaffold, IndexedDB layer with migrations, Zod schemas, JSON export/import.
2. Kanban board with full CRUD, drag-and-drop, search, sort, counts, dark mode. **Ship this working before any AI.**
3. Master profile CRUD + Settings with LLM key config and test-connection.
4. Resume upload, parse, versioning, primary selection, diff view.
5. JD capture + structured extraction with evidence snippets.
6. Match engine: code-side scoring, synonym map, results UI, best-version recommendation.
7. Generation suite + artifact storage + reminder creation.
8. Interview prep + interviews view.
9. Analytics.
10. Tests, README, `DECISIONS.md`.

---

## 15. Quality bar

- Vitest unit tests for: score computation (determinism), skill normalization/synonyms, resume parsing, IndexedDB migrations, and Zod guards against malformed LLM output.
- One Playwright end-to-end test for the golden path: create profile → upload resume → add card with JD → run analysis → generate cover letter → drag card to Applied → export JSON.
- **Mock the LLM provider in all tests. No test may hit a live API.**
- No secrets committed. `.env.example` only.
- `README.md`: setup, how to add a key, the scoring formula and its weights, architecture notes.
- `DECISIONS.md`: every assumption made and every question you would have asked.

---

## 16. Non-goals

Backend, accounts, multi-tenancy, job-board scraping, auto-apply, payments, browser extension, mobile apps. Do not build these.

---

Begin with step 1. Before writing any code, restate these requirements in your own words and list every `[DECIDE]` item and every assumption you are making.
