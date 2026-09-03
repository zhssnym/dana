/*
The date helper surface package P4's queries import.

One entry point rather than three so the seam has one import path: the read
path embeds these predicates in Q1 and Q3C and treats the module as a black
box, and this module's handoff
makes changing a signature they depend on a Steward escalation. Re-exporting
here leaves the files behind it free to move without moving that contract.

P6 added the recurrence half below, extending this module rather than forking
it, and the seam stays the same: the Collaboration engineer calls generation
and the G-SERIES guard inside the transitions it owns, and the Query engineer
calls the projection from the calendar. Both are black boxes to their
callers, so a signature here changes only through a Steward escalation
(this module's handoff).

P7 added the reminder half, on the same terms. The Collaboration engineer
calls the recompute at four of 8.6's five triggers and the Security engineer
at the fifth, and both do so inside their own transaction; the reminder arm of
8.5's generation, which waited here for the computation, is closed inside
generation.ts and is nobody else's to call.
*/
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
  isDueByToday,
  myDayGroup,
  qualifyDate,
} from './predicates.js'
export type { CalendarRangeCheck, DueRelation, MyDayGroup } from './predicates.js'

/* The P6 recurrence engine: 4.11's iterator, 8.5's generation and
 * projection, and 5.1's G-SERIES guard. */
export { instancesInRange, nextInstance, parseStoredRule } from './recurrence.js'

export { generateSuccessor } from './generation.js'
export type { GenerationOutcome, GenerationRequest } from './generation.js'

export { applySeriesGuard, SERIES_MOVED_ON } from './series-guard.js'
export type { SeriesGuardOutcome } from './series-guard.js'

export { virtualInstances } from './projection.js'
export type { ProjectionSource } from './projection.js'

/* The P7 reminder half: 8.6's fire-instant computation and its five recompute
 * triggers. copyReminderToSuccessor is deliberately not re-exported; 8.5's
 * arm has exactly one caller and it is generation.ts, one directory in. */
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
