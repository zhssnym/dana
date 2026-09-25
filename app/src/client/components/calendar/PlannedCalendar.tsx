/*
9.5's calendar mode for Planned, over Q3C.

**The grid is Dana's own** (11.4): "a fixed six-week month of day cells with
week and day zooms". What is given up with a calendar library is its
accessibility and keyboard handling in the grid, which is ours to hold.

**The grid roles are required.** 9.1's roles table fixes a calendar day as "a
grid cell within a grid", on the ground that 9.5's month zoom is a fixed
six-week grid of days, and AC-177 asserts the grid, the forty-two cells and the
seven column headers. AC-093, AC-098 and AC-158 each reach for a cell. The row
elements carry the layout: each week is its own seven-column CSS grid rather
than the whole month being one, because `display: contents` on a row is the
other way to get the same picture and it has a history of dropping the element
out of the accessibility tree, which is the one thing this markup exists to put
in.

**Previous, next and today are named for what they do and not for what they are
showing.** 9.5 names three controls and 9.1's addressing sentence reaches a
control by its role and its name, so a control announcing itself as "Next month"
would be a control whose name changes with the zoom. They are "Previous" and
"Next", which is what AC-098 and AC-177 ask for by name.

**A month cell draws a fixed number of lines and reveals the rest.** 9.5: "A day
cell showing fewer rows than the day holds carries a control reading '+N more'
for the remainder, which reveals them; the grid's constant height is what makes
the control necessary, a cell that grew to fit its contents being the thing that
height forbids." The number and how it was arrived at are at `MONTH_CELL_LINES`
below, because it is a measurement rather than a taste.

**Revealing is the day zoom.** Pressing the control moves the anchor to that day
and switches the zoom to it, where the cap does not apply and every row the day
holds is drawn. A popover over the cell would hide the grid behind it and answer
"what else is on this day" with a second surface rather than with the one the
calendar already has.

**A ghost is a projection and is drawn as one.** 9.5 requires ghost styling for
virtual instances: a dashed outline, a transparent fill, the quieter text colour
and the repeat glyph in place of the folder dot. AC-098 reads the computed style
off the title of a ghost and off the title of a real row and looks for a
difference, which is what "ghost styling" has to mean if it is to mean anything
a reader can check. Clicking one opens the series' current occurrence with 9.5's
banner, and clicking a real row opens it without: the banner rides the ghost
path alone because the opened row shows a date the person did not click.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat2,
} from '../../lib/icons.js'

import { usePlannedCalendarView, useFolders } from '../../api/queries.js'
import { useUpdateTask } from '../../api/mutations.js'
import { formatDueDate, presenterToday } from '../../parts/presenters.js'
import { shiftedSchedule } from '../../parts/schedule.js'
import { InlineError } from '../state-patterns.js'
import { Button } from '../ui/button.js'
import { Segmented } from '../ui/segmented.js'
import { cn } from '../ui/utils.js'
import { formatClockTime } from '../../lib/dates.js'
import { useTimeFormat } from '../../lib/time-format.js'
import { openTask } from '../task-open.js'
import {
  WEEKDAY_LABELS,
  datesFor,
  dayOfMonth,
  monthOf,
  periodTitle,
  shiftAnchor,
} from './grid.js'
import type { Zoom } from './grid.js'
import { cellsByDate } from './order.js'
import type { CellEvent } from './order.js'
/* 9.5's zoom is 4.10's `calendar_zoom` since issue #140, so the strip below
   reads and writes the account rather than component state. The list of zooms
   is the shared one; `lib/calendar-zoom.ts` carries the reasoning and the
   compile-time check that it and `Zoom` above are the same three strings. */
import { CALENDAR_ZOOMS } from '../../../shared/bundle.js'
import {
  clearRevealedZoom,
  revealCalendarZoom,
  setCalendarZoom,
  useCalendarZoom,
} from '../../lib/calendar-zoom.js'

