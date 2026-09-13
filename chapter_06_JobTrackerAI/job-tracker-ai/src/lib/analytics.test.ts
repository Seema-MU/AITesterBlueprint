import { describe, expect, it } from 'vitest'
import type { JobCard, MatchAnalysis, MissingSkill, ResumeVersion, Status } from './schema'
import {
  applicationsPerWeek,
  everReached,
  funnel,
  respondedScoreComparison,
  resumeVersionRanking,
  topMissingSkills,
} from './analytics'

/** 2026-09-16 is a Wednesday, so its week starts Monday 2026-09-14. */
const NOW = new Date('2026-09-16T12:00:00')

function card(id: string, overrides: Partial<JobCard> = {}): JobCard {
  return {
    id,
    company: `Company ${id}`,
    role: `Role ${id}`,
    dateApplied: '2026-09-15',
    status: 'applied',
    history: [],
    ...overrides,
  }
}

function analysis(
  jobCardId: string,
  overrides: Partial<MatchAnalysis> = {},
): MatchAnalysis {
  return {
    id: `a-${jobCardId}-${overrides.createdAt ?? 'x'}`,
    jobCardId,
    resumeVersionId: 'main',
    overallScore: 50,
    subScores: {
      requiredCoverage: 0.5,
      preferredCoverage: 0.5,
      seniorityFit: 1,
      domainFit: 1,
      atsKeywordCoverage: 0.5,
    },
    matched: [],
    missingBlocking: [],
    missingCoverable: [],
    missingNiceToHave: [],
    atsGapKeywords: [],
    modelUsed: 'test-model',
    promptVersion: 'spec-v1',
    createdAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  }
}

function missing(name: string): MissingSkill {
  return { name, jdEvidence: `requires ${name}` }
}

function resume(id: string, label = `Resume ${id}`): ResumeVersion {
  return {
    id,
    label,
    isPrimary: false,
    fileName: `${id}.pdf`,
    fileData: new Uint8Array([1, 2, 3]).buffer,
    fileMimeType: 'application/pdf',
    rawText: `Resume text ${id}`,
    createdAt: '2026-09-11T00:00:00.000Z',
  }
}

describe('everReached', () => {
  it('counts the current status even with an empty history', () => {
    // Cards created straight into the Applied (or Interview) column log no event.
    expect(everReached(card('a', { status: 'interview', history: [] }), ['interview'])).toBe(true)
  })

  it('counts a past history entry after the card has moved on', () => {
    const moved = card('a', {
      status: 'wishlist',
      history: [{ from: 'wishlist', to: 'offer', at: '2026-09-01T00:00:00.000Z' }],
    })
    expect(everReached(moved, ['offer'])).toBe(true)
  })

  it('is false for a card that has only ever been early-stage', () => {
    const early = card('a', {
      status: 'followup',
      history: [{ from: 'applied', to: 'followup', at: '2026-09-02T00:00:00.000Z' }],
    })
    expect(everReached(early, ['interview', 'offer', 'rejected'])).toBe(false)
  })
})

describe('applicationsPerWeek', () => {
  it('returns exactly the requested number of weeks, oldest first', () => {
    const weeks = applicationsPerWeek([], 3, NOW)
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
    // Labels follow the runtime locale, exactly as utils.formatDate does, so assert their
    // shape rather than their spelling — "31 Aug" and "Aug 31" are both correct.
    expect(weeks.every((w) => w.label.length > 0)).toBe(true)
    expect(new Set(weeks.map((w) => w.label)).size).toBe(3)
  })

  it('keeps empty weeks in the middle so gaps stay visible', () => {
    const cards = [
      card('a', { dateApplied: '2026-09-15' }),
      card('b', { dateApplied: '2026-09-01' }),
    ]
    const weeks = applicationsPerWeek(cards, 3, NOW)
    expect(weeks.map((w) => w.count)).toEqual([1, 0, 1])
  })

  it('buckets a Sunday into the week that started the previous Monday', () => {
    // 2026-09-13 is a Sunday, so it belongs to the week of Monday 2026-09-07.
    const weeks = applicationsPerWeek([card('a', { dateApplied: '2026-09-13' })], 3, NOW)
    expect(weeks.find((w) => w.weekStart === '2026-09-07')?.count).toBe(1)
    expect(weeks.find((w) => w.weekStart === '2026-09-14')?.count).toBe(0)
  })

  it('excludes wishlist cards, which are not applications', () => {
    const weeks = applicationsPerWeek([card('a', { status: 'wishlist' })], 3, NOW)
    expect(weeks.reduce((sum, w) => sum + w.count, 0)).toBe(0)
  })

  it('still counts a card that was applied to and later dragged back to Wishlist', () => {
    const regressed = card('a', {
      status: 'wishlist',
      history: [{ from: 'applied', to: 'wishlist', at: '2026-09-12T00:00:00.000Z' }],
    })
    const weeks = applicationsPerWeek([regressed], 3, NOW)
    expect(weeks.reduce((sum, w) => sum + w.count, 0)).toBe(1)
  })

  it('ignores applications older than the window', () => {
    const weeks = applicationsPerWeek([card('a', { dateApplied: '2026-08-30' })], 3, NOW)
    expect(weeks.reduce((sum, w) => sum + w.count, 0)).toBe(0)
  })

  it('ignores an unparseable date instead of throwing', () => {
    const weeks = applicationsPerWeek([card('a', { dateApplied: 'not-a-date' })], 3, NOW)
    expect(weeks.reduce((sum, w) => sum + w.count, 0)).toBe(0)
  })
})

