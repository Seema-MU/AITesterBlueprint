import { openDB, type IDBPDatabase } from 'idb'
import type {
  JobCard,
  SettingsRow,
  MasterProfile,
  JobSpec,
  MatchAnalysis,
  Artifact,
  ResumeVersion,
  InterviewRound,
} from './schema'
import type { LLMSettings } from './schema'
import { PROFILE_ID } from './schema'

const DB_NAME = 'my-next-interview'
/**
 * Version history. Every step is guarded with `objectStoreNames.contains`, so an
 * upgrade always converges on the full set of stores no matter which version the
 * browser is actually on — and a version bump is a safe way to heal a database that
 * missed a store (see v5).
 *
 * v1 jobCards, settings · v2 masterProfile, jobSpecs, matchAnalyses, llmCache
 * · v3 artifacts · v4/v5 resumeVersions · v6 interviews
 */
export const DB_VERSION = 6

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * Single versioned database. Every new entity bumps DB_VERSION and extends
 * `upgrade` with the next step — never drop a store without migrating its data.
 */
export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // v1
        if (!db.objectStoreNames.contains('jobCards')) {
          const store = db.createObjectStore('jobCards', { keyPath: 'id' })
          store.createIndex('status', 'status')
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        // v2 — Phase 1 AI core
        if (!db.objectStoreNames.contains('masterProfile')) {
          db.createObjectStore('masterProfile', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('jobSpecs')) {
          const store = db.createObjectStore('jobSpecs', { keyPath: 'id' })
          store.createIndex('jobCardId', 'jobCardId')
        }
        if (!db.objectStoreNames.contains('matchAnalyses')) {
          const store = db.createObjectStore('matchAnalyses', { keyPath: 'id' })
          store.createIndex('jobCardId', 'jobCardId')
        }
        if (!db.objectStoreNames.contains('llmCache')) {
          db.createObjectStore('llmCache', { keyPath: 'key' })
        }
        // v3 — Phase 2 copilot artifacts
        if (!db.objectStoreNames.contains('artifacts')) {
          const store = db.createObjectStore('artifacts', { keyPath: 'id' })
          store.createIndex('jobCardId', 'jobCardId')
        }
        // v4 — Phase 3 resume library
        // (v5 re-runs this chain: an intermediate build bumped the version to 4 before
        // this store was added, so some browsers reached v4 without it. The guard makes
        // the same step create it on the next bump. No data was ever dropped.)
        if (!db.objectStoreNames.contains('resumeVersions')) {
          db.createObjectStore('resumeVersions', { keyPath: 'id' })
        }
        // v6 — Phase 4 interview rounds
        if (!db.objectStoreNames.contains('interviews')) {
          const store = db.createObjectStore('interviews', { keyPath: 'id' })
          store.createIndex('jobCardId', 'jobCardId')
        }
      },
      /**
       * A newer version of the app is trying to open the database while this
       * connection is still live (e.g. a second tab, or a module left over from a
       * hot reload after a DB_VERSION bump). An upgrade request stays blocked until
       * every older connection closes, which would hang the app on a promise that
       * never resolves — so release ours and let the newer version through.
       */
      blocking() {
        void dbPromise
          ?.then((database) => {
            database.close()
            dbPromise = null
          })
          .catch(() => {
            // Nothing useful to do if the connection was already gone.
          })
      },
      blocked() {
        console.warn(
          `[mynextinterview] The upgrade to database v${DB_VERSION} is waiting on another open tab of this app. ` +
            'Close the other tab (or reload this one) to continue.',
        )
      },
      terminated() {
        // The browser dropped the connection without us asking — reopen on next use.
        dbPromise = null
      },
    }).catch((error: unknown) => {
      // Never cache a rejected open: a retry should be able to try again.
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

// --- jobCards ---

export async function listJobCards(): Promise<JobCard[]> {
  const db = await getDb()
  return db.getAll('jobCards')
}

export async function saveJobCard(card: JobCard): Promise<void> {
  const db = await getDb()
  await db.put('jobCards', card)
}

export async function deleteJobCard(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    ['jobCards', 'jobSpecs', 'matchAnalyses', 'artifacts', 'interviews'],
    'readwrite',
  )
  await tx.objectStore('jobCards').delete(id)

  const specStore = tx.objectStore('jobSpecs')
  for (const spec of await specStore.index('jobCardId').getAll(id)) {
    await specStore.delete(spec.id)
  }

  const analysisStore = tx.objectStore('matchAnalyses')
  for (const analysis of await analysisStore.index('jobCardId').getAll(id)) {
    await analysisStore.delete(analysis.id)
  }

  const artifactStore = tx.objectStore('artifacts')
  for (const artifact of await artifactStore.index('jobCardId').getAll(id)) {
    await artifactStore.delete(artifact.id)
  }

  const roundStore = tx.objectStore('interviews')
  for (const round of await roundStore.index('jobCardId').getAll(id)) {
    await roundStore.delete(round.id)
  }
  await tx.done
}

// --- settings ---

export async function getSettings(): Promise<SettingsRow | undefined> {
  const db = await getDb()
  return db.get('settings', 'ui')
}

export async function saveSettings(row: SettingsRow): Promise<void> {
  const db = await getDb()
  await db.put('settings', row)
}

export async function getLlmSettings(): Promise<LLMSettings | undefined> {
  const db = await getDb()
  return db.get('settings', 'llm')
}

export async function saveLlmSettings(row: LLMSettings): Promise<void> {
  const db = await getDb()
  await db.put('settings', row)
}

// --- master profile (single row) ---

export async function getProfile(): Promise<MasterProfile | undefined> {
  const db = await getDb()
  return db.get('masterProfile', PROFILE_ID)
}

export async function saveProfile(profile: MasterProfile): Promise<void> {
  const db = await getDb()
  await db.put('masterProfile', profile)
}

// --- job specs (one per job card; re-extracting replaces) ---

export async function getSpecForJob(jobCardId: string): Promise<JobSpec | undefined> {
  const db = await getDb()
  const all = await db.getAllFromIndex('jobSpecs', 'jobCardId', jobCardId)
  return all[0]
}

export async function saveSpec(spec: JobSpec): Promise<void> {
  const db = await getDb()
  await db.put('jobSpecs', spec)
}

// --- match analyses ---

export async function listAnalysesForJob(jobCardId: string): Promise<MatchAnalysis[]> {
  const db = await getDb()
  return db.getAllFromIndex('matchAnalyses', 'jobCardId', jobCardId)
}

export async function getAllJobSpecs(): Promise<JobSpec[]> {
  const db = await getDb()
  return db.getAll('jobSpecs')
}

export async function getAllMatchAnalyses(): Promise<MatchAnalysis[]> {
  const db = await getDb()
  return db.getAll('matchAnalyses')
}

export async function saveAnalysis(analysis: MatchAnalysis): Promise<void> {
  const db = await getDb()
  await db.put('matchAnalyses', analysis)
}

// --- artifacts (Phase 2 copilot copy, many per job card) ---

export async function listArtifactsForJob(jobCardId: string): Promise<Artifact[]> {
  const db = await getDb()
  return db.getAllFromIndex('artifacts', 'jobCardId', jobCardId)
}

export async function getAllArtifacts(): Promise<Artifact[]> {
  const db = await getDb()
  return db.getAll('artifacts')
}

export async function saveArtifact(artifact: Artifact): Promise<void> {
  const db = await getDb()
  await db.put('artifacts', artifact)
}

export async function deleteArtifact(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('artifacts', id)
}

// --- resume versions (Phase 3; exactly one primary is enforced here, not in the UI) ---

export async function listResumeVersions(): Promise<ResumeVersion[]> {
  const db = await getDb()
  return db.getAll('resumeVersions')
}

export async function getResumeVersion(id: string): Promise<ResumeVersion | undefined> {
  const db = await getDb()
  return db.get('resumeVersions', id)
}

/**
 * Insert or update a version, keeping "exactly one primary" true:
 * the first version ever added becomes primary, and promoting one demotes the rest
 * in the same transaction.
 */
export async function saveResumeVersion(version: ResumeVersion): Promise<ResumeVersion> {
  const db = await getDb()
  const tx = db.transaction('resumeVersions', 'readwrite')
  const store = tx.objectStore('resumeVersions')
  const all = await store.getAll()
  const record: ResumeVersion = { ...version, isPrimary: all.length === 0 ? true : version.isPrimary }
  if (record.isPrimary) {
    for (const other of all) {
      if (other.id !== record.id && other.isPrimary) await store.put({ ...other, isPrimary: false })
    }
  }
  await store.put(record)
  await tx.done
  return record
}

export async function setPrimaryResumeVersion(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('resumeVersions', 'readwrite')
  const store = tx.objectStore('resumeVersions')
  for (const version of await store.getAll()) {
    await store.put({ ...version, isPrimary: version.id === id })
  }
  await tx.done
}

/**
 * Deletes a version, clears any job card pointing at it, and re-promotes a primary
 * if the deleted one held the flag — so one primary survives as long as any remain.
 */
export async function deleteResumeVersion(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['resumeVersions', 'jobCards'], 'readwrite')
  const versionStore = tx.objectStore('resumeVersions')
  await versionStore.delete(id)

  const cardStore = tx.objectStore('jobCards')
  for (const card of await cardStore.getAll()) {
    if (card.resumeVersionId === id) await cardStore.put({ ...card, resumeVersionId: undefined })
  }

  const remaining = await versionStore.getAll()
  if (remaining.length > 0 && !remaining.some((v) => v.isPrimary)) {
    const newest = [...remaining].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    await versionStore.put({ ...newest, isPrimary: true })
  }
  await tx.done
}

