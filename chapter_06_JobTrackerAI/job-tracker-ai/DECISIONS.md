# DECISIONS — MyNextInterview

Assumptions made and questions that would have been asked, logged at each phase gate.

## Phase 0 (basic tracker)

- **Folder:** app lives in `chapter_06_JobTrackerAI/job-tracker-ai/`; the build-spec prompts stay at the
  chapter root as docs. Not renamed to `mynextinterview` to avoid churn — Vercel project name is set at
  deploy time.
- **App name:** MyNextInterview (product), IndexedDB `my-next-interview`.
- **Scaffold:** Vite `react-ts` template pinned to whatever `npm create vite` resolved (Vite 8, React 19,
  TS ~6.0, Tailwind 4 via `@tailwindcss/vite`, zod v4, idb 8, dnd-kit 6).
- **Tailwind dark mode:** class strategy via `@custom-variant dark`, toggling `.dark` on `<html>`.
- **JobCard optional fields:** stored as empty strings when blank (schema keeps them optional at rest? no —
  the form trims and *omits* blank optional fields before write; create/edit both go through `JobFormSchema`).
- **Status history:** appended on drag moves and on status changes inside the edit modal; not editable by hand.
- **Add flow:** the "Add job" buttons (header and each column) open a right slide-over; editing opens a
  centered modal. Form fields include a Status dropdown for convenience.
- **Export format:** `{ schemaVersion: 1, exportedAt, jobCards, settings }`, validated by Zod on import.
  Blob/base64 resume support arrives with Phase 3.
- **Sort:** newest-first default per column; toggle flips oldest-first.
- **Days badge:** "Today" when 0 days since `dateApplied`; clamped at 0 for future dates.
- **Deferred (not bugs):** resume file parsing, LLM/provider settings, JD capture, analytics — all Phase 1+.
- **Open question for Phase 1:** which remote LLM providers the user holds keys for; default provider is
  OpenAI-compatible local (LM Studio at `http://localhost:1234`) when reachable.

## Phase 1 (one JD · one resume · one score)

- **Profile:** single Master Profile storing pasted resume *text* (name/headline optional). No file
  parsing — that is Phase 3. Matching runs against this text.
- **Provider:** only the OpenAI-compatible client is wired (LM Studio/localhost default, plus any
  remote base URL + key). Gemini/OpenAI/Anthropic stay behind the same interface for later phases.
  Keys live in IndexedDB and are sent direct from the browser — the Settings page warns about this.
- **Extraction scope:** JobSpec = required + preferred skills (each with verbatim JD evidence) +
  domain tags. Deferred from v2: implied skills, hard filters, seniority/domain structured fields,
  responsibilities — score derives seniority/domain heuristically instead (see below).
- **Deterministic scoring semantics (deviations from the v2 formula are in *data*, not code):**
  - Empty preferred list → preferred coverage = 1 (nothing demanded, no penalty).
  - Unknown JD years or resume years → seniority fit = 1 (neutral, no penalty).
  - No JD domain tags → domain fit = 1 (neutral).
  - Net effect: a zero-skill-coverage analysis floors at 25 (seniority + domain neutrality), never 0.
  - ATS keyword coverage = combined required+preferred literal hit rate.
- **Coverable triage deferred:** missing skills are blocking (required, red) or nice-to-have
  (preferred, amber). "Name the adjacent resume skill" needs resume-skill extraction and lands in a
  later phase; `missingCoverable` is always empty for now.
- **Matching mechanics:** raw case-insensitive word-boundary scan first (keeps `CI/CD` intact), then a
  synonym-canonicalized scan (`k8s`→`kubernetes`, `js`→`javascript`, …). Evidence shown to the user is
  a ~180-char resume snippet around the hit.
- **Caching:** spec extraction cached in IndexedDB keyed by content hash + prompt version + model;
  re-analysis of an unchanged JD costs zero tokens. Score recompute is pure code — free.
