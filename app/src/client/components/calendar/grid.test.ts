/*
Unit tests for the grid's arithmetic, which is the half of the calendar no
acceptance criterion can see.

AC-177 asserts forty-two cells and a first column header beginning with M, so
it would notice a grid that laid out the wrong forty-two days only if the
count changed. These are what check that the days themselves are right: the
month boundary, the six weeks, the Monday start, a leap February, and the
month step that would otherwise turn 31 March into 2 March.

Nothing here reads a clock. Every date is written down, which is what makes
the expectations checkable rather than circular.
*/
import { describe, expect, it } from 'vitest'

import {
  MONTH_GRID_DAYS,
  WEEKDAY_LABELS,
  addDays,
  datesFor,
  dayOfMonth,
  firstOfMonth,
  monthGridDates,
  monthOf,
  periodTitle,
  shiftAnchor,
  startOfWeek,
  weekDates,
  weekdayIndex,
} from './grid.js'

describe('the labels', () => {
  it('begins the week on Monday, which is what AC-177 reads', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Mon')
    expect(WEEKDAY_LABELS).toHaveLength(7)
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('crosses a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('crosses a DST transition without moving the civil date', () => {
    // Europe/London springs forward on 2026-03-29. A zone-aware addition of
    // 24 hours lands on the 28th at 23:00 or the 30th at 01:00 depending on
    // which way it rounds; a civil date has no such day.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('answers an unreadable date with itself rather than throwing', () => {
    expect(addDays('not a date', 1)).toBe('not a date')
  })
})

describe('weekdayIndex and startOfWeek', () => {
  it('indexes Monday at zero and Sunday at six', () => {
    // 2026-08-10 is a Monday and 2026-08-16 the Sunday that closes its week.
    expect(weekdayIndex('2026-08-10')).toBe(0)
    expect(weekdayIndex('2026-08-16')).toBe(6)
  })

  it('takes a Sunday back to the Monday before it, never forward', () => {
    expect(startOfWeek('2026-08-16')).toBe('2026-08-10')
    expect(startOfWeek('2026-08-10')).toBe('2026-08-10')
    expect(startOfWeek('2026-08-13')).toBe('2026-08-10')
  })
})

describe('monthGridDates', () => {
  it('lays out six whole weeks beginning on a Monday', () => {
    const dates = monthGridDates('2026-09-17')
    expect(dates).toHaveLength(MONTH_GRID_DAYS)
    expect(dates[0]).toBe('2026-08-31')
    expect(dates[41]).toBe('2026-10-11')
    expect(weekdayIndex(dates[0] ?? '')).toBe(0)
    expect(weekdayIndex(dates[41] ?? '')).toBe(6)
  })

  it('draws the same six weeks from any day of the month', () => {
    expect(monthGridDates('2026-09-01')).toEqual(monthGridDates('2026-09-30'))
  })

  it('reaches past the month end, which is what AC-082 turns on', () => {
    // 9.5 fixes six weeks rather than the four or five a month needs so that
    // a series whose successor lands in the first days of the next month is
    // visible. July 2026 is the worked example: the occurrence is the 27th
    // and the next instance is 2026-08-03.
    const july = monthGridDates('2026-07-15')
    expect(july).toContain('2026-08-03')
  })

  it('holds forty-two days for a February that starts on a Monday', () => {
    // The month that fits in exactly four weeks, and the one a variable grid
    // would draw at a different height from every other month.
    const february = monthGridDates('2027-02-10')
    expect(february).toHaveLength(MONTH_GRID_DAYS)
    expect(february[0]).toBe('2027-02-01')
  })

  it('covers every day of the month it is anchored in', () => {
    const dates = new Set(monthGridDates('2028-02-14'))
    for (let day = 1; day <= 29; day += 1) {
      expect(dates.has(`2028-02-${String(day).padStart(2, '0')}`)).toBe(true)
    }
  })
})

describe('weekDates and datesFor', () => {
  it('gives a week its seven days from Monday', () => {
    expect(weekDates('2026-08-13')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ])
  })

  it('gives each zoom the range it asks Q3C for', () => {
    expect(datesFor('day', '2026-08-13')).toEqual(['2026-08-13'])
    expect(datesFor('week', '2026-08-13')).toHaveLength(7)
    expect(datesFor('month', '2026-08-13')).toHaveLength(42)
  })

  it('never approaches the 62-day refusal of Q3C', () => {
    for (const zoom of ['day', 'week', 'month'] as const) {
      expect(datesFor(zoom, '2026-08-13').length).toBeLessThanOrEqual(62)
    }
  })
})

describe('shiftAnchor', () => {
  it('steps a day and a week', () => {
    expect(shiftAnchor('day', '2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftAnchor('week', '2026-08-13', 1)).toBe('2026-08-20')
    expect(shiftAnchor('week', '2026-08-13', -1)).toBe('2026-08-06')
  })

  it('steps a month to the first, never to the same day of it', () => {
    // The day-of-month arithmetic that skips February: 31 March minus one
    // month is 31 February, which every Date implementation reads as 2 or 3
    // March and no reader expects.
    expect(shiftAnchor('month', '2026-03-31', -1)).toBe('2026-02-01')
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01')
  })

  it('draws the same grid after a month step whatever day it started on', () => {
    expect(monthGridDates(shiftAnchor('month', '2026-03-31', -1))).toEqual(
      monthGridDates('2026-02-15'),
    )
  })
})

describe('the small readers', () => {
  it('reads a day and a month off a 4.11 date', () => {
    expect(dayOfMonth('2026-09-05')).toBe(5)
    expect(monthOf('2026-09-05')).toBe('2026-09')
    expect(firstOfMonth('2026-09-05')).toBe('2026-09-01')
  })
})

describe('periodTitle', () => {
  it('names a month, a day and a week', () => {
    expect(periodTitle('month', '2026-09-17')).toBe('September 2026')
    expect(periodTitle('day', '2026-09-05')).toBe('5 September 2026')
    expect(periodTitle('week', '2026-08-13')).toBe('10 to 16 Aug 2026')
  })

  it('names both months of a week that crosses one', () => {
    expect(periodTitle('week', '2026-09-02')).toBe('31 Aug to 6 Sep 2026')
  })

  it('names both years of a week that crosses one', () => {
    expect(periodTitle('week', '2026-12-31')).toBe('28 Dec 2026 to 3 Jan 2027')
  })

  it('uses "to" rather than a dash, per the corpus convention', () => {
    expect(periodTitle('week', '2026-08-13')).not.toMatch(/[–—]/)
  })
})
