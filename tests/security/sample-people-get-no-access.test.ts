/*
Given an account that kept its sample workspace, when it is deleted
(DELETE /me), then no page is handed to a sample person: the sample people
are members of every sample page, but nobody can sign in as them, so 8.9's
transfer and 8.10 step 2 look past them and the pages go with the account.

Data loss the other way round: before, a sample person was always the
earliest other member, so every sample page (and whatever the person wrote in
it) survived deletion, owned by a users row nobody can reach.

Asserted on stored rows. Spec: 7.20, 8.9, 8.10.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import { deleteAccount } from '../support/sharing-harness.js'
import { rows } from '../support/helpers.js'
import { inTransaction } from '../../src/server/database.js'
import { SAMPLE_PEOPLE } from '../../src/server/sample/content.js'
import { createSampleWorkspace } from '../../src/server/sample/workspace.js'

let app: AuthTestApp
const cast = new Cast(['departing'], 'ac1176')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await app.close()
})

describe('sample people never inherit a page', () => {
  test('deleting an account that kept its sample leaves no page owned by a sample person', async () => {
    const [departing] = await cast.of(app)
    if (departing === undefined) throw new Error('cast must produce one actor')
    await inTransaction(app.db, (tx) => createSampleWorkspace(tx, departing.id, 'UTC'))

    const before = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders
          WHERE owner_id = ${departing.id}::uuid AND NOT is_default AND deleted_at IS NULL`,
    )
    expect(Number(before[0]?.n)).toBeGreaterThan(0)

    expectStatus(await deleteAccount(departing), 204, 'the account is deleted (8.10)')

    const sampleIds = SAMPLE_PEOPLE.map((person) => person.id)
    const inherited = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders
          WHERE owner_id IN (${sql.join(sampleIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
    )
    expect(inherited[0]?.n).toBe(0)
  })
})
