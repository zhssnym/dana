/*
8.6's fire-instant computation, and the two DST rules that have no oracle.

**What this file owes and why it exists.** Section 13 item 25 rules that the
two rules of 8.6 cannot be checked against a library, by construction: an
oracle adjudicates where two implementations of one standard should agree, and
both rules are Dana policy chosen where the standard is silent, a nonexistent
local time having no correct answer and an ambiguous one having two. Luxon is
an anti-oracle for exactly these cases per 11.9, and 11.15 forecloses Intl as
circular, it being Luxon's own engine. What the item makes owed instead, in
this module rather than in the acceptance range and for the reason protocol
section 8 gives, is an assertion of raw Luxon and this module in the same
test, so each override is proven necessary rather than assumed. Both are
below, under "the two overrides, proven against the library".

**Every DST fixture is historical, in a zone whose rules have stood for
decades, and each is asserted before anything leans on it.** Item 25's reason
is that the Node runtime and the embedded engine of 11.10 carry tzdb copies
that move independently, so a fixture on a future transition is a flake
waiting for an upstream release. Three zones carry the transitions here:
America/New_York under the United States rule that took effect in 2007,
Europe/London under the European rule unchanged since 1996, and
Australia/Lord_Howe, whose half-hour shift dates from 1985. Nothing here is
dated later than 2010, and a tzdb that moved one of them fails as "this is no
longer a gap" rather than as a wrong instant.

**The fixture instants agree with app/tests/reminders-harness.ts and are
derived independently.** The two files reach the same numbers from the same
transitions without sharing a definition, which is the point: the acceptance
suite must not import from the module it measures, and this file must not
import from a harness the acceptance suite might change.
*/
import { DateTime, Settings } from 'luxon'
import { afterEach, describe, expect, test } from 'vitest'

import { computeFireAt, resolveFireAt, resolveLocalTime } from './reminder-time.js'

/* ------------------------------------------------------------------ *
 * Fixtures, each a historical transition and each asserted first
 * ------------------------------------------------------------------ */

const NEW_YORK = 'America/New_York'
const LONDON = 'Europe/London'
const LORD_HOWE = 'Australia/Lord_Howe'
const KARACHI = 'Asia/Karachi'

/** America/New_York, 2010-03-14: 02:00 local runs straight to 03:00, so every
 * local time in [02:00, 03:00) exists on no instant. The transition is
 * 07:00Z, and 8.6's first valid instant after the gap is that instant itself,
 * reading 03:00 local. */
const GAP = {
  zone: NEW_YORK,
  date: '2010-03-14',
  inside: '02:30',
  resolved: '2010-03-14T07:00:00.000Z',
  /** 11.9 records what raw Luxon answers instead: it advances by the gap's
   * length, so 02:30 becomes 03:30 local. */
  luxonRaw: '2010-03-14T07:30:00.000Z',
} as const

/** Europe/London, 2010-10-31: 02:00 BST falls back to 01:00 GMT, so every
 * local time in [01:00, 02:00) happens twice. 8.6 takes the earlier. */
const FOLD = {
  zone: LONDON,
  date: '2010-10-31',
  inside: '01:30',
  resolved: '2010-10-31T00:30:00.000Z',
  /** The instant 8.6 refuses, an hour later on the winter offset. */
  later: '2010-10-31T01:30:00.000Z',
} as const

/** Australia/Lord_Howe shifts by thirty minutes rather than an hour, which is
 * what makes it worth a case: a clamp that assumed the gap's width, or
 * rounded to the hour, passes every fixture above and fails both of these. */
const HALF_HOUR_GAP = {
  zone: LORD_HOWE,
  date: '2010-10-03',
  inside: '02:15',
  resolved: '2010-10-02T15:30:00.000Z',
} as const

const HALF_HOUR_FOLD = {
  zone: LORD_HOWE,
  date: '2010-04-04',
  inside: '01:45',
  resolved: '2010-04-03T14:45:00.000Z',
  later: '2010-04-03T15:15:00.000Z',
} as const

