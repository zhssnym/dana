/*
The one filter of 9.1, as a model.

"One control with the same meaning on every place-page: due presence and
ranges, assignee (multi-value, "Unassigned" included), important, repeating,
created-by, show-abandoned, group-by, sort, and "Save as view"." That sentence
is this file's whole specification, and the model lives here rather than in
the control because three other things read it: the chips in the window bar,
the board's columns, and a saved view's stored definition.

**It narrows rows the client already holds and asks the server for nothing.**
6 Q1's closing line says it of the important axis, "it changes no query", and
AC-167 measures it by counting requests; the other axes follow the same rule
because section 6 offers no parameter for any of them. So every function here
takes rows and returns rows.

**Created-by lands at S25, and it is the axis this file spent two rows
recording the absence of.** It was an escalation rather than an omission: a
filter runs over `TaskCard`, TaskCard had no `created_by`, and adding it to a
frozen section 7 was a human decision rather than this file's. Imran approved
it at RFC 0005 change control item 19 and unit 12a wrote it, so the card has
carried the creator since S18 and the axis needs no request per row. Ledger
L-177 and L-255 are that gap, and it is a gap against a numbered section as
well as against the prototype, 9.1 naming the axis in the filter's own list.

**It is a filter and never a spine**, which is `task-filters.tsx`'s own
reasoning and the reason Assignments has two halves rather than two pages
(L-224). Dana records a creator and not an assigner, so "from A" is a fact
about who made a task and "to B" is a fact about who is carrying it; grouping
by the first would claim an assignment nobody made.

**"Manual" is the resting sort and manual means do not touch it** (DES-156).
Section 6's preamble already says clients never re-sort, and every page
arrives in an order something decided; a sort that silently overrode it would
be the filter answering a question nobody asked. The other three orders are a
person's explicit request, which is the one thing that outranks a default.
*/
import type { TaskCard } from '../../shared/tasks.js'

/** The assignee axis's own value for "nobody", which is not a user id. */
export const UNASSIGNED = 'unassigned'

/**
 * The due axis. "Due presence and ranges" is two questions in one control,
 * and DES-156 keeps both: whether a task has a date at all, and which days.
 */
export type DueAxis =
  | 'any'
  | 'with'
  | 'without'
  | 'overdue'
  | 'today'
  | 'week'
  | 'month'
  | 'custom'

/*
9.1's group-by axes. `section` arrived at S26 with RFC 0005 change control
item 44's B2: "sections are the first and unfiltered arrangement; the filter is
fully involved in changing it, and may group by date, by assignee, or by
another axis", so the date board is one of the filter's values rather than a
rival reading. 9.1's own regions table already named it, "that column's value,
whatever its axis, folder, person, day, or section".

It is a folder page's axis and no other page's: a section is a block of one
folder's page (4.17), so grouping Today by section would ask eight pages'
worth of tasks which of one page's blocks they sit under.
*/
export type GroupBy = 'none' | 'folder' | 'person' | 'date' | 'section'

export type SortBy = 'manual' | 'due' | 'title' | 'created'

export interface PageFilter {
  readonly due: DueAxis
  /** The custom range's ends, inclusive, both null unless `due` is custom. */
  readonly from: string | null
  readonly to: string | null
  /** User ids, plus `UNASSIGNED`. Empty means anyone, never nobody. */
  readonly assignees: readonly string[]
  /**
   * 9.1's created-by axis: the ids of the people whose tasks are kept.
   *
   * Empty means anyone, the same neutral value the assignee axis uses and for
   * DES-156's reason. There is no `UNASSIGNED` counterpart and there cannot
   * be one: 4.5 makes `created_by` NOT NULL, so every task was made by
   * somebody, and the one degenerate case is 7.4's deleted-user stub, which
   * still carries an id.
   */
  readonly creators: readonly string[]
  readonly important: boolean
  readonly repeating: boolean
  /** False hides abandoned rows on the pages whose query admits them. */
  readonly showAbandoned: boolean
  readonly groupBy: GroupBy
  readonly sort: SortBy
}

/**
 * A filter narrowing nothing, which is what every page opens with.
 *
 * `assignees: []` means anyone rather than nobody, which is DES-156's own
 * rule and the reason the empty array is the neutral value: "adding a person
 * can never silently switch off a filter already set".
 */
export const NO_FILTER: PageFilter = {
  due: 'any',
  from: null,
  to: null,
  assignees: [],
  creators: [],
  important: false,
  repeating: false,
  showAbandoned: true,
  groupBy: 'none',
  sort: 'manual',
}

/**
 * polish: pagehead F2. "Custom range" chosen with no days picked yet is a
 * panel waiting for an answer, not a narrowing: nothing is filtered, no chip
 * is drawn, and a view saved in that state stores no range.
 */
