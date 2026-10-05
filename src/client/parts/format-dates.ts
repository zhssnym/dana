/* Dates outside a task row: Done headings, people metadata and elapsed time. Built on `lib/dates.ts`. */
import {
  addDays,
  dayBefore,
  daysBetween,
  formatDate,
  formatDayHeading,
  formatDayInline,
  formatMonthHeading,
  weekStart,
} from '../lib/dates.js'

export { addDays, dayBefore, daysBetween, formatDayHeading, formatMonthHeading, weekStart }

/** "4 Aug" this year, "4 Aug 2025" otherwise. Without `today` the year is always shown. */
export function formatCompactDate(date: string, today = ''): string {
  return formatDate(date, today)
}

/** "today", "yesterday", then "4 Aug". Uses the instant's UTC date, which is fine for these stamps. */
export function formatRelativeDay(instant: string, today: string): string {
  return formatDayInline(instant.slice(0, 10), today)
}

/** "just now", "5 minutes ago", "3 hours ago", then a date after a week. */
export function formatAgo(instant: string, now: number): string {
  const at = Date.parse(instant)
  if (Number.isNaN(at)) return ''
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${String(days)} day${days === 1 ? '' : 's'} ago`
  return formatDate(instant.slice(0, 10), new Date(now).toISOString().slice(0, 10))
}
