/*
The view strip: where a surface can live, said in icons.

Imran's direction, 2026-08-18: the options for where a thing opens — a
conversation, a task — are a horizontal row of small icons, never a list of
written labels; the words appear on hover. One component for every surface
that offers views (the conversation's four homes, the task's five), because a
switcher copied into a second place is a switcher that will one day disagree
with itself — DES-123's rule, applied to chrome.

A radiogroup of icon buttons: the active view sits on the graphite wash, the
label lives in the tooltip, and the whole strip costs about as much width as
one written label would have.
*/

import type { LucideIcon } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export interface ViewStripOption<T extends string> {
  key: T
  label: string
  icon: LucideIcon
}

export function ViewStrip<T extends string>({
  ariaLabel,
  value,
  options,
  onSelect,
}: {
  ariaLabel: string
  value: T
  options: ViewStripOption<T>[]
  onSelect: (next: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex items-center gap-0.5">
      {options.map(({ key, label, icon: Icon }) => (
        <Tooltip key={key}>
          <TooltipTrigger
            render={
              <button
                type="button"
                role="radio"
                aria-checked={value === key}
                aria-label={label}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(key)
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-[background-color,color]",
                  T_FAST,
                  FOCUS,
                  value === key
                    ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
                    : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]",
                )}
              >
                <Icon className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/* The same strip when nothing is "current": a row of actions rather than a
   choice — the task row's "Open in…" popover uses this shape, where picking
   does something once instead of switching a standing state. */
export function ActionStrip({
  ariaLabel,
  options,
  onSelect,
}: {
  ariaLabel: string
  options: ViewStripOption<string>[]
  onSelect: (key: string) => void
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex items-center gap-0.5">
      {options.map(({ key, label, icon: Icon }) => (
        <Tooltip key={key}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={label}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(key)
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <Icon className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
