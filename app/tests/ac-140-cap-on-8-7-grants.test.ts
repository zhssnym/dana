/*
AC-140: Given a folder holding 25 members, when an invite that would convert
to an instant share is created, with or without a task attached, then 422
naming the cap and nothing is created, neither membership nor invite row nor
assignment; when a pending folder invite for it is accepted, then 422, the
whole acceptance rolls back leaving the invite pending with no connection
made, and the same acceptance succeeds once the folder has room.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text. This file proposed it, the AC-125 to AC-130 precedent for a batch
authored with its tests and numbered additively at a mid-package change
control. The amendment records one reading with it, that an invite created
against a full folder is not itself refused, creation granting no
membership, which is what leaves the parked invite for the cap to refuse at
acceptance; the third case below is that invite.
Routed by the kickoff ruling of 2026-08-09 (commit 139c5f5):
the 10.3 member cap binds every membership 8.7 grants, the instant-share
conversion and the acceptance transaction alike, the acceptance row's
silence in 5.3 having been the fourth instance of the defect AC-124 names
rather than an exemption. These are the ruling's sequential refusals; the
concurrent pair on the acceptance path rides AC-124's member arm in that
criterion's own file, its text already naming the counted value rather
than an endpoint.

Three consequences of the ruling, each asserted where the ruling states it:
a refused conversion creates nothing, telling the inviter the folder is
full now rather than parking an invite whose acceptance the same cap would
refuse; invite creation itself is uncapped, since creation grants nothing,
which is what lets the parked invite exist to be refused; and a refused
acceptance rolls back whole, per 8.7's all-or-nothing, so no connection
survives it and the invite stays pending, acceptable once the folder has
room. Refusal beats the assignment arm's silent skip because a skipped
assignment loses a convenience while a silently skipped membership would
consume the invite and grant nothing.

The fillers are seeded rows, the AC-124 precedent: the cap counts rows, and
twenty-four sign-ins would buy nothing the count can tell apart. The two
refusal targets and the accepting recipient are what they must be, seeded
connections for the conversion arms and a real session for the acceptance.

Rate-limit discipline: the owner issues three POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 8.7 as amended at the kickoff (the cap paragraph), 5.3 rows 1 and 2,
10.3 (members per folder 25, server-enforced, 422 with the field named),
7.5, 5.2, INV-9, INV-10.
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
  expectStatus,
  membershipUserIds,
  removeMember,
  seedMembership,
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  acceptInviteOk,
  connectionPair,
  createInviteOk,
  freshEmail,
  postInvite,
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  taskRow,
} from './tasks-harness.js'
import { rows } from './helpers.js'

const MEMBER_CAP = 25

let app: AuthTestApp
const cast = new Cast(['owner'], 'p5')

interface Stage {
  owner: Actor
  folderId: string
  taskId: string
  /** Connected targets for the two conversion arms. */
  connectedId: string
  connectedEmail: string
  connectedTaskedId: string
  connectedTaskedEmail: string
  /** One seeded member the acceptance arm frees later. */
  removableId: string
}
let staged: Stage | undefined

async function userEmail(id: string): Promise<string> {
  const found = await rows(
    app.db,
    sql`SELECT email FROM users WHERE id = ${id}`,
  )
  return String(found[0]?.email)
}

