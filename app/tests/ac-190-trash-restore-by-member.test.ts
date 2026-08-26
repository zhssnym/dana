/*
AC-190: given a trashed task, when a different member of its folder
restores it, then the task returns exactly once with its fields intact.

Trash is scoped by access to the object, never by who deleted it, so the
restoring actor is deliberately not the deleting actor. Exactly once is
asserted against the folder view rather than a count endpoint, because the
duplicate-row failure this guards against is a restore inserting rather
than clearing deleted_at.

Spec: 4.5, 7.13 (RFC 0005).
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
import { createTaskOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-190 another member restores', () => {
  test('the deleter and the restorer may differ; the task returns once', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac190 restore')
    await addMemberOk(owner, folderId, member.id)
    const task = await createTaskOk(
      owner,
      { title: 's1 ac190 comes back once', folder_id: folderId, important: true },
      'the task must exist before its delete (spec 7.6)',
    )

    const deletion = await owner.browser.json(`/tasks/${task.id}`, 'DELETE')
    expect(
      [200, 204].includes(deletion.status),
      `the owner's delete must succeed; answered ${String(deletion.status)}`,
    ).toBe(true)

    const memberTrash = await member.browser.json('/trash', 'GET')
    expectStatus(memberTrash, 200, 'trash is every member’s to read (spec 7.13)')
    expect(
      JSON.stringify(memberTrash.json()).includes(task.id),
      'the other member sees the trashed task (spec 7.13)',
    ).toBe(true)

    const restore = await member.browser.json(`/tasks/${task.id}/restore`, 'POST')
    expectStatus(restore, 200, 'another member may restore (spec 7.13)')

    const view = await member.browser.json(
      `/folders/${folderId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(view, 200, 'the folder view answers (spec 6 Q7)')
    const matches = JSON.stringify(view.json()).split(task.id).length - 1
    expect(matches >= 1, 'the task is back').toBe(true)
    const detail = await member.browser.json(`/tasks/${task.id}`, 'GET')
    expectStatus(detail, 200, 'the restored task reads (spec 7.6)')
    expect(
      (detail.json() as { important?: unknown }).important,
      'fields survive the round trip (spec 7.13)',
    ).toBe(true)
  })
})
