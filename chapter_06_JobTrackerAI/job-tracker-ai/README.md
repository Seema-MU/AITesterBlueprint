# MyNextInterview

Local-first job tracker + AI career copilot (single user, no backend). All data stays in the browser (IndexedDB).

**Phase 5 (current):** all five phases of `../job-tracker-ai-build-prompt-v3.md` are built. Phase 0
shipped the zero-AI Kanban tracker, Phase 1 the JD analysis + deterministic match score, Phase 2 the
cover letter / outreach sequence / recruiter DM generators, Phase 3 the resume upload + versioning +
structured parsing, Phase 4 interviews + interview prep, and Phase 5 the derived analytics dashboard.
A few Phase 5 cosmetics were deliberately skipped — see `DECISIONS.md`.

## Run it

```bash
npm install        # if node_modules is missing
npm run dev        # dev server (http://localhost:5173)
npm run build      # typecheck (tsc strict) + production build
npm test           # vitest
npm run preview    # serve the production build locally
```

Note: on machines where `NODE_ENV=production` is exported, use `npm install --include=dev`.

Your data lives in IndexedDB keyed to the origin **and port**. Use the same port you saved it on
(5173), and export a JSON backup before clearing site data.

## What it does

**Board (Phase 0)**

- Kanban pipeline: **Wishlist → Applied → Follow-up → Interview → Offer → Rejected**
- Drag cards between columns (dnd-kit); every move is recorded in the card's history
- Add (slide-over), edit (modal), delete (confirm) — all with required-field Zod validation
- Card face: company, role, days since added, salary range, clickable job URL, match badge, JD tag
- Column live counts, independent scroll, sort by date (newest/oldest), search by company/role
- Optimistic IndexedDB writes with rollback on failure
- Light/dark mode (persisted) and the **"Storage: Local browser only"** badge

**Match analysis (Phase 1)**

- Master profile holds your pasted resume text — the fallback matching source when no resume is uploaded
- Paste a JD on a card → required/preferred skills extracted (each with a verbatim JD quote)
- Match score is **computed by the app**, never the model: 45% required + 20% preferred + 15%
  seniority + 10% domain + 10% ATS keyword coverage
- Missing skills triaged blocking (required) vs nice-to-have (preferred), each shown with the JD quote
- LLM results are cached by content hash, so reopening an analysis costs zero tokens

**Resume library (Phase 3)** — the **Resumes** tab

- Upload multiple `.pdf` / `.docx` versions; text is extracted **in the browser** (`pdfjs-dist` for
  PDF, `mammoth` for DOCX) — no file ever leaves the machine
- The original file bytes are stored, so any version is **re-downloadable**
- Each version has a **label** (version tag, e.g. `QA_Resume_CGI_v2`) and notes
- **Exactly one version is primary**, enforced in the write path, not just the UI; deleting the
  primary re-promotes the newest survivor, and deleting a version clears any job card pointing at it
- Each upload is **AI-parsed** into skills (with per-skill years and the verbatim resume line as
  evidence), roles, education, certifications and total years. A parse failure never loses the upload
  — the text and file stay, with the reason shown and a Re-parse button
- The list shows label, upload date, parsed skill count, primary badge and **best match score
  achieved** against any stored JD
