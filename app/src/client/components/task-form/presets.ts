/*
The repeat control's presets, and the serializer `src/shared/recurrence.ts`
said would arrive with them.

9.3: "repeat control is preset-driven (daily, weekdays, weekly on chosen days,
every N days or weeks, monthly on day 1 to 28, yearly) with an optional 'Ends
on' date, never a raw RRULE box". 4.11 makes that stronger than a UI
preference: only strings a preset builder can produce are valid values, so a
free-form input is a control that offers rules the server refuses, which is
this role's named hazard.

**Every string this module emits is parsed back through the shared grammar
before it leaves.** `parseRecurrenceRule` is the one definition of the 4.11
subset, shared with the server's validator, so a preset that ever drifted
outside the subset fails here rather than at a 422 the person cannot act on.
That is 7.11's client convenience used the way 7.11 means it: the server rule
is still the real one.

**The parse direction exists because edit mode pre-fills** (9.3). A task
carrying a rule opens with that rule showing, which means a stored string has
to come back to the preset that produced it. Anything the subset admits but no
preset emits (an interval on a monthly rule, say) lands on the closest preset
rather than on nothing, because a form that showed "does not repeat" over a
task that repeats would end the series the moment it was saved.

UNTIL is written in RFC 5545's DATE form, YYYYMMDD, which 11.9 ruled on
2026-08-10 is the only spelling inside the subset. The "Ends on" field carries
the extended form every other date on this contract takes, and the two are one
date; this module is where they are translated.
*/
import {
  parseRecurrenceRule,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_INTERVAL_MIN,
  RECURRENCE_MONTHDAY_MAX,
  RECURRENCE_MONTHDAY_MIN,
} from '../../../shared/recurrence.js'
import type { RecurrenceWeekday } from '../../../shared/recurrence.js'

/** The presets 9.3 enumerates, plus the absence of one. */
export type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'everyNDays'
  | 'everyNWeeks'
  | 'monthly'
  | 'yearly'

/**
 * The option text of each preset, which is also how a test addresses it:
 * 9.1's addressing rule reaches a control by its name, and an option inside
 * one by the words it shows.
 */
export const PRESET_LABELS: Record<RepeatPreset, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly on chosen days',
  everyNDays: 'Every N days',
  everyNWeeks: 'Every N weeks',
  monthly: 'Monthly on a day',
  yearly: 'Yearly',
}

export const PRESET_ORDER: readonly RepeatPreset[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'everyNDays',
  'everyNWeeks',
  'monthly',
  'yearly',
]

/** 4.11's own weekday tokens, in RFC 5545's listing order. */
export const WEEKDAY_LABELS: Record<RecurrenceWeekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
}

const WEEKDAY_SET: readonly RecurrenceWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR']

/** What the control holds: a preset plus the values that preset asks for. */
export interface RepeatState {
  readonly preset: RepeatPreset
  readonly days: readonly RecurrenceWeekday[]
  readonly interval: number
  readonly monthDay: number
  /** "Ends on", as YYYY-MM-DD or empty. */
  readonly until: string
}

export const NO_REPEAT: RepeatState = {
  preset: 'none',
  days: ['MO'],
  interval: 2,
  monthDay: 1,
  until: '',
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, Math.trunc(value)))
}

/** The extended date this form carries, as the DATE form a rule string takes. */
function untilPart(until: string): string {
  if (until === '') return ''
  return `;UNTIL=${until.replaceAll('-', '')}`
}

/**
 * The rule string a preset stands for, or null when the preset is "none".
 *
 * Returns null too when the parts do not compose into something the shared
 * grammar accepts, which is a defect in this module rather than a person's
 * mistake: it means a preset emitted a string outside 4.11, and sending it
 * would trade a 422 for a control that looked like it worked.
 */
export function toRuleString(state: RepeatState): string | null {
  const ends = untilPart(state.until)
  const interval = clamp(state.interval, RECURRENCE_INTERVAL_MIN, RECURRENCE_INTERVAL_MAX)
  const monthDay = clamp(state.monthDay, RECURRENCE_MONTHDAY_MIN, RECURRENCE_MONTHDAY_MAX)
  let rule: string
  switch (state.preset) {
    case 'none':
      return null
    case 'daily':
      rule = `FREQ=DAILY${ends}`
      break
    case 'weekdays':
      rule = `FREQ=WEEKLY;BYDAY=${WEEKDAY_SET.join(',')}${ends}`
      break
    case 'weekly': {
      // A weekly rule with no day chosen is 4.11's plain FREQ=WEEKLY, which
      // the iterator reads as the anchor's own weekday. Emitting BYDAY= with
      // nothing after it would be outside the subset.
      const days = state.days.length === 0 ? '' : `;BYDAY=${state.days.join(',')}`
      rule = `FREQ=WEEKLY${days}${ends}`
      break
    }
    case 'everyNDays':
      rule = `FREQ=DAILY;INTERVAL=${String(interval)}${ends}`
      break
    case 'everyNWeeks':
      rule = `FREQ=WEEKLY;INTERVAL=${String(interval)}${ends}`
      break
    case 'monthly':
      rule = `FREQ=MONTHLY;BYMONTHDAY=${String(monthDay)}${ends}`
      break
    case 'yearly':
      rule = `FREQ=YEARLY${ends}`
      break
  }
  return parseRecurrenceRule(rule).ok ? rule : null
}

/**
 * A stored rule read back into the control, for 9.3's edit mode.
 *
 * A string the shared grammar refuses cannot have come from this API (4.11 is
 * the only door into the column), so it lands on "none" rather than throwing:
 * the form is not the place to discover a corrupt row.
 */
export function fromRuleString(rule: string | null): RepeatState {
  if (rule === null || rule === '') return NO_REPEAT
  const parsed = parseRecurrenceRule(rule)
  if (!parsed.ok) return NO_REPEAT
  const { freq, interval, byDay, byMonthDay, until } = parsed.rule
  const ends = until ?? ''
  if (freq === 'DAILY') {
    return interval === 1
      ? { ...NO_REPEAT, preset: 'daily', until: ends }
      : { ...NO_REPEAT, preset: 'everyNDays', interval, until: ends }
  }
  if (freq === 'WEEKLY') {
    const days = byDay ?? []
    const isWeekdaySet =
      days.length === WEEKDAY_SET.length && WEEKDAY_SET.every((day) => days.includes(day))
    if (interval === 1 && isWeekdaySet) {
      return { ...NO_REPEAT, preset: 'weekdays', days, until: ends }
    }
    if (interval === 1) {
      return {
        ...NO_REPEAT,
        preset: 'weekly',
        days: days.length === 0 ? NO_REPEAT.days : days,
        until: ends,
      }
    }
    return {
      ...NO_REPEAT,
      preset: 'everyNWeeks',
      interval,
      days: days.length === 0 ? NO_REPEAT.days : days,
      until: ends,
    }
  }
  if (freq === 'MONTHLY') {
    return {
      ...NO_REPEAT,
      preset: 'monthly',
      monthDay: byMonthDay ?? NO_REPEAT.monthDay,
      until: ends,
    }
  }
  return { ...NO_REPEAT, preset: 'yearly', until: ends }
}