async function memberCount(folderId: string): Promise<number> {
  return (await membershipUserIds(app.db, folderId)).length
}

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce the owner')
    const folderId = await createFolder(owner, 'p5 ac140 full house')

    // The task the tasked conversion arm would assign, created while the
    // folder is small so INV-5 cannot force it: one more member arrives
    // with the next loop.
    let removableId = ''
    for (let index = 0; index < MEMBER_CAP - 1; index += 1) {
      const filler = await seedUser(app.db, `ac140-filler-${String(index)}`)
      cast.trackUser(filler)
      await seedMembership(app.db, folderId, filler)
      if (index === 0) removableId = filler
    }
    const task = await createTaskOk(
      owner,
      {
        title: 'p5 ac140 never assigned this way',
        folder_id: folderId,
        assignee_id: null,
      },
      'the full folder admits an unassigned task (spec 7.6, INV-5 needs one member)',
    )

    const connectedId = await seedUser(app.db, 'ac140-connected')
    const connectedTaskedId = await seedUser(app.db, 'ac140-connected-tasked')
    cast.trackUser(connectedId)
    cast.trackUser(connectedTaskedId)
    await connect(app.db, owner.id, connectedId)
    await connect(app.db, owner.id, connectedTaskedId)

    staged = {
      owner,
      folderId,
      taskId: task.id,
      connectedId,
      connectedEmail: await userEmail(connectedId),
      connectedTaskedId,
      connectedTaskedEmail: await userEmail(connectedTaskedId),
      removableId,
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

describe('AC-140: a full folder refuses every 8.7 grant the same way', () => {
  test('AC-140: the conversion is refused 422 and creates nothing', async () => {
    const { owner, folderId, connectedId, connectedEmail } = await stage()
    expect(
      await memberCount(folderId),
      'the premise: the folder is at the cap when the conversion arrives',
    ).toBe(MEMBER_CAP)

    const response = await postInvite(owner, {
      email: connectedEmail,
      folder_id: folderId,
    })
    expectStatus(
      response,
      422,
      'the instant-share conversion checks the cap the way POST members does, and refuses at 25 (spec 8.7 as ruled at the kickoff, 10.3)',
    )
    const body = response.json() as { error?: { message?: unknown } }
    expect(
      String(body.error?.message).toLowerCase(),
      '10.3 names what was refused',
    ).toContain('member')
    expect(
      await memberCount(folderId),
      'no membership was created (spec 8.7: a full folder refuses and creates nothing)',
    ).toBe(MEMBER_CAP)
    expect(
      (await membershipUserIds(app.db, folderId)).includes(connectedId),
      'least of all the target\'s',
    ).toBe(false)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites WHERE inviter_id = ${owner.id}`,
      ),
      'and no invite row either: the refusal tells the inviter the folder is full now, rather than parking an invite the same cap would refuse at acceptance (the ruling\'s grounds)',
    ).toBe(0)
  })

  test('AC-140: the tasked conversion is refused whole, assignment included', async () => {
    const { owner, folderId, taskId, connectedTaskedEmail } = await stage()
    const response = await postInvite(owner, {
      email: connectedTaskedEmail,
      folder_id: folderId,
      task_id: taskId,
    })
    expectStatus(
      response,
      422,
      'the conversion with a task attached is the same grant and the same refusal (the ruling: with or without a task attached)',
    )
    expect(
      (await taskRow(app.db, taskId))?.assignee_id,
      'the assignment leg never ran: a refused conversion creates nothing, membership and assignment alike',
    ).toBeNull()
    expect(
      await memberCount(folderId),
      'and the count still stands at the cap',
    ).toBe(MEMBER_CAP)
  })

  test('AC-140: the parked acceptance is refused whole and stays pending', async () => {
    const { owner, folderId } = await stage()
    // Creation is uncapped, because creation grants nothing: the invite
    // parks against a full folder and waits (spec 8.7, the ruling's shape).
    const email = freshEmail('ac140-waiting')
    const parked = await createInviteOk(
      owner,
      { email, folder_id: folderId },
      'a folder invite to an unconnected email parks even at the cap: V-INV caps grants, not invitations',
    )
    const recipient = await signInActorWithEmail(app, 'ac140-waiting', email)
    cast.trackUser(recipient.id)

    const refused = await acceptInvite(recipient, parked.id)
    expectStatus(
      refused,
      422,
      'the acceptance transaction locks the folder, counts, and refuses 422 at 25 (spec 8.7 as ruled, 5.3\'s acceptance row)',
    )
    const row = await requireInviteRow(app.db, parked.id)
    expect(
      row.status,
      'a refused acceptance rolls back whole, so the invite stays pending, acceptable once the folder has room (the ruling)',
    ).toBe('pending')
    expect(
      row.accepted_by,
      'nothing about the refusal pretends acceptance happened',
    ).toBeNull()
    expect(
      await connectionPair(app.db, owner.id, recipient.id),
      'and the connection upsert rolled back with the rest: all or nothing means the pair too (spec 8.7)',
    ).toEqual([])
    expect(
      await memberCount(folderId),
      'the count never moved',
    ).toBe(MEMBER_CAP)

    // Room opens, and the same invite goes through: what proves the refusal
    // was the count is being admitted the moment it stops being true, the
    // AC-124 re-offer discipline.
    const { removableId } = await stage()
    expectStatus(
      await removeMember(owner, folderId, removableId),
      204,
      'the owner removes a member, freeing one slot (spec 5.3)',
    )
    const accepted = await acceptInviteOk(
      recipient,
      parked.id,
      'the same acceptance succeeds once the folder has room (the ruling\'s closing clause)',
    )
    expect(
      accepted.connection_created,
      'and this time the pair is minted',
    ).toBe(true)
    expect(
      await memberCount(folderId),
      'the folder is back at its limit, never past it (10.3)',
    ).toBe(MEMBER_CAP)
    expect(
      (await requireInviteRow(app.db, parked.id)).status,
      'and the invite is consumed at last (spec 5.2)',
    ).toBe('accepted')
  })

  test('AC-140: invariants hold afterwards', async () => {
    const { owner, folderId, taskId } = await stage()
    await expectTaskInvariants(app.db, [taskId], [folderId], [owner.id])
  })
})
