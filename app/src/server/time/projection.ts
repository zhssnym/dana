// 8.5's virtual instances: the ghost dates a calendar draws for a series. Pure date arithmetic, no clock.
// The caller must pass tasks due before the range too, or a weekly chore vanishes from later months (AC-143).
import { addDays, compareDates } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { instancesInRange } from './recurrence.js'

export interface ProjectionSource {
  readonly status: string
  readonly dueDate: CalendarDate | null
  readonly recurrenceRule: string | null
}

/**
 * The dates one task's series draws a ghost on inside an inclusive range, ascending.
 * Only after the current due date, so no date shows the series twice. Empty unless pending, dated and recurring.
 */
export function virtualInstances(
  task: ProjectionSource,
  rangeStart: CalendarDate,
  rangeEnd: CalendarDate,
): CalendarDate[] {
  if (task.status !== 'pending') return []
  if (task.recurrenceRule === null || task.dueDate === null) return []

  const afterCurrent = addDays(task.dueDate, 1)
  const lo =
    compareDates(rangeStart, afterCurrent) >= 0 ? rangeStart : afterCurrent
  return instancesInRange(task.recurrenceRule, task.dueDate, lo, rangeEnd)
}
