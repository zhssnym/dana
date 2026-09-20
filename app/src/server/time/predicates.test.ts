import { describe, expect, test } from 'vitest'

import { addDays } from './calendar-date.js'
import {
  CALENDAR_RANGE_MAX_DAYS,
  checkCalendarRange,
  dueRelation,
  isActiveByToday,
  myDayGroup,
  qualifyDate,
} from './predicates.js'

const TODAY = '2026-07-23'

describe('dueRelation, section 8.1s boundary statement', () => {
  test('due today, overdue, and future, at the boundary', () => {
    expect(dueRelation(TODAY, TODAY)).toBe('due_today')
    expect(dueRelation(addDays(TODAY, -1), TODAY)).toBe('overdue')
    expect(dueRelation(addDays(TODAY, 1), TODAY)).toBe('future')
    expect(dueRelation(addDays(TODAY, -365), TODAY)).toBe('overdue')
    expect(dueRelation(addDays(TODAY, 365), TODAY)).toBe('future')
  })

  test('the three arms partition every date', () => {
    let date = addDays(TODAY, -200)
    const seen = { overdue: 0, due_today: 0, future: 0 }
    for (let day = 0; day < 400; day += 1) {
      seen[dueRelation(date, TODAY)] += 1
      date = addDays(date, 1)
    }
    expect(seen).toEqual({ overdue: 200, due_today: 1, future: 199 })
  })
})

describe('isActiveByToday, My Days automatic clause', () => {
  test('admits D <= today and nothing after it', () => {
    expect(isActiveByToday(addDays(TODAY, -3), TODAY)).toBe(true)
    expect(isActiveByToday(TODAY, TODAY)).toBe(true)
    expect(isActiveByToday(addDays(TODAY, 1), TODAY)).toBe(false)
  })

  test('has no lower bound, which is what makes AC-046 hold on every later day', () => {
    // AC-046's "on every subsequent day" follows from the absence of a floor
    // in the clause, not from any test that can run the clock forward.
    for (const back of [1, 3, 30, 365, 3650]) {
      expect(isActiveByToday(addDays(TODAY, -back), TODAY)).toBe(true)
    }
  })
})

describe('qualifyDate, section 8.2s minimum', () => {
  test('takes the earlier of the automatic and pulled dates', () => {
    expect(qualifyDate('2026-07-20', '2026-07-23')).toBe('2026-07-20')
    expect(qualifyDate('2026-07-23', '2026-07-20')).toBe('2026-07-20')
    expect(qualifyDate('2026-07-23', '2026-07-23')).toBe('2026-07-23')
  })

  test('takes whichever one exists', () => {
    expect(qualifyDate('2026-07-20', null)).toBe('2026-07-20')
    expect(qualifyDate(null, '2026-07-21')).toBe('2026-07-21')
  })

  test('refuses a row Q1s predicate could not have selected', () => {
    expect(() => qualifyDate(null, null)).toThrow(/admits no row with neither/)
  })

  test('keeps a pulled overdue row in Carried, which is AC-046s other half', () => {
    // A task due three days ago and also pulled today: the minimum is the due
    // date, so the row stays Carried instead of jumping to Today the moment
    // someone pulls it.
    const due = addDays(TODAY, -3)
    expect(myDayGroup(qualifyDate(due, TODAY), TODAY)).toBe('carried')
  })
})

describe('myDayGroup, Q1s grouping boundary', () => {
  test('carried below today, today at today', () => {
    expect(myDayGroup(addDays(TODAY, -1), TODAY)).toBe('carried')
    expect(myDayGroup(TODAY, TODAY)).toBe('today')
    expect(myDayGroup(addDays(TODAY, -400), TODAY)).toBe('carried')
  })

  test('a date after today groups rather than vanishing', () => {
    // Unreachable under Q1's predicate; grouped with Today because a row in
    // neither group is the one outcome Q1 must never produce.
    expect(myDayGroup(addDays(TODAY, 1), TODAY)).toBe('today')
  })

  test('a pulled future task lands in Today by its added_on', () => {
    // 8.2: the automatic clause fails for a future due date, so qualify_date
    // is added_on alone, which is today at pull time.
    expect(myDayGroup(qualifyDate(null, TODAY), TODAY)).toBe('today')
  })
})

describe('checkCalendarRange, Q3Cs two rules', () => {
  test('the limit is 62 and it is measured as end minus start', () => {
    expect(CALENDAR_RANGE_MAX_DAYS).toBe(62)
    expect(checkCalendarRange('2026-07-01', '2026-07-01')).toEqual({
      ok: true,
      days: 0,
    })
    const sixtyTwo = addDays('2026-07-01', 62)
    expect(checkCalendarRange('2026-07-01', sixtyTwo)).toEqual({
      ok: true,
      days: 62,
    })
    expect(checkCalendarRange('2026-07-01', addDays('2026-07-01', 63))).toEqual({
      ok: false,
      reason: 'too_long',
      days: 63,
    })
  })

  test('an inverted range is refused however small the difference', () => {
    expect(checkCalendarRange('2026-07-02', '2026-07-01')).toEqual({
      ok: false,
      reason: 'inverted',
      days: -1,
    })
  })

  test('an inverted range is refused where the span check alone would pass it', () => {
    // The recorded ground of the 2026-08-07 ruling: a negative difference is
    // at most 62, so a check written only as days <= 62 admits a whole
    // inverted year. This is the case that makes the first rule not
    // redundant.
    const wildlyInverted = checkCalendarRange('2026-12-31', '2026-01-01')
    expect(wildlyInverted.days).toBe(-364)
    expect(wildlyInverted.days).toBeLessThanOrEqual(CALENDAR_RANGE_MAX_DAYS)
    expect(wildlyInverted).toEqual({
      ok: false,
      reason: 'inverted',
      days: -364,
    })
  })

  test('the boundary holds across a leap February', () => {
    expect(checkCalendarRange('2028-01-15', addDays('2028-01-15', 62)).ok).toBe(
      true,
    )
    expect(checkCalendarRange('2028-01-15', addDays('2028-01-15', 63))).toEqual({
      ok: false,
      reason: 'too_long',
      days: 63,
    })
  })

  test('refuses a malformed date rather than guessing at the span', () => {
    expect(() => checkCalendarRange('2026-02-30', '2026-03-05')).toThrow(
      /calendar date/,
    )
  })
})
