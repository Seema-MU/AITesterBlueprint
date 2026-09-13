import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Artifact, JobCard, LLMSettings, MasterProfile, ResumeVersion } from '../../lib/schema'
import { DEFAULT_LLM, EMPTY_PROFILE } from '../../lib/schema'
import * as db from '../../lib/db'
import { generatePrep, prepKey, togglePrepPractised } from '../../lib/artifacts'
import { resolveResume } from '../../lib/resumes'
import { LlmError } from '../../lib/llm'

interface Props {
  card: JobCard
  onClose: () => void
}

interface LoadedData {
  profile: MasterProfile
  llm: LLMSettings
  versions: ResumeVersion[]
  artifact?: Artifact
}

export default function PrepPanel({ card, onClose }: Props) {
  const [data, setData] = useState<LoadedData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [profile, llm, versions, artifacts] = await Promise.all([
        db.getProfile(),
        db.getLlmSettings(),
        db.listResumeVersions(),
        db.listArtifactsForJob(card.id),
      ])
      if (!alive) return
      setData({
        profile: profile ?? EMPTY_PROFILE,
        llm: llm ?? DEFAULT_LLM,
        versions,
        artifact: artifacts.find((a) => a.kind === 'prep'),
      })
    })()
    return () => {
      alive = false
    }
  }, [card.id])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }, [])

  /** Same grounding rule as the drafts panel: card's version → primary → pasted profile. */
  const resume = useMemo(
    () => (data ? resolveResume(card, data.versions, data.profile) : null),
    [card, data],
  )

  const hasResume = (resume?.resumeText.trim().length ?? 0) > 0
  const hasJd = Boolean(card.jdRawText?.trim())
  const hasModel = Boolean(data?.llm.model)

  const disabledReason = useMemo(() => {
    const gaps: string[] = []
    if (!hasResume) gaps.push('upload a resume (or paste resume text in the Profile tab)')
    if (!hasJd) gaps.push('paste a job description on this card (Edit → Job description)')
    if (!hasModel) gaps.push('set the model name in Settings')
    if (gaps.length === 0) return undefined
    return `To generate: ${gaps.join('; ')}.`
  }, [hasResume, hasJd, hasModel])

  const artifact = data?.artifact
  const plan = artifact?.prep

  const generate = useCallback(
    async (force: boolean) => {
      if (!data || !resume) return
      setError(null)
      setBusy(true)
      try {
        const result = await generatePrep({
          input: {
            jobCardId: card.id,
            name: data.profile.name,
            headline: data.profile.headline,
            resumeText: resume.resumeText,
            company: card.company,
            role: card.role,
            jdText: card.jdRawText ?? '',
            notes: card.notes,
          },
          llm: data.llm,
          existing: data.artifact ? [data.artifact] : [],
          force,
        })
        setData((prev) => (prev ? { ...prev, artifact: result } : prev))
        flash(force ? 'Regenerated — ticks reset.' : 'Prep generated.')
      } catch (err) {
        setError(
          err instanceof LlmError || err instanceof Error ? err.message : 'Preparation failed.',
        )
      } finally {
        setBusy(false)
      }
    },
    [card, data, resume, flash],
  )

  const toggle = useCallback(
    async (key: string) => {
      if (!artifact) return
      try {
        const updated = await togglePrepPractised(artifact, key)
        setData((prev) => (prev ? { ...prev, artifact: updated } : prev))
      } catch {
        setError('Could not save that tick to local storage.')
      }
    },
    [artifact],
  )

  const copy = useCallback(async () => {
    if (!artifact) return
    try {
      await navigator.clipboard.writeText(artifact.content)
      flash('Prep plan copied to clipboard.')
    } catch {
      flash('Clipboard access was blocked — select the text and copy manually.')
    }
  }, [artifact, flash])

  const total = useMemo(
    () => plan?.topics.reduce((n, t) => n + t.questions.length, 0) ?? 0,
    [plan],
  )
  const done = useMemo(
    () => artifact?.practised.filter((k) => keyExists(plan, k)).length ?? 0,
    [artifact, plan],
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Interview prep — ${card.company}`}
        className="absolute inset-0 m-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Interview prep
            </h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {card.company} — {card.role}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {artifact ? (
              <button
                type="button"
                onClick={copy}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Copy
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => generate(Boolean(artifact))}
              disabled={busy || Boolean(disabledReason)}
              title={disabledReason}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? 'Generating…' : artifact ? 'Regenerate' : 'Generate'}
            </button>
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
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!data ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <>
              {disabledReason ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {disabledReason}
                </p>
              ) : null}

              {resume ? (
                <p className="text-[11px] text-zinc-400">
                  Grounded in:{' '}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    {resume.label}
                  </span>
                </p>
              ) : null}

              {artifact && plan ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    <span>
                      {done}/{total} practised
                    </span>
                    <span>
                      {artifact.edited ? 'edited' : 'generated'} · {artifact.modelUsed}
                    </span>
                  </div>

                  {plan.topics.map((topic, topicIndex) => (
                    <section
                      key={`${topic.topic}-${topicIndex}`}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {topic.topic}
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {topic.questions.map((question, questionIndex) => {
                          const key = prepKey(topicIndex, questionIndex)
                          const ticked = artifact.practised.includes(key)
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                                <input
                                  type="checkbox"
                                  checked={ticked}
                                  onChange={() => void toggle(key)}
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800"
                                />
                                <span
                                  className={
                                    ticked ? 'text-zinc-400 line-through dark:text-zinc-500' : ''
                                  }
                                >
                                  {question}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </>
              ) : (
                <p className="rounded-md border border-dashed border-zinc-300 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                  {busy
                    ? 'Building a question set from this job description and your resume…'
                    : 'No prep yet. Generate a topic-grouped question set drawn from this job description.'}
                </p>
              )}
            </>
          )}

          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <p className="text-[11px] text-zinc-400">
            {notice ?? 'Ticks are stored with the plan on this card.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Guards the practised counter against keys left over from an older plan. */
function keyExists(plan: Artifact['prep'], key: string): boolean {
  if (!plan) return false
  const [topicIndex, questionIndex] = key.split(':').map(Number)
  return Boolean(plan.topics[topicIndex]?.questions[questionIndex])
}
