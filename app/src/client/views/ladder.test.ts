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
import { ladderRungs, rungFor, rungForTask } from './ladder.js'

/* A Tuesday, chosen so the rest of that week is a real span and next Monday
   is genuinely outside it. */
const TODAY = '2026-08-25'

function dated(id: string, due: string | null, start: string | null = null): TaskCard {
  return {
    id,
    title: id,
    status: 'pending',
    important: false,
    start_date: start,
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

/*
The Schedule's half of the ladder, and the reason it is a describe of its own.

Every factory in this client's tests hardcoded `start_date: null` until
2026-09-20, so not one of them exercised a task carrying a start date, and
that is why issue #216's client seams could read `due_date` alone with the
whole suite green. The cases below all name a non-null start date on purpose.
*/
describe('rungForTask: the rung a Schedule lands on', () => {
  test('a task with a deadline is placed by it, whatever its start date', () => {
    // 9.5: "a task starting 20 September and due 30 September sits under the
    // 30 September rung". Here: started last week, due Thursday.
    expect(rungForTask(dated('pair', '2026-08-27', '2026-08-18'), TODAY).name).toBe(
      'Thursday',
    )
    // And a pair whose deadline has passed is overdue like any dated row:
    // what the start date did is nothing.
    expect(rungForTask(dated('late-pair', '2026-08-20', '2026-08-18'), TODAY).name).toBe(
      'Overdue',
    )
  })

  test('a start-only task is placed by its start date', () => {
    expect(rungForTask(dated('starts-today', null, TODAY), TODAY).name).toBe('Today')
    expect(rungForTask(dated('starts-thu', null, '2026-08-27'), TODAY).name).toBe(
      'Thursday',
    )
  })

  /*
  Issue #216 in its own words, quoted in AC-451: "Start-only Tasks must not
  acquire overdue styling simply because they have started." 8.1 makes
  overdue a relation to the deadline alone, and a task with no deadline has
  nothing that can pass. This is the case that was red before the fix: the
  ladder read the schedule date and handed a spent start date to `rungFor`,
  which calls any past date Overdue.
  */
  test('a spent start date with no deadline is Started and never Overdue', () => {
    const rung = rungForTask(dated('started', null, '2026-08-22'), TODAY)
    expect(rung.name).toBe('Started')
    expect(rung.key).toBe('started')
    // A relation to today rather than a day, so there is nothing to capture
    // with, which is what Overdue's own null says (DES-182).
    expect(rung.date).toBeNull()
  })

  test('and a task with neither date is still the undated rung', () => {
    expect(rungForTask(dated('nothing', null), TODAY).name).toBe('No date')
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

  /*
  The whole walk over a page holding all four Schedule states, in the order
  Q3 hands them over: schedule date ascending, which is the due date where
  there is one and the start date otherwise. The two past rungs interleave in
  that stream and each opens where its first row appears, which is the rule
  every other rung follows and is stated in the file's header rather than
  tidied away.
  */
  test('the two past rungs are separate and neither swallows the other', () => {
    const rows = [
      dated('started-first', null, '2026-08-20'),
      dated('overdue', '2026-08-24'),
      dated('started-again', null, '2026-08-24'),
      dated('pair-today', TODAY, '2026-08-18'),
      dated('start-only-thu', null, '2026-08-27'),
    ]
    const rungs = ladderRungs(rows, TODAY)
    expect(rungs.map((rung) => rung.name)).toEqual([
      'Started',
      'Overdue',
      'Today',
      'Thursday',
    ])
    expect(rungs[0]?.rows.map((row) => row.id)).toEqual([
      'started-first',
      'started-again',
    ])
    expect(rungs[1]?.rows.map((row) => row.id)).toEqual(['overdue'])
    expect(rungs.flatMap((rung) => rung.rows)).toHaveLength(rows.length)
  })
})
