/*
The Linear view: the page's Work document told as the story of the work, top
to bottom, like a GitHub issue's timeline (round 10).

It is a rendering of the same document Freeform edits (`linear/document.ts`):
a task is a step, and every block after it until the next step or section is
that step's content, so a note, an image or a link travels with its step from
the queue to the present and into the history. A section is a milestone.
Nothing is moved when a step starts or finishes; the view regroups.

- **Past** - finished steps in the order they were finished, quiet, each with
  its content in one line. The last three show; "Show n earlier" opens the rest.
- **Present** - every step in progress. One is open as the working area (the
  viewer's last choice, kept per page in this browser): its subtasks, its
  content, and an input that adds to it. The others are one line and their
  latest note; clicking one opens it there.
- **Future** - the queue by milestone. "Start" moves a step into the present.

Only steps have a box, and the box is the only control on the line: it
completes, reopens, or finishes a queued step early. The line is solid where
the work has reached and dashed through what has not started. The end of the
line adds a step, or with "/" text, an image, a link or a milestone.
Clicking a title opens the task. The stage rule and each part's order are
shared with the Board (`linear/stage.ts`).
*/
import { useMemo, useState } from 'react'
import { useAddStep, useUpdateTask } from '../api/mutations.js'
import { useFolderCompletedTasks, mergeCompletedDays } from '../api/queries.js'
import { uploadFile } from '../api/http.js'
import { cn } from '../components/ui/utils.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { RowMeta } from '../components/task-meta.js'
import { formatDay, formatDayInline } from '../lib/dates.js'
import { useRowKeys } from '../components/row-keys.js'
import { Subtasks } from './linear/Subtasks.js'
import { LineContent } from './linear/Content.js'
import { Composer } from './linear/Composer.js'
import { segment, useLineWriter } from './linear/document.js'
import type { NewBlock } from './linear/document.js'
import { futureMilestones, pageRank, pastOrder, presentOrder, startDay } from './linear/stage.js'
import type { Milestone } from './linear/stage.js'
import styles from './LinearView.module.css'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageBlock, PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

const MOTION = 'duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
const PAST_TAIL = 3
const QUIET_ACTION =
  'h-6 shrink-0 rounded-sm px-1.5 text-xs text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground'
/* Drawn only while the step is pointed at or worked in, so a hidden action
   never takes width from the title; always drawn on touch, which has no hover. */
const ON_HOVER =
  'hidden group-hover/step:inline-flex group-focus-within/step:inline-flex [@media(hover:none)]:inline-flex'
const ROW = cn(
  'relative flex min-h-[var(--row-height)] items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-muted/60',
  MOTION,
)

/* The open step in progress, per page, in this browser only. A new key. */
const EXPANDED_KEY = 'dana.linear.expanded'
function readExpanded(folderId: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}') as Record<string, unknown>
    const id = map[folderId]
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}
function writeExpanded(folderId: string, taskId: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(EXPANDED_KEY, JSON.stringify({ ...map, [folderId]: taskId }))
  } catch {
    /* Remembering is a convenience; the first step in progress opens instead. */
  }
}

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
          reach === 'reached' ? 'bg-border' : styles.loose,
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

type BoxState = 'future' | 'present' | 'done' | 'abandoned'

