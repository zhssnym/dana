/*
`docs/design/prototype-v2/src/screens/trash-screen.tsx`, lifted whole at
RFC 0004's S27 and bound through `lib/trash.ts`. It diffs empty against its
original except at the seams named here, each marked `Seam` in the body.

1. **The `@/` specifiers become this client's relative ESM paths** (11.4),
   and the em dashes leave under protocol section 7.
2. **`lib/trash.ts` is the adapter** over 7.13's read, and `usePurge` is the
   prototype's `purge` and `emptyTrash` over the two permanent addresses S28a
   built (RFC 0005 change control items 36, 38 and 53). The act is the folder
   owner's, so each row carries `purgeable` and the Delete control, and the
   header's "Empty trash", are drawn only where the server would answer 204;
   a refusal is the toast's sentence. Built at S28b; AC-262's last arm and
   AC-284 and AC-285 read it.
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
9.11 is amended toward them at RFC 0005 change control item 55, on item 37's
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
import { PageMark } from "../components/page-head.js"
import { CheckCircle2, Trash2 } from "../lib/icons.js"
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
    /* polish: pagehead F5. The shell already insets every page; a second
       inset here put Trash's left edge somewhere no other page's is. The
       mark above the title is every other page's, from `page-head.tsx`. */
    <div className="w-full pt-2 pb-16">
      <PageMark icon={Trash2} hasCover={false} />
      <header className="flex items-baseline justify-between gap-4 pt-1.5 pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl leading-8 font-semibold text-[var(--color-graphite-900)]">
            Trash
          </h1>
          {/* polish: places F12. One sentence for the rule, whether or not
              the page holds anything; 9.11 is amended to it. */}
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
              onRestore={() => onRestore(item)}
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
  onRestore: () => void
  /* Absent where the viewer is not the folder's owner: the control is not
     drawn rather than drawn to be refused. */
  onPurge: (() => void) | undefined
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
      {/* polish: places F10. Restore and Delete are visible at rest; a row
          whose only controls appear on hover is a row with nothing to press. */}
      <span className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity duration-[var(--duration-fast)] group-hover/row:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="sm" onClick={onRestore}>
          Restore
        </Button>
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
