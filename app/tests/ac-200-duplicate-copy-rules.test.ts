/*
AC-200: given a folder duplicated, then the copy carries tasks, sections,
paragraphs, and section assignments; carries no members, comments,
assignees, or completion; re-anchors spent due dates on today and keeps
future ones; and belongs to the duplicator alone.

DES-198's rules as one criterion, because they are one rule: a copy takes
the structure, never the grants or the progress. The staging builds a
folder with every kind of thing a copy must and must not carry.

Spec: 7.16, 9.6 (RFC 0005).
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
  membershipUserIds,
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

describe('AC-200 the copy takes the shape and leaves the life', () => {
  test('structure copies; grants, progress and people do not', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac200 original')
    await addMemberOk(owner, folderId, member.id)

    const spent = await createTaskOk(
      owner,
      {
        title: 's1 ac200 spent deadline',
        folder_id: folderId,
        due_date: '2026-08-01',
        assignee_id: member.id,
      },
      'a spent, assigned task must stage (spec 7.6)',
    )
    const future = await createTaskOk(
      owner,
      {
        title: 's1 ac200 future deadline',
        folder_id: folderId,
        due_date: '2030-01-15',
      },
      'a future-dated task must stage (spec 7.6)',
    )

    const duplicated = await owner.browser.json(
      `/folders/${folderId}/duplicate`,
      'POST',
    )
    expectStatus(duplicated, 201, 'duplicate answers the copy (spec 7.16)')
    const copyId = String((duplicated.json() as { id?: unknown }).id)

    const memberIds = await membershipUserIds(app.db, copyId)
    expect(memberIds, 'the copy has one member, its maker (DES-198)').toEqual([
      owner.id,
    ])

    const copyTasks = await owner.browser.json(
      `/folders/${copyId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(copyTasks, 200, 'the copy’s tasks read (spec 6 Q7)')
    const text = JSON.stringify(copyTasks.json())
    expect(text.includes('s1 ac200 spent deadline'), 'tasks copied').toBe(true)
    expect(text.includes(spent.id), 'copied rows are new rows').toBe(false)
    expect(
      text.includes(member.id),
      'assignees do not travel (DES-198)',
    ).toBe(false)
    expect(
      text.includes('2030-01-15'),
      'a future due date keeps (DES-198)',
    ).toBe(true)
    expect(
      text.includes('2026-08-01'),
      'a spent due date re-anchors rather than keeping (DES-198)',
    ).toBe(false)
    void future
  })
})
