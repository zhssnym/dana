/*
The filter, the strip control that opens it, and the chips that say what it is
doing.

Imran's direction, 2026-08-18 (DES-140): the window bar is native to every
window, so the controls in it cannot belong to one screen. The filter model
and its panel live here, and the folder page and every place-page read the
same one — same variables, same wording, wherever you are.

**Rebuilt at F5, 2026-08-22, against DES-153.** Imran's verdict on what stood
here was blunt and correct: it is "far down then our expectations". It was a
popover of four single-choice rows, which was adequate while the filter was a
side control and cannot carry DES-152's model, where a page *is* a filter
state and the sidebar is a list of saved ones. Eight things were owed and all
eight are here:

- **More than one value per axis.** Sara *and* Hassan, not one or the other.
  Every people axis is a set; empty means anyone, which is why "Anyone" is the
  absence of a choice rather than a choice of its own.
- **Real date ranges.** Six named ranges plus a custom one drawn on the shared
  calendar, replacing any / with / without / overdue — which all survive,
  because "has a date at all" is a different question from "which days".
- **Repeating as a variable.** Q3's rules already put every repeating task on
  the dated side, so "show me my routines" is one press rather than a page —
  which is DES-152's own argument for why Routines is not a page.
- **Created by**, which is Assignments' second half: Dana records a creator
  and not an assigner, so "from A" is a filter and never a spine.
- **Active state as chips on the page**, in the window bar's left end, each
  removable on its own. A count you must open a panel to read is not a
  readout.
- **Group by** — folder, person, date — which did not exist at all.
- **Sort by**, also missing.
- **Save as view**, the control that turns a filter state into a page.

**Where the honesty line falls.** Everything except saving is Lane 1: it
filters and arranges rows the client already holds. **Saved views are Lane 2**
(DES-153, NEEDS BACKEND) — there is no view entity and nowhere to put one, so
what is drawn here keeps them in `localStorage` and says as much in the panel.
Pinning a saved view into the sidebar arrives with Settings' pin list.
*/

import { Input } from "@/components/ui/input"
import { useMemo, useState, type ReactNode } from "react"

import {
  ArrowDownUp,
  Ban,
  Bookmark,
  CalendarDays,
  Check as CheckIcon,
  ChevronRight,
  Group,
  Filter,
  Repeat2,
  Star,
  UserRound,
  UserPlus,
  X,
} from "@/lib/icons"
import { Face } from "@/components/person-face"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { WindowBarLead } from "@/components/window-bar"
import {
  LAB_TODAY,
  dayRung,
  dayStamp,
  PEOPLE,
  addDays,
  daysBetween,
  firstName,
  isoDay,
  parseDueLabel,
} from "@/lib/task-model"
import type { TaskRowProps } from "@/components/task-row"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* ------------------------------------------------------------- the model -- */

/*
What a task has to carry to be filtered. The row's own props answer most of
it, and the rest comes off the shell's record — a real ISO due date, the
repeat rule, and who made it — which the shell has held all along and the
filter has never looked at. Optional, because a row drawn outside the shell
(the states page, the lab) has no record behind it and should simply not match
the axes that need one rather than crash on them.
*/
export interface FilterableTask extends TaskRowProps {
  form?: {
    dueDate?: string
    repeat?: string
    assignee?: string
    createdBy?: string
    folder?: string
  }
}

/*
The date axis. Four shapes about *whether* there is a date, and one about
*which days* — and the range is the general case the four could in principle
be written as, but are not, because "no due date" is a sentence people say and
"the empty range" is not.
*/
export type DueFilter =
  | { kind: "any" }
  | { kind: "with" }
  | { kind: "without" }
  | { kind: "overdue" }
  | { kind: "range"; from: string; to: string; preset?: DueRangePreset }

export type DueRangePreset =
  | "today"
  | "tomorrow"
  | "week"
  | "next7"
  | "month"

export type GroupBy = "none" | "folder" | "person" | "date"
export type SortBy = "manual" | "due" | "title" | "important"

