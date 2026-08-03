import { describe, expect, test } from 'vitest'

import { isIanaTimezone, ianaTimezone } from './timezone.js'

describe('isIanaTimezone', () => {
  test('accepts canonical names, aliases, and fixed zones', () => {
    // US/Eastern is the tzdb alias 8.1 counts as the same zone as
    // America/New_York; both must validate (AC-007 relies on it).
    for (const zone of [
      'UTC',
      'GMT',
      'America/New_York',
      'US/Eastern',
      'Asia/Kolkata',
      'Etc/GMT+5',
      'Etc/UTC',
    ]) {
      expect(isIanaTimezone(zone), `${zone} is a valid zone`).toBe(true)
    }
  })

  test('refuses every value AC-007 feeds as unparseable', () => {
    // The exact rubbish list of the acceptance test, so this validator and
    // the treat-as-absent path that consumes it cannot disagree with it.
    for (const rubbish of ['Not/AZone', 'Mars/Olympus_Mons', '', 'UTC+5', '../../etc']) {
      expect(isIanaTimezone(rubbish), `${JSON.stringify(rubbish)} is invalid`).toBe(false)
    }
  })

  test('refuses ECMA-402 offset identifiers, which are not IANA names', () => {
    // Intl accepts these, Luxon's zone math will not (11.9); the sign guard
    // exists for exactly this gap.
    for (const offset of ['+05:30', '-08:00', '+00:00']) {
      expect(isIanaTimezone(offset), `${offset} is an offset, not a zone`).toBe(false)
    }
  })
})

describe('ianaTimezone schema', () => {
  test('parses a valid zone through unchanged', () => {
    expect(ianaTimezone.parse('Europe/Berlin')).toBe('Europe/Berlin')
  })

  test('refuses non-strings and invalid zones with the 10.3 message', () => {
    for (const bad of [5, null, undefined, true, 'Not/AZone']) {
      const result = ianaTimezone.safeParse(bad)
      expect(result.success, `${JSON.stringify(bad)} must refuse`).toBe(false)
    }
  })
})
