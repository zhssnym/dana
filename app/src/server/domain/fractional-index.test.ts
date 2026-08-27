/*
Unit tests for the key arithmetic behind 4.5's `position`. Unit tests are the
implementing role's under protocol section 8; the criteria that assert what a
person sees are AC-266 to AC-269 and are persona 11's.

What is worth testing here is the property rather than any particular key:
the result lands strictly between its bounds, it satisfies the CHECK the
column carries, and it keeps doing both after a thousand insertions into one
gap, which is the case a naive midpoint runs out of room on.
*/
import { describe, expect, test } from 'vitest'

import { initialKeys, keyBetween } from './fractional-index.js'

/** The column's own CHECK, restated so the unit test refuses what the
 * database would: the alphabet and the two lengths. The least-digit rule lives
 * inside the module, the integer part making it unexpressible as one regex. */
const COLUMN_CHECK = /^[0-9A-Za-z]{2,255}$/

function expectLegal(key: string): void {
  expect(COLUMN_CHECK.test(key), `${key} must satisfy 4.5's format check`).toBe(
    true,
  )
}

describe('keyBetween', () => {
  test('lands strictly between its bounds, at either end and in the middle', () => {
    const only = keyBetween(null, null)
    expectLegal(only)

    const before = keyBetween(null, only)
    const after = keyBetween(only, null)
    expectLegal(before)
    expectLegal(after)
    expect(before < only).toBe(true)
    expect(only < after).toBe(true)

    const inner = keyBetween(before, only)
    expectLegal(inner)
    expect(before < inner && inner < only).toBe(true)
  })

  test('a thousand insertions into one gap stay ordered and legal', () => {
    const low = keyBetween(null, null)
    let high = keyBetween(low, null)
    for (let index = 0; index < 1000; index += 1) {
      const next = keyBetween(low, high)
      expectLegal(next)
      expect(low < next && next < high, `insertion ${String(index)}`).toBe(true)
      high = next
    }
  })

  test('a thousand appends at each end stay ordered and legal', () => {
    let tail = keyBetween(null, null)
    let head = tail
    for (let index = 0; index < 1000; index += 1) {
      const nextTail = keyBetween(tail, null)
      const nextHead = keyBetween(null, head)
      expectLegal(nextTail)
      expectLegal(nextHead)
      expect(tail < nextTail).toBe(true)
      expect(nextHead < head).toBe(true)
      tail = nextTail
      head = nextHead
    }
  })

  test('bounds out of sequence are refused rather than answered', () => {
    const low = keyBetween(null, null)
    const high = keyBetween(low, null)
    expect(() => keyBetween(high, low)).toThrow()
    expect(() => keyBetween(low, low)).toThrow()
  })
})

describe('initialKeys', () => {
  test('ascending, legal, and insertable between at every step', () => {
    for (const count of [1, 2, 35, 36, 400, 1001]) {
      const keys = initialKeys(count)
      expect(keys.length, `${String(count)} keys`).toBe(count)
      for (const key of keys) expectLegal(key)
      for (let index = 1; index < keys.length; index += 1) {
        expect(
          keys[index - 1]! < keys[index]!,
          `${String(count)} keys ascend at ${String(index)}`,
        ).toBe(true)
        const between = keyBetween(keys[index - 1]!, keys[index]!)
        expectLegal(between)
        expect(keys[index - 1]! < between && between < keys[index]!).toBe(true)
      }
    }
  })

  test('the widest first arrangement stays short enough to read', () => {
    // 1001 is the folder cap section 6 puts on an open section plus the
    // probe row, so this is the widest seed the endpoint can produce.
    expect(initialKeys(1001).every((key) => key.length <= 3)).toBe(true)
  })
})
