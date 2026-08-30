/*
AC-276: given a trashed task and a trashed folder in a shared folder, when a
member who is not the owner asks for either to be deleted permanently, then
the answer is 403 and both rows still wait in Trash; and given a person who
is not a member at all, then the answer is 404, ownership being invisible to
those without it.

RFC 0005 change control item 36 declined to decide who may press this in a
shared folder, naming the hazard: permanently destroying a co-member's
attachments is not the same permission as a delete that is reversible for
thirty days. Item 38 answered it for folders, the owner holding full rights,
and S28a's item 52 reads the same answer onto tasks for the same hazard: a
task's conversation carries co-members' attachments, and a non-owner's act
on the folder is leave. The 403 rather than 10.2's 404 is deliberate: the
member can see the row in Trash, so hiding it would tell them something
untrue, and the refusal is the one 7.4's folder delete already gives a
member.

Spec: 7.13 as amended (RFC 0005 change control items 36, 38 and 52), 5.4,
10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk, deleteTask } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 's28a')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-276 permanent deletion is the owner\'s alone', () => {
  test('a member is refused with 403, a stranger meets 404, and the rows still wait', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    await connect(app.db, owner.id, member.id)

    const home = await createFolder(owner, 's28a ac276 home')
    await addMemberOk(owner, home, member.id)
    const task = await createTaskOk(
      owner,
      { title: 's28a ac276 trashed task', folder_id: home },
      'the task must exist before it is trashed (spec 7.6)',
    )
    expectStatus(await deleteTask(member, task.id), 204, 'any member may soft-delete (spec 5.4)')

    const doomed = await createFolder(owner, 's28a ac276 trashed folder')
    await addMemberOk(owner, doomed, member.id)
    expectStatus(
      await owner.browser.json(`/folders/${doomed}`, 'DELETE'),
      200,
      'the owner soft-deletes the folder (spec 7.13)',
    )

    for (const path of [`/trash/tasks/${task.id}`, `/trash/folders/${doomed}`]) {
      const refused = await member.browser.json(path, 'DELETE')
      expectStatus(
        refused,
        403,
        `a member who is not the owner is refused at DELETE ${path} (item 38: the owner holds full rights)`,
      )
      const invisible = await stranger.browser.json(path, 'DELETE')
      expectStatus(
        invisible,
        404,
        `a non-member meets not-found at DELETE ${path} (spec 10.2)`,
      )
    }

    const trash = await member.browser.json('/trash', 'GET')
    expectStatus(trash, 200, 'trash reads (spec 7.13)')
    const listed = JSON.stringify(trash.json())
    expect(listed.includes(task.id), 'the task still waits in Trash').toBe(true)
    expect(listed.includes(doomed), 'the folder still waits in Trash').toBe(true)

    const restore = await member.browser.json(`/tasks/${task.id}/restore`, 'POST')
    expectStatus(restore, 200, 'and a member may still restore it (spec 7.13)')
  })
})