/** The wall clock a zone reads at an instant, through Luxon's total direction:
 * every instant has exactly one local time, so nothing here is a policy
 * choice and none of 11.15's hazard applies. */
function wallClockAt(zone: string, iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone).toFormat('yyyy-MM-dd HH:mm')
}

function offsetAt(zone: string, iso: string): number {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone).offset
}

function minus(iso: string, millis: number): string {
  return new Date(Date.parse(iso) - millis).toISOString()
}

describe('the fixtures are still what they were on this runtime', () => {
  test('the two hour-wide transitions', () => {
    expect(
      wallClockAt(GAP.zone, GAP.resolved),
      `${GAP.zone} must still read 03:00 at the transition, so every local time from 02:00 to 02:59 on ${GAP.date} exists on no instant`,
    ).toBe(`${GAP.date} 03:00`)
    expect(
      wallClockAt(GAP.zone, minus(GAP.resolved, 60_000)),
      'and 01:59 the minute before it',
    ).toBe(`${GAP.date} 01:59`)

    expect(
      wallClockAt(FOLD.zone, FOLD.resolved),
      `${FOLD.zone} must still read ${FOLD.inside} at the earlier instant`,
    ).toBe(`${FOLD.date} ${FOLD.inside}`)
    expect(
      wallClockAt(FOLD.zone, FOLD.later),
      'and the same wall clock again an hour later, which is what makes it ambiguous',
    ).toBe(`${FOLD.date} ${FOLD.inside}`)
  })

  test('the half-hour transitions of Australia/Lord_Howe', () => {
    expect(
      wallClockAt(HALF_HOUR_GAP.zone, HALF_HOUR_GAP.resolved),
      'the gap opens at 02:00 and closes at 02:30, so it is half an hour wide',
    ).toBe(`${HALF_HOUR_GAP.date} 02:30`)
    expect(
      offsetAt(HALF_HOUR_GAP.zone, HALF_HOUR_GAP.resolved) -
        offsetAt(HALF_HOUR_GAP.zone, minus(HALF_HOUR_GAP.resolved, 60_000)),
      'and the shift is still thirty minutes rather than sixty',
    ).toBe(30)

    expect(
      wallClockAt(HALF_HOUR_FOLD.zone, HALF_HOUR_FOLD.resolved),
      'the overlap runs 01:30 to 02:00, each local minute happening twice',
    ).toBe(`${HALF_HOUR_FOLD.date} ${HALF_HOUR_FOLD.inside}`)
    expect(
      wallClockAt(HALF_HOUR_FOLD.zone, HALF_HOUR_FOLD.later),
      'and again thirty minutes later',
    ).toBe(`${HALF_HOUR_FOLD.date} ${HALF_HOUR_FOLD.inside}`)
  })
})

/* ------------------------------------------------------------------ *
 * The two overrides, proven against the library
 * ------------------------------------------------------------------ */

