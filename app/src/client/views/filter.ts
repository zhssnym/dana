/*
A list's View settings: how it is grouped, how it is sorted, whether completed
tasks show, and at most one Label to show only (#208). The Label is the one
narrowing, and the page says so beside its View menu with a way to clear it.
Nothing here asks the server for anything.
*/
import type { TaskCard, TaskStatus } from '../../shared/tasks.js'

/** The person axis's own value for "nobody", which is not a user id. */
export const UNASSIGNED = 'unassigned'

/* `section` is the folder page's own arrangement and no other page's. */
export type GroupBy = 'none' | 'folder' | 'person' | 'date' | 'section'

export type SortBy = 'manual' | 'due' | 'title' | 'created'

export interface PageFilter {
  readonly groupBy: GroupBy
  readonly sort: SortBy
  readonly showCompleted: boolean
  /** A Label's id: only tasks wearing it show. Kept by id, never by name, so
      two Labels called the same thing stay two. */
  readonly label: string | null
}

export const NO_FILTER: PageFilter = {
  groupBy: 'none',
  sort: 'manual',
  showCompleted: false,
  label: null,
}

/*
The Task narrowing shared by Work and any later Freeform, Board or Calendar
surface. It is deliberately separate from `PageFilter`: that type arranges a
Focus list, while this one only answers whether one Task is visible. A filter
therefore cannot move a Task, change its Section, or choose a different order.
*/
export type ScheduleFilter = 'any' | 'with' | 'without' | 'overdue' | 'today'

export interface TaskFilter {
  /** Empty means every status. Values within this axis combine as OR. */
  readonly statuses: readonly TaskStatus[]
  /** Empty means anyone; `UNASSIGNED` is the explicit nobody value. */
  readonly assignees: readonly string[]
  readonly schedule: ScheduleFilter
  readonly important: boolean
  readonly repeating: boolean
  /** One Label id, kept by identity rather than display name. */
  readonly label: string | null
}

export const NO_TASK_FILTER: TaskFilter = {
  statuses: [],
  assignees: [],
  schedule: 'any',
  important: false,
  repeating: false,
  label: null,
}

const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'completed', 'abandoned']
const SCHEDULE_FILTERS: readonly ScheduleFilter[] = ['any', 'with', 'without', 'overdue', 'today']

/** A stored definition from this or an older client, with unknown values dropped. */
export function settleTaskFilter(stored: unknown): TaskFilter {
  if (typeof stored !== 'object' || stored === null) return NO_TASK_FILTER
  const record = stored as Record<string, unknown>
  const statuses = Array.isArray(record['statuses'])
    ? record['statuses'].filter((value): value is TaskStatus => TASK_STATUSES.includes(value as TaskStatus))
    : []
  const assignees = Array.isArray(record['assignees'])
    ? record['assignees'].filter((value): value is string => typeof value === 'string' && value !== '')
    : []
  const schedule = record['schedule']
  return {
    statuses,
    assignees,
    schedule: SCHEDULE_FILTERS.includes(schedule as ScheduleFilter)
      ? (schedule as ScheduleFilter)
      : 'any',
    important: record['important'] === true,
    repeating: record['repeating'] === true,
    label: typeof record['label'] === 'string' && record['label'] !== '' ? record['label'] : null,
  }
}

/** Whether any Task axis narrows the surface. */
export function taskFilterActive(filter: TaskFilter): boolean {
  return (
    filter.statuses.length > 0 ||
    filter.assignees.length > 0 ||
    filter.schedule !== 'any' ||
    filter.important ||
    filter.repeating ||
    filter.label !== null
  )
}

function matchesSchedule(task: TaskCard, schedule: ScheduleFilter, today: string): boolean {
  const dated = task.start_date !== null || task.due_date !== null
  switch (schedule) {
    case 'any':
      return true
    case 'with':
      return dated
    case 'without':
      return !dated
    case 'overdue':
      return task.status === 'pending' && task.due_date !== null && task.due_date < today
    case 'today':
      return task.start_date === today || task.due_date === today
  }
}

