/*
The Linear view of a page's tasks: the same order the list draws, as one
path. A 2px thread runs down a left gutter through every node's centre; the
stretch from the start to the current step (the first unfinished task) is the
accent, the rest the quiet neutral. Done nodes are filled accent discs with a
check, the current one an accent ring with a flat halo, later ones a hollow
neutral ring, abandoned ones a muted dot beside a struck title. A Section is a
milestone on the same thread: a diamond, its name in the section heading
style, and how many of its tasks are done.

Order is the list's: tasks under no section, then each section with its own
tasks, each group in `page.items` order (`threadRows`).

The thread is drawn per row as two halves (above and below the node), each
row knowing where its node's centre sits, so it reads as one line. Nothing
moves on its own: the halo deepens on hover or focus, and a node that turns
done draws its check in 150ms.

The page head already says "3 of 7 done", so there is no overall bar here:
the accent thread is the progress.
*/
import { useMemo, useState } from 'react'
import { cn } from '../components/ui/utils.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { Face } from '../components/person-face.js'
import styles from './LinearView.module.css'
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

/** Done and total (abandoned left out) for each section, from the rows it heads. */
function sectionProgress(rows: readonly ThreadRow[]): Map<string, { done: number; total: number }> {
  const out = new Map<string, { done: number; total: number }>()
  let current: { done: number; total: number } | null = null
  for (const row of rows) {
    if (row.kind === 'section') {
      current = { done: 0, total: 0 }
      out.set(row.id, current)
    } else if (current !== null && row.task.status !== 'abandoned') {
      current.total += 1
      if (row.task.status === 'completed') current.done += 1
    }
  }
  return out
}

/*
Geometry. A task row is 40px with its node centred (20px down). A section row
is 56px: 16px of air, then a 40px line, so its node sits 36px down and a
milestone opens a new stretch; the first row of the list skips the air. The
thread's two halves meet at those centres.
*/
const THREAD = 'pointer-events-none absolute left-3 w-0.5 -translate-x-1/2'
const MOTION = 'duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
const REACHED = 'bg-primary'
const AHEAD = 'bg-quiet-foreground/40'

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
  const progress = useMemo(() => sectionProgress(rows), [rows])
  /* Tasks already done when the view opened keep a still check; only one
     that turns done here draws it, so the motion answers the click. */
  const [doneAtOpen] = useState(
    () => new Set([...tasks, ...completed].filter((t) => t.status === 'completed').map((t) => t.id)),
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
  const rowContext: RowContext = { ...context, today }

  return (
    <ol role="list" aria-label="Tasks" className="flex flex-col pb-2">
      {rows.map((row, index) => {
        /* A section opening the list has no air above it. */
        const tall = row.kind === 'section' && index > 0
        const line = (
          <>
            {index > 0 && (
              <span
                aria-hidden
                className={cn(THREAD, 'top-0', tall ? 'h-9' : 'h-5', index <= reached ? REACHED : AHEAD)}
              />
            )}
            {index < rows.length - 1 && (
              <span
                aria-hidden
                className={cn(THREAD, 'bottom-0', tall ? 'top-9' : 'top-5', index < reached ? REACHED : AHEAD)}
              />
            )}
          </>
        )

        if (row.kind === 'section') {
          const counts = progress.get(row.id)
          const complete = counts !== undefined && counts.total > 0 && counts.done === counts.total
          return (
            <li key={`s:${row.id}`} role="listitem" className={cn('relative', tall && 'pt-4')}>
              {line}
              <div className="flex h-10 items-center gap-2">
                <span className="relative flex w-6 shrink-0 justify-center" aria-hidden>
                  <span
                    className={cn(
                      'size-3 rotate-45 rounded-xs border-2 transition-colors',
                      MOTION,
                      complete
                        ? 'border-primary bg-primary'
                        : index <= reached
                          ? 'border-primary bg-background'
                          : 'border-quiet-foreground bg-background',
                    )}
                  />
                </span>
                <h3 className="min-w-0 truncate text-base leading-6 font-semibold text-foreground">
                  {row.name}
                </h3>
                {counts !== undefined && counts.total > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {counts.done} of {counts.total}
                  </span>
                )}
              </div>
            </li>
          )
        }

        const task = row.task
        const done = task.status === 'completed'
        const abandoned = task.status === 'abandoned'
        const current = index === currentIndex
        const upcoming = !done && !abandoned && !current
        const display = taskRowDisplay(task, rowContext)
        const reopen = done || abandoned

        return (
          <li
            key={`t:${row.id}`}
            role="listitem"
            aria-current={current ? 'step' : undefined}
            className={cn(
              'group/step relative flex h-10 items-center gap-2 rounded-sm pr-2 transition-colors hover:bg-muted',
              MOTION,
            )}
          >
            {line}
            <button
              type="button"
              aria-label={`${reopen ? 'Reopen' : 'Complete'} ${task.title}`}
              onClick={() => (abandoned ? actions.onRestore(task) : actions.onToggleComplete(task))}
              className="group/node relative flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className={cn(
                  'flex items-center justify-center rounded-full transition-[background-color,border-color,box-shadow]',
                  MOTION,
                  done && 'size-4 bg-primary',
                  current &&
                    'size-4 border-2 border-primary bg-background ring-4 ring-primary/15 group-hover/step:ring-primary/30 group-has-focus-visible/step:ring-primary/30',
                  upcoming && 'size-3 border-2 border-quiet-foreground bg-background group-hover/node:border-primary',
                  abandoned && 'size-2.5 bg-quiet-foreground/60',
                )}
              >
                {done && (
                  <svg viewBox="0 0 12 12" className="size-2.5 text-primary-foreground">
                    <path d="M2.5 6.2 5 8.6 9.6 3.6" pathLength={1} className={cn(styles.check, !doneAtOpen.has(task.id) && styles.drawn)} />
                  </svg>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => actions.onOpenTask(task)}
              className={cn(
                'min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                current && 'font-medium text-foreground',
                done && 'text-muted-foreground',
                abandoned && 'text-muted-foreground line-through',
                upcoming && 'text-foreground',
              )}
            >
              {task.title}
            </button>
            {display.due !== undefined && (
              /* Muted even when late: the thread is a calm path, and the
                 list is where lateness is flagged. */
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {display.due.label}
              </span>
            )}
            {display.assignee !== undefined && (
              <span className="flex shrink-0 items-center" title={display.assignee.name}>
                <Face person={display.assignee} className="size-5 data-[size=sm]:size-5" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
