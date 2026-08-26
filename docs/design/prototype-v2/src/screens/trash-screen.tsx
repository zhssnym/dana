/*
Trash: everything you deleted, for thirty days.

Imran's brief of 2026-08-23, item 13. The page is deliberately the plainest in
the product, and each of the three decisions in it is about *not* making it
interesting.

**It is one list, not a list per kind.** A person coming here is answering "what
did I delete", and they usually know roughly *when* rather than *what* — so the
order is when it went, newest first, and the kind is a glyph on the row rather
than a heading you have to pick first. Tabs for Tasks and Folders would make you
choose a category before you can look, on a page whose whole job is looking.

**Each row says where it goes back to**, because "Restore" is a promise and the
question underneath it is always *back to where*. A task says its folder; a
folder says the shelf it sat on. Restoring something into a place that no longer
exists is the one case worth a sentence, and it gets one.

**The countdown is on the row, not in a banner.** Thirty days is per item, so a
page-level "items are deleted after 30 days" would be true and useless — the
thing you need is how long *this* has, and that is a fact about the row.

Delete for ever asks first. It is the only act in Dana with no way back, which
is the entire reason to confirm — not because it is destructive, since abandon
and delete are destructive too, but because every other destructive act in the
product has a bar in the corner offering it back and this one cannot.
*/

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { folderGlyph } from "@/components/folder-icon-picker"
import { CheckCircle2, Trash2 } from "@/lib/icons"
import {
  TRASH_DAYS,
  type TrashItem,
  daysLeft,
  emptyTrash,
  purge,
  useTrash,
} from "@/lib/trash"
import { whenFor } from "@/lib/history"

export function TrashScreen({
  onRestore,
}: {
  onRestore: (item: TrashItem) => void
}) {
  const items = useTrash()
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
        {items.length ? (
          <Button
            variant="ghost"
            className="shrink-0 text-[var(--color-graphite-600)]"
            onClick={() => setConfirming("all")}
          >
            Empty trash
          </Button>
        ) : null}
      </header>

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
      ) : (
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
            <Button
              variant="destructive"
              onClick={() => {
                if (confirming === "all") emptyTrash()
                else if (confirming) purge(confirming.id)
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
     asks (DES-155); a task wears the check it would wear anywhere. */
  const Glyph = item.kind === "task" ? CheckCircle2 : folderGlyph(undefined, item.subject)
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
          {/* Where it goes back to, which is the question under "Restore". */}
          {item.from ? `${item.from} · ` : ""}
          deleted {whenFor(item.at).toLowerCase()} by {item.actor}
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
        <Button
          variant="ghost"
          size="sm"
          className="text-[var(--color-graphite-500)] hover:text-[var(--color-danger-600)]"
          onClick={onPurge}
        >
          Delete
        </Button>
      </span>
    </li>
  )
}
