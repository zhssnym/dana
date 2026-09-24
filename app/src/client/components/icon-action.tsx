/*
An icon that does one thing, with the name of that thing on hover.

The same story as `person-face.tsx`: this existed twice, as `IconAction` in
`task-card.tsx` and as `ThreadAction` in `comments.tsx`, differing only in
size, 28px in the card's footer, 24px in a message's action row, which is
a prop, not a component. The duplication was taken on to avoid an import
cycle, and the cycle disappears the moment the control lives somewhere that
imports neither of them.

Two sizes and no more, for the reason the avatar has two: the card's footer
band and the row's trailing slot are 28px controls, and a message's actions
sit inside a 20px line of text and need the smaller one. Anything wanting a
third size wants a different control.

Always a tooltip, never a bare glyph. An icon-only button with no accessible
name is unusable by a screen reader and unguessable by everyone else, and
making the label mandatory is what stops that being a matter of diligence.
*/

import type { LucideIcon } from "../lib/icons.js"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"

export function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  tone = "neutral",
  dense = false,
}: {
  icon: LucideIcon
  /* Required, and it is both the tooltip and the accessible name. */
  label: string
  onClick?: () => void
  disabled?: boolean
  tone?: "neutral" | "danger"
  /* 24px, for the actions that sit inside a line of message text. */
  dense?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={(event) => {
              /* A row, a card and a message are all pressable behind this, so
                 the guard belongs to the control rather than to each place
                 that puts one somewhere. */
              event.stopPropagation()
              onClick?.()
            }}
            className={cn(
              "flex items-center justify-center rounded-md transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35",
              dense ? "size-6" : "size-7",
              T_FAST,
              FOCUS,
              tone === "danger"
                ? "text-muted-foreground hover:bg-[var(--color-danger-100)] hover:text-[var(--color-danger-700)]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon
              className="size-3.5 data-[size=sm]:size-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
