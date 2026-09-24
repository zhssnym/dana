/*
The Linear view: a page's tasks as the story of the work, read top to bottom
like a GitHub issue's timeline.

- **Past** - finished steps in the order they were finished, quiet. The last
  three show; "Show n earlier" opens the rest. Clicking one opens it, with the
  notes and images kept on it. "Show completed" off hides the past.
- **Present** - every step in progress (started: a start date today or
  earlier), several at once. This is where work happens: tick its subtasks,
  add one, press the node when it is done. Overdue first, then by start.
- **Future** - the queue, grouped by section as milestones. The first
  milestone with work in it is open, the rest are one line with their count.
  "Start" moves a step into the present; "New step" adds to a milestone.

The line carries progress: solid accent wherever the work has reached (past
and present), a faint dotted line through what has not started. Clicking a
title opens the task; renaming happens there. The stage rule and the order in
each part are shared with the Board (`linear/stage.ts`). A step's actions
(Add subtask, Not now, Start) are drawn only on hover or focus, so they never
take the title's width; the next step's Start is always there.
*/
import { useMemo, useState } from 'react'
import { useCreateTask, useUpdateTask } from '../api/mutations.js'
import { useFolderCompletedTasks, mergeCompletedDays } from '../api/queries.js'
import { cn } from '../components/ui/utils.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { RowMeta } from '../components/task-meta.js'
import { formatDay, formatDayInline } from '../lib/dates.js'
import { NewStep } from './linear/NewStep.js'
import { Subtasks } from './linear/Subtasks.js'
import { futureMilestones, pageRank, pastOrder, presentOrder, startDay } from './linear/stage.js'
import type { Milestone } from './linear/stage.js'
import styles from './LinearView.module.css'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

const MOTION = 'duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
const PAST_TAIL = 3
const QUIET_ACTION =
  'h-6 shrink-0 rounded-sm px-1.5 text-xs text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground'
/* Drawn only while the step is pointed at or worked in, so a hidden action
   never takes width from the title; never drawn in the row on touch, where
   the node completes a step and the task itself does the rest. */
const ON_HOVER =
  'hidden group-hover/step:inline-flex group-focus-within/step:inline-flex [@media(hover:none)]:!hidden'

/** Whether the work has reached a stretch of the line. */
type Reach = 'reached' | 'ahead'

function Line(props: { readonly above: Reach | null; readonly below: Reach | null }): React.JSX.Element {
  const part = (reach: Reach | null, place: string): React.JSX.Element | null =>
    reach === null ? null : (
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-3 w-0.5 -translate-x-1/2',
          place,
          reach === 'reached' ? 'bg-primary' : styles.loose,
        )}
      />
    )
  return (
    <>
      {part(props.above, 'top-0 h-4')}
      {part(props.below, 'top-4 bottom-0')}
    </>
  )
}