- **Spec staleness:** JobSpec carries a JD content hash; editing the JD text forces re-extraction
  (same record id, in-place replace).
- **Deletion:** deleting a card cascades to its spec + analyses.
- **Backup format v2:** adds profile, LLM settings, jobSpecs, matchAnalyses. v1 files still import
  (AI records start empty). llmCache is transient and intentionally not exported.
- **Card face:** match % badge appears after the first analysis.
- **Open questions:** the first *real* end-to-end run depends on which model is loaded in LM Studio
  and whether her pasted resume actually states "N years" with the word years (regex-based seniority).

## Phase 2 (copilot outputs)

- **Scope shipped:** cover letter, day-3/7/14 follow-up sequence, recruiter DM. The other `Artifact`
  kinds from v3 §3 (`intro`, `screeningAnswer`, `prep`) exist in the schema but have no generator yet —
  v3 lists them as later phases.
- **Prompts split:** `src/lib/prompts.ts` became `src/lib/prompts/*.ts` (grounding, context, jobSpec,
  coverLetter, followUp, dm, index) as v3 §4 requires. The grounding clause is a single exported
  constant embedded verbatim; `jobSpec` moved unchanged.
- **Prompt versions:** `cover-letter-v1`, `followup-v1`, `dm-v1`. Each stored on the artifact it
  produced, so a version bump invalidates the cache naturally.
- **Generation shape:** generators return JSON through the existing `completeJson` client, so model
  output is Zod-validated like the Phase 1 extraction. Temperatures: cover letter 0.7, follow-ups 0.5,
  DM 0.4 (extraction stays 0.1).
- **Follow-ups are one call, five artifacts:** v3 §5 said "day-3/7/14", but the candidate's real
  workflow is the **five-email sequence on a Day 1 → Day 5 cadence** defined in the
  `job-application-package` skill (`chapter_05_ResumeBuilder/job-application-package.skill`), so the
  app follows the skill: intro/interest → relevant experience → skills & achievements → values &
  culture fit → closing & call to action, each 120–180 words with its own subject line. A single
  prompt returns `{day1…day5}` and each day is stored as its own artifact with `variant` =
  `day-1` … `day-5`, so each email is independently editable and copyable. Regenerating rewrites all
  five in place. Prompt version `followup-v3`; `maxTokens` raised to 2000 for five emails in one call.
- **Stale-cadence data is purged:** `purgeStaleFollowUps()` runs once on app bootstrap and deletes
  `followUp` artifacts whose `promptVersion` is not the current one — i.e. the three-email
  (day-3/7/14) drafts. Those rows are structurally wrong (their variants no longer exist) and would
  otherwise linger in storage and in every backup. It is idempotent and touches only `followUp`
  artifacts, so hand-edited cover letters/DMs are never removed. Covered by unit tests.
