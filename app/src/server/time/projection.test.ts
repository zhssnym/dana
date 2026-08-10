/*
8.5's virtual_instances, at the dates AC-082 and AC-143 name.

The criteria exercise this through the calendar endpoint, which is the Query
engineer's and arrives in a later session. These are the same properties
asserted against the function itself, so a defect in the arithmetic is
reported here rather than as a wrong array three layers up.
*/
import { describe, expect, test } from 'vitest'

import { virtualInstances } from './projection.js'
import type { ProjectionSource } from './projection.js'

/** AC-082's series: Mondays, the current occurrence due 2026-07-27. */
const CURRENT: ProjectionSource = {
  status: 'pending',
  dueDate: '2026-07-27',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
}

/** The padded month grid a month zoom requests, six whole weeks (9.5). */
const GRID_START = '2026-06-28'
const GRID_END = '2026-08-08'

describe('the ghosts start strictly after the current occurrence', () => {
  test('the current occurrence\'s own date carries no ghost', () => {
    const dates = virtualInstances(CURRENT, GRID_START, GRID_END)
    expect(
      dates,
      '8.5: lo = max(range_start, due_date + 1 day), so no date can ever show the same series twice',
    ).toEqual(['2026-08-03'])
  })

  test('a matching date before the series shows nothing', () => {
    // 2026-07-06 is a Monday the rule matches, and the series had not
    // started; a projection across the whole range would fabricate history.
    expect(
      virtualInstances(CURRENT, '2026-07-01', '2026-07-26'),
    ).toEqual([])
  })

  test('the range bounds the answer at the top as well', () => {
    expect(
      virtualInstances(CURRENT, '2026-07-01', '2026-07-31'),
      'the first instance after the 27th is 2026-08-03, outside a range ending on the 31st',
    ).toEqual([])
    expect(virtualInstances(CURRENT, GRID_START, '2026-08-31')).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ])
  })
})

describe('the range does not scope the series (AC-143)', () => {
  test('a current occurrence behind the range still projects into it', () => {
    expect(
      virtualInstances(
        { ...CURRENT, dueDate: '2026-06-29' },
        '2026-07-01',
        '2026-07-31',
      ),
      'a weekly chore due last month is the ordinary month-ahead view, and the natural implementation, projecting from the real rows a range query fetched, empties it',
    ).toEqual([
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
    ])
  })

  test('a current occurrence after the range projects nothing', () => {
    expect(
      virtualInstances(
        { ...CURRENT, dueDate: '2026-09-07' },
        '2026-07-01',
        '2026-07-31',
      ),
      'the bound at range_end is what keeps the case above from becoming "project everything"',
    ).toEqual([])
  })

  test('a daily rule anchored before the range fills it and no more', () => {
    const dates = virtualInstances(
      { status: 'pending', dueDate: '2026-06-01', recurrenceRule: 'FREQ=DAILY' },
      '2026-07-01',
      '2026-07-31',
    )
    expect(dates).toHaveLength(31)
    expect([dates[0], dates[30]]).toEqual(['2026-07-01', '2026-07-31'])
  })
})

describe('8.5\'s first line, in each of its three ways', () => {
  test('a closed occurrence projects nothing though its row still draws', () => {
    for (const status of ['completed', 'abandoned']) {
      expect(
        virtualInstances({ ...CURRENT, status }, GRID_START, GRID_END),
        'a series that has stopped must not promise occurrences that will never be generated',
      ).toEqual([])
    }
  })

  test('a task with no rule projects nothing', () => {
    expect(
      virtualInstances({ ...CURRENT, recurrenceRule: null }, GRID_START, GRID_END),
    ).toEqual([])
  })

  test('a dateless task projects nothing, having no anchor', () => {
    // 4.5 forbids the pair, and 8.4 clears the rule with the date; the guard
    // is here so a projection can never be asked to evaluate from nothing.
    expect(
      virtualInstances({ ...CURRENT, dueDate: null }, GRID_START, GRID_END),
    ).toEqual([])
  })
})

describe('UNTIL ends the ghosts too', () => {
  test('a bounded series draws only to its bound', () => {
    expect(
      virtualInstances(
        { ...CURRENT, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260810' },
        GRID_START,
        '2026-09-30',
      ),
    ).toEqual(['2026-08-03', '2026-08-10'])
  })
})
