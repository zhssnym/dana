/*
9.5's calendar mode for Planned, over Q3C.

The designer's `src/screens/planned-screen.tsx`, the `PlannedCalendar` and
`CalendarEvent` halves of it, ported at P8R session R9. His layout, his
spacing and his class strings are his; what changed is named here and nowhere
else, because RFC 0002 makes his prototype the source this client is built
from, so a silent difference between the two files is a defect in the port
rather than a decision.

**FullCalendar is gone, and this file is what replaces it.** 11.4's delta:
"the grid is Dana's own, a fixed six-week month of day cells with week and day
zooms, built from the designer's prototype." The library's own reasoning for
going is in that bullet and the RFC's alternatives section, and the part that
lands here is the last sentence of it: what is given up is the library's
accessibility and keyboard handling in the grid, which is now ours to hold.

**The grid roles are this port's own correction, and the prototype needs
them.** Measured against the running prototype on 2026-08-13, which is what
running it was for: zero `role="grid"`, zero `gridcell`, zero `row` and zero
`columnheader` in his month grid, which is composed of plain elements. 9.1's
roles table fixes a calendar day as "a grid cell within a grid", on the ground
that 9.5's month zoom is a fixed six-week grid of days, and AC-177 asserts the
grid, the forty-two cells and the seven column headers. AC-093's calendar row,
AC-098 and AC-158 each reach for a cell and would each fail without them. So
the roles are added rather than inherited, and the row elements carry the
layout: each week is its own seven-column CSS grid rather than the whole month
being one, because `display: contents` on a row is the other way to get the
same picture and it has a history of dropping the element out of the
accessibility tree, which is the one thing this markup exists to put in.

**Previous, next and today are named for what they do and not for what they
are showing.** 9.5 names three controls and 9.1's addressing sentence reaches
a control by its role and its name, so a control announcing itself as "Next
month" would be a control whose name changes with the zoom. His prototype
labels them "Previous period" and "Next period"; they are "Previous" and
"Next" here, which is what AC-098 and AC-177 ask for by name and what the
FullCalendar implementation this replaces already carried.

**A month cell draws seven lines and reveals the rest.** 9.5: "A day cell
showing fewer rows than the day holds carries a control reading '+N more' for
the remainder, which reveals them; the grid's constant height is what makes
the control necessary, a cell that grew to fit its contents being the thing
that height forbids." The number and how it was arrived at are at
`MONTH_CELL_LINES` below, because it is a measurement rather than a taste.

**Revealing is the day zoom, which is his own mechanism.** Pressing the
control moves the anchor to that day and switches the zoom to it, where the
cap does not apply and every row the day holds is drawn. The alternative, a
popover over the cell, hides the grid behind it and answers "what else is on
this day" with a second surface rather than with the one the calendar already
has.

**A ghost is a projection and is drawn as one.** 9.5 requires ghost styling
for virtual instances, and his treatment is a dashed outline, a transparent
fill, the quieter text colour and the repeat glyph in place of the folder dot.
AC-098 reads the computed style off the title of a ghost and off the title of
a real row and asserts they differ, which is what "ghost styling" has to mean
if it is to mean anything a reader can check. Clicking one opens the series'
current occurrence with 9.5's banner, and clicking a real row opens it
without: the banner rides the ghost path alone because the opened row shows a
date the person did not click.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder as FolderIcon,
  Plus,
  Repeat2,
} from 'lucide-react'

import { usePlannedCalendarView, useFolders } from '../../api/queries.js'
import { useUpdateTask } from '../../api/mutations.js'
import { showToast } from '../../state/toasts.js'
import { formatDueDate, presenterToday } from '../../parts/presenters.js'
import { openTaskForm } from '../../shell/overlays.js'
import { InlineError } from '../state-patterns.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/utils.js'
import { openTask } from '../task-open.js'
import {
  WEEKDAY_LABELS,
  datesFor,
  dayOfMonth,
  monthOf,
  periodTitle,
  shiftAnchor,
  weekdayIndex,
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
when the day holds seven or fewer, and six rows plus the "+N more" control
when it holds more. That is what makes the height constant, which is what 9.5
asks the layout for and the reason the control exists at all.

**Six rather than the designer's two, and the number came from measurement
rather than from taste.** His prototype slices a month cell at two, which his
fixtures never exceed. Ours draws a ghost per pending series per day, so what
fills a cell is the number of live repeats rather than the number of tasks
anybody filed on that date. Measured on 2026-08-13, on the seeded database the
browser leg runs against, at the moment AC-177 opens the month: forty-two
cells holding 3, 4, 5, 6 and 16 rows, thirty-three of them holding four, and
the six sixes being the Mondays that carry a weekly series on top of the daily
ones. Only one of those days was crowded on purpose and AC-177 asserts exactly
one overflow control, so any cap below six answers a month nobody crowded with
overflow controls on every Monday. Six is that measured maximum exactly: the
polish pass trimmed the seventh line the R9 session had left as headroom,
because the headroom bought nothing a person can see and cost every month
twenty-two pixels a week.

The cost that remains is a tall month, about 1030 pixels for six weeks, which
scrolls on a 720-pixel viewport where the designer's two-row cell did not. It
is the price of a calendar that shows a week of repeats without an overflow
control on every weekday, and it is flagged for the human visual review of
section 13 item 33: the durable fix is fewer projected rows per day, not a
shorter lid on the same stack.
*/
const MONTH_CELL_LINES = 6

