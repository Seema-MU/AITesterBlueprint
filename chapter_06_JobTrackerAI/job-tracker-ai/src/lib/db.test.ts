import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import type { Artifact, InterviewRound, JobCard, ResumeVersion, SettingsRow } from './schema'
import { DEFAULT_LLM, EMPTY_PROFILE } from './schema'

const card = (id: string, status: JobCard['status'] = 'wishlist'): JobCard => ({
  id,
  company: `Company ${id}`,
  role: `Role ${id}`,
  dateApplied: '2026-09-01',
  status,
  history: [],
})

const artifact = (id: string, jobCardId: string, variant?: string): Artifact => ({
  id,
  jobCardId,
  kind: variant ? 'followUp' : 'coverLetter',
  variant,
  content: `Generated copy ${id}`,
  edited: false,
  modelUsed: 'test-model',
  promptVersion: 'cover-letter-v1',
  createdAt: '2026-09-10T00:00:00.000Z',
  practised: [],
})

const round = (id: string, jobCardId: string, roundNo: number): InterviewRound => ({
  id,
  jobCardId,
  round: roundNo,
  label: `Round ${roundNo}`,
  scheduledAt: `2026-10-0${roundNo}T14:30`,
  interviewer: 'Priya',
  format: 'video',
  outcome: 'pending',
  createdAt: '2026-09-20T00:00:00.000Z',
})

const RESUME_BYTES = [37, 80, 68, 70, 45, 49, 46, 52] // "%PDF-1.4"

const resume = (id: string, isPrimary = false, createdAt = '2026-09-11T00:00:00.000Z'): ResumeVersion => ({
  id,
  label: `Resume ${id}`,
  isPrimary,
  fileName: `${id}.pdf`,
  fileData: new Uint8Array(RESUME_BYTES).buffer,
  fileMimeType: 'application/pdf',
  rawText: `Resume text ${id}`,
  createdAt,
})

beforeEach(async () => {
  const database = await db.getDb()
  const tx = database.transaction(
    ['jobCards', 'settings', 'artifacts', 'resumeVersions', 'interviews'],
    'readwrite',
  )
  await tx.objectStore('jobCards').clear()
  await tx.objectStore('settings').clear()
  await tx.objectStore('artifacts').clear()
  await tx.objectStore('resumeVersions').clear()
  await tx.objectStore('interviews').clear()
  await tx.done
})