describe('the two overrides, proven necessary against raw Luxon', () => {
  /*
  Section 13 item 25's standing obligation, and its revisit trigger is a Luxon
  upgrade: a raw behavior that moved toward 8.6 would make the override
  redundant, one that moved away could make it wrong, and either would be
  silent. Both cases assert the library and the module in one test for exactly
  that reason.
  */
  afterEach(() => {
    Settings.resetCaches()
  })

  test('a spring-forward gap: Luxon advances by the gap length, 8.6 clamps to the first valid instant', () => {
    const raw = DateTime.fromObject(
      { year: 2010, month: 3, day: 14, hour: 2, minute: 30 },
      { zone: GAP.zone },
    )
    expect(
      raw.toUTC().toISO(),
      '11.9 records this and it is measured here rather than recalled: Luxon answers a local time that is not the one it was asked for, 03:30, by advancing the gap length',
    ).toBe(GAP.luxonRaw)
    expect(
      raw.toFormat('yyyy-MM-dd HH:mm'),
      'which is the wall clock the caller never asked for',
    ).toBe('2010-03-14 03:30')

    const mine = resolveLocalTime(GAP.date, GAP.inside, GAP.zone)
    expect(mine.kind, '8.6 names this case and this module recognizes it').toBe('gap')
    expect(
      mine.instant.toISOString(),
      '8.6: a nonexistent local time resolves to the first valid instant after the gap, which is the transition itself at 03:00 local',
    ).toBe(GAP.resolved)
    expect(
      mine.instant.toISOString(),
      'and the two differ, which is what makes the override necessary rather than decorative',
    ).not.toBe(GAP.luxonRaw)
  })

  test('a fall-back overlap: Luxon answers a different instant depending on the process clock, 8.6 always takes the earlier', () => {
    /*
    "Undefined" is a stronger word here than 11.9 needed to spell out, and it
    is worth pinning because it is what makes reading the raw answer once and
    concluding "Luxon agrees" a trap. DateTime.fromObject seeds its search
    with the zone offset in force at Settings.now(), so the same ambiguous
    wall clock answers the earlier instant while the process clock sits in
    British Summer Time and the later one, the instant 8.6 refuses, while it
    sits in Greenwich Mean Time. A test that took whichever answer today
    produced would pass for half the year.
    */
    const rawAt = (nowIso: string): string => {
      const real = Settings.now
      try {
        Settings.now = () => Date.parse(nowIso)
        return DateTime.fromObject(
          { year: 2010, month: 10, day: 31, hour: 1, minute: 30 },
          { zone: FOLD.zone },
        )
          .toUTC()
          .toISO() as string
      } finally {
        Settings.now = real
      }
    }

    expect(
      rawAt('2026-01-15T12:00:00Z'),
      'with the process clock in GMT, raw Luxon answers the later of the two instants, which is the one 8.6 refuses',
    ).toBe(FOLD.later)
    expect(
      rawAt('2026-07-15T12:00:00Z'),
      'and with it in BST, the earlier one. The library is not choosing a rule, it is choosing whichever offset it is standing in',
    ).toBe(FOLD.resolved)

    const mine = resolveLocalTime(FOLD.date, FOLD.inside, FOLD.zone)
    expect(mine.kind, '8.6 names this case and this module recognizes it').toBe('fold')
    expect(
      mine.instant.toISOString(),
      '8.6: an ambiguous local time resolves to the earlier instant',
    ).toBe(FOLD.resolved)
    expect(mine.instant.toISOString(), 'and never the later one').not.toBe(FOLD.later)
  })

  test('this module never reads a process clock, so its answer cannot move under one', () => {
    // The other half of the case above. The library's answer changed between
    // two clocks; if this module's did too, the fold rule would be a
    // coincidence that happened to hold in the season the suite last ran.
    const answers = ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z'].map((nowIso) => {
      const real = Settings.now
      try {
        Settings.now = () => Date.parse(nowIso)
        return [
          resolveLocalTime(FOLD.date, FOLD.inside, FOLD.zone).instant.toISOString(),
          resolveLocalTime(GAP.date, GAP.inside, GAP.zone).instant.toISOString(),
        ].join(' ')
      } finally {
        Settings.now = real
      }
    })
    expect(answers[0], 'both rules are this module\'s own, computed from offsets alone').toBe(
      answers[1],
    )
    expect(answers[0]).toBe(`${FOLD.resolved} ${GAP.resolved}`)
  })
})

/* ------------------------------------------------------------------ *
 * The two rules on their own terms
 * ------------------------------------------------------------------ */

