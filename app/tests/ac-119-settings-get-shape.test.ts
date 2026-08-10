/*
AC-119 (P2S): Given a fresh account, when GET /me/settings, then
200 and the body is exactly the three 7.2 booleans at their 4.10 defaults:
show_important true, show_all true, show_done false, nothing extra, nothing
missing.

Exactly is the criterion's word, as in AC-116, so the assertion is an exact
key set with strictly boolean values: an extra key (user_id, updated_at) is
as much a drift as a missing one. The defaults are 4.10's own sentence,
Done ships hidden.

The adversarial companion flips the stored row directly and reads it back,
because a handler that answers hardcoded defaults passes every fresh-account
check while never reading the table. Seeding that flip through the database
rather than through PATCH /me/settings is deliberate: this file is the GET
criterion, and setup through the sibling endpoint under test in ac-120 would
let one defect fail both files in a shape neither names.

This file was red until P2S landed the endpoint, every case answering 404
on the route; it passes since that merge.

Spec: 7.2 (frozen), 4.10, 7.0, 7.1; RFC 0001 P2S row; proposed here and
numbered by the Steward's section 12 amendment on 2026-08-04.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  SETTINGS_DEFAULTS,
  expectEnvelopedStatus,
  meSettingsKey,
  readSettings,
  storedSettings,
} from './settings-harness.js'

let app: AuthTestApp
const cast = new Cast(['settings-reader'])

async function reader(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (actor === undefined) throw new Error('cast must produce one actor')
  return actor
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-119: GET /me/settings answers exactly the 7.2 booleans', () => {
  test('AC-119: a fresh account reads the 4.10 defaults in exactly the 7.2 shape', async () => {
    const actor = await reader()
    const settings = await readSettings(actor)
    expect(
      settings,
      'a fresh account must read show_important true, show_all true, show_done false (spec 4.10: Done ships hidden)',
    ).toEqual(SETTINGS_DEFAULTS)
  })

  test('AC-119 adversarial: the body is this account\'s stored row, not just any shape', async () => {
    const actor = await reader()
    expect(
      await storedSettings(app.db, actor.id),
      'the wire and the row must agree before the flip',
    ).toEqual(await readSettings(actor))

    // A handler answering constants passes the defaults case; only a read
    // of the row can answer true here, because no request wrote it.
    await app.db.execute(sql`
      UPDATE user_settings SET show_done = true WHERE user_id = ${actor.id}
    `)
    const flipped = await readSettings(actor)
    expect(
      flipped.show_done,
      'GET /me/settings must read the stored row, which now holds show_done true (spec 7.2)',
    ).toBe(true)
    expect(
      { show_important: flipped.show_important, show_all: flipped.show_all },
      'the unflipped columns must still read their stored values (spec 7.2)',
    ).toEqual({ show_important: true, show_all: true })

    await app.db.execute(sql`
      UPDATE user_settings SET show_done = false WHERE user_id = ${actor.id}
    `)
  })

  test('AC-119: GET /me and GET /me/settings tell one truth', async () => {
    // AC-116 pins the /me settings key's shape; this pins that the two
    // endpoints read one row rather than two copies that can drift.
    const actor = await reader()
    expect(
      await meSettingsKey(actor),
      'the settings key of GET /me must equal the GET /me/settings body (spec 7.1, 7.2)',
    ).toEqual(await readSettings(actor))
  })

  test('AC-119 adversarial: no session answers 401 in the envelope', async () => {
    const stranger = app.browser()
    const response = await stranger.api('/me/settings')
    expectEnvelopedStatus(response, 401, 'GET /me/settings without a session')
  })

  test('AC-119: a read requires no CSRF token', async () => {
    // 7.0 requires the header on mutations only; a blanket check would
    // break every page load (the ac-111 negative half, on this endpoint).
    const actor = await reader()
    const bare = await actor.browser.api('/me/settings', { csrf: 'omit' })
    expect(
      bare.status,
      'a GET must not require a CSRF token (spec 7.0: mutations only)',
    ).toBe(200)
  })
})
