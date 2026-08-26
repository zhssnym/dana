/*
AC-192: given a folder owner, when they delete the folder, then deleted_at
is set and each other member gains a notification; given a non-owner member
attempting the delete, then 403 and no change.

The member half restates 5.4's owner-only delete on purpose: v2 turns the
delete into a state change, and a refactor of the handler is exactly when
an old permission check goes missing. The notification half is what makes
scenario 2 of DES-225 honest, a shared folder never silently vanishing.

Spec: 4.3, 5.4, 7.13, 4.14 (RFC 0005).
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
  folderInList,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

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

describe('AC-192 delete is the owner’s, and members hear about it', () => {
  test('member refused; owner’s delete trashes and notifies', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac192 shared')
    await addMemberOk(owner, folderId, member.id)

    const refused = await member.browser.json(`/folders/${folderId}`, 'DELETE')
    expectStatus(refused, 403, 'a member may not delete a shared folder (spec 5.4)')
    expect(
      await folderInList(member, folderId),
      'the refused delete changed nothing',
    ).not.toBeUndefined()

    const deletion = await owner.browser.json(`/folders/${folderId}`, 'DELETE')
    expect(
      [200, 204].includes(deletion.status),
      `the owner's delete must succeed; answered ${String(deletion.status)}`,
    ).toBe(true)

    const trash = await owner.browser.json('/trash', 'GET')
    expectStatus(trash, 200, 'the Trash listing must exist (spec 7.13)')
    expect(
      JSON.stringify(trash.json()).includes(folderId),
      'the deleted folder waits in Trash (spec 7.13)',
    ).toBe(true)

    const inbox = await member.browser.json('/notifications', 'GET')
    expectStatus(inbox, 200, 'the member lists notifications (spec 7.12)')
    expect(
      JSON.stringify(inbox.json()).includes(folderId),
      'each other member is told the folder was deleted (spec 4.14)',
    ).toBe(true)
  })
})
