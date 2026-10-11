// The shared Upcoming and Work calendar grid. The grid, gridcell and columnheader
// roles are required (spec 9.1). Each week is its own CSS grid: `display: contents`
// on a row can drop it from the accessibility tree.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'
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
import { readCalendarDrag, weekRanges } from './ranges.js'
import type { CalendarDrag, WeekRange } from './ranges.js'
import { CALENDAR_ZOOMS } from '../../../shared/bundle.js'
import {
  clearRevealedZoom,
  revealCalendarZoom,
  setCalendarZoom,
  useCalendarZoom,
} from '../../lib/calendar-zoom.js'

// Three lines per month cell; the last becomes "+N more" when the day holds more.
const MONTH_CELL_LINES = 3

function identityStyle(id: string): React.CSSProperties {
  // FNV-1a gives each task a stable hue; a second hash slice picks one of three tones
  // so nearby hues still separate.
  let hash = 2166136261
  for (const char of id) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const unsigned = hash >>> 0
  const hue = (unsigned % 36000) / 100
  const tone = (unsigned >>> 8) % 3
  const fillMix = 66 + tone * 4
const borderMix = 34 + tone * 3
return {
  backgroundColor: `color-mix(in oklch, var(--background) ${String(fillMix)}%, oklch(0.68 0.18 ${String(hue)}))`,
  borderColor: `color-mix(in oklch, var(--background) ${String(borderMix)}%, oklch(0.62 0.2 ${String(hue)}))`,
}
}

type CalendarPointerStart = (event: ReactPointerEvent<HTMLElement>, taskId: string, action: CalendarDrag['action'], from: string) => void

const CELL_MIN_HEIGHT: Record<Zoom, string> = {
  month: 'min-h-[var(--calendar-month-cell-height)] max-sm:min-h-16',
  week: 'min-h-[420px]',
  day: 'min-h-[480px]',
}

const ZOOM_LABEL: Record<Zoom, string> = { day: 'Day', week: 'Week', month: 'Month' }

function CalendarEvent({
  event,
  compact,
  dense,
  onOpen,
  scoped,
  editable,
  onPointerStart,
}: {
  readonly event: CellEvent
  readonly compact: boolean
  readonly dense: boolean
  readonly onOpen: () => void
  readonly scoped: boolean
  readonly editable: boolean
  readonly onPointerStart: CalendarPointerStart
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
  // A ghost is a projection with no date of its own to move. `moves` says which end
  // a drop writes; a Start+Due pair moves whole.
  const movable = editable && !ghost && !completed && !abandoned && event.moves !== null
  const edge = event.moves === 'due_date' ? 'start' : event.moves === 'start_date' ? 'due' : null

  return (
    <button
      type="button"
      onPointerDown={movable ? (pointer) => onPointerStart(pointer, event.taskId, 'move', event.date) : undefined}
      className={cn(
        '@container relative flex w-full gap-1.5 overflow-hidden rounded-sm border px-1.5 text-left text-foreground transition-[background-color,border-color] focus-visible:outline-none',
        movable && 'cursor-grab active:cursor-grabbing touch-none select-none',
        compact ? 'min-h-5 items-center text-xs' : 'min-h-7 items-start py-1.5 text-xs leading-4',
        !completed && !abandoned && !ghost && 'hover:border-primary',
        completed && 'border-border bg-background text-muted-foreground hover:bg-hover',
        abandoned && 'border-border bg-background text-muted-foreground line-through hover:bg-hover',
        ghost &&
          'border-dashed border-border bg-transparent text-muted-foreground hover:bg-hover',
      )}
      style={!completed && !abandoned && !ghost ? identityStyle(event.taskId) : undefined}
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
          {/* The time shows only where the chip has room; the tooltip always says it. */}
          <span className="min-w-0 truncate">{event.title}</span>
          {event.dueTime === null ? null : (
            <span className="ml-auto hidden shrink-0 text-muted-foreground tabular-nums @[9rem]:inline">
              {formatClockTime(event.dueTime, clock)}
            </span>
          )}
        </>
      ) : (
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
        aria-hidden="true"
        className={cn('absolute inset-y-0 z-10 w-3 cursor-ew-resize before:absolute before:inset-y-1 before:w-0.5 before:bg-foreground/25 before:opacity-0 hover:before:opacity-100', edge === 'start' ? 'left-0 before:left-0.5' : 'right-0 before:right-0.5')}
        onPointerDown={(pointer) => {
          pointer.stopPropagation()
          onPointerStart(pointer, event.taskId, edge, event.date)
        }}
        onClick={(click) => click.stopPropagation()}
      /> : null}
    </button>
  )
}

