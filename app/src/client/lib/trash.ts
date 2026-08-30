/*
Deleted, but not gone: `prototype-v2`'s `lib/trash.ts` rewritten over 7.13
(RFC 0004's S27).

The prototype's header argues the design and says what the port does: "that
is a stand-in for what the port does, which is flip a column and leave the
row where it is: section 10.2's chokepoint has to see a deleted row in order
to keep it out of every list, which is an argument for soft delete rather
than for a second table." 7.13 is that soft delete, and `GET /trash` answers
the rows inside the thirty-day window, so this module reads that and hands
`screens/trash-screen.tsx` the list in the shape the prototype's store gave
it. Nothing here counts days or sweeps storage: 4.3 and 4.5's window is the
server's, the 11.7 tick purges, and the read is already filtered.

**Two kinds and never one list, on the wire; one list on the screen.** 7.13
answers tasks and folders separately because they carry different facts, and
the screen draws one list newest first, which the prototype's own header
argues for: "a person coming here is answering *what did I delete*, and they
usually know roughly *when* rather than *what*".

**`from` is where it goes back to.** A task names its folder, which 7.13
carries as `folder_name`; a folder names what comes back with it, which is
its task count, the shelf a folder sat on not being a fact 7.13 answers.

**`actor` is not on the wire.** 9.11 asks each row to name who deleted it,
`shared/trash.ts` carries `deleted_at` and no actor, and RFC 0005 change
control item 35(b) is the escalation with its recommendation; the field is
optional here and the screen draws the line without it, at a named seam.

**The permanent delete is S28b's, and the slot is here.** The prototype's
`purge` and `emptyTrash` are the acts RFC 0005 change control item 36 ruled
back into Trash; S28a builds the route and S28b the control. Until then
`PERMANENT_DELETE_AVAILABLE` is false, the screen keeps its markup behind it,
and AC-262's last arm, which asserts the absence, stays true rather than
being weakened ahead of the package that moves it.
*/
import { useMemo } from 'react'

import { useTrash as useTrashRead } from '../api/queries.js'

export type TrashKind = 'task' | 'folder' | 'shelf'

export interface TrashItem {
  id: string
  kind: TrashKind
  /* The object's own key: 7.13's uuid. */
  subject: string
  name: string
  at: number
  actor?: string
  /* Where it was, in a person's words. Restoring puts it back there, and
     the list says where each thing will land. */
  from?: string
}

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

/*
TODO(S28b): flip to true when 7.13's permanent delete lands on the server
(S28a) and `purge` and `emptyTrash` below are written over it. RFC 0005
change control items 36 and 38 carry the ruling and the owner's
leave-or-delete question.
*/
export const PERMANENT_DELETE_AVAILABLE = false

/* How long this has left, for the line that says so. Rounded up, which is
   the safe direction: a row with less than a day reads "1d left" rather than
   "0d left", the 11.7 purge running on the instant and never on this number. */
export function daysLeft(item: TrashItem, now = Date.now()) {
  return Math.max(0, Math.ceil((item.at + TRASH_DAYS * DAY - now) / DAY))
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const EMPTY: TrashItem[] = []

export function useTrash(): TrashItem[] {
  const read = useTrashRead()
  const data = read.data
  return useMemo(() => {
    if (data === undefined) return EMPTY
    const items: TrashItem[] = [
      ...data.tasks.map(
        (task): TrashItem => ({
          id: `task-${task.id}`,
          kind: 'task',
          subject: task.id,
          name: task.title,
          at: Date.parse(task.deleted_at),
          from: task.folder_name,
        }),
      ),
      ...data.folders.map(
        (folder): TrashItem => ({
          id: `folder-${folder.id}`,
          kind: 'folder',
          subject: folder.id,
          name: folder.name,
          at: Date.parse(folder.deleted_at),
          from: plural(folder.task_count, 'task', 'tasks'),
        }),
      ),
    ]
    return items.sort((a, b) => b.at - a.at)
  }, [data])
}

/** The read's own state, for the screen's loading and failed lines. */
export function useTrashState(): { pending: boolean; failed: boolean; retry: () => void } {
  const read = useTrashRead()
  return {
    pending: read.isPending,
    failed: read.isError,
    retry: () => void read.refetch(),
  }
}
