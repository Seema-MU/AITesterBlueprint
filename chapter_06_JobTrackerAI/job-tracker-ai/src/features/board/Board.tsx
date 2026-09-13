import { DndContext, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { InterviewRound, JobCard, Status } from '../../lib/schema'
import { STATUSES, COLUMN_LABELS, STATUS_HEX } from '../../lib/schema'
import Card from './Card'

export type SortDir = 'asc' | 'desc'

interface BoardProps {
  cards: JobCard[]
  search: string
  sortDirs: Record<Status, SortDir>
  /** Resume version id → label, shown on each card. */
  resumeLabels: Record<string, string>
  /** Interview rounds per job card id, shown as a badge on the card face. */
  roundsByCard: Record<string, InterviewRound[]>
  onToggleSort: (status: Status) => void
  onAdd: (status: Status) => void
  onEdit: (card: JobCard) => void
  onDelete: (card: JobCard) => void
  onAnalyse: (card: JobCard) => void
  onDrafts: (card: JobCard) => void
  onRounds: (card: JobCard) => void
  onPrep: (card: JobCard) => void
  onMove: (id: string, from: Status, to: Status) => void
}

interface ColumnProps {
  status: Status
  count: number
  sortDir: SortDir
  children: ReactNode
  onToggleSort: () => void
  onAdd: () => void
}

function Column({ status, count, sortDir, children, onToggleSort, onAdd }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-zinc-50/60 transition-colors dark:bg-zinc-900/40 ${
        isOver
          ? 'border-zinc-400 dark:border-zinc-500'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_HEX[status] }}
          aria-hidden="true"
        />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          {COLUMN_LABELS[status]}
        </h2>
        <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {count}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleSort}
            title={`Sort by date (${sortDir === 'desc' ? 'newest first' : 'oldest first'})`}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {sortDir === 'desc' ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m18 15-6 6-6-6" />
                <path d="M12 3v18" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 9 6-6 6 6" />
                <path d="M12 21V3" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onAdd}
            title={`Add job to ${COLUMN_LABELS[status]}`}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  )
}

function sortCards(cards: JobCard[], dir: SortDir): JobCard[] {
  return [...cards].sort((a, b) => {
    const cmp = a.dateApplied.localeCompare(b.dateApplied)
    return dir === 'desc' ? -cmp : cmp
  })
}

export default function Board({
  cards,
  search,
  sortDirs,
  resumeLabels,
  roundsByCard,
  onToggleSort,
  onAdd,
  onEdit,
  onDelete,
  onAnalyse,
  onDrafts,
  onRounds,
  onPrep,
  onMove,
}: BoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const query = search.trim().toLowerCase()
  const visible = query
    ? cards.filter(
        (c) =>
          c.company.toLowerCase().includes(query) || c.role.toLowerCase().includes(query),
      )
    : cards

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const from = active.data.current?.status as Status | undefined
    const to = over.id as Status
    if (!from || from === to) return
    onMove(active.id as string, from, to)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Six equal tracks, always — column width never depends on card content.
          `minmax(14rem, 1fr)` keeps them usable and scrolls the board horizontally
          on narrow screens instead of squeezing columns. */}
      <div className="grid h-full min-h-0 grid-cols-[repeat(6,minmax(14rem,1fr))] gap-3">
        {STATUSES.map((status) => {
          const columnCards = sortCards(
            visible.filter((c) => c.status === status),
            sortDirs[status],
          )
          return (
            <Column
              key={status}
              status={status}
              count={cards.filter((c) => c.status === status).length}
              sortDir={sortDirs[status]}
              onToggleSort={() => onToggleSort(status)}
              onAdd={() => onAdd(status)}
            >
              {columnCards.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                  {query ? 'No matches' : 'No jobs here yet'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {columnCards.map((card) => (
                    <li key={card.id}>
                      <Card
                        card={card}
                        resumeLabels={resumeLabels}
                        rounds={roundsByCard[card.id] ?? []}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onAnalyse={onAnalyse}
                        onDrafts={onDrafts}
                        onRounds={onRounds}
                        onPrep={onPrep}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Column>
          )
        })}
      </div>
    </DndContext>
  )
}
