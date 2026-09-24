/* A month grid (six weeks, roving tabindex) and the time row beside it. */

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "../../lib/icons.js"

import { MONTHS_FULL, formatDate, weekdayName } from "../../lib/dates.js"
import { isoDay } from "../../tasks/task-model.js"
import { cn } from "./utils.js"

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
function startOfDayLocal(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function sameDay(a: Date | null | undefined, b: Date | null | undefined) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/* Six weeks, always, from the Monday on or before the first. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

/* Range mode draws the span; the caller decides which end a click sets (DES-153). */
export function Calendar({
  selected,
  range,
  onSelect,
  today = new Date(),
  className,
}: {
  selected: Date | null
  range?: { from: Date | null; to: Date | null }
  onSelect: (date: Date) => void
  today?: Date
  className?: string
}) {
  const anchor = selected ?? today
  const [view, setView] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() })
  /* Roving cursor: the grid is one tab stop. */
  const [cursor, setCursor] = useState<Date>(anchor)
  const gridRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  const days = useMemo(() => monthGrid(view.year, view.month), [view])

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLElement>("[data-cursor='true']")?.focus()
  })

  function step(by: number) {
    const next = new Date(cursor)
    next.setDate(cursor.getDate() + by)
    setCursor(next)
    setView({ year: next.getFullYear(), month: next.getMonth() })
    moved.current = true
  }

  function shiftMonth(by: number) {
    const next = new Date(view.year, view.month + by, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <div className={cn("w-[268px] select-none", className)}>
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className={cn(
            "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground",
          )}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span
          aria-live="polite"
          className="text-sm font-medium text-foreground"
        >
          {MONTHS_FULL[view.month]} {view.year}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className={cn(
            "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground",
          )}
        >
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7" role="presentation">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="flex h-7 items-center justify-center text-xs font-medium text-quiet-foreground"
          >
            {day}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Choose a date"
        className="grid grid-cols-7 gap-y-0.5"
        onKeyDown={(event) => {
          const by =
            event.key === "ArrowLeft" ? -1
            : event.key === "ArrowRight" ? 1
            : event.key === "ArrowUp" ? -7
            : event.key === "ArrowDown" ? 7
            : null
          if (by === null) return
          event.preventDefault()
          step(by)
        }}
      >
        {days.map((date) => {
          const outside = date.getMonth() !== view.month
          const isEnd =
            sameDay(date, range?.from) || sameDay(date, range?.to)
          const isSelected = sameDay(date, selected) || isEnd
          const isToday = sameDay(date, today)
          const isCursor = sameDay(date, cursor)
          /* Strictly between the ends: washed, not filled. */
          const isBetween =
            !isEnd &&
            Boolean(range?.from && range?.to) &&
            date > startOfDayLocal(range!.from!) &&
            date < startOfDayLocal(range!.to!)
          return (
            <div
              key={date.toISOString()}
              role="gridcell"
              className={cn(
                "flex justify-center",
                isBetween && "bg-primary/10",
                sameDay(date, range?.from) &&
                  range?.to &&
                  "rounded-l-sm bg-gradient-to-r from-transparent from-50% to-primary/10 to-50%",
                sameDay(date, range?.to) &&
                  range?.from &&
                  !sameDay(range.from, range.to) &&
                  "rounded-r-sm bg-gradient-to-l from-transparent from-50% to-primary/10 to-50%",
              )}
            >
              <button
                type="button"
                data-cursor={isCursor}
                tabIndex={isCursor ? 0 : -1}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                aria-label={`${weekdayName(isoDay(date))} ${formatDate(isoDay(date), "")}`}
                onClick={() => {
                  setCursor(date)
                  if (outside) setView({ year: date.getFullYear(), month: date.getMonth() })
                  onSelect(date)
                }}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-sm text-sm tabular-nums transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                  isSelected
                    ? "bg-primary font-medium text-primary-foreground"
                    : outside
                      ? "text-quiet-foreground hover:bg-accent hover:text-muted-foreground"
                      : "text-foreground hover:bg-accent",
                  isToday && !isSelected && "font-semibold text-primary",
                )}
              >
                {date.getDate()}
                {/* Today keeps its dot even while selected. */}
                {isToday ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isSelected ? "bg-primary-foreground/70" : "bg-primary",
                    )}
                  />
                ) : null}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- time -- */
/* A time: typed segments at rest, each opening its own grid on click. */


/* One typed segment: commits valid numbers, steps on arrows, opens its grid. */

/* Six columns divide both 24 and 60. */
