/*
 * The row callbacks every page hands to `TaskList`. Each is a mutation from `api/mutations.ts`, so every page
 * gets the same invalidation, toasts and undo. Transitions are idempotent on the server.
 */
import { pushUndo, undoLabel } from '../shell/undo.js'

import {
  useDeleteTask,
  usePullIntoMyDay,
  useRemoveFromMyDay,
  useTransitionTask,
  useUpdateTask,
} from '../api/mutations.js'
import { openTask } from '../components/task-open.js'
import type { ColumnValue } from '../views/place-pages.js'
import type { StarTooltipMode } from './presenters.js'
import type { TaskCard } from '../../shared/tasks.js'

export interface RowActions {
  readonly onToggleComplete: (task: TaskCard) => void
  readonly onToggleImportant: (task: TaskCard) => void
  readonly onRestore: (task: TaskCard) => void
  readonly onRemoveFromMyDay: (task: TaskCard) => void
  readonly onAbandon: (task: TaskCard) => void
  readonly onOpenTask: (task: TaskCard) => void
  readonly onDelete: (task: TaskCard) => void
  readonly onDeleteMany: (tasks: readonly TaskCard[]) => void
  /** The board's drop: the value is the column's own `ColumnValue`, so a drop and a quick-add there agree. */
  readonly onMoveToColumn: (task: TaskCard, value: ColumnValue) => void
  /** Q4: outward on Important, inward on every other page. */
  readonly starTooltipMode: StarTooltipMode
}

export function useRowActions(): RowActions {
  const transition = useTransitionTask()
  const update = useUpdateTask()
  const unpull = useRemoveFromMyDay()
  const remove = useDeleteTask()
  const pull = usePullIntoMyDay()
  return {
    /*
     * Each act registers its own inverse, so undo reaches every page. The write fires at once; nothing waits
     * for the undo window (AC-225).
     */
    onToggleComplete: (task) => {
      const completing = task.status !== 'completed'
      transition.mutate({
        id: task.id,
        event: completing ? 'complete' : 'uncomplete',
      })
      pushUndo(undoLabel(completing ? 'Completed' : 'Reopened', task.title), () => {
        transition.mutate({ id: task.id, event: completing ? 'uncomplete' : 'complete' })
      })
    },
    onToggleImportant: (task) => {
      const next = !task.important
      update.mutate({ id: task.id, body: { important: next } })
      pushUndo(
        undoLabel(next ? 'Marked important' : 'Unmarked important', task.title),
        () => {
          update.mutate({ id: task.id, body: { important: !next } })
        },
      )
    },
    /* Restore's inverse abandons again. The row leaves the list on success, so the bar is the only trace. */
    onRestore: (task) => {
      transition.mutate({ id: task.id, event: 'restore' })
      pushUndo(undoLabel('Restored', task.title), () => {
        transition.mutate({ id: task.id, event: 'abandon' })
      })
    },
    onRemoveFromMyDay: (task) => {
      unpull.mutate(task.id)
      pushUndo(undoLabel('Removed from My Day', task.title), () => {
        pull.mutate(task.id)
      })
    },
    onAbandon: (task) => {
      transition.mutate({ id: task.id, event: 'abandon' })
      pushUndo(undoLabel('Dropped', task.title), () => {
        transition.mutate({ id: task.id, event: 'restore' })
      })
    },
    /* Opening a task raises the overlay through `components/task-form/open.ts`; it is not a mutation. */
    onOpenTask: (task) => {
      openTask(task.id)
    },
    /* Delete moves to Trash, so its inverse is the restore on POST /tasks/:id/restore. */
    onDelete: (task) => {
      remove.mutate(task.id)
      pushUndo(undoLabel('Deleted', task.title), () => {
        transition.mutate({ id: task.id, event: 'restore' })
      })
    },
    /* A batch is one act with one inverse that restores every task it trashed. */
    onDeleteMany: (tasks) => {
      if (tasks.length === 0) return
      for (const task of tasks) remove.mutate(task.id)
      const label =
        tasks.length === 1 && tasks[0] !== undefined
          ? undoLabel('Deleted', tasks[0].title)
          : `Deleted ${String(tasks.length)} tasks`
      pushUndo(label, () => {
        for (const task of tasks) transition.mutate({ id: task.id, event: 'restore' })
      })
    },
    /* The inverse restores only the keys the column wrote, from the row before the drop. */
    onMoveToColumn: (task, value) => {
      const before: ColumnValue = {
        ...(value.folder_id === undefined ? {} : { folder_id: task.folder.id }),
        ...(value.assignee_id === undefined
          ? {}
          : { assignee_ids: task.assignees?.map((person) => person.id)
              ?? (task.assignee === null ? [] : [task.assignee.id]) }),
        ...(value.due_date === undefined ? {} : { due_date: task.due_date }),
        /* A date column writes the start date for a Start-only row; invert only what the drop wrote. */
        ...(value.start_date === undefined ? {} : { start_date: task.start_date }),
        /* Puts the card back under the section it came from. */
        ...(value.section_block_id === undefined
          ? {}
          : { section_block_id: task.section_block_id }),
      }
      update.mutate({ id: task.id, body: value })
      pushUndo(undoLabel('Moved', task.title), () => {
        update.mutate({ id: task.id, body: before })
      })
    },
    starTooltipMode: 'inward',
  }
}
