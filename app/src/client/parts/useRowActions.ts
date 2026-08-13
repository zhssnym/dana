/*
The row props every page hands to `TaskList`, in one place, and the only file
left in this directory.

`parts/` was the shell session's holding pen for the least that let a page
render, and its header said it should shrink to nothing when the component
library landed. It has: the row and the quick-add row are `components/ui/`,
the two re-export files that stood in for them are deleted, and the five
pages that imported through them now import from there directly, which is the
request `components/README.md` filed against this role.

**This file stayed, and moving it into `api/` was refused rather than
deferred.** Both ledgers proposed that move on the ground that row callbacks
are the data layer's. They are, but this hook reaches for `openTask` from
`components/task-form` and for `StarTooltipMode` from `components/ui`, and
putting it in `api/` would point the data layer at the component layer for
the first time. The dependency runs one way in this client and that is worth
more than the tidier address. What this hook actually is, is the page layer:
every page calls it and no component does.

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

import {
  useDeleteTask,
  useRemoveFromMyDay,
  useTransitionTask,
  useUpdateTask,
} from '../api/mutations.js'
import { openTask } from '../components/task-form/index.js'
import { paths } from '../routes.js'
import type { StarTooltipMode } from './presenters.js'
import type { TaskCard } from '../../shared/tasks.js'

export interface RowActions {
  readonly onToggleComplete: (task: TaskCard) => void
  readonly onToggleImportant: (task: TaskCard) => void
  readonly onRestore: (task: TaskCard) => void
  readonly onRemoveFromMyDay: (task: TaskCard) => void
  /** 9.4's overflow menu, behind that section's own confirmation. */
  readonly onAbandon: (task: TaskCard) => void
  /** 9.5's "click on any row opens the task", and 9.4's overflow edit. */
  readonly onOpenTask: (task: TaskCard) => void
  /** 9.4's overflow delete, behind 9.3's confirmation. */
  readonly onDelete: (task: TaskCard) => void
  /** Q4: outward on Important, inward on every other page. */
  readonly starTooltipMode: StarTooltipMode
}

export function useRowActions(): RowActions {
  const transition = useTransitionTask()
  const update = useUpdateTask()
  const unpull = useRemoveFromMyDay()
  const remove = useDeleteTask()
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
    /*
    The two entries `components/README.md` recorded as owed, arriving with the
    surfaces they waited on. Both are additive, so every page that spreads
    these actions gets them with no page edit, which is the property that file
    said the row already had.

    Opening a task is not a mutation and so is not a hook here: it raises the
    edit arm of the overlay seam, which is `components/task-form/open.ts`.
    It sits in this hook anyway because the row takes it as a callback like
    every other, and because a row that reached for the bus itself would be a
    component deciding what a click means.
    */
    onOpenTask: (task) => {
      openTask(task.id)
    },
    onDelete: (task) => {
      remove.mutate(task.id)
    },
    starTooltipMode: location.pathname === paths.important ? 'outward' : 'inward',
  }
}