describe('jobCards store', () => {
  it('starts empty and persists saved cards', async () => {
    expect(await db.listJobCards()).toEqual([])
    await db.saveJobCard(card('a'))
    await db.saveJobCard(card('b'))
    const all = await db.listJobCards()
    expect(all.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('deletes a card by id', async () => {
    await db.saveJobCard(card('a'))
    await db.saveJobCard(card('b'))
    await db.deleteJobCard('a')
    const all = await db.listJobCards()
    expect(all.map((c) => c.id)).toEqual(['b'])
  })

  it('overwrites a card with the same id (update)', async () => {
    await db.saveJobCard(card('a', 'wishlist'))
    await db.saveJobCard({ ...card('a'), status: 'offer' })
    const all = await db.listJobCards()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('offer')
  })
})

describe('settings store', () => {
  it('returns undefined when unset', async () => {
    expect(await db.getSettings()).toBeUndefined()
  })

  it('saves and reads settings', async () => {
    const row: SettingsRow = { key: 'ui', theme: 'dark' }
    await db.saveSettings(row)
    expect(await db.getSettings()).toEqual(row)
  })
})

describe('replaceAllData', () => {
  it('replaces cards, settings, profile, specs and analyses atomically', async () => {
    await db.saveJobCard(card('old'))
    await db.saveSettings({ key: 'ui', theme: 'light' })
    await db.saveSpec({
      id: 'spec-old',
      jobCardId: 'old',
      requiredSkills: [{ name: 'X', evidence: 'requires X' }],
      preferredSkills: [],
      domainTags: [],
      promptVersion: 'spec-v1',
      extractedAt: '2026-09-01T00:00:00.000Z',
    })

    const fresh: JobCard[] = [card('x', 'interview'), card('y', 'rejected')]
    const settings: SettingsRow = { key: 'ui', theme: 'dark' }
    await db.replaceAllData({
      jobCards: fresh,
      settings,
      llm: DEFAULT_LLM,
      profile: { ...EMPTY_PROFILE, resumeText: '13+ years QA' },
      jobSpecs: [],
      matchAnalyses: [],
      artifacts: [],
      resumeVersions: [],
      interviews: [],
    })

    expect((await db.listJobCards()).map((c) => c.id).sort()).toEqual(['x', 'y'])
    expect(await db.getSettings()).toEqual(settings)
    expect(await db.getProfile()).toEqual({ ...EMPTY_PROFILE, resumeText: '13+ years QA' })
    expect(await db.getSpecForJob('old')).toBeUndefined()
    expect(await db.getAllJobSpecs()).toEqual([])
  })

  it('deletes a card and cascades to its spec and analyses', async () => {
    await db.saveJobCard(card('a'))
    await db.saveSpec({
      id: 'spec-a',
      jobCardId: 'a',
      requiredSkills: [],
      preferredSkills: [],
      domainTags: [],
      promptVersion: 'spec-v1',
      extractedAt: '2026-09-01T00:00:00.000Z',
    })
    await db.saveArtifact(artifact('art-a', 'a'))
    await db.deleteJobCard('a')
    expect(await db.listJobCards()).toEqual([])
    expect(await db.getSpecForJob('a')).toBeUndefined()
    expect(await db.listArtifactsForJob('a')).toEqual([])
  })
})

describe('artifacts store', () => {
  it('saves and lists artifacts per job card', async () => {
    await db.saveArtifact(artifact('a1', 'job-1'))
    await db.saveArtifact(artifact('a2', 'job-1', 'day-3'))
    await db.saveArtifact(artifact('b1', 'job-2'))

    const forJob1 = await db.listArtifactsForJob('job-1')
    expect(forJob1.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
    expect(await db.getAllArtifacts()).toHaveLength(3)
  })

  it('overwrites an artifact with the same id (regenerate in place)', async () => {
    await db.saveArtifact(artifact('a1', 'job-1'))
    await db.saveArtifact({ ...artifact('a1', 'job-1'), content: 'Rewritten copy' })
    const all = await db.listArtifactsForJob('job-1')
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('Rewritten copy')
  })

  it('deletes a single artifact', async () => {
    await db.saveArtifact(artifact('a1', 'job-1'))
    await db.deleteArtifact('a1')
    expect(await db.listArtifactsForJob('job-1')).toEqual([])
  })

  it('replaces artifacts on import (replaceAllData)', async () => {
    await db.saveArtifact(artifact('old', 'job-1'))
    await db.saveJobCard(card('job-1'))
    await db.replaceAllData({
      jobCards: [card('job-1')],
      settings: { key: 'ui', theme: 'light' },
      llm: DEFAULT_LLM,
      profile: EMPTY_PROFILE,
      jobSpecs: [],
      matchAnalyses: [],
      artifacts: [artifact('new', 'job-1', 'day-7')],
      resumeVersions: [],
      interviews: [round('r1', 'job-1', 1)],
    })
    const all = await db.listArtifactsForJob('job-1')
    expect(all.map((a) => a.id)).toEqual(['new'])
    expect(all[0].variant).toBe('day-7')
    expect((await db.listRoundsForJob('job-1')).map((r) => r.id)).toEqual(['r1'])
  })
})

describe('resume versions', () => {
  it('makes the very first uploaded resume primary', async () => {
    const saved = await db.saveResumeVersion(resume('a'))
    expect(saved.isPrimary).toBe(true)
    const all = await db.listResumeVersions()
    expect(all.filter((v) => v.isPrimary)).toHaveLength(1)
  })

  it('keeps exactly one primary when a later upload claims it', async () => {
    await db.saveResumeVersion(resume('a'))
    await db.saveResumeVersion({ ...resume('b'), isPrimary: true })

    const all = await db.listResumeVersions()
    expect(all.filter((v) => v.isPrimary).map((v) => v.id)).toEqual(['b'])
  })

  it('demotes the previous primary on setPrimary, atomically', async () => {
    await db.saveResumeVersion(resume('a'))
    await db.saveResumeVersion(resume('b'))
    await db.setPrimaryResumeVersion('b')

    const all = await db.listResumeVersions()
    expect(all.filter((v) => v.isPrimary).map((v) => v.id)).toEqual(['b'])
  })

  it('re-promotes a surviving version when the primary is deleted', async () => {
    await db.saveResumeVersion(resume('old', false, '2026-01-01T00:00:00.000Z'))
    await db.saveResumeVersion(resume('primary', true, '2026-02-01T00:00:00.000Z'))
    await db.saveResumeVersion(resume('newest', false, '2026-03-01T00:00:00.000Z'))

    await db.deleteResumeVersion('primary')

    const all = await db.listResumeVersions()
    expect(all).toHaveLength(2)
    // The newest survivor takes over so one primary always exists.
    expect(all.filter((v) => v.isPrimary).map((v) => v.id)).toEqual(['newest'])
  })

  it('clears job-card references to a deleted resume version', async () => {
    await db.saveResumeVersion(resume('a', true, '2026-01-01T00:00:00.000Z'))
    await db.saveResumeVersion(resume('b', false, '2026-02-01T00:00:00.000Z'))
    await db.saveJobCard({ ...card('job-1'), resumeVersionId: 'b' })

    await db.deleteResumeVersion('b')

    const [stored] = await db.listJobCards()
    expect(stored.resumeVersionId).toBeUndefined()
    // 'a' is untouched and still the only primary.
    const versions = await db.listResumeVersions()
    expect(versions.filter((v) => v.isPrimary).map((v) => v.id)).toEqual(['a'])
  })

  it('leaves no primary when the last version is deleted', async () => {
    await db.saveResumeVersion(resume('only'))
    await db.deleteResumeVersion('only')
    expect(await db.listResumeVersions()).toEqual([])
  })

  it('persists the stored file bytes intact', async () => {
    await db.saveResumeVersion(resume('a'))
    const [stored] = await db.listResumeVersions()
    // Byte equality is the meaningful check; the buffer may come back from another realm,
    // so `instanceof ArrayBuffer` is not reliable here.
    expect(Array.from(new Uint8Array(stored.fileData))).toEqual(RESUME_BYTES)
    expect(stored.fileMimeType).toBe('application/pdf')
  })
})

describe('interviews store', () => {
  it('starts empty and lists rounds per job card', async () => {
    expect(await db.getAllRounds()).toEqual([])
    await db.saveRound(round('r1', 'job-1', 1))
    await db.saveRound(round('r2', 'job-1', 2))
    await db.saveRound(round('r3', 'job-2', 1))

    expect((await db.listRoundsForJob('job-1')).map((r) => r.round).sort()).toEqual([1, 2])
    expect(await db.getAllRounds()).toHaveLength(3)
  })

  it('overwrites a round with the same id (edit in place)', async () => {
    await db.saveRound(round('r1', 'job-1', 1))
    await db.saveRound({ ...round('r1', 'job-1', 1), outcome: 'passed', notes: 'Went well' })

    const all = await db.listRoundsForJob('job-1')
    expect(all).toHaveLength(1)
    expect(all[0].outcome).toBe('passed')
    expect(all[0].notes).toBe('Went well')
  })

  it('deletes a single round', async () => {
    await db.saveRound(round('r1', 'job-1', 1))
    await db.deleteRound('r1')
    expect(await db.listRoundsForJob('job-1')).toEqual([])
  })

  it('cascades to rounds when the job card is deleted', async () => {
    await db.saveJobCard(card('job-1'))
    await db.saveJobCard(card('job-2'))
    await db.saveRound(round('r1', 'job-1', 1))
    await db.saveRound(round('r2', 'job-1', 2))
    await db.saveRound(round('keep', 'job-2', 1))

    await db.deleteJobCard('job-1')

    expect(await db.listRoundsForJob('job-1')).toEqual([])
    // The other card's round survives untouched.
    expect((await db.listRoundsForJob('job-2')).map((r) => r.id)).toEqual(['keep'])
  })
})
