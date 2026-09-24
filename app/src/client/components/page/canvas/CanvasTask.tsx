import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { TaskRows } from '../../../pages/task-rows.js'
import { useTask } from '../../../api/queries.js'

type TaskRowsProps = Parameters<typeof TaskRows>[0]
type TaskCard = TaskRowsProps['tasks'][number]
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
 * Titles the canvas has seen, for the clipboard (#316). BlockNote renders
 * `toExternalHTML` outside this tree, so `TaskContext` is null there and the
 * only thing it can read is module state. A Task it has never seen still
 * copies as a working link to its own page, titled "Task".
 */
const knownTitles = new Map<string, string>()

/**
 * One `danaTask` block, drawn as its real row: open, or completed — checked
 * and muted, in place. There is one treatment for a completed placement; the
 * folder's "Show completed" hides them with a class on the canvas.
 *
 * **The page's lists are the authority.** The open list and the completed
 * cards the page already loaded are read from props, with no request. Only a
 * Task unknown to both (past the completed page, or gone) is read by id (#312
 * kept that read off every finished placement); while it loads the block holds
 * one empty line, and if it cannot be read it says "Task unavailable".
 *
 * **A completed Task keeps a visible line, not zero height** (#315, #314,
 * superseding #278's collapse). A zero-height block had no drag handle, so its
 * `page_position` could not be moved, and a selection spanning it was vetoed
 * with nothing to point at. It is now a real row, so it carries BlockNote's
 * side menu like any block and shows up in a selection.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  const completedListed = bridge.completedById.get(taskId)
  const detail = useTask(listed === undefined && completedListed === undefined ? taskId : null)
  if (detail.data !== undefined) knownTitles.set(taskId, detail.data.title)
  const row = (task: TaskCard): React.JSX.Element => (
    <TaskRows
      tasks={[task]}
      context={bridge.context}
      actions={bridge.actions}
      onAsk={bridge.onAsk}
      arrangement={{ arrangeable: false }}
      selectionChrome={false}
    />
  )
  const known = listed ?? completedListed ?? detail.data
  /* The editor swallows the list's tap engine (ProseMirror owns the pointer
     inside its document), so the placement opens its Task itself, through the
     same `onOpenTask` every list row calls: a click that is not on the
     checkbox, star or another control, or Enter on the focused row. */
  const opener = (task: TaskCard) => ({
    tabIndex: 0,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('button, a, input, [role="checkbox"], [role="menuitem"]')) return
      if (event.metaKey || event.ctrlKey || event.shiftKey) return
      bridge.actions.onOpenTask(task)
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' || event.target !== event.currentTarget) return
      event.preventDefault()
      event.stopPropagation()
      bridge.actions.onOpenTask(task)
    },
  })
  /* Finished means completed or abandoned: both hide with "Show completed". */
  if (known !== undefined && known.status !== 'abandoned' && (listed !== undefined || (completedListed === undefined && known.status !== 'completed'))) {
    return <div data-canvas-task-id={taskId} className="min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" contentEditable={false} {...opener(known)}>{row(known)}</div>
  }
  if (known !== undefined) {
    return <div data-canvas-task-id={taskId} data-canvas-task-done="" className="min-w-0 rounded-sm text-muted-foreground opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-ring" contentEditable={false} {...opener(known)}>{row(known)}</div>
  }
  if (detail.isError) {
    return <div data-canvas-task-id={taskId} className="min-w-0 text-sm text-muted-foreground" contentEditable={false}>Task unavailable</div>
  }
  // Unknown until its own read answers: hold the line, say nothing.
  return <div data-canvas-task-id={taskId} data-canvas-task-loading="" aria-busy="true" className="min-h-6 min-w-0" contentEditable={false} />
}

/** Exported for `CanvasTask.test.tsx`; the editor reaches it through the spec below. */
export function CanvasTask({ taskId }: { readonly taskId: string }): React.JSX.Element {
  const bridge = useContext(TaskContext)
  if (bridge === null) return <p role="status">This Task is unavailable. Its place is preserved.</p>
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
