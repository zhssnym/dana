/*
The row props every page hands to `TaskList`, in one place.

Not a convenience: it is what keeps 8.3's invalidation uniform. Each callback
is a mutation from `api/mutations.ts`, so each one refetches the active view on
success and raises 9.1's toast on failure, and a page that wrote its own
handler would be a page that could quietly do neither.

Nothing here decides anything about a transition. The endpoints of 5.1 are
guarded server-side and idempotent by their no-op rows, so a stale checkbox is
a no-op rather than a corruption, which is what lets the client send the
transition its row implies without first re-reading the row.

**One value here is not a callback, and it is here for a structural reason.**
Q4 gives the star an outward tooltip on Important and an inward one
everywhere else, so which one a row shows is a property of the page rather
than of the row. A component that read the route itself would be a component
that behaves differently depending on where it is mounted, which is the thing
props exist to prevent; so the page layer decides, and this hook is the page
layer, called by every page and spread into every list. The row takes it as a
plain prop and can be rendered anywhere.

The reading is `useLocation`, which is the router's own answer rather than a
second copy of the route table, and `paths.important` from `routes.ts`, which
is 9.1's table as code.
*/
import { useLocation } from 'react-router'

import { useRemoveFromMyDay, useTransitionTask, useUpdateTask } from '../api/mutations.js'
import { paths } from '../routes.js'
import type { StarTooltipMode } from '../components/ui/index.js'
import type { TaskCard } from '../../shared/tasks.js'

export interface RowActions {
  readonly onToggleComplete: (task: TaskCard) => void
  readonly onToggleImportant: (task: TaskCard) => void
  readonly onRestore: (task: TaskCard) => void
  readonly onRemoveFromMyDay: (task: TaskCard) => void
  /** 9.4's overflow menu, behind that section's own confirmation. */
  readonly onAbandon: (task: TaskCard) => void
  /** Q4: outward on Important, inward on every other page. */
  readonly starTooltipMode: StarTooltipMode
}

export function useRowActions(): RowActions {
  const transition = useTransitionTask()
  const update = useUpdateTask()
  const unpull = useRemoveFromMyDay()
  const location = useLocation()
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
    onAbandon: (task) => {
      transition.mutate({ id: task.id, event: 'abandon' })
    },
    starTooltipMode: location.pathname === paths.important ? 'outward' : 'inward',
  }
}
