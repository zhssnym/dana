/*
A list's View settings: how it is grouped, how it is sorted, whether completed
tasks show, and at most one Label to show only (#208). The Label is the one
narrowing, and the page says so beside its View menu with a way to clear it.
Nothing here asks the server for anything.
*/
import type { TaskCard } from '../../shared/tasks.js'

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