// --- interview rounds (Phase 4, many per job card) ---

export async function listRoundsForJob(jobCardId: string): Promise<InterviewRound[]> {
  const db = await getDb()
  return db.getAllFromIndex('interviews', 'jobCardId', jobCardId)
}

export async function getAllRounds(): Promise<InterviewRound[]> {
  const db = await getDb()
  return db.getAll('interviews')
}

export async function saveRound(round: InterviewRound): Promise<void> {
  const db = await getDb()
  await db.put('interviews', round)
}

export async function deleteRound(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('interviews', id)
}

// --- llm cache (transient; not exported) ---

export interface CacheEntry {
  key: string
  value: unknown // validated JSON payload as parsed
  createdAt: string
}

export async function cacheGet(key: string): Promise<CacheEntry | undefined> {
  const db = await getDb()
  return db.get('llmCache', key)
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('llmCache', { key, value, createdAt: new Date().toISOString() })
}

// --- bulk replace (JSON import) ---

export interface ImportPayload {
  jobCards: JobCard[]
  settings: SettingsRow
  llm: LLMSettings
  profile: MasterProfile
  jobSpecs: JobSpec[]
  matchAnalyses: MatchAnalysis[]
  artifacts: Artifact[]
  resumeVersions: ResumeVersion[]
  interviews: InterviewRound[]
}

