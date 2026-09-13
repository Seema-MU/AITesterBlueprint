import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { completeJsonMock } = vi.hoisted(() => ({ completeJsonMock: vi.fn() }))

vi.mock('./llm', () => ({
  LlmError: class LlmError extends Error {},
  completeJson: completeJsonMock,
}))

const { extractResumeTextMock } = vi.hoisted(() => ({ extractResumeTextMock: vi.fn() }))

vi.mock('./resumeFile', () => ({
  ResumeFileError: class ResumeFileError extends Error {},
  RESUME_ACCEPT: '.pdf,.docx',
  isSupportedResumeFile: () => true,
  extractResumeText: extractResumeTextMock,
}))

import * as db from './db'
import {
  bestScoreForVersion,
  createResumeVersion,
  defaultResumeLabel,
  parseResumeText,
  reparseResumeVersion,
  resolveResume,
} from './resumes'
import { DEFAULT_LLM, EMPTY_PROFILE } from './schema'
import type { JobCard, MatchAnalysis, ResumeVersion } from './schema'
import { RESUME_PARSE_PROMPT_VERSION } from './prompts'

const rawResume = `SEEMA M U — Senior QA Automation Engineer
13+ years in software testing. Playwright (3 yrs), Cypress, Jenkins, Git.`

const parsedPayload = {
  skills: [
    { name: 'Playwright', category: 'testing', years: 3, evidence: ['Playwright (3 yrs)'] },
    { name: 'Jenkins', category: 'tool', evidence: ['Cypress, Jenkins, Git'] },
  ],
  roles: [{ title: 'Senior QA Automation Engineer' }],
  education: [],
  certifications: [{ name: 'ISTQB' }],
  totalYears: 13,
}

const llm = { ...DEFAULT_LLM, model: 'test-model' }

