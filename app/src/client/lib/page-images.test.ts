/*
The two readings of 4.16's nullable shape (issue #108).

**Why this is worth a test when it is four lines of arithmetic.** The
arithmetic is not the risk; the split is. `measuredRatio` answers undefined
where the wire says nothing and `reservedRatio` answers 16 by 9, and the two
are not interchangeable: a page block has always reserved 16 by 9 for every
picture, so falling back there keeps that surface exactly as it draws today,
while a comment's picture has never had a reservation and would be reshaped by
one. No backfill has been run and no backfill is planned, so every file stored
before migration 0009 reports null for ever and both answers have to stay
right indefinitely. A later session tidying "two functions that do the same
thing" into one is the mistake this file exists to fail.

`node`, this suite's default, because nothing here renders.
*/
import { describe, expect, it } from 'vitest'

import { FALLBACK_RATIO, measuredRatio, reservedRatio } from './page-images.js'

describe('measuredRatio: what the wire measured, or nothing', () => {
  it('divides a measured pair', () => {
    expect(measuredRatio(2048, 1024)).toBe(2)
    expect(measuredRatio(300, 100)).toBe(3)
    expect(measuredRatio(1000, 2000)).toBe(0.5)
  })

  it('answers undefined for either half of 4.16 being null', () => {
    /* Null is 4.16's own value for a file nothing measured, which is every
       image stored before migration 0009 and every kind that has no shape. */
    expect(measuredRatio(null, null)).toBeUndefined()
    expect(measuredRatio(1600, null)).toBeUndefined()
    expect(measuredRatio(null, 900)).toBeUndefined()
  })

  it('answers undefined for a number that cannot be a picture', () => {
    /* The columns are declared positive, so none of these should arrive. They
       are refused rather than divided because CSS accepts what the division
       produces: a zero height gives Infinity and draws an unbounded box, and a
       zero width gives 0 and draws a collapsed one. Both look like a broken
       page and neither looks like bad data. */
    expect(measuredRatio(0, 100)).toBeUndefined()
    expect(measuredRatio(100, 0)).toBeUndefined()
    expect(measuredRatio(-300, 100)).toBeUndefined()
    expect(measuredRatio(undefined, undefined)).toBeUndefined()
  })
})

describe('reservedRatio: the same reading where 16 by 9 is what today draws', () => {
  it('agrees with measuredRatio wherever there is a measurement', () => {
    for (const pair of [
      [2048, 1024],
      [300, 100],
      [1000, 2000],
    ] as const) {
      expect(reservedRatio(pair[0], pair[1])).toBe(measuredRatio(pair[0], pair[1]))
    }
  })

  it('falls back where the wire says nothing', () => {
    expect(reservedRatio(null, null)).toBe(FALLBACK_RATIO)
    expect(reservedRatio(1600, null)).toBe(FALLBACK_RATIO)
    expect(reservedRatio(0, 0)).toBe(FALLBACK_RATIO)
    expect(FALLBACK_RATIO).toBe(16 / 9)
  })

  it('is the pair that differs, which is the point of there being two', () => {
    /* Stated as a difference rather than twice as a value, so that collapsing
       the two into one function fails here and names why. The page block wants
       the left-hand answer and a comment attachment wants the right-hand one,
       and the wrong choice reshapes every picture uploaded before 0009. */
    expect(reservedRatio(null, null)).not.toBe(measuredRatio(null, null))
  })
})
