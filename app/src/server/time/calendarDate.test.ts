import { describe, expect, test } from 'vitest'

import {
  addDays,
  assertCalendarDate,
  civilDateOf,
  civilMillis,
  compareDates,
  daysBetween,
  earliestDate,
  isCalendarDate,
  withinInclusive,
} from './calendarDate.js'

describe('isCalendarDate', () => {
  test('accepts 4.11 dates and rejects near misses', () => {
    for (const good of ['2026-07-23', '2026-02-28', '2028-02-29', '0026-01-01']) {
      expect(isCalendarDate(good), `${good} is a calendar date`).toBe(true)
    }
    for (const bad of [
      '2026-02-30', // well formed and does not exist
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-7-23', // unpadded
      '26-07-23',
      '2026-07-23T00:00:00Z',
      '2026-07-23 ',
      '',
      20260723,
      null,
      undefined,
    ]) {
      expect(isCalendarDate(bad), `${JSON.stringify(bad)} is not`).toBe(false)
    }
  })

  test('2027 is not a leap year and 2028 is', () => {
    expect(isCalendarDate('2027-02-29')).toBe(false)
    expect(isCalendarDate('2028-02-29')).toBe(true)
  })
})

describe('assertCalendarDate', () => {
  test('names the caller label so a query says which date was wrong', () => {
    expect(() => assertCalendarDate('2026-02-30', 'end')).toThrow(/end must be/)
    expect(assertCalendarDate('2026-07-23', 'start')).toBe('2026-07-23')
  })
})

describe('civilMillis and civilDateOf', () => {
  test('round trip every date of a leap year', () => {
    let date = '2028-01-01'
    for (let day = 0; day < 366; day += 1) {
      expect(civilDateOf(civilMillis(date))).toBe(date)
      date = addDays(date, 1)
    }
    expect(date).toBe('2029-01-01')
  })

  test('two-digit years are not mapped into the 1900s', () => {
    // Date.UTC(26, 0, 1) would be 1926; the setUTCFullYear path must not.
    expect(civilDateOf(civilMillis('0026-01-01'))).toBe('0026-01-01')
  })
})

describe('addDays', () => {
  test('crosses month, year, and leap boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-07-23', 0)).toBe('2026-07-23')
  })

  test('is invertible across a whole year', () => {
    let date = '2026-01-01'
    for (let day = 0; day < 365; day += 1) {
      for (const step of [1, 7, 31, 62, 365]) {
        expect(addDays(addDays(date, step), -step)).toBe(date)
      }
      date = addDays(date, 1)
    }
  })

  test('refuses a fractional step rather than rounding it', () => {
    expect(() => addDays('2026-07-23', 1.5)).toThrow(/whole number/)
  })
})

describe('daysBetween', () => {
  test('is the subtraction Q3C means by end minus start', () => {
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0)
    expect(daysBetween('2026-07-01', '2026-09-01')).toBe(62)
    expect(daysBetween('2026-07-01', '2026-09-02')).toBe(63)
    expect(daysBetween('2026-09-01', '2026-07-01')).toBe(-62)
  })

  test('is unaffected by DST in the host zone', () => {
    // The host runs in whatever zone this machine is set to. A civil
    // subtraction that used local midnights would come out 23 or 25 hours
    // short across a transition and round to the wrong whole day.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1)
  })

  test('agrees with addDays over a year of spans', () => {
    let date = '2026-01-01'
    for (let day = 0; day < 365; day += 1) {
      for (const step of [-62, -1, 0, 1, 62]) {
        expect(daysBetween(date, addDays(date, step))).toBe(step)
      }
      date = addDays(date, 1)
    }
  })
})

describe('compareDates', () => {
  test('lexicographic order is chronological order for this format', () => {
    // The identity the queries rely on when they compare in SQL as dates and
    // here as strings. Checked across a year of pairs rather than asserted.
    const dates: string[] = []
    let date = '2025-11-15'
    for (let day = 0; day < 400; day += 1) {
      dates.push(date)
      date = addDays(date, 1)
    }
    for (let i = 0; i < dates.length; i += 1) {
      for (let j = 0; j < dates.length; j += 37) {
        const a = dates[i] as string
        const b = dates[j] as string
        const byString = a < b ? -1 : a > b ? 1 : 0
        const byCalendar = Math.sign(daysBetween(b, a))
        expect(compareDates(a, b)).toBe(byString)
        expect(compareDates(a, b)).toBe(byCalendar)
      }
    }
  })
})

describe('earliestDate', () => {
  test('returns the minimum and refuses an empty call', () => {
    expect(earliestDate('2026-07-23')).toBe('2026-07-23')
    expect(earliestDate('2026-07-23', '2026-07-20')).toBe('2026-07-20')
    expect(earliestDate('2026-07-20', '2026-07-23')).toBe('2026-07-20')
    expect(earliestDate('2025-12-31', '2026-01-01', '2026-01-02')).toBe('2025-12-31')
    expect(() => earliestDate()).toThrow(/at least one/)
  })
})

describe('withinInclusive', () => {
  test('includes both ends, which is what makes 62 days 63 dates', () => {
    const start = '2026-07-01'
    const end = addDays(start, 62)
    expect(end).toBe('2026-09-01')
    expect(withinInclusive(start, start, end)).toBe(true)
    expect(withinInclusive(end, start, end)).toBe(true)
    expect(withinInclusive(addDays(start, -1), start, end)).toBe(false)
    expect(withinInclusive(addDays(end, 1), start, end)).toBe(false)

    let inside = 0
    let date = addDays(start, -3)
    for (let day = 0; day < 70; day += 1) {
      if (withinInclusive(date, start, end)) inside += 1
      date = addDays(date, 1)
    }
    expect(inside).toBe(63)
  })

  test('an inverted range contains nothing', () => {
    expect(withinInclusive('2026-07-15', '2026-09-01', '2026-07-01')).toBe(false)
  })
})
