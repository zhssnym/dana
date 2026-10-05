/*
The iterator against the dates the specification and RFC 5545 name.

These are the cases whose answers are written down somewhere: 8.5's four
worked examples, 4.11's inclusive UNTIL, the short-month skip the RFC
requires, and 4.11's leap-year rule: the points where a wrong answer would
be a wrong reading of a sentence rather than a wrong loop.
*/
import { describe, expect, test } from 'vitest'

import { instancesInRange, nextInstance, parseStoredRule } from './recurrence.js'

/** 8.5's weekly Monday rule, the rule all four worked examples use. */
const MONDAY = 'FREQ=WEEKLY;BYDAY=MO'

describe('8.5\'s worked examples, at the dates 8.5 writes them', () => {
  // Each line is the section's own: cutoff = max(due_date, today in the
  // actor's zone), and nextInstance takes it from there. Generation computes
  // the cutoff (generation.ts); these fix what the iterator answers for it.
  test('on time: due 2026-07-20, completed 2026-07-20, cutoff 07-20', () => {
    expect(nextInstance(MONDAY, '2026-07-20', '2026-07-20')).toBe('2026-07-27')
  })

  test('late with slots skipped: cutoff 2026-07-28, and 07-27 is not offered', () => {
    expect(
      nextInstance(MONDAY, '2026-07-20', '2026-07-28'),
      'the 07-27 slot is skipped and the calendar shows an honest gap',
    ).toBe('2026-08-03')
  })

  test('early with alignment kept: due 07-27, completed 07-25, cutoff 07-27', () => {
    expect(nextInstance(MONDAY, '2026-07-27', '2026-07-27')).toBe('2026-08-03')
  })

  test('daily late without pile-up: due 07-20, cutoff 07-24', () => {
    expect(
      nextInstance('FREQ=DAILY', '2026-07-20', '2026-07-24'),
      'one instance strictly after the cutoff, never one per missed day',
    ).toBe('2026-07-25')
  })
})

describe('UNTIL is inclusive, and bounds the series out', () => {
  test('an instance equal to UNTIL is valid; the next one is not', () => {
    expect(
      nextInstance(`${MONDAY};UNTIL=20260803`, '2026-07-27', '2026-07-27'),
      '4.11 and RFC 5545: an instance equal to UNTIL is valid',
    ).toBe('2026-08-03')
    expect(
      nextInstance(`${MONDAY};UNTIL=20260803`, '2026-08-03', '2026-08-03'),
      'and the next one is not, which is 8.5\'s null: the rule stays on the row',
    ).toBeNull()
  })

  test('an UNTIL between two instances ends the series at the earlier one', () => {
    expect(nextInstance(`${MONDAY};UNTIL=20260805`, '2026-08-03', '2026-08-03'))
      .toBeNull()
  })

  test('an UNTIL before the anchor yields nothing at all', () => {
    expect(nextInstance(`${MONDAY};UNTIL=20260701`, '2026-07-27', '2026-07-27'))
      .toBeNull()
    expect(
      instancesInRange(
        `FREQ=DAILY;UNTIL=20260701`,
        '2026-07-27',
        '2026-07-01',
        '2026-12-31',
      ),
    ).toEqual([])
  })
})

describe('FREQ and INTERVAL', () => {
  test('daily with an interval counts from the anchor', () => {
    expect(
      instancesInRange('FREQ=DAILY;INTERVAL=3', '2026-07-20', '2026-07-20', '2026-08-02'),
    ).toEqual([
      '2026-07-20',
      '2026-07-23',
      '2026-07-26',
      '2026-07-29',
      '2026-08-01',
    ])
  })

  test('weekly without BYDAY repeats the anchor\'s own weekday', () => {
    expect(
      instancesInRange('FREQ=WEEKLY', '2026-07-22', '2026-07-01', '2026-08-15'),
      'a Wednesday anchor gives Wednesdays, DTSTART being the whole of the day selection',
    ).toEqual(['2026-07-22', '2026-07-29', '2026-08-05', '2026-08-12'])
  })

  test('weekly with several days gives them in date order inside each week', () => {
    expect(
      instancesInRange(
        'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        '2026-07-20',
        '2026-07-20',
        '2026-07-31',
      ),
    ).toEqual([
      '2026-07-20',
      '2026-07-22',
      '2026-07-24',
      '2026-07-27',
      '2026-07-29',
      '2026-07-31',
    ])
  })

  test('weekly interval 2 counts weeks from Monday, so a Sunday belongs to the week before it', () => {
    // WKST defaults to MO and the subset cannot set it. 2026-07-19 is a
    // Sunday, so its week began Monday 2026-07-13; the next selected week
    // therefore starts 2026-07-27 rather than 2026-07-26.
    expect(
      instancesInRange(
        'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
        '2026-07-19',
        '2026-07-19',
        '2026-09-01',
      ),
    ).toEqual(['2026-07-19', '2026-08-02', '2026-08-16', '2026-08-30'])
  })

  test('weekly interval 2 across a week boundary keeps both days in one week', () => {
    expect(
      instancesInRange(
        'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU',
        '2026-07-18',
        '2026-07-01',
        '2026-08-10',
      ),
      'Saturday 07-18 and Sunday 07-19 share a Monday-started week, so both fall in the anchor\'s week and the pair repeats a fortnight later',
    ).toEqual(['2026-07-18', '2026-07-19', '2026-08-01', '2026-08-02'])
  })
})

