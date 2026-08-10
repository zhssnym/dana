import { describe, expect, test } from 'vitest'

import {
  connection,
  connectionUser,
  getConnectionsResponse,
} from './connections.js'

const ID = '33333333-3333-4333-8333-333333333333'

const ENTRY = {
  user: {
    id: ID,
    display_name: 'Ada',
    avatar_url: 'https://example.test/a.png',
    email: 'ada@example.test',
  },
  connected_at: '2026-08-09T10:00:00.000Z',
}

describe('the 7.3 roster element', () => {
  test('accepts the element frozen 7.3 enumerates, and the list of it', () => {
    expect(connection.safeParse(ENTRY).success).toBe(true)
    expect(
      getConnectionsResponse.safeParse([ENTRY]).success,
      'the bare array 7.3 writes',
    ).toBe(true)
    expect(
      getConnectionsResponse.safeParse([]).success,
      'an empty roster is a roster',
    ).toBe(true)
  })

  test('the person keys are 7.0\'s three plus 7.3\'s email, and no more', () => {
    const result = connectionUser.safeParse({
      ...ENTRY.user,
      timezone: 'Europe/Berlin',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        result.data,
        '7.3 adds an address to the person shape and nothing else',
      ).toEqual(ENTRY.user)
    }
  })

  test('display_name and avatar_url are nullable, the email is not', () => {
    expect(
      connectionUser.safeParse({
        ...ENTRY.user,
        display_name: null,
        avatar_url: null,
      }).success,
      '4.1 admits both as null when Google reports neither',
    ).toBe(true)
    expect(
      connectionUser.safeParse({ ...ENTRY.user, email: null }).success,
      '7.3 excludes soft-deleted users, whose scrub is what empties the column',
    ).toBe(false)
    expect(
      connectionUser.safeParse({ ...ENTRY.user, email: '' }).success,
      'and an empty address is no address',
    ).toBe(false)
  })

  test('refuses an element missing either key of the pair', () => {
    expect(connection.safeParse({ user: ENTRY.user }).success).toBe(false)
    expect(
      connection.safeParse({ connected_at: ENTRY.connected_at }).success,
    ).toBe(false)
  })
})
