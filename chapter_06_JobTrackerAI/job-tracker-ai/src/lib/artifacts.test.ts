import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { completeJsonMock } = vi.hoisted(() => ({ completeJsonMock: vi.fn() }))

vi.mock('./llm', () => ({
  LlmError: class LlmError extends Error {},
  completeJson: completeJsonMock,
}))

import * as db from './db'
import {
  generateCoverLetter,
  generateDm,
  generateFollowUps,
  generatePrep,
  prepKey,
  purgeStaleFollowUps,
  renderPrepPlan,
  togglePrepPractised,
} from './artifacts'
import {
  COMPANY_FACTS_CLAUSE,
  DM_MAX_CHARS,
  GROUNDING_CLAUSE,
  FOLLOWUP_PROMPT_VERSION,
  PREP_MAX_TOKENS,
  PREP_PROMPT_VERSION,
} from './prompts'
import { DEFAULT_LLM } from './schema'
import type { Artifact } from './schema'

const input = {
  jobCardId: 'job-1',
  name: 'Seema M U',
  headline: 'Senior QA Automation Engineer',
  resumeText: '13+ years QA automation. Playwright, Cypress, Jenkins, Git.',
  company: 'CGI',
  role: 'Senior QA Automation Engineer',
  jdText: 'Minimum 3 years of Playwright. Must know Cypress and Jenkins.',
  notes: 'Recruiter: Priya',
}

const args = { input, llm: { ...DEFAULT_LLM, model: 'test-model' } }

function single(content: string, modelUsed = 'test-model') {
  return { data: { content }, modelUsed }
}

beforeEach(async () => {
  completeJsonMock.mockReset()
  const database = await db.getDb()
  const tx = database.transaction(['artifacts', 'llmCache'], 'readwrite')
  await tx.objectStore('artifacts').clear()
  await tx.objectStore('llmCache').clear()
  await tx.done
})