- The match analysis panel and the copilot drafts both ground on the selected resume version
  (card's own version → primary → pasted profile text)
- Each job card records **which resume you sent** (`resumeVersionId`, shown on the card face)

**Copilot drafts (Phase 2)** — open **Drafts** on any card

- **Cover letter** — one page (250–350 words) following the job-application-package structure:
  greeting → why this role/company → experience mapped to the JD's requirements → one or two
  quantified achievements → values only if the JD states them → strong closing
- **Outreach sequence** — five emails on a Day 1 → Day 5 cadence (intro/interest, relevant
  experience, skills & achievements, values & culture fit, closing & call to action), each 120–180
  words with its own subject line and opening, generated in one call and stored separately per day
- **Recruiter DM** — plain-text outreach under 300 characters (enforced with one corrective retry)
- Every draft is editable in place, copyable, and regenerable; edits are flagged as `edited`
- Two grounding clauses guard all copy: facts must come from the profile/resume (no invented
  employers, dates, metrics or certifications — an absent metric becomes `[ADD METRIC]`), and nothing
  about the company may be invented (no culture, values, awards or news that the JD/notes don't state)
- Cached by `hash(resumeText + jdText + promptVersion + model)`; **Generate** reuses the cache
  (free), **Regenerate** forces a fresh call
- Every AI feature degrades gracefully: with no resume / JD / model configured the generators are
  disabled with the exact reason shown

**Interviews & prep (Phase 4)** — the **Interviews** tab, and the **Rounds** / **Prep** card actions

- Record every interview round per job: round number (assigned for you), date and time, format,
  interviewer, duration, outcome and notes
- The **Interviews** tab lists all rounds across the board — upcoming soonest-first, then past
- A card shows **Interview in Nd** for its next round, or **N rounds** once they are all behind you
- **Interview prep** generates a topic-grouped question set for the job, drawn from the requirement
  areas the JD actually names and the experience your resume actually states. Ticking a question marks
  it practised; ticks are stored with the plan, and **Regenerate resets them** because the questions
  are new
- A card that goes quiet gets a derived **Follow up** badge after 7 days without movement — a nudge
  rather than a reminder system, since a browser-only app cannot wake you when it is closed

**Analytics (Phase 5)** — the **Analytics** tab

- **Applications per week** for the last 12 weeks. Wishlist cards are not applications, so they are not
  counted, and empty weeks stay visible as gaps
- **Funnel**: applied → responded → interviewed → offer, with conversion rates. "Responded" is defined
  on screen as having reached interview, offer or rejected — a rejection *is* a reply, whereas following
  up is something you do, so it does not count
- **Match score: responded vs not**, always shown with its sample size, and flagged as noise while the
  groups are small
- **Skills to learn next** — the requirements missing across every JD you have analysed, split required
  vs preferred, with synonyms merged (`K8s` and `Kubernetes` are one row). Each job counts once, via its
  most recent analysis
- **Resume versions** ranked by best score, and how many JDs each was measured against
- Entirely derived: no new storage, no DB bump, and nothing leaves the device

## Backup

Export/import full state as JSON. The current format is **v5** (`{ schemaVersion: 5, exportedAt,
jobCards, settings, llm, profile, jobSpecs, matchAnalyses, artifacts, resumeVersions, interviews }`),
Zod-validated on import. Resume files travel **inside the backup as base64**, so a backup really is
self-contained. v1–v4 files still import — whatever a given version predates simply starts empty.
`llmCache` is transient and intentionally not exported.

## Structure

```
src/lib/schema.ts          Zod schemas → TS types (single source of truth)
src/lib/db.ts              idb database, versioned with an upgrade() migration per version (v6)
src/lib/hash.ts            content hash used for change detection and LLM caching
src/lib/utils.ts           date/format helpers, incl. the derived follow-up overdue check
src/lib/prompts/           one module per prompt + PROMPT_VERSION, shared grounding clauses
src/lib/analysis.ts        JD spec extraction + deterministic match scoring
src/lib/analytics.ts       derived dashboard stats (pure: no store, no model, no IO)
src/lib/artifacts.ts       grounded generators for cover letter / outreach sequence / DM / prep
src/lib/resumeFile.ts      client-side .pdf/.docx text extraction
src/lib/resumes.ts         resume versions: parse, resolve-for-card, best score
src/lib/base64.ts          ArrayBuffer ⇄ base64 for self-contained backups
src/lib/llm.ts             OpenAI-compatible BYOK client (Zod validation, one retry)
src/lib/exportImport.ts    JSON backup schema (v5) + download/import
src/types/                 ambient types for mammoth's browser bundle
src/features/board/        Kanban columns, card, add/edit dialog
src/features/analysis/     match analysis panel
src/features/artifacts/    copilot drafts panel + interview prep panel
src/features/interview/    rounds panel (per card) + upcoming/past interviews view
src/views/                 Analytics, Profile, Resumes, Settings
src/components/            Header, ConfirmDialog
```

`pdfjs-dist` and `mammoth` are dynamically imported, so they load only when you upload a file
(they build as separate chunks and don't weigh down first paint). The PDF worker is emitted as its own
asset via a `?url` import. Note that `import 'mammoth'` resolves to its Node entry (which requires
`fs`), so the browser bundle is loaded explicitly.

Every future entity (reminders, analytics stores) arrives as a new object store via a DB version bump —
never a schema wipe. One caveat worth knowing: a bump re-runs every guarded `upgrade()` step, so it
also repairs a database that missed a store, but re-opening at the *same* version is a no-op.

## Deployment

Static Vite app — no backend and no router, so every screen lives at `/` and no rewrite rules are
needed. Deploy the `dist/` output.

**Vercel:** set the **Root Directory** to `chapter_06_JobTrackerAI/job-tracker-ai`. This one is not
optional: the repo root has its own `package.json` (the Jira MCP launcher, which has no build script), so
a build started from the repo root fails immediately.

Three things to know before putting it online:

- **Do not set `GROQ_API_KEY` in the host's environment variables.** `vite.config.ts` feeds it to `define`,
  which is a *build-time* string substitution — setting it would bake your key into the public JavaScript
  bundle for anyone who views source. The app is BYOK: leave it unset and paste your key into **Settings**
  on the deployed site, where it stays in that browser's IndexedDB. (That variable has no `VITE_` prefix,
  which is the convention meant to signal "this becomes public" — worth renaming.)
- **A deployed origin starts with an empty database.** IndexedDB is keyed to origin *and* port, so
  `localhost:5173` and `your-app.vercel.app` share nothing. Export a backup locally, then import it on the
  deployed URL. Every Vercel *preview* URL is likewise its own origin with its own empty database.
- **The Local (LM Studio) provider only works locally.** The `/lmstudio` proxy that tunnels to
  `127.0.0.1:1234` is defined in Vite's `server` and `preview` config and there is no server on a static
  host, so that preset will fail once deployed. Groq works fine, because the browser calls it directly.