export function LinearView(props: {
  readonly folderId: string
  readonly page: PageView
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const { folderId, page, tasks, completed, showCompleted, today, context, actions } = props
  const create = useCreateTask()
  const update = useUpdateTask()
  /* The page reads the same query; here it is read for its days and pages. */
  const done = useFolderCompletedTasks(folderId, true)
  const [pastOpen, setPastOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [doneAtOpen] = useState(() => new Set(completed.map((t) => t.id)))

  const rank = useMemo(() => pageRank(page), [page])

  /* Past, oldest first, so the story runs down into the present. The same
     order the Board's Done column uses. */
  const past = useMemo(() => {
    const finished: { task: TaskCard; date: string | null }[] = []
    for (const day of mergeCompletedDays(done.data?.pages)) {
      for (const task of day.rows) finished.push({ task, date: day.date })
    }
    const abandoned = tasks.filter((task) => task.status === 'abandoned').map((task) => ({ task, date: null }))
    return pastOrder(finished, abandoned)
  }, [done.data, tasks])

  const present = useMemo(() => presentOrder(tasks, today, rank), [tasks, today, rank])
  const future = useMemo(
    () => futureMilestones(page, tasks, completed, today, rank),
    [page, tasks, completed, today, rank],
  )

  const firstMilestone =
    future.find((g) => g.id !== null && g.tasks.length > 0)?.id ?? future.find((g) => g.id !== null)?.id
  const isOpen = (group: Milestone): boolean =>
    group.id === null || (opened.get(group.id) ?? group.id === firstMilestone)
  const nextId = future.find((g) => isOpen(g) && g.tasks.length > 0)?.tasks[0]?.id

  const rowContext: RowContext = { ...context, today }
  const start = (task: TaskCard): void => {
    update.mutate({ id: task.id, body: { start_date: startDay(task, today) } })
  }
  const unstart = (task: TaskCard): void => {
    update.mutate({ id: task.id, body: { start_date: null } })
  }
  const addStep = (title: string, section: string | null): void => {
    create.mutate({ title, folder_id: folderId, ...(section === null ? {} : { section_block_id: section }) })
  }

  const shownPast = pastOpen ? past : past.slice(-PAST_TAIL)
  const earlier = past.length - shownPast.length
  const showEarlier = earlier > 0 || (pastOpen && done.hasNextPage)
  /* "Show completed" off hides the past; the story starts at the present. */
  const hasPast = showCompleted && past.length > 0
  const hasPresent = present.length > 0

  /* The one task meta line every view draws (date, subtasks, repeat, star),
     with another person's face as an extra. */
  const meta = (task: TaskCard): React.JSX.Element => {
    const { steps, ...display } = taskRowDisplay(task, rowContext)
    return (
      <RowMeta
        className="shrink-0 pl-1"
        source={{
          ...display,
          ...(steps === undefined ? {} : { steps: { done: steps.complete, total: steps.total } }),
        }}
        onToggleImportant={() => actions.onToggleImportant(task)}
      />
    )
  }

  /* A title opens the task (renaming is done there). */
  const title = (task: TaskCard, className: string): React.JSX.Element => (
    <button
      type="button"
      onClick={() => actions.onOpenTask(task)}
      className={cn(
        'h-7 min-w-0 flex-1 truncate rounded-sm px-1.5 text-left text-sm',
        className,
      )}
    >
      {task.title}
    </button>
  )

  return (
    <div className="pb-2">
      {hasPast && (
        <section aria-label="Done">
          <ol role="list" className="flex flex-col">
            {showEarlier && (
              <li className="relative flex h-[var(--row-height)] items-center gap-2">
                <Line above={null} below="reached" />
                <span className="w-6 shrink-0" aria-hidden />
                <button
                  type="button"
                  onClick={() => {
                    if (pastOpen) void done.fetchNextPage()
                    setPastOpen(true)
                  }}
                  className={QUIET_ACTION}
                >
                  {earlier > 0 ? `Show ${String(earlier)} earlier` : 'Show earlier'}
                </button>
              </li>
            )}
            {shownPast.map(({ task, date }, index) => {
              const abandoned = task.status === 'abandoned'
              return (
                <li
                  key={task.id}
                  className={cn('relative flex h-[var(--row-height)] items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-muted/60', MOTION)}
                >
                  <Line above={index === 0 && !showEarlier ? null : 'reached'} below="reached" />
                  <button
                    type="button"
                    aria-label={`Reopen ${task.title}`}
                    onClick={() => (abandoned ? actions.onRestore(task) : actions.onToggleComplete(task))}
                    className="relative flex size-6 shrink-0 items-center justify-center rounded-full"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex items-center justify-center rounded-full',
                        abandoned ? 'size-2.5 bg-quiet-foreground/60' : 'size-3.5 bg-primary',
                      )}
                    >
                      {!abandoned && (
                        <svg viewBox="0 0 12 12" className="size-2 text-primary-foreground">
                          <path
                            d="M2.5 6.2 5 8.6 9.6 3.6"
                            pathLength={1}
                            className={cn(styles.check, !doneAtOpen.has(task.id) && styles.drawn)}
                          />
                        </svg>
                      )}
                    </span>
                  </button>
                  {title(task, cn('text-muted-foreground', abandoned && 'line-through'))}
                  {/* The day it was finished, in the meta's date column (the star
                      slot kept) and in the quiet ink, so it never reads as a due date. */}
                  {date !== null && (
                    <span className="flex shrink-0 items-center gap-3 pl-1 text-xs text-quiet-foreground">
                      <span className="tabular-nums" title={`Finished ${formatDayInline(date, today)}`}>
                        {formatDay(date, today)}
                      </span>
                      <span aria-hidden className="size-6" />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section aria-label="In progress">
        <ol role="list" className="flex flex-col">
          {present.map((task, index) => (
            <li key={task.id} aria-current="step" className="group/step group/row relative">
              <Line
                above={index === 0 && !hasPast ? null : 'reached'}
                below={index < present.length - 1 ? 'reached' : 'ahead'}
              />
              <div className={cn('flex h-[var(--row-height)] items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-muted/60', MOTION)}>
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  onClick={() => actions.onToggleComplete(task)}
                  className="group/node relative flex size-6 shrink-0 items-center justify-center rounded-full"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-4 rounded-full border-2 border-primary bg-background ring-4 ring-primary/15 transition-[background-color]',
                      MOTION,
                      'group-hover/node:bg-primary/30',
                    )}
                  />
                </button>
                {title(task, 'font-medium text-foreground')}
                {task.steps_total === 0 && adding !== task.id && (
                  <button type="button" onClick={() => setAdding(task.id)} className={cn(QUIET_ACTION, ON_HOVER)}>
                    Add subtask
                  </button>
                )}
                <button type="button" onClick={() => unstart(task)} className={cn(QUIET_ACTION, ON_HOVER)}>
                  Not now
                </button>
                {meta(task)}
              </div>
              <Subtasks
                task={task}
                onOpen={() => actions.onOpenTask(task)}
                adding={adding === task.id}
                onStopAdding={() => setAdding(null)}
              />
            </li>
          ))}
          {!hasPresent && (
            <li className="relative flex h-[var(--row-height)] items-center gap-2">
              <Line above={hasPast ? 'reached' : null} below="ahead" />
              <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center">
                <span className="size-2 rounded-full bg-quiet-foreground/60" />
              </span>
              <p className="px-1.5 text-sm text-muted-foreground">Nothing in progress</p>
            </li>
          )}
        </ol>
      </section>

      <section aria-label="Up next">
        <ol role="list" className="flex flex-col">
          {future.map((group) => {
            const open = isOpen(group)
            return (
              <li key={group.id ?? 'none'} className="flex flex-col">
                {group.id !== null && (
                  <div className="relative pt-2">
                    <span
                      aria-hidden
                      className={cn('pointer-events-none absolute top-0 bottom-0 left-3 w-0.5 -translate-x-1/2', styles.loose)}
                    />
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpened((map) => new Map(map).set(group.id ?? '', !open))}
                      className={cn(
                        'relative flex h-[var(--row-height)] w-full items-center gap-2 rounded-md pr-1.5 text-left transition-colors hover:bg-muted/60',
                        MOTION,
                      )}
                    >
                      <span className="flex w-6 shrink-0 justify-center" aria-hidden>
                        <span className="size-2.5 rotate-45 rounded-xs border-2 border-quiet-foreground bg-background" />
                      </span>
                      <span className="min-w-0 truncate px-1.5 text-sm font-medium text-foreground">{group.name}</span>
                      {!open && group.tasks.length > 0 && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.tasks.length}</span>
                      )}
                    </button>
                  </div>
                )}
                {open && (
                  <ol role="list" className="flex flex-col">
                    {group.tasks.map((task) => (
                      <li
                        key={task.id}
                        className={cn('group/step group/row relative flex h-[var(--row-height)] items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-muted/60', MOTION)}
                      >
                        <Line above="ahead" below="ahead" />
                        <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center">
                          <span className="size-3 rounded-full border-2 border-quiet-foreground bg-background" />
                        </span>
                        {title(task, 'text-foreground')}
                        <button
                          type="button"
                          onClick={() => start(task)}
                          aria-label={`Start ${task.title}`}
                          className={cn(QUIET_ACTION, task.id !== nextId && ON_HOVER)}
                        >
                          Start
                        </button>
                        {meta(task)}
                      </li>
                    ))}
                    <NewStep onCreate={(text) => addStep(text, group.id)}>
                      <Line above="ahead" below={null} />
                    </NewStep>
                  </ol>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