export function customRangeOpen(filter: PageFilter): boolean {
  return filter.due === 'custom' && (filter.from === null || filter.to === null)
}

/** Whether any axis narrows what the page shows. Grouping and sort do not. */
export function isNarrowed(filter: PageFilter): boolean {
  return (
    (filter.due !== 'any' && !customRangeOpen(filter)) ||
    filter.assignees.length > 0 ||
    filter.creators.length > 0 ||
    filter.important ||
    filter.repeating ||
    !filter.showAbandoned
  )
}

/*
The one piece of date arithmetic this file does, kept local rather than
imported, because `parts/format-dates.ts` renders dates and these two named
ranges are a predicate. Same discipline as that module: civil arithmetic in
UTC, so nothing here reads a clock or shifts a date across a zone.
*/
function addDaysLocal(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) return date
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return date
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day) + days)
  return new Date(utc).toISOString().slice(0, 10)
}

function matchesDue(task: TaskCard, filter: PageFilter, today: string): boolean {
  const due = task.due_date
  switch (filter.due) {
    case 'any':
      return true
    case 'with':
      return due !== null
    case 'without':
      return due === null
    case 'overdue':
      return due !== null && due < today && task.status === 'pending'
    case 'today':
      return due === today
    case 'week':
      return due !== null && due >= today && due <= addDaysLocal(today, 6)
    case 'month':
      return due !== null && due >= today && due <= addDaysLocal(today, 29)
    case 'custom':
      if (customRangeOpen(filter)) return true
      if (due === null) return false
      if (filter.from !== null && due < filter.from) return false
      if (filter.to !== null && due > filter.to) return false
      return true
  }
}

function matchesAssignee(task: TaskCard, filter: PageFilter): boolean {
  if (filter.assignees.length === 0) return true
  const id = task.assignee === null ? UNASSIGNED : task.assignee.id
  return filter.assignees.includes(id)
}

/* 9.1's created-by axis, over the creator TaskCard has carried since S18. A
   card whose creator is absent is kept only while the axis is neutral: an
   unknown maker is not a match for a named one. */
function matchesCreator(task: TaskCard, filter: PageFilter): boolean {
  if (filter.creators.length === 0) return true
  const id = task.created_by?.id
  return id !== undefined && filter.creators.includes(id)
}

function sortRows(rows: readonly TaskCard[], sort: SortBy): readonly TaskCard[] {
  if (sort === 'manual') return rows
  const copy = [...rows]
  switch (sort) {
    case 'due':
      // Nulls last, which is Q3's and Q4's own rule for a dated block over an
      // undated one; the id breaks the tie, as every order in section 6 does.
      copy.sort((a, b) => {
        if (a.due_date === b.due_date) return a.id < b.id ? -1 : 1
        if (a.due_date === null) return 1
        if (b.due_date === null) return -1
        return a.due_date < b.due_date ? -1 : 1
      })
      return copy
    case 'title':
      copy.sort((a, b) => {
        const compared = a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        return compared === 0 ? (a.id < b.id ? -1 : 1) : compared
      })
      return copy
    case 'created':
      copy.sort((a, b) => {
        if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1
        return a.created_at > b.created_at ? -1 : 1
      })
      return copy
  }
}

/**
 * The narrowing itself: rows in, rows out, order untouched unless a person
 * asked for another one.
 *
 * Never destructive on the caller's array, which is the half of AC-167 that
 * catches an implementation filtering its own cache: turning the filter off
 * restores the rows because they were never removed from anything.
 */
export function applyFilter(
  rows: readonly TaskCard[],
  filter: PageFilter,
  today: string,
): readonly TaskCard[] {
  const kept = rows.filter(
    (task) =>
      matchesDue(task, filter, today) &&
      matchesAssignee(task, filter) &&
      matchesCreator(task, filter) &&
      (!filter.important || task.important) &&
      (!filter.repeating || task.is_recurring) &&
      (filter.showAbandoned || task.status !== 'abandoned'),
  )
  return sortRows(kept, filter.sort)
}

/**
 * The window bar's readout: one chip per axis that narrows, each removable on
 * its own.
 *
 * DES-156 fixes both halves. One per axis rather than one per value, "because
 * the thing a person wants to take off is the narrowing, and picking three
 * chosen people apart again is what the panel is for". And chips rather than
 * a count, which 9.1 says in terms: "never as a count alone".
 */
export interface FilterChip {
  readonly key: string
  /** What the chip says, which is also the control's accessible name. */
  readonly label: string
  /** The filter with this axis returned to neutral. */
  readonly cleared: PageFilter
}

