/*
9.3's move warning, kept alive across the form's retirement.

The section's edit-mode rule, in its own words: "Moving keeps the unassign
warning: 'Moving will unassign Sara; she isn't a member of Home.'" The v1 form
implemented it, the v1 form has gone, and the prototype's folder chip has no
equivalent: its fixtures carry no membership, so the question its picker could
have asked does not exist there.

**Why this is a module of its own rather than a few lines in the card.** The
answer needs the *destination* folder's members, and a card holds the members
of the folder the task is in. The read can only be made once a destination has
been chosen, which is after a click and inside a menu, and a hook cannot be
called there. So the guard is mounted with the choice in hand: the card holds
which folder was picked, this reads that folder, and the move either runs or
asks first.

**Nothing here decides anything the server does not also enforce.** 4.4 makes
assignment a membership fact and 10.2 refuses an assignee who is not one, and
7.6's PATCH unassigns on a move that strands the assignee whatever this
renders. That is persona 09's hard boundary read straight: "never implement a
validation the server does not also enforce; the disabled inputs are a
convenience, and the server rules are the real ones." This is the convenience,
and it exists so that the unassignment is something a person agreed to rather
than something they discovered.

**The seam it crosses, named as every seam of this row is.** It reads
`useFolder`, which is the query layer, from under a lifted component. That is
the arrangement `components/folder-mark.tsx` and `lib/people-library.ts`
already take and give their reasons for: the lifted surfaces speak in the
prototype's shapes and the adapter modules are where those meet 7.0. The
alternative was threading a members list for every folder in the picker
through the card, which is a read per menu item for a question asked once.

**A destination whose read has not answered does not block the move**, and
that is deliberate rather than lax. The warning is about a consequence, not a
permission; the server applies the rule either way, and a picker that froze
until a membership read landed would make every move wait on a question that
matters for a minority of them.
*/

import { useEffect, useRef } from 'react'

import { useFolder } from '../api/queries.js'
import { ConfirmDialog } from './ui/ConfirmDialog.js'
import { moveWouldUnassign } from './task-copy.js'

export interface PendingMove {
  /** 7.4's id, which is what the read and the write both need. */
  readonly id: string
  readonly name: string
  readonly color: string
}

export function TaskMoveGuard({
  pending,
  assignee,
  onProceed,
  onCancel,
}: {
  /** The folder just chosen, or nothing while no move is in flight. */
  readonly pending: PendingMove | null
  /** Who the task is assigned to, from the card's own task. */
  readonly assignee: { readonly id?: string; readonly name: string } | undefined
  /** Run the move. `stranded` says whether the assignee goes with it. */
  readonly onProceed: (folder: PendingMove, stranded: boolean) => void
  readonly onCancel: () => void
}): React.JSX.Element | null {
  const folder = useFolder(pending?.id ?? '', pending !== null)
  const members = folder.data?.members
  const id = assignee?.id

  /*
  The moves that ask nothing, run.

  Three of them: no destination pending, nobody assigned, and an assignee the
  destination already holds. The read not having answered is a fourth and is
  handled by the header's last paragraph, which is why `members` being
  undefined counts as "nothing to warn about" rather than as "wait".
  */
  const stranded =
    pending !== null &&
    id !== undefined &&
    members !== undefined &&
    !members.some((member) => member.user.id === id)

  const clear = pending !== null && !stranded && folder.isFetched
  /* `onProceed` is the card's own closure and is a new function every render,
     so it is held in a ref rather than depended on: an effect keyed on it
     would run the move again on every render the card made while it was open.
     The pending choice is the fact that decides, and it is the dependency. */
  const proceed = useRef(onProceed)
  proceed.current = onProceed
  useEffect(() => {
    if (clear && pending !== null) proceed.current(pending, false)
  }, [clear, pending])

  if (pending === null || !stranded) return null

  return (
    <ConfirmDialog
      message={moveWouldUnassign(assignee?.name ?? '', pending.name)}
      onContinue={() => {
        onProceed(pending, true)
      }}
      onCancel={onCancel}
    />
  )
}
