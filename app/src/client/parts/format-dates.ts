/*
Surface dates: every date this client renders OUTSIDE a task row's due badge.

`presenters.ts` owns the due badge and states the rules this module inherits:
the format of a date is the design's (9.1 spells none), the strings are
transcribed from the running prototype, and month and weekday names are fixed
English tables rather than `Intl`, because a locale-driven formatter renders
"août" on a French browser beside section 9's English copy, and because a
table keeps every function here total: nothing constructs a `Date`, so nothing
can read a clock, shift a civil date across a zone, or depend on an ICU
version. Nothing here reads a clock either; `today` always arrives as an
argument, from `presenterToday()`.

The prototype's forms, read off its screens:
- My Day's header subtitle: "Monday, 10 August".
- Done's day headings: "Today", "Yesterday", then "August 6, 2026".
- People and the sharing panel: "Connected 4 Aug 2026", "Joined 4 Aug 2026",
  "Sent today".
*/

/** 4.11's YYYY-MM-DD split into integers, with no `Date` involved. */
function parseCivilDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return null
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return null
  const monthNumber = Number(month)
  if (monthNumber < 1 || monthNumber > 12) return null
  return { year: Number(year), month: monthNumber, day: Number(day) }
}

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Sakamoto's day-of-week: 0 is Sunday. Pure calendar arithmetic, no `Date`. */
function weekdayIndex(year: number, month: number, day: number): number {
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

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/** The civil date one day before, as YYYY-MM-DD. */
export function dayBefore(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  let { year, month, day } = parsed
  day -= 1
  if (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day = (DAYS_IN_MONTH[month - 1] ?? 31) + (month === 2 && isLeapYear(year) ? 1 : 0)
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(year)}-${pad(month)}-${pad(day)}`
}

/**
 * The My Day header's subtitle: "Monday, 10 August", the year only when it is
 * not the year the reader is standing in (the header always shows today, so in
 * practice it never is).
 */
export function formatLongDayDate(date: string, today: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  const weekday = WEEKDAYS[weekdayIndex(parsed.year, parsed.month, parsed.day)] ?? ''
  const month = MONTHS_FULL[parsed.month - 1] ?? ''
  const base = `${weekday}, ${String(parsed.day)} ${month}`
  const thisYear = parseCivilDate(today)?.year
  return thisYear === parsed.year ? base : `${base} ${String(parsed.year)}`
}

/**
 * A Done day-group heading: "Today", "Yesterday", then the prototype's
 * "August 6, 2026".
 */
export function formatDayHeading(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === dayBefore(today)) return 'Yesterday'
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  const month = MONTHS_FULL[parsed.month - 1] ?? ''
  return `${month} ${String(parsed.day)}, ${String(parsed.year)}`
}

/**
 * The compact metadata date of People and the sharing panel: "4 Aug 2026".
 * The year always rides along, exactly as the prototype writes these.
 */
export function formatCompactDate(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  const month = MONTHS_SHORT[parsed.month - 1] ?? ''
  return `${String(parsed.day)} ${month} ${String(parsed.year)}`
}

/**
 * A metadata instant as a day word: "today", "yesterday", then "4 Aug 2026".
 *
 * The instant's civil date is its UTC date, which is what slicing an ISO
 * datetime yields; joined and sent stamps are coarse metadata and the residual
 * near midnight is not worth a timezone conversion this module would then
 * have to be able to get wrong.
 */
export function formatRelativeDay(instant: string, today: string): string {
  const date = instant.slice(0, 10)
  if (date === today) return 'today'
  if (date === dayBefore(today)) return 'yesterday'
  return formatCompactDate(date)
}
