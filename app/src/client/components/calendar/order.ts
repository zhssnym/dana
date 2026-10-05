// Cell order: all-day banners (status_rank, id), then timed rows (due_time,
// status_rank, id), then ghosts (date, task id). Real and virtual rows arrive as
// separate arrays, so the client must interleave them.
import { folderDisplay } from '../../parts/presenters.js'
import { movableEnd } from '../../parts/schedule.js'
import type { Folder } from '../../../shared/folders.js'
import type { TaskCard, TaskStatus } from '../../../shared/tasks.js'
import type { VirtualInstance } from '../../../shared/views.js'

export const STATUS_RANK: Record<string, number> = {
  pending: 0,
  abandoned: 1,
  completed: 2,
}

export interface CellEvent {
  readonly key: string
  readonly kind: 'real' | 'ghost'
  /** A ghost opens its series' current occurrence. */
  readonly taskId: string
  readonly title: string
  readonly date: string
  /** HH:MM:SS for a timed row, null for an all-day banner. */
  readonly dueTime: string | null
  readonly statusRank: number
  readonly status: TaskStatus | null
  readonly folderColor: string | null
  /** Which field a drop on another day writes, or null where the row must not be dragged. */
  readonly moves: 'start_date' | 'due_date' | 'range' | null
}

function groupOf(event: CellEvent): number {
  if (event.kind === 'ghost') return 2
  return event.dueTime === null ? 0 : 1
}

function compare(a: string | number, b: string | number): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function compareCellEvents(a: CellEvent, b: CellEvent): number {
  const group = groupOf(a) - groupOf(b)
  if (group !== 0) return group

  if (groupOf(a) === 0) {
    return compare(a.statusRank, b.statusRank) || compare(a.taskId, b.taskId)
  }
  if (groupOf(a) === 1) {
    // A timed row always has a due_time; the fallback avoids a non-null assertion.
    return (
      compare(a.dueTime ?? '', b.dueTime ?? '') ||
      compare(a.statusRank, b.statusRank) ||
      compare(a.taskId, b.taskId)
    )
  }
  // Inside one cell the date always ties, but the rule compares it anyway.
  return compare(a.date, b.date) || compare(a.taskId, b.taskId)
}

function realEvent(
  task: TaskCard,
  folders: readonly Folder[],
): CellEvent {
  const date = task.due_date ?? task.start_date ?? ''
  return {
    key: `real:${task.id}`,
    kind: 'real',
    taskId: task.id,
    title: task.title,
    date,
    dueTime: task.due_time,
    statusRank: STATUS_RANK[task.status] ?? 0,
    status: task.status,
    folderColor: folderDisplay(task.folder, folders).color,
    moves: movableEnd(task),
  }
}

function ghostEvent(instance: VirtualInstance): CellEvent {
  return {
    key: `ghost:${instance.task_id}:${instance.date}`,
    kind: 'ghost',
    taskId: instance.task_id,
    title: instance.title,
    date: instance.date,
    dueTime: instance.due_time,
    // Ghosts sort by date and task id, so this rank takes part in no comparison.
    statusRank: STATUS_RANK.pending ?? 0,
    status: null,
    folderColor: null,
    moves: null,
  }
}

/**
 * Rows keyed by day and ordered inside each day. Callers pass only single-date
 * tasks; range tasks go to weekly bars.
 */
export function cellsByDate(
  real: readonly TaskCard[],
  virtual: readonly VirtualInstance[],
  folders: readonly Folder[],
): Map<string, CellEvent[]> {
  const cells = new Map<string, CellEvent[]>()
  const place = (event: CellEvent): void => {
    const existing = cells.get(event.date)
    if (existing === undefined) cells.set(event.date, [event])
    else existing.push(event)
  }
  for (const task of real) place(realEvent(task, folders))
  for (const instance of virtual) place(ghostEvent(instance))
  for (const rows of cells.values()) rows.sort(compareCellEvents)
  return cells
}
