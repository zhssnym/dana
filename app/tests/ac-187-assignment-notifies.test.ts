/*
AC-187: given a task assigned to another member, when the assignment
commits, then the assignee gains one unread notification and the actor
gains none.

The never-self rule is asserted as hard as the delivery, because a fan-out
that includes the actor turns every act into noise addressed to its own
author, and 4.14 forbids it in one sentence implementations lose easily.

Spec: 4.14, 7.6, 7.12 (RFC 0005).
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

describe('AC-187 an assignment reaches its assignee', () => {
  test('one unread for the assignee, nothing for the actor', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac187 assign')
    await addMemberOk(owner, folderId, member.id)

    const task = await createTaskOk(
      owner,
      {
        title: 's1 ac187 the assigned task',
        folder_id: folderId,
        assignee_id: member.id,
      },
      'the assignment must commit before its fan-out is read (spec 7.6)',
    )

    const inbox = await member.browser.json('/notifications', 'GET')
    expectStatus(inbox, 200, 'the recipient lists notifications (spec 7.12)')
    const rows = (inbox.json() as { notifications?: unknown }).notifications
    expect(Array.isArray(rows), 'notifications must be a list').toBe(true)
    const mine = (rows as Array<Record<string, unknown>>).filter((row) =>
      JSON.stringify(row).includes(task.id),
    )
    expect(
      mine.length,
      'exactly one notification for the assignment (spec 4.14)',
    ).toBe(1)
    expect(
      (mine[0] as { read_at?: unknown }).read_at ?? null,
      'it arrives unread (spec 4.14)',
    ).toBeNull()

    const actors = await owner.browser.json('/notifications', 'GET')
    expectStatus(actors, 200, 'the actor lists notifications (spec 7.12)')
    expect(
      JSON.stringify(actors.json()).includes(task.id),
      'an actor is never notified of their own act (spec 4.14)',
    ).toBe(false)
  })
})
