// The task schedule editor: optional Start and Due, always in order, each with its own
// time. The calendar handles are a shortcut; the controls are the full keyboard path.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { useUpdateTask } from "../api/mutations.js"
import { todayInBrowserZone } from "../api/tz.js"
import { Ban, ChevronLeft, ChevronRight } from "../lib/icons.js"
import { formatDate, weekdayName, MONTHS_FULL } from "../lib/dates.js"
import { formatTime, useTimeFormat } from "../lib/time-format.js"
import {
  clockOfMinutes,
  dueLabelFor,
  isoDay,
  minutesOfClock,
  parseDueLabel,
  parseIsoDate,
  reminderWords,
  today,
  type ConceptTask,
} from "../tasks/task-model.js"
import { CLEAR_DATE_WARNING } from "./task-copy.js"
import { PickerDivider, PickerOption, TimeField } from "./task-pickers.js"
import { ConfirmDialog } from "./ui/ConfirmDialog.js"
import { cn } from "./ui/utils.js"

export type ScheduleEndpoint = "start" | "due"

export const START_AFTER_DUE = "The start must be on or before the due date."
export const START_TIME_AFTER_DUE_TIME =
  "On the same day, Start time must be at or before Due time."

/** Keep a dragged endpoint on its own side of the other. */
export function clampScheduleResize(
  edge: ScheduleEndpoint,
  target: string,
  start: string | null,
  due: string | null,
): string {
  if (edge === "start" && due !== null && target > due) return due
  if (edge === "due" && start !== null && target < start) return start
  return target
}

/** The same two ordering rules the server enforces. */
export function scheduleOrderError(
  start: string | null,
  due: string | null,
  startTime: string | null,
  dueTime: string | null,
): string | null {
  if (start !== null && due !== null && start > due) return START_AFTER_DUE
  if (
    start !== null &&
    due !== null &&
    start === due &&
    startTime !== null &&
    dueTime !== null &&
    minutesOfClock(startTime) > minutesOfClock(dueTime)
  ) {
    return START_TIME_AFTER_DUE_TIME
  }
  return null
}

function endpointDateText(day: string | null): string {
  return day === null ? "Add date" : formatDate(day, todayInBrowserZone())
}

function EndpointButton({
  endpoint,
  active,
  date,
  time,
  disabled = false,
  onSelect,
}: {
  endpoint: ScheduleEndpoint
  active: boolean
  date: string | null
  time: string | null
  disabled?: boolean
  onSelect: () => void
}) {
  const format = useTimeFormat()
  const timeText =
    date === null
      ? "Optional time"
      : time === null
        ? "Date only"
        : (formatTime(time, format) ?? time)
  const name = endpoint === "start" ? "Start" : "Due"
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "min-w-0 rounded-md border px-2 py-1.5 text-left transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:bg-accent",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span className="block text-[11px] font-medium text-muted-foreground">{name}</span>
      <span className="block truncate text-sm font-medium">{endpointDateText(date)}</span>
      <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
        {timeText}
      </span>
    </button>
  )
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function sameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

type DragState = {
  edge: ScheduleEndpoint
  origin: string
  preview: string
}

