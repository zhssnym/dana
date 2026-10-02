import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import type { TaskRows } from '../../../pages/task-rows.js'
import { useTask, useTaskDependencies } from '../../../api/queries.js'
import { DELETED_USER, taskRowDisplay } from '../../../parts/presenters.js'
import { formatDay } from '../../../lib/dates.js'
import { isWaiting } from './thread/thread-model.js'
import { cn } from '../../ui/utils.js'
import { PersonFace } from '../../person-face.js'
import { RowLabels } from '../../label-chip.js'
import { TaskStar } from '../../task-meta.js'
import { taskMatchesFilter } from '../../../views/filter.js'
import type { TaskFilter } from '../../../views/filter.js'
import { ChevronDown, ChevronRight } from '../../../lib/icons.js'

const FreeformTaskDetails = lazy(() => import('./FreeformTaskDetails.js'))

type TaskRowsProps = Parameters<typeof TaskRows>[0]
type TaskCard = TaskRowsProps['tasks'][number]

/** What the Work thread tells each task node (M4 §2.2, §2.4). */
export interface ThreadFacts {
  /** The task id of the one ringed task, or null. */
  readonly next: string | null
  /** The page has more than one member: open tasks show their assignee's face. */
  readonly shared: boolean
  /** A finished task's completion day, from the completed pages the page already read. */
  readonly completedOn: ReadonlyMap<string, string>
  /** The viewer is ticking this task done: the thread may answer with its one motion. */
  readonly onTick?: (taskId: string) => void
}

/* The viewer ticked the ringed task: when the ring moves on, focus follows
   it, so Space ticks the next one. Only the glyph that was pressed sets
   this, and only for a moment. */
let focusFollowsRingUntil = 0
/** How long after a tick the ring's move still counts as that tick's (ms). */
const FOCUS_FOLLOWS_WITHIN = 4000

const noThread: ThreadFacts = { next: null, shared: false, completedOn: new Map() }
const ThreadContext = createContext<ThreadFacts>(noThread)
/** The thread's facts change as the document does; only task nodes re-read them. */
export const ThreadFactsProvider = ThreadContext.Provider

type TaskBridge = Pick<TaskRowsProps, 'context' | 'actions' | 'onAsk'> & {
  readonly byId: ReadonlyMap<string, TaskCard>
  /** The folder's completed cards the page already loaded (its first page of them). */
  readonly completedById: ReadonlyMap<string, TaskCard>
  /** View-only narrowing. The document and Thread facts always keep every Task. */
  readonly taskFilter?: TaskFilter
  readonly freeform: boolean
  readonly flights: ReadonlyMap<string, number>
  readonly startFlight: (taskId: string, height: number) => void
  readonly cancelFlight: (taskId: string) => void
}

const TaskContext = createContext<TaskBridge | null>(null)
const noTasks: readonly TaskCard[] = []

