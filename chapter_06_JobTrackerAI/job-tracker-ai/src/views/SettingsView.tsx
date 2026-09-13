import { useCallback, useEffect, useState } from 'react'
import type { LLMSettings } from '../lib/schema'
import { DEFAULT_LLM } from '../lib/schema'
import * as db from '../lib/db'
import { listModels, LlmError } from '../lib/llm'

const ENV_GROQ_KEY: string = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? ''

// Local to this view; nothing else imports it, and exporting a non-component from a
// component file breaks fast refresh.
const PRESETS = {
  local: {
    label: 'Local (LM Studio)',
    baseUrl: 'http://localhost:1234/v1',
    modelHint: 'e.g. google/gemma-3-1b (must match a model loaded in LM Studio)',
  },
  groq: {
    label: 'Groq (cloud)',
    baseUrl: 'https://api.groq.com/openai/v1',
    // Llama 3.1 8B and 3.3 70B were retired from Groq's free and Developer tiers on
    // 16 August 2026, so the old hint here sent people to a model that no longer exists.
    modelHint: 'e.g. openai/gpt-oss-120b — pick from the loaded list after connecting',
  },
} as const
type PresetId = keyof typeof PRESETS

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-700'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400'

export default function SettingsView() {
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_LLM)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [models, setModels] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void db.getLlmSettings().then((s) => {
      if (!alive) return
      setSettings(s ?? DEFAULT_LLM)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async () => {
    setError(null)
    await db.saveLlmSettings({
      ...settings,
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim(),
    })
    setStatus('Settings saved.')
    window.setTimeout(() => setStatus(null), 3000)
  }, [settings])

  const testConnection = useCallback(async () => {
    setError(null)
    setStatus(null)
    setModels(null)
    setTesting(true)
    try {
      const found = await listModels(settings)
      setModels(found)
      if (found.length === 0) {
        setStatus('Connected, but the server reports no loaded models.')
      } else if (settings.model && !found.includes(settings.model)) {
        setError(
          `Connected. Loaded models: ${found.join(', ')} — your configured model "${settings.model}" is not among them.`,
        )
      } else {
        setStatus(`Connected. Loaded models: ${found.join(', ')}`)
      }
    } catch (err) {
      setError(err instanceof LlmError ? err.message : 'Connection test failed.')
    } finally {
      setTesting(false)
    }
  }, [settings])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">AI settings</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Bring your own model. The default points at a local OpenAI-compatible server (LM Studio on
        <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">localhost:1234</code>)
        — zero cost. Any OpenAI-compatible endpoint works here.
      </p>

      {!loaded ? (
        <p className="mt-6 text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Provider preset
            </span>
            <div className="flex gap-2">
              {(
                [
                  ['local', PRESETS.local],
                  ['groq', PRESETS.groq],
                ] as [PresetId, (typeof PRESETS)[PresetId]][]
              ).map(([id, preset]) => {
                const active = settings.baseUrl.trim() === preset.baseUrl
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        baseUrl: preset.baseUrl,
                        apiKey: s.apiKey || (id === 'groq' ? ENV_GROQ_KEY : ''),
                      }))
                    }
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            {ENV_GROQ_KEY ? (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                GROQ_API_KEY found in the environment — click the Groq preset to use it.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-400">
                No GROQ_API_KEY in the environment — paste your Groq key manually below.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="s-baseurl">
              Base URL
            </label>
            <input
              id="s-baseurl"
              className={inputClass}
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="s-model">
              Model
            </label>
            <input
              id="s-model"
              className={inputClass}
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder={
                settings.baseUrl.includes('groq.com') ? PRESETS.groq.modelHint : PRESETS.local.modelHint
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="s-key">
              API key
            </label>
            <input
              id="s-key"
              type="password"
              className={inputClass}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder={
                settings.baseUrl.includes('groq.com') ? 'gsk_… (Groq API key)' : 'Optional — LM Studio does not need one'
              }
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Save settings
            </button>
            <button
              type="button"
              onClick={testConnection}
              disabled={testing}
              className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {status ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{status}</span>
            ) : null}
          </div>

          {models && models.length > 0 ? (
            <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Models available:</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {models.map((m) => (
                  <li
                    key={m}
                    className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {error}
            </p>
          ) : null}

          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <strong>Privacy note:</strong> your key is stored in this browser (IndexedDB) and sent
            directly to the endpoint you configure. Anyone with access to this device or its
            devtools can read it — use a key you are comfortable exposing, or stick with a local
            server that needs none.
          </p>
        </div>
      )}
    </div>
  )
}
