/*
8.6's fire-instant computation: the one place a reminder's UTC instant is
decided, and the only place either of 8.6's two DST rules is written.

**Why this file computes its own zone math instead of asking Luxon for it.**
11.9 gives Luxon 3 all IANA timezone math, and this file uses it, but only in
the direction that is total: instant to local. Every instant has exactly one
local time in every zone, whatever DST is doing, so that direction has no
policy in it. The other direction, local to instant, is where 8.6's two rules
live, and 11.15 forbids Luxon's raw answer there outright. today.ts reached the
same conclusion for the day-boundary search and states the reasoning at
localDayBounds; this is that argument applied to a wall clock rather than to a
midnight, and the mechanism is deliberately the same so a reader who has
understood one has understood both.

**The two rules, and what raw Luxon does instead.** Both are Dana policy
chosen where the standard is silent, so neither has an oracle.

- A nonexistent local time, inside a spring-forward gap, resolves to the first
  valid instant after the gap. That instant is the transition itself: the gap
  in local time runs from the old offset's reading of the transition to the new
  offset's, so the first local time that exists again is the one the transition
  instant carries. Raw Luxon advances by the gap length instead, turning 02:30
  into 03:30 on 2010-03-14 in America/New_York, which is 07:30Z where 8.6
  requires 07:00Z. Measured on the installed luxon 3.7.2 rather than recalled,
  and measured again under three different process clocks, because the answer
  below turns out to depend on one.
- An ambiguous local time, inside a fall-back overlap, resolves to the earlier
  of the two instants. Luxon's documentation declares this choice undefined and
  the installed version earns the word: `DateTime.fromObject` seeds its search
  with the zone offset in force *now*, so 01:30 on 2010-10-31 in Europe/London
  answers 00:30Z while the process clock sits in British Summer Time and
  01:30Z, the instant 8.6 refuses, while it sits in Greenwich Mean Time. The
  raw behavior is therefore not merely unspecified, it changes twice a year
  under a clock the caller never passed it. A test of this must control
  Luxon's clock rather than read whichever answer today happens to produce.

Nothing here reads a database or a process clock. The zone, the dates and the
mode arrive as arguments, the answer is a function of them alone, and the row
reading and the state decision live in reminder-recompute.ts. That split is the
recurrence.ts and generation.ts split one module over, for the same reason:
arithmetic that takes no transaction is arithmetic a test can corner.
*/
import { DateTime } from 'luxon'

import { assertCalendarDate, civilMillis, DAY_MS } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { assertIanaZone } from './today.js'

/** Which of the three cases a local time fell into. Exported because the two
 * policy rules are worth naming at a call site and worth asserting by name:
 * a test that only compared instants could not tell a correct clamp from an
 * accident of arithmetic. */
export type LocalTimeKind =
  /** The local time exists exactly once, which is every day but two a year. */
  | 'exact'
  /** It exists on no instant: a spring-forward gap. 8.6 resolves forward. */
  | 'gap'
  /** It exists on two: a fall-back overlap. 8.6 resolves to the earlier. */
  | 'fold'

export interface LocalResolution {
  readonly instant: Date
  readonly kind: LocalTimeKind
}

/** 8.6's two arms, as one input. Exactly one of offsetMinutes and timeOfDay is
 * non-null, which is 4.8's CHECK; dueTime is the task's column and the offset
 * arm requires it. */
export interface FireAtInput {
  /** The IANA zone 8.6 names: the assignee's, or the reminder creator's when
   * the task is unassigned. Which of the two is reminder-recompute.ts's
   * decision, not this function's. */
  readonly zone: string
  readonly dueDate: CalendarDate
  /** tasks.due_time, HH:MM, or null on a date-only task. */
  readonly dueTime: string | null
  /** reminders.offset_minutes. */
  readonly offsetMinutes: number | null
  /** reminders.time_of_day, HH:MM. */
  readonly timeOfDay: string | null
}

/** No zone transition displaces a local clock by anything near a day, so a
 * probe this far either side of a naive wall clock brackets every transition
 * that could touch it. The same bracket, for the same reason, as today.ts. */
const PROBE_SPAN_MS = DAY_MS

const WALL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Minutes the zone is ahead of UTC at an instant.
 *
 * The one call into Luxon, and it is the safe direction: single valued at
 * every instant of every zone. Everything else in this file is arithmetic over
 * what this returns.
 */
