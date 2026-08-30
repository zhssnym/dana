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

import { pushUndo, undoLabel } from '../shell/undo.js'

import {
  useDeleteTask,
  usePullIntoMyDay,
  useRemoveFromMyDay,
  useTransitionTask,
  useUpdateTask,
} from '../api/mutations.js'
import { openTask } from '../components/task-open.js'
import { paths } from '../routes.js'
import type { ColumnValue } from '../views/place-pages.js'
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
  /** The selection bar's delete: one act, one undo entry for the batch. */
  readonly onDeleteMany: (tasks: readonly TaskCard[]) => void
  /**
   * 9.1: "dropping a card in a column writes that value". The board is the
   * one caller today and the value is the column's own `ColumnValue`, which
   * is also what that column captures with, so a drop and a quick-add in one
   * column can never come to mean different things.
   */
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
  const location = useLocation()
  return {
    /*
    Each act registers its own inverse as it runs (9.1's undo paragraph), and
    this hook is where that belongs: every page spreads these callbacks into
    its list, so undo reaches every page without any page knowing it exists,
    and a page written next year gets it too. A screen that had to remember
    to register is a screen that will forget.

    The forward mutation is fired first and unconditionally in every case.
    9.1: "no write is ever held back waiting for the window to close", which
    is the clause AC-225 watches the wire for, and the reason is that a
    queued write is a lie on every other member's screen for five seconds.
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
    /*
    Restore un-abandons, so its inverse abandons again. It is offered on an
    abandoned row, where 9.5 puts the control, and the row it acts on is
    gone from that list the moment it succeeds; the bar is the only thing
    left naming what happened, which is what makes it worth registering.
    */
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
      pushUndo(undoLabel('Abandoned', task.title), () => {
        transition.mutate({ id: task.id, event: 'restore' })
      })
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
    /*
    Delete marks rather than purges since 7.13, so its inverse is the un-trash
    that shares frozen 7.6's restore address (S3 forked the handler on the
    row's state). That is what makes this act undoable at all: before Trash
    there was nothing to put back, and 9.1's own example of the bar's sentence
    is this one.
    */
    onDelete: (task) => {
      remove.mutate(task.id)
      pushUndo(undoLabel('Deleted', task.title), () => {
        transition.mutate({ id: task.id, event: 'restore' })
      })
    },
    /*
    polish: taskrow F1 (2026-08-30). The selection bar deleted three tasks
    by calling the act above three times, so the bar named the last one and
    Undo put back only that one. A batch is one act with one inverse: one
    entry that restores every task it trashed.
    */
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
    /*
    A move registers its inverse like every other act (9.1: "acts register
    their own inverse"), and the inverse is the task's own value before the
    drop, read off the row the board was drawing. Only the keys the column
    writes are inverted: a folder column's drop says nothing about who the
    task is assigned to, and putting the row back should not either.
    */
    onMoveToColumn: (task, value) => {
      const before: ColumnValue = {
        ...(value.folder_id === undefined ? {} : { folder_id: task.folder.id }),
        ...(value.assignee_id === undefined
          ? {}
          : { assignee_id: task.assignee?.id ?? null }),
        ...(value.due_date === undefined ? {} : { due_date: task.due_date }),
        /* S26, item 44's B2: where a card came from, so the undo puts it
           back under the section it was dragged out of. */
        ...(value.section_block_id === undefined
          ? {}
          : { section_block_id: task.section_block_id }),
      }
      update.mutate({ id: task.id, body: value })
      pushUndo(undoLabel('Moved', task.title), () => {
        update.mutate({ id: task.id, body: before })
      })
    },
    starTooltipMode: location.pathname === paths.important ? 'outward' : 'inward',
  }
}