const DUE_CHIP: Record<Exclude<DueAxis, 'any' | 'custom'>, string> = {
  with: 'With a due date',
  without: 'No due date',
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Due this week',
  month: 'Due this month',
}

export function filterChips(
  filter: PageFilter,
  personName: (id: string) => string,
): readonly FilterChip[] {
  const chips: FilterChip[] = []
  if (filter.due !== 'any' && !customRangeOpen(filter)) {
    chips.push({
      key: 'due',
      label:
        filter.due === 'custom'
          ? `Due ${filter.from ?? 'any'} to ${filter.to ?? 'any'}`
          : DUE_CHIP[filter.due],
      cleared: { ...filter, due: 'any', from: null, to: null },
    })
  }
  if (filter.assignees.length > 0) {
    chips.push({
      key: 'assignees',
      label: filter.assignees.map((id) => personName(id)).join(', '),
      cleared: { ...filter, assignees: [] },
    })
  }
  /* The created-by chip says who made them rather than only naming them, and
     the reason is the axis beside it: two chips reading "Sara" would be the
     window bar unable to say which of "assigned to Sara" and "made by Sara"
     had been asked for. Its own words, on the panel and on the chip. */
  if (filter.creators.length > 0) {
    chips.push({
      key: 'creators',
      label: `${CREATED_BY} ${filter.creators.map((id) => personName(id)).join(', ')}`,
      cleared: { ...filter, creators: [] },
    })
  }
  /* "Important only" rather than "Important", and the difference is not
     decoration: 9.1's names table spends "Important" on a row's star, so a
     chip answering to that exact string would be a second control wearing a
     name the section has already assigned. The words are the switch's own. */
  if (filter.important) {
    chips.push({
      key: 'important',
      label: IMPORTANT_ONLY,
      cleared: { ...filter, important: false },
    })
  }
  if (filter.repeating) {
    chips.push({
      key: 'repeating',
      label: REPEATING_ONLY,
      cleared: { ...filter, repeating: false },
    })
  }
  if (!filter.showAbandoned) {
    chips.push({
      key: 'abandoned',
      label: ABANDONED_HIDDEN,
      cleared: { ...filter, showAbandoned: true },
    })
  }
  return chips
}

/** The three switch labels, which are also their chips' words. */
export const CREATED_BY = 'Created by'

export const IMPORTANT_ONLY = 'Important only'
export const REPEATING_ONLY = 'Repeating only'
export const ABANDONED_HIDDEN = 'Abandoned hidden'

/**
 * A saved view's stored definition (4.19), and its way back.
 *
 * The filter is already ids and enums, which is 11.15's port note as a
 * property rather than a promise: nothing here holds a display name, so a
 * person renamed or a folder renamed leaves every saved view intact. That is
 * what AC-209 pins on the server side and this is the client half of it.
 */
export function viewDefinition(filter: PageFilter, page: string): Record<string, unknown> {
  const settled = customRangeOpen(filter) ? { ...filter, due: 'any', from: null, to: null } : filter
  return { page, ...settled, assignees: [...filter.assignees], creators: [...filter.creators] }
}

/** The inverse, tolerant of a definition written by an older client. */
export function filterFromDefinition(definition: Record<string, unknown>): PageFilter {
  const readString = <T extends string>(key: string, fallback: T): T => {
    const value = definition[key]
    return typeof value === 'string' ? (value as T) : fallback
  }
  const readBoolean = (key: string, fallback: boolean): boolean => {
    const value = definition[key]
    return typeof value === 'boolean' ? value : fallback
  }
  const readNullableString = (key: string): string | null => {
    const value = definition[key]
    return typeof value === 'string' ? value : null
  }
  const assignees = definition['assignees']
  const creators = definition['creators']
  return {
    due: readString<DueAxis>('due', 'any'),
    from: readNullableString('from'),
    to: readNullableString('to'),
    assignees: Array.isArray(assignees)
      ? assignees.filter((entry): entry is string => typeof entry === 'string')
      : [],
    /* Absent from every definition written before S25, which is what `tolerant
       of a definition written by an older client` is for: an older view opens
       with the axis neutral rather than with nobody's tasks. */
    creators: Array.isArray(creators)
      ? creators.filter((entry): entry is string => typeof entry === 'string')
      : [],
    important: readBoolean('important', false),
    repeating: readBoolean('repeating', false),
    showAbandoned: readBoolean('showAbandoned', true),
    groupBy: readString<GroupBy>('groupBy', 'none'),
    sort: readString<SortBy>('sort', 'manual'),
  }
}

/** Which place-page a saved view was made on, so it opens where it belongs. */
export function definitionPage(definition: Record<string, unknown>): string | null {
  const page = definition['page']
  return typeof page === 'string' ? page : null
}