/** A step's box on the line: the only control the line has. */
function StepBox(props: {
  readonly state: BoxState
  readonly label: string
  readonly animate?: boolean
  readonly onClick: () => void
}): React.JSX.Element {
  const { state } = props
  return (
    <button
      type="button"
      aria-label={props.label}
      data-box={state}
      onClick={(event) => {
        event.stopPropagation()
        props.onClick()
      }}
      className="group/box relative flex size-6 shrink-0 items-center justify-center rounded-sm"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border-[1.5px] transition-[background-color,border-color]',
          MOTION,
          state === 'future' && 'border-quiet-foreground bg-background group-hover/box:border-muted-foreground',
          state === 'present' && 'border-primary bg-background group-hover/box:bg-primary/15',
          state === 'done' && 'border-muted-foreground bg-muted-foreground',
          state === 'abandoned' && 'border-quiet-foreground bg-background',
        )}
      >
        {state === 'done' && (
          <svg viewBox="0 0 12 12" className="size-2.5 text-background">
            <path d="M2.5 6.2 5 8.6 9.6 3.6" pathLength={1} className={cn(styles.check, props.animate && styles.drawn)} />
          </svg>
        )}
        {state === 'abandoned' && <span className="h-0.5 w-2 rounded-full bg-quiet-foreground" />}
      </span>
    </button>
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
  const update = useUpdateTask()
  const addSubtask = useAddStep()
  const writer = useLineWriter(folderId)
  /* The page reads the same query; here it is read for its days and pages. */
  const done = useFolderCompletedTasks(folderId, true)
  const [pastOpen, setPastOpen] = useState(false)
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [doneAtOpen] = useState(() => new Set(completed.map((t) => t.id)))
  const [chosen, setChosen] = useState<string | null>(() => readExpanded(folderId))

  const rank = useMemo(() => pageRank(page), [page])
  const line = useMemo(() => segment(page), [page])
  const contentOf = (taskId: string): readonly PageBlock[] => line.contentOf.get(taskId) ?? []
  const hasIntro = line.intro.length > 0
  /* One Tab stop for the view; arrows move, Enter opens, Space completes. */
  const keys = useRowKeys<HTMLDivElement>()

  /* Past, oldest first, so the story runs down into the present. The same
     order the Board's Done column uses. The days come from the query; which
     finished tasks belong is `completed`, which the page has already narrowed
     to the chosen Label. */
  const past = useMemo(() => {
    const kept = new Set(completed.map((task) => task.id))
    const finished: { task: TaskCard; date: string | null }[] = []
    for (const day of mergeCompletedDays(done.data?.pages)) {
      for (const task of day.rows) if (kept.has(task.id)) finished.push({ task, date: day.date })
    }
    const abandoned = tasks.filter((task) => task.status === 'abandoned').map((task) => ({ task, date: null }))
    return pastOrder(finished, abandoned)
  }, [done.data, tasks, completed])

  const present = useMemo(() => presentOrder(tasks, today, rank), [tasks, today, rank])
  const future = useMemo(
    () => futureMilestones(page, tasks, completed, today, rank),
    [page, tasks, completed, today, rank],
  )
  const expandedId = present.some((task) => task.id === chosen) ? chosen : (present[0]?.id ?? null)
  const expand = (taskId: string): void => {
    setChosen(taskId)
    writeExpanded(folderId, taskId)
  }

  const firstMilestone =
    future.find((g) => g.id !== null && g.tasks.length > 0)?.id ?? future.find((g) => g.id !== null)?.id
  const isOpen = (group: Milestone): boolean =>
    group.id === null || (opened.get(group.id) ?? group.id === firstMilestone)
  const nextId = future.find((g) => isOpen(g) && g.tasks.length > 0)?.tasks[0]?.id

  const rowContext: RowContext = { ...context, today }
  const start = (task: TaskCard): void => {
    update.mutate({ id: task.id, body: { start_date: startDay(task, today) } })
    expand(task.id)
  }
  const unstart = (task: TaskCard): void => {
    update.mutate({ id: task.id, body: { start_date: null } })
  }
  const add = (after: string | null, block: NewBlock): void => {
    void writer.write({ op: 'add_block', after, block })
  }
  const addImage = (after: string | null, file: File): void => {
    void uploadFile('image', folderId, file).then((uploaded) => add(after, { kind: 'image', fileId: uploaded.id }))
  }
  const editText = (id: string, text: string): void => {
    void writer.write({ op: 'edit_text', id, text })
  }
  const remove = (id: string): void => {
    void writer.write({ op: 'remove_block', id })
  }

  const shownPast = pastOpen ? past : past.slice(-PAST_TAIL)
  const earlier = past.length - shownPast.length
  const showEarlier = earlier > 0 || (pastOpen && done.hasNextPage)
  /* "Show completed" off hides the past; the story starts at the present. */
  const hasPast = showCompleted && past.length > 0
  const hasPresent = present.length > 0

  /* The one task meta line every view draws (date, subtasks, repeat, star). */
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

  /* A title opens the task (renaming is done there). It takes only its own
     width, so the rest of a step in progress can open it here. */
  const title = (task: TaskCard, className: string): React.JSX.Element => (
    <span className="flex min-w-0 flex-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          actions.onOpenTask(task)
        }}
        className={cn('h-7 min-w-0 truncate rounded-sm px-1.5 text-left text-sm', className)}
      >
        {task.title}
      </button>
    </span>
  )

  /* A row's keyboard contract (`row-keys.ts`), and `data-task-id` so the peek
     steps through the rows in the order drawn here. Enter opens the task
     unless the row says otherwise; `s` starts a queued step. */
  const rowKeys = (task: TaskCard, complete: () => void, extra?: { onEnter?: () => void; onStart?: () => void }) => ({
    'data-row-key': '',
    'data-task-id': task.id,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (extra?.onEnter) extra.onEnter()
        else actions.onOpenTask(task)
      } else if (event.key === ' ') {
        event.preventDefault()
        complete()
      } else if (event.key === 's' && extra?.onStart !== undefined) {
        event.preventDefault()
        extra.onStart()
      }
    },
  })

  const presentStep = (task: TaskCard, index: number): React.JSX.Element => {
    const above: Reach | null = index === 0 && !hasPast && !hasIntro ? null : 'reached'
    const below: Reach = index < present.length - 1 ? 'reached' : 'ahead'
    const complete = (): void => actions.onToggleComplete(task)
    if (task.id !== expandedId) {
      return (
        <li key={task.id} aria-current="step" className="group/step group/row relative">
          <Line above={above} below={below} />
          <div
            {...rowKeys(task, complete, { onEnter: () => expand(task.id) })}
            onClick={() => expand(task.id)}
            className={cn(ROW, 'cursor-pointer')}
          >
            <StepBox state="present" label={`Complete ${task.title}`} onClick={complete} />
            {title(task, 'text-foreground')}
            {meta(task)}
          </div>
          <LineContent blocks={contentOf(task.id)} line={<Line above={below} below={below} />} mode="latest" editable={false} />
        </li>
      )
    }
    return (
      <li key={task.id} aria-current="step" className="group/step group/row relative flex gap-2 py-1">
        <Line above={above} below={below} />
        <span className="flex h-[var(--row-height)] w-6 shrink-0 items-center justify-center self-start mt-1">
          <StepBox state="present" label={`Complete ${task.title}`} onClick={complete} />
        </span>
        <div className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1">
          <div {...rowKeys(task, complete)} className="flex min-h-[var(--row-height)] items-center gap-2 rounded-sm">
            {title(task, 'font-section text-foreground')}
            <button type="button" onClick={() => unstart(task)} className={cn(QUIET_ACTION, ON_HOVER)}>
              Not now
            </button>
            {meta(task)}
          </div>
          <Subtasks task={task} onOpen={() => actions.onOpenTask(task)} />
          <LineContent
            blocks={contentOf(task.id)}
            line={null}
            mode="full"
            editable
            inCard
            onEditText={editText}
            onRemove={remove}
          />
          <div className="py-1">
            <Composer
              variant="card"
              kinds={['text', 'subtask', 'image', 'link']}
              label={`Add to ${task.title}`}
              placeholder="Add to this step, or type / for more"
              onSubmit={(kind, text) => {
                if (kind === 'subtask') addSubtask.mutate({ taskId: task.id, title: text })
                else if (kind === 'link') add(task.id, { kind: 'link', url: text })
                else add(task.id, { kind: 'text', text })
              }}
              onImage={(file) => addImage(task.id, file)}
            />
          </div>
        </div>
      </li>
    )
  }

  return (
    <div ref={keys} className="pb-2">
      {hasIntro && (
        <LineContent blocks={line.intro} line={<Line above={null} below="reached" />} mode="compact" editable={false} />
      )}

      {hasPast && (
        <section aria-label="Done">
          <ol role="list" className="flex flex-col">
            {showEarlier && (
              <li className="relative flex h-[var(--row-height)] items-center gap-2">
                <Line above={hasIntro ? 'reached' : null} below="reached" />
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
              const toggle = (): void => (abandoned ? actions.onRestore(task) : actions.onToggleComplete(task))
              return (
                <li key={task.id} className="relative">
                  <Line above={index === 0 && !showEarlier && !hasIntro ? null : 'reached'} below="reached" />
                  <div {...rowKeys(task, toggle)} className={ROW}>
                    <StepBox
                      state={abandoned ? 'abandoned' : 'done'}
                      label={`Reopen ${task.title}`}
                      animate={!doneAtOpen.has(task.id)}
                      onClick={toggle}
                    />
                    {title(task, cn('text-muted-foreground', abandoned && 'line-through'))}
                    {/* The day it was finished, quiet, so it never reads as a due date. */}
                    {date !== null && (
                      <span
                        className="shrink-0 pl-1 text-xs tabular-nums text-quiet-foreground"
                        title={`Finished ${formatDayInline(date, today)}`}
                      >
                        Done {formatDay(date, today)}
                      </span>
                    )}
                  </div>
                  <LineContent
                    blocks={contentOf(task.id)}
                    line={<Line above="reached" below="reached" />}
                    mode="compact"
                    editable={false}
                  />
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section aria-label="In progress">
        <ol role="list" className="flex flex-col">
          {present.map(presentStep)}
          {!hasPresent && (
            <li className="relative flex h-[var(--row-height)] items-center gap-2">
              <Line above={hasPast || hasIntro ? 'reached' : null} below="ahead" />
              <span className="w-6 shrink-0" aria-hidden />
              <p className="px-1.5 text-sm text-muted-foreground">Nothing in progress</p>
            </li>
          )}
        </ol>
      </section>

      <section aria-label="Up next">
        <ol role="list" className="flex flex-col">
          {future.map((group) => {
            const open = isOpen(group)
            const lead = group.id === null ? [] : (line.leadOf.get(group.id) ?? [])
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
                      className={cn(ROW, 'w-full text-left')}
                    >
                      <span className="flex w-6 shrink-0 justify-center" aria-hidden>
                        <span className="size-2.5 rotate-45 rounded-xs border-[1.5px] border-muted-foreground bg-background" />
                      </span>
                      <span className="min-w-0 truncate px-1.5 text-sm font-section text-foreground">{group.name}</span>
                      {!open && group.tasks.length > 0 && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.tasks.length}</span>
                      )}
                    </button>
                  </div>
                )}
                {open && lead.length > 0 && (
                  <LineContent blocks={lead} line={<Line above="ahead" below="ahead" />} mode="compact" editable={false} />
                )}
                {open && (
                  <ol role="list" className="flex flex-col">
                    {group.tasks.map((task) => (
                      <li key={task.id} className="group/step group/row relative">
                        <Line above="ahead" below="ahead" />
                        <div
                          {...rowKeys(task, () => actions.onToggleComplete(task), { onStart: () => start(task) })}
                          className={ROW}
                        >
                          <StepBox
                            state="future"
                            label={`Complete ${task.title}`}
                            onClick={() => actions.onToggleComplete(task)}
                          />
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
                        </div>
                        <LineContent
                          blocks={contentOf(task.id)}
                          line={<Line above="ahead" below="ahead" />}
                          mode="compact"
                          editable={false}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <Composer
        variant="line"
        line={<Line above="ahead" below={null} />}
        kinds={['step', 'text', 'image', 'link', 'milestone']}
        label="New step"
        placeholder="New step, or type / for more"
        onSubmit={(kind, text) => {
          if (kind === 'milestone') void writer.write({ op: 'add_milestone', name: text })
          else if (kind === 'text') add(null, { kind: 'text', text })
          else if (kind === 'link') add(null, { kind: 'link', url: text })
          else void writer.write({ op: 'add_step', title: text })
        }}
        onImage={(file) => addImage(null, file)}
      />
    </div>
  )
}