/*
How many lines a month cell draws, and it is measured rather than chosen.

A cell renders exactly this many lines whether it overflows or not: seven rows
when the day holds seven or fewer, and six rows plus the "+N more" control when
it holds more. That is what makes the height constant, which is what 9.5 asks
the layout for and the reason the control exists at all.

**Why six.** A ghost is drawn per pending series per day, so what fills a cell
is the number of live repeats rather than the number of tasks anybody filed on
that date. On the seeded database the browser tests run against, at the moment
AC-177 opens the month, the cells hold 3, 4, 5, 6 and 16 rows, the sixes being
the Mondays that carry a weekly series on top of the daily ones. AC-177 asserts
exactly one overflow control, so any cap below six answers a month nobody
crowded with overflow controls on every Monday. Six is that maximum exactly;
headroom above it buys nothing a person can see and costs every month twenty-two
pixels a week.

The cost that remains is a tall month, about 1030 pixels for six weeks, which
scrolls on a 720-pixel viewport. The durable fix is fewer projected rows per
day, not a shorter lid on the same stack.
*/
const MONTH_CELL_LINES = 6

const CELL_MIN_HEIGHT: Record<Zoom, string> = {
  // Padding and the day-number line, then MONTH_CELL_LINES rows of 20 with a
  // 2-pixel gap between them: 12 + 30 + 120 + 10.
  month: 'min-h-[172px] max-sm:min-h-16',
  week: 'min-h-[420px]',
  day: 'min-h-[480px]',
}

/** 9.5's three zooms, as the buttons above the grid label them. */
const ZOOM_LABEL: Record<Zoom, string> = { day: 'Day', week: 'Week', month: 'Month' }

/**
 * One row inside a day cell: `CalendarEvent`.
 *
 * The glyph reports what the row is before the title is read: the repeat mark
 * for a projection, the check for a completed row and the ban for an abandoned
 * one, which are Q3C's three renderings ("Pending renders normal, completed
 * faded and checked, abandoned faded and struck"), the clock for a timed row
 * and the folder dot for everything else.
 */
