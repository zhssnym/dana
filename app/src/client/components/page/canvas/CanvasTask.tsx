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
 *
 * **A block that draws nothing must also occupy nothing, and `null` alone does
 * not do that.** BlockNote wraps every block in `.bn-block-content`, which its
 * own stylesheet gives `padding: 3px 0` and `display: flex`, so a React render
 * that returns `null` is still a 6px blank line sitting in the middle of the
 * writing at whatever `page_position` the Task was completed in. Measured on
 * the running page rather than reasoned about: a folder holding an open Task,
 * a finished Task and a second open Task read `bn-block-outer` heights of 52,
 * 6 and 52, and hovering the 6 raised the side menu with Move up, Move down,
 * Move out of group, Move into previous group and a line pointing at a Task
 * menu that is not drawn. So this component marks the blank states with
 * `data-canvas-task-blank`, `canvas.css` collapses that block to nothing, and
 * the three things the gap caused go with it: the hole in the prose, a side
 * menu offered on an invisible block, and Move on a block nobody can see. The
 * second and third go because a zero-height block cannot be the hovered one —
 * measured, not assumed: the menu raised at its y belongs to the neighbour it
 * shares that y with, and Move down from it moves the neighbour.
 *
 * `aria-hidden` says the same thing to a reader who is not looking: an empty
 * element announces nothing today, and the attribute is what keeps that true
 * if anything is ever put inside it.
 *
 * **What the collapse cannot reach is the guard**, which reads the document
 * rather than the screen: a drag-select across the prose either side of a
 * finished Task still spans its block, and `installCanvasGuard` still refuses
 * the whole transaction. That refusal's wording is `guard.ts`'s and had to
 * move with this, because "use its Dana menu" names a control a finished Task
 * does not draw.
 */
function ResolvedTask({ taskId, bridge }: { readonly taskId: string; readonly bridge: TaskBridge }): React.JSX.Element {
  const listed = bridge.byId.get(taskId)
  const detail = useTask(listed === undefined ? taskId : null)
  const task = listed ?? detail.data
  const finished = listed === undefined && task?.status === 'completed'
  /* Finished, and the moment before the by-id read has answered — which is
     usually on its way to finished, so collapsing it too is what stops the
     writing jumping by 6px a second after first paint. */
  const blank = finished || (task === undefined && detail.isPending)
  return (
    <div
      data-canvas-task-id={taskId}
      data-canvas-task-blank={blank ? '' : undefined}
      aria-hidden={blank || undefined}
      className="min-w-0"
      contentEditable={false}
    >
      {blank ? null : task === undefined ? (
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

/** Exported for `CanvasTask.test.tsx`; the editor reaches it through the spec below. */
export function CanvasTask({ taskId }: { readonly taskId: string }): React.JSX.Element {
  const bridge = useContext(TaskContext)
  if (bridge === null) return <p role="status">This Task is unavailable. Its place is preserved.</p>
  return <ResolvedTask taskId={taskId} bridge={bridge} />
}

export const createCanvasTaskSpec = createReactBlockSpec(
  { type: 'danaTask', propSchema: { taskId: { default: '' } }, content: 'none' },
  { render: ({ block }) => <CanvasTask taskId={block.props.taskId} /> },
)
