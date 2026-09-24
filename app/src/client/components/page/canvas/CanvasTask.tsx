import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { TaskRows } from '../../../pages/task-rows.js'
import { useTask } from '../../../api/queries.js'
import { queryKeys } from '../../../api/keys.js'
import type { GetFolderTasksOpenResponse } from '../../../../shared/views.js'

type TaskRowsProps = Parameters<typeof TaskRows>[0]
type TaskBridge = Pick<TaskRowsProps, 'context' | 'actions' | 'onAsk'> & {
  readonly byId: ReadonlyMap<string, TaskRowsProps['tasks'][number]>
  /** The open list was cut at Q7's cap, so an unlisted Task may still be open. */
  readonly truncated: boolean
}

const TaskContext = createContext<TaskBridge | null>(null)

/** Task records and actions stay in Dana's query/action layer, outside editor history. */
export function CanvasTaskProvider({
  tasks, context, actions, onAsk, children,
}: Pick<TaskRowsProps, 'tasks' | 'context' | 'actions' | 'onAsk'> & {
  readonly children: ReactNode
}): React.JSX.Element {
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  for (const task of tasks) knownTitles.set(task.id, task.title)
  /* The route's own open list, from the cache FolderPage filled: no request.
     Unknown (not cached) reads as truncated, which keeps the by-id fallback. */
  const { id: folderId = '' } = useParams<{ id: string }>()
  const truncated = useQueryClient().getQueryData<GetFolderTasksOpenResponse>(queryKeys.folderTasks(folderId, 'open'))?.truncated ?? true
  const value = useMemo(() => ({ byId, truncated, context, actions, onAsk }), [byId, truncated, context, actions, onAsk])
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
 * One `danaTask` block: the open row it stands for, or a slim "Completed Task"
 * line in its place.
 *
 * **The open list is the authority for what the body draws.** `PageBody`
 * renders nothing until that query resolves, so `byId` is the whole open list
 * and a block that is not in it is a Task that is not open. Its row belongs to
 * Done (9.6), so the body never draws it as a row (#234, AC-176) — and it does
 * not fetch it either (#312): one `GET /tasks/:id` per finished placement,
 * repeated by every unfiltered invalidation, bought nothing on screen. The
 * by-id read is kept only when the open list says it was cut at Q7's cap
 * (`truncated`), where an unlisted Task may still be open.
 *
 * **The finished Task keeps a visible line, not zero height** (#315, #314,
 * superseding #278's collapse). A zero-height block had no drag handle, so its
 * `page_position` could not be moved, and a selection spanning it was vetoed
 * with nothing to point at. The line is short and muted so the writing reads
 * through it, carries BlockNote's side menu like any block, shows up in a
 * selection, and links to the Task's own page.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  const detail = useTask(listed === undefined && bridge.truncated ? taskId : null)
  const task = listed ?? detail.data
  const open = task !== undefined && (listed !== undefined || task.status !== 'completed')
  if (open) {
    return (
      <div data-canvas-task-id={taskId} className="min-w-0" contentEditable={false}>
        <TaskRows
          tasks={[task]}
          context={bridge.context}
          actions={bridge.actions}
          onAsk={bridge.onAsk}
          arrangement={{ arrangeable: false }}
          selectionChrome={false}
        />
      </div>
    )
  }
  return (
    <div data-canvas-task-id={taskId} data-canvas-task-done="" className="min-w-0" contentEditable={false}>
      <Link to={`/app/tasks/${taskId}`} className="inline-flex items-center gap-1.5 text-xs">
        <Check aria-hidden className="size-3" />
        {detail.isError ? 'Task unavailable' : 'Completed Task'}
      </Link>
    </div>
  )
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
