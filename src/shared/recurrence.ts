/*
The 4.11 recurrence grammar: parse and validate only, no evaluation. Shared by
the write validator, the client and the iterator in src/server/time so they
never disagree. The 200-character bound lives in tasks.ts's recurrenceRule;
callers need both checks.
*/

export const RECURRENCE_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** BYDAY values. The order carries no week-start meaning. */
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

export const RECURRENCE_INTERVAL_MIN = 1
export const RECURRENCE_INTERVAL_MAX = 99

/** BYMONTHDAY 1 to 28: 29 to 31 would need RFC skip semantics in short months. */
export const RECURRENCE_MONTHDAY_MIN = 1
export const RECURRENCE_MONTHDAY_MAX = 28

/**
 * A parsed rule with defaults resolved: interval defaults to 1, and `until`
 * is YYYY-MM-DD, not RRULE's YYYYMMDD.
 */
export interface RecurrenceRule {
  readonly freq: RecurrenceFrequency
  readonly interval: number
  readonly byDay: readonly RecurrenceWeekday[] | null
  readonly byMonthDay: number | null
  readonly until: string | null
}

/** A result with a reason, so the schema can name the problem in its 422. */
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

/** Digits only: Number() also accepts " 1 ", "1e2" and "+1". */
function parseCount(value: string): number | null {
  if (!DIGITS_PATTERN.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** RFC 5545 DATE (YYYYMMDD) only, and it must be a real date (not 20260230). */
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
 * The 4.11 subset. Part order is free (RFC 5545 fixes none); case is exact, as
 * the preset builder writes it; each part may appear once.
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
          // A repeated day is dropped, not refused: the list still selects that day.
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
        // Refused by name: COUNT would need an occurrence ordinal that row
        // deletion would corrupt.
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

export function isRecurrenceRule(value: unknown): boolean {
  return parseRecurrenceRule(value).ok
}
