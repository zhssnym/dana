/*
AC-124: given two concurrent requests that would each take a 10.3 count from
its limit to one past it, a 51st step, a 26th member, a 201st custom folder,
then exactly one succeeds, the other is refused 422, and the stored count
equals the limit.

One criterion, three arms, because the P3 merge review found one defect in
three places: each guard counted outside the write the count admitted, so two
callers arriving together at the limit both read the same number and both
passed. 10.3 calls these numbers server-enforced, and a cap two callers walk
through is not enforced. Nothing under any of the three answers for it either:
4.6 puts no constraint behind the step cap, and neither 10.3 number for
members or folders has one.

This file is unlike every other criterion in the package, and the difference
is worth stating rather than discovering. The repairs it measures already
landed, at 817940b and 91f326b, so it arrives green instead of red, which
inverts the order the rest of P3 ran in. A test that has never failed is a
test that has not been shown to discriminate, so the three arms were
red-proven out of band before this file was written: against the same tables
on the default backend, the unfixed count-then-insert shape leaves 51 steps,
26 members and 201 folders where each arm below now leaves 50, 25 and 200.
The numbers are in the commit message with how they were produced. What could
not be done is restoring the modules and running this file against them: the
implementation is not this role's to edit, even temporarily.

Three things the shape turns on:

**The requests are issued together and never awaited in sequence.** A
sequential pair passes against any implementation, fixed or not, so it would
assert nothing at all. Promise.all is what makes the pair a pair.

**The assertion is the outcome, not the interleaving.** 11.15 now records
what the default backend does and does not cost: one connection serializes
statements rather than handler logic, so a read-then-write race is fully
expressible, but a second concurrent transaction genuinely needs a second
connection and the fixed paths open one each. So on PGlite the two
transactions queue and on postgres:18 they overlap, and the criterion is
written to be satisfied identically by both: the limit held and one caller
was refused. Asserting that a breach was attempted would fail on the leg
where the queueing is what prevents it, which is a false red about the
backend rather than a finding about the code.

**Each arm asserts its own premise inside its own test.** The count must be
at the limit minus one at the moment of the race, and a premise asserted in a
separate test is a premise that can drift before the race reads it.

The member arm carries a fourth call site since the P5 kickoff ruling of
2026-08-09 (commit 139c5f5): the 10.3 member cap binds every membership 8.7
grants, and 5.3's acceptance row was the fourth instance of the defect this
criterion names rather than an exemption. The criterion's text already
names the counted value rather than an endpoint, so the acceptance race
joins this file with no text change: two acceptances of two parked invites
racing at 24 members split into one 200 and one 422, the refused acceptance
rolls back whole with its invite left pending, and the count holds at 25.
Unlike the three original arms, this one arrives red, the designed order:
its invites travel POST /invites and its race travels the acceptance
endpoint, both P5's surfaces, unmounted until that package lands. The
ruling's sequential refusals are the proposed AC-140's, in that file.

Spec: 10.3 (the three limits, server-enforced, 422 with the field named), 7.7
(422 over 50 steps), 7.4 (422 member cap 25; 422 at 200 custom folders), 8.7
as amended at the P5 kickoff (the acceptance-path cap), 5.3 rows 1 and 2, 4.6
(the step cap is an API guard, not a constraint), 11.15 (what one connection
costs), AC-021 for the contrast, which races two adds of the same person and
is settled by the primary key whatever the count said.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMember,
  connect,
  countRows,
  createFolder,
  defaultFolderOf,
  expectFolderInvariants,
  membershipUserIds,
  postFolder,
  removeMember,
  seedMembership,
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  connectionPair,
  createInviteOk,
  freshEmail,
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'
import { addStep, createTaskOk, stepRows } from './tasks-harness.js'

/** The three numbers of 10.3 this criterion is about. */
const STEP_CAP = 50
const MEMBER_CAP = 25
const FOLDER_CAP = 200

let app: AuthTestApp
/* The folder arm gets an account of its own. Its premise is a count of
 * everything the account owns, so it would otherwise read the two folders
 * the arms above create and depend on the order the file happens to run
 * in; a premise that moves when a neighbour changes is not a premise. */
