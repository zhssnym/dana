/*
 * The task's shape on the client (`ConceptTask`), shared by every surface. `tasks/task-concept.ts` maps it to
 * the API.
 */
import { todayInBrowserZone } from '../api/tz.js'
import { formatDate, formatDay } from '../lib/dates.js'

import { formatTime, type TimeFormat } from '../lib/time-format.js'

/* Built by hand: `toISOString` is UTC and gives the previous day west of Greenwich. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/* Local, not `new Date("2026-08-10")`, which parses as UTC midnight. */
export function parseIsoDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
}

/** A function, not a constant, so a tab left open past midnight moves on. */
export function today(): Date {
  return parseIsoDate(todayInBrowserZone())
}

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
]

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  )
}

/* The next given weekday strictly after `from`. */
export function nextWeekday(from: Date, weekday: number): Date {
  const delta = (weekday - from.getDay() + 7) % 7
  return addDays(from, delta === 0 ? 7 : delta)
}

/* Reads back a `dueDisplay` label so a calendar can highlight that day. No year means the current one. */
export function parseDueLabel(label: string): Date | null {
  if (/today/i.test(label)) return today()
  if (/tomorrow/i.test(label)) return addDays(today(), 1)
  if (/yesterday/i.test(label)) return addDays(today(), -1)
  const weekday = DAY_SHORT.findIndex((name) => label === name || label.startsWith(`${name} `))
  if (weekday >= 0) {
    /* `formatDay` writes a weekday only for 2–6 days ahead. */
    const delta = (weekday - today().getDay() + 7) % 7
    return addDays(today(), delta < 2 ? delta + 7 : delta)
  }
  /* "24 Sep 2027", or "Sep 24, 2027" where the locale puts the month first. */
  const dayFirst = label.match(/(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?/)
  const monthFirst = dayFirst ? null : label.match(/([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?/)
  const found = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] }
      : null
  if (!found) return null
  const month = MONTH_SHORT.findIndex(
    (name) => name.toLowerCase() === (found.month ?? '').slice(0, 3).toLowerCase(),
  )
  if (month < 0) return null
  const year = found.year === undefined ? today().getFullYear() : Number(found.year)
  return new Date(year, month, Number(found.day))
}

/* The relative rung, decided once. Rows and headings share the rung but not the words. */
export type DayRung = 'overdue' | 'today' | 'tomorrow' | 'later'

export function dayRung(date: Date): DayRung {
  const days = daysBetween(today(), date)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return 'later'
}


export interface ConceptStep {
  title: string
  done: boolean
  /* Present once the server has the step; absent while only typed into the card. */
  id?: string
}

export interface ConceptLabel {
  id: string
  name: string
  color: string
  scope: 'personal' | 'folder'
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  /* `id` is optional beside name and colour; `tasks/task-writer.tsx` prefers it. Same for `assignee`. */
  folder?: { name: string; color: string; id?: string }
  /* A due date is a day, not a moment; a time of day belongs to the reminder. */
  due?: { label: string; overdue?: boolean }
  /* The due date's own time ("08:00"), 4.11's due_time; absent for a day. */
  dueTime?: string
  /* The Schedule's start ("2026-09-24"); absent when none. */
  start?: string
  /* The Start's wall-clock time ("08:00"); absent for a date-only start. */
  startTime?: string
  reminder?: string
  /* Minutes from the due day's midnight: 540 is 9:00 that day, -360 is 18:00 the day before. */
  reminderAt?: number
  repeatEvery?: string
  /* 4.11's BYMONTHDAY, where a monthly rule names its own day. */
  repeatMonthDay?: number
  repeatDays?: string[]
  repeatEnds?: string
  /*
   * Absent means nobody on a whole task, but "not touched" on a patch. `null` is the patch that clears the
   * assignee.
   */
  assignee?: { initials: string; name: string; image?: string; id?: string } | null
  assignees?: { initials: string; name: string; image?: string; id?: string }[]
  /* The items, not a count, so ticking one in a card updates the row's count. */
  steps?: ConceptStep[]
  /* Personal labels then the folder's, archived ones left out. */
  labels?: ConceptLabel[]
  repeatUnit?: 'day' | 'week' | 'month' | 'year'
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
}

export function stepCount(task: ConceptTask): { done: number; total: number } | null {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

/* Back into a label with `lib/dates.ts`'s `formatDay`, so picked and fetched dates read alike. */
export function dueLabelFor(date: Date): { label: string; overdue?: boolean } {
  const label = formatDay(isoDay(date), todayInBrowserZone())
  return dayRung(date) === 'overdue' ? { label, overdue: true } : { label }
}

export function ordinal(day: number): string {
  const rest = day % 100
  if (rest >= 11 && rest <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

export const WEEKDAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
export const WORKING_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr']

/* The task's due date, else today, so "Monthly on the 13th" agrees with the row. */
export function repeatAnchor(task: ConceptTask): Date {
  return (task.due ? parseDueLabel(task.due.label) : null) ?? today()
}

export function repeatSummary(task: ConceptTask): string {
  if (!task.recurrence) return 'Does not repeat'
  const anchor = repeatAnchor(task)
  const every = Math.max(1, Number(task.repeatEvery ?? '1'))
  const unit = task.repeatUnit ?? 'week'
  const days = task.repeatDays ?? []

  let head: string
  if (unit === 'day') {
    head = every === 1 ? 'Daily' : `Every ${every} days`
  } else if (unit === 'month') {
    const day = task.repeatMonthDay ?? anchor.getDate()
    head =
      every === 1
        ? `Monthly on the ${ordinal(day)}`
        : task.repeatMonthDay === undefined
          ? `Every ${every} months`
          : `Every ${every} months on the ${ordinal(day)}`
  } else if (unit === 'year') {
    head =
      every === 1
        ? `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()] ?? ''}`
        : `Every ${every} years`
  } else if (every === 1 && days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) {
    head = 'Every weekday'
  } else if (days.length) {
    /* In week order: "Weekly on Friday", "Weekly on Mon, Thu". */
    const names = WEEKDAY_KEYS.filter((d) => days.includes(d)).map((d) => {
      const index = (WEEKDAY_KEYS.indexOf(d) + 1) % 7
      return (days.length === 1 ? DAY_LONG[index] : DAY_SHORT[index]) ?? d
    })
    head = `${every === 1 ? 'Weekly' : `Every ${every} weeks`} on ${names.join(', ')}`
  } else {
    head =
      every === 1
        ? `Weekly on ${DAY_LONG[anchor.getDay()] ?? ''}`
        : `Every ${every} weeks`
  }
  return task.repeatEnds
    ? `${head}, until ${formatDate(task.repeatEnds, todayInBrowserZone())}`
    : head
}

const RULE_FREQ = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const

/* The card's repeat as the stored rule string; null when it does not repeat. `repeatEnds` is a date. */
export function ruleFor(
  task: Pick<
    ConceptTask,
    'recurrence' | 'repeatUnit' | 'repeatEvery' | 'repeatDays' | 'repeatEnds' | 'repeatMonthDay'
  >,
): string | null {
  if (!task.recurrence) return null
  const unit = task.repeatUnit ?? 'week'
  const parts = [`FREQ=${RULE_FREQ[unit]}`]
  const every = Math.min(99, Math.max(1, Number(task.repeatEvery ?? '1') || 1))
  if (every > 1) parts.push(`INTERVAL=${String(every)}`)
  const days = WEEKDAY_KEYS.filter((d) => task.repeatDays?.includes(d))
  if (unit === 'week' && days.length > 0) {
    parts.push(`BYDAY=${days.map((d) => d.toUpperCase()).join(',')}`)
  }
  if (unit === 'month' && task.repeatMonthDay !== undefined) {
    parts.push(`BYMONTHDAY=${String(task.repeatMonthDay)}`)
  }
  if (task.repeatEnds !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(task.repeatEnds)) {
    parts.push(`UNTIL=${task.repeatEnds.replaceAll('-', '')}`)
  }
  return parts.join(';')
}

/* One word for the row; the card shows the full rule. Both from here so they cannot disagree. */
export function repeatShort(task: ConceptTask): string {
  if (!task.recurrence) return 'Does not repeat'
  /* No unit means the rule is unknown: say "Repeats" rather than guess. */
  if (task.repeatUnit === undefined) return 'Repeats'
  const every = Math.max(1, Number(task.repeatEvery ?? '1'))
  const unit = task.repeatUnit ?? 'week'
  const days = task.repeatDays ?? []
  if (unit === 'day') return every === 1 ? 'Daily' : `Every ${every} days`
  if (unit === 'month') return every === 1 ? 'Monthly' : `Every ${every} months`
  if (unit === 'year') return every === 1 ? 'Yearly' : `Every ${every} years`
  if (every === 1 && days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) {
    return 'Weekdays'
  }
  return every === 1 ? 'Weekly' : `Every ${every} weeks`
}

/* Shows the reminder's clock time on the viewer's clock, matching the due label (AC-170). */
export function reminderChipValue(task: ConceptTask, format: TimeFormat): string {
  if (!task.reminder) return 'No reminder'
  const found = task.reminder.match(/^(?:(.*) )?at (\d{1,2}:\d{2})$/)
  if (found === null) return task.reminder
  const time = formatTime(found[2], format) ?? found[2] ?? ''
  /* A reminder before the due day names its day: "Sat 6:00 PM". */
  return task.reminderAt !== undefined && task.reminderAt < 0 ? `${found[1] ?? ''} ${time}` : time
}

export function minutesOfClock(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

/** On the day they fall on: -30 is "23:30". */
export function clockOfMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** "Sat at 09:00": the firing day in the Date row's words. `at` is minutes from the due day's midnight. */
export function reminderWords(due: Date | null, at: number): string {
  const time = clockOfMinutes(at)
  if (due === null) return `at ${time}`
  const day = addDays(due, Math.floor(at / 1440))
  return `${formatDay(isoDay(day), todayInBrowserZone())} at ${time}`
}