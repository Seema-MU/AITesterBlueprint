import { describe, expect, it } from 'vitest'
import { buildExportData, EXPORT_SCHEMA_VERSION, parseImportFile } from './exportImport'
import type { ExportFile } from './exportImport'
import type { JobCard, SettingsRow } from './schema'
import { DEFAULT_LLM, EMPTY_PROFILE } from './schema'

const settings: SettingsRow = { key: 'ui', theme: 'dark' }

const cards: JobCard[] = [
  {
    id: 'c1',
    company: 'CGI',
    role: 'Senior QA Automation Engineer',
    dateApplied: '2026-09-01',
    status: 'applied',
    history: [],
  },
]

function toFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

describe('export / import', () => {
  it('round-trips a v5 backup including resume files as base64', async () => {
    const bytes = [37, 80, 68, 70, 45, 49, 46, 52] // "%PDF-1.4"
    const data = buildExportData(cards, settings, {
      llm: DEFAULT_LLM,
      profile: { ...EMPTY_PROFILE, name: 'Seema M U', resumeText: '13+ years in QA automation.' },
      resumeVersions: [
        {
          id: 'r1',
          label: 'QA_Resume_CGI_v2',
          notes: 'tailored for CGI',
          isPrimary: true,
          fileName: 'QA_Resume.pdf',
          fileData: new Uint8Array(bytes).buffer,
          fileMimeType: 'application/pdf',
          rawText: 'SEEMA M U — Senior QA Automation Engineer',
          parsed: {
            skills: [{ name: 'Playwright', category: 'testing', years: 3, evidence: ['Playwright (3 yrs)'] }],
            roles: [{ title: 'Senior QA Automation Engineer' }],
            education: [],
            certifications: [],
            totalYears: 13,
          },
          modelUsed: 'test-model',
          promptVersion: 'resume-parse-v1',
          createdAt: '2026-09-11T00:00:00.000Z',
        },
      ],
      interviews: [
        {
          id: 'i1',
          jobCardId: 'c1',
          round: 2,
          label: 'Technical screen',
          scheduledAt: '2026-09-25T14:30',
          durationMins: 60,
          interviewer: 'Priya',
          format: 'video',
          outcome: 'pending',
          notes: 'Expect a Playwright deep-dive',
          createdAt: '2026-09-12T00:00:00.000Z',
        },
      ],
    })

    // The bytes must travel as base64, not as an ArrayBuffer instance.
    expect(typeof data.resumeVersions?.[0].fileBase64).toBe('string')
    expect(data.resumeVersions?.[0]).not.toHaveProperty('fileData')

    const parsed = await parseImportFile(toFile(data))
    expect(parsed.resumeVersions).toHaveLength(1)
    const [version] = parsed.resumeVersions
    expect(version.label).toBe('QA_Resume_CGI_v2')
    expect(version.isPrimary).toBe(true)
    expect(version.parsed?.skills[0].name).toBe('Playwright')
    // The file survives the trip byte-for-byte.
    expect(Array.from(new Uint8Array(version.fileData))).toEqual(bytes)
    expect(EXPORT_SCHEMA_VERSION).toBe(5)
    // Rounds travel with the backup, schedule and outcome intact.
    expect(parsed.interviews).toHaveLength(1)
    expect(parsed.interviews[0].round).toBe(2)
    expect(parsed.interviews[0].scheduledAt).toBe('2026-09-25T14:30')
    expect(parsed.interviews[0].interviewer).toBe('Priya')
  })

  it('round-trips cards, specs, analyses and artifacts', async () => {
    const data = await buildExportData(cards, settings, {
      llm: DEFAULT_LLM,
      profile: { ...EMPTY_PROFILE, name: 'Seema M U', resumeText: '13+ years in QA automation.' },
      jobSpecs: [
        {
          id: 's1',
          jobCardId: 'c1',
          requiredSkills: [{ name: 'Playwright', evidence: 'Minimum 3 years of Playwright' }],
          preferredSkills: [],
          domainTags: ['retail'],
          promptVersion: 'spec-v1',
          extractedAt: '2026-09-08T00:00:00.000Z',
        },
      ],
      matchAnalyses: [
        {
          id: 'a1',
          jobCardId: 'c1',
          resumeVersionId: 'main',
          overallScore: 55,
          subScores: {
            requiredCoverage: 0.5,
            preferredCoverage: 1,
            seniorityFit: 1,
            domainFit: 1,
            atsKeywordCoverage: 0.5,
          },
          matched: [{ name: 'Playwright', resumeSnippet: 'piloted Playwright' }],
          missingBlocking: [],
          missingCoverable: [],
          missingNiceToHave: [],
          atsGapKeywords: [],
          modelUsed: 'test-model',
          promptVersion: 'spec-v1',
          createdAt: '2026-09-08T00:00:00.000Z',
        },
      ],
      artifacts: [
        {
          id: 'art1',
          jobCardId: 'c1',
          kind: 'coverLetter',
          content: 'Dear Hiring Manager, …',
          edited: false,
          modelUsed: 'test-model',
          promptVersion: 'cover-letter-v1',
          createdAt: '2026-09-10T00:00:00.000Z',
          practised: [],
        },
        {
          id: 'art2',
          jobCardId: 'c1',
          kind: 'followUp',
          variant: 'day-3',
          content: 'Subject: Following up\n\nJust checking in…',
          edited: true,
          modelUsed: 'test-model',
          promptVersion: 'followup-v1',
          createdAt: '2026-09-10T00:00:00.000Z',
          practised: [],
        },
      ],
    })
    const file = toFile(data)
    const parsed = await parseImportFile(file)
    expect(parsed.jobCards).toEqual(data.jobCards)
    expect(parsed.jobSpecs).toHaveLength(1)
    expect(parsed.matchAnalyses).toHaveLength(1)
    expect(parsed.profile?.name).toBe('Seema M U')
    expect(parsed.llm).toEqual(DEFAULT_LLM)
    expect(parsed.artifacts).toHaveLength(2)
    expect(parsed.artifacts[1].variant).toBe('day-3')
    expect(parsed.artifacts[1].edited).toBe(true)
    expect(parsed.resumeVersions).toEqual([])
    expect(parsed.interviews).toEqual([])
  })

  it('imports a v3 backup by starting the resume library empty', async () => {
    const v3 = {
      schemaVersion: 3,
      exportedAt: '2026-09-10T00:00:00.000Z',
      jobCards: cards,
      settings,
      artifacts: [
        {
          id: 'art1',
          jobCardId: 'c1',
          kind: 'coverLetter',
          content: 'Dear Hiring Manager,',
          edited: false,
          modelUsed: 'test-model',
          promptVersion: 'cover-letter-v2',
          createdAt: '2026-09-10T00:00:00.000Z',
        },
      ],
    }
    const parsed = await parseImportFile(toFile(v3))
    expect(parsed.jobCards).toEqual(cards)
    expect(parsed.artifacts).toHaveLength(1)
    expect(parsed.resumeVersions).toEqual([])
    expect(parsed.interviews).toEqual([])
  })

  it('imports a v4 backup by starting the interview rounds empty', async () => {
    // The regression guard for the ladder: `schemaVersion` is a literal, so a v4 file
    // must still match v4 now that a v5 schema sits ahead of it.
    const v4 = {
      schemaVersion: 4,
      exportedAt: '2026-09-12T00:00:00.000Z',
      jobCards: cards,
      settings,
      artifacts: [],
      resumeVersions: [],
    }
    const parsed = await parseImportFile(toFile(v4))
    expect(parsed.jobCards).toEqual(cards)
    expect(parsed.resumeVersions).toEqual([])
    expect(parsed.interviews).toEqual([])
  })

  it('imports a v2 backup by starting the artifact set empty', async () => {
    const v2 = {
      schemaVersion: 2,
      exportedAt: '2026-09-08T00:00:00.000Z',
      jobCards: cards,
      settings,
      llm: DEFAULT_LLM,
      profile: EMPTY_PROFILE,
      jobSpecs: [],
      matchAnalyses: [],
    }
    const parsed = await parseImportFile(toFile(v2))
    expect(parsed.jobCards).toEqual(cards)
    expect(parsed.artifacts).toEqual([])
  })

  it('imports a v1 backup by filling defaults for the AI records', async () => {
    const v1 = {
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      jobCards: cards,
      settings,
    }
    const parsed = await parseImportFile(toFile(v1))
    expect(parsed.jobCards).toEqual(cards)
    expect(parsed.profile).toEqual(EMPTY_PROFILE)
    expect(parsed.jobSpecs).toEqual([])
    expect(parsed.matchAnalyses).toEqual([])
    expect(parsed.artifacts).toEqual([])
    expect(parsed.resumeVersions).toEqual([])
    expect(parsed.interviews).toEqual([])
  })

  it('rejects a file with an unknown schema version', async () => {
    const data = {
      ...(await buildExportData(cards, settings)),
      schemaVersion: 99,
    } as unknown as ExportFile
    await expect(parseImportFile(toFile(data))).rejects.toThrow(/does not match the expected format/)
  })

  it('rejects a file containing an invalid card', async () => {
    const bad = await buildExportData(cards, settings)
    bad.jobCards[0].company = ''
    await expect(parseImportFile(toFile(bad))).rejects.toThrow(/does not match the expected format/)
  })

  it('rejects non-JSON content', async () => {
    const file = new File(['not json at all'], 'backup.json')
    await expect(parseImportFile(file)).rejects.toThrow(/not valid JSON/)
  })
})
