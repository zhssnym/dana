/*
A month grid, and the list of times that sits beside it.

The version this replaces was a bare seven-column grid of 12px numbers with
blank cells for the days before the first, which is the shape a date picker
had in about 2009. It also never showed which day was selected, because it
read the day out of a label with `/d+/`, a regular expression matching the
letter d rather than a digit, so the highlight had nothing to land on.

What makes this one feel built rather than assembled: days are 32px targets
instead of 24px, the month always draws six full weeks so the popover never
changes height as you page through it, the days either side of the month are
drawn rather than left as holes, today is marked whether or not it is
selected, and the grid is a roving-tabindex composite so the arrow keys walk
it the way every other calendar a person has used does.

Colour follows the contract rather than this session's taste: selection is
graphite, like every other selected thing in the lab, and today is cobalt,
which is one of the jobs DES-016 gave the accent. V7 is where the rest of
cobalt's jobs land.
*/

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
import { cn } from "./utils.js"

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

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

/* Six weeks, always, starting on the Monday on or before the first. A grid
   that grows a row in March and loses it again in April makes the popover
   jump under the pointer, which is the sort of small wrongness that reads as
   cheap without anybody being able to say why. */
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

/*
Range mode, added at F5 for the filter's date axis (DES-153: "real date
ranges, not only any / with / without / overdue").

The grid stays one calendar rather than becoming two. A range is drawn, not
modelled: `range` says which two days are the ends and the grid washes what
lies between them, while `onSelect` still reports one day and the caller
decides whether that day just became the start or the end. A month grid that
knew about ranges would need to know about half-open ones, about a second
click that lands before the first, and about which end a re-click moves, all
of which are the caller's question, and all of which are already answered
where the filter's state lives.
*/
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
  /* The day the arrow keys are currently on. Roving, so the grid is one tab
     stop rather than forty-two. */
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
            "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
            FOCUS,
          )}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span
          aria-live="polite"
          className="text-[13px] leading-5 font-medium text-[var(--color-graphite-800)]"
        >
          {MONTHS[view.month]} {view.year}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
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
            className="flex h-7 items-center justify-center text-[11px] leading-4 font-medium text-[var(--color-graphite-400)]"
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
          /* Strictly between the two ends: washed, not filled, so the ends
             stay the thing the eye lands on. */
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
                isBetween && "bg-[var(--color-graphite-100)]",
                sameDay(date, range?.from) &&
                  range?.to &&
                  "rounded-l-md bg-gradient-to-r from-transparent from-50% to-[var(--color-graphite-100)] to-50%",
                sameDay(date, range?.to) &&
                  range?.from &&
                  !sameDay(range.from, range.to) &&
                  "rounded-r-md bg-gradient-to-l from-transparent from-50% to-[var(--color-graphite-100)] to-50%",
              )}
            >
              <button
                type="button"
                data-cursor={isCursor}
                tabIndex={isCursor ? 0 : -1}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                aria-label={date.toDateString()}
                onClick={() => {
                  setCursor(date)
                  if (outside) setView({ year: date.getFullYear(), month: date.getMonth() })
                  onSelect(date)
                }}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md text-[13px] leading-5 tabular-nums transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                  FOCUS,
                  isSelected
                    ? "bg-[var(--color-graphite-900)] font-medium text-white"
                    : outside
                      ? "text-[var(--color-graphite-300)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-500)]"
                      : "text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]",
                  isToday && !isSelected && "font-semibold text-[var(--color-dana-accent-700)]",
                )}
              >
                {date.getDate()}
                {/* Today keeps a mark of its own even while selected, so the
                    dot answers "where is today" and the fill answers "what
                    did I pick" without the two ever needing the same pixel. */}
                {isToday ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isSelected ? "bg-white/70" : "bg-[var(--color-dana-accent-600)]",
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
/*
A time, in as little room as a time needs, rebuilt 2026-08-18 after Imran said
the panel was cluttered.

The version before this stood two sixty-row scrolling columns permanently open
beside the calendar. Everything reachable, nothing hidden, and a popover you
had to look at twice to find the four characters you came for. The mistake was
treating "reach every minute" as "show every minute".

So the field is the resting state: two segments you can type into, and the AM
and PM pair when the preference asks for them. Clicking a segment opens that
segment's list underneath, and only that one. The lists are grids rather than
columns because twenty-four things in four rows can be read at a glance where
twenty-four things in a column cannot, and because a grid of sixty minutes is
ten rows instead of a scroll with no end in sight.

Every hour and every minute is still reachable, by typing or by opening the
grid. What changed is that neither is in the way until it is wanted.
*/

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/* One typed segment of the clock. It commits on a valid number, steps on the
   arrow keys, and opens its own grid when clicked, so the same control is
   both ways of answering rather than two controls sitting side by side. */
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
        "w-8 rounded-md bg-transparent py-0.5 text-center text-[14px] leading-5 font-medium tabular-nums text-[var(--color-graphite-900)] transition-colors duration-[var(--duration-fast)]",
        FOCUS,
        open ? "bg-[var(--color-graphite-100)]" : "hover:bg-[var(--color-graphite-100)]",
      )}
    />
  )
}

