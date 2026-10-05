/*
The identity palette's two promises: every colour reads in both themes, and
Shuffle never lands on the colour already worn.
*/
import { describe, expect, test } from 'vitest'

import { IDENTITY_COLORS, SHUFFLE_COLORS, shuffleColor } from './identity-colors.js'

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const ALL = [...IDENTITY_COLORS.map(([, hex]) => hex), ...SHUFFLE_COLORS]

describe('identity colours', () => {
  test('every colour is a #rrggbb the wire accepts, and none repeats', () => {
    for (const hex of ALL) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(ALL).size).toBe(ALL.length)
  })

  test('every colour holds 3:1 on the light and the dark page', () => {
    for (const hex of ALL) {
      expect(contrast(hex, '#ffffff'), `${hex} on light`).toBeGreaterThanOrEqual(3)
      expect(contrast(hex, '#191919'), `${hex} on dark`).toBeGreaterThanOrEqual(3)
    }
  })

  test('shuffle draws from the pool and never repeats the worn colour', () => {
    for (const worn of SHUFFLE_COLORS) {
      for (const r of [0, 0.5, 0.9999]) {
        const next = shuffleColor(worn.toUpperCase(), () => r)
        expect(SHUFFLE_COLORS).toContain(next)
        expect(next).not.toBe(worn)
      }
    }
    expect(SHUFFLE_COLORS).toContain(shuffleColor(null))
  })
})