function CalendarEvent({
  event,
  compact,
  onOpen,
}: {
  readonly event: CellEvent
  readonly compact: boolean
  readonly onOpen: () => void
}): React.JSX.Element {
  const ghost = event.kind === 'ghost'
  const completed = event.status === 'completed'
  const abandoned = event.status === 'abandoned'
  /* A real, open row can be carried to another day; a ghost is a projection and
     has no date of its own to move. `moves` says which end a drop writes, and a
     Start+Due pair moves whole. */
  const movable = !ghost && !completed && !abandoned && event.moves !== null
  const clock = useTimeFormat()

  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={
        movable
          ? (drag) => {
              drag.dataTransfer.setData('text/plain', event.taskId)
              drag.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
      className={cn(
        '@container flex w-full items-center gap-1.5 overflow-hidden rounded-sm border border-transparent bg-muted px-1.5 text-left text-foreground transition-[background-color,border-color] hover:border-border hover:bg-background focus-visible:outline-none',
        movable && 'cursor-grab active:cursor-grabbing',
        compact ? 'min-h-5 text-xs' : 'min-h-7 text-xs leading-4',
        completed && 'bg-background text-muted-foreground',
        abandoned && 'bg-background text-muted-foreground line-through',
        ghost &&
          'border-dashed border-border bg-transparent text-muted-foreground',
      )}
      onClick={(mouse) => {
        mouse.stopPropagation()
        onOpen()
      }}
      aria-label={`${ghost ? 'Upcoming repeating occurrence: ' : ''}${event.title}`}
      title={event.dueTime === null ? event.title : `${event.title}, ${formatClockTime(event.dueTime, clock)}`}
    >
      {ghost ? (
        <Repeat2 className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : completed ? (
        <Check className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : abandoned ? (
        <Ban className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        /* The folder dot: a narrow month cell spends its width on the title,
           and a timed row's time already says it is timed. */
        <span
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
          style={event.folderColor === null ? undefined : { backgroundColor: event.folderColor }}
          aria-hidden="true"
        />
      )}
      {/* The title first: in a narrow month cell it is what says which task
          this is, and the time after it is the part that may be cut. */}
      <span className="min-w-0 truncate">{event.title}</span>
      {event.dueTime === null ? null : (
        <span
          className={cn(
            'ml-auto shrink-0 text-muted-foreground tabular-nums',
            /* The title says which task this is, so the time shows only where
               the chip has room for both, at every zoom; the chip's tooltip
               always says it. */
            'hidden @[9rem]:inline',
          )}
        >
          {formatClockTime(event.dueTime, clock)}
        </span>
      )}
    </button>
  )
}

/** One day: 9.1's grid cell, and every affordance 9.5 puts on a day. */
function DayCell({
  date,
  zoom,
  today,
  anchorMonth,
  column,
  lastColumn,
  lastRow,
  events,
  onReveal,
  onDropTask,
  onCreate,
}: {
  readonly date: string
  readonly zoom: Zoom
  readonly today: string
  readonly anchorMonth: string
  readonly column: number
  readonly lastColumn: boolean
  readonly lastRow: boolean
  readonly events: readonly CellEvent[]
  readonly onReveal: () => void
  /** A row dropped here takes this date. */
  readonly onDropTask: (taskId: string) => void
  /** Makes a task due on this day; absent, the cell makes nothing. */
  readonly onCreate?: (title: string) => void
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  const [drafting, setDrafting] = useState(false)
  /*
  The control takes the last line rather than a line of its own, so a cell
  that overflows is exactly as tall as one that does not. Reserving a line
  that most cells never use would waste it on every cell of the month; adding
  one only where it is needed would make that week's row taller than the
  others, which is the growth the constant height forbids.
  */
  const overflows = zoom === 'month' && events.length > MONTH_CELL_LINES
  const visible = overflows ? events.slice(0, MONTH_CELL_LINES - 1) : events
  const hidden = events.length - visible.length
  /* A phone draws the week as an agenda, one day per line, so titles stay
     whole. */
  const agenda = zoom === 'week' 
  const outsideMonth = zoom === 'month' && monthOf(date) !== anchorMonth
  const weekend = zoom !== 'day' && column > 4

  return (
    <div
      role="gridcell"
      data-today={date === today ? 'true' : undefined}
      data-date={date}
      className={cn(
        'group/calendar-cell relative border-r border-b border-border p-1.5',
        CELL_MIN_HEIGHT[zoom],
        outsideMonth && 'bg-muted',
        weekend && !outsideMonth && 'bg-muted/40',
        lastColumn && 'border-r-0',
        lastRow && 'border-b-0',
        agenda && 'max-sm:min-h-14 max-sm:border-r-0',
        agenda && !lastColumn && 'max-sm:border-b',
        over && 'bg-muted',
      )}
      onDragOver={(drag) => {
        if (!drag.dataTransfer.types.includes('text/plain')) return
        drag.preventDefault()
        drag.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={() => {
        setOver(false)
      }}
      onDrop={(drag) => {
        drag.preventDefault()
        setOver(false)
        const taskId = drag.dataTransfer.getData('text/plain')
        if (taskId !== '') onDropTask(taskId)
      }}
    >
      {/*
      The whole cell makes a task on this date, in place: 9.5's "click on empty
      cell" with that date as the due date. It opens a "New task" line inside
      the cell, the same inline row every list ends in, so there is no form to
      leave. A button rather than a click handler on the cell, so the
      affordance is reachable by keyboard and announces what it does; it is
      painted beneath the rows, so a click on a row opens that task.
      */}
      {onCreate === undefined ? null : (
        <button
          type="button"
          className="absolute inset-0 z-0 rounded-none text-left outline-none transition-colors hover:bg-muted/70"
          aria-label={`New task on ${formatDueDate(date, today)}`}
          onClick={() => {
            setDrafting(true)
          }}
        />
      )}

      <div
        className={cn(
          'pointer-events-none relative z-10 mb-1.5 flex h-6 items-center justify-between',
          /* The day zoom's title already names its one day. */
          zoom === 'day' && 'hidden',
          /* The agenda has no column heads, so each line names its weekday.
             A pseudo-element, so the cell's text still starts with the day. */
          agenda &&
            'max-sm:justify-start max-sm:gap-1 max-sm:before:text-xs max-sm:before:font-medium max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-weekday)]',
        )}
        data-weekday={agenda ? WEEKDAY_LABELS[column] : undefined}
      >
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-xs font-medium text-muted-foreground',
            date === today && 'bg-primary text-primary-foreground',
            outsideMonth && date !== today && 'text-muted-foreground',
          )}
        >
          {/*
          The trailing space is load-bearing and is measured rather than
          stylistic. A cell's text is the concatenation of its descendants'
          text with no separator inserted anywhere, so a cell holding the
          fifth of the month and a row reads "5ac-098 daily series" as one
          string and the day number stops being a word: any reader, a
          person's eye included once the cell is narrow, loses the boundary
          between the number and the first row. AC-093 and AC-098 address a
          cell by the day it draws, which is what a word boundary makes
          possible. The FullCalendar implementation this replaces carried the
          same fix in the same words; the port dropped it and three cases of
          AC-098 went red on the first measurement, which is what recorded it
          here a second time. Trailing white space is removed at the end of a
          line, so nothing about the number moves.
          */}
          {dayOfMonth(date)}{' '}
        </span>
        <Plus
          className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/calendar-cell:opacity-100 group-focus-within/calendar-cell:opacity-100"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      {/* A phone's month cell is a letter wide, so it says how many tasks the
          day holds and opens that day, rather than cutting every title to one
          letter. */}
      {zoom === 'month' && events.length > 0 ? (
        <button
          type="button"
          className="relative z-10 flex h-5 items-center rounded-sm px-1 text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          aria-label={`${String(events.length)} ${events.length === 1 ? 'task' : 'tasks'} on ${formatDueDate(date, today)}`}
          onClick={onReveal}
        >
          {events.length}
        </button>
      ) : null}
      <div className={cn('relative z-10 space-y-0.5', zoom === 'month' && 'max-sm:hidden')}>
        {visible.map((event) => (
          <CalendarEvent
            key={event.key}
            event={event}
            compact={zoom === 'month'}
            onOpen={() => {
              // 9.5: a ghost opens the series' current occurrence, and the
              // banner rides that path alone.
              openTask(event.taskId, { upcoming: event.kind === 'ghost' })
            }}
          />
        ))}
        {drafting && onCreate !== undefined ? (
          <CellDraft
            label={`New task on ${formatDueDate(date, today)}`}
            onAdd={onCreate}
            onDone={() => {
              setDrafting(false)
            }}
          />
        ) : null}
        {hidden > 0 ? (
          <button
            type="button"
            className="flex h-5 items-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none"
            onClick={onReveal}
          >
            +{hidden} more
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** The in-cell "New task" line: Enter makes it, Escape or leaving empty closes it. */
function CellDraft({
  label,
  onAdd,
  onDone,
}: {
  readonly label: string
  readonly onAdd: (title: string) => void
  readonly onDone: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  /* Enter, Escape and blur each end the line; only the first one counts. */
  const ended = useRef(false)
  function end(keep: boolean): void {
    if (ended.current) return
    ended.current = true
    const next = title.trim()
    if (keep && next !== '') onAdd(next)
    onDone()
  }
  return (
    <input
      autoFocus
      value={title}
      maxLength={300}
      placeholder="New task"
      aria-label={label}
      className="h-5 w-full min-w-0 rounded-sm bg-background px-1.5 text-xs text-foreground outline-none ring-1 ring-border placeholder:text-muted-foreground"
      onChange={(event) => {
        setTitle(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          end(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          end(false)
        }
      }}
      onBlur={() => {
        end(true)
      }}
    />
  )
}

export function PlannedCalendar({
  onCreate,
}: {
  /** Makes a task due on the given day; the page supplies its own capture. */
  readonly onCreate?: (title: string, date: string) => void
} = {}): React.JSX.Element {
  const today = presenterToday()
  /*
  The zoom is the account's (#140, #142), as 9.5 says it persists.

  The anchor beside it stays component state and deliberately so: 9.5 makes the
  zoom a preference a person sets and expects to hold, and makes previous, next
  and today a way of moving around inside the period they are looking at. A
  remembered anchor would open a person on last week rather than on this one.

  The "+N more" reveal below is the third case and writes nothing: peeking at a
  crowded day is a look rather than a choice, so it sets a transient zoom that
  this page drops when it unmounts.
  */
  const zoom = useCalendarZoom()
  const [anchor, setAnchor] = useState<string>(today)

  /* 9.5's "leaves the page": a reveal lasts as long as the calendar is on
     screen and never longer, so nothing a person peeked at follows them to the
     next page or the next visit. */
  useEffect(() => clearRevealedZoom, [])

  const dates = useMemo(() => datesFor(zoom, anchor), [zoom, anchor])
  /*
  The range is the client's to request and Q3C answers whatever inclusive
  range it receives (9.5). It is read off the days actually laid out rather
  than computed a second time, so the grid and the request cannot disagree
  about the weeks around a month boundary. Six weeks is 42 days and never
  approaches Q3C's 62-day refusal.
  */
  const start = dates[0] ?? anchor
  const end = dates[dates.length - 1] ?? anchor

  const view = usePlannedCalendarView(start, end)
  const folders = useFolders()
  const update = useUpdateTask()
  /*
  The grid scrolls today's row into view once, on arrival, and the person takes
  it from there; otherwise a month opened on its last day would show today three
  weeks below the fold. Only as far as needed ("nearest"), so a today already
  on screen leaves the month's title and controls where they are.
  */
  const grid = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || view.data === undefined) return
    const cell = grid.current?.querySelector('[data-today="true"]')
    if (cell === null || cell === undefined) return
    scrolled.current = true
    /* Only when today's cell is not wholly on screen: a row showing just its
       day numbers at the bottom edge hides the tasks it is opened for. */
    if (cell.getBoundingClientRect().bottom <= window.innerHeight) return
    cell.scrollIntoView({ block: 'nearest' })
  }, [view.data])

  /*
  A day cell holds only rows on their own day: a task on its Due Date, or on
  its Start Date when it has no Due Date. So a day holds the same tasks at
  every zoom, and a phone's count is what the day it opens lists. A span whose
  own day is off this grid is "running" (order.ts) and is listed once above
  the grid instead of on a day that would read as its deadline, until 9.5's
  span bar exists.
  */
  const { cells, running } = useMemo(() => {
    const placed = cellsByDate(view.data?.real ?? [], view.data?.virtual ?? [], folders.data ?? [], {
      start,
      end,
    })
    const through: CellEvent[] = []
    const own = new Map<string, CellEvent[]>()
    for (const [day, events] of placed) {
      own.set(day, events.filter((event) => !event.running))
      through.push(...events.filter((event) => event.running))
    }
    through.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
    return { cells: own, running: through }
  }, [view.data, folders.data, start, end])

  /*
  7.6's PATCH of the Schedule, from a drop (Q3C, issue #216): a Due-only row
  moves its Due Date, a Start-only row its Start Date, and a Start+Due pair
  moves whole by the days between the cell it was drawn on and the cell it
  landed on, so its span is kept. `shiftedSchedule` holds the rule.
  */
  function moveTaskTo(taskId: string, date: string): void {
    const row = (view.data?.real ?? []).find((card) => card.id === taskId)
    if (row === undefined) return
    let from: string | null = null
    for (const [day, events] of cells) {
      if (events.some((event) => event.kind === 'real' && event.taskId === taskId)) from = day
    }
    const body = shiftedSchedule(row, from ?? date, date)
    if (body === null) return
    // The card moving is the answer; success says nothing.
    update.mutate({ id: taskId, body })
  }

  const columns = zoom === 'day' ? 1 : 7
  const template = `repeat(${String(columns)}, minmax(0, 1fr))`
  const weeks = useMemo(() => {
    const rows: string[][] = []
    for (let at = 0; at < dates.length; at += columns) {
      rows.push(dates.slice(at, at + columns))
    }
    return rows
  }, [dates, columns])

  return (
    /* The calendar takes the page's whole width, not the reading column: a
       month of seven columns in 690px cut every title to a few letters.
       `100cqw` is the scroll region's width (`tokens.css`), and the gutter
       matches the shell's own padding. */
    <div
      className="mt-5 mb-20 space-y-4 [--calendar-gutter:1rem] md:[--calendar-gutter:2.5rem]"
      style={{ marginInline: 'min(0px, calc(50% - 50cqw + var(--calendar-gutter)))' }}
    >
      {/*
      9.1's inline failed-read line, beside the thing that failed. The grid
      still draws underneath it: Q3C's empty state is the bare grid and a
      failed read is a different state from an empty one, which is the whole
      distinction that string exists to make.
      */}
      {view.status === 'error' ? (
        <InlineError
          onRetry={() => {
            void view.refetch()
          }}
        />
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-36 truncate px-2 text-sm leading-6 font-section text-foreground">
              {periodTitle(zoom, anchor, today)}
            </h2>
            <Button
              variant="outline"
              className="h-[var(--control-height)] border-border bg-background px-3 text-sm font-medium text-foreground shadow-none hover:bg-muted"
              onClick={() => {
                setAnchor(today)
              }}
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border bg-background">
              <Button
                variant="ghost"
                size="icon"
                className="size-[var(--control-height)] rounded-none border-r border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Previous"
                onClick={() => {
                  setAnchor((was) => shiftAnchor(zoom, was, -1))
                }}
              >
                <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-[var(--control-height)] rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Next"
                onClick={() => {
                  setAnchor((was) => shiftAnchor(zoom, was, 1))
                }}
              >
                <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>

            <Segmented
              label="Calendar zoom"
              value={zoom}
              options={CALENDAR_ZOOMS.map((level) => ({ value: level, label: ZOOM_LABEL[level] }))}
              onValueChange={(level) => {
                setCalendarZoom(level)
              }}
            />
          </div>
        </div>

        {running.length > 0 ? (
          <div className="border-b border-border px-2 py-2">
            <p className="px-1.5 pb-1 text-xs text-muted-foreground">Also running</p>
            <div className={cn('grid gap-0.5', zoom === 'day' ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4')}>
              {running.map((event) => (
                <CalendarEvent
                  key={event.key}
                  event={{ ...event, moves: null }}
                  compact={false}
                  onOpen={() => {
                    openTask(event.taskId, { upcoming: false })
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div role="grid" aria-label="Upcoming calendar" className="bg-background" ref={grid}>
          {zoom === 'day' ? null : (
          <div
            role="row"
            className={cn('grid border-b border-border bg-background', zoom === 'week' && 'max-sm:hidden')}
            style={{ gridTemplateColumns: template }}
          >
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                role="columnheader"
                /*
                The weekday heads read exactly as the date picker's do
                (`ui/calendar.tsx`): 11px medium in graphite-400, on a 28px row,
                rather than a second style for the same words, in the same
                product, two clicks apart.
                */
                className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          )}

          {weeks.map((week, row) => (
            <div
              key={week[0] ?? ''}
              role="row"
              className={cn('grid', zoom === 'week' && 'max-sm:grid-cols-1!')}
              style={{ gridTemplateColumns: template }}
            >
              {week.map((date, column) => (
                <DayCell
                  key={date}
                  date={date}
                  zoom={zoom}
                  today={today}
                  anchorMonth={monthOf(anchor)}
                  column={column}
                  lastColumn={column === week.length - 1}
                  lastRow={row === weeks.length - 1}
                  events={cells.get(date) ?? []}
                  onReveal={() => {
                    // 9.5's reveal: the day zoom draws every row the day holds.
                    // It changes what is drawn and never the account (#140): a
                    // person looking at one crowded day has not chosen a zoom,
                    // and a look that rewrote the preference would follow them
                    // to every device they own. `lib/calendar-zoom.ts` carries
                    // the rule.
                    setAnchor(date)
                    revealCalendarZoom('day')
                  }}
                  onDropTask={(taskId) => {
                    moveTaskTo(taskId, date)
                  }}
                  {...(onCreate === undefined
                    ? {}
                    : {
                        onCreate: (title: string) => {
                          onCreate(title, date)
                        },
                      })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
