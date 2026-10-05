/* The dwell that turns a reorder into a folder, and its badge. */

import { useEffect, useState } from "react"

import { FolderPlus } from "../../lib/icons.js"
import { cn } from "../ui/utils.js"
import { T_FAST } from "./motion.js"

/* ------------------------------------------------------------ dragging, */
/*
Dragging a row, and the 1.5 second dwell that turns a reorder into a folder.

The interaction has two meanings and the dwell is what separates them. Move, and
you are reordering: the row follows the pointer and the rows it passes slide out
of its way, so where it will land is shown rather than described. Stop, and
after 1.5s over one row the release changes meaning, the two tasks become a
folder. A hidden mode is a bad idea unless the mode announces itself, so the
target row fills a bar over exactly the dwell duration and then says what
releasing will do. The bar is the only reason the delay is not a mystery.

Arming also relaxes the list back to its resting order, because rows still
holding a space open for a reorder you are no longer proposing would be lying
about what happens next.

The mechanics live in `lib/use-sortable-list.ts` rather than HTML5
drag-and-drop, whose drag image cannot be styled, whose `dragleave` fires on
crossing onto a child, and which has no auto-scroll and no touch. The same
engine drives the task rows, a card's steps and a card's blocks, so the gesture
is learned once.

Nothing is destroyed on drop. Releasing opens a panel that names the folder and
can be cancelled, because "I dragged one task slightly onto another" and "I want
a new folder" should not be the same gesture with no way back.
*/

export const DWELL_MS = 1500

/* What a folder-in-progress looks like.

   The countdown and the folder are the same object: a ring that closes over
   exactly the dwell duration around the folder mark it is closing on. You can
   tell what is about to happen without reading anything, and how long is left
   without looking anywhere else. When it completes the badge fills, which is a
   change of state rather than a change of volume. */
export function MergeBadge({ armed }: { armed: boolean }) {
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = 10
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-[background-color,transform]",
        T_FAST,
        armed
          ? "scale-[1.03] bg-primary text-primary-foreground"
          : "bg-background text-primary ring-1 ring-border",
      )}
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {armed ? (
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/20" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            /* Rotated so the ring closes from twelve o'clock, which is where
               every progress ring anybody has seen starts. */
            className="absolute inset-0 size-6 -rotate-90"
          >
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              className="stroke-border"
            />
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-primary"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: grown ? 0 : circumference,
                transition: `stroke-dashoffset ${DWELL_MS}ms linear`,
              }}
            />
          </svg>
        )}
        <FolderPlus
          className={cn(
            "size-3.5",
            armed ? "text-primary-foreground" : "text-primary",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="text-xs font-medium whitespace-nowrap">
        {armed ? "Release to make a page" : "Hold to make a page"}
      </span>
    </span>
  )
}