/** Task records and actions stay in Dana's query/action layer, outside editor history. */
export function CanvasTaskProvider({
  tasks, completed = noTasks, context, actions, onAsk, taskFilter, freeform = false, children,
}: Pick<TaskRowsProps, 'tasks' | 'context' | 'actions' | 'onAsk'> & {
  readonly completed?: readonly TaskCard[]
  readonly taskFilter?: TaskFilter
  readonly freeform?: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  const [flights, setFlights] = useState<ReadonlyMap<string, number>>(() => new Map())
  const timers = useRef(new Map<string, number>())
  const cancelFlight = useCallback((taskId: string): void => {
    window.clearTimeout(timers.current.get(taskId))
    timers.current.delete(taskId)
    setFlights((old) => {
      if (!old.has(taskId)) return old
      const next = new Map(old)
      next.delete(taskId)
      return next
    })
  }, [])
  const startFlight = useCallback((taskId: string, height: number): void => {
    if (!freeform || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    window.clearTimeout(timers.current.get(taskId))
    setFlights((old) => new Map(old).set(taskId, height))
    timers.current.set(taskId, window.setTimeout(() => cancelFlight(taskId), 500))
  }, [freeform, cancelFlight])
  useEffect(() => () => { for (const timer of timers.current.values()) window.clearTimeout(timer) }, [])
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const completedById = useMemo(() => new Map(completed.map((task) => [task.id, task])), [completed])
  for (const task of tasks) knownTitles.set(task.id, task.title)
  for (const task of completed) knownTitles.set(task.id, task.title)
  const value = useMemo(
    () => ({ byId, completedById, context, actions, onAsk, taskFilter, freeform, flights, startFlight, cancelFlight }),
    [byId, completedById, context, actions, onAsk, taskFilter, freeform, flights, startFlight, cancelFlight],
  )
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
}

export function useFreeformFlights(): ReadonlyMap<string, number> {
  return useContext(TaskContext)?.flights ?? new Map()
}

/**
 * The gutter menu's Delete for a Task block: the row's own act, with its
 * confirmation and undo (`task-rows.tsx`). Null where the canvas holds no
 * Task layer or the Task is not one the page has loaded.
 */
export function useCanvasTaskDelete(): ((taskId: string) => (() => void) | null) | null {
  const bridge = useContext(TaskContext)
  return useMemo(() => bridge === null ? null : (taskId: string) => {
    const card = bridge.byId.get(taskId) ?? bridge.completedById.get(taskId)
    if (card === undefined) return null
    return () => {
      // One delete everywhere: to Trash with Undo, no question first.
      bridge.actions.onDelete(card)
    }
  }, [bridge])
}

/**
 * Titles the canvas has seen, for the clipboard (#316). BlockNote renders
 * `toExternalHTML` outside this tree, so `TaskContext` is null there and the
 * only thing it can read is module state. A Task it has never seen still
 * copies as a working link to its own page, titled "Task".
 */
const knownTitles = new Map<string, string>()

type NodeState = 'open' | 'next' | 'waiting' | 'done' | 'dropped'

/**
 * One `danaTask` block, drawn as a node on the Work thread (M4 §2.2): its
 * glyph sits on the rail, then the title, then a little meta and Important
 * star on the right.
 *
 * - open: an empty box; the one "next" task wears the accent box and a bold title
 * - waiting (a blocker, or a start still ahead): the amber pause; meta names the blocker, or the start day
 * - done: the filled box with its check, title muted, the day it was done in meta
 * - dropped: the dash in a faint box, title muted and struck; never drawn as done
 *
 * A click on the glyph ticks it (a dropped task is restored); a click anywhere
 * else on the row opens the one task page (`onOpenTask`), as does Enter.
 *
 * **The page's lists are the authority.** The open list and the completed
 * cards the page already loaded are read from props, with no request. Only a
 * Task unknown to both (past the completed page, or gone) is read by id (#312
 * kept that read off every finished placement); while it loads the block holds
 * one empty line, and if it cannot be read it says "Task unavailable".
 *
 * **A finished Task keeps its document block** (#315, #314). Thread draws it
 * in place; Freeform draws it in its Section disclosure.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const listed = bridge.byId.get(taskId)
  const completedListed = bridge.completedById.get(taskId)
  const detail = useTask(listed === undefined && completedListed === undefined ? taskId : null)
  if (detail.data !== undefined) knownTitles.set(taskId, detail.data.title)
  const known = listed ?? completedListed ?? detail.data
  const thread = useContext(ThreadContext)
  if (known !== undefined) {
    /* The Task block alone leaves the view. Its BlockNote outer is hidden by
       thread.css, while the document, authored neighbours and canonical
       thread model keep this Task exactly where it is. */
    if (bridge.taskFilter !== undefined && !taskMatchesFilter(known, bridge.taskFilter, bridge.context.today)) {
      return (
        <div
          data-canvas-task-id={taskId}
          data-canvas-task-filtered=""
          aria-hidden="true"
          contentEditable={false}
        />
      )
    }
    /* Open means on the page's open list; a card the open list lacks is
       finished. Dropped is its own state and is never drawn as done. */
    const state: NodeState = known.status === 'abandoned'
      ? 'dropped'
      : listed === undefined && (completedListed !== undefined || known.status === 'completed')
        ? 'done'
        : isWaiting(known, bridge.context.today)
          ? 'waiting'
          : thread.next === taskId ? 'next' : 'open'
    return (
      <div
        data-canvas-task-id={taskId}
        data-thread-state={state}
        {...(state === 'done' || state === 'dropped' ? { 'data-canvas-task-done': '' } : {})}
        {...(bridge.freeform && completedListed !== undefined && state === 'done' && !bridge.flights.has(taskId) ? { 'data-freeform-completed-source': '' } : {})}
        {...(bridge.flights.has(taskId) ? { 'data-freeform-finishing': '' } : {})}
        style={bridge.flights.has(taskId) ? { '--freeform-flight-height': `${bridge.flights.get(taskId)}px` } as CSSProperties : undefined}
        className="group/row min-w-0 rounded-sm"
        contentEditable={false}
        tabIndex={0}
        /* A click that opens the Task must not also pick its block: ProseMirror
           makes a click on this uneditable row a node selection. A handled
           mousedown is one ProseMirror ignores; React's capture phase runs
           before the editor's own listener. The glyph keeps its own press. */
        onMouseDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('[data-freeform-task-details]')) return
          if ((event.target as HTMLElement).closest('button, a, input')) return
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
          event.preventDefault()
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-freeform-task-details]')) return
          if ((event.target as HTMLElement).closest('button, a, input')) return
          if (event.metaKey || event.ctrlKey || event.shiftKey) return
          bridge.actions.onOpenTask(known)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.target !== event.currentTarget) return
          event.preventDefault()
          event.stopPropagation()
          bridge.actions.onOpenTask(known)
        }}
      >
        {/* One task, announced as a list of one, as every task row is. */}
        <div role="list"><div role="listitem"><ThreadRow task={known} state={state} bridge={bridge} thread={thread} {...(bridge.freeform ? { expanded, onExpand: () => setExpanded((open) => !open) } : {})} /></div></div>
        {bridge.freeform && expanded ? <div data-freeform-task-details="" role="region" aria-label={`${known.title} details`} className="ml-7 border-l border-border py-3 pl-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading task…</p>}>
            <FreeformTaskDetails taskId={taskId} />
          </Suspense>
        </div> : null}
      </div>
    )
  }
  if (detail.isError) {
    return <div data-canvas-task-id={taskId} className="min-w-0 text-sm text-muted-foreground" contentEditable={false}>Task unavailable</div>
  }
  // Unknown until its own read answers: hold the line, say nothing.
  return <div data-canvas-task-id={taskId} data-canvas-task-loading="" aria-busy="true" className="min-h-6 min-w-0" contentEditable={false} />
}

