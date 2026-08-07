import { describe, expect, test } from 'vitest'

import { addDays } from './calendarDate.js'
import { localDateOf, localDayWindow, today } from './today.js'

const HOUR_MS = 3_600_000

function iso(at: Date): string {
  return at.toISOString()
}

function hoursLong(date: string, tz: string): number {
  const window = localDayWindow(date, tz)
  return (
    (window.endExclusive.getTime() - window.startInclusive.getTime()) / HOUR_MS
  )
}

describe('localDateOf and today', () => {
  test('reads AC-050s own instant, which the acceptance suite gives up', () => {
    // AC-050 names 2026-07-23 20:30 UTC and asserts that one task due
    // 2026-07-23 is Carried in Asia/Karachi and Today in Europe/London. The
    // acceptance suite cannot assert it, because owning the clock would decide
    // for the implementer that today(V) comes from the process clock rather
    // than the database; a unit test over a pure function of (tz, instant) has
    // no such problem, so the criterion's own instant is measured here.
    const at = new Date('2026-07-23T20:30:00Z')
    expect(today('Asia/Karachi', at)).toBe('2026-07-24')
    expect(today('Europe/London', at)).toBe('2026-07-23')
  })

  test('the harness zone pair reads the two dates its header claims', () => {
    // tests/views-harness.ts substitutes Pacific/Kiritimati and
    // Pacific/Honolulu for the criterion's pair and states that at the
    // criterion's instant they read 2026-07-24 and 2026-07-23. Checked here
    // rather than imported: the harness deliberately never imports this
    // module, so this is the only place the two definitions can be seen to
    // agree without either borrowing the other.
    const at = new Date('2026-07-23T20:30:00Z')
    expect(today('Pacific/Kiritimati', at)).toBe('2026-07-24')
    expect(today('Pacific/Honolulu', at)).toBe('2026-07-23')
  })

  test('is exactly one day apart for that pair at every hour of 2026', () => {
    let at = Date.UTC(2026, 0, 1)
    const end = Date.UTC(2027, 0, 1)
    let samples = 0
    while (at < end) {
      const ahead = localDateOf(new Date(at), 'Pacific/Kiritimati')
      const behind = localDateOf(new Date(at), 'Pacific/Honolulu')
      expect(addDays(behind, 1), `at ${new Date(at).toISOString()}`).toBe(ahead)
      samples += 1
      at += HOUR_MS
    }
    // 2026 is a common year, so 8760 hours. The harness header reports 8784
    // for the same window, which is a leap year's count; the conclusion it
    // draws holds either way and the number is the one thing to get right.
    expect(samples).toBe(8760)
  })

  test('crosses the date line where the offsets say it does', () => {
    const at = new Date('2026-01-01T11:00:00Z')
    expect(localDateOf(at, 'UTC')).toBe('2026-01-01')
    expect(localDateOf(at, 'Pacific/Kiritimati')).toBe('2026-01-02') // +14
    expect(localDateOf(at, 'Pacific/Honolulu')).toBe('2026-01-01') // -10
    expect(localDateOf(new Date('2026-01-01T09:00:00Z'), 'Pacific/Honolulu')).toBe(
      '2025-12-31',
    )
  })

  test('the default instant is now', () => {
    const before = new Date()
    const answer = today('UTC')
    const after = new Date()
    expect([localDateOf(before, 'UTC'), localDateOf(after, 'UTC')]).toContain(
      answer,
    )
  })

  test('refuses every zone the shared validator refuses', () => {
    for (const bad of ['Not/AZone', '', 'UTC+5', '+05:30', '-08:00', '../../etc']) {
      expect(
        () => today(bad, new Date('2026-07-23T20:30:00Z')),
        `${JSON.stringify(bad)} must refuse`,
      ).toThrow(/valid IANA timezone/)
      expect(() => localDayWindow('2026-07-23', bad)).toThrow(
        /valid IANA timezone/,
      )
    }
  })

  test('accepts the tzdb aliases 8.1 counts as the same zone', () => {
    const at = new Date('2026-07-23T20:30:00Z')
    expect(today('US/Eastern', at)).toBe(today('America/New_York', at))
  })
})