/* The grid a segment opens. Six columns, because that divides both
   twenty-four and sixty and lands the numbers in tidy rows either way. */
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
      className="mt-1.5 grid max-h-[136px] grid-cols-6 gap-0.5 overflow-y-auto rounded-md bg-[var(--color-graphite-25)] p-1"
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
              "rounded py-1 text-center text-[12px] leading-4 tabular-nums transition-colors duration-[var(--duration-fast)]",
              FOCUS,
              on
                ? "bg-[var(--color-graphite-900)] font-medium text-white"
                : "text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-200)]",
            )}
          >
            {pad(value)}
          </button>
        )
      })}
    </div>
  )
}

/*
**Seam, S23: the row takes the field's name.**

9.3's reminder row is "one picker, a time on that day", and the harness reads
that control as `getByLabel(/^reminder time$/i)` inside the picker, which is
the name the retired chip strip carried as `REMINDER_TIME`. The prototype
labels the two halves "Hour" and "Minute", which says what each spinner is and
not what the pair is for; the group's own name is what a person needs before
either half means anything, and it is what a criterion can address.

Defaulted rather than required, because this row is also the due picker's in
the prototype's lab and a caller with no field to name should not have to
invent one.
*/
export function TimeRow({
  value,
  onSelect,
  onClear,
  label = "Time",
}: {
  value: string | null
  onSelect: (time: string) => void
  onClear: () => void
  label?: string
}) {
  const format = useTimeFormat()
  const twelve = format === "12"
  const clock = parseTime(value)
  const [open, setOpen] = useState<"hour" | "minute" | null>(null)

  /* With nothing set the controls still have to stand somewhere, and 09:00 is
     the assumption. Showing it never commits it, opening a picker must not
     quietly give a task a time it did not have. */
  const shown: Clock = clock ?? { hour: 9, minute: 0 }

  /* Each control changes one half of the clock and keeps the other, so it
     needs the value as it is now rather than as it was when the handler was
     made. Two commits inside one turn, an hour and a minute chosen faster
     than React re-renders, would otherwise see the second overwrite the
     first with a stale hour, and the hour would silently revert. */
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
    <div className="border-t border-[var(--color-graphite-200)] pt-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          Time
        </span>

        <div
          role="group"
          aria-label={label}
          className={cn(
            "flex items-center gap-0.5 rounded-md border px-1 py-0.5",
            clock
              ? "border-[var(--color-graphite-300)] bg-card"
              : "border-dashed border-[var(--color-graphite-300)] bg-[var(--color-graphite-25)]",
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
            className="text-[14px] leading-5 text-[var(--color-graphite-400)]"
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
            <div className="ml-1 flex overflow-hidden rounded-[5px] ring-1 ring-[var(--color-graphite-200)]">
              {(["AM", "PM"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={period === option}
                  onClick={() =>
                    commit({ hour: to24Hour(to12Hour(live.current.hour), option) })
                  }
                  className={cn(
                    "px-1.5 py-0.5 text-[11px] leading-4 font-medium transition-colors duration-[var(--duration-fast)]",
                    FOCUS,
                    period === option
                      ? "bg-[var(--color-graphite-900)] text-white"
                      : "bg-card text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)]",
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
            "shrink-0 rounded-md px-2 py-1 text-[12px] leading-4 transition-colors duration-[var(--duration-fast)]",
            FOCUS,
            clock
              ? "text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)]"
              : "bg-[var(--color-graphite-100)] font-medium text-[var(--color-graphite-800)]",
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
