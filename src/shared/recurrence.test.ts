/*
The 4.11 subset, from both sides.

The refusals matter less than they look: a validator that refuses everything
passes every one of them. So the accepted half is asserted part by part, with
the parse's own output, and the two halves are kept in one file so a reader
can see that the boundary is where 4.11 draws it.
*/
import { describe, expect, test } from 'vitest'

import {
  isRecurrenceRule,
  parseRecurrenceRule,
  type RecurrenceRule,
} from './recurrence.js'

function parsed(value: string): RecurrenceRule {
  const result = parseRecurrenceRule(value)
  if (!result.ok) {
    throw new Error(`${value} was refused: ${result.reason}`)
  }
  return result.rule
}

function refusal(value: unknown): string {
  const result = parseRecurrenceRule(value)
  if (result.ok) {
    throw new Error(`${JSON.stringify(value)} was accepted`)
  }
  return result.reason
}

describe('the 4.11 subset admits what the preset builder produces', () => {
  test('FREQ alone, all four frequencies, with INTERVAL defaulted to 1', () => {
    for (const freq of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      const rule = parsed(`FREQ=${freq}`)
      expect(rule.freq).toBe(freq)
      expect(rule.interval, '4.11 gives INTERVAL a default of 1').toBe(1)
      expect(rule.byDay).toBeNull()
      expect(rule.byMonthDay).toBeNull()
      expect(rule.until).toBeNull()
    }
  })

  test('INTERVAL across its whole range', () => {
    expect(parsed('FREQ=DAILY;INTERVAL=1').interval).toBe(1)
    expect(parsed('FREQ=DAILY;INTERVAL=99').interval).toBe(99)
    expect(parsed('FREQ=WEEKLY;INTERVAL=52;BYDAY=MO').interval).toBe(52)
  })

  test('BYDAY, one day and many, in every value 4.11 lists', () => {
    expect(parsed('FREQ=WEEKLY;BYDAY=MO').byDay).toEqual(['MO'])
    expect(parsed('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR').byDay).toEqual([
      'MO',
      'TU',
      'WE',
      'TH',
      'FR',
    ])
    expect(parsed('FREQ=WEEKLY;BYDAY=SA,SU').byDay).toEqual(['SA', 'SU'])
    expect(
      parsed('FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA').byDay,
      'the whole week is a legal list, and the order is the caller\'s',
    ).toHaveLength(7)
  })

  test('a repeated BYDAY token selects that day once', () => {
    // RFC 5545 makes BYDAY a list, and a list naming Monday twice still
    // selects Monday. 4.11 narrows which days may appear, not how often, and
    // the length bound of 4.5 is what refuses the pathological form.
    expect(parsed('FREQ=WEEKLY;BYDAY=MO,MO,TU').byDay).toEqual(['MO', 'TU'])
  })

  test('BYMONTHDAY across its whole range', () => {
    expect(parsed('FREQ=MONTHLY;BYMONTHDAY=1').byMonthDay).toBe(1)
    expect(parsed('FREQ=MONTHLY;BYMONTHDAY=28').byMonthDay).toBe(28)
    expect(parsed('FREQ=MONTHLY;BYMONTHDAY=15;INTERVAL=3').byMonthDay).toBe(15)
  })

  test('UNTIL is read from RFC 5545\'s DATE form into a calendar date', () => {
    expect(
      parsed('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260803').until,
      '11.9: the rule string spells YYYYMMDD, and every date this contract compares is YYYY-MM-DD',
    ).toBe('2026-08-03')
    expect(parsed('FREQ=YEARLY;UNTIL=20291229').until).toBe('2029-12-29')
    expect(
      parsed('FREQ=DAILY;UNTIL=20280229').until,
      'a leap day is a date that exists',
    ).toBe('2028-02-29')
  })

  test('the parts may come in any order, each once', () => {
    // RFC 5545 fixes no order for the parts of a recurrence rule, so both of
    // these are the same value string written two ways.
    expect(parsed('BYDAY=WE;INTERVAL=2;FREQ=WEEKLY')).toEqual(
      parsed('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'),
    )
  })

  test('isRecurrenceRule agrees with the parse', () => {
    expect(isRecurrenceRule('FREQ=MONTHLY;BYMONTHDAY=28')).toBe(true)
    expect(isRecurrenceRule('FREQ=MONTHLY;BYMONTHDAY=29')).toBe(false)
  })
})

