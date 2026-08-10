/*
A unit test of the P6 harness's rule builders, not an acceptance criterion.
Protocol section 8 puts unit tests inside a module with that module's owner,
and recurrence-harness.ts is this role's.

It exists because four criteria rest on one mapping. Section 12's ruling of
2026-08-10 asserts AC-072 to AC-075 by their content rather than at the July
2026 dates they quote, so each of those files computes a due date from today
and then builds a weekly rule that must land on that date's own weekday. If
bydayOf is off by one, the rule no longer matches its anchor, 8.5's iterator
answers a date six or eight days out, and four files fail against a correct
engine with messages that read like the engine's fault. That is the class of
error this suite has already paid for once, in the readers
tasks-harness.test.ts guards.

Nothing here touches the database or a route. The inputs are calendar dates
whose weekdays are facts, chosen to cross a month boundary, a leap day, and
the end of a year, and the July 2026 Mondays that 8.5's own worked examples
and AC-082 are written on.
*/
import { describe, expect, test } from 'vitest'

import {
  bydayOf,
  untilStamp,
  weeklyRuleOn,
  weeklyRuleUntil,
} from './recurrence-harness.js'

/** Date to BYDAY token. Every weekday appears at least once. */
const KNOWN: readonly [string, string][] = [
  ['2026-07-13', 'MO'],
  ['2026-07-20', 'MO'],
  ['2026-07-27', 'MO'],
  ['2026-08-03', 'MO'],
  ['2026-07-28', 'TU'],
  ['2026-07-01', 'WE'],
  ['2026-07-02', 'TH'],
  ['2026-07-03', 'FR'],
  ['2026-07-04', 'SA'],
  ['2026-07-05', 'SU'],
  // A month boundary, a leap day, and a year end, where naive arithmetic
  // and a host in a negative UTC offset each go wrong differently.
  ['2026-08-01', 'SA'],
  ['2024-02-29', 'TH'],
  ['2026-12-31', 'TH'],
  ['2027-01-01', 'FR'],
]

describe('the P6 rule builders', () => {
  test('bydayOf maps a calendar date to its 4.11 BYDAY token', () => {
    for (const [date, token] of KNOWN) {
      expect(bydayOf(date), `${date} is a ${token}`).toBe(token)
    }
  })

  test('bydayOf agrees with the platform on every day of a year', () => {
    // The table above is a spot check; this is the whole mapping. Both sides
    // are computed at UTC noon, so the only thing that can differ is the
    // index, which is exactly what the table cannot cover on its own.
    const tokens = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
    for (let offset = 0; offset < 366; offset += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 12))
      at.setUTCDate(at.getUTCDate() + offset)
      const date = at.toISOString().slice(0, 10)
      expect(bydayOf(date), `${date}`).toBe(tokens[at.getUTCDay()])
    }
  })

  test('weeklyRuleOn builds a rule the date itself is an instance of', () => {
    expect(weeklyRuleOn('2026-07-20')).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(weeklyRuleOn('2026-07-28')).toBe('FREQ=WEEKLY;BYDAY=TU')
  })

  test('untilStamp writes RFC 5545\'s DATE form', () => {
    // YYYYMMDD, no separators, which 11.9 records as the reading of frozen
    // 4.11: the column is an RFC 5545 RRULE value string, UNTIL is "a date,
    // inclusive per RFC 5545", and that RFC's DATE value type is the basic
    // ISO format. Any other spelling is outside the subset and answers 422.
    expect(untilStamp('2026-07-27')).toBe('20260727')
    expect(untilStamp('2024-02-29')).toBe('20240229')
    expect(weeklyRuleUntil('2026-07-20', '2026-07-20')).toBe(
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260720',
    )
  })

  test('the builders refuse anything that is not a 4.11 calendar date', () => {
    // A fixture that silently accepted "2026-7-1" or an instant would build
    // a rule against a date the database never held.
    for (const bad of ['2026-7-1', '20260701', '2026-07-01T00:00:00Z', '']) {
      expect(() => bydayOf(bad), `bydayOf must refuse ${JSON.stringify(bad)}`).toThrow()
      expect(
        () => untilStamp(bad),
        `untilStamp must refuse ${JSON.stringify(bad)}`,
      ).toThrow()
    }
  })
})
