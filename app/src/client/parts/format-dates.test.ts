/*
The surface-date module's own checks, colocated like `presenters.test.ts` and
for the same reason: no acceptance criterion reads these strings, so these
tests are the only thing that does. The weekday and month-underflow arithmetic
are the two things here that can be wrong in a way a reviewer's eye misses.
*/
import { describe, expect, test } from 'vitest'

import {
  addDays,
  dayBefore,
  daysBetween,
  formatCompactDate,
  formatDayHeading,
  formatLongDayDate,
  formatRelativeDay,
  monthLabelOf,
  weekStart,
  weekdayNameOf,
} from './format-dates.js'

describe('dayBefore', () => {
  test('steps inside a month', () => {
    expect(dayBefore('2026-08-13')).toBe('2026-08-12')
  })
  test('steps across a month boundary', () => {
    expect(dayBefore('2026-08-01')).toBe('2026-07-31')
    expect(dayBefore('2026-05-01')).toBe('2026-04-30')
  })
  test('steps across a year boundary', () => {
    expect(dayBefore('2026-01-01')).toBe('2025-12-31')
  })
  test('knows February, leap and common', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28')
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
  })
})

describe('formatLongDayDate', () => {
  test('renders the prototype form, weekday first', () => {
    // 2026-08-10 was a Monday; the prototype's header reads exactly this.
    expect(formatLongDayDate('2026-08-10', '2026-08-10')).toBe('Monday, 10 August')
  })
  test('appends the year only when it is not the reader year', () => {
    expect(formatLongDayDate('2027-01-01', '2026-12-31')).toBe('Friday, 1 January 2027')
  })
})

describe('formatDayHeading', () => {
  const today = '2026-08-13'
  test('today and yesterday are words', () => {
    expect(formatDayHeading('2026-08-13', today)).toBe('Today')
    expect(formatDayHeading('2026-08-12', today)).toBe('Yesterday')
  })
  test('everything earlier is the prototype long form', () => {
    expect(formatDayHeading('2026-08-06', today)).toBe('August 6, 2026')
  })
})

describe('compact and relative metadata dates', () => {
  const today = '2026-08-13'
  test('compact always carries the year', () => {
    expect(formatCompactDate('2026-08-04')).toBe('4 Aug 2026')
  })
  test('relative day words for instants', () => {
    expect(formatRelativeDay('2026-08-13T03:00:00Z', today)).toBe('today')
    expect(formatRelativeDay('2026-08-12T23:59:59Z', today)).toBe('yesterday')
    expect(formatRelativeDay('2026-08-04T10:00:00Z', today)).toBe('4 Aug 2026')
  })
})

describe('the civil arithmetic S10 added', () => {
  test('addDays crosses a month, a year and a leap day', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-08-25', 0)).toBe('2026-08-25')
  })

  test('daysBetween is signed and agrees with addDays', () => {
    expect(daysBetween('2026-08-25', '2026-09-01')).toBe(7)
    expect(daysBetween('2026-09-01', '2026-08-25')).toBe(-7)
  })

  test('the week starts on Monday, which 9.5 fixes', () => {
    // 2026-08-25 is a Tuesday; 2026-08-23 is the Sunday before it.
    expect(weekStart('2026-08-25')).toBe('2026-08-24')
    expect(weekStart('2026-08-24')).toBe('2026-08-24')
    expect(weekStart('2026-08-23')).toBe('2026-08-17')
  })

  test('the weekday and the month rung read as their headings do', () => {
    expect(weekdayNameOf('2026-08-25')).toBe('Tuesday')
    expect(monthLabelOf('2026-09-07')).toBe('September 2026')
  })
})
