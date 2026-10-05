// The date, recurrence and reminder helpers, behind one import path.
export {
  addDays,
  assertCalendarDate,
  civilDateOf,
  civilMillis,
  compareDates,
  DAY_MS,
  daysBetween,
  earliestDate,
  isCalendarDate,
  withinInclusive,
} from './calendar-date.js'
export type { CalendarDate } from './calendar-date.js'

export { localDateOf, localDayWindow, today } from './today.js'
export type { LocalDayWindow } from './today.js'

export {
  CALENDAR_RANGE_MAX_DAYS,
  checkCalendarRange,
  dueRelation,
  isActiveByToday,
  myDayGroup,
  qualifyDate,
} from './predicates.js'
export type { CalendarRangeCheck, DueRelation, MyDayGroup } from './predicates.js'

export { instancesInRange, nextInstance, parseStoredRule } from './recurrence.js'

export { generateSuccessor } from './generation.js'
export type { GenerationOutcome, GenerationRequest } from './generation.js'

export { applySeriesGuard, SERIES_MOVED_ON } from './series-guard.js'
export type { SeriesGuardOutcome } from './series-guard.js'

export { virtualInstances } from './projection.js'
export type { ProjectionSource } from './projection.js'

// copyReminderToSuccessor is not re-exported: generation.ts is its only caller.
export { computeFireAt, resolveFireAt, resolveLocalTime } from './reminder-time.js'
export type { FireAtInput, LocalResolution, LocalTimeKind } from './reminder-time.js'

export { planReminder, recomputeReminders } from './reminder-recompute.js'
export type {
  ComputedState,
  RecomputeOutcome,
  RecomputedReminder,
  ReminderPlan,
  ReminderPlanRequest,
  ReminderState,
  ReminderTrigger,
  UnresolvedReminder,
} from './reminder-recompute.js'

export type { Executor } from '../database.js'