describe('funnel', () => {
  const cards: JobCard[] = [
    card('applied'),
    card('interview', { status: 'interview' }),
    card('rejected', {
      status: 'rejected',
      history: [
        { from: 'wishlist', to: 'applied', at: '2026-09-01T00:00:00.000Z' },
        { from: 'applied', to: 'rejected', at: '2026-09-05T00:00:00.000Z' },
      ],
    }),
    card('wishlist', { status: 'wishlist' }),
  ]

  it('counts each step, excluding wishlist cards from the base', () => {
    const [applied, responded, interview, offer] = funnel(cards)
    expect(applied.count).toBe(3)
    expect(responded.count).toBe(2)
    expect(interview.count).toBe(1)
    expect(offer.count).toBe(0)
  })

  it('stays monotonic: offer <= interviewed <= responded <= applied', () => {
    const counts = funnel(cards).map((step) => step.count)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
    }
  })

  it('treats a rejection without an interview as a response', () => {
    const responded = funnel([cards[2]]).find((step) => step.key === 'responded')
    expect(responded?.count).toBe(1)
  })

  it('reports rates as null, not 0%, when there are no applications', () => {
    const steps = funnel([card('w', { status: 'wishlist' })])
    expect(steps.every((step) => step.rate === null)).toBe(true)
  })

  it('reports each rate against the number of applications', () => {
    const rates = Object.fromEntries(funnel(cards).map((s) => [s.key, s.rate]))
    expect(rates.interview).toBeCloseTo(1 / 3)
    expect(rates.offer).toBe(0)
  })
})

