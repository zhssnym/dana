/*
AC-521: ownership is custody. The owner recovers Full control explicitly and
the recovery is recorded as one; an ordinary voluntary leave never promotes
whoever joined earliest; and ownership transfers only to an active member who
currently holds Full control.

Issue #228 required proofs 16, 17 and 18. Product authority: #209 R5, R6
sections 2 and 3, #228's ownership rules, and R9 section 8.

## The behaviour that goes, and why it was unsafe

Until this change, an owner leaving a shared folder handed custody to **the
remaining member with the earliest join instant, ties to the lower user id**.
R6 section 1 says exactly what was wrong with it: that rule "was reasonable
under the old flat-member model, but it becomes semantically unsafe once
explicit Access exists because 'earliest member' is not proof that the person
was intended to hold structural custody."

So proof 17 is a refusal where there used to be a silent promotion, and proof
18 is the eligibility test that replaces "any member will do".

## The recovery anchor

R5 lets the owner lower their own Access -- AC-520 proves that -- and the
whole reason it is safe to let them is that they can always climb back.
`POST /folders/:id/owner-recovery` is that door, and it reads **no preset at
all**: an owner sitting at Can view, in a folder whose other administrators
have all left or fallen out with them, can still recover. R9 section 8 asks
that the transition be distinguishable in history from an ordinary grant, so
that "Imran restored Full control using owner recovery" is not rendered as
somebody promoting him.

Spec: 5.3, 7.4, 7.16, 8.9; governing #209 R5 and R6; #228's ownership
rules; R9 section 8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  forcePreset,
  historyOf,
  recoverOwnership,
  setAccess,
  setAccessOk,
  sharedFolder,
  storedPreset,
  transferOwnership,
} from '../support/folder-access-harness.js'
import {
  Cast,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'oldest'], 'ac491')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  deputy: Actor
  oldest: Actor
  folderId: string
}

/** `oldest` joins first and at the lowest preset, `deputy` second and at Full
 * control. That ordering is what the superseded rule would have followed. */
async function stage(name: string): Promise<Stage> {
  const [owner, deputy, oldest] = (await cast.of(app)) as [Actor, Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [
    [oldest, 'can_view'],
    [deputy, 'full_control'],
  ])
  return { owner, deputy, oldest, folderId }
}

async function ownerIdOf(actor: Actor, folderId: string): Promise<boolean> {
  const read = await actor.browser.api(`/folders/${folderId}`)
  return (read.json() as { is_owner?: boolean }).is_owner === true
}

