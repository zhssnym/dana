/*
The differential oracle suite: our iterator against rrule 2.8.1.

11.9 makes rrule a development-time oracle and nothing else, for the reasons
11.14 records: it is unmaintained, and it models results as reinterpreted UTC
Dates, which is precisely the collision with floating dates that keeps it out
of the running code. Here that model is harmless, because both sides are read
back through their UTC fields and never compared as instants.

**Where they disagree, RFC 5545 adjudicates, never the oracle** (section 13
item 4, and this role's Escalate-when). A divergence is not a licence to
change the iterator to match: it is a reading of the RFC to be settled, and
recorded in section 13 by the Integration Steward if it stands.

**The oracle parses our own string.** Feeding it RRule.parseString rather than
building its options from our parse is deliberate, and 11.9's UNTIL paragraph
names the reason: if this file translated our grammar into the oracle's
options, the two would share whatever assumption the translation made, and
that is exactly where a divergence the oracle exists to reveal would hide.
The rules below are therefore strings, and each side reads its own.

Two things this file cannot check, both by construction rather than by
omission. rrule has no notion of our floor at the anchor beyond DTSTART, so
every case here is bounded by the anchor on both sides; and the subset's
refusals are the grammar module's tests, since a string rrule accepts and
4.11 does not is not a disagreement about calendars.
*/
import { RRule } from 'rrule'
import { describe, expect, test } from 'vitest'

import { addDays } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { instancesInRange, nextInstance } from './recurrence.js'

