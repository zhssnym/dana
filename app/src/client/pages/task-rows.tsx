/*
A run of task rows, and the confirmations 9.3 and 9.4 put behind two of the
overflow menu's three entries.

Ported at P8R session R6. His screens each carry their own copy of this: a
`role="list"` wrapper, a `TaskRow` per task spread from a fixture, and an
`AlertDialog` at the bottom of the file holding whichever destructive action
was just asked for. Six copies of that is six places for one of them to drift,
and his six already disagree with each other about the abandon confirm's
wording, which is one of the ten copy faults RFC 0002 measured. So it is one
component here, and section 9's sentence is written once.

**Nothing in this file computes a date or an ordering.** The rows arrive in
the order section 6 fixed and are mapped, not sorted, which is that section's
own sentence: "every view returns rows already ordered; clients never
re-sort". Every display value comes from `parts/presenters.ts`, which owns the
due label, the overdue rule and the initials and is the only thing in this
client that reads today. 7.11 makes a rule that exists only in the client a
specification violation, and this file is where one would be written if it
were written anywhere.

**The confirmations are one sentence in one element.** The prototype delivers
9.4's abandon confirm as an `AlertDialogTitle` plus an `AlertDialogDescription`,
which reads correctly and is not this copy: a block boundary is where a reader
stops hearing one sentence. AC-183 asserts the sentence as one text run and
RFC 0002 restated the rule, so the whole string is the title and there is no
description. The two controls are 9.1's "Continue" and "Cancel", uniform for
every confirmation of 9.3 to 9.9 and not a caller's to rename.

**An abandoned row's checkbox restores it**, which is his own wiring and 9.5's
rule read together: an abandoned row draws a "Restore" control in place of the
box, and his `TaskRow` raises `onToggleComplete(false)` from it.
*/
import { useState } from 'react'

import { useFolders, useMe } from '../api/queries.js'
import { TaskRow } from '../components/task-row.js'
import { ConfirmDialog as UiConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { ABANDON_CONFIRM, DELETE_TASK_CONFIRM } from '../components/ui/copy.js'
import { presenterToday, taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'

/**
 * The three page-level facts every row needs and no `TaskCard` carries: 4.11's
 * today, the signed-in person, and the folder table a folder's colour is
 * resolved against.
 *
 * All three are chrome reads the shell already made, so a page asking for them
 * costs nothing: TanStack answers from the same cache entry (8.3). `today` is
 * `presenterToday()` and never a second clock, which is the rule
 * `parts/presenters.ts` states about itself.
 */
export function useRowBasis(): {
  today: string
  viewerId: string | null
  folders: readonly Folder[]
} {
  const me = useMe()
  const folders = useFolders()
  return {
    today: presenterToday(),
    viewerId: me.data?.user.id ?? null,
    folders: folders.data ?? [],
  }
}

interface PendingConfirm {
  /** The normative sentence section 9 writes for this action. */
  readonly message: string
  readonly run: () => void
}

/**
 * The confirmation of 9.3 to 9.9, as the pages consume it: whichever action
 * `useConfirm` holds, or nothing.
 *
 * The rendering is `ui/ConfirmDialog.tsx`'s, one component for every
 * confirmation in this client, so a task confirm and the People screen's
 * remove-connection confirm cannot drift apart. This adapter only maps the
 * held-action shape onto that component's props.
 */
export function ConfirmDialog({
  pending,
  onClose,
}: {
  readonly pending: PendingConfirm | null
  readonly onClose: () => void
}): React.JSX.Element | null {
  if (pending === null) return null
  return (
    <UiConfirmDialog
      message={pending.message}
      onContinue={() => {
        pending.run()
        onClose()
      }}
      onCancel={onClose}
    />
  )
}

/**
 * Holds whichever destructive action was last asked for, so a page renders one
 * confirmation rather than one per row.
 */
export function useConfirm(): {
  pending: PendingConfirm | null
  ask: (message: string, run: () => void) => void
  close: () => void
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  return {
    pending,
    ask: (message, run) => setPending({ message, run }),
    close: () => setPending(null),
  }
}

/**
 * What a surface that drags its rows attaches to each of them, by index.
 *
 * Optional and absent on every list that does not drag, which is all of them
 * but the board today. It is one prop rather than three so that a caller
 * either drags or does not: three optional callbacks are three ways to attach
 * two of them and wonder why the row will not move.
 */
export interface RowDrag {
  readonly rowRef: (index: number) => (element: HTMLElement | null) => void
  readonly dragProps: (index: number) => {
    onPointerDown: (event: React.PointerEvent) => void
  }
  readonly dragStyle: (index: number) => React.CSSProperties | undefined
  readonly proposal: (index: number) => string | undefined
}

export function TaskRows({
  tasks,
  context,
  actions,
  onAsk,
  drag,
}: {
  readonly tasks: readonly TaskCard[]
  readonly context: RowContext
  readonly actions: RowActions
  /** Raised for the two overflow entries section 9 puts a confirmation on. */
  readonly onAsk: (message: string, run: () => void) => void
  readonly drag?: RowDrag
}): React.JSX.Element {
  return (
    <div role="list" className="space-y-0.5">
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          {...taskRowDisplay(task, context)}
          rowRef={drag?.rowRef(index)}
          dragProps={drag?.dragProps(index)}
          dragStyle={drag?.dragStyle(index)}
          proposal={drag?.proposal(index)}
          onOpen={() => {
            actions.onOpenTask(task)
          }}
          onToggleComplete={() => {
            if (task.status === 'abandoned') actions.onRestore(task)
            else actions.onToggleComplete(task)
          }}
          onToggleImportant={() => {
            actions.onToggleImportant(task)
          }}
          onRemoveFromMyDay={() => {
            actions.onRemoveFromMyDay(task)
          }}
          onAbandon={() => {
            onAsk(ABANDON_CONFIRM, () => {
              actions.onAbandon(task)
            })
          }}
          onDelete={() => {
            onAsk(DELETE_TASK_CONFIRM, () => {
              actions.onDelete(task)
            })
          }}
        />
      ))}
    </div>
  )
}
