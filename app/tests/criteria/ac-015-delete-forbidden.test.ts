/*
AC-015: given a non-owner member, when deleting the folder, then 403.

The matrix row is the same shape as AC-011's rename, and so is the trap: the
refusal must be 403 for a member and 404 for a stranger (7.0's leak rule),
and it must leave the folder's contents whole, because a delete that fails
after cascading is worse than one that succeeds.

Spec: 5.4, 7.0, 7.4, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'])

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, stranger] = await cast.of(app)
    if (owner === undefined || member === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'p2 ac015 shared')
    await addMemberOk(owner, folderId, member.id)
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: owner.id,
      assigneeId: member.id,
    })
    staged = { owner, member, stranger, folderId, taskId }
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

describe('AC-015: deleting is refused to non-owner members', () => {
  test('AC-015: a non-owner member deleting the folder answers 403', async () => {
    const { member, folderId } = await stage()
    const response = await member.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      403,
      'DELETE /folders/:id by a non-owner member must answer 403 (spec 5.4, 7.4)',
    )
  })

  test('AC-015: the refusal deleted nothing', async () => {
    const { owner, member, folderId, taskId } = await stage()
    for (const viewer of [owner, member]) {
      expect(
        await folderInList(viewer, folderId),
        'the folder must survive the refused delete for every member (spec 5.4)',
      ).toBeDefined()
    }
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${taskId}`,
      ),
      'its tasks must survive too (spec 5.4)',
    ).toBe(1)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folder_members WHERE folder_id = ${folderId}`,
      ),
      'both memberships must survive (spec 5.4)',
    ).toBe(2)
  })

  test('AC-015 adversarial: a stranger deleting reads 404, never 403', async () => {
    const { stranger, folderId } = await stage()
    const response = await stranger.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      404,
      'an inaccessible folder must read as nonexistent (spec 7.0, 10.2)',
    )
  })

  test('AC-015: invariants hold afterwards', async () => {
    const { owner, member, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, member.id, stranger.id],
    )
  })
})
