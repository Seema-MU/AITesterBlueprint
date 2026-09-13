import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Artifact, JobCard, LLMSettings, MasterProfile, ResumeVersion } from '../../lib/schema'
import { DEFAULT_LLM, EMPTY_PROFILE } from '../../lib/schema'
import * as db from '../../lib/db'
import { generateCoverLetter, generateDm, generateFollowUps, artifactKey } from '../../lib/artifacts'
import { resolveResume } from '../../lib/resumes'
import {
  DM_MAX_CHARS,
  FOLLOWUP_DAYS,
  FOLLOWUP_THEMES,
  FOLLOWUP_VARIANTS,
  type FollowUpDay,
} from '../../lib/prompts'
import { LlmError } from '../../lib/llm'

interface Props {
  card: JobCard
  onClose: () => void
}

interface LoadedData {
  profile: MasterProfile
  llm: LLMSettings
  versions: ResumeVersion[]
  artifacts: Artifact[]
}

const FOLLOWUP_LABELS = Object.fromEntries(
  FOLLOWUP_DAYS.map((day) => [day, `Day ${day} — ${FOLLOWUP_THEMES[day]}`]),
) as Record<FollowUpDay, string>

interface CardProps {
  label: string
  hint?: string
  artifact?: Artifact
  value: string
  dirty: boolean
  placeholder: string
  charLimit?: number
  busy: boolean
  disabled: boolean
  disabledReason?: string
  onChange: (value: string) => void
  onGenerate: (force: boolean) => void
  onSave: () => void
  onNotice: (message: string) => void
}

