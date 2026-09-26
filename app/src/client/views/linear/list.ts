/*
The issue list's rules, kept pure so they are measured (m3 list; scratchpad
m3/RESEARCH-LIST.md): which issues a state, filter and sort show, in what
order, where the milestone rows fall, and where a dragged row lands in the
page's Work document.

Nothing here reads React. `LinearView.tsx` draws what `listRows` returns and
turns a drop into `dropPlacement`'s edit.
*/
import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { pageRank, sectionReader } from './issues.js'
import { stageOf } from './stage.js'

/** The header's state switch. All is Dana's addition over GitHub (Hassan). */
export type ListState = 'open' | 'closed' | 'all'
export type ListSort = 'manual' | 'newest' | 'oldest' | 'updated' | 'due' | 'comments'
export type Density = 'compact' | 'comfortable'

export const SORT_WORD: Record<ListSort, string> = {
  manual: 'Page order',
  newest: 'Newest',
  oldest: 'Oldest',
  updated: 'Recently updated',
  due: 'Due date',
  comments: 'Most commented',
}

/** Milestone: any, outside every milestone, or one section's id. */
export type MilestoneFilter = { kind: 'any' } | { kind: 'none' } | { kind: 'section'; id: string }
/** Assignee: anyone, nobody, or one person's id. */
export type AssigneeFilter = { kind: 'any' } | { kind: 'none' } | { kind: 'person'; id: string }

export interface ListFilters {
  readonly milestone: MilestoneFilter
  readonly assignee: AssigneeFilter
}

export const NO_FILTERS: ListFilters = { milestone: { kind: 'any' }, assignee: { kind: 'any' } }

export function isClosed(task: Pick<TaskCard, 'status'>): boolean {
  return task.status !== 'pending'
}

export type ListRow =
  | {
      readonly kind: 'milestone'
      readonly id: string
      readonly name: string
      /** Every issue in it, whatever the state switch shows. */
      readonly done: number
      readonly total: number
    }
  | { readonly kind: 'task'; readonly task: TaskCard; readonly section: string | null }

export interface ListInput {
  readonly page: PageView
  /** Every issue the page has (open and closed), each once. */
  readonly tasks: readonly TaskCard[]
  readonly state: ListState
  readonly filters: ListFilters
  readonly sort: ListSort
  readonly comments: ReadonlyMap<string, number>
}

/** Open / Closed / All counts under the header's filters, as GitHub counts. */
export function stateCounts(input: Omit<ListInput, 'state' | 'sort' | 'comments'>): Record<ListState, number> {
  const kept = filtered(input.page, input.tasks, input.filters)
  const closed = kept.filter(isClosed).length
  return { open: kept.length - closed, closed, all: kept.length }
}

function filtered(page: PageView, tasks: readonly TaskCard[], filters: ListFilters): TaskCard[] {
  const { sectionOf } = sectionReader(page)
  return tasks.filter((task) => {
    const m = filters.milestone
    if (m.kind === 'none' && sectionOf(task) !== null) return false
    if (m.kind === 'section' && sectionOf(task) !== m.id) return false
    const a = filters.assignee
    if (a.kind === 'none' && task.assignee !== null) return false
    if (a.kind === 'person' && task.assignee?.id !== a.id) return false
    return true
  })
}

/**
 * The rows the table draws. In page order (Manual) tasks sit under milestone
 * rows in the page's own order, closed ones in their place; every milestone
 * stays, empty or finished, because it is where a drag lands. Any other sort
 * is one flat list, as GitHub's is.
 */
export function listRows(input: ListInput): ListRow[] {
  const { page, state, filters, sort, comments } = input
  const rank = pageRank(page)
  const { sections, sectionOf } = sectionReader(page)
  const kept = filtered(page, input.tasks, filters).filter((task) =>
    state === 'all' ? true : state === 'closed' ? isClosed(task) : !isClosed(task),
  )
  const at = (task: TaskCard): number => rank.get(task.id) ?? Number.MAX_SAFE_INTEGER

  if (sort !== 'manual') {
    const by: Record<Exclude<ListSort, 'manual'>, (a: TaskCard, b: TaskCard) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      /* Dated first, soonest first; undated after, in page order. */
      due: (a, b) =>
        (a.due_date === null ? 1 : 0) - (b.due_date === null ? 1 : 0) || (a.due_date ?? '').localeCompare(b.due_date ?? ''),
      comments: (a, b) => (comments.get(b.id) ?? 0) - (comments.get(a.id) ?? 0),
    }
    return [...kept]
      .sort((a, b) => by[sort](a, b) || at(a) - at(b))
      .map((task) => ({ kind: 'task', task, section: sectionOf(task) }))
  }

  const ordered = [...kept].sort((a, b) => at(a) - at(b))
  const rows: ListRow[] = []
  for (const task of ordered) if (sectionOf(task) === null) rows.push({ kind: 'task', task, section: null })
  const everyIssue = filtered(page, input.tasks, { ...filters, milestone: { kind: 'any' } })
  const m = filters.milestone
  for (const section of sections) {
    if (m.kind === 'none' || (m.kind === 'section' && m.id !== section.id)) continue
    const own = everyIssue.filter((task) => sectionOf(task) === section.id)
    rows.push({
      kind: 'milestone',
      id: section.id,
      name: section.name,
      /* Closed counts as done, not planned too: GitHub's milestone progress. */
      done: own.filter(isClosed).length,
      total: own.length,
    })
    for (const task of ordered) if (sectionOf(task) === section.id) rows.push({ kind: 'task', task, section: section.id })
  }
  return rows
}

/**
 * Where a row dropped at `to` (after the list moved it there) belongs in the
 * page: the milestone above it (null above the first), and the next issue
 * shown below it in that milestone, which it goes in front of (null: the
 * milestone's end). Hidden issues between two shown ones keep their places.
 */
export function dropPlacement(rows: readonly ListRow[], to: number): { section: string | null; before: string | null } {
  let section: string | null = null
  for (let i = to - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.kind === 'milestone') {
      section = row.id
      break
    }
  }
  const next = rows[to + 1]
  return { section, before: next?.kind === 'task' ? next.task.id : null }
}

/** The list's four states of an issue: open, started, done, not planned. */
export type RowState = 'open' | 'in-progress' | 'completed' | 'not-planned'

export function rowState(task: Pick<TaskCard, 'status' | 'start_date'>, today: string): RowState {
  if (task.status === 'completed') return 'completed'
  if (task.status === 'abandoned') return 'not-planned'
  return stageOf(task, today) === 'present' ? 'in-progress' : 'open'
}