function offsetMinutesAt(instant: number, zone: string): number {
  return DateTime.fromMillis(instant, { zone }).offset
}

/**
 * The local wall clock at an instant, as milliseconds read the way
 * civilMillis reads a date: fields carried in a number, never an instant with
 * meaning of its own.
 */
function wallMillisAt(instant: number, zone: string): number {
  return instant + offsetMinutesAt(instant, zone) * 60_000
}

/** Milliseconds into the day for an HH:MM wall time. 4.11 makes both time
 * columns minute precision, so a seconds field is accepted only where the
 * driver rendered one and only when it is zero: dropping a non-zero one would
 * move a fire instant silently, which is the one failure this module exists to
 * make impossible. */
function millisIntoDay(time: string, label: string): number {
  const match = WALL_TIME_PATTERN.exec(time)
  if (match === null) {
    throw new TypeError(
      `${label} must be an HH:MM wall-clock time; got ${JSON.stringify(time)}`,
    )
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] === undefined ? 0 : Number(match[3])
  if (hours > 23 || minutes > 59 || seconds !== 0) {
    throw new TypeError(
      `${label} must be a real minute-precision time of day (4.11); got ${JSON.stringify(time)}`,
    )
  }
  return (hours * 60 + minutes) * 60_000
}

/**
 * The instant a naive local wall clock names in a zone, with 8.6's two rules
 * applied where the wall clock names none or two.
 *
 * The method, and why it is exact. A local wall clock W is carried by the
 * instant W minus the offset in force at that instant, which is circular until
 * a candidate offset is chosen. The two offsets a day either side of W bracket
 * every transition that could touch it, so the two instants they produce are
 * the only candidates there are. Each is then checked in the total direction:
 * a candidate is real when the wall clock at that instant is W again.
 *
 * Two valid candidates means the wall clock happens twice, and 8.6 takes the
 * earlier. None means it happens never, and the answer is the transition
 * instant, found by bisecting between the candidate whose wall clock falls
 * short of W and the one that overshoots it. Bisection is sound because the
 * wall clock is monotone in the instant on either side of a single transition,
 * and the result is exact to the millisecond rather than rounded to the
 * transition's expected size, so a half-hour shift (Australia/Lord_Howe) or a
 * historical one of some other width needs no special case.
 */
function resolveWallMillis(wallMillis: number, zone: string): LocalResolution {
  // 11.15 makes app/src/shared/timezone.ts the single IANA validation, and the
  // guard matters here rather than only at the write path that stored the
  // zone: an identifier Luxon cannot use answers NaN for its offset, and NaN
  // arithmetic would reach the bisection below and fail describing something
  // else. The cache behind it is today.ts's, so the two share one.
  assertIanaZone(zone)
  const early = wallMillis - offsetMinutesAt(wallMillis - PROBE_SPAN_MS, zone) * 60_000
  const late = wallMillis - offsetMinutesAt(wallMillis + PROBE_SPAN_MS, zone) * 60_000

  const candidates = early === late ? [early] : [early, late]
  const valid = candidates.filter(
    (candidate) => wallMillisAt(candidate, zone) === wallMillis,
  )

  const earliest = valid[0]
  if (earliest !== undefined) {
    // 8.6: an ambiguous time resolves to the earlier instant. One valid
    // candidate is the ordinary day and takes the same branch, which is why
    // the two are not written as separate arms: the rule for two is the
    // minimum, and the minimum of one is itself.
    const instant = valid.reduce((lowest, next) => Math.min(lowest, next), earliest)
    return {
      instant: new Date(instant),
      kind: valid.length > 1 ? 'fold' : 'exact',
    }
  }

  // Neither candidate carries this wall clock, so the zone skipped over it.
  const short = candidates.find((c) => wallMillisAt(c, zone) < wallMillis) ?? null
  const over = candidates.find((c) => wallMillisAt(c, zone) > wallMillis) ?? null
  if (short === null || over === null || short >= over) {
    // Unreachable for any zone the tzdb describes: a wall clock no candidate
    // carries is a gap, and a gap has a candidate on each side by
    // construction. A throw beats returning an instant nobody can justify,
    // because 4.8's fire_at is NOT NULL and a wrong instant here is an email
    // at the wrong hour rather than a visible failure.
    throw new RangeError(
      `could not bracket the transition around ${new Date(wallMillis).toISOString().slice(0, 16)} local in ${zone}`,
    )
  }

  // The least instant whose wall clock is past the gap, which is the
  // transition itself and so the first valid instant after the gap.
  let behind = short
  let ahead = over
  while (ahead - behind > 1) {
    const mid = behind + Math.floor((ahead - behind) / 2)
    if (wallMillisAt(mid, zone) > wallMillis) ahead = mid
    else behind = mid
  }
  return { instant: new Date(ahead), kind: 'gap' }
}

