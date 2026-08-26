/*
The Scheduled ladder's own unit tests.

The rungs are the one part of this package that is pure arithmetic over a
calendar, and a calendar is where an off-by-one hides for months: a week that
starts on Sunday, a "this week" that swallows next Monday, a month rung that
puts the 1st under the previous month's heading. None of those is visible on a
page, and every one of them is visible here.

`rungFor` is tested against a fixed today rather than a real one, for the same
reason `parts/format-dates.ts` builds no `Date`: a test that reads a clock
passes on the day it was written.
*/
import { describe, expect, test } from 'vitest'

import type { TaskCard } from '../../shared/tasks.js'
import { ladderRungs, rungFor } from './ladder.js'

/* A Tuesday, chosen so the rest of that week is a real span and next Monday
   is genuinely outside it. */
const TODAY = '2026-08-25'

function dated(id: string, due: string | null): TaskCard {
  return {
    id,
    title: id,
    status: 'pending',
    important: false,
    due_date: due,
    due_time: null,
    folder: { id: 'f', name: 'Groceries', is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    // RFC 0005 unit 12a's two additions to 7.0's TaskCard; nothing here
    // reads either, so both take the value a task under no section and a
    // scrubbed creator would.
    section_block_id: null,
    created_by: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

describe('rungFor', () => {
  test('the three rungs a person names by relation', () => {
    expect(rungFor('2026-08-24', TODAY).name).toBe('Overdue')
    expect(rungFor(TODAY, TODAY).name).toBe('Today')
    expect(rungFor('2026-08-26', TODAY).name).toBe('Tomorrow')
  })

  test('the rest of this week is named by its days, Monday to Sunday', () => {
    // 2026-08-25 is a Tuesday, so Thursday, Saturday and Sunday are still
    // this week and next Monday is not.
    expect(rungFor('2026-08-27', TODAY).name).toBe('Thursday')
    expect(rungFor('2026-08-30', TODAY).name).toBe('Sunday')
    expect(rungFor('2026-08-31', TODAY).name).toBe('Next week')
  })

  test('then week and month rungs, and Later beyond a year', () => {
    expect(rungFor('2026-09-06', TODAY).name).toBe('Next week')
    expect(rungFor('2026-09-07', TODAY).name).toBe('September 2026')
    expect(rungFor('2026-12-01', TODAY).name).toBe('December 2026')
    expect(rungFor('2028-01-01', TODAY).name).toBe('Later')
  })

  test('only a rung that is one day carries a date to capture with', () => {
    expect(rungFor(TODAY, TODAY).date).toBe(TODAY)
    expect(rungFor('2026-08-27', TODAY).date).toBe('2026-08-27')
    // DES-182: Overdue is a relation rather than a value, and a week or a
    // month names a range with no day in it.
    expect(rungFor('2026-08-24', TODAY).date).toBeNull()
    expect(rungFor('2026-08-31', TODAY).date).toBeNull()
    expect(rungFor('2026-09-07', TODAY).date).toBeNull()
    expect(rungFor(null, TODAY).name).toBe('No date')
  })
})

describe('ladderRungs', () => {
  test('keeps the order it was handed and drops nothing', () => {
    const rows = [
      dated('late', '2026-08-20'),
      dated('later-still', '2026-08-24'),
      dated('now', TODAY),
      dated('next', '2026-08-26'),
      dated('far', '2026-10-01'),
    ]
    const rungs = ladderRungs(rows, TODAY)
    expect(rungs.map((rung) => rung.name)).toEqual([
      'Overdue',
      'Today',
      'Tomorrow',
      'October 2026',
    ])
    expect(rungs[0]?.rows.map((row) => row.id)).toEqual(['late', 'later-still'])
    expect(rungs.flatMap((rung) => rung.rows)).toHaveLength(rows.length)
  })

  test('an empty rung is absent rather than a heading over nothing', () => {
    expect(ladderRungs([dated('only', TODAY)], TODAY).map((rung) => rung.name)).toEqual([
      'Today',
    ])
    expect(ladderRungs([], TODAY)).toEqual([])
  })
})
