import { useCallback, useEffect, useState } from 'react'
import type { MasterProfile } from '../lib/schema'
import { EMPTY_PROFILE, PROFILE_ID } from '../lib/schema'
import * as db from '../lib/db'

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400'

export default function ProfileView() {
  const [profile, setProfile] = useState<MasterProfile>(EMPTY_PROFILE)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void db.getProfile().then((p) => {
      if (!alive) return
      setProfile(p ?? EMPTY_PROFILE)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async () => {
    setStatus(null)
    await db.saveProfile({
      ...profile,
      id: PROFILE_ID,
      updatedAt: new Date().toISOString(),
    })
    setStatus('Profile saved.')
    window.setTimeout(() => setStatus(null), 3000)
  }, [profile])

  const words = profile.resumeText.trim() ? profile.resumeText.trim().split(/\s+/).length : 0

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Master profile</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Your single source of truth for matching. Paste the full text of the resume you apply with —
        skills are matched against this text, so keep it current.
      </p>

      {!loaded ? (
        <p className="mt-6 text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="p-name">
                Name
              </label>
              <input
                id="p-name"
                className={inputClass}
                value={profile.name ?? ''}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Seema M U"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="p-headline">
                Headline
              </label>
              <input
                id="p-headline"
                className={inputClass}
                value={profile.headline ?? ''}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                placeholder="Senior QA Automation Engineer"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="p-resume">
              Resume text
            </label>
            <textarea
              id="p-resume"
              className={`${inputClass} min-h-96 resize-y font-mono text-xs leading-relaxed`}
              value={profile.resumeText}
              onChange={(e) => setProfile({ ...profile, resumeText: e.target.value })}
              placeholder="Paste your full resume text here (plain text, from your PDF/DOCX)…"
            />
            <p className="mt-1 text-[11px] text-zinc-400">{words.toLocaleString()} words</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Save profile
            </button>
            {status ? <span className="text-sm text-emerald-600 dark:text-emerald-400">{status}</span> : null}
          </div>
        </div>
      )}
    </div>
  )
}
