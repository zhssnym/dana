/*
AC-189: given a task, when it is deleted, then deleted_at is set, the row
leaves every section 6 query, and it appears in the Trash listing of every
member of its folder.

Deletion stops being an ending and becomes a state (RFC 0005, 4.5). The
sharp edge is the second clause: a soft delete that sets the column and
forgets one query keeps the task visible somewhere, which is worse than a
hard delete because it looks like corruption. This test drives the default
folder's simplest case: delete, then read the open list and Today, then
read Trash. The Trash read asserts membership scope, not deleter scope, by
listing as the same viewer who deleted; AC-190 takes the other-member half.

Spec: 4.5, 6, 7.13 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedTask,
} from './folders-harness.js'
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

describe('AC-189 a deleted task waits in Trash', () => {
  test('delete sets the state, empties the queries, fills the Trash', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac189 trash')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: owner.id,
      title: 's1 ac189 the deleted task',
    })

    const deletion = await owner.browser.json(`/tasks/${taskId}`, 'DELETE')
    expect(
      [200, 204].includes(deletion.status),
      `the delete must succeed; answered ${String(deletion.status)}`,
    ).toBe(true)

    const folderView = await owner.browser.json(
      `/folders/${folderId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(folderView, 200, 'the folder view must still answer (spec 6 Q7)')
    expect(
      JSON.stringify(folderView.json()).includes(taskId),
      'a deleted task must leave the folder view (RFC 0005, section 6 guard)',
    ).toBe(false)

    const trash = await owner.browser.json('/trash', 'GET')
    expectStatus(trash, 200, 'the Trash listing must exist (spec 7.13)')
    expect(
      JSON.stringify(trash.json()).includes(taskId),
      'the deleted task must wait in Trash inside its 30 days (spec 7.13)',
    ).toBe(true)
  })
})
