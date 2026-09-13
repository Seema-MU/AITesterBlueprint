import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  JobCard,
  LLMSettings,
  MatchAnalysis,
  MasterProfile,
  JobSpec,
  ResumeVersion,
} from '../../lib/schema'
import { DEFAULT_LLM, EMPTY_PROFILE, PROFILE_ID } from '../../lib/schema'
import * as db from '../../lib/db'
import { analyzeJobCard } from '../../lib/analysis'
import { resolveResume } from '../../lib/resumes'
import { LlmError } from '../../lib/llm'
import { formatDate } from '../../lib/utils'

interface Props {
  card: JobCard
  onClose: () => void
  /** Persist the new score onto the card (App handles the optimistic write). */
  onScoreUpdated: (cardId: string, score: number) => void
}

interface LoadedData {
  profile: MasterProfile
  llm: LLMSettings
  versions: ResumeVersion[]
  spec?: JobSpec
  analysis?: MatchAnalysis
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 45) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export default function AnalysisPanel({ card, onClose, onScoreUpdated }: Props) {
  const [data, setData] = useState<LoadedData | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Empty means "use the resolved default" (card's version → primary → profile text). */
  const [pickedVersionId, setPickedVersionId] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      const [profile, llm, versions, spec, analyses] = await Promise.all([
        db.getProfile(),
        db.getLlmSettings(),
        db.listResumeVersions(),
        db.getSpecForJob(card.id),
        db.listAnalysesForJob(card.id),
      ])
      if (!alive) return
      analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setData({
        profile: profile ?? EMPTY_PROFILE,
        llm: llm ?? DEFAULT_LLM,
        versions,
        spec,
        analysis: analyses[0],
      })
    })()
    return () => {
      alive = false
    }
  }, [card.id])

  const resolved = useMemo(
    () => (data ? resolveResume(card, data.versions, data.profile) : null),
    [card, data],
  )

  const resumeVersionId = pickedVersionId || resolved?.resumeVersionId || PROFILE_ID
  const resumeText = useMemo(() => {
    if (!data) return ''
    if (resumeVersionId === PROFILE_ID) return data.profile.resumeText
    return data.versions.find((v) => v.id === resumeVersionId)?.rawText ?? ''
  }, [data, resumeVersionId])

  const resumeLabel =
    data?.versions.find((v) => v.id === resumeVersionId)?.label ??
    (resumeVersionId === PROFILE_ID ? 'Profile text' : 'Unknown resume')

  const runAnalysis = useCallback(async () => {
    if (!data) return
    setError(null)
    setRunning(true)
    try {
      const jd = card.jdRawText?.trim() ?? ''
      const resume = resumeText.trim()
      const guards: string[] = []
      if (!jd) guards.push('Paste a job description on the card first (Edit → Job description).')
      if (!resume) guards.push('Upload a resume in the Resumes tab, or paste resume text in Profile.')
      if (!data.llm.model) guards.push('Set the model name in Settings (must match one loaded in LM Studio).')
      if (guards.length > 0) {
        setError(guards.join(' '))
        setRunning(false)
        return
      }
      const { spec, analysis } = await analyzeJobCard(
        card.id,
        jd,
        resume,
        data.llm,
        resumeVersionId,
      )
      setData((prev) => (prev ? { ...prev, spec, analysis } : prev))
      onScoreUpdated(card.id, analysis.overallScore)
    } catch (err) {
      setError(
        err instanceof LlmError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Analysis failed.',
      )
    } finally {
      setRunning(false)
    }
  }, [card.id, card.jdRawText, data, resumeText, resumeVersionId, onScoreUpdated])

  const analysis = data?.analysis
  const spec = data?.spec

  const analysisResumeLabel =
    data?.versions.find((v) => v.id === analysis?.resumeVersionId)?.label ?? 'Profile text'

  const hasResume = resumeText.trim().length > 0
  const hasJd = Boolean(card.jdRawText?.trim())
  const hasModel = Boolean(data?.llm.model)
  const canRun = hasResume && hasJd && hasModel && !running

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Match analysis — ${card.company}`}
        className="absolute inset-0 m-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Match analysis
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {card.company} — {card.role}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {data ? (
            <div className="mb-4 space-y-2">
              {data.versions.length > 0 ? (
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400"
                    htmlFor="a-resume"
                  >
                    Match against
                  </label>
                  <select
                    id="a-resume"
                    value={resumeVersionId}
                    onChange={(e) => setPickedVersionId(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700"
                  >
                    {data.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                        {v.isPrimary ? ' (primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">
                  No resume versions yet — matching against your pasted profile text. Upload resumes in
                  the Resumes tab.
                </p>
              )}
              <p className="text-[11px] text-zinc-400">
                Matching against:{' '}
                <span className="font-medium text-zinc-600 dark:text-zinc-300">{resumeLabel}</span>
              </p>
            </div>
          ) : null}

          {!data ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : analysis ? (
            <div className="space-y-5">
              {/* Score header */}
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={`text-4xl font-bold ${scoreColor(analysis.overallScore)}`}
                  aria-label={`${analysis.overallScore} percent match`}
                >
                  {analysis.overallScore}
                  <span className="text-lg">%</span>
                </div>
                <div className="min-w-52 flex-1 space-y-1.5">
                  {[
                    ['Required skills', analysis.subScores.requiredCoverage],
                    ['Preferred skills', analysis.subScores.preferredCoverage],
                    ['Seniority fit', analysis.subScores.seniorityFit],
                    ['Domain fit', analysis.subScores.domainFit],
                    ['ATS keywords', analysis.subScores.atsKeywordCoverage],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 text-zinc-500 dark:text-zinc-400">
                        {label as string}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300"
                          style={{ width: pct(value as number) }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {pct(value as number)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-zinc-400">
                Score is computed by the app (deterministic formula), never by the model ·{' '}
                {analysis.modelUsed} · {formatDate(analysis.createdAt.slice(0, 10))} · resume:{' '}
                {analysisResumeLabel} ·{' '}
                {spec ? `JD skills: ${spec.requiredSkills.length} required / ${spec.preferredSkills.length} preferred` : ''}
              </p>

              {/* Matched */}
              {analysis.matched.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Matched ({analysis.matched.length})
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {analysis.matched.map((m) => (
                      <li key={m.name} className="rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</p>
                        <p className="mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400">
                          “{m.resumeSnippet}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Blocking */}
              {analysis.missingBlocking.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    Missing — blocking ({analysis.missingBlocking.length})
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {analysis.missingBlocking.map((m) => (
                      <li key={m.name} className="rounded-md border border-rose-200 p-2.5 dark:border-rose-950">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          JD says: “{m.jdEvidence}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Nice to have */}
              {analysis.missingNiceToHave.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Missing — nice to have ({analysis.missingNiceToHave.length})
                  </h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {analysis.missingNiceToHave.map((m) => (
                      <li
                        key={m.name}
                        title={`JD says: ${m.jdEvidence}`}
                        className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        {m.name}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {analysis.atsGapKeywords.length === 0 && analysis.missingBlocking.length === 0 ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Every skill in this JD is already evidenced in your resume.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Run an analysis to see how this JD matches your resume profile: a deterministic
                match score, skills you already evidence, and what is missing.
              </p>
              <ul className="space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <li className={hasResume ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                  {hasResume ? '✓' : '○'} Resume available ({resumeLabel})
                </li>
                <li className={hasJd ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                  {hasJd ? '✓' : '○'} Job description pasted on this card
                </li>
                <li className={hasModel ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                  {hasModel ? '✓' : '○'} Model configured in Settings
                </li>
              </ul>
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <p className="text-[11px] text-zinc-400">
            {running ? 'Analysing with your model…' : 'Results are cached — repeat runs are free.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={!canRun}
              title={
                canRun
                  ? undefined
                  : 'Add resume text (Profile), a JD (Edit), and a model (Settings) first.'
              }
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {analysis ? 'Run again' : running ? 'Analysing…' : 'Analyse match'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
