/*
The Trash screen, bound through `lib/trash.ts`. What is worth knowing:

- **`lib/trash.ts` is the adapter** over 7.13's read, and `usePurge` performs
  the permanent deletes over the two addresses. The act is Full control's and is
  **not one rule for the two kinds** (issue #268; `lib/trash.ts`'s header
  carries it), so each row carries `purgeable` and the Delete control, and the
  header's "Empty trash", are drawn only where the server would answer 204; a
  refusal is the toast's sentence. The decision lives in the adapter, so this
  file only reads `purgeable`. AC-262, AC-284 and AC-285 read it.
- **The row's glyph is `markIcon`**: 4.3's icon is a stored key and
  `icon-manifest.ts` is the one place this client maps one to a glyph. 7.13
  carries no icon for a trashed folder, so the folder glyph is the default.
- **"by {actor}" is not drawn**, 7.13 carrying no actor; the line ends at when.
- **The read's two other states are drawn**, loading and failed, in
  `components/state-patterns.tsx`'s own shapes.

The two subtitle sentences and the empty state are 9.11's, and AC-224 and AC-262
read them.
*/

import { useState } from "react"

import { Button } from "../components/ui/button.js"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { Screen } from "../components/settings/screen.js"
import { CheckCircle2, Layers3, MessageSquare } from "../lib/icons.js"
import {
  TRASH_DAYS,
  type TrashItem,
  daysLeft,
  usePurge,
  useTrash,
  useTrashState,
} from "../lib/trash.js"
import { whenFor } from "../lib/history.js"
import { InlineError, SkeletonList } from "../components/state-patterns.js"

export function TrashScreen({
  onRestore,
}: {
  onRestore: (item: TrashItem) => void
}) {
  const items = useTrash()
  /* Seam 5. */
  const state = useTrashState()
  /* Seam 2. */
  const { purge, emptyTrash, pending: purging } = usePurge()
  const purgeable = items.filter((item) => item.purgeable)
  const [confirming, setConfirming] = useState<TrashItem | "all" | null>(null)

  return (
    <Screen
      title="Trash"
      /* One sentence for the rule, whether or not the page holds anything
         (9.11). */
      description={`Deleted items are kept for ${TRASH_DAYS} days, then removed.`}
      actions={
        /* Seam 2: only the rows the viewer owns leave under it. */
        purgeable.length ? (
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirming("all")}>
            Empty trash
          </Button>
        ) : null
      }
    >
      {/* Seam 5. */}
      {state.pending ? <SkeletonList /> : null}
      {state.failed ? <InlineError onRetry={state.retry} /> : null}

      {items.length ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <TrashRow
              key={item.id}
              item={item}
              onRestore={item.restorable === false ? undefined : () => onRestore(item)}
              onPurge={item.purgeable ? () => setConfirming(item) : undefined}
            />
          ))}
        </ul>
      ) : state.pending || state.failed ? null : (
        /*
        The empty state says what the page is *for* rather than that it is
        empty, which is the difference between "Nothing here" and knowing you
        can delete something without losing it. Somebody who has never deleted
        anything is exactly the person who does not yet know this page exists.
        */
        <p className="text-sm text-muted-foreground">
          Nothing deleted. Tasks, folders and discussions you delete wait here first, so a wrong
          press costs a click rather than the thing itself.
        </p>
      )}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {confirming === "all"
                ? "Empty the trash?"
                : `Delete “${confirming?.name}” forever?`}
            </DialogTitle>
            <DialogDescription>
              {confirming === "all"
                ? `${purgeable.length} item${purgeable.length === 1 ? "" : "s"} will be removed. This cannot be undone.`
                : "This cannot be undone, and it is the only act in Dana that cannot."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="ghost">Keep it</Button>}
            />
            {/* Seam 2: `purge` and `emptyTrash` over 7.13's addresses. */}
            <Button
              variant="destructive"
              disabled={purging}
              onClick={() => {
                const target = confirming
                setConfirming(null)
                if (target === "all") void emptyTrash(purgeable)
                else if (target !== null) void purge(target)
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  )
}

function TrashRow({
  item,
  onRestore,
  onPurge,
}: {
  item: TrashItem
  /* Absent where the server says this viewer may not restore the row. */
  onRestore: (() => void) | undefined
  /* Absent where the viewer may not destroy this row permanently: the
     control is not drawn rather than drawn to be refused. `lib/trash.ts`
     answers which, per row and per kind. */
  onPurge: (() => void) | undefined
}) {
  /* A folder wears its own glyph, from the one resolver every other surface
     asks; a task wears the check it would wear anywhere. */
  const Glyph =
    item.kind === "task"
      ? CheckCircle2
      : item.kind === "facet"
        ? Layers3
        : item.kind === "discussion"
          ? MessageSquare
          : markIcon(null)
  const left = daysLeft(item)

  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-b-0">
      <Glyph className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{item.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {/* Where it goes back to, which is the question under "Restore".
              Seam 4: the actor, when 7.13 carries one. */}
          {item.from ? `${item.from} · ` : ""}
          deleted {whenFor(item.at).toLowerCase()}
          {item.actor ? ` by ${item.actor}` : ""}
          {` · ${left} day${left === 1 ? "" : "s"} left`}
        </span>
      </div>
      {/* Restore and Delete forever are visible at rest; a row whose only
          controls appear on hover is a row with nothing to press. */}
      <span className="flex shrink-0 items-center gap-1">
        {onRestore ? (
          <Button variant="ghost" onClick={onRestore}>
            Restore
          </Button>
        ) : null}
        {/* Seam 2. */}
        {onPurge ? (
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onPurge}>
            Delete forever
          </Button>
        ) : null}
      </span>
    </li>
  )
}
