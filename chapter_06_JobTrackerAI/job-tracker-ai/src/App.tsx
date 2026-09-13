import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InterviewRound, JobCard, JobForm, ResumeVersion, Status, Theme } from './lib/schema'
import { DEFAULT_SETTINGS, STATUSES } from './lib/schema'
import * as db from './lib/db'
import { buildExportData, downloadExport, parseImportFile } from './lib/exportImport'
import { makeNewCard } from './lib/utils'
import { resumeLabelsById } from './lib/resumes'
import Board from './features/board/Board'
import type { SortDir } from './features/board/Board'
import JobFormDialog from './features/board/JobFormDialog'
import ConfirmDialog from './components/ConfirmDialog'
import Header from './components/Header'
import ProfileView from './views/ProfileView'
import SettingsView from './views/SettingsView'
import ResumesView from './views/ResumesView'
import AnalyticsView from './views/AnalyticsView'
import AnalysisPanel from './features/analysis/AnalysisPanel'
import DraftsPanel from './features/artifacts/DraftsPanel'
import PrepPanel from './features/artifacts/PrepPanel'
import RoundsPanel from './features/interview/RoundsPanel'
import InterviewsView from './features/interview/InterviewsView'
import { purgeStaleFollowUps } from './lib/artifacts'

type View = 'board' | 'analytics' | 'interviews' | 'profile' | 'resumes' | 'settings'
type SheetState = { kind: 'create'; status: Status } | { kind: 'edit'; card: JobCard } | null

const VIEWS: { id: View; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'profile', label: 'Profile' },
  { id: 'resumes', label: 'Resumes' },
  { id: 'settings', label: 'Settings' },
]

