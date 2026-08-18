import { useEffect, useMemo, useState } from "react"
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder,
  List,
  Plus,
  Repeat2,
} from "lucide-react"

import { QuickAdd } from "@/components/quick-add"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import {
  TaskRow,
  type TaskExpansion,
  type TaskRowProps,
} from "@/components/task-row"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type PlannedMode = "list" | "calendar"
type CalendarZoom = "day" | "week" | "month"

export type PlannedTask = TaskRowProps & {
  id: string
  date: string
  time?: string
}

interface PlannedScreenProps {
  tasks: PlannedTask[]
  calendarTasks: PlannedTask[]
  previewState?: string | null
  initialMode?: PlannedMode
  onAdd: (title: string) => void
  onOpenFullForm: () => void
  onCreateAtDate: (date: string) => void
  onOpenTask: (taskId: string) => void
  onOpenGhost: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRename: (taskId: string, title: string) => void
  expansion?: TaskExpansion
  onRestore: (taskId: string) => void
}

const MODE_STORAGE_KEY = "dana-planned-mode"
const todayKey = "2026-08-10"
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function parseDate(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + amount)
  return next
}

function startOfWeek(date: Date) {
  const day = date.getUTCDay()
  return addDays(date, -(day === 0 ? 6 : day - 1))
}

function monthDates(anchor: Date) {
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

function formatCalendarTitle(anchor: Date, zoom: CalendarZoom) {
  const month = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    timeZone: "UTC",
  }).format(anchor)
  const year = anchor.getUTCFullYear()
  if (zoom === "month") return `${month} ${year}`
  if (zoom === "day") return `${month} ${anchor.getUTCDate()}, ${year}`

  const start = startOfWeek(anchor)
  const end = addDays(start, 6)
  const endMonth = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    timeZone: "UTC",
  }).format(end)
  return `${start.getUTCDate()}–${end.getUTCDate()} ${endMonth} ${end.getUTCFullYear()}`
}

function ModeSwitch({ mode, onChange }: { mode: PlannedMode; onChange: (mode: PlannedMode) => void }) {
  return (
    <div
      className="flex h-11 items-center rounded-lg border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] p-0.5"
      role="group"
      aria-label="Planned view"
    >
      <Button
        variant="ghost"
        className={cn(
          "h-[var(--control-height)] gap-1.5 rounded-md px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)]",
          mode === "list" &&
            "bg-white text-[var(--color-graphite-900)] ring-1 ring-[var(--color-graphite-200)] hover:bg-white",
        )}
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
      >
        <List className="size-4" strokeWidth={1.75} />
        List
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "h-[var(--control-height)] gap-1.5 rounded-md px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)]",
          mode === "calendar" &&
            "bg-white text-[var(--color-graphite-900)] ring-1 ring-[var(--color-graphite-200)] hover:bg-white",
        )}
        aria-pressed={mode === "calendar"}
        onClick={() => onChange("calendar")}
      >
        <CalendarDays className="size-4" strokeWidth={1.75} />
        Calendar
      </Button>
    </div>
  )
}

function CalendarEvent({
  task,
  ghost = false,
  compact = false,
  onOpen,
}: {
  task: PlannedTask
  ghost?: boolean
  compact?: boolean
  onOpen: () => void
}) {
  const completed = task.status === "completed"
  const abandoned = task.status === "abandoned"

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 overflow-hidden rounded-[4px] border border-transparent bg-[var(--color-graphite-25)] px-1.5 text-left text-[var(--color-graphite-700)] transition-[background-color,border-color] hover:border-[var(--color-graphite-200)] hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        compact ? "min-h-5 text-[10px] leading-3" : "min-h-7 text-xs leading-4",
        completed && "bg-white text-[var(--color-graphite-400)]",
        abandoned && "bg-white text-[var(--color-graphite-500)] line-through",
        ghost &&
          "border-dashed border-[var(--color-graphite-300)] bg-transparent text-[var(--color-graphite-500)]",
      )}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      aria-label={`${ghost ? "Upcoming repeating occurrence: " : ""}${task.title}`}
    >
      {ghost ? (
        <Repeat2 className="size-3 shrink-0" strokeWidth={1.75} />
      ) : completed ? (
        <Check className="size-3 shrink-0" strokeWidth={2} />
      ) : abandoned ? (
        <Ban className="size-3 shrink-0" strokeWidth={1.75} />
      ) : task.time ? (
        <Clock3 className="size-3 shrink-0" strokeWidth={1.75} />
      ) : task.folder ? (
        <Folder
          className="size-3.5 shrink-0"
          style={{ color: task.folder.color }}
          strokeWidth={1.75}
        />
      ) : (
        <CalendarDays
          className="size-3.5 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
        />
      )}
      {task.time ? <span className="shrink-0 text-[var(--color-graphite-500)]">{task.time}</span> : null}
      <span className="truncate">{task.title}</span>
    </button>
  )
}

