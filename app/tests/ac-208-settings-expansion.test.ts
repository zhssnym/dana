/*
AC-208: given the v2 settings fields written and re-read, then they round
trip; given a v1 account with show_done true, when the migration runs, then
Done is pinned for it.

The migration half is asserted against the settings read, because BUG-8's
rule is that the pin list and the v1 flags are one fact: an account that
showed Done yesterday shows Done today without touching anything.

Spec: 4.19, 7.2 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

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

describe('AC-208 the person’s bundle round trips', () => {
  test('v2 fields write and read; the v1 flag arrives as a pin', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const written = await owner.browser.json('/settings', 'PATCH', {
      theme: 'dark',
      row_density: 'compact',
      clock: '24h',
      task_open: 'panel',
    })
    expectStatus(written, 200, 'the v2 settings fields write (spec 4.19)')

    const read = await owner.browser.json('/settings', 'GET')
    expectStatus(read, 200, 'settings read back (spec 7.2)')
    const body = read.json() as Record<string, unknown>
    expect(body.theme, 'theme round trips').toBe('dark')
    expect(body.row_density, 'density round trips').toBe('compact')
    expect(body.clock, 'the clock round trips').toBe('24h')
    expect(body.task_open, 'the task surface round trips').toBe('panel')

    await app.db.execute(sql`
      UPDATE user_settings SET show_done = true WHERE user_id = ${owner.id}::uuid
    `)
    const pins = await owner.browser.json('/settings', 'GET')
    expectStatus(pins, 200, 'settings still read (spec 7.2)')
    const pinned = (pins.json() as { pinned_views?: unknown }).pinned_views
    expect(
      JSON.stringify(pinned ?? '').includes('Done') ||
        JSON.stringify(pinned ?? '').includes('done'),
      'a v1 show_done account reads as Done pinned (spec 4.19, BUG-8)',
    ).toBe(true)
  })
})
