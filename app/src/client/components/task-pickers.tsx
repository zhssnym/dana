/*
The three pickers that answer a question about time, and the parts they are
built from.

This is a module and not a copy because the date and time pickers are one
component wherever they appear, and changing them changes every place at once. A
picker copied into a second place is a picker that will one day disagree with
itself.

They share one shape: the answers somebody probably wants, a hairline, then one
option that opens everything exact. There is no Save and no Done; choosing
commits. The Due panel has no clock in it.
*/

import { Ban, Repeat2, type LucideIcon } from "../lib/icons.js"
import { ConfirmDialog } from "./ui/ConfirmDialog.js"
import { CLEAR_DATE_WARNING, DATE_CLEAR } from "./task-copy.js"
import { createContext, useContext, useState, type ReactNode } from "react"
import { Check as CheckIcon } from "../lib/icons.js"

/* 9.3's reminder row is "one picker, a time on that day", so what the panel
   asks for is a time and the plainest control that takes one is the platform's.
   The two-spinner clock in `ui/calendar.tsx` is not used here. */
import { Calendar, sameDay } from "./ui/calendar.js"
/*
**A picker writes its own field.**

`tasks/task-writer.tsx` receives a due date, a reminder and a repeat rule as the
*words a chip says* rather than as values, because that is what `ConceptTask`
holds; the pickers carry the values and call their own endpoints (7.6's PATCH,
7.9's PUT) here.

**Why the words are not enough.** A panel that only calls `patch` writes into
the card's local edits layer, so the chip updates, the row behind it updates,
and nothing reaches the server: `conceptPatchToBody` drops `due` and `reminder`
deliberately, and `unwritten()` exists to name that. 9.3: "every edit commits as
it is made, there is no Save control and no draft state", so an edit that
reaches no endpoint is a value held in the browser and nowhere else (AC-169,
AC-170).

**`patch` is still called, and both calls are load-bearing.** The local one is
what makes the strip right in the same render, which AC-092 requires of the two
date-dependent chips; the endpoint is what makes it true. 8.3's refetch is what
reconciles them, which is this client's whole invalidation strategy and is why
neither call is optimistic.

**The repeat rule is deliberately not wired here.** 4.11's subset needs a rule
built from the preset's operands and there is no builder for that, and shipping
a half-built rule is worse than shipping none, so the repeat stays a value the
card holds.
*/
import { useDeleteReminder, usePutReminder, useUpdateTask } from "../api/mutations.js"
import { isoDay, parseIsoDate } from "../tasks/task-model.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { formatTime, useTimeFormat } from "../lib/time-format.js"
/*
**`today()`, a function rather than a constant.** `tasks/task-model.ts` carries
it: a constant is evaluated at module load, so a browser left open across
midnight would go on offering yesterday as "Today" in every picker on the page.
The value itself is 4.11's today in the viewer's own zone, from `api/tz.ts`,
which is the one place this client evaluates a date.
*/
import {
  DAY_LONG,
  DAY_SHORT,
  MONTH_SHORT,
  WEEKDAY_KEYS,
  WORKING_WEEK,
  addDays,
  dueLabelFor,
  nextWeekday,
  ordinal,
  parseDueLabel,
  repeatAnchor,
  repeatSummary,
  ruleFor,
  today,
  type ConceptTask,
} from "../tasks/task-model.js"
import { cn } from "./ui/utils.js"
import { Segmented } from "./ui/segmented.js"
import { formatDate } from "../lib/dates.js"
import { todayInBrowserZone } from "../api/tz.js"

/* The day beside a preset, from the one formatter: "Sat" for "This weekend"
   so it says which day it means, and "24 Sep" where the day word would only
   repeat the preset's own label ("Today", "Tomorrow"). */
function presetHint(date: Date): string {
  return `${DAY_SHORT[date.getDay()] ?? ""} ${formatDate(isoDay(date), todayInBrowserZone())}`
}

/* The day a reminder's words carry: "24 Sep", never a relative word, since the
   words are kept and "Tomorrow" would be wrong by the next morning. */
function reminderDay(date: Date): string {
  return formatDate(isoDay(date), todayInBrowserZone())
}

