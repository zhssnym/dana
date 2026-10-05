/* The list item around a row: drag transform, selection tint, badges. */

import type { ReactNode } from "react"

import { cn } from "../ui/utils.js"
import { MergeBadge } from "./MergeBadge.js"

export function ExpandShell({
  open,
  row,
  card,
  drag,
  itemRef,
  isActive = false,
  isDwelling = false,
  isArmed = false,
  isSettling = false,
  offset = 0,
  crossOffset = 0,
  isSelected = false,
  proposal,
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
  drag?: Record<string, unknown>
  itemRef?: (element: HTMLElement | null) => void
  /* See the badge at the foot of this component. */
  proposal?: string
  isActive?: boolean
  isDwelling?: boolean
  isArmed?: boolean
  isSettling?: boolean
  offset?: number
  crossOffset?: number
  isSelected?: boolean
}) {
  /* The row being carried has to track the pointer exactly, so its transform
     cannot be on a transition, a row that eases towards the cursor reads as
     lag rather than as weight. Every other row is easing, because they are the
     ones making space and that movement is the whole message.

     Durations come from the tokens, so the reduced-motion block turns all of
     this off without this component knowing anything about it. */
  const carrying = isActive && !isSettling
  return (
    <div
      /*
      **The row is a list item.** 9.1's roles table fixes "A task row: a list
      item, or a row", and tests address exactly that,
      `getByRole('listitem').or(getByRole('row'))` filtered by the title.

      It goes on this element rather than on either row body inside it, because
      this is the element a list holds: the one the drag engine measures and
      moves, the one selection tints, and the one that grows to contain the card
      when a row expands. A role on the inner body would put the expanded card
      *outside* the list item that owns it, so a locator for "the row for this
      task" would stop finding the card the row opened into.

      The list around it is `TaskList`'s own container below, and for every page
      drawing rows through it, `pages/task-rows.tsx`'s `role="list"`.
      */
      role="listitem"
      ref={itemRef}
      {...drag}
      style={{
        transform: offset === 0 && crossOffset === 0 ? undefined : `translate3d(${crossOffset}px, ${offset}px, 0)`,
        maxWidth: carrying && proposal !== undefined ? 'var(--drag-proposal-width)' : undefined,
        /* `scale` as its own property rather than inside `transform`, so the
           armed nudge can ease while the carried row keeps tracking the
           pointer on an untransitioned translate. Putting both in `transform`
           means one transition setting for two jobs, and the pointer job has
           to win. */
        scale: isActive && isArmed ? "0.985" : undefined,
        transition: carrying
          ? "box-shadow var(--duration-fast) var(--ease-standard), scale var(--duration-fast) var(--ease-standard)"
          : [
              "transform var(--duration-base) var(--ease-enter)",
              "scale var(--duration-fast) var(--ease-standard)",
              "background-color var(--duration-base) var(--ease-enter)",
              "box-shadow var(--duration-base) var(--ease-enter)",
              "border-color var(--duration-base) var(--ease-enter)",
              "margin var(--duration-base) var(--ease-enter)",
            ].join(", "),
        /* Above the rows it passes over, and above the one it may merge with,
           or the lift reads as sliding underneath the list. */
        zIndex: isActive ? 30 : undefined,
      }}
      className={cn(
        "relative rounded-sm",
        isSelected && "bg-primary/10",
        isActive && "cursor-grabbing bg-background shadow-[var(--elevation-2)]",
        isDwelling && !isArmed && "bg-muted ring-1 ring-border",
        isArmed && "bg-muted ring-2 ring-primary",
      )}
    >
      {row}
      {open ? card : null}
      {/* The badge rides the row being carried, not the row underneath it.

          On the target it would be invisible: the carried row sits at z-30
          directly under the pointer, which is exactly where the target's right
          edge is, so the countdown would be painted and then covered by the row
          that caused it. Fixing the stacking would put a tinted row on top of
          the one being dragged, which reads as the wrong thing moving.

          Riding the carried row is better than either: it is already on top,
          and it is already where the eyes are. */}
      {isActive && (isDwelling || isArmed) ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <MergeBadge armed={isArmed} />
        </span>
      ) : null}
      {/*
      What a release would do, said in words.

      The badge above is the merge proposal, for a row dragged onto another row.
      A row can also be dragged onto a *container*, a board column, and the rule
      is the same at both ends: a container takes the drop and says so, in words
      rather than an outline. AC-228 reads "Into {column}" while the pointer is
      still down.

      So the prop is drawn in the same slot as the merge badge and never at the
      same time as one: a row being merged is over another row and a row being
      placed is over a column, and the caller supplies whichever it knows about.
      It rides the carried row for the reason the comment above gives.
       */}
      {proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-full left-1 z-40 mt-1 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
          {proposal}
        </span>
      )}
    </div>
  )
}
