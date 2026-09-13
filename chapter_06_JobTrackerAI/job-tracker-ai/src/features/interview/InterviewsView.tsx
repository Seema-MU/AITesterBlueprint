import { useEffect, useMemo, useState } from 'react'
import type { InterviewOutcome, InterviewRound, JobCard } from '../../lib/schema'
import { INTERVIEW_FORMAT_LABELS, INTERVIEW_OUTCOME_LABELS } from '../../lib/schema'
import * as db from '../../lib/db'
import { formatDateTime } from '../../lib/utils'

interface Row {
  round: InterviewRound
  card: JobCard
}

const OUTCOME_TONE: Record<InterviewOutcome, string> = {
  pending: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  passed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  cancelled: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

function Section({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          {title}
        </h3>
        <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {rows.length}
        </span>
        <span className="text-[11px] text-zinc-400">{hint}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-zinc-300 px-3 py-5 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Nothing here.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map(({ round, card }) => (
            <li
              key={round.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  Round {round.round}
                </span>
                <p className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {card.company} — {card.role}
                </p>
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${OUTCOME_TONE[round.outcome]}`}
                >
                  {INTERVIEW_OUTCOME_LABELS[round.outcome]}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {round.label ? `${round.label} · ` : ''}
                {formatDateTime(round.scheduledAt)}
                {round.durationMins ? ` · ${round.durationMins} mins` : ''}
                {round.interviewer ? ` · ${round.interviewer}` : ''}
                {` · ${INTERVIEW_FORMAT_LABELS[round.format]}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function InterviewsView() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [rounds, cards] = await Promise.all([db.getAllRounds(), db.listJobCards()])
      if (!alive) return
      const byId = new Map(cards.map((c) => [c.id, c]))
      // Rounds whose card was deleted are dropped rather than shown without a company.
      const joined: Row[] = []
      for (const round of rounds) {
        const card = byId.get(round.jobCardId)
        if (card) joined.push({ round, card })
      }
      setRows(joined)
    })()
    return () => {
      alive = false
    }
  }, [])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const at = (row: Row) => new Date(row.round.scheduledAt).getTime()
    const all = rows ?? []
    return {
      upcoming: all
        .filter((r) => at(r) >= now)
        .sort((a, b) => at(a) - at(b)),
      past: all.filter((r) => at(r) < now).sort((a, b) => at(b) - at(a)),
    }
  }, [rows])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Interviews</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Every interview round across your board. Add and edit rounds from a job card&apos;s{' '}
        <span className="font-medium">Rounds</span> action.
      </p>

      {rows === null ? (
        <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          <Section title="Upcoming" hint="soonest first" rows={upcoming} />
          <Section title="Past" hint="most recent first" rows={past} />
        </div>
      )}
    </div>
  )
}
