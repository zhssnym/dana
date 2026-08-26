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

/**
 * An instant as elapsed time: "just now", "5 minutes ago", "3 hours ago",
 * then a date.
 *
 * 9.1's Activity line is "{verb} {ago}" and DES-139's own example is "Edited
 * just now", so what it wants is elapsed time and not a calendar day.
 * `formatRelativeDay` above is the wrong tool for it and says so in its own
 * header: it reads an instant's *UTC* date, which is right for the coarse
 * joined and sent stamps it was written for and wrong here, because the
 * newest event is usually the thing the person did seconds ago. Measured at
 * S9 on a machine six hours behind UTC: a folder edited at 19:04 local read
 * as "25 Aug 2026", tomorrow's date, on a line whose whole job is to say
 * "just now".
 *
 * Elapsed time needs no timezone at all, which is the other half of why this
 * is the right shape: two instants subtract the same in every zone, so this
 * function cannot have the bug the one above documents.
 *
 * The ladder stops at a week. Past that, "23 days ago" is arithmetic a person
 * has to do in their head to learn a date, so the date is given instead.
 */
export function formatAgo(instant: string, now: number): string {
  const at = Date.parse(instant)
  if (Number.isNaN(at)) return instant
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${String(days)} day${days === 1 ? '' : 's'} ago`
  return formatCompactDate(instant.slice(0, 10))
}

/*
The civil arithmetic S10's Scheduled ladder needs, and the same discipline as
everything above: no `Date`, so nothing here can read a clock or shift a date
across a zone, and every function is total.

`dayBefore` above steps one day by hand because one day is all it needed. A
ladder steps by seven and by "the rest of this week", so the arithmetic goes
through a day number instead: Howard Hinnant's civil-from-days pair, which is
exact for every date this product can hold and is what makes `addDays` one
line rather than a second copy of the month table.
*/

/** Days since 1970-01-01 for a civil date. Hinnant's `days_from_civil`. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** The inverse. Hinnant's `civil_from_days`. */
function civilFromDays(days: number): { year: number; month: number; day: number } {
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

function formatCivil({
  year,
  month,
  day,
}: {
  year: number
  month: number
  day: number
}): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(year)}-${pad(month)}-${pad(day)}`
}

/** The civil date `days` after `date`, negative counting backwards. */
export function addDays(date: string, days: number): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  return formatCivil(
    civilFromDays(daysFromCivil(parsed.year, parsed.month, parsed.day) + days),
  )
}

/** Whole days from `from` to `to`; negative when `to` is the earlier one. */
export function daysBetween(from: string, to: string): number {
  const a = parseCivilDate(from)
  const b = parseCivilDate(to)
  if (a === null || b === null) return 0
  return daysFromCivil(b.year, b.month, b.day) - daysFromCivil(a.year, a.month, a.day)
}

/**
 * The weekday a date falls on, as the ladder's own heading: "Thursday".
 *
 * 9.5's ladder names the rest of this week by its days, and a heading is
 * structure rather than a control, so it says the day and nothing else.
 */
export function weekdayNameOf(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  return WEEKDAYS[weekdayIndex(parsed.year, parsed.month, parsed.day)] ?? date
}

/**
 * Monday of the week a date falls in. 9.5 fixes the week's start at Monday,
 * for the calendar and so for the ladder that shares its vocabulary.
 */
export function weekStart(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  const sundayBased = weekdayIndex(parsed.year, parsed.month, parsed.day)
  return addDays(date, -((sundayBased + 6) % 7))
}

/** A month rung's heading: "September 2026". */
export function monthLabelOf(date: string): string {
  const parsed = parseCivilDate(date)
  if (parsed === null) return date
  return `${MONTHS_FULL[parsed.month - 1] ?? ''} ${String(parsed.year)}`
}
