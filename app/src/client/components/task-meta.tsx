/*
The one task meta line (round 4). Every view draws a task's right side through
here so a task looks the same everywhere, in fixed positions:

  date · [extras] · subtasks n/m · repeat glyph · star

- The date is the label `dueDisplay` made on the viewer's clock (12/24h), with
  "24 Sep" put in the order the viewer's locale writes it ("Sep 24" in the US).
  Month names stay English, beside English copy (see `lib/dates.ts`).
- Overdue is the destructive ink, and said to screen readers.
- The star is a lighter tone than the title, even when set, so it never
  competes with it; unset, it shows on hover of the enclosing `group/row`.
*/
import type { ReactNode } from "react"

import { Repeat2, Star } from "../lib/icons.js"

import { cn } from "./ui/utils.js"

let monthFirst: boolean | null = null

/** Whether the viewer's locale writes the month before the day. */
function isMonthFirst(): boolean {
  if (monthFirst !== null) return monthFirst
  try {
    const parts = new Intl.DateTimeFormat(navigator.language, { month: "short", day: "numeric" }).formatToParts(
      new Date(2026, 8, 24),
    )
    monthFirst = parts.findIndex((part) => part.type === "month") < parts.findIndex((part) => part.type === "day")
  } catch {
    monthFirst = false
  }
  return monthFirst
}

/** "24 Sep 5:00 PM" → "Sep 24 5:00 PM" where the locale puts the month first. */
export function localDayLabel(label: string, monthFirstLocale = isMonthFirst()): string {
  if (!monthFirstLocale) return label
  return label.replace(/^(\d{1,2}) ([A-Z][a-z]{2})( \d{4})?/, (_all, day: string, month: string, year?: string) =>
    year === undefined ? `${month} ${day}` : `${month} ${day},${year}`,
  )
}

export interface TaskMetaProps {
  readonly due?: { readonly label: string; readonly overdue?: boolean }
  /** Late is not coloured where the list already says every row is late. */
  readonly overdueGiven?: boolean
  readonly steps?: { readonly done: number; readonly total: number }
  /** The repeat's short wording, for its tooltip; absent when it does not repeat. */
  readonly recurrence?: string
  /** Anything a view adds between the date and the counts (folder, face). */
  readonly extras?: readonly ReactNode[]
  readonly star?: {
    readonly important: boolean
    readonly tooltip?: string
    readonly onToggle: () => void
  }
  readonly className?: string
}

export function TaskMeta({ due, overdueGiven, steps, recurrence, extras, star, className }: TaskMetaProps) {
  const late = Boolean(due?.overdue) && !overdueGiven
  return (
    <span className={cn("flex min-w-0 items-center gap-3 text-xs text-muted-foreground", className)}>
      <span className="flex min-w-0 items-center gap-3 overflow-hidden">
        {due ? (
          <span className={cn("shrink-0 whitespace-nowrap tabular-nums", late && "text-destructive")}>
            {late ? <span className="sr-only">Overdue, </span> : null}
            {localDayLabel(due.label)}
          </span>
        ) : null}
        {extras}
        {steps && steps.total > 0 ? (
          <span className="shrink-0 whitespace-nowrap tabular-nums" title={`${steps.done} of ${steps.total} subtasks done`}>
            {steps.done}/{steps.total}
          </span>
        ) : null}
        {recurrence !== undefined ? (
          <span className="flex shrink-0 items-center" title={`Repeats ${recurrence}`}>
            <Repeat2 className="size-3.5" strokeWidth={1.75} aria-label="Repeats" />
          </span>
        ) : null}
      </span>
      {star ? <TaskStar {...star} /> : null}
    </span>
  )
}

/*
Reserved space and opacity only, so hovering never shifts the meta. On a touch
screen an unset star is not drawn and a set one is an indicator you cannot hit
by accident: starring on a phone happens in the task itself.
*/
function TaskStar({ important, tooltip, onToggle }: NonNullable<TaskMetaProps["star"]>) {
  const label = important ? "Important" : "Mark as important"
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={important}
      title={tooltip ?? label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:text-foreground",
        important ? "opacity-70" : "opacity-0 group-hover/row:opacity-70 focus-visible:opacity-70",
        "[@media(hover:none)]:pointer-events-none",
        !important && "[@media(hover:none)]:invisible",
      )}
    >
      <span className="sr-only">{label}</span>
      <Star className={cn("size-3.5", important && "fill-current [&_svg]:fill-current")} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
