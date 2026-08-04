import { describe, expect, test } from 'vitest'

import {
  folder,
  patchFolderBody,
  patchFolderMyMembershipBody,
  postFolderMembersBody,
  postFoldersBody,
} from './folders.js'

describe('postFoldersBody and patchFolderBody (7.4: { name }, 10.3: 1 to 100)', () => {
  const bodies = [
    ['postFoldersBody', postFoldersBody],
    ['patchFolderBody', patchFolderBody],
  ] as const

  test('accepts both length boundaries', () => {
    for (const [label, body] of bodies) {
      expect(body.safeParse({ name: 'x' }).success, `${label} at 1`).toBe(true)
      expect(
        body.safeParse({ name: 'x'.repeat(100) }).success,
        `${label} at 100`,
      ).toBe(true)
    }
  })

  test('refuses both out-of-range lengths', () => {
    for (const [label, body] of bodies) {
      expect(body.safeParse({ name: '' }).success, `${label} empty`).toBe(false)
      expect(
        body.safeParse({ name: 'x'.repeat(101) }).success,
        `${label} at 101`,
      ).toBe(false)
    }
  })

  test('refuses wrong types and the absent field', () => {
    for (const [label, body] of bodies) {
      for (const name of [123, true, null, ['x'], { name: 'x' }]) {
        expect(
          body.safeParse({ name }).success,
          `${label}: ${JSON.stringify(name)} is not a string`,
        ).toBe(false)
      }
      expect(body.safeParse({}).success, `${label}: missing name`).toBe(false)
    }
  })

  test('names the field in its issue path', () => {
    const result = postFoldersBody.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchFolderBody.safeParse({ name: 'ok', extra: 'field' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'ok' })
    }
  })
})

describe('patchFolderMyMembershipBody (7.4: { label, color }, either nullable)', () => {
  test('accepts both fields, upper or lower hex (the 4.4 CHECK admits both)', () => {
    for (const color of ['#AB12CD', '#ab12cd']) {
      const result = patchFolderMyMembershipBody.safeParse({
        label: 'Deep work',
        color,
      })
      expect(result.success, `${color} is #RRGGBB`).toBe(true)
    }
  })

  test('accepts both length boundaries of the label', () => {
    expect(patchFolderMyMembershipBody.safeParse({ label: 'x' }).success).toBe(true)
    expect(
      patchFolderMyMembershipBody.safeParse({ label: 'x'.repeat(40) }).success,
    ).toBe(true)
  })

  test('accepts null as the clear signal for either field', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      label: null,
      color: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ label: null, color: null })
    }
  })

  test('accepts any subset, keeping absent distinct from null', () => {
    const labelOnly = patchFolderMyMembershipBody.safeParse({ label: 'Home' })
    expect(labelOnly.success).toBe(true)
    if (labelOnly.success) {
      expect(labelOnly.data).toEqual({ label: 'Home' })
      expect('color' in labelOnly.data, 'absent color stays absent').toBe(false)
    }
    expect(
      patchFolderMyMembershipBody.safeParse({ color: '#00AA00' }).success,
    ).toBe(true)
    expect(
      patchFolderMyMembershipBody.safeParse({}).success,
      'the empty patch is a no-op, not a refusal',
    ).toBe(true)
  })

  test('refuses the AC-023 limit and format probes', () => {
    const refusals: readonly [unknown, string][] = [
      [{ label: '' }, 'an empty label is under the 1 to 40 range'],
      [{ label: 'x'.repeat(41) }, 'a 41-character label is over the range'],
      [{ label: 'ok', color: 'red' }, 'a named color is not #RRGGBB'],
      [{ label: 'ok', color: '#12345' }, 'five hex digits are not #RRGGBB'],
      [{ label: 'ok', color: '#GGHHII' }, 'non-hex digits are not #RRGGBB'],
      [{ label: 7, color: '#AB12CD' }, 'a wrong-typed label is a refusal'],
      [{ color: '#AB12CD1' }, 'seven hex digits are not #RRGGBB'],
    ]
    for (const [body, why] of refusals) {
      expect(patchFolderMyMembershipBody.safeParse(body).success, why).toBe(false)
    }
  })

  test('names the failing field in its issue path', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      label: 'ok',
      color: 'red',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['color'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      label: 'ok',
      role: 'owner',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ label: 'ok' })
    }
  })
})

describe('postFolderMembersBody (7.4: { user_id })', () => {
  test('accepts a uuid in either case', () => {
    for (const user_id of [
      '123e4567-e89b-42d3-a456-426614174000',
      '123E4567-E89B-42D3-A456-426614174000',
    ]) {
      expect(postFolderMembersBody.safeParse({ user_id }).success).toBe(true)
    }
  })

  test('refuses non-uuids, wrong types, and the absent field', () => {
    for (const user_id of ['abc', '', 42, null, ['x'], {}]) {
      expect(
        postFolderMembersBody.safeParse({ user_id }).success,
        `${JSON.stringify(user_id)} is not a uuid`,
      ).toBe(false)
    }
    expect(postFolderMembersBody.safeParse({}).success, 'missing user_id').toBe(false)
  })

  test('names the field in its issue path', () => {
    const result = postFolderMembersBody.safeParse({ user_id: 'abc' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['user_id'])
    }
  })
})

describe('folder (7.0: the shared Folder object)', () => {
  const valid = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    name: 'Groceries',
    is_default: false,
    is_owner: true,
    member_count: 2,
    counts: { pending: 3, completed: 0 },
    my_label: null,
    my_color: null,
  }

  test('accepts the shape with and without personal fields set', () => {
    expect(folder.safeParse(valid).success).toBe(true)
    expect(
      folder.safeParse({ ...valid, my_label: 'Home', my_color: '#00aa00' })
        .success,
    ).toBe(true)
  })

  test('refuses a member_count of zero (INV-10: the owner is a member)', () => {
    expect(folder.safeParse({ ...valid, member_count: 0 }).success).toBe(false)
  })

  test('refuses negative and missing counts', () => {
    expect(
      folder.safeParse({ ...valid, counts: { pending: -1, completed: 0 } })
        .success,
    ).toBe(false)
    const { counts, ...withoutCounts } = valid
    void counts
    expect(folder.safeParse(withoutCounts).success).toBe(false)
  })

  test('refuses a missing or non-uuid id', () => {
    expect(folder.safeParse({ ...valid, id: 'f1' }).success).toBe(false)
    const { id, ...withoutId } = valid
    void id
    expect(folder.safeParse(withoutId).success).toBe(false)
  })
})
