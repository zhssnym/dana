/*
A list's View settings: how it is grouped, how it is sorted, and whether
completed tasks show. It never narrows rows away and never asks the server for
anything; the rows a page fetched are the rows it shows.
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
}

export const NO_FILTER: PageFilter = {
  groupBy: 'none',
  sort: 'manual',
  showCompleted: false,
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
  return {
    groupBy: GROUPS.includes(groupBy as GroupBy) ? (groupBy as GroupBy) : 'none',
    sort: SORTS.includes(sort as SortBy) ? (sort as SortBy) : 'manual',
    showCompleted: typeof showCompleted === 'boolean' ? showCompleted : false,
  }
}

/** Nothing narrows any more; kept for the folder page's arrangement check. */
export function isNarrowed(_filter: PageFilter): boolean {
  return false
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

/** Which place-page a saved view was made on. */
export function definitionPage(definition: Record<string, unknown>): string | null {
  const page = definition['page']
  return typeof page === 'string' ? page : null
}
