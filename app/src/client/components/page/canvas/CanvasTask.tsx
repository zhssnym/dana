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

function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  // Completion removes the row from the open-task view, not from the document.
  const detail = useTask(listed === undefined ? taskId : null)
  const task = listed ?? detail.data
  return (
    <div data-canvas-task-id={taskId} className="min-w-0" contentEditable={false}>
      {task === undefined ? (
        <p role="status" className="py-2 text-sm text-muted-foreground">
          {detail.isPending ? 'Loading Task…' : 'This Task is unavailable. Its place is preserved.'}
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