function pdfFile(name = 'QA_Resume.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

beforeEach(async () => {
  completeJsonMock.mockReset()
  extractResumeTextMock.mockReset()
  extractResumeTextMock.mockResolvedValue(rawResume)
  const database = await db.getDb()
  const tx = database.transaction(['resumeVersions', 'llmCache', 'jobCards'], 'readwrite')
  await tx.objectStore('resumeVersions').clear()
  await tx.objectStore('llmCache').clear()
  await tx.objectStore('jobCards').clear()
  await tx.done
})

describe('defaultResumeLabel', () => {
  it('uses the file name stem as the version tag', () => {
    expect(defaultResumeLabel('QA_Resume_CGI_v2.pdf')).toBe('QA_Resume_CGI_v2')
    expect(defaultResumeLabel('resume.docx')).toBe('resume')
  })
})

describe('parseResumeText', () => {
  it('validates the model output and grounds the prompt in the resume text', async () => {
    completeJsonMock.mockResolvedValue({ data: parsedPayload, modelUsed: 'test-model' })

    const result = await parseResumeText(rawResume, llm)

    expect(result.parsed.skills.map((s) => s.name)).toEqual(['Playwright', 'Jenkins'])
    expect(result.parsed.totalYears).toBe(13)
    const userPrompt = completeJsonMock.mock.calls[0][2] as string
    expect(userPrompt).toContain(rawResume)
    expect(userPrompt).toContain('verbatim')
  })

  it('serves unchanged text from cache with zero extra model calls', async () => {
    completeJsonMock.mockResolvedValue({ data: parsedPayload, modelUsed: 'test-model' })

    const first = await parseResumeText(rawResume, llm)
    const second = await parseResumeText(rawResume, llm)

    expect(completeJsonMock).toHaveBeenCalledTimes(1)
    expect(second.parsed).toEqual(first.parsed)
    expect(second.modelUsed).toBe('test-model')
  })
})

describe('createResumeVersion', () => {
  it('extracts text, stores the original file and keeps the parsed profile', async () => {
    completeJsonMock.mockResolvedValue({ data: parsedPayload, modelUsed: 'test-model' })

    const version = await createResumeVersion({ file: pdfFile(), llm })

    expect(version.label).toBe('QA_Resume')
    expect(version.rawText).toBe(rawResume)
    expect(version.isPrimary).toBe(true) // first upload
    expect(version.parsed?.skills).toHaveLength(2)
    expect(version.promptVersion).toBe(RESUME_PARSE_PROMPT_VERSION)
    expect(version.parseError).toBeUndefined()

    const [stored] = await db.listResumeVersions()
    expect(new TextDecoder().decode(stored.fileData)).toBe('%PDF-1.4')
    expect(stored.fileMimeType).toBe('application/pdf')
  })

  it('honours an explicit label and notes', async () => {
    completeJsonMock.mockResolvedValue({ data: parsedPayload, modelUsed: 'test-model' })
    const version = await createResumeVersion({
      file: pdfFile(),
      label: 'QA_Resume_CGI_v2',
      notes: 'tailored for CGI',
      llm,
    })
    expect(version.label).toBe('QA_Resume_CGI_v2')
    expect(version.notes).toBe('tailored for CGI')
  })

  it('saves the upload but skips parsing when no model is configured', async () => {
    const version = await createResumeVersion({ file: pdfFile(), llm: DEFAULT_LLM })

    expect(completeJsonMock).not.toHaveBeenCalled()
    expect(version.rawText).toBe(rawResume)
    expect(version.parsed).toBeUndefined()
    expect(version.parseError).toBeUndefined()
  })

  it('keeps the upload and records parseError when the model fails', async () => {
    completeJsonMock.mockRejectedValue(new Error('Model returned invalid JSON.'))

    const version = await createResumeVersion({ file: pdfFile(), llm })

    expect(version.rawText).toBe(rawResume)
    expect(version.parsed).toBeUndefined()
    expect(version.parseError).toBe('Model returned invalid JSON.')

    const [stored] = await db.listResumeVersions()
    expect(stored.parseError).toBe('Model returned invalid JSON.')
    expect(stored.rawText).toBe(rawResume)
  })
})

describe('reparseResumeVersion', () => {
  it('fills in the parsed profile on a successful re-parse', async () => {
    const version = await createResumeVersion({ file: pdfFile(), llm: DEFAULT_LLM })
    completeJsonMock.mockResolvedValue({ data: parsedPayload, modelUsed: 'test-model' })

    const updated = await reparseResumeVersion(version, llm)

    expect(updated.parsed?.totalYears).toBe(13)
    expect(updated.parseError).toBeUndefined()
  })

  it('refuses to claim a parse when no model is configured', async () => {
    const version = await createResumeVersion({ file: pdfFile(), llm: DEFAULT_LLM })
    await expect(reparseResumeVersion(version, DEFAULT_LLM)).rejects.toThrow(/Set the model name/)
  })
})

describe('resolveResume', () => {
  const card: JobCard = {
    id: 'c1',
    company: 'CGI',
    role: 'Senior QA',
    dateApplied: '2026-09-01',
    status: 'applied',
    history: [],
  }
  const version = (id: string, isPrimary: boolean, text: string): ResumeVersion => ({
    id,
    label: `R ${id}`,
    isPrimary,
    fileName: `${id}.pdf`,
    fileData: new Uint8Array([37, 80, 68, 70]).buffer,
    fileMimeType: 'application/pdf',
    rawText: text,
    createdAt: '2026-09-11T00:00:00.000Z',
  })

  it("prefers the card's own resume version", () => {
    const resolved = resolveResume(
      { ...card, resumeVersionId: 'b' },
      [version('a', true, 'primary text'), version('b', false, 'card text')],
      EMPTY_PROFILE,
    )
    expect(resolved).toEqual({ resumeVersionId: 'b', resumeText: 'card text', label: 'R b' })
  })

  it('falls back to the primary version', () => {
    const resolved = resolveResume(card, [version('a', false, 'x'), version('p', true, 'primary text')], EMPTY_PROFILE)
    expect(resolved.resumeText).toBe('primary text')
    expect(resolved.resumeVersionId).toBe('p')
  })

  it('falls back to the pasted profile text when no versions exist', () => {
    const resolved = resolveResume(card, [], { ...EMPTY_PROFILE, resumeText: 'pasted text' })
    expect(resolved.resumeText).toBe('pasted text')
    expect(resolved.resumeVersionId).toBe('main')
  })

  it('falls back gracefully when the card points at a deleted version', () => {
    const resolved = resolveResume(
      { ...card, resumeVersionId: 'gone' },
      [version('p', true, 'primary text')],
      EMPTY_PROFILE,
    )
    expect(resolved.resumeVersionId).toBe('p')
  })
})

describe('bestScoreForVersion', () => {
  const analysis = (resumeVersionId: string, overallScore: number): MatchAnalysis => ({
    id: `a-${resumeVersionId}-${overallScore}`,
    jobCardId: 'c1',
    resumeVersionId,
    overallScore,
    subScores: {
      requiredCoverage: 1,
      preferredCoverage: 1,
      seniorityFit: 1,
      domainFit: 1,
      atsKeywordCoverage: 1,
    },
    matched: [],
    missingBlocking: [],
    missingCoverable: [],
    missingNiceToHave: [],
    atsGapKeywords: [],
    modelUsed: 'test-model',
    promptVersion: 'spec-v3',
    createdAt: '2026-09-11T00:00:00.000Z',
  })

  it('returns the highest score for that version only', () => {
    const analyses = [analysis('a', 40), analysis('a', 83), analysis('b', 99)]
    expect(bestScoreForVersion(analyses, 'a')).toBe(83)
    expect(bestScoreForVersion(analyses, 'b')).toBe(99)
  })

  it('returns undefined when the version has never been analysed', () => {
    expect(bestScoreForVersion([analysis('a', 40)], 'b')).toBeUndefined()
  })
})
