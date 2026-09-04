/*
The one decision the duplicate endpoints make without a zone, driven directly
(issue #76).

Whether `tz` is required cannot itself depend on `tz`, so `zoneIsNeededToReanchor`
answers it from the UTC date alone: today in the furthest zone is at most the UTC
date plus a day, so a due date after that bound is ahead of the caller wherever
they stand and nothing can re-anchor it. The boundary is exact and it is
one-sided, and neither of those facts is visible from AC-376, which drives the
two ends of the range through the wire — 2020 and 2099 — because a criterion
that named tomorrow's date would be asserting arithmetic rather than behaviour.
This file names it.

The instant is passed in, so nothing here reads the clock and nothing here can
be a midnight race: that is the whole reason the helper takes one.
*/
import { describe, expect, test } from 'vitest'

import { zoneIsNeededToReanchor } from './acts.js'

/** A fixed instant, late on 2026-09-04 in UTC, so that the boundary cases sit
 * on either side of a date the reader can see. */
const AT = new Date('2026-09-04T22:30:00Z')

describe('zoneIsNeededToReanchor', () => {
  test('no date at all needs no zone', () => {
    expect(zoneIsNeededToReanchor(null, AT)).toBe(false)
  })

  test('a date on or before the UTC day needs one, because some zone is past it', () => {
    for (const spent of ['2020-01-01', '2026-09-03', '2026-09-04']) {
      expect(
        zoneIsNeededToReanchor(spent, AT),
        `${spent} is at or behind the UTC day, so a caller somewhere may have passed it`,
      ).toBe(true)
    }
  })

  test('the day after the UTC day needs none: no zone is that far ahead', () => {
    /*
    The exact boundary, and it is the one an off-by-one would break in the
    expensive direction. Today(V) reaches UTC+1 day in a zone at +14, and a
    date equal to that day is still not *behind* it, so it never re-anchors.
    Requiring a zone here would refuse a duplicate that needs none; admitting
    2026-09-04 would let one through that does.
    */
    expect(zoneIsNeededToReanchor('2026-09-05', AT)).toBe(false)
    expect(zoneIsNeededToReanchor('2099-06-15', AT)).toBe(false)
  })

  test('the bound is the UTC day and not the machine’s', () => {
    // Just after midnight UTC, when a zone behind UTC is still on the 3rd and
    // one ahead is already on the 4th: the answer is the same either way,
    // because the helper reads the instant it was handed in UTC.
    const justPastMidnight = new Date('2026-09-04T00:05:00Z')
    expect(zoneIsNeededToReanchor('2026-09-04', justPastMidnight)).toBe(true)
    expect(zoneIsNeededToReanchor('2026-09-05', justPastMidnight)).toBe(false)
  })
})
