import { describe, expect, it } from 'vitest'
import {
  ArtifactSchema,
  EMPTY_ROUND_FORM,
  FollowUpSequenceSchema,
  InterviewRoundFormSchema,
  InterviewRoundSchema,
  JobCardSchema,
} from './schema'
import type { Artifact, JobCard } from './schema'

function validCard(): JobCard {
  return {
    id: 'c1',
    company: 'CGI',
    role: 'Senior QA Automation Engineer',
    dateApplied: '2026-09-01',
    status: 'applied',
    history: [],
  }
}

describe('JobCardSchema', () => {
  it('round-trips a valid card (required fields only)', () => {
    const card = validCard()
    const parsed = JobCardSchema.safeParse(card)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(card)
  })

  it('accepts optional fields when present', () => {
    const parsed = JobCardSchema.safeParse({
      ...validCard(),
      jobUrl: 'https://example.com/job',
      jdRawText: 'We are looking for a Senior QA Automation Engineer with Playwright…',
      salaryRange: '₹25-30 LPA',
      notes: 'Referred by Priya',
      history: [{ from: 'wishlist', to: 'applied', at: '2026-09-01T10:00:00.000Z' }],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.jdRawText).toContain('Playwright')
  })

  it('rejects an invalid status', () => {
    const parsed = JobCardSchema.safeParse({ ...validCard(), status: 'hired' })
    expect(parsed.success).toBe(false)
  })

  it('rejects a missing company', () => {
    const { company: _company, ...rest } = validCard()
    const parsed = JobCardSchema.safeParse(rest)
    expect(parsed.success).toBe(false)
  })

  it('rejects a missing role', () => {
    const { role: _role, ...rest } = validCard()
    const parsed = JobCardSchema.safeParse(rest)
    expect(parsed.success).toBe(false)
  })
})

function validArtifact(): Artifact {
  return {
    id: 'art1',
    jobCardId: 'c1',
    kind: 'coverLetter',
    content: 'Dear Hiring Manager, …',
    edited: false,
    modelUsed: 'test-model',
    promptVersion: 'cover-letter-v1',
    createdAt: '2026-09-10T00:00:00.000Z',
    practised: [],
  }
}

describe('ArtifactSchema', () => {
  it('round-trips a cover letter artifact', () => {
    const artifact = validArtifact()
    const parsed = ArtifactSchema.safeParse(artifact)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(artifact)
  })

  it('accepts a follow-up variant', () => {
    const parsed = ArtifactSchema.safeParse({ ...validArtifact(), kind: 'followUp', variant: 'day-7' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.variant).toBe('day-7')
  })

  it('rejects an unknown kind', () => {
    const parsed = ArtifactSchema.safeParse({ ...validArtifact(), kind: 'tweet' })
    expect(parsed.success).toBe(false)
  })

  it('rejects empty content', () => {
    const parsed = ArtifactSchema.safeParse({ ...validArtifact(), content: '' })
    expect(parsed.success).toBe(false)
  })
})

describe('FollowUpSequenceSchema', () => {
  it('requires all five days', () => {
    const full = { day1: 'a', day2: 'b', day3: 'c', day4: 'd', day5: 'e' }
    expect(FollowUpSequenceSchema.safeParse(full).success).toBe(true)
    expect(FollowUpSequenceSchema.safeParse({ day1: 'a', day2: 'b', day3: 'c', day4: 'd' }).success).toBe(false)
  })
})

describe('prep artifacts', () => {
  it('round-trips a structured prep plan with ticks', () => {
    const prep: Artifact = {
      ...validArtifact(),
      kind: 'prep',
      content: '## Playwright\n- Q1',
      prep: { topics: [{ topic: 'Playwright', questions: ['Q1'] }] },
      practised: ['0:0'],
    }
    const parsed = ArtifactSchema.safeParse(prep)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.prep?.topics[0].topic).toBe('Playwright')
      expect(parsed.data.practised).toEqual(['0:0'])
    }
  })

  it('defaults practised to empty when absent, so older records still parse', () => {
    const { practised: _omitted, ...withoutTicks } = validArtifact()
    const parsed = ArtifactSchema.safeParse(withoutTicks)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.practised).toEqual([])
  })

  it('rejects a prep plan with no topics', () => {
    const parsed = ArtifactSchema.safeParse({
      ...validArtifact(),
      kind: 'prep',
      prep: { topics: [] },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('InterviewRoundSchema', () => {
  const round = {
    id: 'r1',
    jobCardId: 'c1',
    round: 1,
    scheduledAt: '2026-10-01T14:30',
    createdAt: '2026-09-20T00:00:00.000Z',
  }

  it('round-trips a minimal round, defaulting format and outcome', () => {
    const parsed = InterviewRoundSchema.safeParse(round)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.format).toBe('video')
      expect(parsed.data.outcome).toBe('pending')
    }
  })

  it('rejects an unknown format and outcome', () => {
    expect(InterviewRoundSchema.safeParse({ ...round, format: 'telepathy' }).success).toBe(false)
    expect(InterviewRoundSchema.safeParse({ ...round, outcome: 'maybe' }).success).toBe(false)
  })

  it('rejects a round number below 1', () => {
    expect(InterviewRoundSchema.safeParse({ ...round, round: 0 }).success).toBe(false)
  })

  it('requires a scheduled time on the form schema', () => {
    expect(InterviewRoundFormSchema.safeParse({ ...EMPTY_ROUND_FORM }).success).toBe(false)
    expect(
      InterviewRoundFormSchema.safeParse({ ...EMPTY_ROUND_FORM, scheduledAt: '2026-10-01T14:30' })
        .success,
    ).toBe(true)
  })
})
