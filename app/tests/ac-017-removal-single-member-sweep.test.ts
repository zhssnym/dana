/*
AC-017: given a removal leaves exactly one member, then every unassigned
task in the folder is assigned to the remaining member (INV-5).

The sharp edge is the word every. R-CLEAN says every unassigned task and
INV-5 says every task, neither with a status qualifier, so the sweep covers
completed and abandoned rows too; an implementation that sweeps only
pending satisfies the obvious reading and violates the written one. The
composite foreign key path is also in play: the removal deletes the
membership row, which SET NULLs the leaver's own assignments, and those
must then be swept up with the rest.

Spec: 3 (INV-5), 5.3, 7.4, 8.8.
*/
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
  removeMember,
  seedTask,
  taskAssignee,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'leaver'])

interface Stage {
  owner: Actor
  leaver: Actor
  folderId: string
  assignedToLeaver: string
  unassignedPending: string
  unassignedCompleted: string
  unassignedAbandoned: string
  alreadyOwners: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, leaver] = await cast.of(app)
    if (owner === undefined || leaver === undefined) {
      throw new Error('cast must produce two actors')
    }
    const db = app.db
    await connect(db, owner.id, leaver.id)
    const folderId = await createFolder(owner, 'p2 ac017 shrinking')
    await addMemberOk(owner, folderId, leaver.id)

    staged = {
      owner,
      leaver,
      folderId,
      assignedToLeaver: await seedTask(db, {
        folderId,
        createdBy: owner.id,
        assigneeId: leaver.id,
      }),
      unassignedPending: await seedTask(db, {
        folderId,
        createdBy: owner.id,
      }),
      unassignedCompleted: await seedTask(db, {
        folderId,
        createdBy: owner.id,
        status: 'completed',
      }),
      unassignedAbandoned: await seedTask(db, {
        folderId,
        createdBy: owner.id,
        status: 'abandoned',
      }),
      alreadyOwners: await seedTask(db, {
        folderId,
        createdBy: owner.id,
        assigneeId: owner.id,
      }),
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

describe('AC-017: dropping to one member assigns every unassigned task to them', () => {
  test('AC-017: the removal that empties the folder to one member answers 204', async () => {
    const { owner, leaver, folderId } = await stage()
    const response = await removeMember(owner, folderId, leaver.id)
    expectStatus(
      response,
      204,
      'the removal must succeed before the sweep can be observed (spec 7.4)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'exactly the owner must remain (spec 5.3)',
    ).toEqual([owner.id])
  })

  test('AC-017: the never-assigned pending task is swept to the remaining member', async () => {
    const { owner, unassignedPending } = await stage()
    expect(
      await taskAssignee(app.db, unassignedPending),
      'every unassigned task goes to the remaining member (INV-5, 5.3 R-CLEAN)',
    ).toBe(owner.id)
  })

  test('AC-017 adversarial: the sweep covers completed and abandoned rows too', async () => {
    const { owner, unassignedCompleted, unassignedAbandoned } = await stage()
    expect(
      await taskAssignee(app.db, unassignedCompleted),
      'INV-5 says every task, so the completed row is swept (spec 3)',
    ).toBe(owner.id)
    expect(
      await taskAssignee(app.db, unassignedAbandoned),
      'INV-5 says every task, so the abandoned row is swept (spec 3)',
    ).toBe(owner.id)
  })

  test('AC-017 adversarial: the leaver freed assignment is swept up as well', async () => {
    // The membership deletion SET NULLs this row (4.5); the same transaction
    // must then hand it to the remaining member rather than leave the null.
    const { owner, assignedToLeaver } = await stage()
    expect(
      await taskAssignee(app.db, assignedToLeaver),
      'the task the removal itself unassigned is unassigned no longer (INV-5)',
    ).toBe(owner.id)
  })

  test('AC-017: the already-assigned task did not move', async () => {
    const { owner, alreadyOwners } = await stage()
    expect(
      await taskAssignee(app.db, alreadyOwners),
      'a task already assigned to the remaining member is untouched (5.3)',
    ).toBe(owner.id)
  })

  test('AC-017: invariants hold afterwards, INV-5 included', async () => {
    const { owner, leaver, folderId } = await stage()
    await expectFolderInvariants(app.db, [folderId], [owner.id, leaver.id])
  })
})
