import { describe, expect, it } from 'vitest'
import type { JobCard } from './schema'
import {
  FOLLOW_UP_OVERDUE_DAYS,
  daysSinceTimestamp,
  daysUntil,
  isFollowUpOverdue,
  lastStatusChangeAt,
} from './utils'

/** Local calendar date (never UTC), so these assertions hold in any timezone. */
function localDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function atLocalMidnight(daysFromToday: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + daysFromToday)
  return d
}

/** `YYYY-MM-DD`, as stored in `dateApplied`. */
function dateDaysAgo(days: number): string {
  return localDate(atLocalMidnight(-days))
}

/** Full ISO timestamp, as stored in `history[].at`. */
function timestampDaysAgo(days: number): string {
  return atLocalMidnight(-days).toISOString()
}

function card(overrides: Partial<JobCard> = {}): JobCard {
  return {
    id: 'c1',
    company: 'CGI',
    role: 'Senior QA Automation Engineer',
    dateApplied: dateDaysAgo(0),
    status: 'applied',
    history: [],
    ...overrides,
  }
}

describe('daysSinceTimestamp', () => {
  it('is 0 for today and positive for a past date', () => {
    expect(daysSinceTimestamp(timestampDaysAgo(0))).toBe(0)
    expect(daysSinceTimestamp(timestampDaysAgo(9))).toBe(9)
  })

  it('is negative for a future date', () => {
    expect(daysSinceTimestamp(timestampDaysAgo(-4))).toBe(-4)
  })

  it('accepts a plain YYYY-MM-DD date as well as a timestamp', () => {
    expect(daysSinceTimestamp(dateDaysAgo(3))).toBe(3)
  })

  it('treats an unparseable value as today rather than throwing', () => {
    expect(daysSinceTimestamp('')).toBe(0)
    expect(daysSinceTimestamp('not-a-date')).toBe(0)
  })
})

describe('daysUntil', () => {
  it('counts forward to a future date and goes negative once it has passed', () => {
    expect(daysUntil(timestampDaysAgo(-5))).toBe(5)
    expect(daysUntil(timestampDaysAgo(2))).toBe(-2)
  })
})

describe('lastStatusChangeAt', () => {
  it('falls back to dateApplied when the card has never moved', () => {
    expect(lastStatusChangeAt(card({ dateApplied: '2026-09-01' }))).toBe('2026-09-01')
  })

  it('returns the newest entry that matches the current status', () => {
    const history = [
      { from: 'wishlist' as const, to: 'applied' as const, at: '2026-09-01T10:00:00.000Z' },
      { from: 'applied' as const, to: 'interview' as const, at: '2026-09-05T10:00:00.000Z' },
      // Back to applied: the later entry is the one that counts.
      { from: 'interview' as const, to: 'applied' as const, at: '2026-09-09T10:00:00.000Z' },
    ]
    expect(lastStatusChangeAt(card({ status: 'applied', history }))).toBe(
      '2026-09-09T10:00:00.000Z',
    )
  })

  it('ignores entries for statuses the card has since left', () => {
    const history = [
      { from: 'wishlist' as const, to: 'applied' as const, at: '2026-09-01T10:00:00.000Z' },
      { from: 'applied' as const, to: 'offer' as const, at: '2026-09-05T10:00:00.000Z' },
    ]
    expect(lastStatusChangeAt(card({ status: 'offer', history }))).toBe('2026-09-05T10:00:00.000Z')
  })
})

describe('isFollowUpOverdue', () => {
  it('uses a 7-day window', () => {
    expect(FOLLOW_UP_OVERDUE_DAYS).toBe(7)
  })

  it('flags an application that has gone quiet past the window', () => {
    const quiet = card({
      status: 'applied',
      history: [
        { from: 'wishlist', to: 'applied', at: timestampDaysAgo(FOLLOW_UP_OVERDUE_DAYS + 1) },
      ],
    })
    expect(isFollowUpOverdue(quiet)).toBe(true)
  })

  it('does not flag a card sitting exactly at the window', () => {
    const onTheLine = card({
      status: 'followup',
      history: [
        { from: 'applied', to: 'followup', at: timestampDaysAgo(FOLLOW_UP_OVERDUE_DAYS) },
      ],
    })
    expect(isFollowUpOverdue(onTheLine)).toBe(false)
  })

  it('does not flag statuses that are being actively handled', () => {
    for (const status of ['wishlist', 'interview', 'offer', 'rejected'] as const) {
      const stale = card({
        status,
        history: [{ from: 'applied', to: status, at: timestampDaysAgo(60) }],
      })
      expect(isFollowUpOverdue(stale)).toBe(false)
    }
  })

  it('falls back to dateApplied for a card that never moved', () => {
    expect(isFollowUpOverdue(card({ dateApplied: dateDaysAgo(30) }))).toBe(true)
    expect(isFollowUpOverdue(card({ dateApplied: dateDaysAgo(1) }))).toBe(false)
  })
})
