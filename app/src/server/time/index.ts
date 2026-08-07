/*
The date helper surface package P4's queries import.

One entry point rather than three so the seam docs/team/README.md names has
one import path: the Query engineer embeds these predicates in Q1 and Q3C and
treats the module as a black box, and 02-scheduling-and-time.md's Handoff
makes changing a signature they depend on a Steward escalation. Re-exporting
here leaves the files behind it free to move without moving that contract.

What is deliberately not here yet: the 4.11 recurrence iterator and the 8.6
fire-instant module, which 11.9 assigns to this same role and RFC 0001 places
in P6 and P7. This is the subset P4 needs, and those packages extend it
rather than fork it.
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