/*
**A picker closes once its question is answered.**

9.3: "The pickers open on the answer, not the instrument: resolved presets
first, a calendar or list behind them." AC-092 reads the second half of that as
a state rather than a layout: the picker closes once the day is answered, which
is what "opens on the answer" means.

**A context rather than a prop, because the answer is given three levels down.**
`PickerChip` owns the popover; the panels inside it own the question; the
options inside those are what a person presses. Threading a close through all
three would put a callback on every panel's signature for a fact only one of
them uses.

**And it is per option rather than per press.** A due preset answers the whole
question and closes; a repeat preset does not, its operands living behind it, so
the repeat picker stays open on purpose. An option asks to close only where
choosing it finishes the field.
*/
const PickerClose = createContext<(() => void) | null>(null)

/** Closes the picker this control sits in, where there is one. */
export function usePickerClose(): () => void {
  const close = useContext(PickerClose)
  return () => close?.()
}

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

/*
**A property row that opens a panel rather than a list.**

The task panel's properties block is a stack of quiet rows, a muted name and
its value, each shown only once it is set. A row whose value is a day, a time
or a rule opens the whole control for that fact; choosing commits and closes.

The field's name is the visible label *and* the start of the button's name, so
a reader hears "Date Tomorrow" and a test can address the row by its field.

`defaultOpen` is for a row that "Add property" has just revealed: it appears
already asking its question. `onOpenChange` lets the block hide the row again
when it was dismissed without an answer.
*/
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
/* Where PROPERTY_ROW's value column starts, in px (a menu offset is a number):
   px-2 + the 6rem label + gap-2 = 7rem. A row's menu opens under its value. */
export const PROPERTY_VALUE_OFFSET = 112

/* One choice in a picker, shaped like a menu item rather than a pill: full
   width, on its own line, with the value it resolves to on the right where a
   person reads it instead of working it out. "Tomorrow" is only useful next
   to the date it means.

   Every picker in the card now leads with a list of these, because nearly
   every date anybody sets is one of about five, and making the common answer
   one click is worth more than the calendar it sits above. */
/*
**An option's role is the ordinary one, and the repeat list is the one
exception.**

The container is a group, one role per picker, so an option is not
`menuitemradio`: `getByRole('menuitem')` matches that role exactly rather than
its subtypes, so such an option would answer to nothing at all.

9.1's addressing sentence settles what it should be: "a control not named here
is reached by its role in the ordinary sense", and the ordinary role of a
control that sets a value is a button. AC-092 reads the due picker's presets
exactly that way, `getByRole('button', { name: 'Tomorrow', exact: true })`.

**The repeat list is a menu and says so.** A picker asking for a day or a time
is a small modal surface and carries the dialog role; one offering a list of
named choices is a menu. The due and reminder panels put a calendar or a clock
under their presets and are the first kind; the repeat panel is a list of named
rules and is the second.

The chosen option is `aria-pressed` on a button and font weight on a menu item,
because a menu item takes no pressed state and 9.3 asserts neither.
*/
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
  /* Choosing this answers the whole field, so the picker closes. See the
     context above; a repeat preset deliberately does not set it. */
  finishes?: boolean
  /* One of a list of named rules rather than a value the field takes. Only
     the repeat panel passes it; see the header above. */
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
      {/*
      **The hint is drawn and not announced.**

      It is the day a preset resolves to, "Sat 15 Aug" beside "This weekend".
      AC-092 asks for the preset by `{ name: 'Tomorrow', exact: true }`, and
      9.1's addressing sentence is why exact is the right ask: a control is
      reached by its name, and a name that carries today's date changes every
      day.

      `aria-hidden` rather than moving the hint out of the button, because the
      hint belongs inside the target a person presses, and because a screen
      reader is told the same fact by the calendar the panel opens onto.
       */}
      {hint ? (
        <span
          aria-hidden="true"
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {hint}
        </span>
      ) : null}
      {/* The tick holds its place whether or not it is showing, so a list of
          options never reflows by a few pixels as the selection moves. */}
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

/* The hairline between a picker's easy answers and its exact ones. */
export function PickerDivider() {
  return <div aria-hidden="true" className="my-1 h-px bg-border" />
}

/* One row of short exclusive choices, behaving like a segmented control. The
   only shape left in the pickers where a pill row is still right: a
   recurrence interval and its weekdays are a set you compare at a glance,
   not a menu you read down. */
