/*
The drag engine's arithmetic, which is the half of it a test can hold.

`use-sortable-list.ts` is a hook driven by pointer events, and this repository
has no component test leg to render one in. What it does have is three pure
functions the hook was factored into, and they carry the decisions: which slot
a carried row is proposing, how far the rows it passes shift, and what the
resulting array is. Everything else in that module is event plumbing around
these three answers.

These are unit tests, owned by this module under protocol section 8, and they
assert no acceptance criterion. AC-227 addresses the sidebar's gesture through
the browser; this file addresses the arithmetic underneath it, at the level
where an off-by-one is legible rather than showing up as a row landing one
place from where somebody dropped it.

The fixture is five items of 40 pixels with no gap, so a stride is 40 and a
midpoint is legible by eye: starts 0, 40, 80, 120, 160 and centres 20, 60,
100, 140, 180.

The measurements are `start` and `end` along the list's own axis rather than
top and bottom, because the engine sorts a column or a strip on the same
arithmetic (the tab strip of 9.1, and a board's columns after it). Most cases
below read as a column because that is the ordinary list; the last describe
block reads the same fixture as a row of tabs, to hold the claim that the
axis costs the geometry nothing.
*/
import { describe, expect, it } from 'vitest'

import { moved, offsetFor, slotFor, type Metrics } from './use-sortable-list.js'

function rows(count: number, height = 40): Metrics {
  const starts: number[] = []
  const ends: number[] = []
  for (let index = 0; index < count; index += 1) {
    starts.push(index * height)
    ends.push(index * height + height)
  }
  return { starts, ends, stride: height }
}

describe('slotFor: which slot a carried row is proposing', () => {
  it('proposes its own slot while it has not moved', () => {
    expect(slotFor(rows(5), 0, 0, 5)).toBe(0)
    expect(slotFor(rows(5), 0, 2, 5)).toBe(2)
    expect(slotFor(rows(5), 0, 4, 5)).toBe(4)
  })

  it('takes the next slot down only once its centre passes the midpoint below it', () => {
    // Carried row 0, centre 20. Row 1's midpoint is 60, so 39 pixels of travel
    // still proposes slot 0 and 41 proposes slot 1. The boundary is the
    // midpoint and not the row's top edge, which is what makes the exchange
    // happen when the two rows have visibly half-passed each other.
    expect(slotFor(rows(5), 39, 0, 5)).toBe(0)
    expect(slotFor(rows(5), 41, 0, 5)).toBe(1)
    expect(slotFor(rows(5), 100, 0, 5)).toBe(2)
    expect(slotFor(rows(5), 200, 0, 5)).toBe(4)
  })

  it('takes the next slot up on the same rule, travelling backwards', () => {
    // Carried row 4, centre 180. Row 3's midpoint is 140.
    expect(slotFor(rows(5), -39, 4, 5)).toBe(4)
    expect(slotFor(rows(5), -41, 4, 5)).toBe(3)
    expect(slotFor(rows(5), -100, 4, 5)).toBe(2)
    expect(slotFor(rows(5), -200, 4, 5)).toBe(0)
  })

  it('never proposes a slot outside the list, however far the pointer goes', () => {
    expect(slotFor(rows(5), 5000, 2, 5)).toBe(4)
    expect(slotFor(rows(5), -5000, 2, 5)).toBe(0)
  })

  it('declines to move a row it never measured', () => {
    // The carried row itself has no measurement: there is no centre to compare
    // anything against, so the honest answer is the slot it is already in.
    const measured = rows(5)
    measured.starts.length = 2
    measured.ends.length = 2
    expect(slotFor(measured, 500, 4, 5)).toBe(4)
  })

  it('skips an unmeasured row rather than reading it as sitting at zero', () => {
    // Rows 3 and 4 were never measured. Without the guard each would read as
    // top 0 and bottom 0, so a midpoint of 0, which sits above every real row:
    // carried row 0 travelling downwards would compare its centre against them
    // and they would take the proposal away from the row it actually passed.
    // Skipped, the answer is the same as if they were not there. Row 0 with
    // 100 pixels of travel has a centre of 120, past row 1 (mid 60) and row 2
    // (mid 100), so it proposes slot 2.
    const measured = rows(5)
    measured.starts.length = 3
    measured.ends.length = 3
    expect(slotFor(measured, 100, 0, 5)).toBe(2)
  })
})

