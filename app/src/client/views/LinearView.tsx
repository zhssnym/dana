/*
The Linear view of a page's tasks: the same order the list draws, as one
thread. A 1px line runs down a left gutter; each task is a node on it, done
nodes filled with the accent, the first unfinished one ringed as "current",
later ones a muted outline. A Section is a milestone on the same line.

Order is the list's: tasks under no section, then each section with its own
tasks, each group in `page.items` order (`threadRows`).

The line is drawn per row as two halves (above and below the node), so it
reads as continuous and the part leading to the current node can carry the
accent at a low alpha. Nothing moves on its own; hover is a plain bg-muted.
*/
import { useMemo } from 'react'
import { cn } from '../components/ui/utils.js'
import { dueDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

type ThreadRow =
  | { readonly kind: 'section'; readonly id: string; readonly name: string }
  | { readonly kind: 'task'; readonly id: string; readonly task: TaskCard }

/**
 * The page's rows in the order the list draws them: the tasks under no
 * section first, then each section as a milestone followed by its own tasks.
 * Within a group, tasks keep `page.items` order; a task the page has not
 * placed yet follows, in the order it was given.
 */
function threadRows(
  page: PageView,
  tasks: readonly TaskCard[],
  completed: readonly TaskCard[],
  showCompleted: boolean,
): ThreadRow[] {
  const visible = showCompleted ? [...tasks, ...completed] : [...tasks]
  const rank = new Map<string, number>()
  for (const item of page.items) if (!rank.has(item.id)) rank.set(item.id, rank.size)
  const ordered = visible
    .map((task, index) => ({ task, index, placed: rank.get(task.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.placed - b.placed || a.index - b.index)
    .map((entry) => entry.task)

  const sections = page.blocks
    .filter((block) => block.kind === 'section' && block.section_block_id === null)
    .map((block, index) => ({ block, index, placed: rank.get(block.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.placed - b.placed || a.index - b.index)
    .map((entry) => entry.block)
  const known = new Set(sections.map((block) => block.id))
  const placement = new Map((page.task_placements ?? []).map((row) => [row.id, row.section_block_id]))
  const sectionOf = (task: TaskCard): string | null => {
    const id = placement.get(task.id) ?? task.section_block_id ?? null
    return id !== null && known.has(id) ? id : null
  }

  const seen = new Set<string>()
  const rows: ThreadRow[] = []
  const pushTasks = (section: string | null): void => {
    for (const task of ordered) {
      if (seen.has(task.id) || sectionOf(task) !== section) continue
      seen.add(task.id)
      rows.push({ kind: 'task', id: task.id, task })
    }
  }
  pushTasks(null)
  for (const block of sections) {
    rows.push({ kind: 'section', id: block.id, name: block.text?.trim() || 'Untitled' })
    pushTasks(block.id)
  }
  return rows
}

export function LinearView(props: {
  readonly page: PageView
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const { page, tasks, completed, showCompleted, today, context, actions } = props

  const rows = useMemo(
    () => threadRows(page, tasks, completed, showCompleted),
    [page, tasks, completed, showCompleted],
  )

  if (!rows.some((row) => row.kind === 'task')) {
    return <p className="py-2 text-sm text-muted-foreground">No tasks yet.</p>
  }

  const currentIndex = rows.findIndex(
    (row) => row.kind === 'task' && row.task.status === 'pending',
  )
  /* Where the path has reached: the current node, or past the end when every
     task is finished. */
  const reached = currentIndex === -1 ? rows.length : currentIndex
  const clock = context.clock ?? '12'
  const showDue = context.showDue ?? true

  return (
    <ol role="list" aria-label="Tasks" className="flex flex-col py-1">
      {rows.map((row, index) => {
        const first = index === 0
        const last = index === rows.length - 1
        const line = (
          <>
            {!first && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute top-0 bottom-1/2 left-3 w-px -translate-x-1/2',
                  index <= reached ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute top-1/2 bottom-0 left-3 w-px -translate-x-1/2',
                  index < reached ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
          </>
        )

        if (row.kind === 'section') {
          return (
            <li key={`s:${row.id}`} role="listitem" className="relative flex h-9 items-center">
              {line}
              <span className="relative flex w-6 shrink-0 justify-center" aria-hidden>
                <span className="size-2 rotate-45 border border-muted-foreground bg-background" />
              </span>
              <span className="ml-2 min-w-0 truncate text-xs font-medium text-section-foreground">
                {row.name}
              </span>
            </li>
          )
        }

        const task = row.task
        const done = task.status === 'completed'
        const abandoned = task.status === 'abandoned'
        const current = index === currentIndex
        const due = showDue ? dueDisplay(task, today, clock) : undefined
        const reopen = done || abandoned

        return (
          <li
            key={`t:${row.id}`}
            role="listitem"
            aria-current={current ? 'step' : undefined}
            className="relative flex h-9 items-center rounded-sm pr-2 hover:bg-muted"
          >
            {line}
            <button
              type="button"
              aria-label={`${reopen ? 'Reopen' : 'Complete'} ${task.title}`}
              onClick={() => (abandoned ? actions.onRestore(task) : actions.onToggleComplete(task))}
              className="relative flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className={cn(
                  'rounded-full border bg-background transition-colors',
                  done && 'size-2.5 border-primary bg-primary',
                  abandoned && 'size-2.5 border-quiet-foreground bg-muted',
                  current && 'size-3.5 border-2 border-primary',
                  !done && !abandoned && !current && 'size-2.5 border-quiet-foreground',
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => actions.onOpenTask(task)}
              className={cn(
                'ml-2 min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                current && 'font-medium text-foreground',
                done && 'text-muted-foreground',
                abandoned && 'text-muted-foreground line-through',
                !done && !abandoned && !current && 'text-foreground',
              )}
            >
              {task.title}
            </button>
            {due !== undefined && (
              /* Muted even when late: the thread is a calm path, and the
                 list is where lateness is flagged. */
              <span className="ml-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                {due.label}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
