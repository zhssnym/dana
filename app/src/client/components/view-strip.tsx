/*
The view strip: where a surface can live, said in icons.

The options for where a thing opens, a conversation, a task, are a
horizontal row of small icons, never a list of written labels; the words
appear on hover. One component for every surface that offers views (the
conversation's four homes, the task's five), because a switcher copied into a
second place is a switcher that will one day disagree with itself.

A radiogroup of icon buttons: the active view sits on the graphite wash, the
label lives in the tooltip, and the whole strip costs about as much width as
one written label would have.
*/

import type { LucideIcon } from "../lib/icons.js"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export interface ViewStripOption<T extends string> {
  key: T
  label: string
  icon: LucideIcon
  disabled?: boolean
  /* What the tooltip says instead, when the option cannot be chosen yet. */
  disabledLabel?: string
}

/*
`collapse` is the resting behaviour for every switcher: show **only the view you are in**, and widen to the rest on
hover or focus. A switcher is read far more often than it is used, so at rest
it should cost the width of what it is showing and nothing more, and its
border arrives with the expansion rather than boxing one icon all day.

Every option stays in the DOM at every width. The collapsed ones are
zero-width, not removed, so the keyboard and a screen reader always see the
whole group; only the current option holds the tab stop, which is the
radiogroup convention.
*/
export function ViewStrip<T extends string>({
  ariaLabel,
  value,
  options,
  onSelect,
  collapse = false,
}: {
  ariaLabel: string
  value: T
  options: ViewStripOption<T>[]
  onSelect: (next: T) => void
  collapse?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex h-7 items-center gap-0.5 rounded-md",
        collapse
          ? "group/views border border-transparent p-0.5 transition-[border-color] hover:border-[var(--color-graphite-200)] focus-within:border-[var(--color-graphite-200)]"
          : /* polish: pagehead F1, places F5. A resting strip is a segmented
               control: bordered, every option drawn, the current one on the
               wash. Nothing widens on hover; `collapse` is kept for any
               surface that still asks for it. */
            "border border-[var(--color-graphite-200)] bg-card p-0.5",
        T_FAST,
      )}
    >
      {options.map(({ key, label, icon: Icon, disabled, disabledLabel }) => {
        const current = value === key
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  role="radio"
                  aria-checked={current}
                  aria-label={label}
                  disabled={disabled}
                  tabIndex={collapse && !current ? -1 : 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(key)
                  }}
                  className={cn(
                    "flex items-center justify-center overflow-hidden rounded-[4px] transition-[width,opacity,background-color,color] disabled:pointer-events-none disabled:opacity-35",
                    T_FAST,
                    FOCUS,
                    collapse ? "h-full" : "h-full w-7",
                    collapse
                      ? current
                        ? "w-7 opacity-100 text-[var(--color-graphite-800)] group-hover/views:bg-[var(--color-graphite-100)] group-focus-within/views:bg-[var(--color-graphite-100)]"
                        : "w-0 opacity-0 text-[var(--color-graphite-500)] group-hover/views:w-7 group-hover/views:opacity-100 group-focus-within/views:w-7 group-focus-within/views:opacity-100 hover:text-[var(--color-graphite-800)]"
                      : current
                        ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
                        : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]",
                  )}
                >
                  <Icon className="size-3.5 shrink-0 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              }
            />
            <TooltipContent side="bottom">
              {disabled && disabledLabel ? disabledLabel : label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/* The same strip when nothing is "current": a row of actions rather than a
   choice, the task row's "Open in…" popover uses this shape, where picking
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
