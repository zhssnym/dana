// The date, reminder and repeat pickers and their parts, shared by every surface.
// Each opens on likely answers, then a hairline, then the exact controls. Choosing commits.

import { Ban, Repeat2, type LucideIcon } from "../lib/icons.js"
import { ConfirmDialog } from "./ui/ConfirmDialog.js"
import { CLEAR_DATE_WARNING, DATE_CLEAR } from "./task-copy.js"
import { createContext, useContext, useRef, useState, type ReactNode } from "react"
import { Check as CheckIcon } from "../lib/icons.js"

import { Calendar, sameDay } from "./ui/calendar.js"
// Pickers write their own endpoints and also call `patch`: `conceptPatchToBody` drops
// `due` and `reminder`, so `patch` alone never reaches the server. The local call keeps
// the chips right in the same render (AC-092); the refetch reconciles.
import { useDeleteReminder, usePutReminder, useUpdateTask } from "../api/mutations.js"
import { isoDay, parseIsoDate } from "../tasks/task-model.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { formatTime, parseTypedTime, useTimeFormat } from "../lib/time-format.js"
// `today()` is a function so a page left open past midnight does not offer yesterday.
import {
  DAY_LONG,
  DAY_SHORT,
  MONTH_SHORT,
  WEEKDAY_KEYS,
  WORKING_WEEK,
  addDays,
  clockOfMinutes,
  dueLabelFor,
  minutesOfClock,
  nextWeekday,
  ordinal,
  parseDueLabel,
  repeatAnchor,
  reminderWords,
  repeatSummary,
  ruleFor,
  today,
  type ConceptTask,
} from "../tasks/task-model.js"
import { cn } from "./ui/utils.js"
import { Segmented } from "./ui/segmented.js"
import { formatDate, formatDay } from "../lib/dates.js"
import { todayInBrowserZone } from "../api/tz.js"

// The day beside a preset: "Sat" for "This weekend", "24 Sep" where the day word would
// repeat the label.
function presetHint(date: Date): string {
  return `${DAY_SHORT[date.getDay()] ?? ""} ${formatDate(isoDay(date), todayInBrowserZone())}`
}

// A time field on the viewer's 12/24h clock (the native input ignores it). Commits on
// Enter or blur, never per keystroke; empty clears it, unreadable text is put back.
export function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string
  // "HH:MM", or null for no time.
  value: string | null
  onCommit: (time: string | null) => void
}) {
  const format = useTimeFormat()
  const shown = value === null ? "" : (formatTime(value, format) ?? value)
  const [draft, setDraft] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  // Escape closes the popover and must not commit on the blur that follows.
  const skip = useRef(false)
  const commit = (text: string | null) => {
    setDraft(null)
    if (text === null) return
    const typed = text.trim()
    if (typed === "") {
      setUnreadable(false)
      if (value !== null) onCommit(null)
      return
    }
    const time = parseTypedTime(typed)
    if (time === null) {
      setUnreadable(true)
      return
    }
    setUnreadable(false)
    if (time !== value) onCommit(time)
  }
  return (
    <>
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        aria-label={label}
        aria-invalid={unreadable || undefined}
        placeholder={format === "12" ? "9:00 AM" : "09:00"}
        value={draft ?? shown}
        onChange={(event) => {
          setDraft(event.target.value)
          setUnreadable(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(draft)
          } else if (event.key === "Escape") {
            skip.current = true
            setDraft(null)
          }
        }}
        onBlur={() => {
          if (skip.current) {
            skip.current = false
            return
          }
          commit(draft)
        }}
        className="h-[var(--control-height)] w-full min-w-0 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {unreadable ? (
        <p role="status" className="pt-1.5 text-xs text-destructive">
          {`Type a time, like ${format === "12" ? "2:30 PM" : "14:30"}.`}
        </p>
      ) : null}
    </>
  )
}

// A picker closes once its question is answered (AC-092). A context, because the option
// that answers sits three levels below the popover. Repeat presets stay open on purpose.
const PickerClose = createContext<(() => void) | null>(null)

/** Closes the picker this control sits in, where there is one. */
export function usePickerClose(): () => void {
  const close = useContext(PickerClose)
  return () => close?.()
}

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

