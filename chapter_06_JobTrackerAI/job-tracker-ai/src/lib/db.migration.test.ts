import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import * as db from './db'

const DB_NAME = 'my-next-interview'

/**
 * Opens a database at the given version with the stores that existed *at that version*,
 * so we exercise a real upgrade path rather than a fresh v4 create.
 */
async function seedLegacyV3() {
  await deleteDB(DB_NAME)
  const legacy = await openDB(DB_NAME, 3, {
    upgrade(database) {
      const cards = database.createObjectStore('jobCards', { keyPath: 'id' })
      cards.createIndex('status', 'status')
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('masterProfile', { keyPath: 'id' })
      database.createObjectStore('jobSpecs', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      database
        .createObjectStore('matchAnalyses', { keyPath: 'id' })
        .createIndex('jobCardId', 'jobCardId')
      database.createObjectStore('llmCache', { keyPath: 'key' })
      database.createObjectStore('artifacts', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
    },
  })
  await legacy.put('jobCards', {
    id: 'keep',
    company: 'CGI',
    role: 'Senior QA Automation Engineer',
    dateApplied: '2026-09-01',
    status: 'applied',
    history: [],
  })
  await legacy.put('artifacts', {
    id: 'art-keep',
    jobCardId: 'keep',
    kind: 'coverLetter',
    content: 'Dear Hiring Manager,',
    edited: false,
    modelUsed: 'test-model',
    promptVersion: 'cover-letter-v2',
    createdAt: '2026-09-10T00:00:00.000Z',
  })
  await legacy.put('settings', { key: 'ui', theme: 'dark' })
  legacy.close()
}

/**
 * Reproduces a real field failure: an intermediate build bumped the DB to version 4
 * before the `resumeVersions` store was added, so the browser reached v4 without it.
 * Re-opening at v4 is a no-op, leaving every resume query broken forever.
 */
async function seedBrokenV4() {
  await deleteDB(DB_NAME)
  const legacy = await openDB(DB_NAME, 4, {
    upgrade(database) {
      const cards = database.createObjectStore('jobCards', { keyPath: 'id' })
      cards.createIndex('status', 'status')
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('masterProfile', { keyPath: 'id' })
      database.createObjectStore('jobSpecs', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      database
        .createObjectStore('matchAnalyses', { keyPath: 'id' })
        .createIndex('jobCardId', 'jobCardId')
      database.createObjectStore('llmCache', { keyPath: 'key' })
      database.createObjectStore('artifacts', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      // deliberately no resumeVersions
    },
  })
  await legacy.put('jobCards', {
    id: 'survivor',
    company: 'HighLevel',
    role: 'Lead SDET',
    dateApplied: '2026-09-02',
    status: 'followup',
    history: [],
  })
  legacy.close()
}

/**
 * The store set as it stood at v5 (Phase 3: resume library, no interviews) — the real
 * starting point for the Phase 4 upgrade, carrying data that must survive it.
 */
async function seedLegacyV5() {
  await deleteDB(DB_NAME)
  const legacy = await openDB(DB_NAME, 5, {
    upgrade(database) {
      const cards = database.createObjectStore('jobCards', { keyPath: 'id' })
      cards.createIndex('status', 'status')
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('masterProfile', { keyPath: 'id' })
      database.createObjectStore('jobSpecs', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      database
        .createObjectStore('matchAnalyses', { keyPath: 'id' })
        .createIndex('jobCardId', 'jobCardId')
      database.createObjectStore('llmCache', { keyPath: 'key' })
      database.createObjectStore('artifacts', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      database.createObjectStore('resumeVersions', { keyPath: 'id' })
      // deliberately no interviews
    },
  })
  await legacy.put('jobCards', {
    id: 'v5-card',
    company: 'CGI',
    role: 'Senior QA Automation Engineer',
    dateApplied: '2026-09-05',
    status: 'interview',
    history: [],
  })
  await legacy.put('artifacts', {
    id: 'v5-prep',
    jobCardId: 'v5-card',
    kind: 'prep',
    content: '## Playwright\n- Q1',
    edited: false,
    modelUsed: 'test-model',
    promptVersion: 'prep-v1',
    createdAt: '2026-09-12T00:00:00.000Z',
    practised: [],
  })
  await legacy.put('settings', { key: 'ui', theme: 'dark' })
  legacy.close()
}

/**
 * A v5 database missing two stores at once. This is the property that makes the
 * guarded chain safe: a bump re-runs *every* step, so it converges on the full store
 * set rather than only adding the newest one.
 */
async function seedBrokenV5() {
  await deleteDB(DB_NAME)
  const legacy = await openDB(DB_NAME, 5, {
    upgrade(database) {
      const cards = database.createObjectStore('jobCards', { keyPath: 'id' })
      cards.createIndex('status', 'status')
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('masterProfile', { keyPath: 'id' })
      database.createObjectStore('jobSpecs', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      database
        .createObjectStore('matchAnalyses', { keyPath: 'id' })
        .createIndex('jobCardId', 'jobCardId')
      database.createObjectStore('llmCache', { keyPath: 'key' })
      database.createObjectStore('artifacts', { keyPath: 'id' }).createIndex('jobCardId', 'jobCardId')
      // deliberately no resumeVersions and no interviews
    },
  })
  await legacy.put('jobCards', {
    id: 'broken-survivor',
    company: 'HighLevel',
    role: 'Lead SDET',
    dateApplied: '2026-09-06',
    status: 'interview',
    history: [],
  })
  legacy.close()
}

describe('v3 → v6 migration', () => {
  it('adds resumeVersions and interviews without touching existing data', async () => {
    await seedLegacyV3()

    // Opening through db.ts triggers the upgrade() migration chain.
    expect(db.DB_VERSION).toBe(6)
    const cards = await db.listJobCards()
    expect(cards.map((c) => c.id)).toEqual(['keep'])

    const raw = await db.getDb()
    expect(raw.objectStoreNames.contains('resumeVersions')).toBe(true)
    expect(raw.objectStoreNames.contains('interviews')).toBe(true)
    expect(raw.version).toBe(6)

    // Pre-existing stores and rows survive the bump.
    expect(await db.getAllArtifacts()).toHaveLength(1)
    expect(await db.getSettings()).toEqual({ key: 'ui', theme: 'dark' })
    expect(await db.listResumeVersions()).toEqual([])
    expect(await db.getAllRounds()).toEqual([])
  })

  it('heals a v4 database that is missing the resumeVersions store', async () => {
    await seedBrokenV4()

    // Before the fix this threw "One of the specified object stores was not found".
    await expect(db.listResumeVersions()).resolves.toEqual([])
    const raw = await db.getDb()
    expect(raw.objectStoreNames.contains('resumeVersions')).toBe(true)
    // And the user's existing cards are intact.
    expect((await db.listJobCards()).map((c) => c.id)).toEqual(['survivor'])
  })

  it('adds the interviews store to a v5 database, keeping existing artifacts', async () => {
    await seedLegacyV5()

    // Round queries work immediately after the upgrade.
    await expect(db.getAllRounds()).resolves.toEqual([])
    const raw = await db.getDb()
    expect(raw.objectStoreNames.contains('interviews')).toBe(true)
    expect(raw.version).toBe(6)

    // The prep artifact and card written before the upgrade are untouched.
    expect((await db.getAllArtifacts()).map((a) => a.id)).toEqual(['v5-prep'])
    expect((await db.listJobCards()).map((c) => c.id)).toEqual(['v5-card'])
    expect(await db.getSettings()).toEqual({ key: 'ui', theme: 'dark' })
  })

  it('repairs a v5 database missing two stores, converging on the full set', async () => {
    /*
     * A bump re-runs every guarded step, so the chain converges on the whole store
     * set instead of only adding the newest one. Note the limit this also documents:
     * re-opening at the *same* version is a no-op, which is precisely why the v4
     * incident needed a version bump to heal.
     */
    await seedBrokenV5()

    await expect(db.listResumeVersions()).resolves.toEqual([])
    await expect(db.getAllRounds()).resolves.toEqual([])
    const raw = await db.getDb()
    expect(raw.objectStoreNames.contains('resumeVersions')).toBe(true)
    expect(raw.objectStoreNames.contains('interviews')).toBe(true)
    expect((await db.listJobCards()).map((c) => c.id)).toEqual(['broken-survivor'])
  })

  it('runs the whole app bootstrap path without throwing', async () => {
    // Seed our own state so this test does not depend on what earlier tests left behind.
    await db.saveSettings({ key: 'ui', theme: 'dark' })
    await db.saveJobCard({
      id: 'bootstrap-card',
      company: 'CGI',
      role: 'Senior QA Automation Engineer',
      dateApplied: '2026-09-01',
      status: 'applied',
      history: [],
    })

    // Mirrors App's bootstrap: purge, then the four parallel reads.
    const { purgeStaleFollowUps } = await import('./artifacts')
    await expect(purgeStaleFollowUps()).resolves.toBe(0)
    const [cards, settings, versions, rounds] = await Promise.all([
      db.listJobCards(),
      db.getSettings(),
      db.listResumeVersions(),
      db.getAllRounds(),
    ])
    expect(cards.map((c) => c.id)).toContain('bootstrap-card')
    expect(settings?.theme).toBe('dark')
    expect(versions).toEqual([])
    expect(rounds).toEqual([])
  })
})