function RangeBar({ range, week, zoom, editable, onPointerStart, suppressOpenUntil }: { readonly range: WeekRange; readonly week: readonly string[]; readonly zoom: Zoom; readonly editable: boolean; readonly onPointerStart: CalendarPointerStart; readonly suppressOpenUntil: React.RefObject<number> }): React.JSX.Element {
  const { task } = range
  const movable = editable && task.status === 'pending'
  const length = range.last - range.first + 1
  return <div
    className={cn('group/range pointer-events-auto relative min-w-0', zoom === 'week' && 'max-sm:col-span-7!')}
    style={{ gridColumn: `${range.first + 1} / ${range.last + 2}`, gridRow: range.lane + 1 }}
  >
    <button
      type="button"
      aria-label={`${task.title}, ${task.start_date ?? ''} to ${task.due_date ?? ''}`}
      title={`${task.title}, ${task.start_date ?? ''} to ${task.due_date ?? ''}`}
      className={cn(
        'flex h-5 w-full min-w-0 items-center rounded-sm border px-2 text-left text-xs text-foreground',
        movable && 'cursor-grab active:cursor-grabbing touch-none select-none',
        task.status === 'pending' && 'hover:border-primary',
        task.status === 'completed' && 'border-border bg-background text-muted-foreground hover:bg-hover',
        task.status === 'abandoned' && 'border-border bg-background text-muted-foreground line-through hover:bg-hover',
      )}
      style={task.status === 'pending' ? identityStyle(task.id) : undefined}
      onClick={() => { if (performance.now() > suppressOpenUntil.current) openTask(task.id, { upcoming: false }) }}
      onPointerDown={movable ? (pointer) => {
        const bounds = pointer.currentTarget.getBoundingClientRect()
        const offset = Math.max(0, Math.min(length - 1, Math.floor((pointer.clientX - bounds.left) / (bounds.width / length))))
        onPointerStart(pointer, task.id, 'move', week[range.first + offset] ?? week[range.first] ?? '')
      } : undefined}
    >
      {task.status === 'completed' ? <Check className="mr-1 size-3 shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{task.title}</span>
    </button>
    {movable && range.begins ? <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none before:absolute before:inset-y-1 before:left-1 before:w-0.5 before:bg-foreground/30 before:opacity-0 hover:before:opacity-100 group-hover/range:before:opacity-100"
      onPointerDown={(pointer) => { pointer.stopPropagation(); onPointerStart(pointer, task.id, 'start', task.start_date ?? '') }}
    /> : null}
    {movable && range.ends ? <span
      aria-hidden="true"
      className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none before:absolute before:inset-y-1 before:right-1 before:w-0.5 before:bg-foreground/30 before:opacity-0 hover:before:opacity-100 group-hover/range:before:opacity-100"
      onPointerDown={(pointer) => { pointer.stopPropagation(); onPointerStart(pointer, task.id, 'due', task.due_date ?? '') }}
    /> : null}
  </div>
}

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
  capacity,
  dropDate,
  dropAction,
  dragging,
  onPointerStart,
  onExpand,
  suppressOpenUntil,
}: {
  readonly date: string
  readonly zoom: Zoom
  readonly dense: boolean
  readonly today: string
  readonly anchorMonth: string
  readonly column: number
  readonly lastColumn: boolean
  readonly lastRow: boolean
  readonly events: readonly CellEvent[]
  readonly onReveal: () => void
  readonly onDropTask: (drag: CalendarDrag) => void
  readonly hiddenRanges: number
  readonly rangeLanes: number
  readonly editable: boolean
  readonly onCreate?: (title: string) => void
  readonly scoped: boolean
  readonly capacity: number
  readonly dropDate: string | null
  readonly dropAction: CalendarDrag['action'] | 'external'
  readonly dragging: boolean
  readonly onPointerStart: CalendarPointerStart
  readonly onExpand: () => void
  readonly suppressOpenUntil: React.RefObject<number>
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  const [drafting, setDrafting] = useState(false)
  // Every cell in the week shares one capacity, so a crowded day cannot grow the week.
  const overflows = zoom === 'month' && events.length + hiddenRanges + rangeLanes > capacity
  const visible = overflows ? events.slice(0, Math.max(0, capacity - 1 - rangeLanes)) : events
  const hidden = events.length - visible.length + hiddenRanges
  // A phone draws the week as an agenda, one day per line.
  const agenda = zoom === 'week'
  const outsideMonth = zoom === 'month' && monthOf(date) !== anchorMonth

  return (
    <div
      role="gridcell"
      data-today={date === today ? 'true' : undefined}
      data-date={date}
      className={cn(
        'group/calendar-cell relative border-r border-b border-border p-1.5',
        dense ? 'min-h-16 overflow-hidden' : CELL_MIN_HEIGHT[zoom],
        lastColumn && 'border-r-0',
        lastRow && 'border-b-0',
        agenda && 'max-sm:min-h-14 max-sm:border-r-0',
        agenda && !lastColumn && 'max-sm:border-b',
        over && 'bg-muted',
        dragging && !dense && 'outline-1 -outline-offset-2 outline-border',
        dropDate === date && 'bg-selected outline-2 -outline-offset-2 outline-primary',
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
      {/* A button under the rows, so the in-cell "New task" is reachable by keyboard and a
         click on a row still opens that task. */}
      {dense ? (
        <button
          type="button"
          className="absolute inset-0 z-0 rounded-none text-left outline-none"
          aria-label={`Show ${formatDueDate(date, today)}`}
          onClick={onReveal}
        />
      ) : onCreate === undefined ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="absolute inset-0 z-0 rounded-none text-left outline-none transition-colors hover:bg-muted/70"
                aria-label={`New task on ${formatDueDate(date, today)}`}
                onClick={() => {
                  setDrafting(true)
                }}
              />
            }
          />
          <TooltipContent side="top" align="end">Add a new task</TooltipContent>
        </Tooltip>
      )}

      <div
        className={cn(
          'pointer-events-none relative z-10 mb-1.5 flex h-6 items-center justify-between',
          zoom === 'day' && 'hidden',
          // A pseudo-element, so the cell's text still starts with the day number.
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
          {/* The trailing space keeps the day number a separate word in the cell's text.
             Tests and readers address a cell by its day (AC-093, AC-098). */}
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

      {dropDate === date ? <span className="pointer-events-none absolute right-1.5 top-2 z-20 rounded-sm bg-background px-1 text-xs font-section text-foreground">{dropAction === 'external' || dropAction === 'start' ? 'Start' : dropAction === 'due' ? 'Due' : 'Move to'} {formatDueDate(date, today)}</span> : null}

      <div className={cn('relative z-10', dense ? 'pointer-events-none flex flex-wrap gap-0.5' : 'space-y-0.5')}>
        {visible.map((event) => (
          <CalendarEvent
            key={event.key}
            event={event}
            compact={zoom === 'month'}
            dense={dense}
            scoped={scoped}
            editable={editable}
            onPointerStart={onPointerStart}
            onOpen={() => {
              if (performance.now() <= suppressOpenUntil.current) return
              // A ghost opens the series' current occurrence, with the banner.
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
            className={cn('flex h-5 items-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none', dense && 'pointer-events-auto min-h-8 min-w-10 justify-center px-0.5')}
            onClick={zoom === 'month' ? onExpand : onReveal}
            aria-label={`+${hidden} more`}
          >
            +{hidden}{dense ? '' : ' more'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

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
  // Enter, Escape and blur each end the line; only the first one counts.
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
  externalDropDate = null,
  externalDragging = false,
  onExternalDrop,
  onExternalOver,
  onDragStateChange,
}: {
  readonly onCreate?: (title: string, date: string) => void
  readonly folderId?: string
  readonly filter?: TaskFilter
  readonly filterTasks?: readonly TaskCard[]
  readonly filterToday?: string
  readonly externalDropDate?: string | null
  readonly externalDragging?: boolean
  readonly onExternalDrop?: (taskId: string, point: { readonly x: number; readonly y: number }) => boolean
  readonly onExternalOver?: (taskId: string, point: { readonly x: number; readonly y: number }) => string | null
  readonly onDragStateChange?: (dragging: boolean) => void
} = {}): React.JSX.Element {
  const today = presenterToday()
  // The zoom is the account's; the anchor stays local so a visit opens on today.
  const zoom = useCalendarZoom()
  const [anchor, setAnchor] = useState<string>(today)
  // A phone's month has no room for titles, so it draws dots and a tap opens the day.
  const dense = useIsMobile() && zoom === 'month'

  // A revealed zoom lasts only while the calendar is on screen.
  useEffect(() => clearRevealedZoom, [])

  const dates = useMemo(() => datesFor(zoom, anchor), [zoom, anchor])
  // The range is read off the laid-out days, so the grid and the request cannot disagree.
  const start = dates[0] ?? anchor
  const end = dates[dates.length - 1] ?? anchor

  const view = usePlannedCalendarView(start, end, folderId)
  // Filters only narrow what is visible; visible pending tasks stay editable.
  const editable = true
  const folders = useFolders()
  const update = useUpdateTask()
  const [dragPreview, setDragPreview] = useState<{ drag: CalendarDrag; date: string | null; externalProposal: string | null; x: number; y: number; title: string } | null>(null)
  const suppressOpenUntil = useRef(0)
  const [weekSteps, setWeekSteps] = useState<Record<string, number>>({})
  // On arrival, scroll today's week up under the sticky month bar unless it is already in view.
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

  // Single-date tasks and ghosts sit in day cells; a Start+Due task spans the week in an overlay lane.
  const { real, virtual } = useMemo(() => {
    const narrowing = filter !== undefined && taskFilterActive(filter)
    const accepted = narrowing ? new Set((filterTasks ?? [])
      .filter((task) => taskMatchesFilter(task, filter, filterToday ?? today))
      .map((task) => task.id)) : null
    const real = (view.data?.real ?? []).filter((task) => accepted === null || accepted.has(task.id))
    const virtual = (view.data?.virtual ?? []).filter((event) => accepted === null || accepted.has(event.task_id))
    return { real, virtual }
  }, [view.data, filter, filterTasks, filterToday, today])
  // A body drop moves the schedule; an edge drop writes only that endpoint.
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
    update.mutate({ id: taskId, body })
  }

  function proposedSchedule(drag: CalendarDrag, date: string): Partial<TaskCard> | null {
    const row = real.find((task) => task.id === drag.taskId)
    if (row === undefined || row.status !== 'pending') return null
    if (drag.action === 'start') return row.due_date !== null && date <= row.due_date ? { start_date: date } : null
    if (drag.action === 'due') return row.start_date !== null && date >= row.start_date ? { due_date: date } : null
    return shiftedSchedule(row, drag.from || row.due_date || row.start_date || date, date) ?? {}
  }

  function pointerStart(pointer: ReactPointerEvent<HTMLElement>, taskId: string, action: CalendarDrag['action'], from: string): void {
  if (!editable || pointer.button !== 0) return
  const row = real.find((task) => task.id === taskId)
  if (row === undefined || row.status !== 'pending') return
  if (action !== 'move') pointer.preventDefault()
  const id = pointer.pointerId
  const startX = pointer.clientX
  const startY = pointer.clientY
  const drag: CalendarDrag = { taskId, action, from }
  let lifted = false
  let target: string | null = null
  let externalTarget = false
  const clear = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key)
    document.body.style.removeProperty('cursor')
    if (grid.current?.hasPointerCapture(id)) grid.current.releasePointerCapture(id)
    setDragPreview(null)
    if (action === 'move') onDragStateChange?.(false)
  }
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== id) return
    if (!lifted && Math.hypot(event.clientX - startX, event.clientY - startY) < 5) return
    if (!lifted) {
      lifted = true
      grid.current?.setPointerCapture(id)
      if (action === 'move') onDragStateChange?.(true)
    }
    document.body.style.cursor = action === 'move' ? 'grabbing' : 'ew-resize'
    const point = { x: event.clientX, y: event.clientY }
    const cell = Array.from(grid.current?.querySelectorAll<HTMLElement>('[data-date]') ?? []).find((candidate) => {
      const box = candidate.getBoundingClientRect()
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    })
    const date = cell?.dataset.date ?? null
    target = date !== null && proposedSchedule(drag, date) !== null ? date : null
    const externalProposal = action === 'move' ? onExternalOver?.(taskId, point) ?? null : null
    externalTarget = target === null && externalProposal !== null
    setDragPreview({ drag, date: target, externalProposal: target === null ? externalProposal : null, x: event.clientX, y: event.clientY, title: row.title })
  }
  const release = (event: PointerEvent): void => {
    if (event.pointerId !== id) return
    const point = { x: event.clientX, y: event.clientY }
    const dropDate = target
    const dropExternal = lifted && action === 'move' && externalTarget
    if (dropExternal) onExternalDrop?.(taskId, point)
    clear()
    if (lifted) suppressOpenUntil.current = performance.now() + 350
    if (lifted && dropDate !== null) moveTaskTo(drag, dropDate)
  }
  const cancel = (event: PointerEvent): void => { if (event.pointerId === id) clear() }
  const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') { suppressOpenUntil.current = performance.now() + 350; clear() } }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key)
}

  const previewReal = useMemo(() => {
    if (dragPreview?.date === null || dragPreview === null) return real
    const proposal = proposedSchedule(dragPreview.drag, dragPreview.date)
    return proposal === null ? real : real.map((task) => task.id === dragPreview.drag.taskId ? { ...task, ...proposal } : task)
  }, [real, dragPreview])
  const cells = useMemo(() => {
    const singleDates = previewReal.filter((task) => task.start_date === null || task.due_date === null || task.start_date === task.due_date)
    return cellsByDate(singleDates, virtual, folders.data ?? [])
  }, [previewReal, virtual, folders.data])

  const columns = zoom === 'day' ? 1 : 7
  const template = `repeat(${String(columns)}, minmax(0, 1fr))`
  const weeks = useMemo(() => {
    const rows: string[][] = []
    for (let at = 0; at < dates.length; at += columns) {
      rows.push(dates.slice(at, at + columns))
    }
    return rows
  }, [dates, columns])
  const ranges = useMemo(() => weeks.map((week) => weekRanges(previewReal, week, zoom === 'month' ? 2 + (weekSteps[week[0] ?? ''] ?? 0) : Infinity)), [weeks, previewReal, zoom, weekSteps])

  function expandWeek(week: readonly string[]): void {
    const key = week[0]
    if (key === undefined) return
    const full = weekRanges(previewReal, week)
    const needed = full.lanes + Math.max(0, ...week.map((day) => cells.get(day)?.length ?? 0))
    setWeekSteps((was) => ({ ...was, [key]: Math.max(was[key] ?? 0, needed - MONTH_CELL_LINES) }))
  }

  function resizeWeek(pointer: ReactPointerEvent<HTMLButtonElement>, key: string): void {
    if (pointer.button !== 0) return
    pointer.preventDefault()
    const startY = pointer.clientY
    const startSteps = weekSteps[key] ?? 0
    const id = pointer.pointerId
    const unit = Number.parseFloat(getComputedStyle(pointer.currentTarget).getPropertyValue('--calendar-range-lane-height')) || 22
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== id) return
      const steps = Math.max(0, startSteps + Math.round((event.clientY - startY) / unit))
      setWeekSteps((was) => was[key] === steps ? was : { ...was, [key]: steps })
    }
    const end = (event: PointerEvent): void => {
      if (event.pointerId !== id) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <div className="mx-auto mt-5 mb-20 w-full max-w-[var(--shell-content-max)] space-y-3">
      {/* The grid still draws under a failed read: an error is not the empty state. */}
      {view.status === 'error' ? (
        <InlineError
          onRetry={() => {
            void view.refetch()
          }}
        />
      ) : null}

      {/* Sticky, so the controls stay while today's week scrolls up beneath them. */}
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
                className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          )}

          {weeks.map((week, row) => (
            <div key={week[0] ?? ''} className={cn('relative', zoom === 'day' ? undefined : 'grid')}>
              {(ranges[row]?.lanes ?? 0) > 0 ? <div
                className={cn(
                  'grid gap-y-0.5',
                  zoom === 'day' ? 'border-b border-border py-1' : 'pointer-events-none z-20 col-start-1 row-start-1 self-start pt-9',
                )}
                style={{ gridTemplateColumns: template }}
              >
                {ranges[row]?.visible.map((range) => <RangeBar key={range.task.id} range={range} week={week} zoom={zoom} editable={editable} onPointerStart={pointerStart} suppressOpenUntil={suppressOpenUntil} />)}
              </div> : null}
              <div
                role="row"
                className={cn('grid', zoom !== 'day' && 'col-start-1 row-start-1', zoom === 'week' && 'max-sm:grid-cols-1!')}
                style={{ gridTemplateColumns: template, ...(zoom === 'month' ? { minHeight: `calc(var(--calendar-month-cell-height) + ${String(weekSteps[week[0] ?? ''] ?? 0)} * var(--calendar-range-lane-height))` } : {}) }}
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
                  capacity={zoom === 'month' ? MONTH_CELL_LINES + (weekSteps[week[0] ?? ''] ?? 0) : Infinity}
                  dense={dense}
                  scoped={folderId !== undefined}
                  editable={editable}
                  dragging={externalDragging || (dragPreview !== null && proposedSchedule(dragPreview.drag, date) !== null)}
                  dropDate={dragPreview?.date ?? externalDropDate}
                  dropAction={dragPreview?.drag.action ?? 'external'}
                  onPointerStart={pointerStart}
                  suppressOpenUntil={suppressOpenUntil}
                  onExpand={() => expandWeek(week)}
                  onReveal={() => {
                    // The reveal changes what is drawn, never the stored zoom.
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
              {zoom === 'month' ? <button
                type="button"
                aria-label={`Resize week of ${week[0] ?? ''}`}
                className={cn('absolute inset-x-0 bottom-0 z-30 h-2 cursor-ns-resize touch-none border-0 bg-transparent focus-visible:bg-selected hover:bg-selected', row < weeks.length - 1 && 'translate-y-1/2')}
                onPointerDown={(pointer) => resizeWeek(pointer, week[0] ?? '')}
                onDoubleClick={() => setWeekSteps((was) => ({ ...was, [week[0] ?? '']: 0 }))}
                onKeyDown={(key) => {
                  if (key.key === 'ArrowDown' || key.key === 'ArrowUp') {
                    key.preventDefault()
                    setWeekSteps((was) => ({ ...was, [week[0] ?? '']: Math.max(0, (was[week[0] ?? ''] ?? 0) + (key.key === 'ArrowDown' ? 1 : -1)) }))
                  }
                }}
              /> : null}
            </div>
          ))}
        </div>
      </div>
      {dragPreview !== null ? <div
        className="pointer-events-none fixed z-50 max-w-56 truncate rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground"
        style={{ left: dragPreview.x + 12, top: dragPreview.y + 12 }}
        aria-hidden="true"
      >{dragPreview.externalProposal === null ? dragPreview.title : `${dragPreview.externalProposal} · ${dragPreview.title}`}</div> : null}
    </div>
  )
}
