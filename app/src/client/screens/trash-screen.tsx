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
import { PageMark } from "../components/page-head.js"
import { CheckCircle2, Layers3, MessageSquare, Trash2 } from "../lib/icons.js"
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
    /* The shell already insets every page; a second inset here would put
       Trash's left edge somewhere no other page's is. The mark above the title
       is every other page's, from `page-head.tsx`. */
    <div className="w-full pt-2 pb-16">
      <PageMark icon={Trash2} hasCover={false} />
      <header className="flex items-baseline justify-between gap-4 pt-1.5 pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl leading-8 font-semibold text-[var(--color-graphite-900)]">
            Trash
          </h1>
          {/* One sentence for the rule, whether or not the page holds anything
              (9.11). */}
          <p className="pt-1 text-[13px] leading-5 text-[var(--color-graphite-500)]">
            {`Deleted items are kept for ${TRASH_DAYS} days, then removed.`}
          </p>
        </div>
        {/* Seam 2: only the rows the viewer owns leave under it. */}
        {purgeable.length ? (
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
            Tasks, folders, facets and discussions you delete land here first, so a wrong press costs
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
      {/* Restore and Delete are visible at rest; a row whose only controls
          appear on hover is a row with nothing to press. */}
      <span className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity duration-[var(--duration-fast)] group-hover/row:opacity-100 focus-within:opacity-100">
        {onRestore ? (
          <Button variant="ghost" size="sm" onClick={onRestore}>
            Restore
          </Button>
        ) : null}
        {/* Seam 2. */}
        {onPurge ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-graphite-500)] hover:text-[var(--color-danger-600)]"
            aria-label="Delete for ever"
            title="Delete for ever"
            onClick={onPurge}
          >
            Delete
          </Button>
        ) : null}
      </span>
    </li>
  )
}