describe('a nonexistent local time resolves forward', () => {
  test('the answer is the transition instant, not an instant near it', () => {
    const resolved = resolveLocalTime(GAP.date, GAP.inside, GAP.zone)
    expect(resolved.instant.toISOString()).toBe(GAP.resolved)
    expect(
      offsetAt(GAP.zone, resolved.instant.toISOString()) -
        offsetAt(GAP.zone, minus(resolved.instant.toISOString(), 1)),
      'the millisecond before it is on the other side of the transition, which is what "first valid instant after the gap" means',
    ).toBe(60)
  })

  test('every local time inside the gap resolves to the same instant', () => {
    for (const time of ['02:00', '02:01', '02:30', '02:59']) {
      const resolved = resolveLocalTime(GAP.date, time, GAP.zone)
      expect(resolved.kind, `${time} is inside the gap`).toBe('gap')
      expect(
        resolved.instant.toISOString(),
        'the gap has one exit and every local time inside it leaves by that exit',
      ).toBe(GAP.resolved)
    }
  })

  test('ordinary local times on the transition date are untouched', () => {
    // A module resolving every local time on a transition date to the
    // transition instant satisfies the criterion above and fails here.
    const before = resolveLocalTime(GAP.date, '01:59', GAP.zone)
    expect(before.kind).toBe('exact')
    expect(before.instant.toISOString()).toBe('2010-03-14T06:59:00.000Z')

    const first = resolveLocalTime(GAP.date, '03:00', GAP.zone)
    expect(first.kind, '03:00 is the first local time the gap admits, and it exists').toBe(
      'exact',
    )
    expect(
      first.instant.toISOString(),
      'and it is its own instant, which is also the one 02:30 resolves to: the rule says the first valid instant after the gap rather than some instant near it',
    ).toBe(GAP.resolved)

    const later = resolveLocalTime(GAP.date, '23:30', GAP.zone)
    expect(later.kind).toBe('exact')
    expect(later.instant.toISOString()).toBe('2010-03-15T03:30:00.000Z')
  })

  test('a half-hour gap resolves by the same rule and not by the hour', () => {
    const resolved = resolveLocalTime(
      HALF_HOUR_GAP.date,
      HALF_HOUR_GAP.inside,
      HALF_HOUR_GAP.zone,
    )
    expect(resolved.kind).toBe('gap')
    expect(
      resolved.instant.toISOString(),
      'the answer is found by bisection rather than by adding the transition\'s expected width, so a thirty-minute shift needs no special case',
    ).toBe(HALF_HOUR_GAP.resolved)
  })
})

describe('an ambiguous local time resolves to the earlier instant', () => {
  test('both instants exist and the earlier one is chosen', () => {
    const resolved = resolveLocalTime(FOLD.date, FOLD.inside, FOLD.zone)
    expect(resolved.kind).toBe('fold')
    expect(resolved.instant.toISOString()).toBe(FOLD.resolved)
    expect(
      wallClockAt(FOLD.zone, FOLD.later),
      'the refused instant carries the same wall clock, which is the whole difficulty',
    ).toBe(wallClockAt(FOLD.zone, FOLD.resolved))
    expect(
      Date.parse(FOLD.resolved) < Date.parse(FOLD.later),
      'and the chosen one is the earlier',
    ).toBe(true)
  })

  test('every local time inside the overlap takes the earlier reading', () => {
    for (const [time, expected] of [
      ['01:00', '2010-10-31T00:00:00.000Z'],
      ['01:30', '2010-10-31T00:30:00.000Z'],
      ['01:59', '2010-10-31T00:59:00.000Z'],
    ] as const) {
      const resolved = resolveLocalTime(FOLD.date, time, FOLD.zone)
      expect(resolved.kind, `${time} is inside the overlap`).toBe('fold')
      expect(resolved.instant.toISOString()).toBe(expected)
    }
  })

  test('ordinary local times on the fall-back date are untouched', () => {
    const before = resolveLocalTime(FOLD.date, '00:59', FOLD.zone)
    expect(before.kind).toBe('exact')
    expect(before.instant.toISOString(), 'still on the summer offset').toBe(
      '2010-10-30T23:59:00.000Z',
    )

    const after = resolveLocalTime(FOLD.date, '02:00', FOLD.zone)
    expect(after.kind, '02:00 happens once, the overlap having closed').toBe('exact')
    expect(after.instant.toISOString()).toBe('2010-10-31T02:00:00.000Z')
  })

  test('a half-hour overlap resolves by the same rule', () => {
    const resolved = resolveLocalTime(
      HALF_HOUR_FOLD.date,
      HALF_HOUR_FOLD.inside,
      HALF_HOUR_FOLD.zone,
    )
    expect(resolved.kind).toBe('fold')
    expect(resolved.instant.toISOString()).toBe(HALF_HOUR_FOLD.resolved)
    expect(resolved.instant.toISOString()).not.toBe(HALF_HOUR_FOLD.later)
  })
})

