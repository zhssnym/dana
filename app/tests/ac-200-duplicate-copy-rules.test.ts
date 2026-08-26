/*
AC-200: given a folder duplicated, then the copy carries tasks, sections,
paragraphs, and section assignments; carries no members, comments,
assignees, or completion; and belongs to the duplicator alone. When the
folder's earliest date has passed, the whole plan re-anchors on today with
its intervals kept; a plan still ahead copies untouched.

DES-198's rules as one criterion, because they are one rule: a copy takes
the structure, never the grants or the progress. The staging builds a
folder with every kind of thing a copy must and must not carry.

Spec: 7.16, 9.6 (RFC 0005), DES-198 as recorded in v2-decisions.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
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
    /*
    DES-198's date rule as the design record settles it: when the folder's
    earliest date has passed, the whole plan re-anchors so the intervals
    hold, the earliest date landing on today and every other date moving by
    the same days. This test first asserted the future date verbatim, which
    was the per-date rule DES-198 rejected; corrected at S5's change
    control. The shifted dates are computed from the database's own
    current_date so the assertion and the implementation share a clock.
    */
    const anchored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM tasks
          WHERE folder_id = ${copyId} AND title = 's1 ac200 spent deadline'
            AND due_date = current_date`,
    )
    expect(
      anchored,
      'the earliest spent date lands on today (DES-198: the plan re-anchors)',
    ).toBe(1)
    const shifted = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM tasks
          WHERE folder_id = ${copyId} AND title = 's1 ac200 future deadline'
            AND due_date = ('2030-01-15'::date
                            + (current_date - '2026-08-01'::date))`,
    )
    expect(
      shifted,
      'every other date moves by the same days, the intervals being what a template keeps (DES-198)',
    ).toBe(1)
    expect(
      text.includes('2026-08-01'),
      'the spent date itself never survives verbatim (DES-198)',
    ).toBe(false)
    void future
  })
})