export interface TaskFilters {
  due: DueFilter
  /* Sets, not choices. Empty is "anyone" — the absence of a narrowing rather
     than a value meaning everything, so adding a person can never silently
     turn off a filter that was already there. `"unassigned"` is a member of
     the assignee set and has no equivalent on the creator side, because
     everything has a creator. */
  assignee: string[]
  creator: string[]
  repeating: "any" | "only" | "never"
  importantOnly: boolean
  showAbandoned: boolean
  /* Arrangement, not narrowing — but the same object, because DES-153 makes a
     view one thing: a name, a spine, defaults for every other axis, and a
     mode. Splitting the state in two here would mean splitting every saved
     view in two later. */
  groupBy: GroupBy
  sortBy: SortBy
}

export const DEFAULT_FILTERS: TaskFilters = {
  due: { kind: "any" },
  assignee: [],
  creator: [],
  repeating: "any",
  importantOnly: false,
  showAbandoned: true,
  groupBy: "none",
  sortBy: "manual",
}

export const UNASSIGNED = "unassigned"

/* ------------------------------------------------------------------ dates -- */

function parseIsoDay(key: string): Date | null {
  const parts = key.split("-").map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!)
}

/*
The day a task is due, from the best source it has.

The shell's record carries a real ISO date and the row carries a rendered
label; the record wins where there is one, because "12 Aug" cannot tell you a
year and a range can span one. Where there is no record — the lab's rows, the
states page — the label is parsed, which is what the pickers already do.
*/
export function dueDateOf(task: FilterableTask): Date | null {
  const stored = task.form?.dueDate
  if (stored) return parseIsoDay(stored)
  if (task.due?.label) return parseDueLabel(task.due.label)
  return null
}

/* The named ranges, resolved against the prototype's one today. */
export function resolveRange(preset: DueRangePreset): { from: string; to: string } {
  const today = LAB_TODAY
  if (preset === "today") return { from: isoDay(today), to: isoDay(today) }
  if (preset === "tomorrow") {
    const day = addDays(today, 1)
    return { from: isoDay(day), to: isoDay(day) }
  }
  if (preset === "week") {
    /* This week means the rest of it: from today to Sunday, never backwards
       into days that have already gone. */
    const toSunday = (7 - today.getDay()) % 7
    return { from: isoDay(today), to: isoDay(addDays(today, toSunday)) }
  }
  if (preset === "next7") {
    return { from: isoDay(today), to: isoDay(addDays(today, 6)) }
  }
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { from: isoDay(today), to: isoDay(end) }
}

const PRESET_LABEL: Record<DueRangePreset, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "The rest of this week",
  next7: "The next 7 days",
  month: "The rest of this month",
}

function stamp(key: string) {
  const date = parseIsoDay(key)
  return date ? dayStamp(date) : key
}

function rangeLabel(due: Extract<DueFilter, { kind: "range" }>) {
  if (due.preset) return PRESET_LABEL[due.preset]
  if (due.from && due.to && due.from === due.to) return stamp(due.from)
  if (due.from && due.to) return `${stamp(due.from)} – ${stamp(due.to)}`
  if (due.from) return `From ${stamp(due.from)}`
  if (due.to) return `Until ${stamp(due.to)}`
  return "Any date"
}

/* ----------------------------------------------------------------- people -- */

/* Whether two names are the same person — `firstName` in `lib/task-model`
   carries the reason the comparison is not an equality. */
function samePerson(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false
  return firstName(a) === firstName(b)
}

