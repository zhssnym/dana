/*
AC-1173: the viewer's Focus lists are stored on the account. A PATCH of
`focus_lists` lands in `user_settings.focus_lists` in the order sent, a GET
reads it back, and a key outside the known lists is 422.

Spec: 9.1, 9.24.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'focus1173')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1173: Focus lists round-trip through the account', () => {
  test('AC-1173 defaults, a stored order, and an unknown key refused', async () => {
    const [actor] = await cast.of(app)
    if (!actor) throw new Error('cast must produce an actor')

    const fresh = await actor.browser.json('/settings', 'GET')
    expectStatus(fresh, 200, 'read settings')
    expect((fresh.json() as { focus_lists: string[] }).focus_lists).toEqual([
      'today',
      'scheduled',
      'assignments',
    ])

    const saved = await actor.browser.json('/settings', 'PATCH', {
      focus_lists: ['important', 'today', 'assignments'],
    })
    expectStatus(saved, 200, 'save focus lists')

    const stored = await rows(
      app.db,
      sql`SELECT focus_lists FROM user_settings WHERE user_id = ${actor.id}::uuid`,
    )
    const raw = stored[0]?.focus_lists
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    expect(value, 'the stored row, in order; scheduled gone').toEqual([
      'important',
      'today',
      'assignments',
    ])

    const again = await actor.browser.json('/settings', 'GET')
    expect((again.json() as { focus_lists: string[] }).focus_lists).toEqual([
      'important',
      'today',
      'assignments',
    ])

    const refused = await actor.browser.json('/settings', 'PATCH', { focus_lists: ['everything'] })
    expectStatus(refused, 422, 'unknown key')
  })
})