/** The same Task row, drawn once in Freeform's completed disclosure. */
export function FreeformCompletedTask({ task }: { readonly task: TaskCard }): React.JSX.Element {
  const bridge = useContext(TaskContext)
  const thread = useContext(ThreadContext)
  const [expanded, setExpanded] = useState(false)
  if (bridge === null) return <></>
  return <div className="min-w-0" role="listitem">
    <ThreadRow task={task} state="done" bridge={bridge} thread={thread} expanded={expanded} onExpand={() => setExpanded((open) => !open)} />
    {expanded ? <div data-freeform-task-details="" role="region" aria-label={`${task.title} details`} className="ml-7 border-l border-border py-3 pl-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading task…</p>}><FreeformTaskDetails taskId={task.id} /></Suspense>
    </div> : null}
  </div>
}

/**
 * The node's glyph, a 16px square bead on the rail: an empty box; the next
 * task's accent box with a centre; filled in the done colour with the check;
 * waiting's pause; dropped's dash in a fainter box. The edge is 1.5px (2px for
 * next), drawn inside the 16px box, so every bead is one size on the line.
 */
function Glyph({ state }: { readonly state: NodeState }): React.JSX.Element {
  const edge = state === 'next' ? 2 : 1.5
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4">
      <rect x={edge / 2} y={edge / 2} width={16 - edge} height={16 - edge} rx={4 - edge / 2} fill={state === 'done' ? 'currentColor' : 'none'} stroke={state === 'dropped' ? 'var(--line)' : 'currentColor'} strokeWidth={edge} />
      {state === 'done' ? <path d="M5 8.2 7.1 10.3 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {state === 'next' ? <rect x="5" y="5" width="6" height="6" rx="1.5" fill="currentColor" /> : null}
      {state === 'waiting' ? <><rect x="5.5" y="5" width="1.6" height="6" rx=".5" fill="currentColor" /><rect x="8.9" y="5" width="1.6" height="6" rx=".5" fill="currentColor" /></> : null}
      {state === 'dropped' ? <rect x="5" y="7.25" width="6" height="1.5" rx=".6" fill="currentColor" /> : null}
    </svg>
  )
}

const GLYPH_LABEL: Record<NodeState, string> = {
  open: 'Complete task',
  next: 'Complete task',
  waiting: 'Complete task',
  done: 'Mark as not done',
  dropped: 'Restore task',
}