describe('topMissingSkills', () => {
  it('counts each JD once, using only its newest analysis', () => {
    const cards = [card('job-1')]
    const analyses = [
      analysis('job-1', {
        createdAt: '2026-09-01T00:00:00.000Z',
        missingBlocking: [missing('ColdFusion')],
      }),
      analysis('job-1', {
        createdAt: '2026-09-08T00:00:00.000Z',
        missingBlocking: [missing('Kubernetes')],
      }),
    ]

    const rows = topMissingSkills(analyses, cards)

    // The stale analysis must not contribute, or the same JD would be counted twice.
    expect(rows.map((r) => r.name)).toEqual(['Kubernetes'])
    expect(rows[0].total).toBe(1)
  })

  it('merges synonyms into one row and shows the most common spelling', () => {
    const cards = [card('job-1'), card('job-2')]
    const analyses = [
      analysis('job-1', { createdAt: '2026-09-01T00:00:00.000Z', missingBlocking: [missing('K8s')] }),
      analysis('job-2', {
        createdAt: '2026-09-02T00:00:00.000Z',
        missingBlocking: [missing('Kubernetes'), missing('Kubernetes')],
      }),
    ]

    const rows = topMissingSkills(analyses, cards)

    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('kubernetes')
    // "Kubernetes" appears twice, "K8s" once, so the fuller spelling is displayed.
    expect(rows[0].name).toBe('Kubernetes')
    expect(rows[0].total).toBe(3)
  })

  it('splits required from preferred', () => {
    const cards = [card('job-1')]
    const analyses = [
      analysis('job-1', {
        missingBlocking: [missing('Terraform')],
        missingNiceToHave: [missing('Terraform'), missing('Selenium')],
      }),
    ]

    const rows = topMissingSkills(analyses, cards)
    const terraform = rows.find((r) => r.name === 'Terraform')
    expect(terraform).toMatchObject({ total: 2, blocking: 1, niceToHave: 1 })
    expect(rows.find((r) => r.name === 'Selenium')).toMatchObject({ blocking: 0, niceToHave: 1 })
  })

  it('skips analyses whose card was deleted', () => {
    const rows = topMissingSkills(
      [analysis('gone', { missingBlocking: [missing('Kubernetes')] })],
      [card('job-1')],
    )
    expect(rows).toEqual([])
  })

  it('sorts by total and respects the limit', () => {
    const cards = [card('job-1'), card('job-2'), card('job-3')]
    const analyses = [
      analysis('job-1', { createdAt: '2026-09-01T00:00:00.000Z', missingBlocking: [missing('Rare')] }),
      analysis('job-2', { createdAt: '2026-09-01T00:00:00.000Z', missingBlocking: [missing('Common')] }),
      analysis('job-3', { createdAt: '2026-09-01T00:00:00.000Z', missingBlocking: [missing('Common')] }),
    ]

    const rows = topMissingSkills(analyses, cards, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Common')
  })

  it('returns nothing when no card has been analysed', () => {
    expect(topMissingSkills([], [card('job-1')])).toEqual([])
  })
})

describe('resumeVersionRanking', () => {
  const versions = [resume('v1', 'QA_Resume_CGI_v1'), resume('v2', 'QA_Resume_CGI_v2')]

  it('ranks by best score and counts the distinct JDs measured', () => {
    const analyses = [
      analysis('job-1', { resumeVersionId: 'v1', overallScore: 40 }),
      analysis('job-2', { resumeVersionId: 'v1', overallScore: 62 }),
      // Same JD twice for v2, so it must count once.
      analysis('job-1', { resumeVersionId: 'v2', overallScore: 71, createdAt: '2026-09-02T00:00:00.000Z' }),
      analysis('job-1', { resumeVersionId: 'v2', overallScore: 55, createdAt: '2026-09-03T00:00:00.000Z' }),
    ]

    const ranking = resumeVersionRanking(versions, analyses)

    expect(ranking.map((r) => r.resumeVersionId)).toEqual(['v2', 'v1'])
    expect(ranking[0]).toMatchObject({ bestScore: 71, jdsAnalysed: 1 })
    expect(ranking[1]).toMatchObject({ bestScore: 62, jdsAnalysed: 2 })
  })

  it('omits a version that has never been analysed', () => {
    const ranking = resumeVersionRanking(versions, [analysis('job-1', { resumeVersionId: 'v1' })])
    expect(ranking.map((r) => r.resumeVersionId)).toEqual(['v1'])
  })

  it('returns an empty ranking with no analyses', () => {
    expect(resumeVersionRanking(versions, [])).toEqual([])
  })
})

describe('respondedScoreComparison', () => {
  it('averages each group and reports both sample sizes', () => {
    const cards = [
      card('a', { status: 'interview', matchScore: 70 }),
      card('b', { status: 'offer', matchScore: 80 }),
      card('c', { status: 'applied', matchScore: 50 }),
      card('d', { status: 'applied', matchScore: 60 }),
    ]

    expect(respondedScoreComparison(cards)).toEqual({
      respondedAvg: 75,
      respondedCount: 2,
      otherAvg: 55,
      otherCount: 2,
    })
  })

  it('returns null for a group with no samples rather than NaN or 0', () => {
    const result = respondedScoreComparison([card('a', { status: 'applied', matchScore: 55 })])
    expect(result.respondedAvg).toBeNull()
    expect(result.respondedCount).toBe(0)
    expect(result.otherAvg).toBe(55)
  })

  it('ignores cards that were never analysed and cards still on the wishlist', () => {
    const result = respondedScoreComparison([
      card('a', { status: 'applied' }),
      card('b', { status: 'wishlist', matchScore: 99 }),
    ])
    expect(result).toEqual({
      respondedAvg: null,
      respondedCount: 0,
      otherAvg: null,
      otherCount: 0,
    })
  })
})

describe('status typing', () => {
  it('uses statuses that exist on JobCard', () => {
    const all: Status[] = ['wishlist', 'applied', 'followup', 'interview', 'offer', 'rejected']
    expect(all).toHaveLength(6)
    expect(funnel([card('a', { status: 'offer' })])[0].count).toBe(1)
  })
})