export function PickerSegments({
  label,
  name,
  options,
  active,
  onPick,
}: {
  /* Absent where the row the picker opened from already names the field;
     an empty string keeps the column so rows below a labelled one align. */
  label?: string
  /* The group's accessible name where `label` is absent or empty. */
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

/* ---------------------------------------------------------- the pickers, */
/*
Due, Reminder and Repeat.

Nearly every date anybody sets is today, tomorrow, this weekend or next week, so
a picker that makes the rare answer and the common one cost the same is wrong.
All three open on the answers somebody probably wants, each showing the date it
resolves to, and keep the exact controls below a hairline. The shape is
deliberately identical across the three, so learning one teaches the other two,
and it is the shape the rest of the product's menus already have.

There is no Save and no Done. Choosing commits.
*/

export interface PanelProps {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
}

/*
All three panels are one shape: the answers somebody probably wants, a hairline,
then one option that opens everything exact. Only that last option can expand,
and only one thing is ever expanded, so the panel is the size of the question
being asked rather than the size of the largest question it could ask.
*/

/*
**The field has a Clear, and 8.4's warning stands in front of it.**

**9.3 keeps 8.4's warning verbatim and keeps it before the cascade**: "Clearing
the date also ends the repeat and removes the reminder." AC-092 is explicit that
this is a gate and not a notice: a warning the person declines must leave the
date, the repeat and the reminder exactly as they were. So the confirm runs
first and only a Continue writes.

**And the control is named "Clear"**, offered only while a date is set, and it
runs the same 8.4 warning any other way of emptying the field runs. Tests reach
it by that name in both this picker and the reminder's, so the two are one
control seen twice.

**The warning is skipped where there is nothing to cascade**, which is 8.4 read
rather than softened: a task with no repeat and no reminder loses nothing by
being undated, and a confirmation whose consequence is empty is a dead control.
*/
/* "Next week" is next Monday, the Monday after when next Monday is tomorrow. */
function nextWeekAfter(from: Date): Date {
  const monday = nextWeekday(from, 1)
  return sameDay(monday, addDays(from, 1)) ? addDays(monday, 7) : monday
}

/* Said where a start would land after the due date, or a due date before the
   start; nothing is written and neither end moves (#215, 7.6's 422). */
export const START_AFTER_DUE = "The start must be on or before the due date."

export function DuePanel({ task, patch }: PanelProps) {
  /*
  **One Schedule, two ends (#215).** The panel edits the due date unless the
  person switches to Starts; the presets, the grid and Clear then answer for
  that end, and the grid draws the span between them. A task not made yet has
  only a due date: its draft carries one day into the create.
  */
  const [end, setEnd] = useState<"due" | "start">("due")
  const [refused, setRefused] = useState(false)
  const dueDate = task.due ? parseDueLabel(task.due.label) : null
  const startDate = task.start === undefined ? null : parseIsoDate(task.start)
  const editingStart = end === "start" && task.id !== "new"
  const selected = editingStart ? startDate : dueDate
  /*
  **The due picker opens with its grid showing.**

  The other pickers keep their exact controls behind the last option, but a due
  date **is** a day, so the grid is not the exact option behind the easy ones,
  it is the field itself (AC-219: "the due picker opens on a day grid, a due
  date being a day").

  The presets stay above it and lose nothing: what changes is that the
  instrument for the field's own type is not folded away. The reminder and
  repeat panels keep the shared arrangement exactly, their exact answers being a
  clock and a rule rather than the field itself.
  */
  const [confirming, setConfirming] = useState(false)
  const close = usePickerClose()
  /*
  A time under the day, so "next Tuesday at 9" is one picker rather than two
  chips. It is the due date's own time (4.11's due_time), the one the Date row,
  the lists and the calendar all show; the reminder keeps its own row. Setting
  or clearing it moves the reminder's mode on the server (8.4's cascade).
  */
  const format = useTimeFormat()
  const at = task.dueTime ?? null
  const setAt = (time: string | null) => {
    const day = dueDate ?? today()
    const label = dueLabelFor(day)
    patch(task.id, {
      dueTime: time ?? undefined,
      due: { ...label, label: time === null ? label.label : `${label.label} ${formatTime(time, format) ?? time}` },
    })
    update.mutate({ id: task.id, body: { due_time: time } })
  }
  /* Choosing a day answers the field, from the grid exactly as from a preset,
     so both close. See `PickerClose`. */
  const update = useUpdateTask()
  const set = (date: Date) => {
    const day = isoDay(date)
    /* Refused here as the server would refuse it, and nothing moves. */
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
    patch(task.id, { due: dueLabelFor(date) })
    /* A task not made yet has no address; its draft carries the day into the
       create instead. */
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: isoDay(date) } })
    close()
  }
  /* 8.4's own cascade, which is what the sentence describes. */
  const cascades = Boolean(task.recurrence) || Boolean(task.reminder)
  const clear = () => {
    patch(task.id, {
      due: undefined,
      /* The client says what it believes so the strip is right in the same
         render; 8.4 is the server's and runs whatever this sends. */
      recurrence: false,
      reminder: undefined,
    })
    /* One request, because 8.4's cascade is the server's: clearing the date
       ends the repeat and removes the reminder inside 7.6's own transaction,
       which is what the warning above this promised. */
    if (task.id !== "new") update.mutate({ id: task.id, body: { due_date: null } })
  }

  /* "This weekend" is the coming Saturday, and only while that is a day the
     other presets do not already name: on a Friday it is "Tomorrow", and at
     the weekend itself "this weekend" is now, so it is left out rather than
     offered twice or as next week's Saturday. */
  const saturday = nextWeekday(today(), 6)
  const presets = [
    { label: "Today", date: today() },
    { label: "Tomorrow", date: addDays(today(), 1) },
    ...(today().getDay() >= 1 && today().getDay() <= 4
      ? [{ label: "This weekend", date: saturday }]
      : []),
    /* Next Monday, and never the same day as "Tomorrow": on a Sunday the two
       presets both read Monday, so the Monday after is what "next week" means
       there. */
    { label: "Next week", date: nextWeekAfter(today()) },
  ]

  /* A due date is a day and not a moment, so there is no clock in this panel at
     all: "due at 17:45" is a reminder wearing a due date's clothes, and Dana
     already has somewhere to say that. */
  return (
    <div className="w-[268px]">
      {/*
      **The panel is the picker, and it carries one role.**

      The popover carries `role="dialog"`, so a preset list inside it must not
      also be `role="menu"`: a press on a chip would answer with two things that
      are both "the picker", and a strict-mode locator dies on that. A picker
      asking for a day or a time is a small modal surface and carries the dialog
      role; one offering a list of named choices is a menu.

      The dialog is the one that stays, because three of these panels put a
      calendar or a clock below their presets, so none of them is a list of
      named choices. The list keeps its label as a group, so the presets are
      still announced as belonging to the field.
       */}
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
              /* A start clears alone: nothing cascades from it (8.4). */
              if (task.start === undefined) return
              setRefused(false)
              patch(task.id, { start: undefined })
              update.mutate({ id: task.id, body: { start_date: null } })
              close()
              return
            }
            if (!task.due) return
            /* The warning lives in this popover, so clearing closes it only
               where there is nothing to ask. */
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

      {/* The grid stands plainly below the hairline; a toggle row would read as
          a setting rather than a way to show the calendar. */}
      <div className="pt-1">
        <Calendar
          /* Keyed on the end, so switching shows that end's month. */
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
          <label className="flex items-center gap-2 px-2 pt-1.5 text-xs text-muted-foreground">
            <span className="w-10 shrink-0">Time</span>
            <input
              type="time"
              aria-label="Due time"
              value={at ?? ""}
              onChange={(event) => {
                const time = event.target.value
                setAt(time === "" ? null : time)
              }}
              className="h-[var(--control-height)] min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none"
            />
            {at === null ? null : (
              <span className="shrink-0 text-muted-foreground">
                {formatTime(at, format) ?? at}
              </span>
            )}
          </label>
        </>
      ) : null}
    </div>
  )
}

