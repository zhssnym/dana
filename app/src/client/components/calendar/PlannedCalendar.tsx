/*
The shared Upcoming and Work Calendar over Q3C.

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
import { useIsMobile } from '../ui/use-mobile.js'
import { cn } from '../ui/utils.js'
import { formatClockTime } from '../../lib/dates.js'
import { useTimeFormat } from '../../lib/time-format.js'
import { taskFilterActive, taskMatchesFilter } from '../../views/filter.js'
import type { TaskFilter } from '../../views/filter.js'
import type { TaskCard } from '../../../shared/tasks.js'
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
import { readCalendarDrag, weekRanges, writeCalendarDrag } from './ranges.js'
import type { CalendarDrag, WeekRange } from './ranges.js'
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
Three lines including any continuous range bars keep a six-week month compact.
The last line becomes "+N more" when the day holds more; opening the day
reveals every Task and projected occurrence. On a phone the month uses dots
and tapping the day reveals it, so it needs no overflow line.
*/
const MONTH_CELL_LINES = 3

const CELL_MIN_HEIGHT: Record<Zoom, string> = {
  // The minimum height is a token shared by both calendar homes.
  month: 'min-h-[var(--calendar-month-cell-height)] max-sm:min-h-16',
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
 * faded and checked, abandoned faded and struck"). Work uses a neutral dot;
 * Upcoming may use the page colour.
 */
function CalendarEvent({
  event,
  compact,
  dense,
  onOpen,
  scoped,
  editable,
}: {
  readonly event: CellEvent
  readonly compact: boolean
  /** A phone's month (m2): the glyph alone, and the cell is what a tap reaches. */
  readonly dense: boolean
  readonly onOpen: () => void
  readonly scoped: boolean
  readonly editable: boolean
}): React.JSX.Element {
  const ghost = event.kind === 'ghost'
  const completed = event.status === 'completed'
  const abandoned = event.status === 'abandoned'
  const clock = useTimeFormat()
  const glyph = ghost ? (
    <Repeat2 className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
  ) : completed ? (
    <Check className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
  ) : abandoned ? (
    <Ban className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
  ) : (
    /* Upcoming distinguishes pages by colour; Work is already one page. */
    <span
      className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
      style={scoped || event.folderColor === null ? undefined : { backgroundColor: event.folderColor }}
      aria-hidden="true"
    />
  )
  if (dense) {
    return (
      <span className="flex size-3 items-center justify-center text-muted-foreground" aria-hidden="true">
        {glyph}
      </span>
    )
  }
  /* A real, open row can be carried to another day; a ghost is a projection and
     has no date of its own to move. `moves` says which end a drop writes, and a
     Start+Due pair moves whole. */
  const movable = editable && !ghost && !completed && !abandoned && event.moves !== null
  const edge = event.moves === 'due_date' ? 'start' : event.moves === 'start_date' ? 'due' : null

  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={
        movable
          ? (drag) => {
              writeCalendarDrag(drag.dataTransfer, { taskId: event.taskId, action: 'move', from: event.date })
            }
          : undefined
      }
      className={cn(
        '@container relative flex w-full gap-1.5 overflow-hidden rounded-sm border border-transparent bg-muted px-1.5 text-left text-foreground transition-[background-color,border-color] hover:border-border hover:bg-background focus-visible:outline-none',
        movable && 'cursor-grab active:cursor-grabbing',
        /* A week or a day has the height to spare, so a title takes two lines
           there rather than three letters (m2). */
        compact ? 'min-h-5 items-center text-xs' : 'min-h-7 items-start py-1.5 text-xs leading-4',
        completed && 'bg-background text-muted-foreground',
        abandoned && 'bg-background text-muted-foreground line-through',
        ghost &&
          'border-dashed border-border bg-transparent text-muted-foreground',
      )}
      onClick={(mouse) => {
        mouse.stopPropagation()
        onOpen()
      }}
      aria-label={`${ghost ? scoped ? 'Repeating occurrence: ' : 'Upcoming repeating occurrence: ' : ''}${event.title}`}
      title={event.dueTime === null ? event.title : `${event.title}, ${formatClockTime(event.dueTime, clock)}`}
    >
      <span className="flex h-4 shrink-0 items-center">{glyph}</span>
      {compact ? (
        <>
          {/* A month cell is narrow: the title first, since it says which task
              this is, and the time after it only where the chip has room for
              both; the chip's tooltip always says it. */}
          <span className="min-w-0 truncate">{event.title}</span>
          {event.dueTime === null ? null : (
            <span className="ml-auto hidden shrink-0 text-muted-foreground tabular-nums @[9rem]:inline">
              {formatClockTime(event.dueTime, clock)}
            </span>
          )}
        </>
      ) : (
        /* A week or a day has height to spare: the time above the title. */
        <span className="flex min-w-0 flex-col">
          {event.dueTime === null ? null : (
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatClockTime(event.dueTime, clock)}
            </span>
          )}
          <span className="line-clamp-2 break-words">{event.title}</span>
        </span>
      )}
      {edge !== null && movable ? <span
        draggable
        aria-hidden="true"
        className={cn('absolute inset-y-0 z-10 w-2 cursor-ew-resize bg-foreground/15 opacity-0 group-hover/calendar-cell:opacity-100', edge === 'start' ? 'left-0' : 'right-0')}
        onDragStart={(drag) => {
          drag.stopPropagation()
          writeCalendarDrag(drag.dataTransfer, { taskId: event.taskId, action: edge, from: event.date })
        }}
        onClick={(click) => click.stopPropagation()}
      /> : null}
    </button>
  )
}