/** Groups rounds by card id, for the badge on each card face. */
function groupRounds(rounds: InterviewRound[]): Record<string, InterviewRound[]> {
  const map: Record<string, InterviewRound[]> = {}
  for (const round of rounds) {
    const list = map[round.jobCardId]
    if (list) list.push(round)
    else map[round.jobCardId] = [round]
  }
  return map
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export default function App() {
  const [cards, setCards] = useState<JobCard[] | null>(null)
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([])
  const [roundsByCard, setRoundsByCard] = useState<Record<string, InterviewRound[]>>({})
  const [theme, setTheme] = useState<Theme>('light')
  const [view, setView] = useState<View>('board')
  const [search, setSearch] = useState('')
  const [sortDirs, setSortDirs] = useState<Record<Status, SortDir>>(() =>
    Object.fromEntries(STATUSES.map((s) => [s, 'desc'])) as Record<Status, SortDir>,
  )
  const [sheet, setSheet] = useState<SheetState>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobCard | null>(null)
  const [analysisTarget, setAnalysisTarget] = useState<JobCard | null>(null)
  const [draftsTarget, setDraftsTarget] = useState<JobCard | null>(null)
  const [roundsTarget, setRoundsTarget] = useState<JobCard | null>(null)
  const [prepTarget, setPrepTarget] = useState<JobCard | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by Retry to re-run the bootstrap effect. */
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const noticeTimer = useRef<number | undefined>(undefined)

  // --- bootstrap ---
  useEffect(() => {
    let alive = true
    let settled = false
    /*
     * A blocked IndexedDB upgrade never rejects — it just never resolves — so a
     * try/catch alone would leave this screen on "Loading…" forever. Bail out loudly
     * if the open takes implausibly long.
     */
    const timer = window.setTimeout(() => {
      if (alive && !settled) {
        setLoadError(
          'Timed out opening the local database. Another tab of this app is probably holding an older version open.',
        )
      }
    }, 8000)

    void (async () => {
      try {
        // Drop follow-up drafts left over from a superseded cadence/prompt version.
        await purgeStaleFollowUps()
        const [storedCards, settings, versions, rounds] = await Promise.all([
          db.listJobCards(),
          db.getSettings(),
          db.listResumeVersions(),
          db.getAllRounds(),
        ])
        settled = true
        if (!alive) return
        const row = settings ?? DEFAULT_SETTINGS
        setCards(storedCards)
        setResumeVersions(versions)
        setRoundsByCard(groupRounds(rounds))
        setTheme(row.theme)
        applyTheme(row.theme)
        setLoadError(null)
      } catch (err) {
        settled = true
        if (!alive) return
        setLoadError(err instanceof Error ? err.message : 'Could not open the local database.')
      } finally {
        window.clearTimeout(timer)
      }
    })()

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [bootstrapAttempt])

  const retryLoad = useCallback(() => {
    setLoadError(null)
    setBootstrapAttempt((n) => n + 1)
  }, [])

  const reloadResumes = useCallback(async () => {
    setResumeVersions(await db.listResumeVersions())
  }, [])

  const reloadRounds = useCallback(async () => {
    setRoundsByCard(groupRounds(await db.getAllRounds()))
  }, [])

  const resumeLabels = useMemo(() => resumeLabelsById(resumeVersions), [resumeVersions])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500)
  }, [])

  /** Optimistic write; reverts on failure. */
  const commit = useCallback(
    async (next: JobCard[], write: () => Promise<void>) => {
      const prev = cards
      setCards(next)
      try {
        await write()
      } catch {
        setCards(prev)
        flash('Could not save to local storage — your change was reverted.')
      }
    },
    [cards, flash],
  )

  const handleCreate = useCallback(
    async (form: JobForm) => {
      if (!cards) return
      const card = makeNewCard(form)
      await commit([...cards, card], () => db.saveJobCard(card))
      setSheet(null)
    },
    [cards, commit],
  )

  const handleUpdate = useCallback(
    async (form: JobForm) => {
      if (!cards || sheet?.kind !== 'edit') return
      const prevCard = sheet.card
      const now = new Date().toISOString()
      const history =
        prevCard.status === form.status
          ? prevCard.history
          : [...prevCard.history, { from: prevCard.status, to: form.status, at: now }]
      const updated: JobCard = { ...prevCard, ...form, history }
      await commit(
        cards.map((c) => (c.id === updated.id ? updated : c)),
        () => db.saveJobCard(updated),
      )
      setSheet(null)
    },
    [cards, sheet, commit],
  )

  const handleMove = useCallback(
    async (id: string, from: Status, to: Status) => {
      if (!cards) return
      const card = cards.find((c) => c.id === id)
      if (!card) return
      const updated: JobCard = {
        ...card,
        status: to,
        history: [...card.history, { from, to, at: new Date().toISOString() }],
      }
      await commit(
        cards.map((c) => (c.id === id ? updated : c)),
        () => db.saveJobCard(updated),
      )
    },
    [cards, commit],
  )

  const handleDelete = useCallback(async () => {
    if (!cards || !deleteTarget) return
    const id = deleteTarget.id
    await commit(
      cards.filter((c) => c.id !== id),
      () => db.deleteJobCard(id),
    )
    setDeleteTarget(null)
    // deleteJobCard cascades to the card's rounds, so the badges are now stale.
    await reloadRounds()
  }, [cards, deleteTarget, commit, reloadRounds])

  /** Persist a fresh match score onto the card face (from the analysis panel). */
  const handleScoreUpdated = useCallback(
    async (cardId: string, score: number) => {
      if (!cards) return
      const card = cards.find((c) => c.id === cardId)
      if (!card) return
      const updated: JobCard = { ...card, matchScore: score }
      await commit(
        cards.map((c) => (c.id === cardId ? updated : c)),
        () => db.saveJobCard(updated),
      )
    },
    [cards, commit],
  )

  const toggleTheme = useCallback(async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    try {
      await db.saveSettings({ key: 'ui', theme: next })
    } catch {
      flash('Could not save theme preference.')
    }
  }, [theme, flash])

  const handleExport = useCallback(async () => {
    if (!cards) return
    const [profile, jobSpecs, matchAnalyses, llm, artifacts, versions, rounds] = await Promise.all([
      db.getProfile(),
      db.getAllJobSpecs(),
      db.getAllMatchAnalyses(),
      db.getLlmSettings(),
      db.getAllArtifacts(),
      db.listResumeVersions(),
      db.getAllRounds(),
    ])
    downloadExport(
      await buildExportData(
        cards,
        { key: 'ui', theme },
        {
          profile,
          jobSpecs,
          matchAnalyses,
          llm,
          artifacts,
          resumeVersions: versions,
          interviews: rounds,
        },
      ),
    )
  }, [cards, theme])

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const data = await parseImportFile(file)
        await db.replaceAllData(data)
        setCards(data.jobCards)
        setResumeVersions(data.resumeVersions)
        setRoundsByCard(groupRounds(data.interviews))
        setTheme(data.settings.theme)
        applyTheme(data.settings.theme)
        flash(
          `Imported ${data.jobCards.length} job${data.jobCards.length === 1 ? '' : 's'} and ${data.resumeVersions.length} resume${data.resumeVersions.length === 1 ? '' : 's'}.`,
        )
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Import failed.')
      }
    },
    [flash],
  )

  const visibleCount = cards
    ? cards.filter(
        (c) =>
          !search ||
          c.company.toLowerCase().includes(search.toLowerCase()) ||
          c.role.toLowerCase().includes(search.toLowerCase()),
      ).length
    : 0

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
    }`

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onExport={handleExport}
        onImportFile={handleImport}
        onAdd={() => setSheet({ kind: 'create', status: 'wishlist' })}
      />

      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <nav className="flex items-center gap-1" aria-label="Main">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={tabClass(view === v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {view === 'board' ? (
          <div className="ml-auto flex items-center gap-3">
            <div className="relative w-full max-w-xs">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by company or role…"
                className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-zinc-700"
              />
            </div>
            {cards !== null && (
              <p className="whitespace-nowrap text-xs text-zinc-400">
                {visibleCount} of {cards.length} job{cards.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {view === 'analytics' ? (
          <div className="h-full overflow-y-auto">
            <AnalyticsView />
          </div>
        ) : view === 'interviews' ? (
          <div className="h-full overflow-y-auto">
            <InterviewsView />
          </div>
        ) : view === 'profile' ? (
          <div className="h-full overflow-y-auto">
            <ProfileView />
          </div>
        ) : view === 'resumes' ? (
          <div className="h-full overflow-y-auto">
            <ResumesView onChanged={reloadResumes} />
          </div>
        ) : view === 'settings' ? (
          <div className="h-full overflow-y-auto">
            <SettingsView />
          </div>
        ) : (
          <main className="h-full overflow-x-auto p-4">
            {cards === null ? (
              loadError ? (
                <div className="mx-auto mt-10 max-w-lg rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-left dark:border-rose-900 dark:bg-rose-950/40">
                  <h2 className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                    Could not open your local database
                  </h2>
                  <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
                  <p className="mt-2 text-xs text-rose-600/80 dark:text-rose-300/80">
                    This usually means another tab of this app is holding an older version of the
                    database open. Close any other tab on this address, then retry.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={retryLoad}
                      className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950"
                    >
                      Reload page
                    </button>
                  </div>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
              )
            ) : (
              <Board
                cards={cards}
                search={search}
                sortDirs={sortDirs}
                resumeLabels={resumeLabels}
                roundsByCard={roundsByCard}
                onToggleSort={(status) =>
                  setSortDirs((prev) => ({ ...prev, [status]: prev[status] === 'desc' ? 'asc' : 'desc' }))
                }
                onAdd={(status) => setSheet({ kind: 'create', status })}
                onEdit={(card) => setSheet({ kind: 'edit', card })}
                onDelete={setDeleteTarget}
                onAnalyse={setAnalysisTarget}
                onDrafts={setDraftsTarget}
                onRounds={setRoundsTarget}
                onPrep={setPrepTarget}
                onMove={handleMove}
              />
            )}
          </main>
        )}
      </div>

      {sheet ? (
        <JobFormDialog
          key={sheet.kind === 'edit' ? sheet.card.id : `create-${sheet.status}`}
          slideOver={sheet.kind === 'create'}
          editing={sheet.kind === 'edit' ? sheet.card : undefined}
          initialStatus={sheet.kind === 'create' ? sheet.status : sheet.card.status}
          resumeVersions={resumeVersions}
          onClose={() => setSheet(null)}
          onSubmit={sheet.kind === 'create' ? handleCreate : handleUpdate}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete job?"
          message={`This permanently removes "${deleteTarget.company} — ${deleteTarget.role}", its JD analysis, drafts and history from this browser.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}

      {analysisTarget ? (
        <AnalysisPanel
          card={analysisTarget}
          onClose={() => setAnalysisTarget(null)}
          onScoreUpdated={handleScoreUpdated}
        />
      ) : null}

      {draftsTarget ? (
        <DraftsPanel card={draftsTarget} onClose={() => setDraftsTarget(null)} />
      ) : null}

      {roundsTarget ? (
        <RoundsPanel
          card={roundsTarget}
          onClose={() => setRoundsTarget(null)}
          onChanged={reloadRounds}
        />
      ) : null}

      {prepTarget ? <PrepPanel card={prepTarget} onClose={() => setPrepTarget(null)} /> : null}

      {notice ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {notice}
        </div>
      ) : null}
    </div>
  )
}
