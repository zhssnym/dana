/*
AC-138: Given DELETE /me, then the user row survives scrubbed, google_sub,
email, display_name, and avatar_url null with deleted_at set, and surviving
tasks keep created_by and completed_by pointing at it, readable by remaining
members with the assignee cleared; an accepted invite keeps its accepted_by.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text. This file proposed it, the AC-125 to AC-130 precedent for a batch
authored with its tests and numbered additively at a mid-package change
control. The amendment records one reading with it, that this criterion is
admitted although it reaches step 7: the scrub half arrives green against
the P1 stub, and the surviving-reference half is what discriminates.
Routed by the RFC 0001 P5 row's kickoff decision: 8.10's steps
1 to 6, outcome by outcome, and this is the outcome the whole ordering
exists to protect, the survivors: history keeps its author while identity
is gone, which is what 4.1 stores soft deletion for and what the client
renders as "Deleted user" (P8's half of that sentence, drawn from the
display_name this criterion pins at null).

The stub already scrubs, so the scrub assertions alone would arrive green;
what fails today, and what makes this file discriminate, is the survivor
half: the departed member's assignment must be cleared (step 4's R-CLEAN,
or equivalently 4.5's composite FK once the membership row goes), while
created_by and completed_by, both RESTRICT keys precisely so history cannot
be orphaned, still name the scrubbed row. An implementation that
hard-deletes the user, or nulls the history columns to make deletion easy,
fails here on the columns; one that skips R-CLEAN fails on the assignee.

The folder carries three members, and the third exists for a reason worth
stating because the file was written with two and could not pass. R-CLEAN's
third clause assigns every unassigned task to the remaining member when the
count drops to exactly one, which is INV-5, so with two members the
departed assignment was cleared by the first clause and immediately swept
to the keeper by the third. The two assertions below that the assignee ends
null then contradicted this file's own invariant sweep, which asserts INV-5
over the same folder, and the Collaboration engineer escalated it after the
package landed rather than editing either side. A third member is the
repair because it is a fixture change and not a reading change: with two
members remaining, the first clause clears the assignment and no sweep
fires, so section 12's "readable by remaining members with the assignee
cleared" is literally what happens, plural included. The alternative,
expecting the keeper, would have contradicted that sentence and needed a
Steward amendment to the criterion itself.

Nothing is given up by the count. What this criterion discriminates is
untouched by it, an implementation that hard-deletes the user row or nulls
the history columns failing on the columns either way, and the interaction
the two-member fixture would have exercised belongs to AC-136, whose
sentence names the drop-to-one sweep outright and whose own fixture holds a
folder that drops to one for exactly that purpose. AC-134 keeps two members
for the same reason. Moving coverage here would have duplicated that file,
not strengthened this one.

Spec: 8.10 step 7 and its surviving-references sentence, 4.1 (soft
deletion's rationale), 4.5 (created_by RESTRICT, completed_by, the
composite FK), 4.9 (accepted_by), 5.3, 7.6 (the survivor's read), 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { deleteAccount, userRowById } from './sharing-harness.js'
import {
  createTaskOk,
  readTask,
  requireTaskRow,
  transitionOk,
} from './tasks-harness.js'
import { rows } from './helpers.js'

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
  The wire arm of this criterion moved at S18 and the row arm did not.

  RFC 0005 unit 12a widens frozen 7.0's created_by from a bare id to the
  person stub assignee carries, null where 8.10 scrubbed the account. So a
  scrubbed author reads null here where it read the id, and that is the same
  sentence rather than a weaker one: 8.10's promise is that the row keeps
  pointing at the scrubbed user, and this test now re-asserts the column
  beside the wire so the two are read in one breath. An implementation that
  nulled tasks.created_by to make deletion easy still fails here, on the
  column, exactly as it did before; what moved is only how the contract
  renders a creator it may no longer name.
  */
  test('AC-138: the remaining member reads the survivors', async () => {
    const { departing, keeper, createdTaskId } = await stage()
    const detail = await readTask(keeper, createdTaskId)
    expect(
      detail.created_by,
      'a scrubbed creator is null on the wire, which is 8.10\'s "renders as Deleted user" as unit 12a puts it on TaskCard (spec 7.0, 4.1)',
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