/* ------------------------------------------------------------------ *
 * 8.6's two arms
 * ------------------------------------------------------------------ */

describe("8.6's offset arm", () => {
  test('the instant is the due time minus the offset, in the assignee zone', () => {
    // AC-083's shape, computed here without a database: Karachi is UTC+5 and
    // has observed no DST since 2009, so this case measures the arithmetic and
    // nothing else.
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: '15:00',
        offsetMinutes: 30,
        timeOfDay: null,
      }).toISOString(),
    ).toBe('2026-07-28T09:30:00.000Z')
  })

  test('an offset of zero fires at the due time itself', () => {
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: '15:00',
        offsetMinutes: 0,
        timeOfDay: null,
      }).toISOString(),
    ).toBe('2026-07-28T10:00:00.000Z')
  })

  test('the subtraction crosses into earlier dates, 4.8 allowing seven days', () => {
    // The subtraction happens in wall-clock arithmetic, where a date has no
    // length, so nothing about it depends on the zone until it is resolved.
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: '00:15',
        offsetMinutes: 30,
        timeOfDay: null,
      }).toISOString(),
      'thirty minutes before quarter past midnight is the previous evening',
    ).toBe('2026-07-27T18:45:00.000Z')
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: '15:00',
        offsetMinutes: 10_080,
        timeOfDay: null,
      }).toISOString(),
      '4.8 caps the offset at 10080 minutes, which is seven days, so the wall clock is unchanged and only the date moves',
    ).toBe('2026-07-21T10:00:00.000Z')
  })

  test('the subtraction happens before the zone, so it can land inside a gap', () => {
    // AC-144's second arm. Subtracting from the instant instead would step
    // over the gap and never meet the rule, which is why 8.6 writes the two
    // steps in this order and why this module performs them in it.
    const resolved = resolveFireAt({
      zone: GAP.zone,
      dueDate: GAP.date,
      dueTime: '03:00',
      offsetMinutes: 30,
      timeOfDay: null,
    })
    expect(resolved.kind, '03:00 minus thirty minutes is 02:30, which does not exist').toBe(
      'gap',
    )
    expect(
      resolved.instant.toISOString(),
      'and both arms of 8.6 resolve the same nonexistent local time the same way',
    ).toBe(GAP.resolved)
  })

  test('crossing a transition backwards keeps wall-clock arithmetic, not elapsed time', () => {
    // 8.6 subtracts from the wall clock, so a reminder set two hours before a
    // 03:30 deadline on a spring-forward morning names 01:30 local, which
    // exists and is only ninety minutes of real time earlier. That is the
    // floating-time model of 8.1 and not an error.
    const resolved = resolveFireAt({
      zone: GAP.zone,
      dueDate: GAP.date,
      dueTime: '03:30',
      offsetMinutes: 120,
      timeOfDay: null,
    })
    expect(resolved.kind).toBe('exact')
    expect(resolved.instant.toISOString()).toBe('2010-03-14T06:30:00.000Z')
  })
})

