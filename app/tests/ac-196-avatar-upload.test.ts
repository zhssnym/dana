/*
AC-196: given an avatar upload, then users.avatar_url resolves to the
stored object.

avatar_url has existed since 4.1; what v2 adds is a way to point it at
Dana's own store instead of Google's. The assertion reads the profile back
through the API rather than the column, because the URL the client renders
is the fact that matters.

Spec: 4.1, 4.16, 7.15 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-196 the picture is the control', () => {
  test('an avatar upload lands and the profile points at it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const landed = await upload(
      owner,
      '/me/avatar',
      {},
      { name: 'face.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 200, 'the avatar upload must land (spec 7.15)')

    const me = await owner.browser.json('/me', 'GET')
    expectStatus(me, 200, 'the profile reads back (spec 7.1)')
    const url = (me.json() as { avatar_url?: unknown }).avatar_url
    expect(typeof url, 'avatar_url is set (spec 4.1)').toBe('string')
    expect(
      String(url).includes('/files/') || String(url).includes('/avatar'),
      'it resolves to the stored object, not a third party (spec 7.15)',
    ).toBe(true)
  })
})