/*
An empty string is nobody, and it was being read as somebody.

The form carries `assignee: ""` for an unassigned task, and `??` only steps
past `undefined` — so the blank survived, became its own group key, and
Assignments grouped by person opened with a nameless heading over the
unassigned work. Found at F6 by looking at the board, which draws the same
groups as columns and made the empty label impossible to miss.

Blank is normalised here rather than at each reader, because there are three:
the filter, the grouping, and the board that turns a group into an act.
*/
function named(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function assigneeOf(task: FilterableTask) {
  return named(task.assignee?.name) ?? named(task.form?.assignee)
}

function creatorOf(task: FilterableTask) {
  return named(task.form?.createdBy)
}

function repeatsOf(task: FilterableTask) {
  const rule = task.form?.repeat
  return Boolean(task.recurrence) || Boolean(rule && rule !== "none")
}

/* ---------------------------------------------------------------- the work -- */

export function activeFilterCount(filters: TaskFilters) {
  return (
    Number(filters.due.kind !== "any") +
    Number(filters.assignee.length > 0) +
    Number(filters.creator.length > 0) +
    Number(filters.repeating !== "any") +
    Number(filters.importantOnly) +
    Number(!filters.showAbandoned)
  )
}

/*
The chips, which are the filter's readout.

One chip per *axis* rather than per value, so three people chosen are one chip
saying "Sara, Hassan +1" and one press to undo — because the thing a person
wants to take off is the narrowing, and picking the people apart again is what
the panel is for. Each carries the reset that clears its own axis and nothing
else.
*/
export function filterChips(filters: TaskFilters): {
  key: string
  icon: typeof Star
  label: string
  clear: Partial<TaskFilters>
}[] {
  const chips: {
    key: string
    icon: typeof Star
    label: string
    clear: Partial<TaskFilters>
  }[] = []

  if (filters.due.kind !== "any") {
    const label =
      filters.due.kind === "with" ? "Has a due date"
      : filters.due.kind === "without" ? "No due date"
      : filters.due.kind === "overdue" ? "Overdue"
      : rangeLabel(filters.due)
    chips.push({
      key: "due",
      icon: CalendarDays,
      label,
      clear: { due: { kind: "any" } },
    })
  }

  const names = (set: string[]) => {
    const shown = set.map((name) => (name === UNASSIGNED ? "Unassigned" : name))
    if (shown.length <= 2) return shown.join(", ")
    return `${shown.slice(0, 2).join(", ")} +${shown.length - 2}`
  }

  if (filters.assignee.length) {
    chips.push({
      key: "assignee",
      icon: UserRound,
      label: names(filters.assignee),
      clear: { assignee: [] },
    })
  }
  if (filters.creator.length) {
    chips.push({
      key: "creator",
      icon: UserPlus,
      label: `From ${names(filters.creator)}`,
      clear: { creator: [] },
    })
  }
  if (filters.repeating !== "any") {
    chips.push({
      key: "repeating",
      icon: Repeat2,
      label: filters.repeating === "only" ? "Repeating" : "Does not repeat",
      clear: { repeating: "any" },
    })
  }
  if (filters.importantOnly) {
    chips.push({
      key: "important",
      icon: Star,
      label: "Important",
      clear: { importantOnly: false },
    })
  }
  if (!filters.showAbandoned) {
    chips.push({
      key: "abandoned",
      icon: Ban,
      label: "Abandoned hidden",
      clear: { showAbandoned: true },
    })
  }
  return chips
}

export function applyTaskFilters<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilters,
): T[] {
  return tasks.filter((task) => {
    const due = filters.due
    if (due.kind === "with" && !task.due) return false
    if (due.kind === "without" && task.due) return false
    if (due.kind === "overdue" && !task.due?.overdue) return false
    if (due.kind === "range") {
      const date = dueDateOf(task)
      if (!date) return false
      const key = isoDay(date)
      if (due.from && key < due.from) return false
      if (due.to && key > due.to) return false
    }

    if (filters.assignee.length) {
      const name = assigneeOf(task)
      const matched = filters.assignee.some((wanted) =>
        wanted === UNASSIGNED ? !name : samePerson(name, wanted),
      )
      if (!matched) return false
    }

    if (filters.creator.length) {
      const name = creatorOf(task)
      if (!filters.creator.some((wanted) => samePerson(name, wanted))) return false
    }

    if (filters.repeating === "only" && !repeatsOf(task)) return false
    if (filters.repeating === "never" && repeatsOf(task)) return false

    if (filters.importantOnly && !task.important) return false
    if (!filters.showAbandoned && task.status === "abandoned") return false
    return true
  })
}