- **Adopted the skill's other guardrails (revision after re-reading it):**
  - **Company-facts clause** — `COMPANY_FACTS_CLAUSE` is a second grounding constant alongside the
    resume one. The original clause only constrained the *profile/resume*, leaving Day 4 ("culture
    fit") and the cover letter free to invent company values, awards or news. It is now embedded in
    the cover letter, follow-up and DM prompts, exactly matching the skill's guardrail.
  - **Cover-letter structure** now follows the skill step by step: greeting (named contact only if
    the notes supply one) → intro (who they are + why this role/company) → body mapped to the JD's
    actual requirements → **one or two quantified achievements** → values/culture *only if stated* →
    **strong closing** (eagerness for an interview + thanks) → one page (250–350 words).
  - **Consistency between letter and emails** is instructed at the prompt level ("draw on the same
    strongest evidence the cover letter would use"). Note this is a prompt-level nudge, not an
    enforced cross-call link: the two generators are independent calls, so true consistency would
    require threading the generated cover letter into the email prompt and into its cache key. Left
    as an open question rather than built now.
  - Skill behaviours that do **not** map to an app (it drafts in chat): "produce both deliverables by
    default", "ask for the missing resume/JD", "deliver inline in chat unless a document is
    requested", and "say plainly if the JD is a poor match". The app covers the last one through the
    Phase 1 blocking/nice-to-have gap list instead of prose commentary.
- **Dead code removed:** `ARTIFACT_LABELS`, the unused `ArtifactContent` type alias, and the unused
  `FollowUpSequence` alias is now actually used by the generator. `deleteArtifact` is no longer
  test-only — the purge uses it.
- **DM ≤ 300 chars is enforced, not just requested:** if the first draft overruns, one corrective retry
  is attempted with the exact limit; if that also overruns the longer draft is kept and the UI shows
  `n/300 — over the limit`. Never silently truncated, because trimming mid-sentence loses meaning.
- **Cache vs Regenerate (interpretation of v3 §4.3):** the cache key is
  `hash(resumeText + jdText + promptVersion + model)`. *Generate* honours the cache, so re-opening a
  card costs zero tokens and returns the identical draft. *Regenerate* skips the cache, calls the
  model again, then overwrites the cache entry — still "every LLM result is cached", but the user
  explicitly asked for a new draft. Without this, a Regenerate button would be a no-op.
- **No duplicates:** generators reuse the stored artifact id for a given kind+variant. They resolve it
  from the caller's in-memory list when passed, and fall back to the store otherwise — so a cache hit
  with no explicit list still updates in place rather than inserting a second copy.
- **DB v3:** adds the `artifacts` store with a `jobCardId` index. Card deletion cascades to artifacts
  (and specs/analyses) in one transaction.
- **Backup format v3:** adds `artifacts`. v1 and v2 files still import with an empty artifact set.
  `llmCache` remains transient and unexported.
- **UI:** a new **Drafts** action on each card opens a modal panel. Artifact edits live in the panel's
  own draft map (no effect-driven syncing), and are written to IndexedDB only via **Save edit**.
- **Pre-existing lint:** `npm run lint` still reports 8 errors in files this phase did not touch
  (JobFormDialog effect, four `prefer-const` in analysis.ts, two unused destructures in schema.test.ts,
  SettingsView react-refresh export). The phase gate is `npm run build` + `npm test` — both green.
- **Open questions:** whether to add a "force fresh" toggle per artifact rather than overloading
  Regenerate; whether the follow-up sequence should later allow per-day regeneration.

## Phase 3 (resume library)

- **Scope shipped (v3 §5):** upload multiple `.pdf`/`.docx` resumes, extract text client-side, store
  the original file, label/notes/primary, best match score per version, backup including files.
  The three `[DECIDE]` items were all answered "yes" by the user, so this phase also AI-parses each
  resume and wires the library into matching + per-card provenance.
- **File stored as `fileData: ArrayBuffer` + `fileMimeType`, not `fileBlob: Blob`** (a deviation from
  the v3 §3 field name). Two reasons: fake-indexeddb cannot structured-clone a Blob, so persistence was
  unverifiable in tests, and a Blob round-trip cannot be asserted without comparing bytes anyway.
  Bytes are equivalent, clone in every browser, and let us rebuild a Blob for download. The backup
  carries base64 in place of the buffer.
- **The ArrayBuffer validator is structural, not `instanceof`.** IndexedDB (and fake-indexeddb) can
  return a buffer created in a different realm, where `instanceof ArrayBuffer` is false. A Zod
  `z.instanceof(ArrayBuffer)` would have rejected a perfectly valid stored resume on read — caught by
  a test, fixed with `z.custom(isArrayBuffer)` using `Object.prototype.toString`.
- **Primary invariant lives in `db.ts`:** `saveResumeVersion` promotes the first-ever version and
  demotes others in the same transaction; `setPrimaryResumeVersion` flips all rows atomically;
  `deleteResumeVersion` re-promotes the newest survivor. The UI therefore has no way to leave zero
  primaries while a version exists — it exposes "Make primary", never an unset.
- **Upload is never lost to a parse failure.** `createResumeVersion` extracts text → saves the version
  (text + bytes) → then parses. On failure it stores `parseError` and keeps everything, with a
  Re-parse button. With no model configured the upload still stands and parsing is skipped, matching
  §0.4's graceful-degradation rule.
- **Parse prompt is an extraction prompt** (`resume-parse-v1`, temperature 0.1) so, like the JD spec
  prompt, it carries no generative grounding clause. Instead every skill must cite a verbatim resume
  line, and unsupported fields are omitted. Cached by `hash(rawText + promptVersion + model)`.
- **`resolveResume(card, versions, profile)`** is the single answer to "which resume?" used by both
  the match panel and the drafts panel: card's own version → primary → pasted profile text. A card
  pointing at a deleted version falls back to the primary rather than erroring, which is why the card
  face can safely show "deleted resume version".
- **Matching is now version-aware:** `analyzeJobCard` takes a `resumeVersionId` (defaulting to
  `PROFILE_ID`), so `MatchAnalysis.resumeVersionId` finally holds a real version. The analysis panel
  gained a "Match against" picker. Phase 1 analyses keep working — the profile text is still the
  fallback.
- **Provenance (the user's "which resume did I send to whom" ask):** `JobCard.resumeVersionId` plus a
  dropdown in the add/edit form and the version label on the card face.
- **`mammoth` is loaded from its browser bundle.** `import 'mammoth'` resolves to `lib/main.js`, which
  `require`s `fs`/`path`; only two of those modules are remapped by the package's `browser` field, so
  the Node entry would break the browser build. Loading `mammoth/mammoth.browser.js` needs an ambient
  type declaration (`src/types/mammoth-browser.d.ts`) since that path ships no types.
- **pdfjs worker is wired via `?url`** (`pdf.worker.min.mjs`), emitted as its own build asset. Both
  parsers are dynamically imported, so they land in separate chunks and don't bloat first paint.
- **DB v5 adds the `resumeVersions` store** (shipped as "v4", then healed by a bump — see below);
  **backup v4** adds `resumeVersions` with base64 files. v1–v3 backups still import with an empty
  resume library.
- **Incident: a version bump landed before its store, and IndexedDB made it permanent.** The
  `DB_VERSION = 4` edit and the `resumeVersions` store creation were two separate writes to `db.ts`.
  The running dev server hot-reloaded in the gap, so the browser upgraded its database to **v4 without
  the store**. Because re-opening at the same version is a no-op, `upgrade()` never ran again and every
  resume query failed with *"One of the specified object stores was not found"* — the whole board was
  stuck, since the failures happened during bootstrap.
  - **Heal:** `DB_VERSION = 5`. Every step in `upgrade()` is already wrapped in
    `objectStoreNames.contains`, so re-running the chain creates exactly the missing store and nothing
    else. No data was lost — the version bump is metadata, and the stores that existed were untouched.
  - **Lesson for later phases:** bump `DB_VERSION` in the *same* write as the store it introduces, and
    keep the `contains()` guards so any bump is also a repair. `db.migration.test.ts` now has a
    regression test that seeds a v4 database *missing* the store and asserts the next open heals it.
- **Blocked upgrades are now handled, not endured.** A version upgrade is blocked while any older
  connection is open, and a blocked upgrade never rejects — it just never resolves. `getDb()` now
  releases a stale connection (`blocking`), warns which cause is in play (`blocked`), resets on
  `terminated`, and does not cache a rejected open. The App bootstrap additionally has an 8-second
  timeout and renders an error panel with Retry / Reload instead of an endless "Loading…".
- **Not unit-tested:** real PDF/DOCX *binary* extraction. `htmlToText`, the extension routing, the
  error paths and the mammoth module interop are covered, but no test feeds a real `.pdf`/`.docx`
  fixture — generating one would mean either adding a binary fixture or embedding a real resume, and
  the repo should not carry personal data. This needs a manual smoke test with a real file.
- **Tooling note:** `npm install pdfjs-dist mammoth` pruned 191 dev packages because `NODE_ENV` is
  `production` in this shell (the README already warns about this). Recovered with
  `npm install --include=dev`; worth remembering for the next dependency install.
- **Out of scope (v3):** the version-diff view. Still owned by Phase 5: best-version recommendation
  across the library, analytics dashboard, sub-score visuals, keyboard dnd sensor, Playwright E2E.
- **Open questions:** whether the match panel should auto-run across *all* versions to recommend the
  best one (Phase 5), and whether parsing should extract per-skill years via a stricter second pass —
  the 1B local model tends to under-report them.

## Phase 4 (trimmed scope)

Scope agreed before building: **interview rounds + grounded interview prep, and nothing else.** The
`Reminder` entity and the Phase 5 dashboard stay unbuilt.

- **No `Reminder` store — a derived badge instead.** A browser-only app cannot remind you when it is
  closed, so `Reminder { dueAt, done }` would only ever surface a badge you see when the app happens
  to be open. Replaced by `isFollowUpOverdue()`: status is `applied`/`followup` and the card has not
  moved in more than 7 days (`FOLLOW_UP_OVERDUE_DAYS`). It reads `JobCard.history` — the append-only
  status log that has existed since Phase 0 but that, until now, nothing displayed. Zero new schema.
  `interview` and beyond are excluded: those are being actively handled, not stalled.
- **`InterviewRound`, stored separately (DB v6).** A new `interviews` store with a `jobCardId` index,
  cascaded from `deleteJobCard`, and carried in backups. `round` is a number assigned on write (max
  existing + 1) so the user never types it; `scheduledAt` holds a `datetime-local` value.
- **`format` and `outcome` are enums** (`phone|video|onsite|technical|hr|other`, and
  `pending|passed|failed|cancelled`). The spec (v3 §3) names both fields but not their values — this is
  an invention, flagged here. A free-text `label` sits alongside for the round's actual name. Free text
  was the alternative for both; enums were chosen so the Phase 5 analytics can count outcomes without
  guessing at spellings.
- **Prep is the one structured artifact.** `'prep'` has been in `ARTIFACT_KINDS` since Phase 2 but had
  no generator. `Artifact.content` is a plain string and cannot express a tickable question, so
  `ArtifactSchema` gained two **optional** fields: `prep` (a `PrepPlan`) and `practised` (keys of the
  form `"<topicIndex>:<questionIndex>"`). `content` still carries a plain-text rendering, so Copy works
  and the backup stays readable. Optional and additive, so old artifacts and every old backup parse
  unchanged — **no migration for the `artifacts` store**.
- **`practised` has a Zod `.default([])`, which makes it required on the decoded type** — exactly like
  `edited`. Every producer sets it explicitly: `buildArtifact` returns `practised: []`, and
  `generatePrep` spreads it as well. That is why the existing fixtures in `db.test.ts`,
  `artifacts.test.ts`, `exportImport.test.ts` and `schema.test.ts` each needed `practised: []` added,
  and why `tsc -b` was the check that caught them.
- **Regenerating prep resets the ticks, deliberately** — the questions are new, so index keys from the
  previous plan would be meaningless. The tick lives in `togglePrepPractised` in `artifacts.ts` rather
  than in the panel, so it is unit-testable.
- **Prep gets its own panel, and duplicates `DraftsPanel`'s setup.** The checklist UI is not the
  textarea `ArtifactCard` UI, and leaving the working 465-line drafts panel untouched kept this phase's
  regression risk near zero. The cost is ~40 duplicated lines (data load, `resolveResume`, the
  three-gap disabled reason, `args(force)`). Extracting a shared hook is the obvious later refactor; it
  is not worth refactoring an untested working panel mid-phase.
- **Rounds are also readable from a new `Interviews` tab** — upcoming first, then past — because
  per-card rounds alone cannot answer "what is coming up?". The tab is read-only; adding and editing
  stay in the card's **Rounds** action. It skips rounds whose card was deleted, so a hand-edited import
  cannot show orphans.
- **Backup v5** adds `interviews`. `ExportFileV1..V4Schema` are untouched, and `parseImportFile` tries
  v5 **first**: `schemaVersion` is a `z.literal`, so a v5 file would otherwise fall through to v1 and
  be rejected. There is a regression test that a v4 file still imports now that v5 exists.
- **The v6 bump and the `interviews` store landed in one write, with the dev server stopped.** The v4
  incident (above) happened because the version bump and its store arrived in two writes and HMR
  upgraded the browser in the gap. Stopping Vite for the edit removed the hazard entirely rather than
  relying on care.
- **Correction to the earlier lesson: the `contains` guards converge on a *bump*, not on a re-open.**
  A database that reached v6 *without* the store cannot heal itself while `DB_VERSION` is 6 —
  re-opening at the same version is a no-op, so `upgrade()` never runs. What the guards actually
  guarantee is that the next bump creates every missing store. `db.migration.test.ts` therefore tests
  the real property — `seedLegacyV5()` (a true v5 → v6 upgrade, with a prep artifact surviving) and
  `seedBrokenV5()` (a v5 missing two stores, proving one bump converges the whole set) — instead of a
  fake same-version self-heal.
- **`formatDateTime` and `daysSinceTimestamp` are siblings, not replacements.** `daysSince` keeps its
  clamping behaviour because the card's `Nd` chip depends on it; `daysSinceTimestamp` accepts a full
  timestamp and stays signed, which is what both the overdue check and the "Interview in Nd" chip need.
- **Not built (deliberately):** the `Reminder` store and any `.ics` export, prep question editing,
  per-question notes, and all Phase 5 analytics.
- **Open questions:** whether the `Interviews` tab should allow editing a round in place rather than
  sending the user back to the card; whether the overdue window should be per-status rather than one
  constant; whether prep topics should be preserved across a regeneration that only changes questions.

## Phase 4 follow-up: the Groq 429 / output-token cap

Found by running prep against a real model — which no test could have caught, because every LLM test
mocks `completeJson`. A small Groq organisation carries a **1000 output-tokens-per-minute (OTPM)**
ceiling, and the app's handling of that 429 was wrong twice over.

- **The retry was sized from the ceiling instead of the remainder.** `reducedOutputBudget` read only
  `Limit 1000` and asked for `1000 × 0.9 = 900`, ignoring the `Used 452` in the very same message. The
  "smaller" retry therefore exceeded the ~548 actually available, 429'd a second time, and the feature
  failed. It now computes from `Limit − Used` (493 here), refuses to retry when under
  `MIN_OUTPUT_BUDGET` (256) tokens remain — a guaranteed second failure — and reads `retry-after` from
  the response header, falling back to the "try again in 21.1s" in the body, waiting that long with a
  30s cap so a long cooldown never looks like a hung UI.
- **Some feature budgets were impossible on that tier before the request was even sent:** prep asked
  for 1800 output tokens against a 1000 cap, follow-ups 2000, resume parsing 3000. Prep is now
  `PREP_MAX_TOKENS = 900` with a smaller ask (3–5 topics × 3–4 questions).
- **Follow-ups and resume parsing were deliberately left alone.** Five emails of 120–180 words genuinely
  need more than 1000 output tokens, so trimming them to fit would silently degrade the feature. They
  need Groq's Developer tier or a local model — a real product constraint, not a bug to paper over.
- **The Settings model hint was a dead end.** It recommended `llama-3.3-70b-versatile`, which Groq
  retired from its free and Developer tiers on 16 August 2026. Now `openai/gpt-oss-120b` (also ~5×
  cheaper than the Qwen preview and outside Groq's preview-discontinuation risk).
- **Limits are per organization, not per key**, so consecutive generations collide by design. The
  wait-and-retry makes that recoverable rather than fatal.
- **Testing note:** `src/lib/llm.test.ts` is new and pins the budget arithmetic and delay parsing
  against the real 429 body. `reducedOutputBudget` and `retryDelayMs` are exported as pure functions
  specifically so this logic is testable without mocking `fetch` or spending wall-clock time on the
  retry delay.

## Phase 5 (trimmed scope)

Scope agreed before building: one read-only **Analytics** tab, entirely derived. No new object store,
no DB bump and no backup change — which is why the backup format stays at v5.

- **No `recharts`.** v3 §5 nominates it for this phase, but it was never installed and nothing in
  `src/` imported a charting library. Adding one for two bar charts means re-encountering the
  `NODE_ENV=production` install problem recorded above. The week chart and the funnel bars are
  hand-rolled Tailwind divs, reusing the inline bar idiom from `AnalysisPanel.tsx`.
- **Every function in `src/lib/analytics.ts` is pure** — no IndexedDB, no model, no `fetch` — so the
  whole dashboard is unit-testable without `fake-indexeddb` or mocking. 28 tests cover it.
- **Only the newest analysis per card is counted.** A card can hold one analysis per resume version, so
  aggregating every `matchAnalyses` row would count the same JD's gaps two or three times and inflate
  the "missing in N JDs" figure. `topMissingSkills` groups by `jobCardId` and keeps the latest
  `createdAt` — the same row the card face's `matchScore` reflects. This is the easiest way to get this
  feature silently wrong, so a test pins it.
- **`everReached` checks `from` as well as `to`.** A transition records the status being *left* in
  `from`, so a card dragged back to Wishlist logs `{ from: 'applied', to: 'wishlist' }` and its time in
  Applied is visible only there. Found because a test expected the obvious `status !== 'wishlist'` rule
  to cover it and it did not.
- **Applications are dated by `dateApplied`, because history cannot date them.** `makeNewCard` sets
  `history: []` and `handleCreate` appends nothing, so a card created straight into the Applied column
  has no "entered applied" event at all. A genuine limitation of the Phase 0 data model. Logging the
  initial status on create would fix it going forward, but cannot retro-fit existing cards — a
  candidate for a later phase.
- **`wishlist` cards are not applications**, in both the weekly chart and the funnel's base.
- **"Responded" is a proxy, and the UI states the definition.** There is no `responded` status; a card
  counts once it has ever reached `interview`, `offer` or `rejected` — a rejection *is* a response,
  whereas `followup` is not, because the user sets that when they chase. The funnel hint names the rule
  rather than implying a tracked event that does not exist.
- **Rates are `null`, rendered as `—`, when there are no applications.** "0% response rate" with
  nothing applied would be a claim the data cannot support.
- **The responded-vs-not comparison is shown with `n=` and is warned on.** Under 5 samples in either
  group gets an explicit amber note that the difference is noise; without it the number invites a
  conclusion it cannot carry. This is the one metric here whose sample size is usually too small.
- **`missingCoverable` is ignored** — it has been `[]` since Phase 1 (adjacency triage was deferred), so
  aggregating it would add nothing.
- **Missing-skill names are canonicalized with the existing `canonicalSkill`** from `config.ts`, so `K8s`
  and `Kubernetes` collapse into one row, and the row shows the most common original spelling.
- **Each view duplicates the small bar and `scoreClass` idioms rather than extracting shared
  components.** The same call as Phase 4: not worth refactoring working, untested panels for a cosmetic
  gain.
- **Deferred from v3 §5 (deliberately):** sub-score visuals, the version-diff view, the synonym-map
  tuning UI, the keyboard dnd sensor, and the Playwright E2E. Sub-scores already render as labelled
  bars in the analysis panel.
- **Open questions:** whether the weekly chart should drill into a specific week; whether "responded"
  should become a real tracked status (a schema change) instead of an inference; whether unanalysed
  resume versions belong in the ranking with a "not measured" label rather than being omitted.

