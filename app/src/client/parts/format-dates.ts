/*
Surface dates outside a task row: Done headings, People and sharing metadata,
elapsed time. Every civil-date form comes from `lib/dates.ts`, the one
formatter; this module only keeps the surface-specific wrappers.
*/
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

/**
 * Compact metadata date: "4 Aug" this year, "4 Aug 2025" otherwise. Without
 * `today` the year always rides along.
 */
export function formatCompactDate(date: string, today = ''): string {
  return formatDate(date, today)
}

/**
 * A metadata instant as a day word: "today", "yesterday", then "4 Aug".
 * Reads the instant's UTC date, which is coarse and fine for joined and sent
 * stamps.
 */
export function formatRelativeDay(instant: string, today: string): string {
  return formatDayInline(instant.slice(0, 10), today)
}

/**
 * An instant as elapsed time: "just now", "5 minutes ago", "3 hours ago",
 * then a date after a week. Elapsed time needs no timezone.
 */
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