export async function replaceAllData(payload: ImportPayload): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    [
      'jobCards',
      'settings',
      'masterProfile',
      'jobSpecs',
      'matchAnalyses',
      'artifacts',
      'resumeVersions',
      'interviews',
    ],
    'readwrite',
  )
  await tx.objectStore('jobCards').clear()
  for (const card of payload.jobCards) await tx.objectStore('jobCards').add(card)

  await tx.objectStore('settings').clear()
  await tx.objectStore('settings').add(payload.settings)
  await tx.objectStore('settings').add(payload.llm)

  await tx.objectStore('masterProfile').clear()
  await tx.objectStore('masterProfile').add(payload.profile)

  await tx.objectStore('jobSpecs').clear()
  for (const spec of payload.jobSpecs) await tx.objectStore('jobSpecs').add(spec)

  await tx.objectStore('matchAnalyses').clear()
  for (const analysis of payload.matchAnalyses) await tx.objectStore('matchAnalyses').add(analysis)

  await tx.objectStore('artifacts').clear()
  for (const artifact of payload.artifacts) await tx.objectStore('artifacts').add(artifact)

  await tx.objectStore('resumeVersions').clear()
  for (const version of payload.resumeVersions) await tx.objectStore('resumeVersions').add(version)

  await tx.objectStore('interviews').clear()
  for (const round of payload.interviews) await tx.objectStore('interviews').add(round)

  await tx.done
}
