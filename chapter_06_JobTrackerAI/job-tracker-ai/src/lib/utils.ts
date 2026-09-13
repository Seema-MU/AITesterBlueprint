import type { JobCard, Status } from '../lib/schema'

export function formatDate(isoDate: string): string {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whole days between the card date and today (0 = today). Never negative. */
export function daysSince(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(then.getTime())) return 0
  const ms = today.getTime() - then.getTime()
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000)
}

/**
 * Statuses where a stalled card is worth nudging. `interview` and beyond are being
 * actively handled, so they do not get the overdue badge.
 */
const FOLLOW_UP_STATUSES: Status[] = ['applied', 'followup']

/** A card untouched for more than this many days is flagged for a follow-up. */
export const FOLLOW_UP_OVERDUE_DAYS = 7

/** Parses either a `YYYY-MM-DD` date or a full ISO / `datetime-local` value. */
function toLocalDate(value: string): Date | null {
  if (!value) return null
  const parsed = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Whole days from a full timestamp to today. Unlike `daysSince` this accepts a
 * timestamp as well as a date, and is signed — negative means the value is in the
 * future, which is what both the overdue and the "interview in Nd" checks need.
 */
export function daysSinceTimestamp(value: string): number {
  const then = toLocalDate(value)
  if (!then) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  then.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - then.getTime()) / 86_400_000)
}

/** Whole days until a future timestamp (negative once it is in the past). */
export function daysUntil(value: string): number {
  return -daysSinceTimestamp(value)
}

export function formatDateTime(value: string): string {
  const parsed = toLocalDate(value)
  if (!parsed) return value
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * When the card last entered the status it is in now: the newest history entry whose
 * `to` matches the current status, falling back to `dateApplied` for cards that have
 * never moved.
 */
export function lastStatusChangeAt(card: JobCard): string {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    if (card.history[i].to === card.status) return card.history[i].at
  }
  return card.dateApplied
}

/** True when an application has gone quiet for longer than the follow-up window. */
export function isFollowUpOverdue(card: JobCard): boolean {
  if (!FOLLOW_UP_STATUSES.includes(card.status)) return false
  return daysSinceTimestamp(lastStatusChangeAt(card)) > FOLLOW_UP_OVERDUE_DAYS
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function makeNewCard(form: {
  company: string
  role: string
  jobUrl?: string
  jdRawText?: string
  dateApplied: string
  salaryRange?: string
  notes?: string
  status: Status
}) {
  return {
    id: newId(),
    ...form,
    history: [],
  }
}
