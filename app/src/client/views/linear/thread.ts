/*
The Linear view's rows and the thread between them, as plain data.

Order is the list's: tasks under no section, then each section with its own
tasks, each group in `page.items` order.

A **joint** is the stretch of thread between one visible step and the visible
step before it. It is *linked* exactly when the lower step waits on the upper
one (a `task_dependencies` row, dependent = lower, blocker = upper). Any other
edge inside the page - left behind by a reorder, or reaching past a hidden
row - is not drawn; the step says "after <title>" instead, so a link never
silently points somewhere the thread does not go.
*/
import type { PageView } from '../../../shared/pages.js'
import type { FolderDependencyEdge } from '../../../shared/task-dependencies.js'
import type { TaskCard } from '../../../shared/tasks.js'

export type ThreadRow =
  | { readonly kind: 'section'; readonly id: string; readonly name: string }
  | { readonly kind: 'task'; readonly id: string; readonly task: TaskCard }

/** How one stretch of thread is drawn: passed through (the upper step is
 * done), linked but not yet passed, or not linked at all. */
export type Segment = 'reached' | 'linked' | 'loose'

export interface Joint {
  readonly upper: TaskCard
  readonly lower: TaskCard
  /** The edge's id when the lower step waits on the upper one. */
  readonly edgeId: string | null
  readonly segment: Segment
}

export function threadRows(
  page: PageView,
  tasks: readonly TaskCard[],
  completed: readonly TaskCard[],
  showCompleted: boolean,
): ThreadRow[] {
  const visible = showCompleted ? [...tasks, ...completed] : [...tasks]
  const rank = new Map<string, number>()
  for (const item of page.items) if (!rank.has(item.id)) rank.set(item.id, rank.size)
  const ordered = visible
    .map((task, index) => ({ task, index, placed: rank.get(task.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.placed - b.placed || a.index - b.index)
    .map((entry) => entry.task)

  const sections = page.blocks
    .filter((block) => block.kind === 'section' && block.section_block_id === null)
    .map((block, index) => ({ block, index, placed: rank.get(block.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.placed - b.placed || a.index - b.index)
    .map((entry) => entry.block)
  const known = new Set(sections.map((block) => block.id))
  const placement = new Map((page.task_placements ?? []).map((row) => [row.id, row.section_block_id]))
  const sectionOf = (task: TaskCard): string | null => {
    const id = placement.get(task.id) ?? task.section_block_id ?? null
    return id !== null && known.has(id) ? id : null
  }

  const seen = new Set<string>()
  const rows: ThreadRow[] = []
  const pushTasks = (section: string | null): void => {
    for (const task of ordered) {
      if (seen.has(task.id) || sectionOf(task) !== section) continue
      seen.add(task.id)
      rows.push({ kind: 'task', id: task.id, task })
    }
  }
  pushTasks(null)
  for (const block of sections) {
    rows.push({ kind: 'section', id: block.id, name: block.text?.trim() || 'Untitled' })
    pushTasks(block.id)
  }
  return rows
}

/** The last top-level section in page order, where a new step at the foot of
 * the path belongs; null when the page has none. */
export function lastSectionId(rows: readonly ThreadRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row?.kind === 'section') return row.id
  }
  return null
}

/** Done and total (abandoned left out) for each section, from the rows it heads. */
export function sectionProgress(rows: readonly ThreadRow[]): Map<string, { done: number; total: number }> {
  const out = new Map<string, { done: number; total: number }>()
  let current: { done: number; total: number } | null = null
  for (const row of rows) {
    if (row.kind === 'section') {
      current = { done: 0, total: 0 }
      out.set(row.id, current)
    } else if (current !== null && row.task.status !== 'abandoned') {
      current.total += 1
      if (row.task.status === 'completed') current.done += 1
    }
  }
  return out
}

/**
 * For each row index, the joint that ends at it (task rows) or runs through it
 * (section rows between two steps), plus each step's other in-page blockers.
 */
export function threadJoints(
  rows: readonly ThreadRow[],
  edges: readonly FolderDependencyEdge[],
): { readonly byRow: ReadonlyMap<number, Joint>; readonly after: ReadonlyMap<string, readonly TaskCard[]> } {
  const edgeOf = new Map<string, string>()
  for (const edge of edges) edgeOf.set(`${edge.dependent_task_id}>${edge.blocking_task_id}`, edge.id)

  const byRow = new Map<number, Joint>()
  let previous: { task: TaskCard; index: number } | null = null
  const drawn = new Set<string>()
  rows.forEach((row, index) => {
    if (row.kind !== 'task') return
    if (previous !== null) {
      const edgeId = edgeOf.get(`${row.task.id}>${previous.task.id}`) ?? null
      const segment: Segment =
        edgeId === null ? 'loose' : previous.task.status === 'completed' ? 'reached' : 'linked'
      const joint: Joint = { upper: previous.task, lower: row.task, edgeId, segment }
      for (let i = previous.index + 1; i <= index; i += 1) byRow.set(i, joint)
      if (edgeId !== null) drawn.add(edgeId)
    }
    previous = { task: row.task, index }
  })

  const visible = new Map<string, TaskCard>()
  for (const row of rows) if (row.kind === 'task') visible.set(row.task.id, row.task)
  const after = new Map<string, TaskCard[]>()
  for (const edge of edges) {
    if (drawn.has(edge.id)) continue
    const blocker = visible.get(edge.blocking_task_id)
    if (blocker === undefined || !visible.has(edge.dependent_task_id)) continue
    const list = after.get(edge.dependent_task_id) ?? []
    list.push(blocker)
    after.set(edge.dependent_task_id, list)
  }
  return { byRow, after }
}