describe("8.6's date-only arm", () => {
  test('the instant is the reminder time of day on the due date', () => {
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: null,
        offsetMinutes: null,
        timeOfDay: '09:00',
      }).toISOString(),
    ).toBe('2026-07-28T04:00:00.000Z')
  })

  test('it computes against a zone that is not a whole number of hours off UTC', () => {
    expect(
      computeFireAt({
        zone: 'Asia/Kathmandu',
        dueDate: '2026-07-28',
        dueTime: null,
        offsetMinutes: null,
        timeOfDay: '09:00',
      }).toISOString(),
      'Nepal is UTC+05:45, and an implementation that carried offsets in whole hours would be out by fifteen minutes',
    ).toBe('2026-07-28T03:15:00.000Z')
  })

  test('it reaches the two policy rules too', () => {
    expect(
      resolveFireAt({
        zone: GAP.zone,
        dueDate: GAP.date,
        dueTime: null,
        offsetMinutes: null,
        timeOfDay: GAP.inside,
      }).instant.toISOString(),
    ).toBe(GAP.resolved)
    expect(
      resolveFireAt({
        zone: FOLD.zone,
        dueDate: FOLD.date,
        dueTime: null,
        offsetMinutes: null,
        timeOfDay: FOLD.inside,
      }).instant.toISOString(),
    ).toBe(FOLD.resolved)
  })

  test('a task that happens to carry a due_time is still computed, not refused', () => {
    // 4.8 makes time_of_day the mode for a task without a due_time and calls
    // that guard the API's, restated at every write. This arm can compute
    // either way, and refusing what it can compute would turn a missing guard
    // somewhere else into a failure here.
    expect(
      computeFireAt({
        zone: KARACHI,
        dueDate: '2026-07-28',
        dueTime: '15:00',
        offsetMinutes: null,
        timeOfDay: '09:00',
      }).toISOString(),
    ).toBe('2026-07-28T04:00:00.000Z')
  })
})

/* ------------------------------------------------------------------ *
 * What it refuses
 * ------------------------------------------------------------------ */

