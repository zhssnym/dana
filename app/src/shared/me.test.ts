import { describe, expect, test } from 'vitest'

import { deleteMeBody, patchMeBody } from './me.js'

describe('deleteMeBody (7.1: literal confirm string)', () => {
  test('accepts exactly the literal string', () => {
    const result = deleteMeBody.safeParse({ confirm: 'DELETE' })
    expect(result.success).toBe(true)
  })

  test('refuses the AC-009 casings and paddings', () => {
    for (const confirm of ['delete', 'Delete', 'DELETE ', ' DELETE']) {
      const result = deleteMeBody.safeParse({ confirm })
      expect(result.success, `${JSON.stringify(confirm)} is not the literal`).toBe(false)
    }
  })

  test('refuses the AC-009 non-strings and the absent field', () => {
    for (const confirm of [true, 1, ['DELETE'], { value: 'DELETE' }, null]) {
      const result = deleteMeBody.safeParse({ confirm })
      expect(result.success, `${JSON.stringify(confirm)} is not a string`).toBe(false)
    }
    expect(deleteMeBody.safeParse({}).success, 'missing confirm').toBe(false)
  })

  test('names the field in its issue path', () => {
    const result = deleteMeBody.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirm'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = deleteMeBody.safeParse({ confirm: 'DELETE', extra: 'field' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ confirm: 'DELETE' })
    }
  })
})

describe('patchMeBody (7.1: timezone, 422 if not IANA)', () => {
  test('accepts a valid zone and a tzdb alias', () => {
    expect(patchMeBody.safeParse({ timezone: 'America/New_York' }).success).toBe(true)
    expect(patchMeBody.safeParse({ timezone: 'US/Eastern' }).success).toBe(true)
  })

  test('refuses invalid zones, non-strings, and the absent field', () => {
    for (const timezone of ['Not/AZone', 'UTC+5', '', 42, null, ['UTC']]) {
      const result = patchMeBody.safeParse({ timezone })
      expect(result.success, `${JSON.stringify(timezone)} must refuse`).toBe(false)
    }
    expect(patchMeBody.safeParse({}).success, 'missing timezone').toBe(false)
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchMeBody.safeParse({ timezone: 'UTC', theme: 'dark' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ timezone: 'UTC' })
    }
  })
})