function ThreadRow({ task, state, bridge, thread, expanded, onExpand }: { readonly task: TaskCard; readonly state: NodeState; readonly bridge: TaskBridge; readonly thread: ThreadFacts; readonly expanded?: boolean; readonly onExpand?: () => void }): React.JSX.Element {
  const finished = state === 'done' || state === 'dropped'
  /* Work has its own row renderer rather than `TaskRow`, so it must consume
     the same presenter here instead of silently dropping Label metadata. */
  const rowDisplay = taskRowDisplay(task, bridge.context)
  const display = finished ? null : rowDisplay
  const blockers = useTaskDependencies(state === 'waiting' && (task.blocked_by_count ?? 0) > 0 ? task.id : null)
  const waitsOn = blockers.data?.depends_on.find((edge) => edge.task !== null && edge.task.status !== 'completed')?.task?.title
  const doneOn = state === 'done' ? thread.completedOn.get(task.id) : undefined
  const day = display?.due?.label ?? display?.starts ?? (doneOn === undefined ? undefined : formatDay(doneOn, bridge.context.today))
  const face = !finished && thread.shared && task.assignee !== null ? task.assignee : null
  /* A done task says when it was done. The card carries no completer, so it
     names nobody: the assignee is not always who finished it. A dropped one
     says nothing. */
  const when = state === 'dropped' ? undefined : day
  const labels = rowDisplay.labels ?? []
  const labelCrowded = waitsOn !== undefined || when !== undefined || face !== null
  const glyph = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state !== 'next' || performance.now() > focusFollowsRingUntil) return
    /* Only while focus is still on a glyph, or was lost with a remount (a
       repeating task's tick rewrites the page and the ring may land twice):
       never taken from wherever the viewer went meanwhile. */
    const active = document.activeElement
    if (active !== null && active !== document.body && !active.classList.contains('dana-thread-glyph')) return
    glyph.current?.focus({ preventScroll: true })
    glyph.current?.scrollIntoView({ block: 'nearest' })
  }, [state])
  return (
    <div data-row-key="" className="dana-thread-row group/task flex min-h-[var(--row-height)] min-w-0 items-center gap-x-3">
      <button
        ref={glyph}
        type="button"
        role="checkbox"
        aria-checked={state === 'done'}
        aria-label={GLYPH_LABEL[state]}
        className={cn(
          'dana-thread-glyph',
          state === 'done' ? 'text-[var(--color-success-600)]' : state === 'next' ? 'text-primary' : state === 'waiting' ? 'text-[var(--color-warning-700)]' : 'text-quiet-foreground',
        )}
        /* A tick is not an edit: the press must not pick the row as a node
           (which tints it and puts it in the editor's undo). */
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={(event) => {
          event.stopPropagation()
          if (state === 'dropped') { bridge.actions.onRestore(task); return }
          if (bridge.flights.has(task.id)) {
            if (state !== 'done') return
            bridge.cancelFlight(task.id)
          } else if (state !== 'done') {
            const source = event.currentTarget.closest<HTMLElement>('[data-canvas-task-id]') ?? event.currentTarget
            bridge.startFlight(task.id, source.getBoundingClientRect().height)
          }
          if (state !== 'done') {
            thread.onTick?.(task.id)
            // From the keyboard (the glyph holds focus): a pointer's tick leaves focus alone.
            if (state === 'next' && document.activeElement === event.currentTarget) {
              focusFollowsRingUntil = performance.now() + FOCUS_FOLLOWS_WITHIN
            }
          }
          bridge.actions.onToggleComplete(task)
        }}
      >
        <Glyph state={state} />
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          state === 'dropped' ? 'dana-thread-dropped text-quiet-foreground line-through' : finished ? 'text-muted-foreground' : 'text-foreground',
          state === 'next' && 'font-section',
        )}
        title={task.title}
      >
        {task.title}
        {state === 'next' ? <span className="sr-only"> (next)</span> : null}
        {state === 'dropped' ? <span className="sr-only"> (dropped)</span> : null}
      </span>
      <RowLabels labels={labels} crowded={labelCrowded} />
      {waitsOn !== undefined || when !== undefined || face !== null ? (
        <span className="dana-thread-meta flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {waitsOn !== undefined ? <span className="truncate">waits on {waitsOn}</span> : null}
          {when !== undefined ? <span>{when}</span> : null}
          {/* On a shared page every row keeps the face's place, so the dates share one right edge. */}
          {face !== null
            ? <PersonFace id={face.id} name={face.display_name ?? DELETED_USER} image={face.avatar_url} dense />
            : thread.shared ? <span aria-hidden className="size-[var(--icon-size-compact)] shrink-0" /> : null}
        </span>
      ) : null}
      <TaskStar important={Boolean(task.important)} onToggle={() => bridge.actions.onToggleImportant(task)} touchReachable />
      {onExpand ? <button
        type="button"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${task.title}`}
        aria-expanded={expanded === true}
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/task:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        onClick={(event) => { event.stopPropagation(); onExpand() }}
      >
        {expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
      </button> : null}
    </div>
  )
}

/** Exported for `CanvasTask.test.tsx`; the editor reaches it through the spec below. */
export function CanvasTask({ taskId }: { readonly taskId: string }): React.JSX.Element {
  const bridge = useContext(TaskContext)
  if (bridge === null) return <p role="status">Task unavailable</p>
  return <ResolvedTask taskId={taskId} bridge={bridge} />
}

export const createCanvasTaskSpec = createReactBlockSpec(
  { type: 'danaTask', propSchema: { taskId: { default: '' } }, content: 'none' },
  {
    render: ({ block }) => <CanvasTask taskId={block.props.taskId} />,
    toExternalHTML: ({ block }) => (
      <p><a href={`${window.location.origin}/app/tasks/${block.props.taskId}`}>{knownTitles.get(block.props.taskId) ?? 'Task'}</a></p>
    ),
  },
)