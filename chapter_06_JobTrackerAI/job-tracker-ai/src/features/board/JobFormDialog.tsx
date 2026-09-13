import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { JobCard, JobForm, ResumeVersion, Status } from '../../lib/schema'
import { COLUMN_LABELS, EMPTY_FORM, JobFormSchema, STATUSES } from '../../lib/schema'

interface Props {
  /** Open as right slide-over when true, centered modal when false. */
  slideOver: boolean
  /** Card being edited (edit mode); otherwise a fresh create form. */
  editing?: JobCard
  /** Initial column for a fresh create form. */
  initialStatus: Status
  /** Stored resume versions, for the "resume used" dropdown. */
  resumeVersions: ResumeVersion[]
  onClose: () => void
  onSubmit: (form: JobForm) => void
}

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400'

export default function JobFormDialog({
  slideOver,
  editing,
  initialStatus,
  resumeVersions,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<JobForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (editing) {
      setForm({
        company: editing.company,
        role: editing.role,
        jobUrl: editing.jobUrl ?? '',
        jdRawText: editing.jdRawText ?? '',
        resumeVersionId: editing.resumeVersionId ?? '',
        dateApplied: editing.dateApplied,
        salaryRange: editing.salaryRange ?? '',
        notes: editing.notes ?? '',
        status: editing.status,
      })
    } else {
      setForm({ ...EMPTY_FORM, status: initialStatus })
    }
    setErrors({})
  }, [editing, initialStatus])

  function set<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = JobFormSchema.safeParse({
      ...form,
      jobUrl: form.jobUrl?.trim() || undefined,
      jdRawText: form.jdRawText?.trim() || undefined,
      resumeVersionId: form.resumeVersionId?.trim() || undefined,
      salaryRange: form.salaryRange?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    })
    if (!parsed.success) {
      const flat: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!flat[key]) flat[key] = issue.message
      }
      setErrors(flat)
      return
    }
    onSubmit(parsed.data)
  }

  const title = editing ? 'Edit job' : 'Add job'

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute flex max-h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 ${
          slideOver
            ? 'inset-y-0 right-0 w-full max-w-md rounded-r-none'
            : 'inset-0 m-auto h-fit max-h-[90vh] w-full max-w-lg'
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <div>
            <label className={labelClass} htmlFor="f-company">
              Company *
            </label>
            <input
              id="f-company"
              className={inputClass}
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
              placeholder="e.g. CGI"
            />
            {errors.company ? <p className="mt-1 text-xs text-rose-500">{errors.company}</p> : null}
          </div>

          <div>
            <label className={labelClass} htmlFor="f-role">
              Role *
            </label>
            <input
              id="f-role"
              className={inputClass}
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              placeholder="e.g. Senior QA Automation Engineer"
            />
            {errors.role ? <p className="mt-1 text-xs text-rose-500">{errors.role}</p> : null}
          </div>

          <div>
            <label className={labelClass} htmlFor="f-url">
              Job URL
            </label>
            <input
              id="f-url"
              className={inputClass}
              value={form.jobUrl ?? ''}
              onChange={(e) => set('jobUrl', e.target.value)}
              placeholder="https://www.linkedin.com/jobs/…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="f-date">
                Date
              </label>
              <input
                id="f-date"
                type="date"
                className={inputClass}
                value={form.dateApplied}
                onChange={(e) => set('dateApplied', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="f-salary">
                Salary range
              </label>
              <input
                id="f-salary"
                className={inputClass}
                value={form.salaryRange ?? ''}
                onChange={(e) => set('salaryRange', e.target.value)}
                placeholder="₹25-30 LPA"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-resume">
              Resume used
            </label>
            <select
              id="f-resume"
              className={inputClass}
              value={form.resumeVersionId ?? ''}
              onChange={(e) => set('resumeVersionId', e.target.value)}
            >
              <option value="">
                {resumeVersions.length === 0
                  ? 'No resume versions yet — upload one in Resumes'
                  : 'Use the primary resume'}
              </option>
              {resumeVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.isPrimary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">
              Recorded so you always know which resume you sent to this company.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-status">
              Status
            </label>
            <select
              id="f-status"
              className={inputClass}
              value={form.status}
              onChange={(e) => set('status', e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COLUMN_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-jd">
              Job description (JD text)
            </label>
            <textarea
              id="f-jd"
              className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
              value={form.jdRawText ?? ''}
              onChange={(e) => set('jdRawText', e.target.value)}
              placeholder={'Paste the full job description here.\nIt will be used later to match against your resume and extract required skills.'}
            />
            {form.jdRawText ? (
              <p className="mt-1 text-[11px] text-zinc-400">
                ~{form.jdRawText.trim().split(/\s+/).length} words saved
              </p>
            ) : null}
          </div>

          <div className="flex-1">
            <label className={labelClass} htmlFor="f-notes">
              Notes
            </label>
            <textarea
              id="f-notes"
              className={`${inputClass} min-h-20 resize-y`}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Recruiter name, referral, salary ask…"
            />
          </div>

          <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Save
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