describe('generateCoverLetter', () => {
  it('stores the generated letter and grounds the prompt in resume + JD', async () => {
    completeJsonMock.mockResolvedValue(single('Dear Hiring Manager,\n\nI led Playwright adoption.'))

    const artifact = await generateCoverLetter(args)

    expect(artifact.kind).toBe('coverLetter')
    expect(artifact.edited).toBe(false)
    expect(artifact.modelUsed).toBe('test-model')
    expect((await db.listArtifactsForJob('job-1')).map((a) => a.id)).toEqual([artifact.id])

    const userPrompt = completeJsonMock.mock.calls[0][2] as string
    expect(userPrompt).toContain(GROUNDING_CLAUSE)
    expect(userPrompt).toContain('[ADD METRIC]')
    expect(userPrompt).toContain('13+ years QA automation')
    expect(userPrompt).toContain('Minimum 3 years of Playwright')
    expect(userPrompt).toContain('CGI')
  })

  it('serves unchanged inputs from cache with zero extra model calls', async () => {
    completeJsonMock.mockResolvedValue(single('Cached letter'))

    const first = await generateCoverLetter(args)
    const second = await generateCoverLetter(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(1)
    expect(second.content).toBe(first.content)
    expect(second.id).toBe(first.id)
  })

  it('regenerates in place (same id, no duplicate) when forced', async () => {
    completeJsonMock.mockResolvedValueOnce(single('First draft'))
    const first = await generateCoverLetter(args)

    completeJsonMock.mockResolvedValueOnce(single('Second draft'))
    const second = await generateCoverLetter({ ...args, existing: [first], force: true })

    expect(completeJsonMock).toHaveBeenCalledTimes(2)
    expect(second.id).toBe(first.id)
    expect(second.content).toBe('Second draft')
    const stored = await db.listArtifactsForJob('job-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].content).toBe('Second draft')
    expect(stored[0].edited).toBe(false)
  })
})

describe('generateFollowUps', () => {
  it('produces the whole day 1 → day 5 sequence from one model call', async () => {
    completeJsonMock.mockResolvedValue({
      data: { day1: 'Day 1 body', day2: 'Day 2 body', day3: 'Day 3 body', day4: 'Day 4 body', day5: 'Day 5 body' },
      modelUsed: 'test-model',
    })

    const artifacts = await generateFollowUps(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(1)
    expect(artifacts.map((a) => a.variant)).toEqual(['day-1', 'day-2', 'day-3', 'day-4', 'day-5'])
    expect(artifacts.every((a) => a.kind === 'followUp')).toBe(true)
    expect(artifacts[1].content).toBe('Day 2 body')
    expect(await db.listArtifactsForJob('job-1')).toHaveLength(5)
  })

  it('asks for the five-part cadence, the grounding clause and the company guardrail', async () => {
    completeJsonMock.mockResolvedValue({
      data: { day1: 'a', day2: 'b', day3: 'c', day4: 'd', day5: 'e' },
      modelUsed: 'test-model',
    })

    await generateFollowUps(args)

    const userPrompt = completeJsonMock.mock.calls[0][2] as string
    expect(userPrompt).toContain(GROUNDING_CLAUSE)
    expect(userPrompt).toContain(COMPANY_FACTS_CLAUSE)
    expect(userPrompt).toContain('Day 1 through Day 5')
    expect(userPrompt).toContain('120-180 words')
    expect(userPrompt).toContain('day5')
  })

  it('replaces the sequence in place on regenerate', async () => {
    completeJsonMock.mockResolvedValueOnce({
      data: { day1: 'A1', day2: 'A2', day3: 'A3', day4: 'A4', day5: 'A5' },
      modelUsed: 'test-model',
    })
    const first = await generateFollowUps(args)

    completeJsonMock.mockResolvedValueOnce({
      data: { day1: 'B1', day2: 'B2', day3: 'B3', day4: 'B4', day5: 'B5' },
      modelUsed: 'test-model',
    })
    const second = await generateFollowUps({ ...args, existing: first, force: true })

    expect(second.map((a) => a.id)).toEqual(first.map((a) => a.id))
    const stored = await db.listArtifactsForJob('job-1')
    expect(stored).toHaveLength(5)
    expect(stored.map((a) => a.content).sort()).toEqual(['B1', 'B2', 'B3', 'B4', 'B5'])
  })
})

describe('generateDm', () => {
  it('returns a message under the character ceiling', async () => {
    completeJsonMock.mockResolvedValue(single('Hi Priya, I applied for the QA role at CGI.'))

    const artifact = await generateDm(args)

    expect(artifact.kind).toBe('dm')
    expect(artifact.variant).toBeUndefined()
    expect(artifact.content.length).toBeLessThanOrEqual(DM_MAX_CHARS)
  })

  it('retries once with a corrective instruction when the message is too long', async () => {
    completeJsonMock.mockResolvedValueOnce(single('x'.repeat(DM_MAX_CHARS + 40)))
    completeJsonMock.mockResolvedValueOnce(single('Short and compliant.'))

    const artifact = await generateDm(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(2)
    expect(artifact.content).toBe('Short and compliant.')
    const corrective = completeJsonMock.mock.calls[1][2] as string
    expect(corrective).toContain(`${DM_MAX_CHARS} characters`)
  })

  it('keeps the longer draft rather than losing it if the retry also overruns', async () => {
    const long = 'y'.repeat(DM_MAX_CHARS + 25)
    completeJsonMock.mockResolvedValueOnce(single(long))
    completeJsonMock.mockResolvedValueOnce(single('z'.repeat(DM_MAX_CHARS + 10)))

    const artifact = await generateDm(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(2)
    expect(artifact.content.length).toBeGreaterThan(DM_MAX_CHARS)
    expect(artifact.content).toBe('z'.repeat(DM_MAX_CHARS + 10))
  })

  it('does not call the model again when a cached draft exists', async () => {
    completeJsonMock.mockResolvedValueOnce(single('Cached DM'))

    const first = await generateDm(args)
    const second = await generateDm(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(1)
    expect(second.content).toBe(first.content)
  })
})

describe('artifact replacement semantics', () => {
  it('never duplicates an artifact for the same kind and variant', async () => {
    completeJsonMock.mockResolvedValue(single('v1'))
    const first = await generateCoverLetter(args)
    const existing: Artifact[] = [first]

    completeJsonMock.mockResolvedValueOnce(single('v2'))
    await generateCoverLetter({ ...args, existing, force: true })

    expect(await db.listArtifactsForJob('job-1')).toHaveLength(1)
  })
})

describe('generatePrep', () => {
  const plan = {
    topics: [
      {
        topic: 'Playwright',
        questions: ['How do you structure fixtures?', 'How do you handle flaky tests?'],
      },
      { topic: 'CI', questions: ['How do you gate merges on Jenkins?'] },
    ],
  }

  it('stores a structured plan plus readable text, with no ticks', async () => {
    completeJsonMock.mockResolvedValue({ data: plan, modelUsed: 'test-model' })

    const artifact = await generatePrep(args)

    expect(artifact.kind).toBe('prep')
    expect(artifact.variant).toBeUndefined()
    expect(artifact.promptVersion).toBe(PREP_PROMPT_VERSION)
    expect(artifact.prep).toEqual(plan)
    expect(artifact.practised).toEqual([])
    // `content` is the rendering, so Copy works and the backup stays readable.
    expect(artifact.content).toContain('## Playwright')
    expect(artifact.content).toContain('- How do you handle flaky tests?')
    expect((await db.listArtifactsForJob('job-1')).map((a) => a.id)).toEqual([artifact.id])

    const userPrompt = completeJsonMock.mock.calls[0][2] as string
    expect(userPrompt).toContain(GROUNDING_CLAUSE)
    expect(userPrompt).toContain(COMPANY_FACTS_CLAUSE)
    expect(userPrompt).toContain('13+ years QA automation')
    expect(userPrompt).toContain('Minimum 3 years of Playwright')
  })

  it('asks for topic-grouped questions drawn from the JD and resume', async () => {
    completeJsonMock.mockResolvedValue({ data: plan, modelUsed: 'test-model' })
    await generatePrep(args)
    const userPrompt = completeJsonMock.mock.calls[0][2] as string
    expect(userPrompt).toContain('"topics"')
    expect(userPrompt).toContain('3-5 topics')
  })

  it('keeps the output budget under a 1000 OTPM ceiling', async () => {
    completeJsonMock.mockResolvedValue({ data: plan, modelUsed: 'test-model' })
    await generatePrep(args)

    const options = completeJsonMock.mock.calls[0][4] as { maxTokens?: number }
    // Small Groq organisations get 1000 output tokens per minute, and an oversized
    // request is refused outright rather than truncated, so prep must stay under it.
    expect(options.maxTokens).toBe(PREP_MAX_TOKENS)
    expect(options.maxTokens).toBeLessThanOrEqual(1000)
  })

  it('serves an unchanged input from cache with zero extra model calls', async () => {
    completeJsonMock.mockResolvedValue({ data: plan, modelUsed: 'test-model' })

    const first = await generatePrep(args)
    const second = await generatePrep(args)

    expect(completeJsonMock).toHaveBeenCalledTimes(1)
    expect(second.prep).toEqual(first.prep)
    expect(second.id).toBe(first.id)
  })

  it('regenerates in place and resets the practised ticks', async () => {
    completeJsonMock.mockResolvedValueOnce({ data: plan, modelUsed: 'test-model' })
    const first = await generatePrep(args)
    const ticked = await togglePrepPractised(first, prepKey(0, 0))
    expect(ticked.practised).toEqual(['0:0'])

    const nextPlan = {
      topics: [{ topic: 'System design', questions: ['How would you test a queue?'] }],
    }
    completeJsonMock.mockResolvedValueOnce({ data: nextPlan, modelUsed: 'test-model' })
    const second = await generatePrep({ ...args, existing: [ticked], force: true })

    expect(completeJsonMock).toHaveBeenCalledTimes(2)
    expect(second.id).toBe(first.id)
    // The questions are new, so the old ticks would be meaningless — cleared.
    expect(second.practised).toEqual([])
    expect(second.prep).toEqual(nextPlan)

    const stored = await db.listArtifactsForJob('job-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].practised).toEqual([])
  })

  it('does not duplicate the prep artifact across generations', async () => {
    completeJsonMock.mockResolvedValue({ data: plan, modelUsed: 'test-model' })

    const first = await generatePrep(args)
    await generatePrep({ ...args, existing: [first], force: true })

    expect(await db.listArtifactsForJob('job-1')).toHaveLength(1)
  })
})

describe('togglePrepPractised', () => {
  const prepArtifact = (id: string): Artifact => ({
    id,
    jobCardId: 'job-1',
    kind: 'prep',
    content: '## Topic\n- Q',
    edited: false,
    modelUsed: 'test-model',
    promptVersion: PREP_PROMPT_VERSION,
    createdAt: '2026-09-10T00:00:00.000Z',
    practised: [],
    prep: { topics: [{ topic: 'Topic', questions: ['Q'] }] },
  })

  it('ticks a question on, then off again, persisting each change', async () => {
    const artifact = prepArtifact('p1')

    const on = await togglePrepPractised(artifact, prepKey(0, 0))
    expect(on.practised).toEqual(['0:0'])
    expect((await db.listArtifactsForJob('job-1'))[0].practised).toEqual(['0:0'])

    const off = await togglePrepPractised(on, prepKey(0, 0))
    expect(off.practised).toEqual([])
    expect((await db.listArtifactsForJob('job-1'))[0].practised).toEqual([])
  })

  it('leaves other ticks alone when flipping one', async () => {
    const artifact: Artifact = { ...prepArtifact('p1'), practised: ['0:0'] }
    const updated = await togglePrepPractised(artifact, prepKey(1, 2))
    expect([...updated.practised].sort()).toEqual(['0:0', '1:2'])
  })
})

describe('renderPrepPlan', () => {
  it('renders each topic as a heading with one bullet per question', () => {
    expect(
      renderPrepPlan({
        topics: [
          { topic: 'Playwright', questions: ['Q1', 'Q2'] },
          { topic: 'CI', questions: ['Q3'] },
        ],
      }),
    ).toBe('## Playwright\n- Q1\n- Q2\n\n## CI\n- Q3')
  })
})

describe('purgeStaleFollowUps', () => {
  const followUp = (id: string, variant: string, promptVersion: string): Artifact => ({
    id,
    jobCardId: 'job-1',
    kind: 'followUp',
    variant,
    content: `Body ${id}`,
    edited: false,
    modelUsed: 'test-model',
    promptVersion,
    createdAt: '2026-09-10T00:00:00.000Z',
    practised: [],
  })

  it('removes old three-email drafts and keeps the current cadence', async () => {
    await db.saveArtifact(followUp('old-3', 'day-3', 'followup-v1'))
    await db.saveArtifact(followUp('old-7', 'day-7', 'followup-v1'))
    await db.saveArtifact(followUp('old-14', 'day-14', 'followup-v1'))
    await db.saveArtifact(followUp('new-1', 'day-1', FOLLOWUP_PROMPT_VERSION))
    await db.saveArtifact(followUp('new-4', 'day-4', FOLLOWUP_PROMPT_VERSION))

    const removed = await purgeStaleFollowUps()

    expect(removed).toBe(3)
    expect((await db.listArtifactsForJob('job-1')).map((a) => a.id).sort()).toEqual(['new-1', 'new-4'])
  })

  it('leaves other artifact kinds alone even with an old prompt version', async () => {
    await db.saveArtifact({
      id: 'letter',
      jobCardId: 'job-1',
      kind: 'coverLetter',
      content: 'Dear Hiring Manager,',
      edited: true,
      modelUsed: 'test-model',
      promptVersion: 'cover-letter-v1',
      createdAt: '2026-09-10T00:00:00.000Z',
      practised: [],
    })

    expect(await purgeStaleFollowUps()).toBe(0)
    expect((await db.listArtifactsForJob('job-1')).map((a) => a.id)).toEqual(['letter'])
  })
})
