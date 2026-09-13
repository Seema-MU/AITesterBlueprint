import type { Theme } from '../lib/schema'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onExport: () => void
  onImportFile: (file: File) => void
  onAdd: () => void
}

export default function Header({ theme, onToggleTheme, onExport, onImportFile, onAdd }: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" aria-hidden="true">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 4v5" />
          </svg>
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            MyNextInterview
          </h1>
          <p className="text-[11px] text-zinc-400">Your job pipeline, one move ahead</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span
          className="hidden items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 sm:flex dark:border-zinc-800 dark:text-zinc-400"
          title="All data is stored in this browser only. Clearing site data erases everything — export a backup first."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Storage: Local browser only
        </span>

        <button
          type="button"
          onClick={onAdd}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add job
        </button>

        <button
          type="button"
          onClick={onExport}
          title="Export all data as JSON"
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Export
        </button>

        <label
          title="Import data from a JSON backup"
          className="cursor-pointer rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Import
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImportFile(file)
              e.target.value = ''
            }}
          />
        </label>

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          {theme === 'dark' ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