/** A slim pill beside one end of the selection. The hit area is wider than the pill. */
function ScheduleGrip({
  edge,
  dragging,
  onPointerDown,
}: {
  edge: ScheduleEndpoint
  dragging: boolean
  onPointerDown: (pointer: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <span
      aria-hidden="true"
      onPointerDown={onPointerDown}
      className={cn(
        "group/grip absolute inset-y-0 z-20 flex w-(--schedule-grip-hit) cursor-ew-resize touch-none items-center justify-center",
        edge === "start"
          ? "left-[calc(50%-var(--schedule-grip-offset)-var(--schedule-grip-hit)/2)]"
          : "right-[calc(50%-var(--schedule-grip-offset)-var(--schedule-grip-hit)/2)]",
      )}
    >
      <span
        className={cn(
          "h-(--schedule-grip-height) w-(--schedule-grip-width) rounded-full transition-colors duration-[var(--duration-fast)]",
          dragging ? "bg-primary" : "bg-primary/45 group-hover/grip:bg-primary",
        )}
      />
    </span>
  )
}

/** A compact six-week calendar whose ends resize as on the Work calendar. */
function ScheduleCalendar({
  active,
  start,
  due,
  allowStart,
  onSelect,
  onResize,
}: {
  active: ScheduleEndpoint
  start: string | null
  due: string | null
  allowStart: boolean
  onSelect: (date: Date) => void
  onResize: (edge: ScheduleEndpoint, date: Date) => void
}) {
  const activeKey = active === "start" ? start : due
  const fallbackKey = active === "start" ? due : start
  const anchor = activeKey ?? fallbackKey
  const anchorDate = anchor === null ? today() : parseIsoDate(anchor)
  const [view, setView] = useState({
    year: anchorDate.getFullYear(),
    month: anchorDate.getMonth(),
  })
  const [cursor, setCursor] = useState(anchorDate)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const days = useMemo(() => monthGrid(view.year, view.month), [view])

  useEffect(() => {
    const key = active === "start" ? start : due
    if (key === null) return
    const date = parseIsoDate(key)
    setView({ year: date.getFullYear(), month: date.getMonth() })
    setCursor(date)
  }, [active, start, due])

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

  function beginResize(edge: ScheduleEndpoint, pointer: ReactPointerEvent<HTMLElement>) {
    if (edge === "start" && !allowStart) return
    const origin = edge === "start" ? (start ?? due) : (due ?? start)
    if (origin === null) return
    pointer.preventDefault()
    pointer.stopPropagation()
    const first: DragState = { edge, origin, preview: origin }
    dragRef.current = first
    setDrag(first)

    const move = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const cell = hit instanceof Element ? hit.closest<HTMLElement>("[data-schedule-day]") : null
      const target = cell?.dataset.scheduleDay
      if (!target) return
      const preview = clampScheduleResize(edge, target, start, due)
      const next: DragState = { edge, origin, preview }
      dragRef.current = next
      setDrag(next)
    }
    const clean = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
    }
    const finish = () => {
      const final = dragRef.current
      clean()
      dragRef.current = null
      setDrag(null)
      if (final !== null && final.preview !== final.origin) {
        onResize(final.edge, parseIsoDate(final.preview))
      }
    }
    const cancel = () => {
      clean()
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", cancel)
  }

  const effectiveStart = drag?.edge === "start" ? drag.preview : start
  const effectiveDue = drag?.edge === "due" ? drag.preview : due
  const startHandle = drag?.edge === "start" ? drag.preview : (start ?? due)
  const dueHandle = drag?.edge === "due" ? drag.preview : (due ?? start)
  const hasAnyEndpoint = start !== null || due !== null
  const todayDate = today()

  return (
    <div className="relative w-[300px] select-none px-2">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="text-sm font-medium text-foreground">
          {MONTHS_FULL[view.month]} {view.year}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {drag === null ? null : (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-7 z-30 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
        >
          {drag.edge === "start" ? "Start" : "Due"} · {formatDate(drag.preview, todayInBrowserZone())}
        </div>
      )}

      <div className="grid grid-cols-7" role="presentation">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`Choose ${active === "start" ? "Start" : "Due"} date`}
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
          const key = isoDay(date)
          const outside = date.getMonth() !== view.month
          const isStart = effectiveStart !== null && key === effectiveStart
          const isDue = effectiveDue !== null && key === effectiveDue
          const isEndpoint = isStart || isDue
          const isActive = key === (active === "start" ? effectiveStart : effectiveDue)
          const isToday = sameDay(date, todayDate)
          const isCursor = sameDay(date, cursor)
          const isBetween =
            effectiveStart !== null &&
            effectiveDue !== null &&
            key > effectiveStart &&
            key < effectiveDue
          const showStartHandle = allowStart && hasAnyEndpoint && key === startHandle
          const showDueHandle = hasAnyEndpoint && key === dueHandle
          return (
            <div
              key={key}
              data-schedule-day={key}
              role="gridcell"
              className={cn(
                "group/day relative flex justify-center",
                isBetween && "bg-primary/10",
                isStart && effectiveDue !== null && effectiveStart !== effectiveDue &&
                  "rounded-l-sm bg-gradient-to-r from-transparent from-50% to-primary/10 to-50%",
                isDue && effectiveStart !== null && effectiveStart !== effectiveDue &&
                  "rounded-r-sm bg-gradient-to-l from-transparent from-50% to-primary/10 to-50%",
              )}
            >
              <button
                type="button"
                data-cursor={isCursor}
                tabIndex={isCursor ? 0 : -1}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isEndpoint}
                aria-label={`${weekdayName(key)} ${formatDate(key, "")}`}
                onClick={() => {
                  setCursor(date)
                  if (outside) setView({ year: date.getFullYear(), month: date.getMonth() })
                  onSelect(date)
                }}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-sm text-sm tabular-nums transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                  isEndpoint
                    ? isActive
                      ? "bg-primary font-medium text-primary-foreground ring-1 ring-primary/30 ring-offset-1 ring-offset-background"
                      : "bg-primary/80 font-medium text-primary-foreground"
                    : outside
                      ? "text-quiet-foreground hover:bg-accent hover:text-muted-foreground"
                      : "text-foreground hover:bg-accent",
                  isToday && !isEndpoint && "font-semibold text-primary",
                )}
              >
                {date.getDate()}
                {isToday ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isEndpoint ? "bg-primary-foreground/70" : "bg-primary",
                    )}
                  />
                ) : null}
              </button>

              {showStartHandle ? (
                <ScheduleGrip
                  edge="start"
                  dragging={drag?.edge === "start"}
                  onPointerDown={(pointer) => beginResize("start", pointer)}
                />
              ) : null}
              {showDueHandle ? (
                <ScheduleGrip
                  edge="due"
                  dragging={drag?.edge === "due"}
                  onPointerDown={(pointer) => beginResize("due", pointer)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SchedulePanel({
  task,
  patch,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
}) {
  const dueDate = task.due ? parseDueLabel(task.due.label) : null
  const dueKey = dueDate === null ? null : isoDay(dueDate)
  const startKey = task.start ?? null
  const dueTime = task.dueTime ?? null
  const startTime = task.startTime ?? null
  const canEditStart = task.id !== "new"
  const [endpoint, setEndpoint] = useState<ScheduleEndpoint>(() =>
    task.due || !canEditStart ? "due" : "start",
  )
  const [refused, setRefused] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [moved, setMoved] = useState<string | null>(null)
  const update = useUpdateTask()
  const format = useTimeFormat()

  useEffect(() => {
    if (!canEditStart && endpoint === "start") setEndpoint("due")
  }, [canEditStart, endpoint])

  const selectedKey = endpoint === "start" ? startKey : dueKey
  const selectedDate = selectedKey === null ? null : parseIsoDate(selectedKey)

  function labelWithDueTime(day: Date, time: string | null) {
    const label = dueLabelFor(day)
    return time === null
      ? label
      : { ...label, label: `${label.label} ${formatTime(time, format) ?? time}` }
  }

  function commitDate(which: ScheduleEndpoint, date: Date) {
    if (which === "start" && !canEditStart) return
    const day = isoDay(date)
    const nextStart = which === "start" ? day : startKey
    const nextDue = which === "due" ? day : dueKey
    const error = scheduleOrderError(nextStart, nextDue, startTime, dueTime)
    if (error !== null) {
      setRefused(error)
      return
    }
    setRefused(null)
    if (which === "start") {
      patch(task.id, { start: day })
      if (task.id !== "new") update.mutate({ id: task.id, body: { start_date: day } })
      return
    }
    patch(task.id, { due: labelWithDueTime(date, dueTime) })
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: day } })
  }

  function clearStart() {
    if (startKey === null || !canEditStart) return
    setRefused(null)
    patch(task.id, { start: undefined, startTime: undefined })
    update.mutate({ id: task.id, body: { start_date: null } })
    setEndpoint("due")
  }

  function clearDue() {
    if (dueKey === null) return
    setRefused(null)
    setMoved(null)
    patch(task.id, {
      due: undefined,
      dueTime: undefined,
      recurrence: false,
      reminder: undefined,
      reminderAt: undefined,
    })
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: null } })
    if (startKey !== null && canEditStart) setEndpoint("start")
    else setEndpoint("due")
  }

  function setStartTime(time: string | null) {
    if (startKey === null || task.id === "new") return
    const error = scheduleOrderError(startKey, dueKey, time, dueTime)
    if (error !== null) {
      setRefused(error)
      return
    }
    setRefused(null)
    patch(task.id, { startTime: time ?? undefined })
    update.mutate({ id: task.id, body: { start_time: time } })
  }

  function setDueTime(time: string | null) {
    if (dueDate === null || task.id === "new") return
    const error = scheduleOrderError(startKey, dueKey, startTime, time)
    if (error !== null) {
      setRefused(error)
      return
    }
    setRefused(null)
    const was = task.reminderAt
    let reminder: {
      at: number
      body: { offset_minutes: number | null; time_of_day: string | null }
    } | null = null
    let note: string | null = null
    if (was !== undefined && time !== null) {
      const dueMinutes = minutesOfClock(time)
      const kept = Math.min(was, dueMinutes)
      if (kept !== was) {
        note = `The reminder moved to ${formatTime(time, format) ?? time}.`
      }
      reminder = {
        at: kept,
        body: { offset_minutes: dueMinutes - kept, time_of_day: null },
      }
    } else if (was !== undefined) {
      if (was >= 0) {
        reminder = {
          at: was,
          body: { offset_minutes: null, time_of_day: clockOfMinutes(was) },
        }
      } else {
        note = "The reminder was on the day before, which needs a due time, so it was removed."
      }
    }
    setMoved(note)
    patch(task.id, {
      dueTime: time ?? undefined,
      due: labelWithDueTime(dueDate, time),
      reminder: reminder === null ? undefined : reminderWords(dueDate, reminder.at),
      reminderAt: reminder?.at,
    })
    update.mutate({
      id: task.id,
      body:
        reminder === null
          ? { due_time: time }
          : { due_time: time, reminder: reminder.body },
    })
  }

  const cascades = Boolean(task.recurrence) || Boolean(task.reminder)

  return (
    <div className="w-[316px]">
      <div className="grid grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)] items-center gap-1 px-2 pb-1 pt-0.5">
        <EndpointButton
          endpoint="start"
          active={endpoint === "start"}
          date={startKey}
          time={startTime}
          disabled={!canEditStart}
          onSelect={() => {
            if (!canEditStart) return
            setRefused(null)
            setEndpoint("start")
          }}
        />
        <span aria-hidden="true" className="text-center text-sm text-muted-foreground">→</span>
        <EndpointButton
          endpoint="due"
          active={endpoint === "due"}
          date={dueKey}
          time={dueTime}
          onSelect={() => {
            setRefused(null)
            setEndpoint("due")
          }}
        />
      </div>

      {refused === null ? null : (
        <p role="status" className="px-2 pb-1 text-xs text-destructive">
          {refused}
        </p>
      )}

      <div className="flex flex-col">
        <PickerOption
          icon={Ban}
          label={selectedKey === null ? `No ${endpoint === "start" ? "Start" : "Due"}` : `Clear ${endpoint === "start" ? "Start" : "Due"}`}
          active={selectedKey === null}
          onSelect={() => {
            if (endpoint === "start") {
              clearStart()
              return
            }
            if (dueKey === null) return
            if (cascades) setConfirming(true)
            else clearDue()
          }}
        />
      </div>

      {confirming ? (
        <ConfirmDialog
          message={CLEAR_DATE_WARNING}
          onContinue={() => {
            setConfirming(false)
            clearDue()
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      <PickerDivider />

      <ScheduleCalendar
        active={endpoint}
        start={startKey}
        due={dueKey}
        allowStart={canEditStart}
        onSelect={(date) => commitDate(endpoint, date)}
        onResize={(edge, date) => {
          setEndpoint(edge)
          commitDate(edge, date)
        }}
      />

      <PickerDivider />

      <div className="px-2 pb-1 pt-1.5">
        {selectedDate === null || task.id === "new" ? (
          <div className="flex h-[var(--control-height)] items-center text-xs text-muted-foreground">
            {task.id === "new"
              ? "Time can be added after the task is created."
              : `Choose a ${endpoint === "start" ? "Start" : "Due"} date to add time.`}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <span className="w-16 shrink-0 pt-2 text-xs text-muted-foreground">
              {endpoint === "start" ? "Start time" : "Due time"}
            </span>
            <div className="min-w-0 flex-1">
              <TimeField
                label={endpoint === "start" ? "Start time" : "Due time"}
                value={endpoint === "start" ? startTime : dueTime}
                onCommit={endpoint === "start" ? setStartTime : setDueTime}
              />
            </div>
          </div>
        )}
        {moved === null ? null : (
          <p role="status" className="pt-1.5 text-xs text-muted-foreground">
            {moved}
          </p>
        )}
      </div>
    </div>
  )
}
