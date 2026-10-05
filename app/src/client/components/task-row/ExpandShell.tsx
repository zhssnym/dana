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
  proposal?: string
  isActive?: boolean
  isDwelling?: boolean
  isArmed?: boolean
  isSettling?: boolean
  offset?: number
  crossOffset?: number
  isSelected?: boolean
}) {
  /* The carried row's transform is untransitioned so it tracks the pointer.
     Token durations let reduced motion turn all of this off. */
  const carrying = isActive && !isSettling
  return (
    <div
      /* The role sits here, not on the inner row, so the expanded card stays
         inside the list item; tests locate rows by this role. */
      role="listitem"
      ref={itemRef}
      {...drag}
      style={{
        transform: offset === 0 && crossOffset === 0 ? undefined : `translate3d(${crossOffset}px, ${offset}px, 0)`,
        maxWidth: carrying && proposal !== undefined ? 'var(--drag-proposal-width)' : undefined,
        /* Separate from `transform`, so the armed nudge eases while the
           translate stays untransitioned. */
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
        /* Above the rows it passes, or the lift reads as sliding under the list. */
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
      {/* On the carried row: on the target, the carried row (z-30) would cover it. */}
      {isActive && (isDwelling || isArmed) ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <MergeBadge armed={isArmed} />
        </span>
      ) : null}
      {/* A drop onto a container (a board column), in words. Never shown with the merge badge. */}
      {proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-full left-1 z-40 mt-1 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
          {proposal}
        </span>
      )}
    </div>
  )
}