const CELL_MIN_HEIGHT: Record<Zoom, string> = {
  // Padding and the day-number line, then MONTH_CELL_LINES rows of 20 with a
  // 2-pixel gap between them: 12 + 30 + 120 + 10.
  month: 'min-h-[172px]',
  week: 'min-h-[420px]',
  day: 'min-h-[480px]',
}

/** 9.5's three zooms, as the buttons above the grid label them. */
const ZOOM_LABEL: Record<Zoom, string> = { day: 'Day', week: 'Week', month: 'Month' }

/**
 * One row inside a day cell: his `CalendarEvent`.
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
  /* polish: places F6. A real, open row can be carried to another day; a
     ghost is a projection and has no date of its own to move. */
  const movable = !ghost && !completed && !abandoned

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
        'flex w-full items-center gap-1.5 overflow-hidden rounded-[4px] border border-transparent bg-[var(--color-graphite-25)] px-1.5 text-left text-[var(--color-graphite-700)] transition-[background-color,border-color] hover:border-[var(--color-graphite-200)] hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
        movable && 'cursor-grab active:cursor-grabbing',
        compact ? 'min-h-5 text-[10px] leading-3' : 'min-h-7 text-xs leading-4',
        completed && 'bg-white text-[var(--color-graphite-400)]',
        abandoned && 'bg-white text-[var(--color-graphite-500)] line-through',
        ghost &&
          'border-dashed border-[var(--color-graphite-300)] bg-transparent text-[var(--color-graphite-500)]',
      )}
      onClick={(mouse) => {
        mouse.stopPropagation()
        onOpen()
      }}
      aria-label={`${ghost ? 'Upcoming repeating occurrence: ' : ''}${event.title}`}
    >
      {ghost ? (
        <Repeat2 className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : completed ? (
        <Check className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : abandoned ? (
        <Ban className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : event.dueTime !== null ? (
        <Clock3 className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <FolderIcon
          className="size-3.5 shrink-0"
          style={event.folderColor === null ? undefined : { color: event.folderColor }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      {event.dueTime === null ? null : (
        <span className="shrink-0 text-[var(--color-graphite-500)]">
          {event.dueTime.slice(0, 5)}
        </span>
      )}
      <span className="truncate">{event.title}</span>
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
  /** polish: places F6. A row dropped here takes this date. */
  readonly onDropTask: (taskId: string) => void
}): React.JSX.Element {
  const [over, setOver] = useState(false)
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
  const outsideMonth = zoom === 'month' && monthOf(date) !== anchorMonth
  const weekend = zoom !== 'day' && column > 4

  return (
    <div
      role="gridcell"
      data-today={date === today ? 'true' : undefined}
      data-date={date}
      className={cn(
        'group/calendar-cell relative border-r border-b border-[var(--color-graphite-100)] p-1.5',
        CELL_MIN_HEIGHT[zoom],
        outsideMonth && 'bg-[var(--color-graphite-25)]',
        weekend && !outsideMonth && 'bg-[var(--color-graphite-25)]/35',
        lastColumn && 'border-r-0',
        lastRow && 'border-b-0',
        over && 'bg-[var(--color-graphite-100)]',
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
      The whole cell opens the form at this date: 9.5's "click on empty cell
      opens the form with that date", and 9.3's calendar row gives it that
      date, important off and Inbox, which the form resolves from the folder
      list as it does everywhere that table writes "Inbox". A button rather
      than a click handler on the cell, so the affordance is reachable by
      keyboard and announces what it does; it is painted beneath the rows, so
      a click on a row opens that task and never the form.
      */}
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-none text-left outline-none transition-colors hover:bg-[var(--color-graphite-50)]/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
        aria-label={`Create task on ${formatDueDate(date, today)}`}
        onClick={() => {
          openTaskForm({ due_date: date, important: false })
        }}
      />

      <div className="pointer-events-none relative z-10 mb-1.5 flex h-6 items-center justify-between">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-xs font-medium text-[var(--color-graphite-600)]',
            date === today && 'bg-[var(--color-graphite-900)] text-white',
            outsideMonth && date !== today && 'text-[var(--color-graphite-400)]',
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
          className="size-3.5 text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/calendar-cell:opacity-100 group-focus-within/calendar-cell:opacity-100"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <div className="relative z-10 space-y-0.5">
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
        {hidden > 0 ? (
          <button
            type="button"
            className="flex h-5 items-center rounded-[4px] px-1.5 text-[10px] font-semibold text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            onClick={onReveal}
          >
            +{hidden} more
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function PlannedCalendar(): React.JSX.Element {
  const today = presenterToday()
  /*
  The zoom is the account's (#140, #142), where it was `useState('month')`
  until 2026-09-04 and persisted nothing while 9.5 said it persisted.

  The anchor beside it stays component state and deliberately so: 9.5 makes
  the zoom a preference a person sets and expects to hold, and makes previous,
  next and today a way of moving around inside the period they are looking at.
  A remembered anchor would open a person on last week rather than on this one.

  The "+N more" reveal below is the third case and writes nothing: Imran ruled
  on the review of #140 that peeking at a crowded day is a look rather than a
  choice, so it sets a transient zoom that this page drops when it unmounts.
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
  polish: places F7. The month opened at its first week with today three
  weeks below the fold on the last day of a month; the grid scrolls today's
  row into view once, on arrival, and the person takes it from there.
  */
  const grid = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || view.data === undefined) return
    const cell = grid.current?.querySelector('[data-today="true"]')
    if (cell === null || cell === undefined) return
    scrolled.current = true
    cell.scrollIntoView({ block: 'center' })
  }, [view.data])

  /* polish: places F6: 7.6's PATCH of the due date, from a drop. */
  function moveTaskTo(taskId: string, date: string): void {
    const already = (view.data?.real ?? []).find(
      (row) => row.id === taskId && row.due_date === date,
    )
    if (already !== undefined) return
    update.mutate(
      { id: taskId, body: { due_date: date } },
      { onSuccess: () => showToast(`Moved to ${formatDueDate(date, today)}`) },
    )
  }

  const cells = useMemo(
    () => cellsByDate(view.data?.real ?? [], view.data?.virtual ?? [], folders.data ?? []),
    [view.data, folders.data],
  )

  const columns = zoom === 'day' ? 1 : 7
  const template = `repeat(${String(columns)}, minmax(0, 1fr))`
  const headers =
    zoom === 'day'
      ? [WEEKDAY_LABELS[weekdayIndex(anchor)] ?? WEEKDAY_LABELS[0]]
      : [...WEEKDAY_LABELS]
  const weeks = useMemo(() => {
    const rows: string[][] = []
    for (let at = 0; at < dates.length; at += columns) {
      rows.push(dates.slice(at, at + columns))
    }
    return rows
  }, [dates, columns])

  return (
    <div className="mt-5 mb-20 space-y-4">
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

      <div className="overflow-hidden rounded-[10px] border border-[var(--color-graphite-200)] bg-white">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-36 truncate px-2 text-base leading-6 font-semibold text-[var(--color-graphite-800)]">
              {periodTitle(zoom, anchor)}
            </h2>
            <Button
              variant="outline"
              className="h-[var(--control-height)] border-[var(--color-graphite-200)] bg-white px-3 text-[13px] font-medium text-[var(--color-graphite-700)] shadow-none hover:bg-[var(--color-graphite-50)]"
              onClick={() => {
                setAnchor(today)
              }}
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-graphite-200)] bg-white">
              <Button
                variant="ghost"
                size="icon"
                className="size-[var(--control-height)] rounded-none border-r border-[var(--color-graphite-200)] text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-900)]"
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
                className="size-[var(--control-height)] rounded-none text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-900)]"
                aria-label="Next"
                onClick={() => {
                  setAnchor((was) => shiftAnchor(zoom, was, 1))
                }}
              >
                <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>

            {/* `aria-pressed` is what carries the current zoom; the raised
                tone is a second cue and never the only one. */}
            <div
              className="flex h-11 items-center rounded-lg border border-[var(--color-graphite-200)] bg-white p-0.5"
              role="group"
              aria-label="Calendar zoom"
            >
              {CALENDAR_ZOOMS.map((level) => (
                <Button
                  key={level}
                  variant="ghost"
                  className={cn(
                    'h-[var(--control-height)] rounded-md px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)]',
                    zoom === level &&
                      'bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)] hover:bg-[var(--color-graphite-100)]',
                  )}
                  aria-pressed={zoom === level}
                  onClick={() => {
                    setCalendarZoom(level)
                  }}
                >
                  {ZOOM_LABEL[level]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div role="grid" aria-label="Scheduled calendar" className="bg-white" ref={grid}>
          <div
            role="row"
            className="grid border-b border-[var(--color-graphite-200)] bg-white"
            style={{ gridTemplateColumns: template }}
          >
            {headers.map((label) => (
              <div
                key={label}
                role="columnheader"
                /*
                The prototype's own correction, taken at S25 with its reason
                in its words: the weekday heads "read exactly as the date
                picker's do (`ui/calendar.tsx`): 11px medium in graphite-400,
                on a 28px row. They were 9px taller, semibold, uppercase and
                tracked, a second style for the same words, in the same
                product, two clicks apart." This client was wearing the style
                that correction replaced.
                */
                className="flex h-7 items-center px-2 text-[11px] leading-4 font-medium text-[var(--color-graphite-400)]"
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, row) => (
            <div
              key={week[0] ?? ''}
              role="row"
              className="grid"
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
                    // 9.5's reveal: the day zoom draws every row the day
                    // holds. It changes what is drawn and never the account
                    // (Imran, on the review of #140): a person looking at one
                    // crowded day has not chosen a zoom, and a look that
                    // rewrote the preference would follow them to every device
                    // they own. `lib/calendar-zoom.ts` carries the ruling.
                    setAnchor(date)
                    revealCalendarZoom('day')
                  }}
                  onDropTask={(taskId) => {
                    moveTaskTo(taskId, date)
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
