/*
The Trash screen (9.11), bound through `lib/trash.ts`. Each row carries
`purgeable` from the adapter, so "Delete forever" and "Empty trash" are drawn
only where the server would answer 204 (AC-262, AC-284, AC-285).
*/

import { useState } from "react"

import { Button } from "../components/ui/button.js"
import { ConfirmDialog } from "../components/ui/ConfirmDialog.js"
import { EMPTY_LINE } from "../components/page/PageStates.js"
import { Row, RowGroup } from "../components/ui/row.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { CheckCircle2, Layers3, MessageSquare } from "../lib/icons.js"
import {
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
  const state = useTrashState()
  const { purge, emptyTrash, pending: purging } = usePurge()
  const purgeable = items.filter((item) => item.purgeable)
  const [confirming, setConfirming] = useState<TrashItem | "all" | null>(null)

  return (
    <div className="w-full pt-2 pb-16">
      <header className="flex items-start justify-between gap-4 pb-6">
        <h1 className="min-w-0 text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground">
          Trash
        </h1>
        {/* Only the rows the viewer may destroy leave under it. */}
        {purgeable.length ? (
          <div className="shrink-0 pt-1">
            <Button variant="destructive" onClick={() => setConfirming("all")}>
              Empty trash
            </Button>
          </div>
        ) : null}
      </header>

      {state.pending ? <SkeletonList /> : null}
      {state.failed ? <InlineError onRetry={state.retry} /> : null}

      {items.length ? (
        <RowGroup role="list">
          {items.map((item) => (
            <TrashRow
              key={item.id}
              item={item}
              onRestore={item.restorable === false ? undefined : () => onRestore(item)}
              onPurge={item.purgeable ? () => setConfirming(item) : undefined}
            />
          ))}
        </RowGroup>
      ) : state.pending || state.failed ? null : (
        <p className={EMPTY_LINE}>
          Nothing in Trash.
        </p>
      )}

      {confirming !== null ? (
        <ConfirmDialog
          message={
            confirming === "all" ? "Empty the trash?" : `Delete “${confirming.name}” forever?`
          }
          description={
            confirming === "all"
              ? `${purgeable.length} item${purgeable.length === 1 ? "" : "s"} will be removed. This cannot be undone.`
              : "This cannot be undone."
          }
          confirmLabel={confirming === "all" ? "Empty trash" : "Delete forever"}
          onCancel={() => setConfirming(null)}
          onContinue={() => {
            const target = confirming
            setConfirming(null)
            if (purging) return
            if (target === "all") void emptyTrash(purgeable)
            else void purge(target)
          }}
        />
      ) : null}
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
  /* Absent where the viewer may not destroy this row: not drawn, not refused. */
  onPurge: (() => void) | undefined
}) {
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
    <Row
      role="listitem"
      className="group hover:bg-accent"
      icon={<Glyph className="size-4" strokeWidth={1.75} aria-hidden="true" />}
      label={item.name}
      description={
        <span className="block truncate">
          {item.from ? `${item.from} · ` : ""}
          deleted {whenFor(item.at).toLowerCase()}
          {item.actor ? ` by ${item.actor}` : ""}
        </span>
      }
      meta={`${left} day${left === 1 ? "" : "s"} left`}
      control={
        onRestore || onPurge ? (
          /* On hover or focus, as the sidebar's "…"; always shown on touch. */
          <span className="flex items-center gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            {onRestore ? (
              <Button variant="ghost" size="sm" onClick={onRestore}>
                Restore
              </Button>
            ) : null}
            {onPurge ? (
              <Button variant="destructive" size="sm" onClick={onPurge}>
                Delete forever
              </Button>
            ) : null}
          </span>
        ) : undefined
      }
    />
  )
}