/** A calendar date as the UTC midnight rrule reads its input at. */
function utcOf(date: CalendarDate): Date {
  const at = new Date(0)
  at.setUTCFullYear(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  at.setUTCHours(0, 0, 0, 0)
  return at
}

/** And back, through the UTC fields, which is the only reading of an rrule
 * result that means anything for a floating date. */
function dateOf(at: Date): CalendarDate {
  return [
    String(at.getUTCFullYear()).padStart(4, '0'),
    String(at.getUTCMonth() + 1).padStart(2, '0'),
    String(at.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function oracleFor(rule: string, anchor: CalendarDate): RRule {
  return new RRule({ ...RRule.parseString(rule), dtstart: utcOf(anchor) })
}

function oracleNext(
  rule: string,
  anchor: CalendarDate,
  after: CalendarDate,
): CalendarDate | null {
  const found = oracleFor(rule, anchor).after(utcOf(after), false)
  return found === null ? null : dateOf(found)
}

function oracleRange(
  rule: string,
  anchor: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): CalendarDate[] {
  return oracleFor(rule, anchor)
    .between(utcOf(start), utcOf(end), true)
    .map(dateOf)
}

/* ------------------------------------------------------------------ *
 * The space to sweep
 * ------------------------------------------------------------------ */

/** Every shape the 4.11 subset can take, written as the strings the preset
 * builder would produce. */
const RULES: readonly string[] = [
  'FREQ=DAILY',
  'FREQ=DAILY;INTERVAL=2',
  'FREQ=DAILY;INTERVAL=3',
  'FREQ=DAILY;INTERVAL=7',
  'FREQ=DAILY;INTERVAL=99',
  'FREQ=WEEKLY',
  'FREQ=WEEKLY;INTERVAL=2',
  'FREQ=WEEKLY;INTERVAL=5',
  'FREQ=WEEKLY;BYDAY=MO',
  'FREQ=WEEKLY;BYDAY=SU',
  'FREQ=WEEKLY;BYDAY=SA,SU',
  'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE',
  'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU',
  'FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,SU',
  'FREQ=MONTHLY',
  'FREQ=MONTHLY;INTERVAL=2',
  'FREQ=MONTHLY;INTERVAL=12',
  'FREQ=MONTHLY;BYMONTHDAY=1',
  'FREQ=MONTHLY;BYMONTHDAY=15',
  'FREQ=MONTHLY;BYMONTHDAY=28',
  'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5',
  'FREQ=YEARLY',
  'FREQ=YEARLY;INTERVAL=2',
  'FREQ=YEARLY;INTERVAL=4',
]

/**
 * Anchors chosen where calendars are awkward: the ends of long and short
 * months, both leap-day cases, the Sunday and Monday that sit either side of
 * a Monday-started week, and a plain midweek date to keep the ordinary case
 * in the sweep.
 */
const ANCHORS: readonly CalendarDate[] = [
  '2026-01-31',
  '2026-01-30',
  '2026-01-29',
  '2026-02-28',
  '2026-03-01',
  '2026-04-30',
  '2026-07-19', // Sunday
  '2026-07-20', // Monday
  '2026-07-22', // Wednesday
  '2026-12-31',
  '2028-02-29', // leap day
  '2027-02-28',
  '2024-02-29',
]

/** Offsets from the anchor, in days, for the cutoff a generation would pass:
 * before it, on it, just after it, and far enough past to skip slots. */
const PROBES: readonly number[] = [-10, -1, 0, 1, 2, 6, 7, 8, 29, 31, 60, 200, 400]

/** Ranges relative to the anchor, as [offset, span]. The 41-day spans are
 * the padded month grid 9.5 gives a month zoom; the short ones catch the
 * bounds. */
const RANGES: readonly (readonly [number, number])[] = [
  [-30, 41],
  [0, 41],
  [1, 41],
  [60, 41],
  [400, 41],
  [0, 0],
  [0, 1],
  [7, 3],
]

function label(
  rule: string,
  anchor: CalendarDate,
  what: string,
): string {
  return `${rule} anchored ${anchor}, ${what}`
}

describe('the iterator agrees with rrule 2.8.1 on the next instance', () => {
  test('across every rule, anchor and cutoff in the sweep', () => {
    const divergent: string[] = []
    for (const rule of RULES) {
      for (const anchor of ANCHORS) {
        for (const offset of PROBES) {
          const after = addDays(anchor, offset)
          const mine = nextInstance(rule, anchor, after)
          const theirs = oracleNext(rule, anchor, after)
          if (mine !== theirs) {
            divergent.push(
              `${label(rule, anchor, `after ${after}`)}: ours ${String(mine)}, oracle ${String(theirs)}`,
            )
          }
        }
      }
    }
    expect(
      divergent,
      'a divergence is adjudicated against RFC 5545 and recorded in section 13 (item 4), never absorbed by editing the iterator to match',
    ).toEqual([])
  })
})

describe('the iterator agrees with rrule 2.8.1 on a range', () => {
  test('across every rule, anchor and range in the sweep', () => {
    const divergent: string[] = []
    for (const rule of RULES) {
      for (const anchor of ANCHORS) {
        for (const [offset, span] of RANGES) {
          const start = addDays(anchor, offset)
          const end = addDays(start, span)
          const mine = instancesInRange(rule, anchor, start, end)
          const theirs = oracleRange(rule, anchor, start, end)
          if (mine.join(',') !== theirs.join(',')) {
            divergent.push(
              `${label(rule, anchor, `${start} to ${end}`)}: ours [${mine.join(',')}], oracle [${theirs.join(',')}]`,
            )
          }
        }
      }
    }
    expect(divergent, 'see the note on adjudication above').toEqual([])
  })
})

describe('UNTIL bounds both sides the same way', () => {
  test('inclusive at the bound, and empty past it', () => {
    const divergent: string[] = []
    for (const rule of RULES) {
      for (const anchor of ANCHORS) {
        for (const untilOffset of [0, 1, 7, 28, 90, 370]) {
          const untilDate = addDays(anchor, untilOffset)
          const bounded = `${rule};UNTIL=${untilDate.replace(/-/g, '')}`
          for (const offset of [-1, 0, 1, 27, 89, 369, 400]) {
            const after = addDays(anchor, offset)
            const mine = nextInstance(bounded, anchor, after)
            const theirs = oracleNext(bounded, anchor, after)
            if (mine !== theirs) {
              divergent.push(
                `${label(bounded, anchor, `after ${after}`)}: ours ${String(mine)}, oracle ${String(theirs)}`,
              )
            }
          }
          const mine = instancesInRange(
            bounded,
            anchor,
            addDays(anchor, -5),
            addDays(anchor, 400),
          )
          const theirs = oracleRange(
            bounded,
            anchor,
            addDays(anchor, -5),
            addDays(anchor, 400),
          )
          if (mine.join(',') !== theirs.join(',')) {
            divergent.push(
              `${label(bounded, anchor, 'the whole bounded set')}: ours [${mine.join(',')}], oracle [${theirs.join(',')}]`,
            )
          }
        }
      }
    }
    expect(
      divergent,
      '4.11 and RFC 5545 both make UNTIL inclusive, so an instance equal to the bound is valid on both sides',
    ).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * The property sweep
 * ------------------------------------------------------------------ */

/**
 * A seeded generator, so a failure names a case that can be run again.
 * Vitest has no property-testing dependency and this file is not the place to
 * add one: the space the 4.11 subset spans is small enough to sample by hand,
 * and a fixed seed is what makes a divergence reproducible.
 */
function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

function randomRule(next: () => number): string {
  const freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'][
    Math.floor(next() * 4)
  ] as string
  const parts = [`FREQ=${freq}`]
  if (next() < 0.7) {
    parts.push(`INTERVAL=${String(1 + Math.floor(next() * 99))}`)
  }
  if (freq === 'WEEKLY' && next() < 0.75) {
    const days = WEEKDAYS.filter(() => next() < 0.4)
    parts.push(`BYDAY=${(days.length === 0 ? ['TH'] : days).join(',')}`)
  }
  if (freq === 'MONTHLY' && next() < 0.5) {
    parts.push(`BYMONTHDAY=${String(1 + Math.floor(next() * 28))}`)
  }
  return parts.join(';')
}

describe('the property sweep', () => {
  test('2000 random rules, anchors and cutoffs agree with the oracle', () => {
    const next = prng(20_260_810)
    const divergent: string[] = []
    for (let case_ = 0; case_ < 2_000; case_ += 1) {
      const rule = randomRule(next)
      // Anchors across four years and both leap cases, so the sweep reaches
      // dates the fixed list does not name.
      const anchor = addDays('2024-01-01', Math.floor(next() * 1_600))
      const after = addDays(anchor, Math.floor(next() * 800) - 30)
      const mine = nextInstance(rule, anchor, after)
      const theirs = oracleNext(rule, anchor, after)
      if (mine !== theirs) {
        divergent.push(
          `${label(rule, anchor, `after ${after}`)}: ours ${String(mine)}, oracle ${String(theirs)}`,
        )
      }
      const start = addDays(anchor, Math.floor(next() * 400) - 40)
      const end = addDays(start, Math.floor(next() * 62))
      const mineRange = instancesInRange(rule, anchor, start, end)
      const theirsRange = oracleRange(rule, anchor, start, end)
      if (mineRange.join(',') !== theirsRange.join(',')) {
        divergent.push(
          `${label(rule, anchor, `${start} to ${end}`)}: ours [${mineRange.join(',')}], oracle [${theirsRange.join(',')}]`,
        )
      }
    }
    expect(
      divergent.slice(0, 20),
      'the seed is fixed, so any case printed here reruns exactly',
    ).toEqual([])
  })
})