/*
Order.

`manual` is the default and means *do not touch it* — every page arrives with
an order that something else decided (the server's, a person's own drag, a
date ladder), and a sort that silently overrode it would be the filter
deciding something it was not asked about. The other three are stable: equal
rows keep the order they came in, so switching sorts twice returns what you
started with.
*/
export function sortTasks<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilters,
): T[] {
  if (filters.sortBy === "manual") return tasks
  const keyed = tasks.map((task, index) => ({ task, index }))
  keyed.sort((a, b) => {
    if (filters.sortBy === "title") {
      const byTitle = a.task.title.localeCompare(b.task.title)
      if (byTitle) return byTitle
    }
    if (filters.sortBy === "important") {
      const byFlag = Number(Boolean(b.task.important)) - Number(Boolean(a.task.important))
      if (byFlag) return byFlag
    }
    if (filters.sortBy === "due") {
      const left = dueDateOf(a.task)
      const right = dueDateOf(b.task)
      /* Undated last, always. A task with no date is not "due at the
         beginning of time", and sorting it there puts the least urgent work
         at the top of the page. */
      if (left && !right) return -1
      if (!left && right) return 1
      if (left && right) {
        const byDate = daysBetween(right, left) * -1
        if (byDate) return byDate
      }
    }
    return a.index - b.index
  })
  return keyed.map((entry) => entry.task)
}

/* Filter, then arrange. What every call site wants, in the order that makes
   sorting cheaper than sorting first. */
export function applyView<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilters,
): T[] {
  return sortTasks(applyTaskFilters(tasks, filters), filters)
}

/*
Grouping, when a page is asked to arrange itself by something other than its
own spine.

It returns sections rather than rendering them, because the component that
draws a section is `TaskSection` and there is exactly one of it (DES-154). A
page with `groupBy: "none"` gets `null` and keeps the sections it was built
with, which is the honest default: Today's three headings are normative to the
letter (spec 9.1) and a group-by that silently replaced them would be the
filter overruling the specification.
*/
export function groupTasks<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilters,
): { key: string; label: string; tasks: T[] }[] | null {
  if (filters.groupBy === "none") return null

  const buckets = new Map<string, { label: string; tasks: T[] }>()
  const push = (key: string, label: string, task: T) => {
    const found = buckets.get(key)
    if (found) found.tasks.push(task)
    else buckets.set(key, { label, tasks: [task] })
  }

  for (const task of tasks) {
    if (filters.groupBy === "folder") {
      const name = task.folder?.name ?? task.form?.folder ?? "Desk"
      push(name, name, task)
    } else if (filters.groupBy === "person") {
      const name = assigneeOf(task)
      push(name ?? UNASSIGNED, name ?? "Unassigned", task)
    } else {
      const date = dueDateOf(task)
      if (!date) push("none", "No due date", task)
      else {
        /* The same rung the row's chip reads, in a heading's words rather
           than a row's (R5, and the note on `dayRung`). */
        const rung = dayRung(date)
        const label =
          rung === "overdue" ? "Overdue"
          : rung === "today" ? "Today"
          : rung === "tomorrow" ? "Tomorrow"
          : dayStamp(date)
        push(rung === "overdue" ? "overdue" : isoDay(date), label, task)
      }
    }
  }

  const sections = [...buckets.entries()].map(([key, value]) => ({ key, ...value }))
  if (filters.groupBy === "date") {
    /* Time order, with the two that are not dates at the ends where they
       belong: what is late first, what has no date at all last. */
    sections.sort((a, b) => {
      const rank = (key: string) => (key === "overdue" ? "0" : key === "none" ? "z" : key)
      return rank(a.key).localeCompare(rank(b.key))
    })
  } else {
    sections.sort((a, b) => a.label.localeCompare(b.label))
  }
  return sections
}

