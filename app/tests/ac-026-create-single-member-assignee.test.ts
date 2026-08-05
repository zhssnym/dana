/*
AC-026: given creation in a single-member folder with assignee_id null in
the body, then the stored assignee is that member.

The attack is the reading of an explicit null. A body that omits
assignee_id takes 7.6's default of V; a body that sends null looks like a
request to leave the task unassigned, and an implementation that honors it
lands a null assignee in a folder with exactly one member, which is INV-5
violated at the moment of creation. 7.6 settles it in the other direction:
a single-member folder forces the assignee to that member.

Both readings are covered, explicit null and absent, because an
implementation that gets one right can still get the other wrong: the
default and the forcing are two rules, and only the second survives a null.

Deliberately not asserted here: what a single-member folder does with a
body naming somebody who is not its member. 7.6 carries both a composite-FK
422 and "forces assignee to that member ignoring the input", and which one
governs is a reading this file does not need; AC-033 pins the non-member
refusal in a multi-member folder, where only one rule applies.

Spec: 7.6 (POST /tasks, the assignee default and the single-member
forcing), INV-5, INV-4, 4.5 (the composite FK).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  defaultFolderOf,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['solo'], 'p3')

interface Stage {
  solo: Actor
  folderId: string
  inboxId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [solo] = await cast.of(app)
    if (solo === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(solo, 'p3 ac026 solo folder')
    const inboxId = await defaultFolderOf(app.db, solo.id)
    staged = { solo, folderId, inboxId }
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

describe('AC-026: a single-member folder forces the assignee', () => {
  test('AC-026: the folder under test really has exactly one member', async () => {
    const { solo, folderId } = await stage()
    expect(
      await membershipUserIds(app.db, folderId),
      'the forcing rule turns on the member count, so the premise is asserted before the case',
    ).toEqual([solo.id])
  })

  test('AC-026: assignee_id null in the body stores that member', async () => {
    const { solo, folderId } = await stage()
    const body = await createTaskOk(
      solo,
      { title: 'p3 ac026 explicit null', folder_id: folderId, assignee_id: null },
      'a create carrying an explicit null assignee in a single-member folder must be accepted (spec 7.6)',
    )
    const assignee = body.assignee as Record<string, unknown> | null
    expect(
      assignee,
      'a single-member folder forces the assignee to that member, ignoring the input (spec 7.6, INV-5)',
    ).not.toBeNull()
    expect((assignee as Record<string, unknown>).id).toBe(solo.id)

    const row = await requireTaskRow(app.db, body.id)
    expect(
      row.assignee_id === null ? null : String(row.assignee_id),
      'the stored assignee is the folder\'s one member, not the null that was sent',
    ).toBe(solo.id)
  })

  test('AC-026 adversarial: an omitted assignee_id stores the same member', async () => {
    const { solo, folderId } = await stage()
    const body = await createTaskOk(
      solo,
      { title: 'p3 ac026 omitted', folder_id: folderId },
      'a create omitting assignee_id must be accepted (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, body.id)
    expect(
      row.assignee_id === null ? null : String(row.assignee_id),
      'the 7.6 default is V, who is the folder\'s one member here',
    ).toBe(solo.id)
  })

  test('AC-026 adversarial: no task in the folder is left unassigned', async () => {
    const { folderId } = await stage()
    // The sweep asks about every row in the folder rather than the two the
    // cases above name, so a create that forces on one path and not another
    // is caught by whichever path it missed.
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE folder_id = ${folderId} AND assignee_id IS NULL`,
      ),
      'INV-5: in a folder with exactly one member every task is assigned to that member',
    ).toBe(0)
  })

  test('AC-026: invariants hold afterwards', async () => {
    const { solo, folderId, inboxId } = await stage()
    await expectTaskInvariants(app.db, [], [folderId, inboxId], [solo.id])
  })
})
