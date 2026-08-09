/*
AC-134: Given DELETE /me by the owner of shared folders, then each survives
under the remaining member with the earliest join, ties to the lower user
id, the new owner's membership row otherwise unchanged, and the deleted
owner's membership and assignments in it are gone.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text. This file proposed it, the AC-125 to AC-130 precedent for a batch
authored with its tests and numbered additively at a mid-package change
control. Routed by the RFC 0001 P5 row's kickoff decision: 8.10's steps
1 to 6, outcome by outcome, and this is step 2's, the 8.9 rule with its
second caller (owner leave, its first, is AC-019's).

Both halves of 8.9's rule are exercised, because each discards a different
wrong implementation: a folder whose members joined apart goes to the
earliest join even when that member has the higher id, and a folder whose
members joined at the same instant goes to the lower id. The tie needs
seeded join instants, the AC-019 precedent, since no API can be asked to
produce two equal timestamps; the members are seeded rows throughout, the
AC-124 precedent, because the rule reads created_at and id and a session
would buy nothing the columns can tell apart.

What "otherwise unchanged" pins: ownership is folders.owner_id alone, one
source of truth, so the new owner's membership row keeps role member and its
original created_at. And step 4 follows step 2, so the departed owner's
membership is gone and their assigned tasks in the folder are unassigned;
with two members remaining, INV-5's single-member sweep stays out of it.

DELETE /me is the P1 stub today, steps 7 and 8, so this file fails on
owner_id still naming the departed account: wrong behavior, not absence.

Spec: 8.10 step 2, 8.9 (the deterministic rule, its two callers), 4.3
(owner_id, the RESTRICT tripwire), 4.4 (created_at drives the order), 5.3,
INV-2, INV-10.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
  seedMembership,
  seedTask,
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { deleteAccount } from './sharing-harness.js'
import { taskRow } from './tasks-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['departing'], 'p5')

interface Stage {
  departing: Actor
  /** Joined apart: early has the higher uuid on purpose when possible, but
   * the case never depends on it; what decides is created_at. */
  earlyId: string
  lateId: string
  apartFolderId: string
  /** Joined at one instant: only the id can decide. */
  tiedLowId: string
  tiedHighId: string
  tiedFolderId: string
  assignedTaskId: string
}
let staged: Stage | undefined

async function folderOwner(folderId: string): Promise<string> {
  const found = await rows(
    app.db,
    sql`SELECT owner_id FROM folders WHERE id = ${folderId}`,
  )
  expect(found.length, `folder ${folderId} must survive the deletion`).toBe(1)
  return String(found[0]?.owner_id)
}