const cast = new Cast(['owner', 'second', 'creator'], 'p3')

interface Stage {
  owner: Actor
  second: Actor
  creator: Actor
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second, creator] = await cast.of(app)
    if (owner === undefined || second === undefined || creator === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, second.id)
    staged = { owner, second, creator }
  }
  return staged
}

/** The two statuses of a raced pair, sorted, so the pair reads as one fact
 * whichever caller won. */
function racedStatuses(a: number, b: number): number[] {
  return [a, b].sort((x, y) => x - y)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-124: two callers cannot walk a 10.3 cap past its limit', () => {
  test('AC-124: the 51st step is refused and the task keeps 50', async () => {
    const { owner, second } = await stage()
    const folderId = await createFolder(owner, 'p3 ac124 steps')
    await addMember(owner, folderId, second.id)
    const task = await createTaskOk(
      owner,
      {
        title: 'p3 ac124 steps',
        folder_id: folderId,
        steps: Array.from(
          { length: STEP_CAP - 1 },
          (_unused, index) => `filler ${String(index + 1)}`,
        ),
      },
      'a create carrying 49 steps is inside the cap and must be accepted (spec 7.6)',
    )
    expect(
      (await stepRows(app.db, task.id)).length,
      'the premise: the task holds one short of the cap when the race starts',
    ).toBe(STEP_CAP - 1)

    const [byOwner, bySecond] = await Promise.all([
      addStep(owner, task.id, { title: 'racer a' }),
      addStep(second, task.id, { title: 'racer b' }),
    ])

    expect(
      racedStatuses(byOwner.status, bySecond.status),
      `two adds racing at ${String(STEP_CAP - 1)} steps must split into one 201 and one 422 (spec 7.7, 10.3); answered ${String(byOwner.status)} and ${String(bySecond.status)}`,
    ).toEqual([201, 422])
    expect(
      (await stepRows(app.db, task.id)).length,
      '4.6 puts no constraint behind this cap, so the guard is the only thing between two callers and a 51st step',
    ).toBe(STEP_CAP)
  })

  test('AC-124: the 26th member is refused and the folder keeps 25', async () => {
    const { owner, second } = await stage()
    const folderId = await createFolder(owner, 'p3 ac124 members')
    await addMember(owner, folderId, second.id)

    // Seeded members rather than signed-in ones: the cap counts rows, and
    // twenty-two sign-ins would buy nothing the count can tell apart. The
    // two racers are real sessions, because the race is between callers.
    const fillers: string[] = []
    for (let index = 0; index < MEMBER_CAP - 3; index += 1) {
      const filler = await seedUser(app.db, `ac124-member-${String(index)}`)
      cast.trackUser(filler)
      await seedMembership(app.db, folderId, filler)
      fillers.push(filler)
    }

    /*
    Two different targets, which is what makes this the cap's race rather
    than AC-021's. That one races two callers adding the same person, where
    INV-10's primary key settles the outcome whatever the count said; here
    nothing settles it but the guard, so two adds at 24 members both passed
    and left 26.
    */
    const targetA = await seedUser(app.db, 'ac124-target-a')
    const targetB = await seedUser(app.db, 'ac124-target-b')
    cast.trackUser(targetA)
    cast.trackUser(targetB)
    await connect(app.db, owner.id, targetA)
    await connect(app.db, second.id, targetB)

    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'the premise: the folder holds one short of the cap when the race starts',
    ).toBe(MEMBER_CAP - 1)

    const [byOwner, bySecond] = await Promise.all([
      addMember(owner, folderId, targetA),
      addMember(second, folderId, targetB),
    ])

    expect(
      racedStatuses(byOwner.status, bySecond.status),
      `two adds of two different people racing at ${String(MEMBER_CAP - 1)} members must split into one 201 and one 422 (spec 7.4, 10.3); answered ${String(byOwner.status)} and ${String(bySecond.status)}`,
    ).toEqual([201, 422])
    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'the stored count equals the limit: 10.3 calls this number server-enforced',
    ).toBe(MEMBER_CAP)

    /*
    This arm is the one where a 422 proves less than it looks. Two of 7.4's
    guards answer it on this endpoint, the cap and the missing roster
    connection, so a refusal for the wrong reason would satisfy every
    assertion above: the statuses would still split and the count would
    still be 25. The loser is therefore re-offered once a slot frees. If it
    is admitted then, the earlier refusal was the count; if the roster edge
    had been what refused it, it would be refused again.

    Selecting the loser is not a skipped assertion: both branches assert the
    same 201, and which caller won is the one thing about a race a test may
    not decide in advance.
    */
    const ownerLost = byOwner.status === 422
    const loser = ownerLost ? owner : second
    const loserTarget = ownerLost ? targetA : targetB
    const freed = fillers[0]
    expect(freed, 'the fixture seeded members to free one of').toBeDefined()
    expect(
      (await removeMember(owner, folderId, String(freed))).status,
      'the owner may remove another member (spec 5.3), which frees one slot',
    ).toBe(204)
    expect(
      (await addMember(loser, folderId, loserTarget)).status,
      'the loser is admitted below the cap, so its 422 was the count and not the roster connection (spec 7.4)',
    ).toBe(201)
    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'and the folder is back at its limit, never past it',
    ).toBe(MEMBER_CAP)
  })

  test('AC-124: two acceptances racing at 24 members admit exactly one', async () => {
    const { owner } = await stage()
    const folderId = await createFolder(owner, 'p3 ac124 acceptances')

    // 23 seeded rows beside the owner: the cap counts rows, the AC-124
    // seeding rule, and the racers are the acceptances rather than the
    // sessions that placed the members.
    for (let index = 0; index < MEMBER_CAP - 2; index += 1) {
      const filler = await seedUser(app.db, `ac124-accept-${String(index)}`)
      cast.trackUser(filler)
      await seedMembership(app.db, folderId, filler)
    }

    /*
    Two parked invites to two different emails, so nothing but the ruled
    guard can settle the race: INV-11 keeps them apart and INV-10's primary
    key never sees the same pair twice, the same reason the direct arm adds
    two different people. They travel POST /invites, this criterion's
    fourth call site being P5's surface, which is also why this arm is red
    until that package lands.
    */
    const emailA = freshEmail('ac124-accept-a')
    const emailB = freshEmail('ac124-accept-b')
    const inviteA = await createInviteOk(
      owner,
      { email: emailA, folder_id: folderId },
      'the first invite parks against the almost-full folder: creation grants nothing and is uncapped (spec 8.7)',
    )
    const inviteB = await createInviteOk(
      owner,
      { email: emailB, folder_id: folderId },
      'and the second beside it (INV-11: different emails, no duplicate)',
    )
    const recipientA = await signInActorWithEmail(app, 'ac124-accept-a', emailA)
    const recipientB = await signInActorWithEmail(app, 'ac124-accept-b', emailB)
    cast.trackUser(recipientA.id)
    cast.trackUser(recipientB.id)

    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'the premise: the folder holds one short of the cap when the race starts',
    ).toBe(MEMBER_CAP - 1)

    const [byA, byB] = await Promise.all([
      acceptInvite(recipientA, inviteA.id),
      acceptInvite(recipientB, inviteB.id),
    ])

    expect(
      racedStatuses(byA.status, byB.status),
      `two acceptances racing at ${String(MEMBER_CAP - 1)} members must split into one 200 and one 422: the acceptance transaction locks the folder, counts, and refuses at 25 (spec 8.7 as ruled at the P5 kickoff, 5.3's acceptance row, 10.3); answered ${String(byA.status)} and ${String(byB.status)}`,
    ).toEqual([200, 422])
    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'the stored count equals the limit: the fourth grant path enforces the same number as the other three',
    ).toBe(MEMBER_CAP)

    /*
    The loser's whole acceptance rolled back, the ruling's all-or-nothing:
    invite still pending, no connection row, nothing recorded. Then the
    re-offer discipline of the direct arm: a slot frees and the same
    acceptance succeeds, which is what proves the 422 was the count.
    */
    const aLost = byA.status === 422
    const loser = aLost ? recipientA : recipientB
    const loserInviteId = aLost ? inviteA.id : inviteB.id
    const winnerId = aLost ? recipientB.id : recipientA.id
    const loserRow = await requireInviteRow(app.db, loserInviteId)
    expect(
      loserRow.status,
      'the refused acceptance rolls back whole and its invite stays pending (the kickoff ruling)',
    ).toBe('pending')
    expect(
      await connectionPair(app.db, owner.id, loser.id),
      'no connection survives the rollback: all or nothing includes the upsert (spec 8.7)',
    ).toEqual([])

    expect(
      (await removeMember(owner, folderId, winnerId)).status,
      'the owner removes the winner, freeing one slot (spec 5.3)',
    ).toBe(204)
    expect(
      (await acceptInvite(loser, loserInviteId)).status,
      'the loser\'s same acceptance succeeds below the cap, so its 422 was the count and nothing else',
    ).toBe(200)
    expect(
      (await membershipUserIds(app.db, folderId)).length,
      'and the folder is back at its limit, never past it',
    ).toBe(MEMBER_CAP)
  })

  test('AC-124: the 201st custom folder is refused and the account keeps 200', async () => {
    const { creator } = await stage()

    /*
    The 199 fillers are seeded as rows. They are a count and nothing else,
    and 199 round trips through an endpoint this criterion is not about
    would buy a slower fixture rather than a truer one; the endpoint under
    test is exercised by the race itself. The owner's membership row rides
    with each folder, because INV-10 holds for seeded rows as much as for
    created ones and a suite that asserts invariants may not leave two
    hundred violations behind it.
    */
    await app.db.execute(sql`
      INSERT INTO folders (owner_id, name)
      SELECT ${creator.id}::uuid, ${'p3 ac124 filler '} || g || ${` ${randomUUID()}`}
      FROM generate_series(1, ${FOLDER_CAP - 1}) g
    `)
    await app.db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id)
      SELECT f.id, ${creator.id}::uuid FROM folders f
      WHERE f.owner_id = ${creator.id} AND NOT f.is_default
        AND NOT EXISTS (SELECT 1 FROM folder_members m
                        WHERE m.folder_id = f.id AND m.user_id = ${creator.id})
    `)

    const customFolders = async (): Promise<number> =>
      countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folders
             WHERE owner_id = ${creator.id} AND NOT is_default`,
      )
    expect(
      await customFolders(),
      'the premise: the account holds one short of the cap when the race starts',
    ).toBe(FOLDER_CAP - 1)

    const [first, secondCreate] = await Promise.all([
      postFolder(creator, 'p3 ac124 racer a'),
      postFolder(creator, 'p3 ac124 racer b'),
    ])

    expect(
      racedStatuses(first.status, secondCreate.status),
      `two creates racing at ${String(FOLDER_CAP - 1)} custom folders must split into one 201 and one 422 (spec 7.4, 10.3); answered ${String(first.status)} and ${String(secondCreate.status)}`,
    ).toEqual([201, 422])
    expect(
      await customFolders(),
      'the stored count equals the limit, the default folder being INV-2\'s rather than the account\'s to spend',
    ).toBe(FOLDER_CAP)
  })

  test('AC-124 adversarial: the refusals name their field and leave the envelope', async () => {
    const { creator } = await stage()
    // The account is at its cap from the arm above, so one more create is
    // the plain refusal the raced one has to look like.
    const refused = await postFolder(creator, 'p3 ac124 one too many')
    expect(
      refused.status,
      '10.3 answers 422 with the field named, and the cap does not change taxonomy because it was reached by a race',
    ).toBe(422)
    const body = refused.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof body.error?.code === 'string' && body.error.code.length > 0,
      'a 4xx carries the 7.0 envelope (AC-117)',
    ).toBe(true)
    expect(
      String(body.error?.message).toLowerCase(),
      'and 10.3 names what was refused',
    ).toContain('folder')
  })

  test('AC-124: invariants hold afterwards', async () => {
    const { owner, second, creator } = await stage()
    // The creator's two hundred folders are swept by the user-level half
    // rather than one by one: INV-2 is the invariant a cap arm can break,
    // and two hundred per-folder passes would buy minutes, not truth.
    await expectFolderInvariants(
      app.db,
      [
        await defaultFolderOf(app.db, owner.id),
        await defaultFolderOf(app.db, creator.id),
      ],
      [owner.id, second.id, creator.id],
    )
  })
})
