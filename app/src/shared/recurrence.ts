/*
The 4.11 recurrence grammar: parse and validate, nothing else.

This file is in src/shared rather than in src/server/time by the by-file
ruling of P6's kickoff, and the reasoning is worth carrying here because the
directory is otherwise the API role's. One grammar has to serve two callers
that must never disagree: the write-path validator, which 4.11 requires
revalidated server-side and which the API role wires in front of the
recurrenceRule primitive in tasks.ts, and the iterator in src/server/time,
which evaluates the same string. src/shared is the one directory both import,
and the client's convenience validation is a third caller with the same need.

**No evaluation lives here, and no dependency.** What a rule means on a
calendar is 8.5's question and the iterator's code; this file answers only
whether a string is inside the subset and, when it is, what its parts are.
The split is what keeps the validator free of a date library and keeps the
iterator from re-deriving a grammar it would derive differently.

**The length bound of 4.5 is not here.** The column is 200 characters and the
recurrenceRule primitive of shared/tasks.ts already states it; a bound stated
twice is a bound that will one day disagree with itself. A rule can be
grammatical and still too long (BYDAY admits a repeated day list), so the
caller needs both checks and gets them from the two places that own them.

What this file deliberately does not export is a formatter. 4.11 admits only
strings the preset builder can produce, and that builder is the client's, in a
later package; when it arrives, its serializer belongs beside this parser
rather than inside the component that calls it.
*/

/** 4.11: FREQ is one of these four and nothing else. */
export const RECURRENCE_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** 4.11: BYDAY values are MO to SU. The order is RFC 5545's own listing and
 * carries no week-start meaning; WKST is the iterator's business. */
export const RECURRENCE_WEEKDAYS = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const
export type RecurrenceWeekday = (typeof RECURRENCE_WEEKDAYS)[number]

/** 4.11's INTERVAL bounds, stated once so the validator and any future preset
 * builder read the same numbers. */
export const RECURRENCE_INTERVAL_MIN = 1
export const RECURRENCE_INTERVAL_MAX = 99

/** 4.11's BYMONTHDAY bounds. 29 to 31 are excluded to avoid RFC skip
 * semantics in short months, which is the reason the paragraph states. */
export const RECURRENCE_MONTHDAY_MIN = 1
export const RECURRENCE_MONTHDAY_MAX = 28

/**
 * A rule string taken apart, with every optional part resolved.
 *
 * interval is always a number because 4.11 gives it a default of 1, and a
 * caller that had to remember the default is a caller that will one day
 * forget it. byDay and byMonthDay are null rather than absent when the
 * frequency does not admit them, which the parse already guarantees.
 *
 * until is a calendar date in the YYYY-MM-DD form every date on this contract
 * takes, not the YYYYMMDD the rule string spells. The two forms are one date;
 * translating here is the same argument as defaulting interval, and it is
 * what lets the iterator compare an UNTIL against a due_date without knowing
 * that RRULE writes its dates differently (11.9).
 */
export interface RecurrenceRule {
  readonly freq: RecurrenceFrequency
  readonly interval: number
  readonly byDay: readonly RecurrenceWeekday[] | null
  readonly byMonthDay: number | null
  readonly until: string | null
}

/**
 * Why a string is outside the subset, in the terms 4.11 uses.
 *
 * A discriminated result rather than a throw, and a reason rather than a
 * boolean: the API role raises 4.11's 422 in the schema layer and 7.0 wants
 * the field named with something a person can act on, while the iterator
 * wants the parts. One function serves both.
 */
export type RecurrenceParse =
  | { readonly ok: true; readonly rule: RecurrenceRule }
  | { readonly ok: false; readonly reason: string }

const NAME_PATTERN = /^[A-Z]+$/
const DIGITS_PATTERN = /^\d+$/
const UNTIL_PATTERN = /^\d{8}$/