describe('the 4.11 subset refuses everything else', () => {
  test('COUNT, by name and with its own reason', () => {
    expect(refusal('FREQ=DAILY;COUNT=5')).toMatch(/COUNT/)
    expect(refusal('FREQ=WEEKLY;BYDAY=MO;COUNT=10')).toMatch(/COUNT/)
  })

  test('BYMONTHDAY outside 1 to 28, which is where 29 to 31 fall', () => {
    for (const day of ['0', '29', '30', '31', '32']) {
      expect(refusal(`FREQ=MONTHLY;BYMONTHDAY=${day}`)).toMatch(/BYMONTHDAY/)
    }
  })

  test('FREQ outside the four, absent, or empty', () => {
    expect(refusal('FREQ=HOURLY')).toMatch(/FREQ/)
    expect(refusal('FREQ=MINUTELY')).toMatch(/FREQ/)
    expect(refusal('FREQ=SECONDLY')).toMatch(/FREQ/)
    expect(refusal('FREQ=')).toMatch(/NAME=VALUE|FREQ/)
    expect(refusal('BYDAY=MO')).toMatch(/FREQ/)
    expect(refusal('INTERVAL=2')).toMatch(/FREQ/)
  })

  test('INTERVAL outside 1 to 99, or written as something other than digits', () => {
    for (const interval of ['0', '100', '-1', '+1', '1.5', '1e2', ' 1', '']) {
      expect(refusal(`FREQ=WEEKLY;INTERVAL=${interval}`)).toMatch(
        /INTERVAL|NAME=VALUE/,
      )
    }
  })

  test('BYDAY on a frequency that does not admit it, and BYMONTHDAY likewise', () => {
    expect(refusal('FREQ=DAILY;BYDAY=MO')).toMatch(/BYDAY/)
    expect(refusal('FREQ=MONTHLY;BYDAY=MO')).toMatch(/BYDAY/)
    expect(refusal('FREQ=YEARLY;BYDAY=MO')).toMatch(/BYDAY/)
    expect(refusal('FREQ=WEEKLY;BYMONTHDAY=5')).toMatch(/BYMONTHDAY/)
    expect(refusal('FREQ=DAILY;BYMONTHDAY=5')).toMatch(/BYMONTHDAY/)
    expect(refusal('FREQ=YEARLY;BYMONTHDAY=5')).toMatch(/BYMONTHDAY/)
  })

  test('BYDAY values outside MO to SU, including the RFC forms 4.11 omits', () => {
    expect(refusal('FREQ=WEEKLY;BYDAY=XX')).toMatch(/BYDAY/)
    expect(refusal('FREQ=WEEKLY;BYDAY=MO,')).toMatch(/BYDAY/)
    expect(
      refusal('FREQ=WEEKLY;BYDAY=2MO'),
      'the ordinal form is RFC 5545 and outside 4.11, whose values are the two-letter days',
    ).toMatch(/BYDAY/)
  })

  test('UNTIL in any form but the RFC DATE form', () => {
    expect(
      refusal('FREQ=WEEKLY;BYDAY=MO;UNTIL=2026-08-03'),
      '11.9: the extended spelling is not a valid value string of the RFC 4.11 names',
    ).toMatch(/UNTIL/)
    expect(
      refusal('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260803T000000Z'),
      'the DATE-TIME form is ruled out with it',
    ).toMatch(/UNTIL/)
    expect(
      refusal('FREQ=DAILY;UNTIL=20260230'),
      'a date that does not exist is not a bound',
    ).toMatch(/UNTIL/)
    expect(refusal('FREQ=DAILY;UNTIL=20261301')).toMatch(/UNTIL/)
    expect(refusal('FREQ=DAILY;UNTIL=20270229')).toMatch(/UNTIL/)
    expect(refusal('FREQ=DAILY;UNTIL=2026080')).toMatch(/UNTIL/)
  })

  test('free-form input, and anything shaped like prose', () => {
    expect(refusal('every monday')).toMatch(/NAME=VALUE|part/)
    expect(refusal('')).toMatch(/RRULE|string/)
    expect(refusal('RRULE:FREQ=DAILY')).toMatch(/part/)
    expect(refusal(';')).toMatch(/NAME=VALUE/)
    expect(refusal('FREQ=DAILY;')).toMatch(/NAME=VALUE/)
    expect(refusal('=DAILY')).toMatch(/NAME=VALUE/)
  })

  test('parts the subset never lists', () => {
    expect(refusal('FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1')).toMatch(/BYSETPOS/)
    expect(refusal('FREQ=WEEKLY;WKST=SU')).toMatch(/WKST/)
    expect(refusal('FREQ=YEARLY;BYMONTH=2')).toMatch(/BYMONTH/)
    expect(refusal('FREQ=DAILY;BYHOUR=9')).toMatch(/BYHOUR/)
  })

  test('a part written twice, whatever it carries', () => {
    expect(refusal('FREQ=DAILY;FREQ=WEEKLY')).toMatch(/more than once/)
    expect(refusal('FREQ=DAILY;INTERVAL=2;INTERVAL=2')).toMatch(
      /more than once/,
    )
  })

  test('the wrong case, which the preset builder never emits', () => {
    // 4.11 admits only strings the preset builder can produce, and a builder
    // emits one spelling. This is the same narrowing the subset itself is,
    // applied to how the tokens are written.
    expect(refusal('freq=daily')).toMatch(/part/)
    expect(refusal('FREQ=daily')).toMatch(/FREQ/)
    expect(refusal('FREQ=WEEKLY;BYDAY=mo')).toMatch(/BYDAY/)
  })

  test('anything that is not a string at all', () => {
    for (const value of [5, true, null, undefined, ['FREQ=DAILY'], {}]) {
      expect(refusal(value)).toMatch(/string/)
    }
  })
})