/** One continuous Schedule span in this week, with its draggable ends. */
function RangeBar({ range, week, zoom, editable }: { readonly range: WeekRange; readonly week: readonly string[]; readonly zoom: Zoom; readonly editable: boolean }): React.JSX.Element {
  const { task } = range
  const movable = editable && task.status === 'pending'
  const length = range.last - range.first + 1
  const startDrag = (transfer: DataTransfer, action: CalendarDrag['action'], from: string): void => {
    writeCalendarDrag(transfer, { taskId: task.id, action, from })
  }
  return <div
    className={cn('group/range pointer-events-auto relative min-w-0', zoom === 'week' && 'max-sm:col-span-7!')}
    style={{ gridColumn: `${range.first + 1} / ${range.last + 2}`, gridRow: range.lane + 1 }}
  >
    <button
      type="button"
      draggable={movable}
      aria-label={`${task.title}, ${task.start_date ?? ''} to ${task.due_date ?? ''}`}
      title={`${task.title}, ${task.start_date ?? ''} to ${task.due_date ?? ''}`}
      className={cn(
        'flex h-5 w-full min-w-0 items-center rounded-sm bg-muted px-2 text-left text-xs text-foreground hover:bg-accent',
        movable && 'cursor-grab active:cursor-grabbing',
        task.status === 'completed' && 'bg-background text-muted-foreground',
        task.status === 'abandoned' && 'bg-background text-muted-foreground line-through',
      )}
      onClick={() => openTask(task.id, { upcoming: false })}
      onDragStart={movable ? (drag) => {
        const bounds = drag.currentTarget.getBoundingClientRect()
        const offset = Math.max(0, Math.min(length - 1, Math.floor((drag.clientX - bounds.left) / (bounds.width / length))))
        startDrag(drag.dataTransfer, 'move', week[range.first + offset] ?? week[range.first] ?? '')
      } : undefined}
    >
      {task.status === 'completed' ? <Check className="mr-1 size-3 shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{task.title}</span>
    </button>
    {movable && range.begins ? <span
      draggable
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/15 opacity-0 group-hover/range:opacity-100"
      onDragStart={(drag) => { drag.stopPropagation(); startDrag(drag.dataTransfer, 'start', task.start_date ?? '') }}
    /> : null}
    {movable && range.ends ? <span
      draggable
      aria-hidden="true"
      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/15 opacity-0 group-hover/range:opacity-100"
      onDragStart={(drag) => { drag.stopPropagation(); startDrag(drag.dataTransfer, 'due', task.due_date ?? '') }}
    /> : null}
  </div>
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
  dense,
  onReveal,
  onDropTask,
  hiddenRanges,
  rangeLanes,
  editable,
  onCreate,
  scoped,
}: {
  readonly date: string
  readonly zoom: Zoom
  /** A phone's month: dots, and a tap shows the day rather than adding to it. */
  readonly dense: boolean
  readonly today: string
  readonly anchorMonth: string
  readonly column: number
  readonly lastColumn: boolean
  readonly lastRow: boolean
  readonly events: readonly CellEvent[]
  readonly onReveal: () => void
  /** A row dropped here takes this date. */
  readonly onDropTask: (drag: CalendarDrag) => void
  readonly hiddenRanges: number
  readonly rangeLanes: number
  readonly editable: boolean
  /** Makes a task due on this day; absent, the cell makes nothing. */
  readonly onCreate?: (title: string) => void
  readonly scoped: boolean
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
  const overflows = !dense && zoom === 'month' && events.length + hiddenRanges + rangeLanes > MONTH_CELL_LINES
  const visible = overflows ? events.slice(0, Math.max(0, MONTH_CELL_LINES - 1 - rangeLanes)) : events
  const hidden = events.length - visible.length + hiddenRanges
  /* A phone draws the week as an agenda, one day per line, so titles stay
     whole. */
  const agenda = zoom === 'week'
  const outsideMonth = zoom === 'month' && monthOf(date) !== anchorMonth

  return (
    <div
      role="gridcell"
      data-today={date === today ? 'true' : undefined}
      data-date={date}
      className={cn(
        'group/calendar-cell relative border-r border-b border-border p-1.5',
        /* One tint, for the one thing it says (m2): a drop target. Weekends
           and the neighbouring months' days are told apart by their numbers. */
        dense ? 'min-h-16 overflow-hidden' : CELL_MIN_HEIGHT[zoom],
        lastColumn && 'border-r-0',
        lastRow && 'border-b-0',
        agenda && 'max-sm:min-h-14 max-sm:border-r-0',
        agenda && !lastColumn && 'max-sm:border-b',
        over && 'bg-muted',
      )}
      onDragOver={(drag) => {
        if (!editable) return
        if (!drag.dataTransfer.types.includes('text/plain')) return
        drag.preventDefault()
        drag.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={() => {
        setOver(false)
      }}
      onDrop={(drag) => {
        if (!editable) return
        drag.preventDefault()
        setOver(false)
        const task = readCalendarDrag(drag.dataTransfer)
        if (task !== null) onDropTask(task)
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
      {dense ? (
        <button
          type="button"
          className="absolute inset-0 z-0 rounded-none text-left outline-none"
          aria-label={`Show ${formatDueDate(date, today)}`}
          onClick={onReveal}
        />
      ) : onCreate === undefined ? null : (
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
            outsideMonth && 'text-quiet-foreground',
            date === today && 'bg-primary text-primary-foreground',
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
          className="size-3.5 text-muted-foreground max-sm:hidden opacity-0 transition-opacity group-hover/calendar-cell:opacity-100 group-focus-within/calendar-cell:opacity-100"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      {rangeLanes > 0 ? <div
        aria-hidden="true"
        className={agenda && column > 0 ? 'max-sm:hidden' : undefined}
        style={{ height: `calc(var(--calendar-range-lane-height) * ${String(rangeLanes)})` }}
      /> : null}

      <div className={cn('relative z-10', dense ? 'pointer-events-none flex flex-wrap gap-0.5' : 'space-y-0.5')}>
        {visible.map((event) => (
          <CalendarEvent
            key={event.key}
            event={event}
            compact={zoom === 'month'}
            dense={dense}
            scoped={scoped}
            editable={editable}
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
        {!dense && hidden > 0 ? (
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
  folderId,
  filter,
  filterTasks,
  filterToday,
}: {
  /** Makes a task due on the given day; the page supplies its own capture. */
  readonly onCreate?: (title: string, date: string) => void
  readonly folderId?: string
  readonly filter?: TaskFilter
  readonly filterTasks?: readonly TaskCard[]
  readonly filterToday?: string
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
  /* A phone's month is seven columns of fifty pixels: no title fits, so it
     draws dots and a tap opens the day (m2). */
  const dense = useIsMobile() && zoom === 'month'

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

  const view = usePlannedCalendarView(start, end, folderId)
  const editable = filter === undefined || !taskFilterActive(filter)
  const folders = useFolders()
  const update = useUpdateTask()
  /*
  The grid opens on today's week, once, on arrival, and the person takes it from
  there; otherwise a month opened on its last day would show today three weeks
  below the fold. When today's row is not wholly on screen the grid scrolls it
  up to sit just under the month bar, which is sticky inside the scroller, so
  the controls stay while the title may go: today's tasks and the weeks after
  them are what the calendar is opened for. A today already in view moves
  nothing.
  */
  const grid = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (folderId !== undefined) return
    if (scrolled.current || view.data === undefined) return
    const cell = grid.current?.querySelector('[data-today="true"]')
    if (cell === null || cell === undefined) return
    scrolled.current = true
    const scroller = cell.closest('[data-shell-scroll]')
    if (scroller === null) return
    const frame = scroller.getBoundingClientRect()
    const box = cell.getBoundingClientRect()
    if (box.bottom <= frame.bottom) return
    const head = bar.current?.getBoundingClientRect().height ?? 0
    const by = box.top - frame.top - head
    if (by > 0) scroller.scrollBy({ top: by })
  }, [view.data, folderId])

  /* Single-date Tasks and ghosts sit in day cells. A Start+Due Task crosses
     those cells in a top overlay lane, once per visible week. */
  const { real, virtual } = useMemo(() => {
    const narrowing = filter !== undefined && taskFilterActive(filter)
    const accepted = narrowing ? new Set((filterTasks ?? [])
      .filter((task) => taskMatchesFilter(task, filter, filterToday ?? today))
      .map((task) => task.id)) : null
    const real = (view.data?.real ?? []).filter((task) => accepted === null || accepted.has(task.id))
    const virtual = (view.data?.virtual ?? []).filter((event) => accepted === null || accepted.has(event.task_id))
    return { real, virtual }
  }, [view.data, filter, filterTasks, filterToday, today])
  const cells = useMemo(() => {
    const singleDates = real.filter((task) => task.start_date === null || task.due_date === null || task.start_date === task.due_date)
    return cellsByDate(singleDates, virtual, folders.data ?? [])
  }, [real, virtual, folders.data])

  /* A body drop moves the Schedule; an edge drop writes only that endpoint. */
  function moveTaskTo(drag: CalendarDrag, date: string): void {
    if (!editable) return
    const { taskId } = drag
    const row = (view.data?.real ?? []).find((card) => card.id === taskId)
    if (row === undefined || row.status !== 'pending') return
    if (drag.action === 'start') {
      if (row.due_date === null || date > row.due_date || date === row.start_date) return
      update.mutate({ id: taskId, body: { start_date: date } })
      return
    }
    if (drag.action === 'due') {
      if (row.start_date === null || date < row.start_date || date === row.due_date) return
      update.mutate({ id: taskId, body: { due_date: date } })
      return
    }
    const body = shiftedSchedule(row, drag.from || row.due_date || row.start_date || date, date)
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
  const ranges = useMemo(() => weeks.map((week) => weekRanges(real, week, zoom === 'month' ? 2 : Infinity)), [weeks, real, zoom])

  return (
    /* Both homes center the same readable-width calendar. */
    <div className="mx-auto mt-5 mb-20 w-full max-w-[var(--shell-content-max)] space-y-3">
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

      {/*
      The toolbar (m2): the period's name, then the system's own controls at
      the one control height: a plain Today, ghost Previous/Next, and the zoom
      as Segmented. It sits on the page rather than in a tinted bar, so the
      grid's hairline is the only frame. It sticks to the top of the scroller,
      so the controls stay while today's week is scrolled up beneath it.
      */}
      <div
        ref={bar}
        className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-background py-1"
      >
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="mr-2 min-w-0 truncate text-sm font-section text-foreground">
            {periodTitle(zoom, anchor, today)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous"
            onClick={() => {
              setAnchor((was) => shiftAnchor(zoom, was, -1))
            }}
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next"
            onClick={() => {
              setAnchor((was) => shiftAnchor(zoom, was, 1))
            }}
          >
            <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAnchor(today)
            }}
          >
            Today
          </Button>
        </div>

        <Segmented
          label="Calendar zoom"
          value={zoom}
          onValueChange={setCalendarZoom}
          options={CALENDAR_ZOOMS.map((level) => ({ value: level, label: ZOOM_LABEL[level] }))}
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div role="grid" aria-label={folderId === undefined ? 'Upcoming calendar' : 'Work calendar'} className="bg-background" ref={grid}>
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
            <div key={week[0] ?? ''} className={zoom === 'day' ? undefined : 'grid'}>
              {(ranges[row]?.lanes ?? 0) > 0 ? <div
                className={cn(
                  'grid gap-y-0.5',
                  zoom === 'day' ? 'border-b border-border py-1' : 'pointer-events-none z-20 col-start-1 row-start-1 self-start pt-9',
                )}
                style={{ gridTemplateColumns: template }}
              >
                {ranges[row]?.visible.map((range) => <RangeBar key={range.task.id} range={range} week={week} zoom={zoom} editable={editable} />)}
              </div> : null}
              <div
                role="row"
                className={cn('grid', zoom !== 'day' && 'col-start-1 row-start-1', zoom === 'week' && 'max-sm:grid-cols-1!')}
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
                  hiddenRanges={ranges[row]?.hidden.get(date) ?? 0}
                  rangeLanes={zoom === 'day' ? 0 : ranges[row]?.lanes ?? 0}
                  dense={dense}
                  scoped={folderId !== undefined}
                  editable={editable}
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
                  onDropTask={(drag) => {
                    moveTaskTo(drag, date)
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
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
