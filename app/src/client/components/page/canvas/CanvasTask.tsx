import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { TaskRows } from '../../../pages/task-rows.js'
import { useTask } from '../../../api/queries.js'

type TaskRowsProps = Parameters<typeof TaskRows>[0]
type TaskBridge = Pick<TaskRowsProps, 'context' | 'actions' | 'onAsk'> & {
  readonly byId: ReadonlyMap<string, TaskRowsProps['tasks'][number]>
}

const TaskContext = createContext<TaskBridge | null>(null)

/** Task records and actions stay in Dana's query/action layer, outside editor history. */
export function CanvasTaskProvider({
  tasks, context, actions, onAsk, children,
}: Pick<TaskRowsProps, 'tasks' | 'context' | 'actions' | 'onAsk'> & {
  readonly children: ReactNode
}): React.JSX.Element {
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const value = useMemo(() => ({ byId, context, actions, onAsk }), [byId, context, actions, onAsk])
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
}

/**
 * One `danaTask` block: the open row it stands for, or its place alone.
 *
 * **A finished Task keeps its place in the document and loses its row, and
 * that is the half #204 got the wrong way round.** The comment this replaces
 * said "Completion removes the row from the open-task view, not from the
 * document", and the second clause is right: `page.items` carries every
 * undeleted task of the folder, so the block and its `page_position` survive
 * completing and un-completing, and nothing here has to preserve them. The
 * first clause is what the code did not do. The open list this canvas draws
 * inside is 9.1's "All open tasks" region, the finished pile is the Done
 * section collapsed at its foot (9.6), and a completed Task was being drawn in
 * both: the fallback below fetched it by id the moment it left the open list
 * and rendered it struck through in the body, a second or so after first
 * paint, while the Done control beside it said it was hiding one thing. Live
 * from 2026-09-17 to 2026-09-20 (#234, cause 3); AC-176 is the criterion that
 * reads it, and it read it as one title resolving in two regions.
 *
 * **The open list is the authority for what the body draws.** `PageBody`
 * renders nothing until that query resolves, so by the time this component
 * exists `byId` is the whole open list; a block that is not in it is a Task
 * that is not open. The by-id read is kept for the two cases that are not
 * that — a Task past Q7's 1000-row cap, which is open and simply absent from
 * the page's copy of the list, and a Task that has gone since this document
 * was hydrated — and its pending state draws nothing rather than "Loading
 * Task…", because the answer it is waiting for is usually "this one belongs to
 * Done" and a line that announces a row which is not coming is worse than the
 * gap it fills.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  const detail = useTask(listed === undefined ? taskId : null)
  const task = listed ?? detail.data
  const finished = listed === undefined && task?.status === 'completed'
  return (
    <div data-canvas-task-id={taskId} className="min-w-0" contentEditable={false}>
      {finished || (task === undefined && detail.isPending) ? null : task === undefined ? (
        <p role="status" className="py-2 text-sm text-muted-foreground">
          This Task is unavailable. Its place is preserved.
        </p>
      ) : (
        <TaskRows
          tasks={[task]}
          context={bridge.context}
          actions={bridge.actions}
          onAsk={bridge.onAsk}
          arrangement={{ arrangeable: false }}
          selectionChrome={false}
        />
      )}
    </div>
  )
}

function CanvasTask({ taskId }: { readonly taskId: string }): React.JSX.Element {
  const bridge = useContext(TaskContext)
  if (bridge === null) return <p role="status">This Task is unavailable. Its place is preserved.</p>
  return <ResolvedTask taskId={taskId} bridge={bridge} />
}

export const createCanvasTaskSpec = createReactBlockSpec(
  { type: 'danaTask', propSchema: { taskId: { default: '' } }, content: 'none' },
  { render: ({ block }) => <CanvasTask taskId={block.props.taskId} /> },
)
