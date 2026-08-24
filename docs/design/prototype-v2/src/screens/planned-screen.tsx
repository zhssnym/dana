import { FolderMark } from "@/components/folder-mark"
import { useEffect, useMemo, useState } from "react"

import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  Plus,
  Repeat2,
} from "@/lib/icons"
import { PageHead, pageBodyClass } from "@/components/page-head"
import { CompletedSection } from "@/components/task-section"
import { TaskSection } from "@/components/task-section"
import { ViewStrip } from "@/components/view-strip"
import { WindowBarActions } from "@/components/window-bar"
import { QuickAdd } from "@/components/quick-add"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { TaskList, TaskRow, type TaskOpenMode, type TaskRowProps } from "@/components/task-row"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { TODAY_ISO } from "@/lib/task-model"
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
  /* Finished work, closing the page collapsed — Imran, 2026-08-22: every
     page that lists tasks ends in one, so the grammar is the same wherever
     you are. */
  completed?: (TaskRowProps & { id: string })[]
  previewState?: string | null
  initialMode?: PlannedMode
  /* The shell's view strip, when the shell is drawing one (DES-177). */
  view?: PlannedMode
  onAdd: (title: string) => void
  onOpenFullForm: () => void
  onCreateAtDate: (date: string) => void
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onOpenGhost: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  /* DES-152 renames this page Scheduled. */
  title?: string
  description?: string
}

const MODE_STORAGE_KEY = "dana-planned-mode"
/* One definition of today, from `task-model` — this page used to carry its
   own copy of the date, which happened to be right while the picker's anchor
   three files away was not. */
const todayKey = TODAY_ISO
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

