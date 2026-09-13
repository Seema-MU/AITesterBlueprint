import type { JobCard, MatchAnalysis, ResumeVersion, Status } from './schema'
import { canonicalSkill } from './config'
import { bestScoreForVersion } from './resumes'

/**
 * Derived dashboard statistics. Everything here is a pure function over records the app
 * already stores, so it needs no new object store, no DB bump and no backup change — and
 * it is testable without IndexedDB or a model.
 *
 * Two shapes of caveat run through this file, both documented in DECISIONS.md:
 *  - `JobCard.history` cannot date the first application, because a card created directly
 *    into the Applied column logs no event. `dateApplied` is the only reliable date.
 *  - there is no `responded` status, so "responded" is a proxy for ever reaching
 *    interview / offer / rejected.
 */

const APPLIED_OR_BEYOND: Status[] = ['applied', 'followup', 'interview', 'offer', 'rejected']
const RESPONDED: Status[] = ['interview', 'offer', 'rejected']
const INTERVIEWED: Status[] = ['interview', 'offer']
const OFFERED: Status[] = ['offer']

/**
 * Has the card ever held one of these statuses?
 *
 * Checks `to` *and* `from`, because a transition records the status being left in `from`:
 * a card dragged back to Wishlist logs `{ from: 'applied', to: 'wishlist' }`, and its time
 * in Applied is only visible in the `from` field. The current status also counts, so a card
 * created straight into Applied (or Interview) is counted despite an empty history.
 */
export function everReached(card: JobCard, statuses: Status[]): boolean {
  if (statuses.includes(card.status)) return true
  return card.history.some(
    (event) => statuses.includes(event.to) || statuses.includes(event.from),
  )
}

/**
 * A card is an application once it has left the wishlist. Checked through `everReached`
 * rather than `status !== 'wishlist'` so a card dragged back to Wishlist after applying
 * still counts.
 */
export function isApplication(card: JobCard): boolean {
  return everReached(card, APPLIED_OR_BEYOND)
}

function parseDate(value: string): Date | null {
  if (!value) return null
  const parsed = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Local midnight on the Monday of that date's week. */
function startOfWeek(date: Date): Date {
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

export interface WeekBucket {
  /** Local date (YYYY-MM-DD) of the Monday starting the week. */
  weekStart: string
  label: string
  count: number
}

/**
 * Applications per week for the last `weeks` weeks, oldest first. Every week in the range
 * is emitted even when empty, so a quiet stretch shows as a gap rather than vanishing.
 */
export function applicationsPerWeek(
  cards: JobCard[],
  weeks: number,
  now: Date = new Date(),
): WeekBucket[] {
  const thisWeek = startOfWeek(now)
  const buckets: WeekBucket[] = []
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - back * 7)
    buckets.push({
      weekStart: toDateKey(start),
      label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      count: 0,
    })
  }

  const index = new Map(buckets.map((bucket, position) => [bucket.weekStart, position]))
  for (const card of cards) {
    if (!isApplication(card)) continue
    const applied = parseDate(card.dateApplied)
    if (!applied) continue
    const position = index.get(toDateKey(startOfWeek(applied)))
    if (position !== undefined) buckets[position].count += 1
  }
  return buckets
}

export interface FunnelStep {
  key: string
  label: string
  count: number
  /** Share of applications, or null when there are no applications to divide by. */
  rate: number | null
}

/** applied → responded → interviewed → offer. Monotonic by construction. */
export function funnel(cards: JobCard[]): FunnelStep[] {
  const applications = cards.filter(isApplication)
  const applied = applications.length
  const steps = [
    { key: 'applied', label: 'Applied', count: applied },
    {
      key: 'responded',
      label: 'Responded',
      count: applications.filter((card) => everReached(card, RESPONDED)).length,
    },
    {
      key: 'interview',
      label: 'Interviewed',
      count: applications.filter((card) => everReached(card, INTERVIEWED)).length,
    },
    {
      key: 'offer',
      label: 'Offer',
      count: applications.filter((card) => everReached(card, OFFERED)).length,
    },
  ]
  // A rate of 0% with no applications would be a claim we cannot make; null renders as "—".
  return steps.map((step) => ({ ...step, rate: applied === 0 ? null : step.count / applied }))
}

export interface MissingSkillRow {
  /** Canonical skill key, so synonyms collapse into one row. */
  key: string
  /** The most common original spelling for that key. */
  name: string
  total: number
  blocking: number
  niceToHave: number
}

