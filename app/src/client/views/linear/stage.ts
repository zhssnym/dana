/*
Where a task stands in the story of its page: future, present or past. The
Linear view draws these as its three parts and the Board as its three columns
(Not started, In progress, Done), so both read this one rule, and this one
order within each (round 5): the Board's columns list their cards exactly as
Linear lists its steps.

In progress is not a stored state: a pending task whose start date is today or
earlier has started. Starting a step writes its start date; putting it back in
the queue clears it. See scratchpad r4/linear/DECISIONS.md.
*/
import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'

export type Stage = 'future' | 'present' | 'past'

export function stageOf(task: Pick<TaskCard, 'status' | 'start_date'>, today: string): Stage {
  if (task.status !== 'pending') return 'past'
  return task.start_date !== null && task.start_date <= today ? 'present' : 'future'
}

/** The start date that starts a task today. The server holds start <= due, so
 * an overdue task starts on its due day. */
export function startDay(task: Pick<TaskCard, 'due_date'>, today: string): string {
  return task.due_date !== null && task.due_date < today ? task.due_date : today
}

/** A page's items in its own order: id → position. */
export function pageRank(page: Pick<PageView, 'items'>): ReadonlyMap<string, number> {
  const map = new Map<string, number>()
  for (const item of page.items) if (!map.has(item.id)) map.set(item.id, map.size)
  return map
}

function byRank(rank: ReadonlyMap<string, number>) {
  return (a: TaskCard, b: TaskCard): number =>
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
}

/** The present: overdue first, then by start, then in page order. */
export function presentOrder(
  tasks: readonly TaskCard[],
  today: string,
  rank: ReadonlyMap<string, number>,
): TaskCard[] {
  const late = (task: TaskCard): number => (task.due_date !== null && task.due_date < today ? 1 : 0)
  return tasks
    .filter((task) => stageOf(task, today) === 'present')
    .sort(
      (a, b) =>
        late(b) - late(a) || (a.start_date ?? '').localeCompare(b.start_date ?? '') || byRank(rank)(a, b),
    )
}

export interface Milestone {
  /** The section's block id; null for the steps outside every section. */
  readonly id: string | null
  readonly name: string | null
  readonly tasks: readonly TaskCard[]
}

/**
 * The queue, as milestones: loose steps first, then each top-level section in
 * page order, each in page order. A section whose steps have all started or
 * finished has left the queue; an empty one is still a place to add steps.
 */
export function futureMilestones(
  page: PageView,
  tasks: readonly TaskCard[],
  finished: readonly TaskCard[],
  today: string,
  rank: ReadonlyMap<string, number>,
): Milestone[] {
  const sections = page.blocks
    .filter((block) => block.kind === 'section' && block.section_block_id === null)
    .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
  const known = new Set(sections.map((s) => s.id))
  const placement = new Map((page.task_placements ?? []).map((row) => [row.id, row.section_block_id]))
  const sectionOf = (task: TaskCard): string | null => {
    const id = placement.get(task.id) ?? task.section_block_id ?? null
    return id !== null && known.has(id) ? id : null
  }
  const queued = tasks.filter((task) => stageOf(task, today) === 'future').sort(byRank(rank))
  const loose: Milestone = { id: null, name: null, tasks: queued.filter((t) => sectionOf(t) === null) }
  const groups: Milestone[] = []
  if (loose.tasks.length > 0 || sections.length === 0) groups.push(loose)
  for (const block of sections) {
    const own = queued.filter((t) => sectionOf(t) === block.id)
    if (own.length === 0 && [...tasks, ...finished].some((t) => sectionOf(t) === block.id)) continue
    groups.push({ id: block.id, name: block.text?.trim() || 'Untitled', tasks: own })
  }
  return groups.length > 0 ? groups : [loose]
}

/**
 * The past, oldest first so the story runs down into the present: finished
 * work as the completed query returns it (newest first), reversed, with
 * abandoned steps, which have no completion day, before them.
 */
export function pastOrder<T extends { readonly task: TaskCard }>(
  finishedNewestFirst: readonly T[],
  abandoned: readonly T[],
): T[] {
  const seen = new Set<string>()
  return [...finishedNewestFirst, ...abandoned]
    .filter((row) => {
      if (seen.has(row.task.id)) return false
      seen.add(row.task.id)
      return true
    })
    .reverse()
}