/* --------------------------------------------------------- saved views (2) -- */

/*
Lane 2, drawn.

DES-153 splits here and says so: toggling *shipped* views is free because the
booleans exist, and a view somebody makes for themselves needs a table and
endpoints that do not. What is below keeps saved views in `localStorage` so
the bridge control can be judged — press Save as view, name it, find it at the
top of the panel — and the panel says plainly that they live in this browser.
No part of this may be ported as though it worked.
*/
const SAVED_VIEWS_KEY = "dana:prototype-saved-views"

export interface SavedView {
  id: string
  name: string
  filters: TaskFilters
}

export function readSavedViews(): SavedView[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_VIEWS_KEY) ?? "[]")
    return Array.isArray(value) ? (value as SavedView[]) : []
  } catch {
    return []
  }
}

function writeSavedViews(views: SavedView[]) {
  window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views))
}

/* ---------------------------------------------------------------- controls -- */

/* The window bar's control tier: 28px in a 36px strip. Chrome is thin. */
export const stripButtonClass = (active: boolean) =>
  cn(
    "relative flex size-7 items-center justify-center rounded-md transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35",
    T_FAST,
    FOCUS,
    active
      ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
      : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
  )

function SectionLabel({ icon: Icon, children }: { icon: typeof Star; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
      <Icon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
      {children}
    </p>
  )
}

const rowClass = (selected: boolean) =>
  cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-5 transition-colors",
    T_FAST,
    FOCUS,
    selected
      ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)]"
      : "text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-50)]",
  )

/* One of many — the axis takes exactly one value. */
function FilterChoice({
  label,
  selected,
  onSelect,
  leading,
  trailing,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  leading?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={rowClass(selected)}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {selected ? (
        <CheckIcon className="size-3.5 shrink-0 text-[var(--color-graphite-700)]" strokeWidth={2.5} aria-hidden="true" />
      ) : null}
    </button>
  )
}

/*
Any of many — the axis takes a set.

It is a different control from `FilterChoice` on purpose, and the difference
is a box rather than a tick: a checkbox says "and others may also be on", a
tick at the end of a row says "this is the one". Drawing both as a tick is how
a person learns by pressing that the panel does not mean what it drew.
*/
function FilterToggle({
  label,
  checked,
  onToggle,
  leading,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  leading?: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className={rowClass(checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          T_FAST,
          checked
            ? "border-[var(--color-graphite-900)] bg-[var(--color-graphite-900)] text-white"
            : "border-[var(--color-graphite-300)] bg-card",
        )}
      >
        {checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </span>
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function SwitchRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Star
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] leading-5 text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
        T_FAST,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-[var(--color-graphite-500)]" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        aria-label={label}
      />
    </label>
  )
}

/* An axis whose values live behind one row, so the panel is a page of axes
   rather than a page of every value every axis has. */
function Axis({
  icon,
  label,
  value,
  children,
}: {
  icon: typeof Star
  label: string
  value: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={rowClass(false)}
      >
        <SectionIcon icon={icon} />
        <span className="shrink-0 text-[var(--color-graphite-700)]">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[var(--color-graphite-500)]">
          {value}
        </span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-[var(--color-graphite-400)] transition-transform",
            T_FAST,
            open && "rotate-90",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="pt-0.5 pb-1 pl-2">{children}</div> : null}
    </div>
  )
}

