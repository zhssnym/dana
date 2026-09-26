import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import type { TaskRows } from '../../../pages/task-rows.js'
import { useTask, useTaskDependencies } from '../../../api/queries.js'
import { DELETED_USER, taskRowDisplay } from '../../../parts/presenters.js'
import { formatDate } from '../../../lib/dates.js'
import { Hourglass } from '../../../lib/icons.js'
import { cn } from '../../ui/utils.js'
import { PersonFace } from '../../person-face.js'

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
}

const noThread: ThreadFacts = { next: null, shared: false, completedOn: new Map() }
const ThreadContext = createContext<ThreadFacts>(noThread)
/** The thread's facts change as the document does; only task nodes re-read them. */
export const ThreadFactsProvider = ThreadContext.Provider

type TaskBridge = Pick<TaskRowsProps, 'context' | 'actions' | 'onAsk'> & {
  readonly byId: ReadonlyMap<string, TaskCard>
  /** The folder's completed cards the page already loaded (its first page of them). */
  readonly completedById: ReadonlyMap<string, TaskCard>
}

const TaskContext = createContext<TaskBridge | null>(null)
const noTasks: readonly TaskCard[] = []

/** Task records and actions stay in Dana's query/action layer, outside editor history. */
export function CanvasTaskProvider({
  tasks, completed = noTasks, context, actions, onAsk, children,
}: Pick<TaskRowsProps, 'tasks' | 'context' | 'actions' | 'onAsk'> & {
  readonly completed?: readonly TaskCard[]
  readonly children: ReactNode
}): React.JSX.Element {
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const completedById = useMemo(() => new Map(completed.map((task) => [task.id, task])), [completed])
  for (const task of tasks) knownTitles.set(task.id, task.title)
  for (const task of completed) knownTitles.set(task.id, task.title)
  const value = useMemo(() => ({ byId, completedById, context, actions, onAsk }), [byId, completedById, context, actions, onAsk])
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
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
 * glyph sits on the rail, then the title, then a little meta on the right.
 * No star, no labels, no counts: the task page holds those.
 *
 * - open: a ring; the one "next" task wears the accent ring and a bold title
 * - waiting on a blocker: the hourglass, and "waits on <blocker>" in meta
 * - done: the check, title muted, the day it was done in meta
 * - dropped: the crossed ring, title muted and struck; never drawn as done
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
 * **A finished Task keeps a visible line, not zero height** (#315, #314): it
 * carries BlockNote's side menu like any block and shows up in a selection.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  const completedListed = bridge.completedById.get(taskId)
  const detail = useTask(listed === undefined && completedListed === undefined ? taskId : null)
  if (detail.data !== undefined) knownTitles.set(taskId, detail.data.title)
  const known = listed ?? completedListed ?? detail.data
  const thread = useContext(ThreadContext)
  if (known !== undefined) {
    /* Open means on the page's open list; a card the open list lacks is
       finished. Dropped is its own state and is never drawn as done. */
    const state: NodeState = known.status === 'abandoned'
      ? 'dropped'
      : listed === undefined && (completedListed !== undefined || known.status === 'completed')
        ? 'done'
        : (known.blocked_by_count ?? 0) > 0
          ? 'waiting'
          : thread.next === taskId ? 'next' : 'open'
    return (
      <div
        data-canvas-task-id={taskId}
        data-thread-state={state}
        {...(state === 'done' || state === 'dropped' ? { 'data-canvas-task-done': '' } : {})}
        className="min-w-0 rounded-sm"
        contentEditable={false}
        tabIndex={0}
        /* A click that opens the Task must not also pick its block: ProseMirror
           makes a click on this uneditable row a node selection. A handled
           mousedown is one ProseMirror ignores; React's capture phase runs
           before the editor's own listener. The glyph keeps its own press. */
        onMouseDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input')) return
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
          event.preventDefault()
        }}
        onClick={(event) => {
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
        <div role="list"><div role="listitem"><ThreadRow task={known} state={state} bridge={bridge} thread={thread} /></div></div>
      </div>
    )
  }
  if (detail.isError) {
    return <div data-canvas-task-id={taskId} className="min-w-0 text-sm text-muted-foreground" contentEditable={false}>Task unavailable</div>
  }
  // Unknown until its own read answers: hold the line, say nothing.
  return <div data-canvas-task-id={taskId} data-canvas-task-loading="" aria-busy="true" className="min-h-6 min-w-0" contentEditable={false} />
}

/** The node's glyph: a ring, the accent ring, the check, the crossed ring. */
function Glyph({ state }: { readonly state: NodeState }): React.JSX.Element {
  if (state === 'waiting') return <Hourglass className="size-4" strokeWidth={1.75} />
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4">
      {state === 'done' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2 7.1 10.3 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth={state === 'next' ? 2 : 1.5} />
          {state === 'dropped' ? <path d="M3.8 12.2 12.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> : null}
        </>
      )}
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

function ThreadRow({ task, state, bridge, thread }: { readonly task: TaskCard; readonly state: NodeState; readonly bridge: TaskBridge; readonly thread: ThreadFacts }): React.JSX.Element {
  const finished = state === 'done' || state === 'dropped'
  const display = finished ? null : taskRowDisplay(task, bridge.context)
  const blockers = useTaskDependencies(state === 'waiting' ? task.id : null)
  const waitsOn = blockers.data?.depends_on.find((edge) => edge.task !== null && edge.task.status !== 'completed')?.task?.title
  const doneOn = state === 'done' ? thread.completedOn.get(task.id) : undefined
  const day = display?.due?.label ?? display?.starts ?? (doneOn === undefined ? undefined : formatDate(doneOn, bridge.context.today))
  const face = !finished && thread.shared && task.assignee !== null ? task.assignee : null
  /* On a shared page a done task says who and when ("Maya · 12 Sep", §2.2).
     The card carries no completer, so the person is the assignee. */
  const by = state === 'done' && thread.shared && task.assignee !== null ? task.assignee.display_name ?? DELETED_USER : undefined
  const when = by === undefined ? day : day === undefined ? by : `${by} · ${day}`
  return (
    <div data-row-key="" className="dana-thread-row flex min-h-[var(--row-height)] min-w-0 items-center gap-x-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={state === 'done'}
        aria-label={GLYPH_LABEL[state]}
        className={cn(
          'dana-thread-glyph',
          state === 'done' ? 'text-[var(--color-success-600)]' : state === 'next' ? 'text-primary' : 'text-muted-foreground',
        )}
        onClick={(event) => {
          event.stopPropagation()
          if (state === 'dropped') bridge.actions.onRestore(task)
          else bridge.actions.onToggleComplete(task)
        }}
      >
        <Glyph state={state} />
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          finished ? 'text-muted-foreground' : 'text-foreground',
          state === 'dropped' && 'line-through',
          state === 'next' && 'font-section',
        )}
        title={task.title}
      >
        {task.title}
        {state === 'next' ? <span className="sr-only"> (next)</span> : null}
        {state === 'dropped' ? <span className="sr-only"> (dropped)</span> : null}
      </span>
      {waitsOn !== undefined || when !== undefined || face !== null ? (
        <span className="dana-thread-meta flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {waitsOn !== undefined ? <span className="truncate">waits on {waitsOn}</span> : null}
          {when !== undefined ? <span>{when}</span> : null}
          {face !== null ? <PersonFace id={face.id} name={face.display_name ?? DELETED_USER} image={face.avatar_url} dense /> : null}
        </span>
      ) : null}
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
