/*
AC-188: given unread notifications, when the recipient marks one read and
then all read, then read_at is set accordingly and the unread count agrees
at each step.

The count is asserted between every step rather than at the end, because
the badge is the one consumer that reads it and a count derived from the
wrong predicate (all rather than unread) shows the same final zero.

Spec: 4.14, 7.12 (RFC 0005).
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

async function unreadOf(actor: Actor): Promise<number> {
  const listed = await actor.browser.json('/notifications', 'GET')
  expectStatus(listed, 200, 'the recipient lists notifications (spec 7.12)')
  const rows = (listed.json() as { notifications?: unknown }).notifications
  return (rows as Array<{ read_at?: unknown }>).filter(
    (row) => (row.read_at ?? null) === null,
  ).length
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-188 read, then read all', () => {
  test('read_at moves and the unread count agrees at each step', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac188 reads')
    await addMemberOk(owner, folderId, member.id)
    for (const title of ['s1 ac188 first', 's1 ac188 second']) {
      await createTaskOk(
        owner,
        { title, folder_id: folderId, assignee_id: member.id },
        'two assignments must commit to stage two unread rows (spec 7.6)',
      )
    }
    expect(await unreadOf(member), 'two unread staged (spec 4.14)').toBe(2)

    const listed = await member.browser.json('/notifications', 'GET')
    const first = ((listed.json() as { notifications?: unknown })
      .notifications as Array<{ id?: string }>)[0]
    const readOne = await member.browser.json(
      `/notifications/${String(first?.id)}/read`,
      'POST',
    )
    expectStatus(readOne, 200, 'one row marks read (spec 7.12)')
    expect(await unreadOf(member), 'one remains unread').toBe(1)

    const readAll = await member.browser.json('/notifications/read-all', 'POST')
    expectStatus(readAll, 200, 'read-all answers (spec 7.12)')
    expect(await unreadOf(member), 'none remain unread').toBe(0)
  })
})
