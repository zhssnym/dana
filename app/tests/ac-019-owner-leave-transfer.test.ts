/*
AC-019: given the owner leaves a folder with other members, then ownership
transfers to the earliest-joined member (tie: lower user id) and the leave
proceeds.

Section 8.9 fixes the rule exactly: earliest folder_members.created_at,
ties broken by lower user id, folders.owner_id updated, the new owner's
membership row untouched (role stays 'member'; ownership is the folder
column, one source of truth). The memberships here are seeded with explicit
join instants rather than added over the API, because the tie case needs
two equal timestamps and no endpoint can be asked for those; the order case
uses the same mechanism so both read alike. The leave itself must still run
R-CLEAN for the departing owner, and the transferred folder must obey the
new owner and refuse the other member, which is the observable meaning of
transfer.

Spec: 5.3, 5.4, 7.4, 8.9.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  connect,
  countRows,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  membershipUserIds,
  removeMember,
  seedMembership,
  seedMyDayEntry,
  seedTask,
  seedUser,
  taskAssignee,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

const EARLY_JOIN = '2026-08-01T10:00:00.000Z'
const LATE_JOIN = '2026-08-02T10:00:00.000Z'
const TIE_JOIN = '2026-08-03T10:00:00.000Z'

let app: AuthTestApp
const cast = new Cast(['owner', 'early', 'late'])

interface Stage {
  owner: Actor
  early: Actor
  late: Actor
  folderId: string
  ownersTask: string
  tieFolderId: string
  tieWinnerId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, early, late] = await cast.of(app)
    if (owner === undefined || early === undefined || late === undefined) {
      throw new Error('cast must produce three actors')
    }
    const db = app.db
    await connect(db, owner.id, early.id)
    await connect(db, owner.id, late.id)

    const folderId = await createFolder(owner, 'p2 ac019 transferring')
    await seedMembership(db, folderId, early.id, { createdAt: EARLY_JOIN })
    await seedMembership(db, folderId, late.id, { createdAt: LATE_JOIN })
    const ownersTask = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      assigneeId: owner.id,
    })
    await seedMyDayEntry(db, ownersTask, owner.id)

    // The tie folder: two seeded users joined at the same instant, so the
    // rule's second clause is the only thing that can decide.
    const tieFolderId = await createFolder(owner, 'p2 ac019 tie')
    const tieA = await seedUser(db, 'tie-a')
    const tieB = await seedUser(db, 'tie-b')
    cast.trackUser(tieA)
    cast.trackUser(tieB)
    await seedMembership(db, tieFolderId, tieA, { createdAt: TIE_JOIN })
    await seedMembership(db, tieFolderId, tieB, { createdAt: TIE_JOIN })
    const winner = await rows(
      db,
      sql`SELECT least(${tieA}::uuid, ${tieB}::uuid) AS id`,
    )
    const tieWinnerId = String(winner[0]?.id)

    staged = {
      owner,
      early,
      late,
      folderId,
      ownersTask,
      tieFolderId,
      tieWinnerId,
    }
  }
  return staged
}

async function folderOwnerId(folderId: string): Promise<string> {
  const found = await rows(
    app.db,
    sql`SELECT owner_id FROM folders WHERE id = ${folderId}`,
  )
  return String(found[0]?.owner_id)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-019: the leaving owner hands the folder to the earliest-joined member', () => {
  test('AC-019: the owner leave answers 204 and ownership moves to the earliest joiner', async () => {
    const { owner, early, folderId } = await stage()
    const response = await removeMember(owner, folderId, owner.id)
    expectStatus(
      response,
      204,
      'the owner leave with other members present must proceed (spec 5.3, 7.4)',
    )
    expect(
      await folderOwnerId(folderId),
      'folders.owner_id must now be the earliest-joined member (spec 8.9)',
    ).toBe(early.id)
  })

  test('AC-019: the new owner membership row is unchanged, role included', async () => {
    const { early, folderId } = await stage()
    const membership = (
      await rows(
        app.db,
        sql`SELECT role, created_at FROM folder_members
            WHERE folder_id = ${folderId} AND user_id = ${early.id}`,
      )
    )[0]
    expect(
      membership?.role,
      'ownership is the folder column alone; the role column never encodes it (spec 8.9, 4.4)',
    ).toBe('member')
    expect(
      new Date(String(membership?.created_at)).toISOString(),
      'the join instant must not be rewritten by the transfer (spec 8.9)',
    ).toBe(EARLY_JOIN)
  })

  test('AC-019: the leave ran R-CLEAN for the departed owner', async () => {
    const { owner, folderId, ownersTask } = await stage()
    expect(
      await taskAssignee(app.db, ownersTask),
      'the departed owner assignment must be unassigned (5.3 R-CLEAN)',
    ).toBeNull()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${ownersTask} AND user_id = ${owner.id}`,
      ),
      'the departed owner My Day entry must be gone (5.3 R-CLEAN)',
    ).toBe(0)
    const probe = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(
      probe,
      404,
      'the departed owner reads the folder as nonexistent (spec 7.0)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the departed owner membership row must be gone (spec 5.3)',
    ).not.toContain(owner.id)
  })

  test('AC-019: the transferred folder obeys its new owner and refuses the other member', async () => {
    const { early, late, folderId } = await stage()
    const earlyEntry = await folderInList(early, folderId)
    expect(
      earlyEntry?.is_owner,
      'the Folder object must report the new owner as owner (spec 7.0)',
    ).toBe(true)
    const lateEntry = await folderInList(late, folderId)
    expect(lateEntry?.is_owner).toBe(false)

    const renamedByNewOwner = await early.browser.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac019 transferred' },
    )
    expectStatus(
      renamedByNewOwner,
      200,
      'the new owner holds the owner powers of 5.4',
    )
    const renamedByOther = await late.browser.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac019 usurped' },
    )
    expectStatus(
      renamedByOther,
      403,
      'the remaining non-owner member holds no owner powers (spec 5.4)',
    )
  })

  test('AC-019 adversarial: an exact join-time tie goes to the lower user id', async () => {
    const { owner, tieFolderId, tieWinnerId } = await stage()
    const response = await removeMember(owner, tieFolderId, owner.id)
    expectStatus(
      response,
      204,
      'the owner leave from the tie folder must proceed (spec 5.3)',
    )
    expect(
      await folderOwnerId(tieFolderId),
      'equal created_at must fall to the lower user id (spec 8.9)',
    ).toBe(tieWinnerId)
  })

  test('AC-019: invariants hold afterwards', async () => {
    const { owner, early, late, folderId, tieFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId, tieFolderId],
      [owner.id, early.id, late.id],
    )
  })
})