describe('months that are too short skip, and never move', () => {
  test('a bare monthly rule anchored on the 31st', () => {
    // 4.11 excludes BYMONTHDAY 29 to 31 to avoid this, but the anchor is a
    // due_date rather than a rule part, so the RFC's rule still applies here.
    expect(
      instancesInRange('FREQ=MONTHLY', '2026-01-31', '2026-01-01', '2026-12-31'),
    ).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ])
  })

  test('a bare monthly rule anchored on the 30th skips only February', () => {
    expect(
      instancesInRange('FREQ=MONTHLY', '2026-01-30', '2026-01-01', '2026-05-01'),
    ).toEqual(['2026-01-30', '2026-03-30', '2026-04-30'])
  })

  test('BYMONTHDAY 1 to 28 exists in every month, which is why 4.11 stops there', () => {
    expect(
      instancesInRange(
        'FREQ=MONTHLY;BYMONTHDAY=28',
        '2026-01-15',
        '2026-01-01',
        '2026-04-01',
      ),
      'the anchor is the 15th and the rule the 28th, so the first instance is the 28th of the anchor\'s own month',
    ).toEqual(['2026-01-28', '2026-02-28', '2026-03-28'])
  })

  test('BYMONTHDAY behind the anchor starts in the next selected month', () => {
    expect(
      instancesInRange(
        'FREQ=MONTHLY;BYMONTHDAY=5;INTERVAL=2',
        '2026-01-15',
        '2026-01-01',
        '2026-08-01',
      ),
      'a recurrence set does not reach behind DTSTART, and interval counts months from the anchor\'s month',
    ).toEqual(['2026-03-05', '2026-05-05', '2026-07-05'])
  })
})

describe('29 February is a leap-year rule', () => {
  test('a yearly rule anchored there occurs only in leap years', () => {
    expect(
      instancesInRange('FREQ=YEARLY', '2028-02-29', '2028-01-01', '2041-01-01'),
      'RFC 5545 behavior: the common years are skipped, not moved to the 28th',
    ).toEqual(['2028-02-29', '2032-02-29', '2036-02-29', '2040-02-29'])
  })

  test('the century rule is the tzdb-free part of the same arithmetic', () => {
    expect(
      instancesInRange('FREQ=YEARLY', '2096-02-29', '2096-01-01', '2110-01-01'),
      '2100 is not a leap year, so the gap is eight years rather than four',
    ).toEqual(['2096-02-29', '2104-02-29', '2108-02-29'])
  })

  test('a yearly rule anywhere else keeps its month and day', () => {
    expect(
      instancesInRange(
        'FREQ=YEARLY;INTERVAL=2',
        '2026-07-27',
        '2026-01-01',
        '2031-01-01',
      ),
    ).toEqual(['2026-07-27', '2028-07-27', '2030-07-27'])
  })
})

describe('the range and the anchor bound the answer', () => {
  test('instances behind the anchor are not in the recurrence set', () => {
    expect(
      instancesInRange(MONDAY, '2026-07-27', '2026-06-01', '2026-08-10'),
      'the rule matches every Monday of June and July, and the series began on the 27th',
    ).toEqual(['2026-07-27', '2026-08-03', '2026-08-10'])
  })

  test('both ends of the range are inclusive', () => {
    expect(instancesInRange(MONDAY, '2026-07-06', '2026-07-13', '2026-07-27')).toEqual([
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
    ])
  })

  test('an inverted range yields nothing rather than everything', () => {
    expect(instancesInRange(MONDAY, '2026-07-06', '2026-07-27', '2026-07-13')).toEqual(
      [],
    )
  })

  test('a range far ahead of the anchor is answered without walking to it', () => {
    // A daily rule anchored twenty years back, projected into one week: the
    // seek is arithmetic rather than a walk, and a projection that walked
    // would still be answering when the request timed out.
    const started = Date.now()
    expect(
      instancesInRange('FREQ=DAILY', '2006-01-01', '2026-07-27', '2026-08-02'),
    ).toHaveLength(7)
    expect(Date.now() - started).toBeLessThan(200)
  })

  test('nextInstance takes an after behind the anchor and still starts at the anchor', () => {
    expect(nextInstance(MONDAY, '2026-07-27', '2026-01-01')).toBe('2026-07-27')
  })
})

describe('what a stored rule must be', () => {
  test('a rule outside the subset is corruption and says so', () => {
    expect(() => nextInstance('FREQ=HOURLY', '2026-07-20', '2026-07-20')).toThrow(
      /4\.11 subset/,
    )
    expect(() => parseStoredRule('every monday')).toThrow(/4\.11 subset/)
  })

  test('a malformed anchor or cutoff is refused rather than guessed', () => {
    expect(() => nextInstance(MONDAY, '2026-7-20', '2026-07-20')).toThrow(TypeError)
    expect(() => nextInstance(MONDAY, '2026-07-20', 'today')).toThrow(TypeError)
    expect(() =>
      instancesInRange(MONDAY, '2026-07-20', '2026-02-30', '2026-08-01'),
    ).toThrow(TypeError)
  })

  test('parseStoredRule resolves the defaults the iterator reads', () => {
    expect(parseStoredRule('FREQ=MONTHLY')).toEqual({
      freq: 'MONTHLY',
      interval: 1,
      byDay: null,
      byMonthDay: null,
      until: null,
    })
  })
})