/** Pure, non-mutating AND across axes; values chosen within one axis are OR. */
export function taskMatchesFilter(
  task: TaskCard,
  filter: TaskFilter,
  today: string,
): boolean {
  const assignee = task.assignee?.id ?? UNASSIGNED
  return (
    (filter.statuses.length === 0 || filter.statuses.includes(task.status)) &&
    (filter.assignees.length === 0 || filter.assignees.includes(assignee)) &&
    matchesSchedule(task, filter.schedule, today) &&
    (!filter.important || task.important) &&
    (!filter.repeating || task.is_recurring) &&
    wearsLabel(task, filter.label)
  )
}

export interface TaskFilterChip {
  readonly key: keyof TaskFilter
  readonly label: string
  readonly cleared: TaskFilter
}

const STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  pending: 'Open',
  completed: 'Completed',
  abandoned: 'Dropped',
}

const SCHEDULE_CHIP: Readonly<Record<Exclude<ScheduleFilter, 'any'>, string>> = {
  with: 'Has a date',
  without: 'No date',
  overdue: 'Overdue',
  today: 'Today',
}

/** One removable chip per active axis, the same model every future view can draw. */
export function taskFilterChips(
  filter: TaskFilter,
  personName: (id: string) => string,
  labelName: (id: string) => string,
): readonly TaskFilterChip[] {
  const chips: TaskFilterChip[] = []
  if (filter.statuses.length > 0) {
    chips.push({
      key: 'statuses',
      label: filter.statuses.map((status) => STATUS_LABEL[status]).join(', '),
      cleared: { ...filter, statuses: [] },
    })
  }
  if (filter.assignees.length > 0) {
    chips.push({
      key: 'assignees',
      label: filter.assignees.map(personName).join(', '),
      cleared: { ...filter, assignees: [] },
    })
  }
  if (filter.schedule !== 'any') {
    chips.push({
      key: 'schedule',
      label: SCHEDULE_CHIP[filter.schedule],
      cleared: { ...filter, schedule: 'any' },
    })
  }
  if (filter.important) {
    chips.push({ key: 'important', label: 'Important', cleared: { ...filter, important: false } })
  }
  if (filter.repeating) {
    chips.push({ key: 'repeating', label: 'Repeating', cleared: { ...filter, repeating: false } })
  }
  if (filter.label !== null) {
    chips.push({
      key: 'label',
      label: labelName(filter.label),
      cleared: { ...filter, label: null },
    })
  }
  return chips
}

const GROUPS: readonly GroupBy[] = ['none', 'folder', 'person', 'date', 'section']
const SORTS: readonly SortBy[] = ['manual', 'due', 'title', 'created']

/**
 * A stored filter read back. Older clients stored due ranges, people and
 * switches the View menu no longer offers; they are dropped here so nobody is
 * left behind a narrowing they cannot see or undo.
 */
export function settleFilter(stored: unknown): PageFilter {
  if (typeof stored !== 'object' || stored === null) return NO_FILTER
  const record = stored as Record<string, unknown>
  const groupBy = record['groupBy']
  const sort = record['sort']
  const showCompleted = record['showCompleted']
  const label = record['label']
  return {
    groupBy: GROUPS.includes(groupBy as GroupBy) ? (groupBy as GroupBy) : 'none',
    sort: SORTS.includes(sort as SortBy) ? (sort as SortBy) : 'manual',
    showCompleted: typeof showCompleted === 'boolean' ? showCompleted : false,
    label: typeof label === 'string' && label !== '' ? label : null,
  }
}

/** Whether a task wears the Label a filter names; every task when none. */
export function wearsLabel(task: TaskCard, label: string | null): boolean {
  if (label === null) return true
  return [...(task.labels?.personal ?? []), ...(task.labels?.folder ?? [])].some(
    (worn) => worn.id === label,
  )
}

/** The distinct active Labels a page's rows wear, by name, for the View menu. */
export function labelsWorn(
  rows: readonly TaskCard[],
): readonly { readonly id: string; readonly name: string; readonly color: string }[] {
  const seen = new Map<string, { id: string; name: string; color: string }>()
  for (const task of rows) {
    for (const worn of [...(task.labels?.personal ?? []), ...(task.labels?.folder ?? [])]) {
      if (!worn.archived && !seen.has(worn.id)) {
        seen.set(worn.id, { id: worn.id, name: worn.name, color: worn.color })
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

/** Rows in their page's order unless a sort was asked for. Never mutates. */
export function sortRows(rows: readonly TaskCard[], sort: SortBy): readonly TaskCard[] {
  if (sort === 'manual') return rows
  const copy = [...rows]
  switch (sort) {
    case 'due':
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
