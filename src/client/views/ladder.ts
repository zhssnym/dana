/*
 * Upcoming's date ladder, also the date axis of every board. Rows are bucketed by the schedule date the server
 * sorted by, walked once with no re-sort. Overdue opens the ladder and In progress (started, not late) follows;
 * both capture nothing. Day rungs capture their date; week, month and "Later" rungs name ranges and capture
 * nothing.
 */
import { addDays, formatDayHeading, formatMonthHeading, weekStart } from '../lib/dates.js'
import { scheduleDateOf } from '../parts/schedule.js'
import { stageOf } from './linear/stage.js'
import type { Schedule } from '../parts/schedule.js'
import type { TaskCard } from '../../shared/tasks.js'

export interface LadderRung {
  /** Stable across renders: the date where a rung is one, else its name. */
  readonly key: string
  /** The heading, also the region's name. */
  readonly name: string
  /** The day a capture in this rung writes, or null for a range. */
  readonly date: string | null
  readonly rows: readonly TaskCard[]
}

interface Bucket {
  readonly key: string
  readonly name: string
  readonly date: string | null
}

/** Shared by the ladder and the board's date columns, so one bucket has one name. */
const STARTED: Bucket = { key: 'started', name: 'In progress', date: null }

/** Weeks run Monday to Sunday, as on the calendar. */
export function rungFor(due: string | null, today: string): Bucket {
  if (due === null) return { key: 'undated', name: 'No date', date: null }
  if (due < today) return { key: 'overdue', name: 'Overdue', date: null }
  if (due === today) return { key: 'today', name: 'Today', date: today }
  const tomorrow = addDays(today, 1)
  if (due === tomorrow) return { key: 'tomorrow', name: 'Tomorrow', date: tomorrow }

  const thisWeekEnd = addDays(weekStart(today), 6)
  if (due <= thisWeekEnd) return { key: due, name: formatDayHeading(due, today), date: due }

  const nextWeekEnd = addDays(thisWeekEnd, 7)
  if (due <= nextWeekEnd) return { key: 'next-week', name: 'Next week', date: null }

  const month = due.slice(0, 7)
  const twelveMonths = addDays(today, 365)
  if (due <= twelveMonths) return { key: month, name: formatMonthHeading(due, today), date: null }
  return { key: 'later', name: 'Later', date: null }
}

/**
 * In progress when started and not late, else `rungFor` over the schedule date. The list ladder and board date
 * axis both call this, so they cannot disagree.
 */
export function rungForTask(
  task: Schedule & Pick<TaskCard, 'status'>,
  today: string,
): Bucket {
  const late = task.due_date !== null && task.due_date < today
  if (!late && stageOf(task, today) === 'present') return STARTED
  return rungFor(scheduleDateOf(task), today)
}

/** In arrival order. A rung with no rows is absent, not an empty heading. */
export function ladderRungs(
  rows: readonly TaskCard[],
  today: string,
): readonly LadderRung[] {
  const order: string[] = []
  const buckets = new Map<string, { bucket: Bucket; rows: TaskCard[] }>()
  for (const task of rows) {
    const bucket = rungForTask(task, today)
    const existing = buckets.get(bucket.key)
    if (existing === undefined) {
      order.push(bucket.key)
      buckets.set(bucket.key, { bucket, rows: [task] })
      continue
    }
    existing.rows.push(task)
  }
  /* Overdue first, In progress second; the rest keep first appearance. */
  const pinned = ['overdue', STARTED.key]
  order.sort((a, b) => {
    const rank = (key: string): number => {
      const at = pinned.indexOf(key)
      return at === -1 ? pinned.length : at
    }
    return rank(a) - rank(b)
  })
  return order.map((key) => {
    const held = buckets.get(key)
    return {
      key,
      name: held?.bucket.name ?? key,
      date: held?.bucket.date ?? null,
      rows: held?.rows ?? [],
    }
  })
}