describe('localDayWindow, measured against the installed tzdb', () => {
  test('a zone with no transitions is 24 hours from midnight', () => {
    const window = localDayWindow('2026-07-23', 'UTC')
    expect(iso(window.startInclusive)).toBe('2026-07-23T00:00:00.000Z')
    expect(iso(window.endExclusive)).toBe('2026-07-24T00:00:00.000Z')
    expect(window.date).toBe('2026-07-23')

    const karachi = localDayWindow('2026-07-23', 'Asia/Karachi')
    expect(iso(karachi.startInclusive)).toBe('2026-07-22T19:00:00.000Z')
    expect(hoursLong('2026-07-23', 'Asia/Karachi')).toBe(24)
  })

  test('a fractional offset shifts the boundary by its own minutes', () => {
    // Pacific/Chatham runs +13:45 in January.
    const window = localDayWindow('2026-01-15', 'Pacific/Chatham')
    expect(iso(window.startInclusive)).toBe('2026-01-14T10:15:00.000Z')
    expect(hoursLong('2026-01-15', 'Pacific/Chatham')).toBe(24)
  })

  test('a spring forward is 23 hours and a fall back is 25', () => {
    expect(hoursLong('2026-03-29', 'Europe/London')).toBe(23)
    expect(hoursLong('2026-10-25', 'Europe/London')).toBe(25)
    expect(iso(localDayWindow('2026-10-25', 'Europe/London').startInclusive)).toBe(
      '2026-10-24T23:00:00.000Z',
    )
  })

  test('a date with no midnight starts at the first instant that exists', () => {
    // America/Santiago runs 2026-09-05 23:59 straight to 2026-09-06 01:00, so
    // 2026-09-06 has no 00:00 at all. Luxon asked for that midnight directly
    // answers 01:00 by advancing the gap length, which happens to be right
    // here and is the behavior 11.15 forbids relying on; the window derives
    // the boundary from instant-to-local reads instead and lands on the same
    // instant for a reason that holds when the gap is not one hour.
    const window = localDayWindow('2026-09-06', 'America/Santiago')
    expect(iso(window.startInclusive)).toBe('2026-09-06T04:00:00.000Z')
    expect(localDateOf(window.startInclusive, 'America/Santiago')).toBe(
      '2026-09-06',
    )
    expect(
      localDateOf(
        new Date(window.startInclusive.getTime() - 1),
        'America/Santiago',
      ),
    ).toBe('2026-09-05')
    expect(hoursLong('2026-09-06', 'America/Santiago')).toBe(23)

    // Asia/Beirut skips its own midnight on 2026-03-29, an hour before UTC
    // midnight rather than after it, so the day begins on the previous UTC
    // date.
    expect(iso(localDayWindow('2026-03-29', 'Asia/Beirut').startInclusive)).toBe(
      '2026-03-28T22:00:00.000Z',
    )
    expect(hoursLong('2026-03-29', 'Asia/Beirut')).toBe(23)
  })

  test('a date with two midnights starts at the earlier one', () => {
    // America/Havana runs 2026-11-01 00:59 back to 2026-11-01 00:00, so that
    // date has two midnights an hour apart. The earlier is the day's start,
    // which is 8.6's ambiguity rule reached by definition: the earliest
    // instant whose local date is this one. Taking the later would drop a
    // completed task from Q1R's recap for a whole hour of Cuban time.
    const window = localDayWindow('2026-11-01', 'America/Havana')
    expect(iso(window.startInclusive)).toBe('2026-11-01T04:00:00.000Z')
    expect(localDateOf(window.startInclusive, 'America/Havana')).toBe(
      '2026-11-01',
    )
    expect(
      localDateOf(new Date(window.startInclusive.getTime() - 1), 'America/Havana'),
    ).toBe('2026-10-31')
    expect(hoursLong('2026-11-01', 'America/Havana')).toBe(25)
  })

  test('a half-hour transition gives a half-hour day', () => {
    // Australia/Lord_Howe shifts by 30 minutes, not 60.
    expect(hoursLong('2026-04-05', 'Australia/Lord_Howe')).toBe(24.5)
    expect(hoursLong('2026-10-04', 'Australia/Lord_Howe')).toBe(23.5)
  })

  test('a date the zone never had is refused, not silently empty', () => {
    // Pacific/Apia crossed the date line at the end of 2011 and 2011-12-30
    // never happened there. Every date reaching this module is read back off
    // an instant, so this cannot arrive from a caller that read one.
    expect(() => localDayWindow('2011-12-30', 'Pacific/Apia')).toThrow(
      /does not exist in Pacific\/Apia/,
    )
    // The day either side is ordinary, and they meet at the skip.
    const before = localDayWindow('2011-12-29', 'Pacific/Apia')
    const after = localDayWindow('2011-12-31', 'Pacific/Apia')
    expect(iso(before.endExclusive)).toBe('2011-12-30T10:00:00.000Z')
    expect(after.startInclusive.getTime()).toBe(before.endExclusive.getTime())
  })
})