describe('inputs 8.6 cannot compute from', () => {
  const base = {
    zone: KARACHI,
    dueDate: '2026-07-28',
    dueTime: '15:00',
  } as const

  test('an offset reminder on a task with no due_time', () => {
    // The one refusal with a live route to it: PATCH /tasks/:id may clear
    // due_time alone, and no section says what that does to an offset
    // reminder. Guessing invents policy in either direction, so this refuses
    // and the question is escalated.
    expect(() =>
      computeFireAt({ ...base, dueTime: null, offsetMinutes: 30, timeOfDay: null }),
    ).toThrow(/requires the task's due_time/)
  })

  test('both modes at once, or neither, which 4.8 forbids as a CHECK', () => {
    expect(() =>
      computeFireAt({ ...base, offsetMinutes: 30, timeOfDay: '09:00' }),
    ).toThrow(/carries both/)
    expect(() =>
      computeFireAt({ ...base, offsetMinutes: null, timeOfDay: null }),
    ).toThrow(/carries neither/)
  })

  test('a malformed date or wall time, rather than a plausible wrong instant', () => {
    expect(() =>
      computeFireAt({ ...base, dueDate: '28-07-2026', offsetMinutes: 30, timeOfDay: null }),
    ).toThrow(/calendar date/)
    expect(() =>
      computeFireAt({ ...base, dueTime: '9:00', offsetMinutes: 30, timeOfDay: null }),
    ).toThrow(/HH:MM/)
    expect(() =>
      computeFireAt({ ...base, dueTime: '25:00', offsetMinutes: 30, timeOfDay: null }),
    ).toThrow(/minute-precision/)
    expect(
      () => computeFireAt({ ...base, dueTime: '15:00:30', offsetMinutes: 30, timeOfDay: null }),
      '4.11 makes both time columns minute precision, and dropping a seconds field would move a fire instant silently',
    ).toThrow(/minute-precision/)
  })

  test('a seconds field the driver rendered is accepted when it is zero', () => {
    expect(
      computeFireAt({ ...base, dueTime: '15:00:00', offsetMinutes: 30, timeOfDay: null })
        .toISOString(),
      'a TIME column read without to_char renders HH:MM:SS on both drivers, and that is the same time',
    ).toBe('2026-07-28T09:30:00.000Z')
  })

  test('a zone the runtime does not know, and an offset identifier that is not one', () => {
    expect(() =>
      computeFireAt({ ...base, zone: 'Mars/Olympus_Mons', offsetMinutes: 30, timeOfDay: null }),
    ).toThrow(/valid IANA timezone/)
    expect(
      () => computeFireAt({ ...base, zone: '+05:00', offsetMinutes: 30, timeOfDay: null }),
      "11.15: Intl accepts ECMA-402 offset identifiers that are not IANA names, and the shared validator's sign guard is what closes that hole",
    ).toThrow(/valid IANA timezone/)
  })
})

/* ------------------------------------------------------------------ *
 * Properties that hold without an oracle
 * ------------------------------------------------------------------ */

describe('properties, swept over stable zones and historical dates', () => {
  /*
  No oracle is available (item 25), but the rules are self-checking against
  the total direction: a resolved instant either carries the wall clock it was
  asked for or is the first instant of a gap the wall clock fell into, and
  which of the two it is was already reported. This is what stops the sweep
  from re-implementing the module in order to check it.
  */
  const ZONES = [
    'UTC',
    KARACHI,
    'Asia/Kathmandu',
    NEW_YORK,
    LONDON,
    LORD_HOWE,
    'Europe/Amsterdam',
    'Australia/Sydney',
    'Africa/Nairobi',
  ]
  const TIMES = ['00:00', '00:30', '01:30', '02:15', '02:30', '03:00', '12:00', '23:59']

  function datesOf(month: string): string[] {
    const days: string[] = []
    for (let day = 1; day <= 31; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`
      if (new Date(`${date}T00:00:00Z`).toISOString().startsWith(date)) days.push(date)
    }
    return days
  }

  // Two transition months plus one with no transition anywhere, all historical.
  const DATES = [
    ...datesOf('2010-03'),
    ...datesOf('2010-04'),
    ...datesOf('2010-06'),
    ...datesOf('2010-10'),
    ...datesOf('2010-11'),
  ]

  test('every resolution is one of the three cases, and each case means what it says', () => {
    let gaps = 0
    let folds = 0
    for (const zone of ZONES) {
      for (const date of DATES) {
        for (const time of TIMES) {
          const resolved = resolveLocalTime(date, time, zone)
          const asked = `${date} ${time}`
          const readBack = wallClockAt(zone, resolved.instant.toISOString())

          if (resolved.kind === 'gap') {
            gaps += 1
            expect(
              readBack > asked,
              `${asked} in ${zone} was reported as a gap, so its instant must read a later wall clock`,
            ).toBe(true)
            const justBefore = wallClockAt(
              zone,
              minus(resolved.instant.toISOString(), 60_000),
            )
            expect(
              justBefore < asked,
              `and the minute before it must read an earlier one, or this is not the first valid instant after the gap`,
            ).toBe(true)
            continue
          }

          expect(readBack, `${asked} in ${zone} must read back as itself`).toBe(asked)
          expect(
            wallClockAt(zone, minus(resolved.instant.toISOString(), 60_000)) < asked,
            `and the minute before it must read earlier, or ${asked} in ${zone} was not resolved to the earliest instant carrying it`,
          ).toBe(true)
          if (resolved.kind !== 'fold') continue

          folds += 1
          // The second reading must exist, and must be the later one. Where it
          // sits follows from the two offsets: the same wall clock recurs once
          // the zone has given back the difference between them.
          const here = offsetAt(zone, resolved.instant.toISOString())
          const after = offsetAt(
            zone,
            new Date(resolved.instant.getTime() + 86_400_000).toISOString(),
          )
          const other = new Date(
            resolved.instant.getTime() + (here - after) * 60_000,
          ).toISOString()
          expect(
            wallClockAt(zone, other),
            `${asked} in ${zone} was reported ambiguous, so a strictly later instant must carry the same wall clock`,
          ).toBe(asked)
          expect(Date.parse(other) > resolved.instant.getTime()).toBe(true)
        }
      }
    }
    expect(gaps, 'the sweep must actually meet gaps, or it proves nothing about them').toBeGreaterThan(0)
    expect(folds, 'and folds').toBeGreaterThan(0)
  })

  test('resolution is deterministic and idempotent', () => {
    for (const zone of ZONES) {
      for (const date of ['2010-03-14', '2010-10-31', '2010-06-15']) {
        for (const time of TIMES) {
          const first = resolveLocalTime(date, time, zone)
          const second = resolveLocalTime(date, time, zone)
          expect(second.instant.toISOString()).toBe(first.instant.toISOString())
          expect(second.kind).toBe(first.kind)
        }
      }
    }
  })
})
