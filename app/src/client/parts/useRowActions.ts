/*
The row callbacks every page hands to `TaskList`, in one place.

Not a convenience: it is what keeps 8.3's invalidation uniform. Each of these
is a mutation from `api/mutations.ts`, so each one refetches the active view on
success and raises 9.1's toast on failure, and a page that wrote its own
handler would be a page that could quietly do neither.

Nothing here decides anything. The transition endpoints of 5.1 are guarded
server-side and idempotent by their no-op rows, so a stale checkbox is a
no-op rather than a corruption, which is what lets the client send the
transition its row implies without first re-reading the row.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { useRemoveFromMyDay, useTransitionTask, useUpdateTask } from '../api/mutations.js'

export interface RowActions {
  readonly onToggleComplete: (task: TaskCard) => void
  readonly onToggleImportant: (task: TaskCard) => void
  readonly onRestore: (task: TaskCard) => void
  readonly onRemoveFromMyDay: (task: TaskCard) => void
}

export function useRowActions(): RowActions {
  const transition = useTransitionTask()
  const update = useUpdateTask()
  const unpull = useRemoveFromMyDay()
  return {
    onToggleComplete: (task) => {
      transition.mutate({
        id: task.id,
        event: task.status === 'completed' ? 'uncomplete' : 'complete',
      })
    },
    onToggleImportant: (task) => {
      update.mutate({ id: task.id, body: { important: !task.important } })
    },
    onRestore: (task) => {
      transition.mutate({ id: task.id, event: 'restore' })
    },
    onRemoveFromMyDay: (task) => {
      unpull.mutate(task.id)
    },
  }
}