function PlannedCalendar({
  tasks,
  onCreateAtDate,
  onOpenTask,
  onOpenGhost,
}: {
  tasks: PlannedTask[]
  onCreateAtDate: (date: string) => void
  onOpenTask: (taskId: string) => void
  onOpenGhost: (taskId: string) => void
}) {
  const [zoom, setZoom] = useState<CalendarZoom>("month")
  const [anchor, setAnchor] = useState(() => parseDate(todayKey))

  const dates = useMemo(() => {
    if (zoom === "day") return [anchor]
    if (zoom === "week") {
      const start = startOfWeek(anchor)
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    return monthDates(anchor)
  }, [anchor, zoom])

  const ghosts = useMemo(
    () =>
      tasks
        .filter(
          (task) => (task.status ?? "pending") === "pending" && task.recurrence,
        )
        .map((task) => ({ ...task, date: dateKey(addDays(parseDate(task.date), 7)) })),
    [tasks],
  )

  function move(direction: -1 | 1) {
    setAnchor((current) => {
      if (zoom === "day") return addDays(current, direction)
      if (zoom === "week") return addDays(current, 7 * direction)
      return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + direction, 10))
    })
  }

  const columns = zoom === "day" ? 1 : 7

  return (
    <div className="mt-5 mb-20 overflow-hidden rounded-[10px] border border-[var(--color-graphite-200)] bg-white">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-36 truncate px-2 text-base leading-6 font-semibold text-[var(--color-graphite-800)]">
            {formatCalendarTitle(anchor, zoom)}
          </h2>
          <Button
            variant="outline"
            className="h-[var(--control-height)] border-[var(--color-graphite-200)] bg-white px-3 text-[13px] font-medium text-[var(--color-graphite-700)] shadow-none hover:bg-[var(--color-graphite-50)]"
            onClick={() => setAnchor(parseDate(todayKey))}
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
              aria-label="Previous period"
              onClick={() => move(-1)}
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-[var(--control-height)] rounded-none text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-900)]"
              aria-label="Next period"
              onClick={() => move(1)}
            >
              <ChevronRight className="size-5" strokeWidth={1.75} />
            </Button>
          </div>

          <div
            className="flex h-11 items-center rounded-lg border border-[var(--color-graphite-200)] bg-white p-0.5"
            role="group"
            aria-label="Calendar zoom"
          >
            {(["day", "week", "month"] as CalendarZoom[]).map((option) => (
              <Button
                key={option}
                variant="ghost"
                className={cn(
                  "h-[var(--control-height)] rounded-md px-3 text-[13px] font-medium capitalize text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)]",
                  zoom === option &&
                    "bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)] hover:bg-[var(--color-graphite-100)]",
                )}
                aria-pressed={zoom === option}
                onClick={() => setZoom(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="grid border-b border-[var(--color-graphite-200)] bg-white"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {(zoom === "day"
          ? [weekdayLabels[(anchor.getUTCDay() + 6) % 7]]
          : weekdayLabels
        ).map((label) => (
          <div
            key={label}
            className="flex h-9 items-center px-2 text-[11px] font-semibold tracking-[0.04em] text-[var(--color-graphite-500)] uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {dates.map((date, index) => {
          const key = dateKey(date)
          const realEvents = tasks
            .filter((task) => task.date === key)
            .sort(
              (a, b) =>
                Number(Boolean(a.time)) - Number(Boolean(b.time)) ||
                (a.time ?? "").localeCompare(b.time ?? ""),
            )
          const ghostEvents = ghosts.filter((task) => task.date === key)
          const cellEvents = [
            ...realEvents.map((task) => ({ task, ghost: false })),
            ...ghostEvents.map((task) => ({ task, ghost: true })),
          ]
          const visibleEvents =
            zoom === "month" ? cellEvents.slice(0, 2) : cellEvents
          const hiddenEventCount = cellEvents.length - visibleEvents.length
          const outsideMonth =
            zoom === "month" && date.getUTCMonth() !== anchor.getUTCMonth()
          const weekend = zoom !== "day" && index % 7 > 4

          return (
            <div
              key={key}
              className={cn(
                "group/calendar-cell relative min-h-[92px] border-r border-b border-[var(--color-graphite-100)] p-1.5",
                zoom === "day" && "min-h-[480px]",
                zoom === "week" && "min-h-[420px]",
                outsideMonth && "bg-[var(--color-graphite-25)]",
                weekend && !outsideMonth && "bg-[var(--color-graphite-25)]/35",
                index % columns === columns - 1 && "border-r-0",
                index >= dates.length - columns && "border-b-0",
              )}
            >
              <button
                type="button"
                className="absolute inset-0 z-0 rounded-none text-left outline-none transition-colors hover:bg-[var(--color-graphite-50)]/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
                aria-label={`Create task on ${key}`}
                onClick={() => onCreateAtDate(key)}
              />

              <div className="pointer-events-none relative z-10 mb-1.5 flex h-6 items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md text-xs font-medium text-[var(--color-graphite-600)]",
                    key === todayKey &&
                      "bg-[var(--color-graphite-900)] text-white",
                    outsideMonth &&
                      key !== todayKey &&
                      "text-[var(--color-graphite-400)]",
                  )}
                >
                  {date.getUTCDate()}
                </span>
                <Plus
                  className="size-3.5 text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/calendar-cell:opacity-100 group-focus-within/calendar-cell:opacity-100"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>

              <div className="relative z-10 space-y-0.5">
                {visibleEvents.map(({ task, ghost }) => (
                  <CalendarEvent
                    key={`${ghost ? "ghost-" : ""}${task.id}-${key}`}
                    task={task}
                    ghost={ghost}
                    compact={zoom === "month"}
                    onOpen={() =>
                      ghost ? onOpenGhost(task.id) : onOpenTask(task.id)
                    }
                  />
                ))}
                {hiddenEventCount > 0 ? (
                  <button
                    type="button"
                    className="flex h-5 items-center rounded-[4px] px-1.5 text-[10px] font-semibold text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                    onClick={() => {
                      setAnchor(date)
                      setZoom("day")
                    }}
                  >
                    +{hiddenEventCount} more
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PlannedScreen({
  tasks,
  calendarTasks,
  previewState,
  initialMode,
  onAdd,
  onOpenFullForm,
  onCreateAtDate,
  onOpenTask,
  onOpenGhost,
  onToggleComplete,
  onToggleImportant,
  onRename,
  expansion,
  onRestore,
}: PlannedScreenProps) {
  const [mode, setMode] = useState<PlannedMode>(() => {
    if (initialMode) return initialMode
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY)
    return stored === "calendar" ? "calendar" : "list"
  })

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  }, [mode])

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-14 items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarDays className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]" strokeWidth={1.75} aria-hidden="true" />
          <div>
            <h1 className="text-2xl leading-8 font-semibold">Planned</h1>
            <p className="mt-1 text-xs text-[var(--color-graphite-500)]">Tasks with a due date</p>
          </div>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} />
      </header>

      {previewState === "loading" ? (
        <div className="mt-6"><SkeletonList /></div>
      ) : previewState === "error" ? (
        <div className="mt-6"><InlineError /></div>
      ) : mode === "calendar" ? (
        <PlannedCalendar tasks={calendarTasks} onCreateAtDate={onCreateAtDate} onOpenTask={onOpenTask} onOpenGhost={onOpenGhost} />
      ) : tasks.length === 0 || previewState === "empty" ? (
        <Empty className="min-h-80">
          <EmptyMedia className="text-[var(--color-graphite-400)]"><CalendarDays className="size-9" strokeWidth={1.6} /></EmptyMedia>
          <EmptyHeader><EmptyDescription className="text-sm">Nothing scheduled. Give any task a due date and it moves here.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <section className="mt-6" aria-label="Dated open tasks">
          <div role="list" className="space-y-0.5">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                {...task}
                onOpen={() => onOpenTask(task.id)}
                onToggleComplete={(completed) =>
                  task.status === "abandoned"
                    ? onRestore(task.id)
                    : onToggleComplete(task.id, completed)
                }
                onToggleImportant={() => onToggleImportant(task.id)}
                onRename={(title) => onRename(task.id, title)}
                expanded={expansion?.render(task.id)}
                isExpanded={expansion?.openId === task.id}
                onToggleExpanded={
                  expansion ? () => expansion.toggle(task.id) : undefined
                }
              />
            ))}
          </div>
          <QuickAdd folderName="Inbox" label="Add scheduled task" onAdd={onAdd} onOpenFullForm={onOpenFullForm} />
        </section>
      )}
    </div>
  )
}