function ArtifactCard({
  label,
  hint,
  artifact,
  value,
  dirty,
  placeholder,
  charLimit,
  busy,
  disabled,
  disabledReason,
  onChange,
  onGenerate,
  onSave,
  onNotice,
}: CardProps) {
  const [copied, setCopied] = useState(false)
  const overLimit = charLimit !== undefined && value.length > charLimit

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onNotice(`${label} copied to clipboard.`)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      onNotice('Clipboard access was blocked — select the text and copy manually.')
    }
  }, [value, label, onNotice])

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</h3>
        {artifact ? (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {artifact.edited ? 'edited' : 'generated'} · {artifact.modelUsed}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400">not generated yet</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {artifact ? (
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onGenerate(Boolean(artifact))}
            disabled={busy || disabled}
            title={disabled ? disabledReason : undefined}
            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? 'Generating…' : artifact ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </header>
      {hint ? <p className="mt-1 text-[11px] text-zinc-400">{hint}</p> : null}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={disabled && disabledReason ? disabledReason : placeholder}
        aria-label={label}
        className="mt-2 min-h-40 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700"
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {dirty ? (
          <button
            type="button"
            onClick={onSave}
            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Save edit
          </button>
        ) : (
          <span className="text-[11px] text-zinc-400">Edits are saved locally.</span>
        )}
        <span className={`text-[11px] ${overLimit ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
          {charLimit !== undefined
            ? `${value.length}/${charLimit} characters${overLimit ? ' — over the limit, trim before sending' : ''}`
            : `${value.trim() ? value.trim().split(/\s+/).length : 0} words`}
        </span>
      </div>
    </section>
  )
}

export default function DraftsPanel({ card, onClose }: Props) {
  const [data, setData] = useState<LoadedData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Unsaved edits keyed by artifactKey; absent means "show the stored content". */
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }))
  }, [])

  const valueFor = useCallback(
    (key: string, artifact?: Artifact) => drafts[key] ?? artifact?.content ?? '',
    [drafts],
  )

  const dirtyFor = useCallback(
    (key: string, artifact?: Artifact) =>
      drafts[key] !== undefined && drafts[key] !== (artifact?.content ?? ''),
    [drafts],
  )

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
      setData({ profile: profile ?? EMPTY_PROFILE, llm: llm ?? DEFAULT_LLM, versions, artifacts })
    })()
    return () => {
      alive = false
    }
  }, [card.id])

  /** Which resume these drafts are grounded in: card's own version → primary → pasted profile. */
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

  const args = useCallback(
    (force: boolean) => {
      if (!data || !resume) throw new Error('Drafts are still loading.')
      return {
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
        existing: data.artifacts,
        force,
      }
    },
    [card, data, resume],
  )

  const run = useCallback(
    async <T,>(label: string, task: () => Promise<T>): Promise<T | undefined> => {
      setError(null)
      setBusy(label)
      try {
        return await task()
      } catch (err) {
        setError(err instanceof LlmError || err instanceof Error ? err.message : 'Generation failed.')
        return undefined
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  /** Replace-or-insert generated artifacts in local state (ids are stable across regeneration). */
  const merge = useCallback((incoming: Artifact[]) => {
    setData((prev) => {
      if (!prev) return prev
      const ids = new Set(incoming.map((a) => a.id))
      return { ...prev, artifacts: [...prev.artifacts.filter((a) => !ids.has(a.id)), ...incoming] }
    })
    setDrafts((prev) => {
      const next = { ...prev }
      for (const a of incoming) delete next[artifactKey(a.kind, a.variant)]
      return next
    })
  }, [])

  const runCoverLetter = useCallback(
    async (force: boolean) => {
      const result = await run('coverLetter', () => generateCoverLetter(args(force)))
      if (result) merge([result])
    },
    [args, run, merge],
  )

  const runFollowUps = useCallback(
    async (force: boolean) => {
      const result = await run('followUp', () => generateFollowUps(args(force)))
      if (result) merge(result)
    },
    [args, run, merge],
  )

  const runDm = useCallback(
    async (force: boolean) => {
      const result = await run('dm', () => generateDm(args(force)))
      if (result) merge([result])
    },
    [args, run, merge],
  )

  const saveEdit = useCallback(
    async (artifact: Artifact, key: string) => {
      const content = (drafts[key] ?? artifact.content).trim()
      if (!content) {
        setError('An artifact cannot be saved empty.')
        return
      }
      setError(null)
      const updated: Artifact = { ...artifact, content, edited: true }
      await db.saveArtifact(updated)
      setData((prev) =>
        prev
          ? { ...prev, artifacts: prev.artifacts.map((a) => (a.id === updated.id ? updated : a)) }
          : prev,
      )
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setNotice('Edit saved locally.')
      window.setTimeout(() => setNotice(null), 2500)
    },
    [drafts],
  )

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }, [])

  const byKey = useMemo(() => {
    const map = new Map<string, Artifact>()
    for (const a of data?.artifacts ?? []) map.set(artifactKey(a.kind, a.variant), a)
    return map
  }, [data?.artifacts])

  const coverLetter = byKey.get('coverLetter')
  const dm = byKey.get('dm')

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Copilot drafts — ${card.company}`}
        className="absolute inset-0 m-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Copilot drafts</h2>
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
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">{resume.label}</span>
                </p>
              ) : null}

              <ArtifactCard
                label="Cover letter"
                hint="Formal 250–350 words, grounded in your resume. Regenerate costs tokens; repeat opens are free."
                artifact={coverLetter}
                value={valueFor('coverLetter', coverLetter)}
                dirty={dirtyFor('coverLetter', coverLetter)}
                placeholder="Generate a cover letter for this job."
                busy={busy === 'coverLetter'}
                disabled={Boolean(disabledReason)}
                disabledReason={disabledReason}
                onChange={(v) => setDraft('coverLetter', v)}
                onGenerate={runCoverLetter}
                onSave={() => coverLetter && saveEdit(coverLetter, 'coverLetter')}
                onNotice={flash}
              />

              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Outreach sequence
                  </h3>
                  <span className="text-[10px] text-zinc-400">5 emails · day 1 → day 5</span>
                  <button
                    type="button"
                    onClick={() => runFollowUps(FOLLOWUP_DAYS.some((d) => byKey.get(artifactKey('followUp', FOLLOWUP_VARIANTS[d]))))}
                    disabled={busy === 'followUp' || Boolean(disabledReason)}
                    title={disabledReason}
                    className="ml-auto rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    {busy === 'followUp'
                      ? 'Generating…'
                      : FOLLOWUP_DAYS.some((d) => byKey.get(artifactKey('followUp', FOLLOWUP_VARIANTS[d])))
                        ? 'Regenerate all'
                        : 'Generate all'}
                  </button>
                </div>
                {FOLLOWUP_DAYS.map((day) => {
                  const variant = FOLLOWUP_VARIANTS[day]
                  const key = artifactKey('followUp', variant)
                  const artifact = byKey.get(key)
                  return (
                    <ArtifactCard
                      key={variant}
                      label={FOLLOWUP_LABELS[day]}
                      artifact={artifact}
                      value={valueFor(key, artifact)}
                      dirty={dirtyFor(key, artifact)}
                      placeholder="Not generated yet — use Generate all above."
                      busy={busy === 'followUp'}
                      disabled={Boolean(disabledReason)}
                      disabledReason={disabledReason}
                      onChange={(v) => setDraft(key, v)}
                      onGenerate={() => runFollowUps(true)}
                      onSave={() => artifact && saveEdit(artifact, key)}
                      onNotice={flash}
                    />
                  )
                })}
              </section>

              <ArtifactCard
                label="Recruiter DM"
                hint="Short outreach message. Plain text, no subject line."
                artifact={dm}
                value={valueFor('dm', dm)}
                dirty={dirtyFor('dm', dm)}
                placeholder="Generate a short recruiter message."
                charLimit={DM_MAX_CHARS}
                busy={busy === 'dm'}
                disabled={Boolean(disabledReason)}
                disabledReason={disabledReason}
                onChange={(v) => setDraft('dm', v)}
                onGenerate={runDm}
                onSave={() => dm && saveEdit(dm, 'dm')}
                onNotice={flash}
              />
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
            {notice ?? 'Generated copy is stored on this card and included in your JSON backup.'}
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
