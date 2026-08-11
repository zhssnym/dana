/*
Unit tests for the P7 harness's own arithmetic (protocol section 8: unit tests
inside a module belong to that module's owner, and this module is the
Adversarial Test role's). They open no database and boot no application.

Why they exist. Eight criteria and ten proposed ones assert a fire instant,
and every one of them derives its expected value here. A wrong helper would
agree with itself across all eighteen files and report green, which is the
vacuous pass this role exists to prevent; `tasks-harness.test.ts` was written
for exactly that reason after a shared reader answered NaN in silence.

The sharpest case below is the one that asserts a helper refuses to answer.
instantAtWallTime must fail inside a spring-forward gap and inside a fall-back
overlap, because those are the two local times 8.6 resolves by policy and
section 13 item 25 forbids computing here at all; a version that quietly
returned Luxon's own answer would make AC-144 and AC-145 assert the module
against itself.
*/
import { describe, expect, test } from 'vitest'

import {
  FOLD,
  GAP,
  KARACHI,
  LONDON,
  NEW_YORK,
  dateOnlyFireInstant,
  expectFoldFixture,
  expectGapFixture,
  formatInstant,
  instantAtWallTime,
  offsetAt,
  offsetFireInstant,
  shiftDay,
  wallClockIn,
  wallTimeMinus,
} from './reminders-harness.js'

function refusal(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ''
}

describe('the P7 harness computes what it claims to', () => {
  test('instantAtWallTime is exact in a zone with no DST', () => {
    // AC-083's own arithmetic: Karachi is UTC+5 all year.
    expect(instantAtWallTime(KARACHI, '2026-07-28', '14:30').toISOString()).toBe(
      '2026-07-28T09:30:00.000Z',
    )
    expect(offsetAt(KARACHI, new Date('2026-07-28T09:30:00Z'))).toBe(300)
  })

  test('instantAtWallTime takes the offset in force on the target date', () => {
    // The hour that separates these two is the whole of AC-084's DST case.
    expect(instantAtWallTime(NEW_YORK, '2010-01-15', '09:00').toISOString()).toBe(
      '2010-01-15T14:00:00.000Z',
    )
    expect(instantAtWallTime(NEW_YORK, '2010-07-15', '09:00').toISOString()).toBe(
      '2010-07-15T13:00:00.000Z',
    )
  })

  test('instantAtWallTime refuses a local time inside the spring-forward gap', () => {
    expect(
      refusal(() => instantAtWallTime(GAP.zone, GAP.date, GAP.localTime)),
      'a nonexistent local time has no instant, and 8.6 chooses one by policy; the harness must say so rather than pick',
    ).toMatch(/gap or a fold/)
  })

  test('instantAtWallTime refuses a local time inside the fall-back overlap', () => {
    // The read-back succeeds for a fold, so this is the case that proves the
    // guard is not merely a spelling check: it fails because the two-pass
    // correction lands on the later instant while 8.6 requires the earlier,
    // which is exactly the disagreement item 25 forbids resolving here.
    const answered = instantAtWallTime(FOLD.zone, FOLD.date, FOLD.localTime)
    expect(
      answered.getTime() === FOLD.resolved.getTime() ||
        answered.getTime() === FOLD.later.getTime(),
      'an ambiguous local time has two instants and this helper reaches one of them by accident of arithmetic; AC-145 is why neither may be taken as the expected value',
    ).toBe(true)
    expect(
      answered.getTime(),
      'and the one it reaches is not 8.6\'s, which is why FOLD.resolved is a hand-derived constant',
    ).not.toBe(FOLD.resolved.getTime())
  })

  test('both DST fixtures are still what they were on this runtime', () => {
    expectGapFixture()
    expectFoldFixture()
    expect(
      wallClockIn(LONDON, FOLD.resolved),
      'the fold fixture reads its own wall clock',
    ).toEqual({ date: FOLD.date, time: FOLD.localTime })
  })

  test('the 8.6 offset arm subtracts before the zone is applied', () => {
    // 15:00 minus 30 is 14:30 on the same date.
    expect(wallTimeMinus('2026-07-28', '15:00', 30)).toEqual({
      date: '2026-07-28',
      time: '14:30',
    })
    // 00:15 minus 30 crosses back into the previous local date, which is the
    // case an implementation subtracting inside a single day gets wrong.
    expect(wallTimeMinus('2026-07-28', '00:15', 30)).toEqual({
      date: '2026-07-27',
      time: '23:45',
    })
    // 4.8's maximum offset, seven days.
    expect(wallTimeMinus('2026-07-28', '15:00', 10_080)).toEqual({
      date: '2026-07-21',
      time: '15:00',
    })
    expect(
      offsetFireInstant(KARACHI, '2026-07-28', '15:00', 30).toISOString(),
    ).toBe('2026-07-28T09:30:00.000Z')
    expect(
      dateOnlyFireInstant(KARACHI, '2026-07-28', '09:00').toISOString(),
    ).toBe('2026-07-28T04:00:00.000Z')
  })

  test('formatInstant matches the to_char shape the row readers project', () => {
    expect(formatInstant(new Date('2026-07-28T09:30:00Z'))).toBe(
      '2026-07-28T09:30:00.000000Z',
    )
    // Six digits are kept, so an equality against a stored instant is as sharp
    // as the column: one millisecond of movement must still fail it.
    expect(formatInstant(new Date('2026-07-28T09:30:00.001Z'))).not.toBe(
      formatInstant(new Date('2026-07-28T09:30:00Z')),
    )
  })

  test('shiftDay does calendar arithmetic on a floating date', () => {
    expect(shiftDay('2026-07-28', 1)).toBe('2026-07-29')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    // Across a DST boundary the calendar date still moves by one, because
    // 4.11 dates are floating and carry no instant to shorten.
    expect(shiftDay('2010-03-13', 1)).toBe('2010-03-14')
  })
})
