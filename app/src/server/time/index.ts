/*
The date helper surface package P4's queries import.

One entry point rather than three so the seam docs/team/README.md names has
one import path: the Query engineer embeds these predicates in Q1 and Q3C and
treats the module as a black box, and 02-scheduling-and-time.md's Handoff
makes changing a signature they depend on a Steward escalation. Re-exporting
here leaves the files behind it free to move without moving that contract.

P6 added the recurrence half below, extending this module rather than forking
it, and the seam stays the same: the Collaboration engineer calls generation
and the G-SERIES guard inside the transitions it owns, and the Query engineer
calls the projection from the calendar. Both are black boxes to their
callers, so a signature here changes only through a Steward escalation
(02-scheduling-and-time.md, Handoff).

What is deliberately not here yet: the 8.6 fire-instant module, which 11.9
assigns to this same role and RFC 0001 places in P7. The reminder arm of
8.5's generation waits with it, and generation.ts carries the seam.
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
} from './calendarDate.js'
export type { CalendarDate } from './calendarDate.js'

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

export { applySeriesGuard, SERIES_MOVED_ON } from './seriesGuard.js'
export type { SeriesGuardOutcome } from './seriesGuard.js'

export { virtualInstances } from './projection.js'
export type { ProjectionSource } from './projection.js'

export type { Executor } from './executor.js'