describe('offsetFor: how far the rows it passes shift', () => {
  it('moves exactly the span between the origin and the proposal, and nothing else', () => {
    // Carried row 0 proposing slot 2: rows 1 and 2 come up by one stride to
    // fill the space behind it, rows 3 and 4 do not move at all.
    expect(offsetFor(1, 0, 2, 40)).toBe(-40)
    expect(offsetFor(2, 0, 2, 40)).toBe(-40)
    expect(offsetFor(3, 0, 2, 40)).toBe(0)
    expect(offsetFor(4, 0, 2, 40)).toBe(0)
  })

  it('shifts the other way when the row travels up', () => {
    // Carried row 4 proposing slot 2: rows 2 and 3 go down to open the gap.
    expect(offsetFor(2, 4, 2, 40)).toBe(40)
    expect(offsetFor(3, 4, 2, 40)).toBe(40)
    expect(offsetFor(1, 4, 2, 40)).toBe(0)
    expect(offsetFor(0, 4, 2, 40)).toBe(0)
  })

  it('holds the list still while a row proposes the slot it is already in', () => {
    for (let index = 0; index < 5; index += 1) {
      expect(offsetFor(index, 2, 2, 40)).toBe(0)
    }
  })

  it('always shifts by one stride, never by the distance travelled', () => {
    // The gap a list opens is the height of the thing going into it. A list
    // that shifted by the pointer's travel would keep growing the gap as
    // somebody dragged further, which is the space telling a lie about what a
    // release will do.
    expect(offsetFor(1, 0, 4, 40)).toBe(-40)
    expect(offsetFor(4, 0, 4, 40)).toBe(-40)
  })
})

describe('the same arithmetic, read as a horizontal strip', () => {
  /*
  The tab strip of 9.1 is the one list in this product that runs sideways, and
  it arrived at S9 with a hand-rolled pointer drag of its own: the second
  engine RFC 0004's "one drag engine total" exists to refuse. What let it come
  onto this one is that `slotFor` never knew which axis it was on.

  So this block is the same five items and the same numbers as the column
  cases above, measured left-to-right: starts 0, 40, 80, 120, 160 are now the
  tabs' left edges and the centres are horizontal. Nothing about the expected
  answers changes, which is the claim.
  */
  const strip = rows(5)

  it('proposes the neighbour once the carried tab passes its midpoint', () => {
    expect(slotFor(strip, 39, 0, 5)).toBe(0)
    expect(slotFor(strip, 41, 0, 5)).toBe(1)
  })

  it('is AC-216 as arithmetic: the second tab dragged onto the first lands first', () => {
    // That case presses the second tab and releases four pixels inside the
    // first. Tab 1's centre is 60 and tab 0's midpoint is 20, so the travel is
    // 4 - 60, and a centre of 4 is left of 20: slot 0.
    expect(slotFor(strip, 4 - 60, 1, 5)).toBe(0)
  })

  it('shifts the tabs it passes by one stride sideways', () => {
    // Read as a translateX by the caller. The engine returns a scalar because
    // a list runs one way and only the caller knows which.
    expect(offsetFor(0, 1, 0, 40)).toBe(40)
    expect(offsetFor(2, 1, 0, 40)).toBe(0)
  })
})

describe('moved: the array the reorder commits', () => {
  it('moves an item down and closes the space behind it', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up', () => {
    expect(moved(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a copy, never a rearrangement of the array it was given', () => {
    const before = ['a', 'b', 'c']
    const after = moved(before, 0, 2)
    expect(before).toEqual(['a', 'b', 'c'])
    expect(after).not.toBe(before)
  })

  it('returns the list unchanged for a move that goes nowhere', () => {
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('keeps every item when an index is outside the list', () => {
    // A drag can outlive the list it was sorting, which is a thing the hook
    // watches for and cannot always win. Losing a row to that race is not an
    // acceptable answer, so the out-of-range move is a no-op rather than a
    // splice against an index that no longer means anything.
    expect(moved(['a', 'b', 'c'], 5, 1)).toEqual(['a', 'b', 'c'])
    expect(moved(['a', 'b', 'c'], 1, 5)).toEqual(['a', 'b', 'c'])
    expect(moved(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c'])
    expect(moved([], 0, 0)).toEqual([])
  })
})
