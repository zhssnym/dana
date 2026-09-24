/*
AC-138: Given DELETE /me, then the user row survives scrubbed, google_sub,
email, display_name, and avatar_url null with deleted_at set, and surviving
tasks keep created_by and completed_by pointing at it, readable by remaining
members with the assignee cleared; an accepted invite keeps its accepted_by.

This is the outcome 8.10's ordering exists to protect, the survivors:
history keeps its author while identity is gone, which is what 4.1 stores
soft deletion for and what the client renders as "Deleted user" (from the
display_name this criterion pins at null).

The scrub assertions alone would pass against a trivial implementation; what
makes this file discriminate is the survivor half: the departed member's
assignment must be cleared (step 4's R-CLEAN, or equivalently 4.5's composite
FK once the membership row goes), while created_by and completed_by, both
RESTRICT keys precisely so history cannot be orphaned, still name the
scrubbed row. An implementation that hard-deletes the user, or nulls the
history columns to make deletion easy, fails here on the columns; one that
skips R-CLEAN fails on the assignee.

The folder carries three members, and the third is necessary. R-CLEAN's third
clause assigns every unassigned task to the remaining member when the count
drops to exactly one, which is INV-5, so with two members the departed
assignment would be cleared by the first clause and immediately swept to the
keeper by the third, contradicting "readable by remaining members with the
assignee cleared". With two members remaining, the first clause clears the
assignment and no sweep fires. The drop-to-one interaction belongs to AC-136,
whose fixture holds a folder that drops to one for exactly that purpose.

Spec: 8.10 step 7 and its surviving-references sentence, 4.1 (soft
deletion's rationale), 4.5 (created_by RESTRICT, completed_by, the
composite FK), 4.9 (accepted_by), 5.3, 7.6 (the survivor's read), 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccount, userRowById } from '../support/sharing-harness.js'
import {
  createTaskOk,
  readTask,
  requireTaskRow,
  transitionOk,
} from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'keeper', 'witness'], 'p5')

interface Stage {
  departing: Actor
  keeper: Actor
  witness: Actor
  folderId: string
  createdTaskId: string
  completedTaskId: string
  acceptedInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing, keeper, witness] = await cast.of(app)
    if (departing === undefined || keeper === undefined || witness === undefined) {
      throw new Error('cast must produce three actors')
    }
    // The keeper owns the folder, so nothing here rides transfer: the
    // survivors' half of 8.10 is this file's whole subject.
    await connect(app.db, keeper.id, departing.id)
    const folderId = await createFolder(keeper, 'p5 ac138 keeps history')
    await addMemberOk(keeper, folderId, departing.id)
    // The third member, so the departure leaves two behind and R-CLEAN's
    // INV-5 sweep does not fire over the assignment the first clause just
    // cleared. A signed-in actor rather than a seeded row, because the
    // invariant sweep below reads INV-2 over every id it is given and a
    // seeded user has no default folder to find.
    await connect(app.db, keeper.id, witness.id)
    await addMemberOk(keeper, folderId, witness.id)

    const created = await createTaskOk(
      departing,
      {
        title: 'p5 ac138 authored by the departed',
        folder_id: folderId,
        assignee_id: departing.id,
      },
      'the departing member authors and holds a task (spec 7.6)',
    )
    const completed = await createTaskOk(
      departing,
      {
        title: 'p5 ac138 finished by the departed',
        folder_id: folderId,
        assignee_id: keeper.id,
      },
      'and a second task, theirs to complete (spec 7.6)',
    )
    await transitionOk(
      departing,
      completed.id,
      'complete',
      'the departing member completes it, stamping completed_by (spec 5.1)',
    )

    // An invite the departing account once accepted: inviter is the keeper,
    // accepted_by the departing account. Seeded, since replaying a whole
    // historical acceptance is not this file's subject and the 7.5 create
    // surface has its own eleven files.
    const acceptedInviteId = randomUUID()
    await app.db.execute(sql`
      INSERT INTO invites (id, inviter_id, email, status, accepted_by,
                           responded_at)
      VALUES (${acceptedInviteId}::uuid, ${keeper.id}::uuid,
              ${departing.email}, 'accepted', ${departing.id}::uuid, now())
    `)
    staged = {
      departing,
      keeper,
      witness,
      folderId,
      createdTaskId: created.id,
      completedTaskId: completed.id,
      acceptedInviteId,
    }
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

describe('AC-138: the account dissolves, its history does not', () => {
  test('AC-138: the row survives with identity scrubbed', async () => {
    const { departing } = await stage()
    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )
    const row = await userRowById(app.db, departing.id)
    expect(row, 'soft deletion: the row survives (spec 4.1, 8.10 step 7)').toBeDefined()
    expect(row?.google_sub, 'google_sub scrubbed').toBeNull()
    expect(row?.email, 'email scrubbed').toBeNull()
    expect(row?.display_name, 'display_name scrubbed, the null "Deleted user" renders from').toBeNull()
    expect(row?.avatar_url, 'avatar_url scrubbed').toBeNull()
    expect(row?.deleted_at, 'and deleted_at set, the soft-deletion mark').not.toBeNull()
  })

  test('AC-138: history still names the scrubbed row, the assignment does not', async () => {
    const { departing, keeper, witness, folderId, createdTaskId, completedTaskId } =
      await stage()
    expect(
      [...(await membershipUserIds(app.db, folderId))].sort(),
      'the premise the cleared assignment rests on: two members remain, so R-CLEAN clears the departed assignment and its INV-5 sweep does not fire (spec 5.3)',
    ).toEqual([keeper.id, witness.id].sort())

    const created = await requireTaskRow(app.db, createdTaskId)
    expect(
      created.created_by,
      'created_by keeps pointing at the scrubbed row: 4.5 makes it RESTRICT so history cannot be orphaned',
    ).toBe(departing.id)
    expect(
      created.assignee_id,
      'while the assignment is cleared, step 4\'s R-CLEAN and 4.5\'s composite FK agreeing (spec 8.10, INV-4)',
    ).toBeNull()

    const completed = await requireTaskRow(app.db, completedTaskId)
    expect(
      completed.completed_by,
      'completed_by keeps pointing at the scrubbed row (spec 8.10\'s surviving-references sentence)',
    ).toBe(departing.id)
    expect(
      completed.status,
      'and the completion itself is untouched history (INV-8)',
    ).toBe('completed')
    expect(
      completed.assignee_id,
      'the keeper\'s own assignment on it is not the departed\'s and stands',
    ).toBe(keeper.id)
  })

  /*
  7.0's created_by is the person stub assignee carries, null where 8.10
  scrubbed the account. So a scrubbed author reads null on the wire, while
  8.10's promise is that the row keeps pointing at the scrubbed user; this
  test asserts the column beside the wire so the two are read in one breath.
  An implementation that nulled tasks.created_by to make deletion easy fails
  here, on the column.
  */
  test('AC-138: the remaining member reads the survivors', async () => {
    const { departing, keeper, createdTaskId } = await stage()
    const detail = await readTask(keeper, createdTaskId)
    expect(
      detail.created_by,
      'a scrubbed creator is null on the wire, which is how 8.10\'s "renders as Deleted user" reaches the TaskCard (spec 7.0, 4.1)',
    ).toBeNull()
    expect(
      String((await requireTaskRow(app.db, createdTaskId)).created_by),
      'while the column underneath still names the scrubbed row, which is the surviving-references sentence itself (spec 8.10, 4.5 RESTRICT)',
    ).toBe(departing.id)
    expect(
      detail.assignee,
      'and the card\'s assignee is null, never a person shape pointing at a dissolved account (spec 7.0, INV-4)',
    ).toBeNull()
  })

  test('AC-138: the accepted invite keeps its accepted_by', async () => {
    const { departing, acceptedInviteId } = await stage()
    const found = await rows(
      app.db,
      sql`SELECT status, accepted_by FROM invites WHERE id = ${acceptedInviteId}`,
    )
    expect(found.length, 'the historical acceptance survives (spec 4.9)').toBe(1)
    expect(
      String(found[0]?.accepted_by),
      'accepted_by still names the scrubbed row: 8.10\'s third surviving reference',
    ).toBe(departing.id)
    expect(found[0]?.status, 'as accepted history, not resurrected').toBe(
      'accepted',
    )
  })

  test('AC-138: invariants hold afterwards', async () => {
    const { keeper, witness, folderId } = await stage()
    // Two members remain, so INV-5 has nothing to say about the cleared
    // assignment and the sweep measures what it is here to measure: INV-4
    // over a null assignee, and INV-10 over the memberships that survived.
    await expectFolderInvariants(app.db, [folderId], [keeper.id, witness.id])
  })
})
