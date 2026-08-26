/*
AC-191: given a trashed folder 30 days old, when the 11.7 pass runs, then
the folder and its tasks are permanently gone; given one 29 days old, then
both remain.

Until S2 lands, this test fails at the UPDATE: folders has no deleted_at
column, which is the right reason for this criterion to be red. After S2 it
fails on the purge until S3 teaches the pass its new duty. The pass is
reached through its 11.7 callable, the suite's one sanctioned way in.

Spec: 4.3, 7.13, 11.7 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, seedTask } from './folders-harness.js'
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

describe('AC-191 the 30 day fuse', () => {
  test('31 days purges, 29 does not', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const oldId = await createFolder(owner, 's1 ac191 old enough')
    const youngId = await createFolder(owner, 's1 ac191 too young')
    await seedTask(app.db, { folderId: oldId, createdBy: owner.id })

    await app.db.execute(sql`
      UPDATE folders SET deleted_at = now() - interval '31 days'
      WHERE id = ${oldId}::uuid
    `)
    await app.db.execute(sql`
      UPDATE folders SET deleted_at = now() - interval '29 days'
      WHERE id = ${youngId}::uuid
    `)

    await runPass(app)

    const remaining = await app.db.execute(sql`
      SELECT id FROM folders WHERE id IN (${oldId}::uuid, ${youngId}::uuid)
    `)
    const ids = (remaining.rows as Array<{ id: unknown }>).map((row) =>
      String(row.id),
    )
    expect(ids.includes(oldId), 'the 31 day folder is gone (spec 11.7)').toBe(false)
    expect(ids.includes(youngId), 'the 29 day folder remains (spec 7.13)').toBe(true)

    const orphanTasks = await app.db.execute(sql`
      SELECT id FROM tasks WHERE folder_id = ${oldId}::uuid
    `)
    expect(
      (orphanTasks.rows as unknown[]).length,
      'the purged folder takes its tasks (spec 4.5 cascade)',
    ).toBe(0)
  })
})