/**
 * The instant a wall-clock time on a calendar date names in a zone, under
 * 8.6's two rules.
 *
 * Exported for its own sake as well as for computeFireAt's: it is the whole of
 * the DST policy, and asserting it directly is what lets a unit test prove
 * each rule against raw Luxon without a database, a task or a reminder in the
 * way.
 */
export function resolveLocalTime(
  date: CalendarDate,
  time: string,
  zone: string,
): LocalResolution {
  return resolveWallMillis(civilMillis(date) + millisIntoDay(time, 'time'), zone)
}

/**
 * 8.6's compute_fire_at, its two arms and nothing else.
 *
 * The offset arm subtracts in floating local time and resolves the zone
 * afterwards, in that order, because 8.6 writes it in that order and the two
 * orders differ: subtracting thirty minutes from 03:00 on a spring-forward
 * date reaches a local time that does not exist, which is the case AC-144's
 * second arm is about, while subtracting from the instant would silently step
 * over the gap and never meet the rule at all. The subtraction may cross into
 * an earlier date, 4.8 allowing an offset of up to seven days, and it does so
 * in wall-clock arithmetic where a date has no length.
 */
export function computeFireAt(input: FireAtInput): Date {
  return resolveFireAt(input).instant
}

/** computeFireAt with the case it landed in, for callers and tests that want
 * to know a policy rule fired rather than only what it decided. */
export function resolveFireAt(input: FireAtInput): LocalResolution {
  const { zone, dueDate, dueTime, offsetMinutes, timeOfDay } = input
  const day = civilMillis(assertCalendarDate(dueDate, 'due_date'))

  if (offsetMinutes !== null) {
    // 4.8's CHECK read from this side, both ways round. The database refuses a
    // row holding two modes or none, so either input means a caller assembled
    // something the table would not hold, and guessing which arm was meant is
    // how one mode silently becomes the other.
    if (timeOfDay !== null) {
      throw new TypeError(
        'a reminder carries exactly one of offset_minutes and time_of_day (4.8); this input carries both',
      )
    }
    if (!Number.isInteger(offsetMinutes)) {
      throw new TypeError(
        `offset_minutes must be whole minutes (4.8); got ${JSON.stringify(offsetMinutes)}`,
      )
    }
    if (dueTime === null) {
      /*
      8.6's offset arm reads "requires task.due_time", so with no due_time
      there is no local time to subtract from and no answer to compute. 4.8
      makes which mode is legal depend on this very column and charges the API
      with restating the rule at every write, so an offset reminder on a task
      with no due_time is a shape the write paths are required to prevent
      rather than a state to resolve here. It is refused rather than guessed
      because every guess available invents policy: assuming midnight moves a
      reminder to an hour the user never chose, and dropping the offset makes
      it fire at the deadline it was meant to precede.

      One route to this state is open: PATCH /tasks/:id may clear due_time
      alone, and no section says what that does to an offset reminder. The
      choice among 422, a cascade delete and a mode conversion is a
      specification question, not this module's.
      */
      throw new TypeError(
        "8.6's offset arm requires the task's due_time, and this task has none (4.8, 7.9)",
      )
    }
    const local = day + millisIntoDay(dueTime, 'due_time') - offsetMinutes * 60_000
    return resolveWallMillis(local, zone)
  }

  /*
  The date-only arm needs due_date and the reminder's own time_of_day, and
  deliberately does not check that the task has no due_time. 4.8 makes
  time_of_day the mode for a task without one and calls that guard the API's,
  restated at every write; this arm can compute either way, and a module that
  refused what it can compute would turn somebody else's missing guard into a
  failure at the wrong layer. The asymmetry with the arm above is exactly the
  difference between a rule this file cannot satisfy and a rule it is not
  enforcing.
  */
  if (timeOfDay === null) {
    throw new TypeError(
      'a reminder carries exactly one of offset_minutes and time_of_day (4.8); this input carries neither',
    )
  }
  return resolveWallMillis(day + millisIntoDay(timeOfDay, 'time_of_day'), zone)
}
