import { describe, expect, test } from 'vitest'

import {
  deleteMeBody,
  getMeSettingsResponse,
  meResponse,
  patchMeBody,
  patchMeSettingsBody,
  patchMeSettingsResponse,
  settings,
} from './me.js'

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

const SETTINGS_FIELDS = ['show_important', 'show_all', 'show_done'] as const

describe('patchMeSettingsBody (7.2: any subset of the three booleans)', () => {
  test('accepts the full subset, either value', () => {
    for (const value of [true, false]) {
      const result = patchMeSettingsBody.safeParse({
        show_important: value,
        show_all: value,
        show_done: value,
      })
      expect(result.success, `all three set to ${String(value)}`).toBe(true)
    }
  })

  test('accepts every single-field subset', () => {
    for (const field of SETTINGS_FIELDS) {
      const result = patchMeSettingsBody.safeParse({ [field]: false })
      expect(result.success, `${field} alone is a subset`).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ [field]: false })
      }
    }
  })

  test('accepts the empty subset, which is a subset (AC-120)', () => {
    const result = patchMeSettingsBody.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({})
    }
  })

  test('leaves an absent field absent rather than undefined-valued', () => {
    // The handler writes the fields it finds here, so absent must not arrive
    // as a key: AC-120 races two disjoint single-field PATCHes, and a body
    // carrying all three keys is what makes a read-merge-write lose one.
    const result = patchMeSettingsBody.safeParse({ show_done: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data)).toEqual(['show_done'])
      expect('show_all' in result.data, 'absent stays absent').toBe(false)
    }
  })

  test('refuses every non-boolean, per field, without coercing (AC-121)', () => {
    const wrongs: readonly [unknown, string][] = [
      ['true', 'the string "true" is not a boolean'],
      ['false', 'the string "false" would coerce to true, the worst of both'],
      ['', 'the empty string is not a boolean'],
      [1, 'the number 1 is truthy, not a boolean'],
      [0, 'the number 0 is falsy, not a boolean'],
      [[], 'an array is not a boolean'],
      [{ value: true }, 'an object is not a boolean'],
    ]
    for (const field of SETTINGS_FIELDS) {
      for (const [value, why] of wrongs) {
        expect(
          patchMeSettingsBody.safeParse({ [field]: value }).success,
          `${field}: ${why}`,
        ).toBe(false)
      }
    }
  })

  test('refuses null, because 4.10 admits no null state (AC-121)', () => {
    // The nearest precedent points the wrong way: 7.4's my-membership takes
    // null as a clear. These columns are NOT NULL with defaults, so null is
    // a wrong type here, and .optional() rather than .nullish() is what says
    // so.
    for (const field of SETTINGS_FIELDS) {
      expect(
        patchMeSettingsBody.safeParse({ [field]: null }).success,
        `${field}: null is a wrong-typed value, not a clear`,
      ).toBe(false)
    }
  })

  test('names the failing field in its issue path, with the 10.3 message', () => {
    for (const field of SETTINGS_FIELDS) {
      const result = patchMeSettingsBody.safeParse({ [field]: 'yes' })
      expect(result.success).toBe(false)
      if (!result.success) {
        // sendValidationError prefixes the path, so the 422 reads
        // "show_done: must be a boolean." and AC-121's field-naming holds.
        expect(result.error.issues[0]?.path).toEqual([field])
        expect(result.error.issues[0]?.message).toBe('must be a boolean')
      }
    }
  })

  test('one wrong field refuses the whole body (AC-121 adversarial)', () => {
    const result = patchMeSettingsBody.safeParse({
      show_all: false,
      show_done: 'yes',
    })
    expect(
      result.success,
      'a body is validated whole, so the valid field cannot land beside the refusal',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['show_done'],
      ])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchMeSettingsBody.safeParse({
      show_done: true,
      theme: 'dark',
      nested: { anything: ['at', 'all'] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ show_done: true })
    }
  })
})

describe('the 7.2 settings object (GET, the /me key, and the ruled PATCH body)', () => {
  const valid = { show_important: true, show_all: true, show_done: false }

  test('accepts exactly the three booleans', () => {
    expect(settings.safeParse(valid).success).toBe(true)
    const result = settings.safeParse({ ...valid, show_archived: true })
    expect(result.success, 'an unknown key is stripped, not refused').toBe(true)
    if (result.success) {
      expect(result.data).toEqual(valid)
    }
  })

  test('refuses a missing field, a non-boolean, and null', () => {
    for (const field of SETTINGS_FIELDS) {
      const { [field]: _dropped, ...missing } = valid
      void _dropped
      expect(settings.safeParse(missing).success, `${field} missing`).toBe(false)
      expect(
        settings.safeParse({ ...valid, [field]: 'true' }).success,
        `${field} as a string`,
      ).toBe(false)
      expect(settings.safeParse({ ...valid, [field]: null }).success, `${field} null`).toBe(
        false,
      )
    }
  })

  test('the ruled PATCH response is the GET object itself (7.2)', () => {
    // The owner's sentence says PATCH /me/settings answers the GET
    // /me/settings object. Identity, not a matching pair of declarations, is
    // what keeps that true through every later edit.
    expect(patchMeSettingsResponse).toBe(getMeSettingsResponse)
    expect(getMeSettingsResponse).toBe(settings)
  })

  test('the settings key of GET /me is the same object (7.1 and 7.2 read one row)', () => {
    const me = {
      user: {
        id: '123e4567-e89b-42d3-a456-426614174000',
        email: 'sara@example.test',
        display_name: 'Sara',
        avatar_url: null,
        timezone: 'UTC',
      },
      settings: valid,
      pending_invite_count: 0,
    }
    expect(meResponse.safeParse(me).success).toBe(true)
    expect(
      meResponse.safeParse({ ...me, settings: { ...valid, show_done: 1 } })
        .success,
      'what the settings object refuses, the /me body refuses',
    ).toBe(false)
  })
})