// A property row that opens a panel. The field name starts the button's name, so it
// reads "Date Tomorrow" and tests can address the row by field.
export function PropertyPicker({
  label,
  value,
  empty = false,
  tone,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  label: string
  value: string
  /** The row has no value yet; the value is drawn muted. */
  empty?: boolean
  /** A late date says so in the danger ink. */
  tone?: "danger"
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  function change(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={PROPERTY_ROW}
          >
            <span className={PROPERTY_LABEL}>{label}</span>
            <span
              className={cn(
                "min-w-0 truncate",
                empty ? "text-muted-foreground" : "text-foreground",
                tone === "danger" && "text-destructive",
              )}
            >
              {value}
            </span>
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <PickerClose value={() => change(false)}>{children}</PickerClose>
      </PopoverContent>
    </Popover>
  )
}

/** One row of the task panel's properties block: the name, then the value. */
export const PROPERTY_ROW =
  "grid h-[var(--control-height)] w-full grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-2 text-left text-sm transition-colors duration-100 hover:bg-accent data-popup-open:bg-accent"
export const PROPERTY_LABEL = "truncate text-muted-foreground"
// Where PROPERTY_ROW's value column starts, in px: px-2 + 6rem label + gap-2 = 7rem.
export const PROPERTY_VALUE_OFFSET = 112

// One choice, shaped like a menu item with its resolved value on the right. Options are
// buttons (`aria-pressed`), as AC-092 reaches them; only the repeat list is a menu.
export function PickerOption({
  icon: Icon,
  label,
  hint,
  active,
  onSelect,
  menu = false,
  finishes = false,
}: {
  icon?: LucideIcon
  label: string
  hint?: string
  active: boolean
  onSelect: () => void
  // Choosing this answers the whole field, so the picker closes.
  finishes?: boolean
  // One of the repeat panel's named rules rather than a value.
  menu?: boolean
}) {
  const close = usePickerClose()
  return (
    <button
      type="button"
      {...(menu ? { role: "menuitem" } : { "aria-pressed": active })}
      onClick={() => {
        onSelect()
        if (finishes) close()
      }}
      className={cn(
        "flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
        T_FAST,
        "hover:bg-accent",
        active
          ? "font-medium text-foreground"
          : "text-foreground",
      )}
    >
      {Icon ? (
        <Icon
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {/* The hint is `aria-hidden`: a name that carried today's date would change every day,
         and tests reach presets by exact name. */}
      {hint ? (
        <span
          aria-hidden="true"
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {hint}
        </span>
      ) : null}
      {/* The tick keeps its place, so the list never reflows as the selection moves. */}
      <CheckIcon
        className={cn(
          "size-3.5 shrink-0 text-foreground transition-opacity",
          T_FAST,
          active ? "opacity-100" : "opacity-0",
        )}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </button>
  )
}

// The hairline between a picker's easy answers and its exact ones.
export function PickerDivider() {
  return <div aria-hidden="true" className="my-1 h-px bg-border" />
}

// A row of short exclusive choices, for sets you compare at a glance.
export function PickerSegments({
  label,
  name,
  options,
  active,
  onPick,
}: {
  // Absent where the row already names the field; an empty string keeps the column so
  // rows align.
  label?: string
  // The group's accessible name where `label` is absent or empty.
  name?: string
  options: { key: string; label: string }[]
  active: string
  onPick: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      {label === undefined ? null : (
        <span className="w-12 shrink-0 text-xs text-muted-foreground">
          {label}
        </span>
      )}
      <Segmented
        label={name ?? (label || "Choice")}
        value={active}
        options={options.map((option) => ({ value: option.key, label: option.label }))}
        onValueChange={onPick}
      />
    </div>
  )
}

export interface PanelProps {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
}

// "Next week" is next Monday, or the Monday after when next Monday is tomorrow.
function nextWeekAfter(from: Date): Date {
  const monday = nextWeekday(from, 1)
  return sameDay(monday, addDays(from, 1)) ? addDays(monday, 7) : monday
}

// Shown when a start would fall after the due date; nothing is written (the server
// answers 422).
export const START_AFTER_DUE = "The start must be on or before the due date."

export function DuePanel({ task, patch }: PanelProps) {
  // One schedule, two ends: the panel edits the due date unless switched to Starts.
  // A task not made yet has only a due date.
  const [end, setEnd] = useState<"due" | "start">("due")
  const [refused, setRefused] = useState(false)
  const dueDate = task.due ? parseDueLabel(task.due.label) : null
  const startDate = task.start === undefined ? null : parseIsoDate(task.start)
  const editingStart = end === "start" && task.id !== "new"
  const selected = editingStart ? startDate : dueDate
  // The due picker opens with its grid showing: a due date is a day (AC-219).
  const [confirming, setConfirming] = useState(false)
  const close = usePickerClose()
  // A due time under the day. Changing it rewrites the reminder in the same PATCH, in the
  // mode the task now takes, because the server deletes a reminder whose mode no longer fits.
  const format = useTimeFormat()
  const at = task.dueTime ?? null
  const [moved, setMoved] = useState<string | null>(null)
  const labelWithTime = (day: Date, time: string | null) => {
    const label = dueLabelFor(day)
    return time === null ? label : { ...label, label: `${label.label} ${formatTime(time, format) ?? time}` }
  }
  const setAt = (time: string | null) => {
    const day = dueDate ?? today()
    const was = task.reminderAt
    let reminder: { at: number; body: { offset_minutes: number | null; time_of_day: string | null } } | null = null
    let note: string | null = null
    if (was !== undefined && time !== null) {
      const due = minutesOfClock(time)
      const kept = Math.min(was, due)
      if (kept !== was) note = `The reminder moved to ${formatTime(time, format) ?? time}.`
      reminder = { at: kept, body: { offset_minutes: due - kept, time_of_day: null } }
    } else if (was !== undefined) {
      if (was >= 0) reminder = { at: was, body: { offset_minutes: null, time_of_day: clockOfMinutes(was) } }
      else note = "The reminder was on the day before, which needs a due time, so it was removed."
    }
    setMoved(note)
    patch(task.id, {
      dueTime: time ?? undefined,
      due: labelWithTime(day, time),
      reminder: reminder === null ? undefined : reminderWords(day, reminder.at),
      reminderAt: reminder?.at,
    })
    // One PATCH: the server upserts the reminder after its cascade, in one transaction.
    update.mutate({
      id: task.id,
      body: reminder === null ? { due_time: time } : { due_time: time, reminder: reminder.body },
    })
  }
  // Choosing a day answers the field, from the grid or a preset, so both close.
  const update = useUpdateTask()
  const set = (date: Date) => {
    const day = isoDay(date)
    // Refused here as the server would refuse it; nothing moves.
    const crosses = editingStart
      ? dueDate !== null && day > isoDay(dueDate)
      : task.start !== undefined && day < task.start
    if (crosses) {
      setRefused(true)
      return
    }
    setRefused(false)
    if (editingStart) {
      patch(task.id, { start: day })
      update.mutate({ id: task.id, body: { start_date: day } })
      close()
      return
    }
    // The day moves and the time stays, as the server keeps it.
    patch(task.id, { due: labelWithTime(date, at) })
    // A task not made yet has no id; its draft carries the day into the create.
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: isoDay(date) } })
    close()
  }
  // Clearing the date also ends the repeat and removes the reminder (8.4).
  const cascades = Boolean(task.recurrence) || Boolean(task.reminder)
  const clear = () => {
    patch(task.id, {
      due: undefined,
      // Local state so the strip is right in the same render; the server runs the cascade.
      recurrence: false,
      reminder: undefined,
      reminderAt: undefined,
      dueTime: undefined,
    })
    // One request: the server's cascade runs inside its own transaction.
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: null } })
  }

  // "This weekend" only Monday to Thursday; on Friday it is "Tomorrow", and at the
  // weekend it is now.
  const saturday = nextWeekday(today(), 6)
  const presets = [
    { label: "Today", date: today() },
    { label: "Tomorrow", date: addDays(today(), 1) },
    ...(today().getDay() >= 1 && today().getDay() <= 4
      ? [{ label: "This weekend", date: saturday }]
      : []),
    // Never the same day as "Tomorrow" (see `nextWeekAfter`).
    { label: "Next week", date: nextWeekAfter(today()) },
  ]

  return (
    <div className="w-[268px]">
      {/* The popover already has `role="dialog"`, so the preset list must not also be a menu:
         strict-mode locators would find two pickers. */}
      {task.id === "new" ? null : (
        <PickerSegments
          name="Which date"
          options={[
            { key: "due", label: "Due" },
            { key: "start", label: "Starts" },
          ]}
          active={end}
          onPick={(key) => {
            setRefused(false)
            setEnd(key === "start" ? "start" : "due")
          }}
        />
      )}
      {refused ? (
        <p role="status" className="px-2 pb-1 text-xs text-destructive">
          {START_AFTER_DUE}
        </p>
      ) : null}
      <div role="group" aria-label={editingStart ? "Start date" : "Due date"} className="flex flex-col">
        {presets.map((preset) => (
          <PickerOption
            finishes
            key={preset.label}
            label={preset.label}
            hint={presetHint(preset.date)}
            active={sameDay(selected, preset.date)}
            onSelect={() => set(preset.date)}
          />
        ))}
        <PickerOption
          icon={Ban}
          label={selected ? DATE_CLEAR : "No date"}
          active={!selected}
          onSelect={() => {
            if (editingStart) {
              // A start clears alone: nothing cascades from it.
              if (task.start === undefined) return
              setRefused(false)
              patch(task.id, { start: undefined })
              update.mutate({ id: task.id, body: { start_date: null } })
              close()
              return
            }
            if (!task.due) return
            // The warning lives in this popover, so close only when there is nothing to ask.
            if (cascades) setConfirming(true)
            else {
              clear()
              close()
            }
          }}
        />
      </div>
      {confirming ? (
        <ConfirmDialog
          message={CLEAR_DATE_WARNING}
          onContinue={() => {
            setConfirming(false)
            clear()
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      <PickerDivider />

      {/* The grid always shows; a toggle row would read as a setting. */}
      <div className="pt-1">
        <Calendar
          // Keyed on the end, so switching shows that end's month.
          key={end}
          selected={selected}
          {...(startDate !== null && dueDate !== null ? { range: { from: startDate, to: dueDate } } : {})}
          onSelect={set}
          today={today()}
        />
      </div>

      {task.due && !editingStart && task.id !== "new" ? (
        <>
          <PickerDivider />
          <div className="flex items-center gap-2 px-2 pt-1.5 text-xs text-muted-foreground">
            <span className="w-10 shrink-0">Time</span>
            <div className="min-w-0 flex-1">
              <TimeField label="Due time" value={at} onCommit={setAt} />
            </div>
          </div>
          {moved === null ? null : (
            <p role="status" className="px-2 pt-1.5 text-xs text-muted-foreground">
              {moved}
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

// A reminder follows the task's dating: a date-only task stores a clock time, a timed
// task an offset before it. Offered only with a due date. One after the due time is refused.
export function ReminderPanel({ task, patch }: PanelProps) {
  const format = useTimeFormat()
  const put = usePutReminder()
  const drop = useDeleteReminder()
  const due = task.due ? parseDueLabel(task.due.label) : null
  const dueAt = task.dueTime === undefined ? null : minutesOfClock(task.dueTime)
  const at = task.reminder ? (task.reminderAt ?? null) : null

  const [refused, setRefused] = useState(false)
  // `minutes` is from the due day's midnight; negative is the day before.
  const setAt = (minutes: number) => {
    if (dueAt !== null && minutes > dueAt) {
      setRefused(true)
      return
    }
    setRefused(false)
    patch(task.id, { reminder: reminderWords(due, minutes), reminderAt: minutes })
    put.mutate({
      taskId: task.id,
      body:
        dueAt === null
          ? { offset_minutes: null, time_of_day: clockOfMinutes(minutes) }
          : { offset_minutes: dueAt - minutes, time_of_day: null },
    })
  }
  const clearAt = () => {
    setRefused(false)
    patch(task.id, { reminder: undefined, reminderAt: undefined })
    // Removal is `DELETE /tasks/:id/reminder`.
    drop.mutate(task.id)
  }

  const clock = (minutes: number) => formatTime(clockOfMinutes(minutes), format) ?? clockOfMinutes(minutes)
  const quick: { label: string; minutes: number; hint?: string }[] =
    dueAt === null
      ? [9 * 60, 12 * 60, 17 * 60].map((minutes) => ({ label: clock(minutes), minutes }))
      : [
          { label: "At due time", minutes: dueAt, hint: clock(dueAt) },
          { label: "1 hour before", minutes: dueAt - 60, hint: clock(dueAt - 60) },
          // The hint names the earlier day, so it never reads like "At due time".
          {
            label: "Day before",
            minutes: dueAt - 1440,
            hint: `${due === null ? "" : `${formatDay(isoDay(addDays(due, -1)), todayInBrowserZone())} `}${clock(dueAt)}`,
          },
        ]

  return (
    <div className="w-[268px]">
      {/* One role per picker; see the due panel above. */}
      <div role="group" aria-label="Reminder" className="flex flex-col">
        {quick.map((option) => (
          <PickerOption
            finishes
            key={option.label}
            label={option.label}
            {...(option.hint === undefined ? {} : { hint: option.hint })}
            active={at === option.minutes}
            onSelect={() => setAt(option.minutes)}
          />
        ))}
        {/* Nothing cascades from removing a reminder, so it asks nothing. */}
        <PickerOption
          finishes
          icon={Ban}
          label="No reminder"
          active={at === null}
          onSelect={() => {
            if (task.reminder) clearAt()
          }}
        />
      </div>

      <PickerDivider />

      {/* Open rather than behind a disclosure (AC-169). */}
      <div className="px-2 pt-1.5">
        <TimeField
          label="Reminder time"
          value={at !== null && at >= 0 ? clockOfMinutes(at) : null}
          onCommit={(time) => {
            if (time === null) clearAt()
            else setAt(minutesOfClock(time))
          }}
        />
        {refused && dueAt !== null ? (
          <p role="status" className="pt-1.5 text-xs text-destructive">
            {`The reminder must be at or before ${clock(dueAt)}.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// Commits on Enter or blur, so "12" is one write, not "1" then "12".
function IntervalField({ value, onCommit }: { value: number; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const next = Math.round(Number(draft))
    if (Number.isFinite(next) && next >= 1 && next <= 99 && next !== value) onCommit(next)
  }
  return (
    <input
      type="number"
      min={1}
      max={99}
      aria-label="Repeat every"
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
      }}
      onBlur={commit}
      className="h-[var(--control-height)] w-16 rounded-md border border-border bg-card px-2 text-sm tabular-nums text-foreground outline-none"
    />
  )
}

export function RepeatPanel({ task, patch }: PanelProps) {
  const anchor = repeatAnchor(task)
  const summary = repeatSummary(task)
  // Every choice writes the whole rule. A draft ("new") keeps it on the card alone.
  const update = useUpdateTask()
  const commit = (fields: Partial<ConceptTask>) => {
    patch(task.id, fields)
    if (task.id === "new") return
    update.mutate({ id: task.id, body: { recurrence_rule: ruleFor({ ...task, ...fields }) } })
  }

  // Each preset is spelled out against this task's own date.
  const presets: { label: string; fields: Partial<ConceptTask> }[] = [
    {
      label: "Daily",
      fields: { recurrence: true, repeatUnit: "day", repeatEvery: "1", repeatDays: [] },
    },
    {
      label: `Weekly on ${DAY_LONG[anchor.getDay()]}`,
      fields: {
        recurrence: true,
        repeatUnit: "week",
        repeatEvery: "1",
        // The filter satisfies `noUncheckedIndexedAccess`; the `% 7` index never misses.
        repeatDays: [WEEKDAY_KEYS[(anchor.getDay() + 6) % 7]].filter(
          (day): day is string => day !== undefined,
        ),
      },
    },
    {
      label: "Every weekday",
      fields: {
        recurrence: true,
        repeatUnit: "week",
        repeatEvery: "1",
        repeatDays: [...WORKING_WEEK],
      },
    },
    {
      label: `Monthly on the ${ordinal(anchor.getDate())}`,
      fields: { recurrence: true, repeatUnit: "month", repeatEvery: "1", repeatDays: [], repeatMonthDay: undefined },
    },
    {
      label: `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()]}`,
      fields: { recurrence: true, repeatUnit: "year", repeatEvery: "1", repeatDays: [] },
    },
  ]
  // A rule none of the presets names opens on the exact controls.
  const [custom, setCustom] = useState(
    () => task.recurrence === true && !presets.some((preset) => preset.label === summary),
  )
  // End options count from the task's date so none is already past; a stored end they do
  // not name is offered as itself. "A month on" from the 31st is the next month's last day.
  const lastOfNext = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0).getDate()
  const monthOn = isoDay(
    new Date(anchor.getFullYear(), anchor.getMonth() + 1, Math.min(anchor.getDate(), lastOfNext)),
  )
  const yearEnd = `${String(anchor.getFullYear() + (anchor.getMonth() === 11 ? 1 : 0))}-12-31`
  const ends = [monthOn, yearEnd]
  if (task.repeatEnds !== undefined && !ends.includes(task.repeatEnds)) ends.push(task.repeatEnds)
  const now = todayInBrowserZone()
  // A weekly rule naming no days repeats on its date's weekday, so that day shows chosen.
  const anchorKey = WEEKDAY_KEYS[(anchor.getDay() + 6) % 7] ?? "Mo"
  const weekDays = task.repeatDays?.length ? task.repeatDays : [anchorKey]
  // What the exact controls show for a task that does not repeat yet.
  const unit = task.recurrence ? (task.repeatUnit ?? "week") : "week"
  const every = task.recurrence ? Math.max(1, Number(task.repeatEvery ?? "1") || 1) : 1
  const customCommit = (fields: Partial<ConceptTask>) =>
    commit({
      recurrence: true,
      repeatUnit: unit,
      repeatEvery: String(every),
      ...(task.recurrence ? {} : { repeatDays: [], repeatEnds: undefined, repeatMonthDay: undefined }),
      ...fields,
    })

  return (
    <div className="w-[268px]">
      {/* One role per picker; see the due panel above. */}
      <div role="group" aria-label="Repeat" className="flex flex-col">
        <PickerOption
          menu
          icon={Ban}
          label="Does not repeat"
          active={!task.recurrence}
          onSelect={() => {
            setCustom(false)
            commit({
              recurrence: false,
              repeatDays: [],
              repeatEvery: "1",
              repeatEnds: undefined,
              repeatMonthDay: undefined,
            })
          }}
        />
        {presets.map((preset) => (
          <PickerOption
          menu
            key={preset.label}
            label={preset.label}
            active={task.recurrence === true && summary === preset.label}
            // An existing end (UNTIL) is kept.
            onSelect={() => commit(preset.fields)}
          />
        ))}
      </div>

      <PickerDivider />

      {/* Opening the exact controls writes nothing; the first value picked there starts the repeat. */}
      <PickerOption
        menu
        icon={Repeat2}
        label="Custom repeat…"
        // Ticked only for a rule no preset names: one tick per panel.
        active={task.recurrence === true && !presets.some((preset) => preset.label === summary)}
        onSelect={() => setCustom((open) => !open)}
      />

      {custom ? (
        <div className="pt-1">
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">Every</span>
            <IntervalField
              value={every}
              onCommit={(next) => customCommit({ repeatEvery: String(next) })}
            />
          </div>
          {/* Four equal segments on their own row, so plural labels fit the 268px panel. */}
          <div className="px-2 py-1">
            <Segmented
              label="Unit"
              className="w-full [&>button]:min-w-0 [&>button]:flex-1"
              value={unit}
              options={[
                { value: "day", label: every === 1 ? "day" : "days" },
                { value: "week", label: every === 1 ? "week" : "weeks" },
                { value: "month", label: every === 1 ? "month" : "months" },
                { value: "year", label: every === 1 ? "year" : "years" },
              ]}
              onValueChange={(key) =>
                customCommit({ repeatUnit: key as ConceptTask["repeatUnit"] })
              }
            />
          </div>
          {unit === "week" ? (
            <div className="px-2 py-1">
              {/* A seven-column grid on its own line: seven 28px buttons plus a label overflow the
                 268px panel. */}
              <span className="mb-1 block text-xs text-muted-foreground">
                On
              </span>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_KEYS.map((day) => {
                  const on = weekDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_LONG[(WEEKDAY_KEYS.indexOf(day) + 1) % 7] ?? day}
                      onClick={() =>
                        customCommit({
                          repeatDays: on
                            ? weekDays.filter((d) => d !== day)
                            : [...weekDays, day],
                        })
                      }
                      className={cn(
                        "flex h-[var(--control-height)] w-full items-center justify-center rounded-md text-xs transition-colors",
                        T_FAST,
                        // A set, not one value: each chosen day takes the selected tint.
                        on
                          ? "bg-selected font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {day.slice(0, 1)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          <PickerSegments
            label="Until"
            active={task.repeatEnds ?? ""}
            options={[
              { key: "", label: "No end" },
              ...ends.map((end) => ({ key: end, label: formatDate(end, now) })),
            ]}
            onPick={(key) => customCommit({ repeatEnds: key || undefined })}
          />
        </div>
      ) : null}
    </div>
  )
}
