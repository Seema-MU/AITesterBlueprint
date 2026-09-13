import { useCallback, useEffect, useRef, useState } from 'react'
import type { LLMSettings, MatchAnalysis, ResumeVersion } from '../lib/schema'
import { DEFAULT_LLM } from '../lib/schema'
import * as db from '../lib/db'
import { createResumeVersion, defaultResumeLabel, reparseResumeVersion, bestScoreForVersion } from '../lib/resumes'
import { ResumeFileError, RESUME_ACCEPT } from '../lib/resumeFile'
import { toBlob } from '../lib/base64'
import { LlmError } from '../lib/llm'
import { formatDate } from '../lib/utils'
import ConfirmDialog from '../components/ConfirmDialog'

interface Props {
  /** Lets App refresh the resume labels shown on the board cards. */
  onChanged: () => void
}

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400'

function scoreClass(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (score >= 45) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
}

export default function ResumesView({ onChanged }: Props) {
  const [versions, setVersions] = useState<ResumeVersion[] | null>(null)
  const [analyses, setAnalyses] = useState<MatchAnalysis[]>([])
  const [llm, setLlm] = useState<LLMSettings>(DEFAULT_LLM)
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ResumeVersion | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    const [loaded, allAnalyses, settings] = await Promise.all([
      db.listResumeVersions(),
      db.getAllMatchAnalyses(),
      db.getLlmSettings(),
    ])
    loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { versions: loaded, analyses: allAnalyses, llm: settings ?? DEFAULT_LLM }
  }, [])

  const applyAll = useCallback(
    (data: Awaited<ReturnType<typeof fetchAll>>) => {
      setVersions(data.versions)
      setAnalyses(data.analyses)
      setLlm(data.llm)
    },
    [],
  )

  const load = useCallback(async () => {
    applyAll(await fetchAll())
  }, [fetchAll, applyAll])

  useEffect(() => {
    let alive = true
    void (async () => {
      const data = await fetchAll()
      if (alive) applyAll(data)
    })()
    return () => {
      alive = false
    }
  }, [fetchAll, applyAll])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3000)
  }, [])

  const hasModel = Boolean(llm.model)

  async function handleUpload() {
    if (!file) return
    setError(null)
    setBusy('Reading the file…')
    try {
      setBusy(hasModel ? 'Parsing with your model…' : 'Saving…')
      const version = await createResumeVersion({ file, label, notes, llm })
      setFile(null)
      setLabel('')
      setNotes('')
      if (fileInput.current) fileInput.current.value = ''
      await load()
      onChanged()
      if (version.parseError) {
        setError(`Saved "${version.label}", but parsing failed: ${version.parseError}`)
      } else if (!hasModel) {
        flash(`Saved "${version.label}". Add a model in Settings, then press Re-parse.`)
      } else {
        flash(`Uploaded and parsed "${version.label}".`)
      }
    } catch (err) {
      setError(
        err instanceof ResumeFileError || err instanceof LlmError || err instanceof Error
          ? err.message
          : 'Upload failed.',
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleReparse(version: ResumeVersion) {
    setError(null)
    setBusy('Parsing with your model…')
    try {
      const updated = await reparseResumeVersion(version, llm)
      await load()
      onChanged()
      if (updated.parseError) setError(`Re-parse failed: ${updated.parseError}`)
      else flash(`Parsed "${updated.label}" — ${updated.parsed?.skills.length ?? 0} skills found.`)
    } finally {
      setBusy(null)
    }
  }

  async function handleMakePrimary(version: ResumeVersion) {
    setError(null)
    await db.setPrimaryResumeVersion(version.id)
    await load()
    onChanged()
    flash(`"${version.label}" is now the primary resume.`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await db.deleteResumeVersion(target.id)
    setDeleteTarget(null)
    await load()
    onChanged()
    flash(`Deleted "${target.label}".`)
  }

  function download(version: ResumeVersion) {
    const url = URL.createObjectURL(toBlob(version.fileData, version.fileMimeType))
    const a = document.createElement('a')
    a.href = url
    a.download = version.fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Resume library</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Upload each resume version you send out. Text is extracted in your browser, the original file
        is stored so you can download it again, and one version is always marked primary — the
        default for matching and for job cards that don't name a version.
      </p>

      {!hasModel ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          No model configured in Settings. Uploads are saved with their extracted text, but AI
          parsing is skipped until you set a model and press Re-parse.
        </p>
      ) : null}

      <section className="mt-5 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upload a resume</h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass} htmlFor="r-file">
              File (.pdf or .docx)
            </label>
            <input
              id="r-file"
              ref={fileInput}
              type="file"
              accept={RESUME_ACCEPT}
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null
                setFile(chosen)
                if (chosen && !label.trim()) setLabel(defaultResumeLabel(chosen.name))
              }}
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="r-label">
                Version label
              </label>
              <input
                id="r-label"
                className={inputClass}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="QA_Resume_CGI_v2"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="r-notes">
                Notes
              </label>
              <input
                id="r-notes"
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. tailored for CGI AI QA role"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || busy !== null}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ?? 'Upload & parse'}
            </button>
            {busy ? <span className="text-xs text-zinc-400">{busy}</span> : null}
          </div>
        </div>
      </section>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Versions {versions ? `(${versions.length})` : ''}
        </h3>
        {!versions ? (
          <p className="mt-3 text-sm text-zinc-400">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">
            No resumes yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {versions.map((version) => {
              const best = bestScoreForVersion(analyses, version.id)
              const skillCount = version.parsed?.skills.length ?? 0
              return (
                <li
                  key={version.id}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {version.label}
                    </span>
                    {version.isPrimary ? (
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Primary
                      </span>
                    ) : null}
                    {best !== undefined ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreClass(best)}`}>
                        best {best}% match
                      </span>
                    ) : null}
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      {!version.isPrimary ? (
                        <button
                          type="button"
                          onClick={() => handleMakePrimary(version)}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Make primary
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => download(version)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReparse(version)}
                        disabled={busy !== null || !hasModel}
                        title={hasModel ? undefined : 'Set a model in Settings first.'}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Re-parse
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(version)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] text-zinc-400">
                    {version.fileName} · uploaded {formatDate(version.createdAt.slice(0, 10))} ·{' '}
                    {skillCount} skill{skillCount === 1 ? '' : 's'}
                    {version.parsed?.totalYears != null ? ` · ~${version.parsed.totalYears} yrs` : ''}
                    {version.notes ? ` · ${version.notes}` : ''}
                  </p>

                  {version.parseError ? (
                    <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Parsing failed: {version.parseError}
                    </p>
                  ) : !version.parsed ? (
                    <p className="mt-2 text-[11px] text-zinc-400">
                      Not parsed yet — press Re-parse.
                    </p>
                  ) : (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">
                        Parsed details
                      </summary>
                      <div className="mt-2 space-y-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                        <div className="flex flex-wrap gap-1">
                          {version.parsed.skills.map((skill) => (
                            <span
                              key={skill.name}
                              title={skill.evidence[0] ?? ''}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                            >
                              {skill.name}
                              {skill.years ? ` · ${skill.years}y` : ''}
                            </span>
                          ))}
                        </div>
                        {version.parsed.roles.length > 0 ? (
                          <p>
                            <span className="text-zinc-400">Roles: </span>
                            {version.parsed.roles.map((r) => r.title).join(' · ')}
                          </p>
                        ) : null}
                        {version.parsed.certifications.length > 0 ? (
                          <p>
                            <span className="text-zinc-400">Certifications: </span>
                            {version.parsed.certifications.map((c) => c.name).join(' · ')}
                          </p>
                        ) : null}
                        {version.modelUsed ? (
                          <p className="text-zinc-400">Parsed with {version.modelUsed}</p>
                        ) : null}
                      </div>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete resume version?"
          message={`This removes "${deleteTarget.label}" and its stored file from this browser. Job cards that used it will fall back to your primary resume; existing match analyses are kept.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}
    </div>
  )
}