/*
The time ladder, made of headings rather than of a control.

Imran asked whether Scheduled needs a Today · Week · Month · Year scope
control. It does not, and the reason is structural rather than a matter of
taste: **Today is already the first rung of that ladder**, and it is a page of
its own (DES-152). A ladder on Scheduled that starts at "Today" rebuilds the
overlap the whole navigation model exists to remove, and one starting at "This
week" still contains today. Meanwhile a scope control over a list already
sorted by date only truncates its tail, which the reader's eye does for free,
and Scheduled already owns a zoom — calendar mode's day/week/month — so a
second differently-shaped one would put two disagreeing zooms on one page.

So the division of labour is: **list reads forward from now, calendar jumps to
a point in time.** What the list owed was structure, not a control, and this
supplies it — the same day-group grammar Done uses, and the same "Carried
over" pinning that Today uses, so all three pages read alike.

Overdue is one section rather than one heading per past date: a person does not
need last Tuesday and last Thursday told apart, they need to know the pile
exists. Future dates keep their own headings, because there the date is the
thing being planned around.
*/
function labelForDate(key: string, todayIso: string) {
  const day = parseDate(key)
  const today = parseDate(todayIso)
  const diff = Math.round(
    (day.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(day)
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(day)
  /* Inside the coming week a weekday is what people plan by; past that, the
     weekday stops helping and the date carries it alone. */
  return diff > 1 && diff < 7 ? `${weekday} ${date}` : date
}

function buildDateSections(tasks: PlannedTask[], todayIso: string) {
  const overdue: PlannedTask[] = []
  const byDate = new Map<string, PlannedTask[]>()

  tasks.forEach((task) => {
    if (task.date < todayIso) {
      overdue.push(task)
      return
    }
    const bucket = byDate.get(task.date)
    if (bucket) bucket.push(task)
    else byDate.set(task.date, [task])
  })

  return [
    ...(overdue.length > 0
      ? [{ key: "overdue", label: "Overdue", rows: overdue }]
      : []),
    ...[...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({
        key,
        label: labelForDate(key, todayIso),
        rows,
      })),
  ]
}

/*
Planned's list/calendar toggle, now the same switcher every other surface uses
and now in the window bar.

Spec 9.5 asks for a mode toggle persisted client-side, and it still is. What
changed is that it stopped being a bespoke 44px segmented block sitting beside
the page's own name: DES-137 ruled every switcher is a collapsing icon strip,
DES-139 ruled that controls belonging to what a tab is showing are chrome and
live in the bar, and this control was the last one left inside a content
column. The folder page's view switcher and this one are now literally the
same component.
*/
function ModeSwitch({ mode, onChange }: { mode: PlannedMode; onChange: (mode: PlannedMode) => void }) {
  return (
    <ViewStrip
      ariaLabel="Planned view"
      value={mode}
      options={[
        { key: "list", label: "List view", icon: List },
        { key: "calendar", label: "Calendar view", icon: CalendarDays },
      ]}
      onSelect={onChange}
      collapse
    />
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
        /* Abandoned wears the full treatment only where a chip has room to
           be read (review C4): at day and week the strike says it plainly,
           while a month cell's 10px chip quiets to the glyph and a faded
           tone — a struck-through line at that size reads as damage, not as
           a state. */
        abandoned && "bg-white text-[var(--color-graphite-500)]",
        abandoned && (compact ? "opacity-70" : "line-through"),
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
        /* Scheduled's calendar chip carries the folder's chosen mark — Imran
           named this page specifically, and it was one of four surfaces still
           drawing the generic folder. */
        <FolderMark
          name={task.folder.name}
          color={task.folder.color}
          className="size-3.5 shrink-0"
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
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
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
      {/*
      The header, thinned — Imran, 2026-08-22: it "feels a bit oversized".

      It was 56px, and the height was a symptom: the row held **four boxed
      things** — a bordered pair of arrows with a divider between them, a
      bordered 44px group wrapping three 32px buttons, an outlined Today, and
      a shaded ground with a hairline under it. Every one of them drew its own
      edge, so the bar had to be tall enough to hold boxes inside boxes.

      What it is instead is the shell's own grammar, which this stretch has
      been applying everywhere else: **tone rather than hairlines**, controls
      that are the system's buttons at the system's size, and no container
      around a group of them — the gap already says they belong together. The
      arrows are two ghost buttons, the zoom is three buttons with the current
      one filled, and the whole row is 44px because that is a 32px control
      with breathing room and nothing more.
      */}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 bg-[var(--color-graphite-25)] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--color-graphite-600)]"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--color-graphite-600)]"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight strokeWidth={1.75} />
          </Button>
          {/* The month is the heading; the arrows read as its controls
              because they sit before it, which is the order every calendar
              people already use puts them in. */}
          <h2
            aria-live="polite"
            className="min-w-36 truncate px-1 text-base leading-6 font-semibold text-[var(--color-graphite-800)]"
          >
            {formatCalendarTitle(anchor, zoom)}
          </h2>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(parseDate(todayKey))}
          >
            Today
          </Button>
          <div className="flex items-center gap-0.5" role="group" aria-label="Calendar zoom">
            {(["day", "week", "month"] as CalendarZoom[]).map((option) => (
              <Button
                key={option}
                variant={zoom === option ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "capitalize",
                  zoom === option
                    ? "text-[var(--color-graphite-900)]"
                    : "text-[var(--color-graphite-600)]",
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
            /* The weekday heads read exactly as the date picker's do
               (`ui/calendar.tsx`): 11px medium in graphite-400, on a 28px
               row. They were 9px taller, semibold, uppercase and tracked —
               a second style for the same words, in the same product, two
               clicks apart. */
            className="flex h-7 items-center px-2 text-[11px] leading-4 font-medium text-[var(--color-graphite-400)]"
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
                    /* Today is cobalt, as it is in the date picker. It was a
                       filled graphite square — which is exactly how that
                       picker draws the day you have *selected*, so the same
                       shape meant "today" here and "chosen" there. DES-016
                       gives cobalt the today job; graphite fill keeps
                       selection. */
                    key === todayKey &&
                      "font-semibold text-[var(--color-dana-accent-700)]",
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
  completed = [],
  previewState,
  initialMode,
  onAdd,
  onOpenFullForm,
  onCreateAtDate,
  onOpenTask,
  onOpenGhost,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  title = "Planned",
  description = "Tasks with a due date",
  view,
}: PlannedScreenProps) {
  const dateSections = buildDateSections(tasks, todayKey)
  /*
  The view is the shell's now, not this screen's.

  This page owned a list/calendar switch of its own, and DES-177 made that a
  fork the moment every place-page had a strip: three views, one rule, and
  this screen would have been the only one deciding for itself which of them
  it offered. So the shell holds the view and this takes it as a prop, keeping
  its own state only for the route that seeds one — the sweep's
  `?mode=calendar` — and for a caller that renders it standalone.
  */
  const [ownMode, setOwnMode] = useState<PlannedMode>(() => {
    if (initialMode) return initialMode
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY)
    return stored === "calendar" ? "calendar" : "list"
  })
  const mode = view ?? ownMode

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  }, [mode])

  return (
    <div className={pageBodyClass()}>
      {view ? null : (
        <WindowBarActions order={-1}>
          <ModeSwitch mode={mode} onChange={setOwnMode} />
        </WindowBarActions>
      )}

      <PageHead
        storageName={title}
        icon={CalendarDays}
        title={title}
        description={description}
      />

      {previewState === "loading" ? (
        <div className="mt-3"><SkeletonList /></div>
      ) : previewState === "error" ? (
        <div className="mt-3"><InlineError /></div>
      ) : mode === "calendar" ? (
        <PlannedCalendar tasks={calendarTasks} onCreateAtDate={onCreateAtDate} onOpenTask={onOpenTask} onOpenGhost={onOpenGhost} />
      ) : tasks.length === 0 || previewState === "empty" ? (
        <Empty className="min-h-80">
          <EmptyMedia className="text-[var(--color-graphite-400)]"><CalendarDays className="size-9" strokeWidth={1.6} /></EmptyMedia>
          <EmptyHeader><EmptyDescription className="text-sm">Nothing scheduled. Give any task a due date and it moves here.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <section className="mt-3" aria-label="Dated open tasks">
          {dateSections.map((section) => (
            <TaskSection
              key={section.key}
              className="mb-6"
              id={`scheduled-${section.key}`}
              name={section.label}
              count={section.rows.length}
            >
              <TaskList
                onTaskOpen={onOpenTask}
                tasks={section.rows}
                renderRow={(task, wiring) => (
                  <TaskRow
                    key={task.id}
                    {...task}
                    {...wiring}
                    onOpen={(mode) => onOpenTask(task.id, mode)}
                    onToggleComplete={(completed) =>
                      task.status === "abandoned"
                        ? onRestore(task.id)
                        : onToggleComplete(task.id, completed)
                    }
                    onToggleImportant={() => onToggleImportant(task.id)}
                  />
                )}
              />
            </TaskSection>
          ))}
          <QuickAdd folderName="Desk" label="Add scheduled task" onAdd={onAdd} onOpenFullForm={onOpenFullForm} />
          {/* Finished dated work, in the same collapsed close every other
              page uses (Imran, 2026-08-22). Spec Q3 keeps completed rows out
              of the *list*, and this is a section under it rather than rows
              in it, so the ordering rule is untouched. */}
          <div className="mt-6">
            <CompletedSection count={completed.length}>
              <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} />
            </CompletedSection>
          </div>
        </section>
      )}
    </div>
  )
}
