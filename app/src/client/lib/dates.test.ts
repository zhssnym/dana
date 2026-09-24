/*
The one date formatter: relative words near today, a short weekday within the
week ahead, "24 Sep" otherwise, the year only outside today's year, never ISO.
*/
import { describe, expect, test } from 'vitest'

import { dueDisplay } from '../parts/presenters.js'
import { rungFor } from '../views/ladder.js'
import { periodTitle } from '../components/calendar/grid.js'
import {
  addDays,
  daysBetween,
  formatDate,
  formatDay,
  formatDayHeading,
  formatDayInline,
  formatDayTime,
  formatMonthHeading,
  weekStart,
} from './dates.js'

// 2026-09-24 is a Thursday.
const TODAY = '2026-09-24'

describe('formatDay', () => {
  test('relative words, weekday, then date', () => {
    expect(formatDay('2026-09-24', TODAY)).toBe('Today')
    expect(formatDay('2026-09-25', TODAY)).toBe('Tomorrow')
    expect(formatDay('2026-09-23', TODAY)).toBe('Yesterday')
    expect(formatDay('2026-09-28', TODAY)).toBe('Mon')
    expect(formatDay('2026-09-30', TODAY)).toBe('Wed')
    expect(formatDay('2026-10-01', TODAY)).toBe('1 Oct')
    expect(formatDay('2026-09-20', TODAY)).toBe('20 Sep')
    expect(formatDay('2027-09-24', TODAY)).toBe('24 Sep 2027')
  })

  test('never ISO: unreadable input is empty', () => {
    expect(formatDay('not a date', TODAY)).toBe('')
    expect(formatDay('2026-13-01', TODAY)).toBe('')
    expect(formatDate('2026-09-24', '')).toBe('24 Sep 2026')
  })

  test('inline form lowercases the relative words only', () => {
    expect(formatDayInline('2026-09-25', TODAY)).toBe('tomorrow')
    expect(formatDayInline('2026-09-28', TODAY)).toBe('Mon')
  })
})

describe('formatDayTime', () => {
  test('joins the day to the time on the viewer clock', () => {
    expect(formatDayTime('2026-09-24', '18:00:00', TODAY, '12')).toBe('Today 6:00 PM')
    expect(formatDayTime('2026-09-24', '18:00', TODAY, '24')).toBe('Today 18:00')
    expect(formatDayTime('2026-10-24', null, TODAY, '12')).toBe('24 Oct')
  })
})

describe('headings', () => {
  test('day headings spell the weekday in full', () => {
    expect(formatDayHeading('2026-09-24', TODAY)).toBe('Today')
    expect(formatDayHeading('2026-09-23', TODAY)).toBe('Yesterday')
    expect(formatDayHeading('2026-09-26', TODAY)).toBe('Saturday')
    expect(formatDayHeading('2026-09-22', TODAY)).toBe('22 Sep')
    expect(formatDayHeading('2025-09-22', TODAY)).toBe('22 Sep 2025')
  })

  test('month headings carry the year only outside this one', () => {
    expect(formatMonthHeading('2026-10-01', TODAY)).toBe('October')
    expect(formatMonthHeading('2027-10-01', TODAY)).toBe('October 2027')
  })
})

describe('civil arithmetic', () => {
  test('crosses months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2026-09-24', '2026-10-01')).toBe(7)
    expect(weekStart(TODAY)).toBe('2026-09-21')
  })
})

describe('callers', () => {
  test('the due label is the plain formatter output', () => {
    const task = { status: 'pending' as const, due_time: null }
    expect(dueDisplay({ ...task, due_date: TODAY }, TODAY)).toEqual({ label: 'Today' })
    expect(dueDisplay({ ...task, due_date: '2026-09-20' }, TODAY)).toEqual({
      label: '20 Sep',
      overdue: true,
    })
    expect(
      dueDisplay({ ...task, due_date: '2026-09-25', due_time: '18:00:00' }, TODAY),
    ).toEqual({ label: 'Tomorrow 6:00 PM' })
    expect(
      dueDisplay({ status: 'completed', due_date: '2026-09-20', due_time: null }, TODAY),
    ).toEqual({ label: '20 Sep' })
  })

  test('ladder and calendar headings', () => {
    expect(rungFor('2026-09-26', TODAY).name).toBe('Saturday')
    expect(rungFor('2026-11-03', TODAY).name).toBe('November')
    expect(periodTitle('month', '2026-09-01', TODAY)).toBe('September')
    expect(periodTitle('week', TODAY, TODAY)).toBe('21 to 27 Sep')
    expect(periodTitle('week', '2026-09-30', TODAY)).toBe('28 Sep to 4 Oct')
    expect(periodTitle('day', TODAY, TODAY)).toBe('Today')
  })
})
