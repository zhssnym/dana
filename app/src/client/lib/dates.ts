/*
The one date formatter. Every date on screen goes through here: "Today",
"Tomorrow", "Mon", "24 Sep", "24 Sep 2027". Never ISO.

Civil YYYY-MM-DD strings only, fixed English tables rather than `Intl` (a
French browser would otherwise say "août" beside English copy), no `Date`
constructed, and `today` always arrives as an argument. Times belong to
`lib/time-format.ts`; this module only joins them to a day.
*/
import { formatTime } from './time-format.js'
import type { TimeFormat } from './time-format.js'

export { formatTime }
export type { TimeFormat }

export interface CivilDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** YYYY-MM-DD (a longer ISO string is read by its date prefix), or null. */
export function parseCivilDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return null
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return null
  const monthNumber = Number(month)
  const dayNumber = Number(day)
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null
  return { year: Number(year), month: monthNumber, day: dayNumber }
}

export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Sunday first, as `weekdayIndex` counts. */
export const WEEKDAYS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Sakamoto's day-of-week: 0 is Sunday. */
export function weekdayIndex({ year, month, day }: CivilDate): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const
  const shifted = month < 3 ? year - 1 : year
  const offset = offsets[month - 1] ?? 0
  return (
    (shifted +
      Math.floor(shifted / 4) -
      Math.floor(shifted / 100) +
      Math.floor(shifted / 400) +
      offset +
      day) %
    7
  )
}

/** Days since 1970-01-01. Hinnant's `days_from_civil`. */
function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** The inverse. Hinnant's `civil_from_days`. */
function civilFromDays(days: number): CivilDate {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp + (mp < 10 ? 3 : -9)
  return { year: month <= 2 ? y + 1 : y, month, day }
}

export function toCivilString({ year, month, day }: CivilDate): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(year)}-${pad(month)}-${pad(day)}`
}

/** The civil date `days` after `date`; negative counts back. */
export function addDays(date: string, days: number): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  return toCivilString(civilFromDays(daysFromCivil(parsed) + days))
}

/** Whole days from `from` to `to`; negative when `to` is earlier. 0 if unreadable. */
export function daysBetween(from: string, to: string): number {
  const a = parseCivilDate(from)
  const b = parseCivilDate(to)
  if (a === null || b === null) return 0
  return daysFromCivil(b) - daysFromCivil(a)
}

export function dayBefore(date: string): string {
  return addDays(date, -1)
}

/** Monday of the week `date` falls in. */
export function weekStart(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  return addDays(date, -((weekdayIndex(parsed) + 6) % 7))
}

/** "Thursday", or '' when unreadable. */
export function weekdayName(date: string): string {
  const parsed = parseCivilDate(date)
  return parsed === null ? '' : (WEEKDAYS_FULL[weekdayIndex(parsed)] ?? '')
}

/* ------------------------------------------------------------ formatters -- */

function sameYear(parsed: CivilDate, today: string): boolean {
  return parseCivilDate(today)?.year === parsed.year
}

/** Relative distance in days, or null when either date is unreadable. */
function offsetFrom(date: string, today: string): number | null {
  if (parseCivilDate(date) === null || parseCivilDate(today) === null) return null
  return daysBetween(today, date)
}

/** "24 Sep", or "24 Sep 2027" outside today's year. No relative words. */
export function formatDate(date: string, today: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return ''
  const base = `${String(parsed.day)} ${MONTHS_SHORT[parsed.month - 1] ?? ''}`
  return sameYear(parsed, today) ? base : `${base} ${String(parsed.year)}`
}

/** "Today", "Tomorrow", "Yesterday", "Mon" (2–6 days ahead), else `formatDate`. */
export function formatDay(date: string, today: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return ''
  const offset = offsetFrom(date, today)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (offset === -1) return 'Yesterday'
  if (offset !== null && offset >= 2 && offset <= 6) {
    return WEEKDAYS_SHORT[weekdayIndex(parsed)] ?? ''
  }
  return formatDate(date, today)
}

/** `formatDay` for mid-sentence use: "due today", "sent yesterday", "due Mon". */
export function formatDayInline(date: string, today: string): string {
  const day = formatDay(date, today)
  return day === 'Today' || day === 'Tomorrow' || day === 'Yesterday' ? day.toLowerCase() : day
}

/** A stored time ("18:00" or "18:00:00") on the viewer's clock, or '' if unreadable. */
export function formatClockTime(value: string | null | undefined, clock: TimeFormat): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '')
  if (match === null) return ''
  return formatTime(`${match[1] ?? ''}:${match[2] ?? ''}`, clock) ?? ''
}

/** "Today 6:00 PM", "24 Sep 18:00"; the day alone when there is no time. */
export function formatDayTime(
  date: string,
  time: string | null | undefined,
  today: string,
  clock: TimeFormat,
): string {
  const day = formatDay(date, today)
  const at = formatClockTime(time, clock)
  if (day === '') return ''
  return at === '' ? day : `${day} ${at}`
}

/** Group heading: "Today", "Tomorrow", "Yesterday", "Saturday" (2–6 days ahead), else `formatDate`. */
export function formatDayHeading(date: string, today: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return ''
  const offset = offsetFrom(date, today)
  if (offset !== null && offset >= 2 && offset <= 6) {
    return WEEKDAYS_FULL[weekdayIndex(parsed)] ?? ''
  }
  return formatDay(date, today)
}

/** "October", or "October 2027" outside today's year. */
export function formatMonthHeading(date: string, today: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return ''
  const month = MONTHS_FULL[parsed.month - 1] ?? ''
  return sameYear(parsed, today) ? month : `${month} ${String(parsed.year)}`
}
