import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { InterviewOutcome, InterviewRound, InterviewRoundForm, JobCard } from '../../lib/schema'
import {
  EMPTY_ROUND_FORM,
  INTERVIEW_FORMATS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_OUTCOME_LABELS,
  InterviewRoundFormSchema,
} from '../../lib/schema'
import * as db from '../../lib/db'
import { formatDateTime, newId } from '../../lib/utils'
import ConfirmDialog from '../../components/ConfirmDialog'

interface Props {
  card: JobCard
  onClose: () => void
  /** Lets the shell refresh the per-card round badges after any write. */
  onChanged: () => void
}

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400'

const OUTCOME_TONE: Record<InterviewOutcome, string> = {
  pending: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  passed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  cancelled: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

interface DialogProps {
  cardId: string
  /** Round being edited; omitted when adding. */
  initial?: InterviewRound
  /** Display order for a new round (max existing + 1). */
  nextRound: number
  onCancel: () => void
  onSubmit: (round: InterviewRound) => void
}

/** Seed values for the round form: the round being edited, or a blank one. */
function initialRoundForm(initial: InterviewRound | undefined): InterviewRoundForm {
  if (!initial) return { ...EMPTY_ROUND_FORM }
  return {
    label: initial.label ?? '',
    scheduledAt: initial.scheduledAt,
    durationMins: initial.durationMins,
    interviewer: initial.interviewer ?? '',
    format: initial.format,
    outcome: initial.outcome,
    notes: initial.notes ?? '',
  }
}

function RoundDialog({ cardId, initial, nextRound, onCancel, onSubmit }: DialogProps) {
  // Seeded once from props; the parent remounts this dialog via `key` when the target
  // changes, so there is no prop-syncing effect (and no cascading render on open).
  const [form, setForm] = useState<InterviewRoundForm>(() => initialRoundForm(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = InterviewRoundFormSchema.safeParse({
      label: form.label?.trim() || undefined,
      scheduledAt: form.scheduledAt,
      durationMins: form.durationMins,
      interviewer: form.interviewer?.trim() || undefined,
      format: form.format,
      outcome: form.outcome,
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
    onSubmit({
      id: initial?.id ?? newId(),
      jobCardId: cardId,
      round: initial?.round ?? nextRound,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      ...parsed.data,
    })
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onCancel} aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Edit round' : 'Add round'}
        onSubmit={handleSubmit}
        className="absolute inset-0 m-auto flex h-fit max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {initial ? `Edit round ${initial.round}` : `Add round ${nextRound}`}
          </h3>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <div>
            <label className={labelClass} htmlFor="r-when">
              Date and time *
            </label>
            <input
              id="r-when"
              type="datetime-local"
              className={inputClass}
              value={form.scheduledAt}
              onChange={(e) => set('scheduledAt', e.target.value)}
            />
            {errors.scheduledAt ? (
              <p className="mt-1 text-xs text-rose-500">{errors.scheduledAt}</p>
            ) : null}
          </div>

          <div>
            <label className={labelClass} htmlFor="r-label">
              Round name
            </label>
            <input
              id="r-label"
              className={inputClass}
              value={form.label ?? ''}
              onChange={(e) => set('label', e.target.value)}
              placeholder="e.g. Technical screen, Hiring manager call"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="r-format">
                Format
              </label>
              <select
                id="r-format"
                className={inputClass}
                value={form.format}
                onChange={(e) => set('format', e.target.value as InterviewRound['format'])}
              >
                {INTERVIEW_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {INTERVIEW_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="r-duration">
                Duration (mins)
              </label>
              <input
                id="r-duration"
                type="number"
                min={1}
                className={inputClass}
                value={form.durationMins ?? ''}
                onChange={(e) =>
                  set('durationMins', e.target.value ? Number(e.target.value) : undefined)
                }
                placeholder="60"
              />
              {errors.durationMins ? (
                <p className="mt-1 text-xs text-rose-500">{errors.durationMins}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="r-interviewer">
              Interviewer
            </label>
            <input
              id="r-interviewer"
              className={inputClass}
              value={form.interviewer ?? ''}
              onChange={(e) => set('interviewer', e.target.value)}
              placeholder="Name or role of who you'll meet"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="r-outcome">
              Outcome
            </label>
            <select
              id="r-outcome"
              className={inputClass}
              value={form.outcome}
              onChange={(e) => set('outcome', e.target.value as InterviewOutcome)}
            >
              {INTERVIEW_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {INTERVIEW_OUTCOME_LABELS[o]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="r-notes">
              Notes
            </label>
            <textarea
              id="r-notes"
              className={`${inputClass} min-h-20 resize-y`}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Topics to revise, questions to ask, panel names…"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Save round
          </button>
        </footer>
      </form>
    </div>
  )
}

export default function RoundsPanel({ card, onClose, onChanged }: Props) {
  const [rounds, setRounds] = useState<InterviewRound[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<InterviewRound | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InterviewRound | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = await db.listRoundsForJob(card.id)
      if (!alive) return
      setRounds(loaded)
    })()
    return () => {
      alive = false
    }
  }, [card.id])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }, [])

  const nextRound = useMemo(
    () => (rounds && rounds.length > 0 ? Math.max(...rounds.map((r) => r.round)) + 1 : 1),
    [rounds],
  )

  const ordered = useMemo(
    () => [...(rounds ?? [])].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [rounds],
  )

  const save = useCallback(
    async (round: InterviewRound) => {
      setError(null)
      try {
        await db.saveRound(round)
        setRounds((prev) => {
          const list = prev ?? []
          return list.some((r) => r.id === round.id)
            ? list.map((r) => (r.id === round.id ? round : r))
            : [...list, round]
        })
        setAdding(false)
        setEditing(null)
        flash('Round saved.')
        onChanged()
      } catch {
        setError('Could not save this round to local storage.')
      }
    },
    [flash, onChanged],
  )

  const remove = useCallback(
    async (round: InterviewRound) => {
      setError(null)
      try {
        await db.deleteRound(round.id)
        setRounds((prev) => (prev ?? []).filter((r) => r.id !== round.id))
        setDeleteTarget(null)
        flash('Round deleted.')
        onChanged()
      } catch {
        setError('Could not delete this round.')
      }
    },
    [flash, onChanged],
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Interview rounds — ${card.company}`}
        className="absolute inset-0 m-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Interview rounds
            </h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {card.company} — {card.role}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={rounds === null}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Add round
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {rounds === null ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : ordered.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
              No rounds scheduled yet. Add one when a company invites you to interview.
            </p>
          ) : (
            ordered.map((round) => (
              <section
                key={round.id}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    Round {round.round}
                  </span>
                  {round.label ? (
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {round.label}
                    </h3>
                  ) : null}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${OUTCOME_TONE[round.outcome]}`}>
                    {INTERVIEW_OUTCOME_LABELS[round.outcome]}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(round)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(round)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(round.scheduledAt)}
                  {round.durationMins ? ` · ${round.durationMins} mins` : ''}
                  {round.interviewer ? ` · ${round.interviewer}` : ''}
                  {` · ${INTERVIEW_FORMAT_LABELS[round.format]}`}
                </p>

                {round.notes ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {round.notes}
                  </p>
                ) : null}
              </section>
            ))
          )}

          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <p className="text-[11px] text-zinc-400">
            {notice ?? 'Rounds are stored locally and included in your JSON backup.'}
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

      {adding ? (
        <RoundDialog
          key="add"
          cardId={card.id}
          nextRound={nextRound}
          onCancel={() => setAdding(false)}
          onSubmit={save}
        />
      ) : null}

      {editing ? (
        <RoundDialog
          key={editing.id}
          cardId={card.id}
          initial={editing}
          nextRound={nextRound}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete round?"
          message={`This permanently removes round ${deleteTarget.round}${deleteTarget.label ? ` (${deleteTarget.label})` : ''} from this browser.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => remove(deleteTarget)}
        />
      ) : null}
    </div>
  )
}