async function membershipRow(
  folderId: string,
  userId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rows(
    app.db,
    sql`
      SELECT role, to_char(created_at AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
        FROM folder_members
       WHERE folder_id = ${folderId} AND user_id = ${userId}
    `,
  )
  return found[0]
}

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing] = await cast.of(app)
    if (departing === undefined) {
      throw new Error('cast must produce the departing owner')
    }

    const apartFolderId = await createFolder(departing, 'p5 ac134 joined apart')
    const earlyId = await seedUser(app.db, 'ac134-early')
    const lateId = await seedUser(app.db, 'ac134-late')
    cast.trackUser(earlyId)
    cast.trackUser(lateId)
    await seedMembership(app.db, apartFolderId, earlyId, {
      createdAt: '2026-08-01T08:00:00Z',
    })
    await seedMembership(app.db, apartFolderId, lateId, {
      createdAt: '2026-08-02T08:00:00Z',
    })
    // The departing owner's assignment, which step 4's R-CLEAN must clear
    // once the folder is somebody else's.
    const assignedTaskId = await seedTask(app.db, {
      folderId: apartFolderId,
      createdBy: departing.id,
      assigneeId: departing.id,
      title: 'p5 ac134 was mine',
    })

    const tiedFolderId = await createFolder(departing, 'p5 ac134 joined together')
    const seededA = await seedUser(app.db, 'ac134-tied-a')
    const seededB = await seedUser(app.db, 'ac134-tied-b')
    cast.trackUser(seededA)
    cast.trackUser(seededB)
    const instant = '2026-08-03T09:30:00Z'
    await seedMembership(app.db, tiedFolderId, seededA, { createdAt: instant })
    await seedMembership(app.db, tiedFolderId, seededB, { createdAt: instant })
    // The lower id by Postgres's own uuid comparison, never JavaScript's
    // string order: the tie-break is 8.9's and the database is its judge,
    // the completedOrderIn hazard recorded in views-harness.ts.
    const low = await rows(
      app.db,
      sql`SELECT least(${seededA}::uuid, ${seededB}::uuid)::text AS id`,
    )
    const tiedLowId = String(low[0]?.id)
    const tiedHighId = tiedLowId === seededA ? seededB : seededA

    staged = {
      departing,
      earlyId,
      lateId,
      apartFolderId,
      tiedLowId,
      tiedHighId,
      tiedFolderId,
      assignedTaskId,
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

describe('AC-134: deletion hands shared folders to the earliest join', () => {
  test('AC-134: the earliest join takes the folder, id breaking the tie', async () => {
    const {
      departing,
      earlyId,
      apartFolderId,
      tiedLowId,
      tiedFolderId,
    } = await stage()
    const earlyRowBefore = await membershipRow(apartFolderId, earlyId)
    expect(
      earlyRowBefore,
      'the premise: the early member holds a membership before the deletion',
    ).toBeDefined()

    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )

    expect(
      await folderOwner(apartFolderId),
      '8.10 step 2 runs 8.9: the remaining member with the earliest folder_members.created_at takes ownership',
    ).toBe(earlyId)
    expect(
      await folderOwner(tiedFolderId),
      'and an exact tie on created_at goes to the lower user id (spec 8.9)',
    ).toBe(tiedLowId)

    const earlyRowAfter = await membershipRow(apartFolderId, earlyId)
    expect(
      earlyRowAfter,
      'the new owner\'s membership row survives the transfer (spec 8.9, INV-10)',
    ).toBeDefined()
    expect(
      earlyRowAfter?.role,
      'role stays member: ownership is folders.owner_id alone, one source of truth (spec 8.9, 4.3)',
    ).toBe('member')
    expect(
      earlyRowAfter?.created_at,
      'and its join instant is untouched, or the next transfer would misread history (spec 4.4)',
    ).toBe(earlyRowBefore?.created_at)
  })

  test('AC-134: the departed owner is out of the folder entirely', async () => {
    const { apartFolderId, assignedTaskId, earlyId, lateId } = await stage()
    expect(
      [...(await membershipUserIds(app.db, apartFolderId))].sort(),
      'step 4 removes the departed owner\'s own membership after the transfer (spec 8.10)',
    ).toEqual([earlyId, lateId].sort())

    const task = await taskRow(app.db, assignedTaskId)
    expect(task, 'the folder\'s tasks survive: transfer is not deletion').toBeDefined()
    expect(
      task?.assignee_id,
      'and the departed owner\'s assignment is unassigned by R-CLEAN, with two members left so no INV-5 sweep reassigns it (spec 8.10 step 4, 5.3)',
    ).toBeNull()
  })

  test('AC-134 adversarial: nothing owned by the departed account remains', async () => {
    const { departing } = await stage()
    const owned = await rows(
      app.db,
      sql`SELECT id FROM folders WHERE owner_id = ${departing.id}`,
    )
    expect(
      owned,
      '8.10 is ordered so 4.3\'s RESTRICT tripwire on owner_id can never fire: every owned folder was transferred or deleted before the account went',
    ).toEqual([])
  })

  test('AC-134: invariants hold afterwards', async () => {
    const { apartFolderId, tiedFolderId } = await stage()
    // The surviving folders are swept; the seeded members are deliberately
    // not in the userIds list, since seeded rows have no default folder and
    // INV-2 speaks of provisioned accounts (the AC-124 precedent).
    await expectFolderInvariants(app.db, [apartFolderId, tiedFolderId], [])
  })
})
