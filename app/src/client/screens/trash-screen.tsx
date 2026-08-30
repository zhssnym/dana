/*
`docs/design/prototype-v2/src/screens/trash-screen.tsx`, lifted whole at
RFC 0004's S27 and bound through `lib/trash.ts`. It diffs empty against its
original except at the seams named here, each marked `Seam` in the body.

1. **The `@/` specifiers become this client's relative ESM paths** (11.4),
   and the em dashes leave under protocol section 7.
2. **`lib/trash.ts` is the adapter** over 7.13's read; `purge` and
   `emptyTrash` are not imported because they do not exist yet, and every
   control that would call them stands behind `PERMANENT_DELETE_AVAILABLE`,
   which is S28b's slot. AC-262's last arm asserts their absence until then.
3. **The row's glyph is `markIcon` rather than the prototype's
   `folderGlyph`**, S26's ruling for the icon picker read one level down:
   4.3's icon is a stored key and `icon-manifest.ts` is the one place this
   client maps one to a glyph. 7.13 carries no icon for a trashed folder, so
   the folder glyph is the default.
4. **"by {actor}" is not drawn**, 7.13 carrying no actor (RFC 0005 change
   control item 35(b)); the line ends at when.
5. **The read's two other states are drawn**, loading and failed, which the
   lab never has, in `components/state-patterns.tsx`'s own shapes.

The copy is the prototype's: the two subtitle sentences and the empty state.
9.11 is amended toward them at RFC 0005 change control item 52, on item 37's
standing direction, and AC-224 and AC-262 read the new sentences.
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
import { CheckCircle2, Trash2 } from "../lib/icons.js"
import {
  PERMANENT_DELETE_AVAILABLE,
  TRASH_DAYS,
  type TrashItem,
  daysLeft,
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
  const [confirming, setConfirming] = useState<TrashItem | "all" | null>(null)

  return (
    <div className="mx-auto w-full max-w-[var(--shell-page-max)] px-8 pt-8 pb-16">
      <header className="flex items-baseline justify-between gap-4 pb-6">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-semibold text-[var(--color-graphite-900)]">
            Trash
          </h1>
          <p className="pt-1 text-[13px] leading-5 text-[var(--color-graphite-500)]">
            {items.length
              ? `Deleted items are kept for ${TRASH_DAYS} days, then removed.`
              : `Anything you delete waits here for ${TRASH_DAYS} days.`}
          </p>
        </div>
        {/* Seam 2: TODO(S28b) draws this when the route exists. */}
        {items.length && PERMANENT_DELETE_AVAILABLE ? (
          <Button
            variant="ghost"
            className="shrink-0 text-[var(--color-graphite-600)]"
            onClick={() => setConfirming("all")}
          >
            Empty trash
          </Button>
        ) : null}
      </header>

      {/* Seam 5. */}
      {state.pending ? <SkeletonList /> : null}
      {state.failed ? <InlineError onRetry={state.retry} /> : null}

      {items.length ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <TrashRow
              key={item.id}
              item={item}
              onRestore={() => onRestore(item)}
              onPurge={() => setConfirming(item)}
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
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-graphite-200)] px-6 py-14 text-center">
          <Trash2
            className="size-5 text-[var(--color-graphite-400)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[14px] leading-5 font-medium text-[var(--color-graphite-700)]">
            Nothing deleted
          </p>
          <p className="max-w-[42ch] text-[13px] leading-5 text-[var(--color-graphite-500)]">
            Tasks and folders you delete land here first, so a wrong press costs
            a click rather than the thing itself.
          </p>
        </div>
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
                : `Delete “${confirming?.name}” for ever?`}
            </DialogTitle>
            <DialogDescription>
              {confirming === "all"
                ? `${items.length} item${items.length === 1 ? "" : "s"} will be removed. This cannot be undone.`
                : "This cannot be undone, and it is the only act in Dana that cannot."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="ghost">Keep it</Button>}
            />
            {/* Seam 2: TODO(S28b) wires `purge` and `emptyTrash` here. */}
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(null)
              }}
            >
              Delete for ever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TrashRow({
  item,
  onRestore,
  onPurge,
}: {
  item: TrashItem
  onRestore: () => void
  onPurge: () => void
}) {
  /* A folder wears its own glyph, from the one resolver every other surface
     asks (DES-155); a task wears the check it would wear anywhere. Seam 3. */
  const Glyph = item.kind === "task" ? CheckCircle2 : markIcon(null)
  const left = daysLeft(item)

  return (
    <li className="group/row flex items-center gap-3 border-b border-[var(--color-graphite-100)] py-3 last:border-b-0">
      <Glyph
        className="size-4 shrink-0 text-[var(--color-graphite-400)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] leading-5 text-[var(--color-graphite-900)]">
          {item.name}
        </span>
        <span className="truncate text-[12px] leading-4 text-[var(--color-graphite-500)]">
          {/* Where it goes back to, which is the question under "Restore".
              Seam 4: the actor, when 7.13 carries one. */}
          {item.from ? `${item.from} · ` : ""}
          deleted {whenFor(item.at).toLowerCase()}
          {item.actor ? ` by ${item.actor}` : ""}
        </span>
      </div>
      <span
        className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums"
        title={`Removed for good in ${left} day${left === 1 ? "" : "s"}`}
      >
        {left}d left
      </span>
      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/row:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="sm" onClick={onRestore}>
          Restore
        </Button>
        {/* Seam 2: TODO(S28b). */}
        {PERMANENT_DELETE_AVAILABLE ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-graphite-500)] hover:text-[var(--color-danger-600)]"
            onClick={onPurge}
          >
            Delete
          </Button>
        ) : null}
      </span>
    </li>
  )
}
