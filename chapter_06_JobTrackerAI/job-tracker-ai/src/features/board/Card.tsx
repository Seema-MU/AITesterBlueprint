import { useDraggable } from '@dnd-kit/core'
import type { InterviewRound, JobCard } from '../../lib/schema'
import { STATUS_HEX } from '../../lib/schema'
import { FOLLOW_UP_OVERDUE_DAYS, daysSince, daysUntil, formatDate, formatDateTime, isFollowUpOverdue } from '../../lib/utils'

interface Props {
  card: JobCard
  /** Resume version id → label, so the card can show which resume was sent. */
  resumeLabels: Record<string, string>
  /** Interview rounds booked for this card, for the badge. */
  rounds: InterviewRound[]
  onEdit: (card: JobCard) => void
  onDelete: (card: JobCard) => void
  onAnalyse: (card: JobCard) => void
  onDrafts: (card: JobCard) => void
  onRounds: (card: JobCard) => void
  onPrep: (card: JobCard) => void
}

function ExternalIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  )
}

export default function Card({
  card,
  resumeLabels,
  rounds,
  onEdit,
  onDelete,
  onAnalyse,
  onDrafts,
  onRounds,
  onPrep,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { status: card.status },
  })

  const days = daysSince(card.dateApplied)
  const resumeLabel = card.resumeVersionId ? resumeLabels[card.resumeVersionId] : undefined

  // Next round still ahead of us; a cancelled one should not say "Interview in 3d".
  const nextRound = rounds
    .filter((r) => r.outcome !== 'cancelled' && new Date(r.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  const daysToNext = nextRound ? daysUntil(nextRound.scheduledAt) : 0
  const overdue = isFollowUpOverdue(card)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Let the delete button handle its own click.
        if ((e.target as HTMLElement).closest('[data-action]')) return
        onEdit(card)
      }}
      style={{ borderLeftColor: STATUS_HEX[card.status] }}
      className={`group cursor-pointer rounded-md border border-l-4 border-zinc-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {card.role}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{card.company}</p>
        </div>
        {card.jobUrl ? (
          <a
            data-action
            href={card.jobUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label={`Open job posting for ${card.company}`}
          >
            <ExternalIcon />
          </a>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span className="flex items-center gap-1">
          {card.matchScore !== undefined ? (
            <span
              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                card.matchScore >= 70
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : card.matchScore >= 45
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              }`}
              title="Match score against your resume profile"
            >
              {card.matchScore}% match
            </span>
          ) : null}
          {card.jdRawText ? (
            <span
              title={`JD saved (~${card.jdRawText.trim().split(/\s+/).length} words)`}
              className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              JD
            </span>
          ) : null}
          <span>{days === 0 ? 'Today' : `${days}d`}</span>
          {nextRound ? (
            <span
              title={`Round ${nextRound.round}${nextRound.label ? ` — ${nextRound.label}` : ''} on ${formatDateTime(nextRound.scheduledAt)}`}
              className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300"
            >
              {daysToNext <= 0 ? 'Interview today' : `Interview in ${daysToNext}d`}
            </span>
          ) : rounds.length > 0 ? (
            <span
              title={`${rounds.length} interview round${rounds.length === 1 ? '' : 's'} recorded`}
              className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300"
            >
              {rounds.length} round{rounds.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {overdue ? (
            <span
              title={`No movement in over ${FOLLOW_UP_OVERDUE_DAYS} days — worth chasing up.`}
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              Follow up
            </span>
          ) : null}
        </span>
        <span className="truncate" title={formatDate(card.dateApplied)}>
          {card.salaryRange || '—'}
        </span>
      </div>

      {card.resumeVersionId ? (
        <p
          className="mt-1 truncate text-[10px] text-zinc-400 dark:text-zinc-500"
          title={
            resumeLabel
              ? `Resume sent: ${resumeLabel}`
              : 'The resume version this card pointed at was deleted — pick another in Edit.'
          }
        >
          <span aria-hidden="true">📄</span>{' '}
          <span className={resumeLabel ? '' : 'text-amber-600 dark:text-amber-400'}>
            {resumeLabel ?? 'deleted resume version'}
          </span>
        </p>
      ) : null}

      <div className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onDrafts(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
        >
          Drafts
        </button>
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onPrep(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
        >
          Prep
        </button>
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onRounds(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
        >
          Rounds
        </button>
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onAnalyse(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40"
        >
          Analyse
        </button>
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onEdit(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          Edit
        </button>
        <button
          type="button"
          data-action
          onClick={(e) => {
            e.stopPropagation()
            onDelete(card)
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