/**
 * The skills that recur across the JDs you have analysed, split required vs preferred.
 *
 * Only the *newest* analysis per card counts. A card can hold one analysis per resume
 * version, so reading every row would count the same JD's gaps two or three times and
 * inflate the numbers.
 */
export function topMissingSkills(
  analyses: MatchAnalysis[],
  cards: JobCard[],
  limit = 12,
): MissingSkillRow[] {
  const cardIds = new Set(cards.map((card) => card.id))
  const newest = new Map<string, MatchAnalysis>()
  for (const analysis of analyses) {
    if (!cardIds.has(analysis.jobCardId)) continue
    const current = newest.get(analysis.jobCardId)
    if (!current || analysis.createdAt.localeCompare(current.createdAt) > 0) {
      newest.set(analysis.jobCardId, analysis)
    }
  }

  interface Tally {
    spellings: Map<string, number>
    blocking: number
    niceToHave: number
  }
  const byKey = new Map<string, Tally>()
  const add = (name: string, kind: 'blocking' | 'niceToHave') => {
    const key = canonicalSkill(name)
    if (!key) return
    let tally = byKey.get(key)
    if (!tally) {
      tally = { spellings: new Map(), blocking: 0, niceToHave: 0 }
      byKey.set(key, tally)
    }
    tally.spellings.set(name, (tally.spellings.get(name) ?? 0) + 1)
    tally[kind] += 1
  }

  for (const analysis of newest.values()) {
    for (const skill of analysis.missingBlocking) add(skill.name, 'blocking')
    for (const skill of analysis.missingNiceToHave) add(skill.name, 'niceToHave')
  }

  const rows: MissingSkillRow[] = []
  for (const [key, tally] of byKey) {
    let name = ''
    let best = -1
    for (const [spelling, count] of tally.spellings) {
      // Most frequent spelling wins; alphabetical breaks ties so the result is stable.
      if (count > best || (count === best && spelling < name)) {
        name = spelling
        best = count
      }
    }
    rows.push({
      key,
      name,
      total: tally.blocking + tally.niceToHave,
      blocking: tally.blocking,
      niceToHave: tally.niceToHave,
    })
  }

  return rows
    .sort(
      (a, b) => b.total - a.total || b.blocking - a.blocking || a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

export interface VersionRank {
  resumeVersionId: string
  label: string
  bestScore: number
  jdsAnalysed: number
}

/**
 * Resume versions ranked by the best score they have achieved. Reuses the same
 * `bestScoreForVersion` the Resumes tab shows, so the two screens cannot disagree.
 * A version that has never been analysed is omitted — there is nothing to rank.
 */
export function resumeVersionRanking(
  versions: ResumeVersion[],
  analyses: MatchAnalysis[],
): VersionRank[] {
  const rows: VersionRank[] = []
  for (const version of versions) {
    const bestScore = bestScoreForVersion(analyses, version.id)
    if (bestScore === undefined) continue
    const jds = new Set(
      analyses.filter((a) => a.resumeVersionId === version.id).map((a) => a.jobCardId),
    )
    rows.push({
      resumeVersionId: version.id,
      label: version.label,
      bestScore,
      jdsAnalysed: jds.size,
    })
  }
  return rows.sort((a, b) => b.bestScore - a.bestScore || a.label.localeCompare(b.label))
}

export interface RespondedComparison {
  respondedAvg: number | null
  respondedCount: number
  otherAvg: number | null
  otherCount: number
}

/**
 * Average match score for applications that got a response vs those that did not, with
 * the sample sizes the UI must show alongside them — at a dozen applications this
 * difference is noise, and presenting it without `n` would imply otherwise.
 */
export function respondedScoreComparison(cards: JobCard[]): RespondedComparison {
  const scored = cards.filter((card) => isApplication(card) && card.matchScore !== undefined)
  const responded = scored.filter((card) => everReached(card, RESPONDED))
  const other = scored.filter((card) => !everReached(card, RESPONDED))
  const average = (list: JobCard[]) =>
    list.length === 0
      ? null
      : Math.round(list.reduce((sum, card) => sum + (card.matchScore ?? 0), 0) / list.length)

  return {
    respondedAvg: average(responded),
    respondedCount: responded.length,
    otherAvg: average(other),
    otherCount: other.length,
  }
}
