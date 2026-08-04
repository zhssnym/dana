/*
AC-013: given the owner of a default folder, when deleting it, then 409.

INV-2 says the default folder is never deleted, 5.4's last row says the
refusal is 409, and 7.4 repeats it for the endpoint. The refusal must also
be a refusal in fact: the folder, its membership, and its tasks must all
survive the attempt, and a stranger probing the same folder must read 404,
because the 409 is for the owner alone.

Spec: 3 (INV-2), 5.4, 7.0, 7.4.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  seedTask,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'])

interface Stage {
  owner: Actor
  stranger: Actor
  defaultId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, stranger] = await cast.of(app)
    if (owner === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const defaultId = await defaultFolderOf(app.db, owner.id)
    const taskId = await seedTask(app.db, {
      folderId: defaultId,
      createdBy: owner.id,
      assigneeId: owner.id,
    })
    staged = { owner, stranger, defaultId, taskId }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-013: the default folder cannot be deleted', () => {
  test('AC-013: deleting the default folder answers 409', async () => {
    const { owner, defaultId } = await stage()
    const response = await owner.browser.api(`/folders/${defaultId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      409,
      'DELETE on the default folder must answer 409 (spec 7.4, INV-2)',
    )
  })

  test('AC-013: the refusal deleted nothing', async () => {
    const { owner, defaultId, taskId } = await stage()
    const entry = await folderInList(owner, defaultId)
    expect(
      entry,
      'the default folder must survive the refused delete (INV-2)',
    ).toBeDefined()
    expect(entry?.is_default).toBe(true)

    const tasks = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${taskId}`,
    )
    expect(tasks, 'the tasks in it must survive too (INV-2)').toBe(1)
  })

  test('AC-013 adversarial: a stranger probing the default folder reads 404', async () => {
    const { stranger, defaultId } = await stage()
    const response = await stranger.browser.api(`/folders/${defaultId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      404,
      'an inaccessible folder must read as nonexistent, never 403 or 409 (spec 7.0, 10.2)',
    )
  })

  test('AC-013: invariants hold afterwards', async () => {
    const { owner, stranger, defaultId } = await stage()
    await expectFolderInvariants(app.db, [defaultId], [owner.id, stranger.id])
  })
})