const PROPERTY_ZONES = [
  'UTC',
  'Europe/London',
  'America/Santiago',
  'America/Havana',
  'Asia/Beirut',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
  'Pacific/Kiritimati',
] as const

/* Each window costs two millisecond-precision binary searches, so a walk over
a year of eight zones is thousands of them. That is affordable on its own and
close to Vitest's 5 second default when the whole suite is running eight ways
in parallel, so both walks below name their own timeout rather than becoming a
flake that fails whichever file it lands beside. */
const PROPERTY_TIMEOUT_MS = 30_000

describe('localDayWindow properties across a year of DST-awkward zones', () => {
  test('consecutive days tile the timeline and none is an absurd length', () => {
    // Tiling is the property Q6 needs: every completed_at belongs to exactly
    // one day group. A boundary rule that answered midnight independently per
    // date would leave an hour in two groups every autumn and an hour in none
    // every spring. The length bound is asserted in the same walk rather than
    // its own, because each window costs two binary searches and a second
    // pass over the year buys nothing the first pass cannot see.
    for (const tz of PROPERTY_ZONES) {
      let date = '2026-01-01'
      let previous = localDayWindow(date, tz)
      for (let day = 0; day < 364; day += 1) {
        date = addDays(date, 1)
        const window = localDayWindow(date, tz)
        expect(
          window.startInclusive.getTime(),
          `${tz} ${previous.date} to ${date}`,
        ).toBe(previous.endExclusive.getTime())

        const ms =
          window.endExclusive.getTime() - window.startInclusive.getTime()
        expect(ms % 60_000, `${tz} ${date} is not whole minutes`).toBe(0)
        expect(
          ms,
          `${tz} ${date} is ${ms / HOUR_MS} hours`,
        ).toBeGreaterThanOrEqual(22 * HOUR_MS)
        expect(ms).toBeLessThanOrEqual(26 * HOUR_MS)

        previous = window
      }
    }
  }, PROPERTY_TIMEOUT_MS)

  test('an instant is in the window of its own local date and no other', () => {
    // The definition the whole module rests on, checked both ways: the window
    // is exactly the set of instants localDateOf agrees with. A deterministic
    // sequence rather than Math.random, so a failure is reproducible.
    let seed = 20260807
    const nextInstant = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      const spread = seed / 2_147_483_648
      return Date.UTC(2026, 0, 1) + Math.floor(spread * 365 * 24 * HOUR_MS)
    }
    for (const tz of PROPERTY_ZONES) {
      for (let sample = 0; sample < 60; sample += 1) {
        const millis = nextInstant()
        const at = new Date(millis)
        const date = localDateOf(at, tz)
        const window = localDayWindow(date, tz)
        expect(
          window.startInclusive.getTime() <= millis &&
            millis < window.endExclusive.getTime(),
          `${tz} ${at.toISOString()} claims ${date}`,
        ).toBe(true)
        // The neighbouring days must not also claim it.
        for (const neighbour of [addDays(date, -1), addDays(date, 1)]) {
          const other = localDayWindow(neighbour, tz)
          expect(
            other.startInclusive.getTime() <= millis &&
              millis < other.endExclusive.getTime(),
            `${tz} ${at.toISOString()} also in ${neighbour}`,
          ).toBe(false)
        }
      }
    }
  }, PROPERTY_TIMEOUT_MS)
})
