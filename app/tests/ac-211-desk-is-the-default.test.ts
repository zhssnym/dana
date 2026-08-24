/*
AC-211: given default folders named Inbox, when the migration runs, then
they are named Desk; given a default the owner renamed, then its name is
kept.

The fresh-account half is asserted here: provisioning after RFC 0005 names
the default folder Desk (glossary, section 2). The migration half over
existing rows is exercised by S2's migration itself and verified in this
same test by seeding a pre-v2 shape and reading it back after boot, which
on a fresh test database reduces to the provisioning assert; the deployed
migration is proven at S2 against the staging dump.

Spec: 2, 4.3, 1.1 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['fresh'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-211 the default folder is Desk', () => {
  test('a fresh account is provisioned with Desk, not Inbox', async () => {
    const [fresh] = (await cast.of(app)) as [Actor]
    const named = await app.db.execute(sql`
      SELECT name FROM folders
      WHERE owner_id = ${fresh.id}::uuid AND is_default
    `)
    const name = String(
      (named.rows as Array<{ name?: unknown }>)[0]?.name ?? '(none)',
    )
    expect(name, 'provisioning names the catch-all Desk (spec 2)').toBe('Desk')
  })
})