describe('AC-521 custody is a separate fact and moves on purpose', () => {
  test('AC-521 proof 16: the owner recovers Full control explicitly, from any preset', async () => {
    const { owner, deputy, folderId } = await stage('ac491 recovery')

    // The owner steps all the way down -- permitted because the deputy holds
    // Full control -- and then the deputy steps down too, which the invariant
    // refuses. So the fixture puts the owner at Can view directly, which is
    // the state R5 describes and which no sequence of ordinary calls can
    // reach without leaving a second custodian standing.
    await forcePreset(app.db, folderId, owner.id, 'can_view')
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'the owner is at the bottom of the ladder and still the structural owner',
    ).toBe('can_view')
    expect(
      await ownerIdOf(owner, folderId),
      'R5: "Alice still holds the separate custody fact until ownership is transferred"',
    ).toBe(true)

    const recovered = await recoverOwnership(owner, folderId)
    expectStatus(
      recovered,
      200,
      "governing R5 and #228: the owner may restore their own Access to Full control through explicit custody recovery, recorded distinctly in Access history",
    )
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'and the recovery landed',
    ).toBe('full_control')

    const entries = await historyOf(app.db, folderId, owner.id)
    const last = entries[entries.length - 1]
    expect(
      last?.transition,
      'R9 section 8: "ordinary History must make the recovery visible rather than making it look like a normal manager grant"',
    ).toBe('owner_recovered_full_control')
    expect(
      [last?.previous_access, last?.new_access],
      'and it records the exact from and to',
    ).toEqual(['can_view', 'full_control'])
    expect(
      last?.actor_id,
      'with the owner as the actor: nobody granted this to them',
    ).toBe(owner.id)

    // And it is theirs alone.
    const byDeputy = await recoverOwnership(deputy, folderId)
    expectStatus(
      byDeputy,
      403,
      'R5: custody recovery is the structural owner\'s, and Full control does not confer it',
    )
  })

  test('AC-521 proof 16: recovery is the only way up, and self-promotion is not', async () => {
    const { owner, folderId } = await stage('ac491 no self promotion')
    await forcePreset(app.db, folderId, owner.id, 'can_comment')

    const climbed = await setAccess(owner, folderId, owner.id, 'full_control')
    expectStatus(
      climbed,
      403,
      'a member may lower their own standing and never raise it: without this, "change my own access" would be a self-service promotion for every member of every folder',
    )
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'and nothing moved',
    ).toBe('can_comment')
  })

  test('AC-521 proof 17: an ordinary owner leave is refused rather than silently succeeded', async () => {
    const { owner, deputy, oldest, folderId } = await stage('ac491 owner leave')

    const left = await owner.browser.api(`/folders/${folderId}/my-membership`, {
      method: 'DELETE',
    })
    expectStatus(
      left,
      409,
      'R6 section 2: "A sole structural owner should not be allowed to leave a shared Folder until ownership is explicitly transferred." The superseded rule promoted the earliest joiner without asking anybody',
    )

    expect(
      await ownerIdOf(owner, folderId),
      'the owner is still the owner',
    ).toBe(true)
    expect(
      await storedPreset(app.db, folderId, oldest.id),
      'and the member who joined first -- whom the old rule would have handed custody to -- has not been promoted or otherwise touched',
    ).toBe('can_view')
    expect(
      await storedPreset(app.db, folderId, deputy.id),
      'nor has anybody else',
    ).toBe('full_control')
  })

  test('AC-521 proof 17: the same refusal when the leave is addressed as a removal', async () => {
    // `DELETE /folders/:id/members/:userId` with the owner's own id is the
    // same act by another door, and a rule that held on one and not the other
    // would be no rule.
    const { owner, folderId } = await stage('ac491 owner self-removal')
    const removed = await removeMember(owner, folderId, owner.id)
    expectStatus(
      removed,
      409,
      'the leave is one act however it is addressed (5.3, RFC 0005)',
    )
  })

  test('AC-521 proof 17: and the owner may not be removed by an administrator either', async () => {
    const { owner, deputy, folderId } = await stage('ac491 owner removal')
    const removed = await removeMember(deputy, folderId, owner.id)
    expectStatus(
      removed,
      403,
      "R5 and R6: custody leaves by being transferred, never by somebody else administering the owner out of the folder. This is 403 rather than 409 because the actor may not perform the act at all, whatever the folder's state",
    )
    expect(
      await ownerIdOf(owner, folderId),
      'and the owner is still there',
    ).toBe(true)
  })

  test('AC-521 proof 18: ownership transfers only to a current Full-control member', async () => {
    const { owner, deputy, oldest, folderId } = await stage('ac491 succession')

    const toOrdinary = await transferOwnership(owner, folderId, oldest.id)
    expectStatus(
      toOrdinary,
      422,
      'R6 section 2: the eligible M1 successor is "an active human Folder member, currently Full control". Before #228 any member would do',
    )
    expect(
      await ownerIdOf(owner, folderId),
      'and custody did not move',
    ).toBe(true)

    const toCustodian = await transferOwnership(owner, folderId, deputy.id)
    expectStatus(
      toCustodian,
      200,
      'while a member who currently holds Full control takes it',
    )
    expect(
      await ownerIdOf(deputy, folderId),
      'and the new owner reads as one',
    ).toBe(true)
    expect(
      await ownerIdOf(owner, folderId),
      'and the old one does not',
    ).toBe(false)
  })

  test('AC-521 proof 18: the transfer is the owner\'s, whoever else holds Full control', async () => {
    const { deputy, folderId } = await stage('ac491 not the deputy\'s to give')
    const byDeputy = await transferOwnership(deputy, folderId, deputy.id)
    expectStatus(
      byDeputy,
      403,
      'R5 keeps a very small custody set separate from Full control, and transfer is the first item in it',
    )
  })

  test('AC-521: once a successor exists and takes it, the old owner may leave', async () => {
    // The whole point of the refusal in proof 17 is that it is a step rather
    // than a wall: transfer, then leave.
    const { owner, deputy, folderId } = await stage('ac491 the way out')
    expectStatus(
      await transferOwnership(owner, folderId, deputy.id),
      200,
      'the owner hands custody to the eligible successor (R6 section 2)',
    )
    // They keep Full control, so the invariant still binds them; step down
    // first, which is now permitted because the new owner holds it too.
    await setAccessOk(deputy, folderId, owner.id, 'can_edit')
    const left = await owner.browser.api(`/folders/${folderId}/my-membership`, {
      method: 'DELETE',
    })
    expectStatus(
      left,
      204,
      'and then leaves, which is R6 section 2\'s "Transfer ownership before leaving" in the order it asks for',
    )
  })
})