/*
**A reminder is a time on the due day, never an offset.**

9.3's reminder row: "requires a due date; **one picker, a time on that day**,
writing 4.8's time_of_day mode". A picker offering an offset ("1 day before")
would be the v1 control surviving its own row (AC-169).

So the panel is a clock, with the shared shape, width, hairline and Clear, and
choosing commits.

**The three quick answers are times rather than offsets**, which keeps the
shared arrangement, the answers somebody probably wants, a hairline, then one
option that opens everything exact. They are the three a reminder is usually set
to and they are the design's rather than the section's, which writes none.

A reminder "requires a due date", and the chip is disabled without one, so this
panel is never opened undated and draws no sentence for that case.
*/
export function ReminderPanel({ task, patch }: PanelProps) {
  const format = useTimeFormat()
  const put = usePutReminder()
  const drop = useDeleteReminder()
  const due = task.due ? parseDueLabel(task.due.label) : null
  const at = task.reminder?.match(/(\d{1,2}:\d{2})$/)?.[1] ?? null

  /* The words a reminder is stored as, which `tasks/task-model.ts`'s
     `reminderChipValue` reads back and re-clocks for the viewer. The day is
     the task's own, 4.8's time_of_day mode being a time on the due date. */
  const wordsFor = (time: string) =>
    due ? `${reminderDay(due)} at ${time}` : `at ${time}`

  /* 9.3: "one picker, a time on that day". 4.8's two modes are exclusive
     and the task decides which one 7.9 takes: a date-only task stores the
     clock time itself, and a task with a due time stores how long before it
     the time is, so a reminder after the due time is refused here as there. */
  const [refused, setRefused] = useState(false)
  const minutesOf = (time: string) => {
    const [hour, minute] = time.split(":").map(Number)
    return (hour ?? 0) * 60 + (minute ?? 0)
  }
  const clockOf = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  const setAt = (time: string) => {
    const offset = task.dueTime === undefined ? null : minutesOf(task.dueTime) - minutesOf(time)
    if (offset !== null && offset < 0) {
      setRefused(true)
      return
    }
    setRefused(false)
    patch(task.id, { reminder: wordsFor(time) })
    put.mutate({
      taskId: task.id,
      body: offset === null ? { offset_minutes: null, time_of_day: time } : { offset_minutes: offset, time_of_day: null },
    })
  }
  const clearAt = () => {
    patch(task.id, { reminder: undefined })
    /* Frozen 7.9's own removal, "no task body expressing a removal". */
    drop.mutate(task.id)
  }

  /* With a due time, the answers are that time and an hour before it. */
  const quick =
    task.dueTime === undefined
      ? ["09:00", "12:00", "17:00"]
      : [minutesOf(task.dueTime) - 60, minutesOf(task.dueTime)].filter((m) => m >= 0).map(clockOf)

  return (
    <div className="w-[268px]">
      {/* One role per picker. See the due panel above. */}
      <div role="group" aria-label="Reminder" className="flex flex-col">
        {quick.map((time) => (
          <PickerOption
            finishes
            key={time}
            label={formatTime(time, format) ?? time}
            active={at === time}
            onSelect={() => setAt(time)}
          />
        ))}
        {/*
        **The way back out**, offered only while a reminder is set, the same
        rule as the due picker's. Frozen 7.9 makes the write behind it
        `DELETE /tasks/:id/reminder`, "no task body expressing a removal", and
        nothing cascades from it, so unlike the due date's it asks nothing.
        */}
        <PickerOption
          finishes
          icon={Ban}
          label={task.reminder ? DATE_CLEAR : "No reminder"}
          active={!task.reminder}
          onSelect={clearAt}
        />
      </div>

      <PickerDivider />

      {/*
      9.3's "one picker, a time on that day", exact. It is open rather than
      behind a disclosure, which is the one place this departs from the shared
      arrangement and is AC-169's own requirement: the picker is opened and the
      time is answered, with nothing to unfold first.
       */}
      <div className="px-2 pt-1.5">
        <input
          type="time"
          aria-label="Reminder time"
          {...(task.dueTime === undefined ? {} : { max: task.dueTime })}
          value={at ?? ""}
          onChange={(event) => {
            const time = event.target.value
            if (time === "") clearAt()
            else setAt(time)
          }}
          className="h-[var(--control-height)] w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none"
        />
        {refused && task.dueTime !== undefined ? (
          <p role="status" className="pt-1.5 text-xs text-destructive">
            {`The reminder must be at or before ${formatTime(task.dueTime, format) ?? task.dueTime}.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function RepeatPanel({ task, patch }: PanelProps) {
  const anchor = repeatAnchor(task)
  const summary = repeatSummary(task)
  /* Every choice here is written as the whole rule (4.11's RRULE on 7.6),
     from the task as it is plus what changed. A draft ("new") has no address
     yet and keeps the choice on the card alone. */
  const update = useUpdateTask()
  const commit = (fields: Partial<ConceptTask>) => {
    patch(task.id, fields)
    if (task.id === "new") return
    update.mutate({ id: task.id, body: { recurrence_rule: ruleFor({ ...task, ...fields }) } })
  }

  /* Five answers cover essentially every repeating task anybody writes down,
     and each is spelled out against this task's own date rather than left as
     a word somebody has to translate. */
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
        /* The filter is `noUncheckedIndexedAccess`, which this client compiles
           with (11.4). The index is a `% 7` and can never miss, so nothing is
           ever dropped; it is written this way rather than as a non-null
           assertion because an assertion is a claim and this is a proof. */
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
      fields: { recurrence: true, repeatUnit: "month", repeatEvery: "1", repeatDays: [] },
    },
    {
      label: `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()]}`,
      fields: { recurrence: true, repeatUnit: "year", repeatEvery: "1", repeatDays: [] },
    },
  ]
  /* A rule none of the presets names opens on the exact controls. */
  const [custom, setCustom] = useState(
    () => task.recurrence === true && !presets.some((preset) => preset.label === summary),
  )
  /* Until: no end, a month on, or the end of the year, all counted from the
     task's own date so no option is already past; a stored end the two do
     not name is offered as itself so the choice shows. */
  const monthOn = isoDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, anchor.getDate()))
  const yearEnd = `${String(anchor.getFullYear() + (anchor.getMonth() === 11 ? 1 : 0))}-12-31`
  const ends = [monthOn, yearEnd]
  if (task.repeatEnds !== undefined && !ends.includes(task.repeatEnds)) ends.push(task.repeatEnds)
  const now = todayInBrowserZone()
  /* A weekly rule naming no days repeats on its own date's weekday, so that
     day shows as chosen and a second day is added beside it, not instead. */
  const anchorKey = WEEKDAY_KEYS[(anchor.getDay() + 6) % 7] ?? "Mo"
  const weekDays = task.repeatDays?.length ? task.repeatDays : [anchorKey]

  return (
    <div className="w-[268px]">
      {/* One role per picker. See the due panel above. */}
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
              repeatEnds: undefined,
            })
          }}
        />
        {presets.map((preset) => (
          <PickerOption
          menu
            key={preset.label}
            label={preset.label}
            active={task.recurrence === true && summary === preset.label}
            onSelect={() => commit({ ...preset.fields, repeatEnds: undefined })}
          />
        ))}
      </div>

      <PickerDivider />

      <PickerOption
          menu
        icon={Repeat2}
        label="Custom repeat…"
        active={false}
        onSelect={() => {
          setCustom((open) => !open)
          if (!task.recurrence) commit({ recurrence: true, repeatUnit: "week", repeatEvery: "1" })
        }}
      />

      {custom ? (
        <div className="pt-1">
          <PickerSegments
            label="Every"
            active={task.repeatEvery ?? "1"}
            options={[
              { key: "1", label: "1" },
              { key: "2", label: "2" },
              { key: "3", label: "3" },
              { key: "4", label: "4" },
            ]}
            onPick={(key) => commit({ repeatEvery: key })}
          />
          <PickerSegments
            label=""
            name="Unit"
            active={task.repeatUnit ?? "week"}
            options={[
              { key: "day", label: "days" },
              { key: "week", label: "weeks" },
              { key: "month", label: "months" },
            ]}
            onPick={(key) =>
              commit({ repeatUnit: key as ConceptTask["repeatUnit"] })
            }
          />
          {(task.repeatUnit ?? "week") === "week" ? (
            <div className="px-2 py-1">
              {/* The weekday row gets its own line and a seven-column grid.

                  A label plus seven 28px circles on one line is 48 + 8 + 7×28 +
                  6×4 = 292px inside a 268px panel, so the last day would sit
                  outside the popover's own edge. Widening the panel to suit one
                  row would make every other picker wider for nothing (a popover
                  is as wide as what it holds). A grid divides whatever width
                  there is, so this row cannot overflow at any panel size. */}
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
                        commit({
                          repeatDays: on
                            ? weekDays.filter((d) => d !== day)
                            : [...weekDays, day],
                        })
                      }
                      className={cn(
                        "flex h-[var(--control-height)] w-full items-center justify-center rounded-md text-xs transition-colors",
                        T_FAST,
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
            onPick={(key) => commit({ repeatEnds: key || undefined })}
          />
        </div>
      ) : null}
    </div>
  )
}