function isFrequency(value: string): value is RecurrenceFrequency {
  return (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

function isWeekday(value: string): value is RecurrenceWeekday {
  return (RECURRENCE_WEEKDAYS as readonly string[]).includes(value)
}

/** A whole number written without a sign, padding or exponent. Written out
 * rather than handed to Number() because Number(" 1 "), Number("1e2") and
 * Number("+1") all succeed and none of them is a value string. */
function parseCount(value: string): number | null {
  if (!DIGITS_PATTERN.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * RFC 5545's DATE form, YYYYMMDD, turned into a calendar date that exists.
 *
 * 11.9 rules this form and only this form: within an RRULE the UNTIL value is
 * a DATE or DATE-TIME, the DATE form carries no separators, and admitting the
 * extended spelling would widen frozen 4.11 rather than read it. The
 * existence check is here rather than in the iterator because 20260230 is not
 * a date at all, and a validator that stored it would hand the iterator a
 * bound no instance can ever be compared against honestly.
 */
function parseUntil(value: string): string | null {
  if (!UNTIL_PATTERN.test(value)) return null
  const year = value.slice(0, 4)
  const month = value.slice(4, 6)
  const day = value.slice(6, 8)
  const at = new Date(0)
  at.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  at.setUTCHours(0, 0, 0, 0)
  const roundTrip =
    `${String(at.getUTCFullYear()).padStart(4, '0')}` +
    `${String(at.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(at.getUTCDate()).padStart(2, '0')}`
  if (roundTrip !== value) return null
  return `${year}-${month}-${day}`
}

function refuse(reason: string): RecurrenceParse {
  return { ok: false, reason }
}

/**
 * The 4.11 subset, parsed.
 *
 * Two decisions about how strict to be, both of which come out of 11.9's
 * UNTIL ruling and are recorded here because a later reader will ask.
 *
 * **Part order is free, and case is not.** RFC 5545 fixes no order for the
 * parts of a recurrence rule, so both orderings of a rule are equally valid
 * value strings and refusing one would invent a constraint neither 4.11 nor
 * the RFC states. The UNTIL ruling turned on the opposite fact: the extended
 * spelling of a date is not a valid value string of the RFC at all, so
 * admitting it would widen the frozen text. Case is the same kind of
 * narrowing as the subset itself, and it is where the preset-builder sentence
 * bites: names and values are matched exactly as RFC 5545 writes them,
 * because a builder emits one spelling and free-form input is rejected.
 *
 * **A part may appear once.** RFC 5545 says a rule part must not occur more
 * than once in a recurrence rule, so a second FREQ is not a value string
 * whichever value it carries.
 */
export function parseRecurrenceRule(value: unknown): RecurrenceParse {
  if (typeof value !== 'string') {
    return refuse('must be a string')
  }
  if (value.length === 0) {
    return refuse('must be an RFC 5545 RRULE value string')
  }

  let freq: RecurrenceFrequency | null = null
  let interval: number | null = null
  let byDay: RecurrenceWeekday[] | null = null
  let byMonthDay: number | null = null
  let until: string | null = null
  const seen = new Set<string>()

  for (const part of value.split(';')) {
    const split = part.indexOf('=')
    if (split <= 0) {
      return refuse(
        `must be NAME=VALUE parts separated by ";"; got ${JSON.stringify(part)}`,
      )
    }
    const name = part.slice(0, split)
    const raw = part.slice(split + 1)
    if (!NAME_PATTERN.test(name)) {
      return refuse(`unknown rule part ${JSON.stringify(name)}`)
    }
    if (seen.has(name)) {
      return refuse(`${name} appears more than once`)
    }
    seen.add(name)

    switch (name) {
      case 'FREQ': {
        if (!isFrequency(raw)) {
          return refuse(
            `FREQ must be one of ${RECURRENCE_FREQUENCIES.join(', ')}`,
          )
        }
        freq = raw
        break
      }
      case 'INTERVAL': {
        const parsed = parseCount(raw)
        if (
          parsed === null ||
          parsed < RECURRENCE_INTERVAL_MIN ||
          parsed > RECURRENCE_INTERVAL_MAX
        ) {
          return refuse(
            `INTERVAL must be ${String(RECURRENCE_INTERVAL_MIN)} to ${String(RECURRENCE_INTERVAL_MAX)}`,
          )
        }
        interval = parsed
        break
      }
      case 'BYDAY': {
        const days: RecurrenceWeekday[] = []
        for (const token of raw.split(',')) {
          if (!isWeekday(token)) {
            return refuse(
              `BYDAY must be one or more of ${RECURRENCE_WEEKDAYS.join(', ')}`,
            )
          }
          // A repeated day is dropped rather than refused: RFC 5545 makes
          // BYDAY a list and a list naming Monday twice still selects Monday.
          // The subset's narrowing is which days may appear, not how often.
          if (!days.includes(token)) days.push(token)
        }
        byDay = days
        break
      }
      case 'BYMONTHDAY': {
        const parsed = parseCount(raw)
        if (
          parsed === null ||
          parsed < RECURRENCE_MONTHDAY_MIN ||
          parsed > RECURRENCE_MONTHDAY_MAX
        ) {
          // 4.11 excludes 29 to 31 by name; everything outside 1 to 28 fails
          // the same way, and the message says the bound rather than the
          // reason because a person reading a 422 wants the number.
          return refuse(
            `BYMONTHDAY must be ${String(RECURRENCE_MONTHDAY_MIN)} to ${String(RECURRENCE_MONTHDAY_MAX)}`,
          )
        }
        byMonthDay = parsed
        break
      }
      case 'UNTIL': {
        const parsed = parseUntil(raw)
        if (parsed === null) {
          return refuse(
            'UNTIL must be an RFC 5545 DATE, YYYYMMDD, naming a date that exists',
          )
        }
        until = parsed
        break
      }
      case 'COUNT': {
        // Named on its own so the refusal says why rather than "unknown
        // part": 4.11 excludes COUNT deliberately, because honoring it needs
        // a durable occurrence ordinal that row deletion would corrupt.
        return refuse('COUNT is not supported')
      }
      default: {
        return refuse(`unknown rule part ${JSON.stringify(name)}`)
      }
    }
  }

  if (freq === null) {
    return refuse('FREQ is required')
  }
  if (byDay !== null && freq !== 'WEEKLY') {
    return refuse('BYDAY is allowed only with FREQ=WEEKLY')
  }
  if (byMonthDay !== null && freq !== 'MONTHLY') {
    return refuse('BYMONTHDAY is allowed only with FREQ=MONTHLY')
  }

  return {
    ok: true,
    rule: {
      freq,
      interval: interval ?? 1,
      byDay,
      byMonthDay,
      until,
    },
  }
}

/** The same question asked as a predicate, for the callers that only need a
 * yes: the client's convenience validation, and any guard that has already
 * decided what its own message says. */
export function isRecurrenceRule(value: unknown): boolean {
  return parseRecurrenceRule(value).ok
}
