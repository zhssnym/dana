/* A month grid (six weeks, roving tabindex) and the time row beside it. */

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "../../lib/icons.js"

import {
  parseTime,
  periodOf,
  to12Hour,
  to24Hour,
  toValue,
  useTimeFormat,
  type Clock,
} from "../../lib/time-format.js"
import { MONTHS_FULL, formatDate, weekdayName } from "../../lib/dates.js"
import { isoDay } from "../../tasks/task-model.js"
import { cn } from "./utils.js"

const FOCUS =
  "outline-none"

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
            FOCUS,
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
            FOCUS,
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
                  FOCUS,
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

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/* One typed segment: commits valid numbers, steps on arrows, opens its grid. */
function Segment({
  value,
  min,
  max,
  ariaLabel,
  open,
  onOpen,
  onCommit,
}: {
  value: string
  min: number
  max: number
  ariaLabel: string
  open: boolean
  onOpen: () => void
  onCommit: (next: number) => void
}) {
  return (
    <input
      inputMode="numeric"
      aria-label={ariaLabel}
      aria-expanded={open}
      value={value}
      onClick={onOpen}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 2)
        if (digits === "") return
        const next = Number(digits)
        if (next > max || next < min) return
        onCommit(next)
      }}
      onKeyDown={(event) => {
        const by = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0
        if (by === 0) return
        event.preventDefault()
        const span = max - min + 1
        onCommit(((Number(value) - min + by + span) % span) + min)
      }}
      onFocus={(event) => event.currentTarget.select()}
      className={cn(
        "w-8 rounded-sm bg-transparent py-0.5 text-center text-sm font-medium tabular-nums text-foreground transition-colors duration-[var(--duration-fast)]",
        FOCUS,
        open ? "bg-accent" : "hover:bg-accent",
      )}
    />
  )
}

/* Six columns divide both 24 and 60. */
function NumberGrid({
  values,
  active,
  onPick,
  label,
}: {
  values: number[]
  active: number
  onPick: (value: number) => void
  label: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    boxRef.current
      ?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" })
  }, [])

  return (
    <div
      ref={boxRef}
      role="listbox"
      aria-label={label}
      className="mt-1.5 grid max-h-[136px] grid-cols-6 gap-0.5 overflow-y-auto rounded-sm bg-muted p-1"
    >
      {values.map((value) => {
        const on = active === value
        return (
          <button
            key={value}
            type="button"
            role="option"
            aria-selected={on}
            data-active={on}
            onClick={() => onPick(value)}
            className={cn(
              "rounded-sm py-1 text-center text-xs tabular-nums transition-colors duration-[var(--duration-fast)]",
              FOCUS,
              on
                ? "bg-primary font-medium text-primary-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            {pad(value)}
          </button>
        )
      })}
    </div>
  )
}

export function TimeRow({
  value,
  onSelect,
  onClear,
}: {
  value: string | null
  onSelect: (time: string) => void
  onClear: () => void
}) {
  const format = useTimeFormat()
  const twelve = format === "12"
  const clock = parseTime(value)
  const [open, setOpen] = useState<"hour" | "minute" | null>(null)

  /* 09:00 is shown, never committed, when nothing is set. */
  const shown: Clock = clock ?? { hour: 9, minute: 0 }

  /* Live ref so two fast commits in one turn don't overwrite each other. */
  const live = useRef<Clock>(shown)
  if (clock) live.current = clock

  const commit = (part: Partial<Clock>) => {
    const next = { ...live.current, ...part }
    live.current = next
    onSelect(toValue(next))
  }

  const hours = useMemo(
    () =>
      twelve
        ? [12, ...Array.from({ length: 11 }, (_, index) => index + 1)]
        : Array.from({ length: 24 }, (_, index) => index),
    [twelve],
  )
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), [])
  const period = periodOf(shown.hour)

  return (
    <div className="border-t border-border pt-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          Time
        </span>

        <div
          className={cn(
            "flex items-center gap-0.5 rounded-sm border border-input px-1 py-0.5",
            clock
              ? "bg-background"
              : "bg-muted",
          )}
        >
          <Segment
            ariaLabel="Hour"
            value={twelve ? pad(to12Hour(shown.hour)) : pad(shown.hour)}
            min={twelve ? 1 : 0}
            max={twelve ? 12 : 23}
            open={open === "hour"}
            onOpen={() => setOpen((current) => (current === "hour" ? null : "hour"))}
            onCommit={(next) =>
              commit({
                hour: twelve ? to24Hour(next, periodOf(live.current.hour)) : next,
              })
            }
          />
          <span
            aria-hidden="true"
            className="text-sm text-quiet-foreground"
          >
            :
          </span>
          <Segment
            ariaLabel="Minute"
            value={pad(shown.minute)}
            min={0}
            max={59}
            open={open === "minute"}
            onOpen={() => setOpen((current) => (current === "minute" ? null : "minute"))}
            onCommit={(next) => commit({ minute: next })}
          />
          {twelve ? (
            <div className="ml-1 flex overflow-hidden rounded-sm bg-muted">
              {(["AM", "PM"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={period === option}
                  onClick={() =>
                    commit({ hour: to24Hour(to12Hour(live.current.hour), option) })
                  }
                  className={cn(
                    "px-1.5 py-0.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                    FOCUS,
                    period === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(null)
            onClear()
          }}
          className={cn(
            "shrink-0 rounded-sm px-2 py-1 text-xs transition-colors duration-[var(--duration-fast)]",
            FOCUS,
            clock
              ? "text-muted-foreground hover:bg-accent"
              : "bg-accent font-medium text-foreground",
          )}
        >
          None
        </button>
      </div>

      {open === "hour" ? (
        <NumberGrid
          label="Hour"
          values={hours}
          active={twelve ? to12Hour(shown.hour) : shown.hour}
          onPick={(hour) => {
            commit({ hour: twelve ? to24Hour(hour, periodOf(live.current.hour)) : hour })
            setOpen("minute")
          }}
        />
      ) : null}
      {open === "minute" ? (
        <NumberGrid
          label="Minute"
          values={minutes}
          active={shown.minute}
          onPick={(minute) => {
            commit({ minute })
            setOpen(null)
          }}
        />
      ) : null}
    </div>
  )
}
