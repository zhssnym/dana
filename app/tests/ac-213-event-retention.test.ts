/*
AC-213: given events older than 90 days, when the 11.7 pass runs, then they
are purged and newer events remain.

Retention is the difference between a history and a hoard: 4.13 fixes 90
days and the pass owns the broom. Until S2 the INSERT fails on the missing
table, which is this criterion red for the right reason; after S3 the purge
itself is the assertion.

Spec: 4.13, 11.7 (RFC 0005).
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { runPass } from './reminders-harness.js'

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

describe('AC-213 ninety days of history', () => {
  test('the pass sweeps the old and keeps the recent', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac213 retention')

    const oldId = randomUUID()
    const newId = randomUUID()
    await app.db.execute(sql`
      INSERT INTO events (id, actor_id, verb, subject_kind, subject_id,
                          subject_name, folder_id, created_at)
      VALUES
        (${oldId}::uuid, ${owner.id}::uuid, 'created', 'folder',
         ${folderId}::uuid, 's1 ac213 old', ${folderId}::uuid,
         now() - interval '91 days'),
        (${newId}::uuid, ${owner.id}::uuid, 'renamed', 'folder',
         ${folderId}::uuid, 's1 ac213 new', ${folderId}::uuid,
         now() - interval '89 days')
    `)

    await runPass(app)

    const remaining = await app.db.execute(sql`
      SELECT id FROM events WHERE id IN (${oldId}::uuid, ${newId}::uuid)
    `)
    const ids = (remaining.rows as Array<{ id: unknown }>).map((row) =>
      String(row.id),
    )
    expect(ids.includes(oldId), 'the 91 day event is purged (spec 4.13)').toBe(false)
    expect(ids.includes(newId), 'the 89 day event remains (spec 4.13)').toBe(true)
  })
})