function SectionIcon({ icon: Icon }: { icon: typeof Star }) {
  return (
    <Icon
      className="size-3.5 shrink-0 text-[var(--color-graphite-500)]"
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}

/* ------------------------------------------------------------------ panel -- */

const GROUP_LABEL: Record<GroupBy, string> = {
  none: "Nothing",
  folder: "Folder",
  person: "Person",
  date: "Due date",
}

const SORT_LABEL: Record<SortBy, string> = {
  manual: "Manual",
  due: "Due date",
  title: "Title",
  important: "Important first",
}

export function FilterControl({
  filters,
  setFilters,
}: {
  filters: TaskFilters
  setFilters: (next: (current: TaskFilters) => TaskFilters) => void
}) {
  const filterCount = activeFilterCount(filters)
  const chips = filterChips(filters)
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState("")
  const [saved, setSaved] = useState<SavedView[]>(() => readSavedViews())
  const arranged = filters.groupBy !== "none" || filters.sortBy !== "manual"

  const due = filters.due
  const rangeEnds = useMemo(() => {
    if (due.kind !== "range") return { from: null, to: null }
    return {
      from: due.from ? parseIsoDay(due.from) : null,
      to: due.to ? parseIsoDay(due.to) : null,
    }
  }, [due])

  const dueValue =
    due.kind === "any" ? "Any"
    : due.kind === "with" ? "Has one"
    : due.kind === "without" ? "None"
    : due.kind === "overdue" ? "Overdue"
    : rangeLabel(due)

  function setDue(next: DueFilter) {
    setFilters((current) => ({ ...current, due: next }))
  }

  /*
  A range is built by pressing two days: the first opens it, the second closes
  it, and a third starts over.

  The open state is a real state and not a half-finished one — from with no to
  means "on or after this day", which the chip says in those words and the
  filter honours — so a person who presses once and walks away has a filter
  rather than nothing. Closing it sorts the two days, because "the 20th back
  to the 14th" is a range somebody meant rather than a mistake to refuse.
  */
  function pickRangeDay(date: Date) {
    const key = isoDay(date)
    setFilters((current) => {
      const currentDue = current.due
      const midSelection =
        currentDue.kind === "range" && Boolean(currentDue.from) && !currentDue.to
      if (!midSelection) {
        return { ...current, due: { kind: "range", from: key, to: "" } }
      }
      const from = (currentDue as Extract<DueFilter, { kind: "range" }>).from
      const [start, end] = from <= key ? [from, key] : [key, from]
      return { ...current, due: { kind: "range", from: start, to: end } }
    })
  }

  function toggleIn(axis: "assignee" | "creator", name: string) {
    setFilters((current) => {
      const set = current[axis]
      return {
        ...current,
        [axis]: set.includes(name)
          ? set.filter((entry) => entry !== name)
          : [...set, name],
      }
    })
  }

  return (
    <>
      {/* The readout, on the page rather than in the panel (DES-153). */}
      {chips.length ? (
        <WindowBarLead>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={`Remove filter: ${chip.label}`}
                onClick={() => setFilters((current) => ({ ...current, ...chip.clear }))}
                className={cn(
                  "group/chip flex h-6 max-w-56 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-graphite-100)] pr-1.5 pl-2 text-[12px] leading-4 text-[var(--color-graphite-700)] transition-colors",
                  T_FAST,
                  FOCUS,
                  "hover:bg-[var(--color-graphite-200)]",
                )}
              >
                <chip.icon className="size-3 shrink-0 text-[var(--color-graphite-500)]" strokeWidth={2} aria-hidden="true" />
                <span className="min-w-0 truncate">{chip.label}</span>
                <X
                  className="size-3 shrink-0 text-[var(--color-graphite-400)] transition-colors group-hover/chip:text-[var(--color-graphite-700)]"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </button>
            ))}
            {chips.length > 1 ? (
              <button
                type="button"
                onClick={() => setFilters((current) => ({ ...current, ...DEFAULT_FILTERS, groupBy: current.groupBy, sortBy: current.sortBy }))}
                className={cn(
                  "flex h-6 shrink-0 items-center rounded-full px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </WindowBarLead>
      ) : null}

      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Filters${filterCount ? ` — ${filterCount} active` : ""}`}
              className={cn(
                stripButtonClass(filterCount > 0 || arranged),
                filterCount > 0 && "w-auto gap-1.5 px-2.5",
              )}
            >
              <Filter className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {filterCount > 0 ? (
                <span className="text-[12px] leading-4 font-medium tabular-nums">
                  {filterCount}
                </span>
              ) : null}
            </button>
          }
        />
        <PopoverContent
          align="end"
          className="max-h-[min(560px,70vh)] w-[292px] overflow-y-auto p-2"
        >
          {saved.length ? (
            <>
              <SectionLabel icon={Bookmark}>Saved views</SectionLabel>
              {saved.map((view) => (
                <div key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFilters(() => view.filters)}
                    className={cn(rowClass(false), "min-w-0 flex-1")}
                  >
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete view: ${view.name}`}
                    onClick={() => {
                      const next = saved.filter((entry) => entry.id !== view.id)
                      setSaved(next)
                      writeSavedViews(next)
                    }}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                      T_FAST,
                      FOCUS,
                    )}
                  >
                    <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="mx-1 my-2 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
            </>
          ) : null}

          <Axis icon={CalendarDays} label="Due" value={dueValue}>
            <FilterChoice label="Any" selected={due.kind === "any"} onSelect={() => setDue({ kind: "any" })} />
            <FilterChoice label="Has a due date" selected={due.kind === "with"} onSelect={() => setDue({ kind: "with" })} />
            <FilterChoice label="No due date" selected={due.kind === "without"} onSelect={() => setDue({ kind: "without" })} />
            <FilterChoice
              label="Overdue"
              leading={<span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-danger-600)]" />}
              selected={due.kind === "overdue"}
              onSelect={() => setDue({ kind: "overdue" })}
            />
            <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
            {(Object.keys(PRESET_LABEL) as DueRangePreset[]).map((preset) => (
              <FilterChoice
                key={preset}
                label={PRESET_LABEL[preset]}
                selected={due.kind === "range" && due.preset === preset}
                onSelect={() => setDue({ kind: "range", ...resolveRange(preset), preset })}
              />
            ))}
            <FilterChoice
              label="Custom range"
              selected={due.kind === "range" && !due.preset}
              onSelect={() =>
                setDue(
                  due.kind === "range" && !due.preset
                    ? { kind: "any" }
                    : { kind: "range", from: "", to: "" },
                )
              }
            />
            {due.kind === "range" && !due.preset ? (
              <div className="px-1 pt-1.5">
                <p className="pb-1.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
                  {due.from || due.to ? rangeLabel(due) : "Pick the first day, then the last."}
                </p>
                <Calendar
                  selected={null}
                  range={rangeEnds}
                  onSelect={pickRangeDay}
                  today={LAB_TODAY}
                  className="w-full"
                />
              </div>
            ) : null}
          </Axis>

          <Axis
            icon={UserRound}
            label="Assigned to"
            value={filters.assignee.length ? `${filters.assignee.length} chosen` : "Anyone"}
          >
            {PEOPLE.map((person) => (
              <FilterToggle
                key={person.name}
                label={person.name === PEOPLE[0]!.name ? `${person.name} (you)` : person.name}
                leading={<Face person={person} className="size-4 data-[size=sm]:size-4" />}
                checked={filters.assignee.includes(person.name)}
                onToggle={() => toggleIn("assignee", person.name)}
              />
            ))}
            <FilterToggle
              label="Unassigned"
              checked={filters.assignee.includes(UNASSIGNED)}
              onToggle={() => toggleIn("assignee", UNASSIGNED)}
            />
          </Axis>

          <Axis
            icon={UserPlus}
            label="Created by"
            value={filters.creator.length ? `${filters.creator.length} chosen` : "Anyone"}
          >
            {PEOPLE.map((person) => (
              <FilterToggle
                key={person.name}
                label={person.name === PEOPLE[0]!.name ? `${person.name} (you)` : person.name}
                leading={<Face person={person} className="size-4 data-[size=sm]:size-4" />}
                checked={filters.creator.includes(person.name)}
                onToggle={() => toggleIn("creator", person.name)}
              />
            ))}
          </Axis>

          <Axis
            icon={Repeat2}
            label="Repeats"
            value={
              filters.repeating === "any" ? "Any"
              : filters.repeating === "only" ? "Repeating"
              : "Never"
            }
          >
            <FilterChoice label="Any" selected={filters.repeating === "any"} onSelect={() => setFilters((f) => ({ ...f, repeating: "any" }))} />
            <FilterChoice label="Repeating only" selected={filters.repeating === "only"} onSelect={() => setFilters((f) => ({ ...f, repeating: "only" }))} />
            <FilterChoice label="Never repeats" selected={filters.repeating === "never"} onSelect={() => setFilters((f) => ({ ...f, repeating: "never" }))} />
          </Axis>

          <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
          <SwitchRow
            icon={Star}
            label="Important only"
            checked={filters.importantOnly}
            onChange={(next) => setFilters((f) => ({ ...f, importantOnly: next }))}
          />
          <SwitchRow
            icon={Ban}
            label="Show abandoned"
            checked={filters.showAbandoned}
            onChange={(next) => setFilters((f) => ({ ...f, showAbandoned: next }))}
          />

          <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
          <Axis icon={Group} label="Group by" value={GROUP_LABEL[filters.groupBy]}>
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((key) => (
              <FilterChoice
                key={key}
                label={GROUP_LABEL[key]}
                selected={filters.groupBy === key}
                onSelect={() => setFilters((f) => ({ ...f, groupBy: key }))}
              />
            ))}
          </Axis>
          <Axis icon={ArrowDownUp} label="Sort by" value={SORT_LABEL[filters.sortBy]}>
            {(Object.keys(SORT_LABEL) as SortBy[]).map((key) => (
              <FilterChoice
                key={key}
                label={SORT_LABEL[key]}
                selected={filters.sortBy === key}
                onSelect={() => setFilters((f) => ({ ...f, sortBy: key }))}
              />
            ))}
          </Axis>

          <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
          {saving ? (
            <form
              className="flex items-center gap-1 px-1 pb-1"
              onSubmit={(event) => {
                event.preventDefault()
                const name = viewName.trim()
                if (!name) return
                const next = [...saved, { id: `view-${saved.length + 1}-${name}`, name, filters }]
                setSaved(next)
                writeSavedViews(next)
                setViewName("")
                setSaving(false)
              }}
            >
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <Input
                autoFocus
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="Name this view"
                aria-label="Name this view"
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md border border-[var(--color-graphite-200)] bg-card px-2 text-[13px] leading-5 text-[var(--color-graphite-800)] outline-none transition-colors",
                  T_FAST,
                  "placeholder:text-[var(--color-graphite-400)] focus:border-[var(--color-dana-accent-600)] focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
                )}
              />
              <button
                type="submit"
                className={cn(
                  "h-8 shrink-0 rounded-md bg-[var(--color-graphite-900)] px-2.5 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSaving(true)}
              disabled={filterCount === 0 && !arranged}
              className={cn(
                rowClass(false),
                "disabled:pointer-events-none disabled:text-[var(--color-graphite-300)]",
              )}
            >
              <SectionIcon icon={Bookmark} />
              <span className="min-w-0 flex-1">Save as view</span>
            </button>
          )}
          {filterCount > 0 || arranged ? (
            <button
              type="button"
              onClick={() => setFilters(() => DEFAULT_FILTERS)}
              className={cn(rowClass(false), "text-[var(--color-graphite-500)]")}
            >
              <SectionIcon icon={X} />
              <span className="min-w-0 flex-1">Clear all</span>
            </button>
          ) : null}
          {/*
          The honesty line is gone — Imran, 2026-08-22: "it's a hint for
          frontend explorers and me, but I think we should remove it, so that
          we not forget it."

          It said "Saved views stay in this browser — Dana has nowhere to keep
          them yet", which is a note from the studio to itself standing in a
          person's way. Where a Lane 2 caveat belongs is the register and the
          handoff, both of which carry it (DES-153, NEEDS BACKEND); a panel is
          not the place to apologise for a backend nobody has been promised.
          */}
        </PopoverContent>
      </Popover>
    </>
  )
}
