/*
Deleted, but not gone: `prototype-v2`'s `lib/trash.ts` rewritten over 7.13
(RFC 0004's S27, the permanent delete added at S28b).

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

**The permanent delete is Full control's, and `purgeable` says so per row.**
The prototype's `purge` and `emptyTrash` are the acts RFC 0005 change control
item 36 ruled back into Trash; S28a built `DELETE /trash/tasks/:id` and
`DELETE /trash/folders/:id`. `usePurge` is the two mutations behind one act: a
row goes to the address its kind names, and "Empty trash" walks the purgeable
rows one by one, there being no bulk address and the list being short by
construction. Somebody who reaches the address anyway is answered 403 with
the server's sentence, which the toast carries (`writeFailureMessage`), never
a crash.

**That rule is not item 38's any more, and `purgeable` read `is_owner` until
2026-09-20 (issue #268).** Item 38 gave both permanent deletes to the folder
owner alone and this module transcribed it; #228's R8A replaced it and only
the routes moved. The two acts are no longer one rule, which is why one
boolean off one field could not have been right whatever field it read:

- a **task**'s permanent destruction is `task.destroy`, Full control with
  ownership **ignored** — so a Full-control member who owns nothing was
  offered nothing the server would have done for them;
- a **folder**'s is `folder.destroy`, Full control **and** the owner together
  (governing R5 keeps custody in it) — so an owner whose Access had been
  lowered was offered a control answered 403.

`purgeable` is now `folderGates(...).destroyTask` or `.destroyFolder` by the
row's own kind, off `my_access` and `is_owner`, which 7.13 carries since the
same issue. It stays one boolean on `TrashItem` because the screen draws one
list and asks each row one question; what moved is that the answer is the
table's rather than this module's.
*/
import { useMemo } from 'react'

import { useDestroyTrashedFolder, useDestroyTrashedTask } from '../api/mutations.js'
import { useTrash as useTrashRead } from '../api/queries.js'
import { folderGates } from './folder-authority.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'

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
  /* Whether the viewer may delete this permanently. **Not one rule for the
     two kinds**, which is why it is computed per row rather than read off a
     field: see the header. */
  purgeable: boolean
}

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

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

/**
 * Whether this viewer may permanently destroy one Trash row, from the table
 * the two routes resolve against (`shared/folder-actions.ts`, by way of
 * `folder-authority.ts`). Never a ladder written here (AC-790).
 *
 * `isDefault: false` is the one fact a Trash row does not carry, and it is
 * **wrong for some rows rather than merely unread**: INV-2 refuses to trash
 * the *default folder*, so a trashed folder is genuinely never the default
 * one — but it says nothing about a **task**, and a task trashed out of the
 * viewer's own Desk is an ordinary Trash row whose folder is the default one.
 * So this passes a false fact, knowingly, and the reason it is safe is that
 * neither gate reads it: `folder.destroy` and `task.destroy` are preset and
 * custody and nothing else.
 *
 * That safety is asserted rather than stated. `folder-authority.test.ts`
 * drives both gates over all six presets and both owner values with
 * `isDefault` true and false and requires the same answer, so a table that
 * started reading it fails there instead of granting quietly here. The
 * honest alternative — putting `is_default` on the 7.13 rows — was not taken
 * because it would be a second frozen-response field for a fact nothing
 * consumes.
 *
 * Exported so that `trash.test.ts` beside this file can drive it as the pure
 * function it is; `useTrash` is a `useMemo` around it and a case that mounted
 * one would be testing TanStack Query.
 */
export function mayPurge(
  row: { readonly my_access: FolderAccessPreset; readonly is_owner: boolean },
  kind: 'task' | 'folder',
): boolean {
  const gates = folderGates({
    access: row.my_access,
    isOwner: row.is_owner,
    isDefault: false,
  })
  return kind === 'task' ? gates.destroyTask : gates.destroyFolder
}

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
          purgeable: mayPurge(task, 'task'),
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
          purgeable: mayPurge(folder, 'folder'),
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

/**
 * The prototype's `purge` and `emptyTrash` over 7.13's two permanent
 * addresses. Each press is one request; the mutation cache's own rule
 * refetches Trash once it lands, and its error toast carries a 403's
 * sentence. `emptyTrash` sends the purgeable rows in sequence rather than at
 * once so the rate limit of 10.4 is not met by a burst, and stops at the
 * first refusal, which the toast has already named.
 */
export function usePurge(): {
  purge: (item: TrashItem) => Promise<void>
  emptyTrash: (items: readonly TrashItem[]) => Promise<void>
  pending: boolean
} {
  const task = useDestroyTrashedTask()
  const folder = useDestroyTrashedFolder()
  const purge = async (item: TrashItem): Promise<void> => {
    if (item.kind === 'task') await task.mutateAsync(item.subject)
    else if (item.kind === 'folder') await folder.mutateAsync(item.subject)
  }
  return {
    purge: (item) => purge(item).catch(() => undefined),
    emptyTrash: async (items) => {
      try {
        for (const item of items) if (item.purgeable) await purge(item)
      } catch {
        /* Toasted by the mutation cache; the list refetches as it stands. */
      }
    },
    pending: task.isPending || folder.isPending,
  }
}
