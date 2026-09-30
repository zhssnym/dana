/*
Q3C's cell order, and the mapping from the two arrays the endpoint returns to
the rows one cell draws.

"Cell order: all-day banners first (status_rank, id), then timed rows
(due_time, status_rank, id), then ghosts (date order, task id)."

That is three ordered groups with a different key list inside each, which is
why it is a comparator rather than a sort key.

**11.4 no longer asks for a library's comparator, and this file is smaller
for it.** Under FullCalendar the order had to be expressed to the library
through its `eventOrder` refiner, with a per-cell ghost overlay named as the
fallback if the refiner could not express it. The library is gone:
the grid is ours, so a cell orders its rows by rendering them in order, and
the fallback disappears with the mechanism. 11.4's own sentence, "the visible
order is the contract, the mechanism is not", is what makes that a
simplification rather than a change.

**This is not re-sorting a server result.** Section 6's preamble says every
view returns rows already ordered and clients never re-sort. A calendar cell
interleaves two arrays the response returns separately, real rows and virtual
instances, and no server order exists over the union; Q3C states the cell
order for exactly that reason. Nothing below reorders either array within
itself.

**Single-date Tasks land on the date they carry.** Start+Due Tasks are removed
before this function and drawn by `ranges.ts` as continuous weekly bars.

**The one display value taken from `parts/presenters.ts` is the folder
colour**, through `folderDisplay`, because 7.0's card carries a folder stub
with no colour and the colour is the viewer's own `my_color` on 7.4's
membership. A ghost has no folder to colour: it is drawn with the repeat glyph
instead, which is what tells a projection from a row at a glance.
*/
import { folderDisplay } from '../../parts/presenters.js'
import { movableEnd } from '../../parts/schedule.js'
import type { Folder } from '../../../shared/folders.js'
import type { TaskCard, TaskStatus } from '../../../shared/tasks.js'
import type { VirtualInstance } from '../../../shared/views.js'

/** Section 6's preamble: pending 0, abandoned 1, completed 2. */
export const STATUS_RANK: Record<string, number> = {
  pending: 0,
  abandoned: 1,
  completed: 2,
}

/** One row inside one day cell, real or projected. */
export interface CellEvent {
  /** Stable across renders and unique within the grid; React's key. */
  readonly key: string
  readonly kind: 'real' | 'ghost'
  /** What a click opens. A ghost opens its series' current occurrence. */
  readonly taskId: string
  readonly title: string
  /** The calendar date this row was placed on, as 4.11 writes one. */
  readonly date: string
  /** HH:MM:SS for a timed row, null for an all-day banner. */
  readonly dueTime: string | null
  readonly statusRank: number
  /** A projection has no status of its own, so a ghost carries none. */
  readonly status: TaskStatus | null
  /** 7.4's `my_color` for the row's folder, or null for a ghost. */
  readonly folderColor: string | null
  /**
   * Which field a drop on another day writes, or null where the row must not
   * be dragged: `parts/schedule.ts`'s `movableEnd` carries the rule and Q3C
   * the sentence. A ghost is a projection with no date of its own, so it is
   * null here as well as undraggable for the reason `PlannedCalendar` gives.
   */
  readonly moves: 'start_date' | 'due_date' | 'range' | null
}

/**
 * The three groups Q3C names, in the order it names them.
 *
 * The all-day banner lane and the timed lane of 9.5 are these first two groups
 * inside the cell: 11.4's delta makes the grid a month of day cells at every
 * zoom, and says in as many words that "the Q3C cell order, banners then timed
 * then ghosts, is the order the cell renders them in". So a lane here is a
 * contiguous block at the top of a cell rather than a separate track beside
 * it, which is the only shape a day cell admits.
 */
function groupOf(event: CellEvent): number {
  if (event.kind === 'ghost') return 2
  return event.dueTime === null ? 0 : 1
}

function compare(a: string | number, b: string | number): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** The comparator itself, over two rows of one cell. */
export function compareCellEvents(a: CellEvent, b: CellEvent): number {
  const group = groupOf(a) - groupOf(b)
  if (group !== 0) return group

  if (groupOf(a) === 0) {
    // All-day banners: status_rank, id.
    return compare(a.statusRank, b.statusRank) || compare(a.taskId, b.taskId)
  }
  if (groupOf(a) === 1) {
    // Timed rows: due_time, status_rank, id. A timed row has a due_time by
    // construction, so the empty-string fallback is unreachable and is here
    // rather than a non-null assertion.
    return (
      compare(a.dueTime ?? '', b.dueTime ?? '') ||
      compare(a.statusRank, b.statusRank) ||
      compare(a.taskId, b.taskId)
    )
  }
  /*
  Ghosts: date order, task id. Inside one cell the date is a tie in every
  comparison and is compared anyway: the rule is Q3C's, and a comparator that
  dropped a key because its caller happens to make it constant is a comparator
  that breaks when the caller changes.
  */
  return compare(a.date, b.date) || compare(a.taskId, b.taskId)
}

/** A real row, from 7.0's card. */
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
    /* Which end of the Schedule a drop writes, decided from the row rather
       than assumed to be the deadline (Q3C, issue #216). Null on a ghost,
       which has no date of its own to move; `range` on a Start+Due pair,
       which moves whole. */
    moves: movableEnd(task),
  }
}

/** A projected occurrence, from 7.10's virtual instance. */
function ghostEvent(instance: VirtualInstance): CellEvent {
  return {
    key: `ghost:${instance.task_id}:${instance.date}`,
    kind: 'ghost',
    taskId: instance.task_id,
    title: instance.title,
    date: instance.date,
    dueTime: instance.due_time,
    // 8.5 projects from a pending task, and Q3C orders ghosts by date and
    // task id rather than by rank, so this participates in no comparison.
    statusRank: STATUS_RANK.pending ?? 0,
    status: null,
    folderColor: null,
    moves: null,
  }
}

/**
 * Every row the response holds, keyed by the day it draws on and ordered
 * inside each day by Q3C.
 *
 * A map rather than a filter per cell: a month grid is forty-two cells, and
 * scanning both arrays once per cell is forty-two passes over a response that
 * 13.23 already records as unbounded in its ghost arm.
 *
 * Callers supply only single-date Tasks; range Tasks go to weekly bars.
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
