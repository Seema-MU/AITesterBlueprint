import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { JobCard, MatchAnalysis, ResumeVersion } from '../lib/schema'
import * as db from '../lib/db'
import {
  applicationsPerWeek,
  funnel,
  respondedScoreComparison,
  resumeVersionRanking,
  topMissingSkills,
} from '../lib/analytics'

/** Weeks shown in the applications chart. */
const WEEKS = 12
/** Below this many samples in either group, the match-score comparison is noise. */
const SMALL_SAMPLE = 5

interface Dashboard {
  cards: JobCard[]
  analyses: MatchAnalysis[]
  versions: ResumeVersion[]
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** Same threshold palette as the Resumes tab, so a score reads the same in both places. */
function scoreClass(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (score >= 45) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{hint}</p>
      {children}
    </section>
  )
}

function Stat({ label, avg, count }: { label: string; avg: number | null; count: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
        {avg === null ? '—' : `${avg}%`}
      </p>
      <p className="text-[11px] text-zinc-400">
        n={count} analysed application{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export default function AnalyticsView() {
  const [data, setData] = useState<Dashboard | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [cards, analyses, versions] = await Promise.all([
        db.listJobCards(),
        db.getAllMatchAnalyses(),
        db.listResumeVersions(),
      ])
      if (!alive) return
      setData({ cards, analyses, versions })
    })()
    return () => {
      alive = false
    }
  }, [])

  const weeks = useMemo(
    () => (data ? applicationsPerWeek(data.cards, WEEKS) : []),
    [data],
  )
  const steps = useMemo(() => (data ? funnel(data.cards) : []), [data])
  const comparison = useMemo(
    () => (data ? respondedScoreComparison(data.cards) : null),
    [data],
  )
  const missing = useMemo(
    () => (data ? topMissingSkills(data.analyses, data.cards) : []),
    [data],
  )
  const ranking = useMemo(
    () => (data ? resumeVersionRanking(data.versions, data.analyses) : []),
    [data],
  )

  const maxWeek = Math.max(...weeks.map((w) => w.count), 1)
  const maxMissing = Math.max(...missing.map((row) => row.total), 1)
  const scored = comparison ? comparison.respondedCount + comparison.otherCount : 0

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Analytics</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Everything here is derived from the cards, analyses and resumes already on this device —
        nothing is sent anywhere.
      </p>

      {data === null ? (
        <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
      ) : data.cards.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-zinc-300 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          No jobs yet. Add a card, and the numbers appear here as you work through them.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <Section
            title="Applications per week"
            hint={`The last ${WEEKS} weeks, dated by the day you applied. Wishlist cards are not applications, so they are not counted.`}
          >
            <div className="mt-3 flex h-36 items-end gap-1.5">
              {weeks.map((week) => (
                <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                    {week.count > 0 ? week.count : ''}
                  </span>
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      role="img"
                      aria-label={`Week of ${week.label}: ${week.count} application${week.count === 1 ? '' : 's'}`}
                      title={`Week of ${week.label}: ${week.count}`}
                      className={`w-full rounded-sm ${
                        week.count === 0
                          ? 'bg-zinc-200 dark:bg-zinc-800'
                          : 'bg-zinc-700 dark:bg-zinc-300'
                      }`}
                      style={{
                        height: week.count === 0 ? '2px' : `${Math.round((week.count / maxWeek) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[9px] text-zinc-400">
                    {week.label}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Funnel"
            hint='“Responded” means the card reached Interview, Offer or Rejected — a rejection is a response. Following up is something you do, so it does not count as one.'
          >
            <ul className="mt-3 space-y-2">
              {steps.map((step) => (
                <li key={step.key} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">
                    {step.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300"
                      style={{ width: step.rate === null ? '0%' : pct(step.rate) }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
                    {step.count}
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono tabular-nums text-zinc-400">
                    {step.rate === null ? '—' : pct(step.rate)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Match score: responded vs not"
            hint="Does a higher match score actually get more replies? Averaged over applications that have been analysed."
          >
            {comparison ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat
                    label="Responded"
                    avg={comparison.respondedAvg}
                    count={comparison.respondedCount}
                  />
                  <Stat
                    label="No response yet"
                    avg={comparison.otherAvg}
                    count={comparison.otherCount}
                  />
                </div>
                {scored > 0 && Math.min(comparison.respondedCount, comparison.otherCount) < SMALL_SAMPLE ? (
                  <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    With only {scored} analysed application{scored === 1 ? '' : 's'} this difference
                    is noise — treat it as a curiosity until there are far more.
                  </p>
                ) : null}
              </>
            ) : null}
          </Section>

          <Section
            title="Skills to learn next"
            hint="Missing across the JDs you have analysed. Each job counts once, using its most recent analysis, and synonyms are merged."
          >
            {missing.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                Nothing missing yet — run an analysis on a card that has a job description.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {missing.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 text-xs">
                    <span className="w-36 shrink-0 truncate font-medium text-zinc-800 dark:text-zinc-100" title={row.name}>
                      {row.name}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-rose-400 dark:bg-rose-500"
                        style={{ width: pct(row.total / maxMissing) }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
                      {row.total}
                    </span>
                    <span className="w-28 shrink-0 text-right text-[10px] text-zinc-400">
                      {row.blocking} req · {row.niceToHave} pref
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {ranking.length > 0 ? (
            <Section
              title="Resume versions"
              hint="Ranked by the best score each version has achieved, and how many JDs it was measured against."
            >
              <ul className="mt-3 space-y-1.5">
                {ranking.map((row, index) => (
                  <li key={row.resumeVersionId} className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100"
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    {index === 0 ? (
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Best
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreClass(row.bestScore)}`}
                    >
                      best {row.bestScore}%
                    </span>
                    <span className="shrink-0 text-right text-[10px] text-zinc-400">
                      across {row.jdsAnalysed} JD{row.jdsAnalysed === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </div>
  )
}
