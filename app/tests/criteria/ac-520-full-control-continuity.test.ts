/*
AC-520: every shared folder keeps at least one active human Full-control
member. The last one cannot be demoted, cannot be removed and cannot leave --
and the owner may lower their own Access only once somebody else holds it.

Issue #228 required proofs 14 and 15. Product authority: #209 R5,
"Administrative continuity invariant", and R7 section M.

## What the invariant is for

A folder with nobody in Full control is a folder nobody can add a member to,
remove a member from, change anybody's Access in, invite into, moderate, or
trash. It is not merely inconvenient; there is no way back from inside the
product, because every route that could fix it is one of the routes that is
now refused. The only remaining door is the structural owner's custody
recovery, which is exactly why R5 keeps that door and why this invariant
exists beside it.

So the refusals below are 409 rather than 403. The actor is permitted the act
-- a Full-control member may demote members, and any member may leave -- and
the **state** refuses it. That is 7.0's conflict, the same status the sole
member leaving a folder has always answered.

## The three doors, and the owner's special case

Demote, remove and leave are three ways to spend the same standing, and each
is checked separately because each is a different route. The owner's
self-demotion is the fourth: R5 permits it *only* when another human
Full-control member exists, which is the same count read from the other side.

Spec: 5.3, 7.4, 7.0; #209 R5, R7 section M.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  setAccess,
  setAccessOk,
  sharedFolder,
  storedPreset,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'worker'], 'ac490')

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
  worker: Actor
  folderId: string
}

/** The owner plus one Full-control deputy plus one ordinary member: the
 * smallest folder in which the invariant can be tested from both sides. */
async function stage(name: string): Promise<Stage> {
  const [owner, deputy, worker] = (await cast.of(app)) as [Actor, Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [worker, 'can_edit'],
  ])
  return { owner, deputy, worker, folderId }
}

describe('AC-520 a shared folder never runs out of custodians', () => {
  test('AC-520 proof 14: the last Full-control member cannot be demoted', async () => {
    const { owner, deputy, folderId } = await stage('ac490 demote')

    // Take the deputy out of Full control first, leaving the owner as the
    // only one. This must succeed: two exist at this point.
    await setAccessOk(owner, folderId, deputy.id, 'can_edit')

    const self = await setAccess(owner, folderId, owner.id, 'can_edit')
    expectStatus(
      self,
      409,
      "R5: the last Full-control member cannot be demoted, and 409 rather than 403 because the actor is permitted the act and the folder's state refuses it",
    )
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'and the refused demotion wrote nothing',
    ).toBe('full_control')
  })

  test('AC-520 proof 14: the last Full-control member cannot be removed', async () => {
    const { owner, deputy, folderId } = await stage('ac490 remove')
    // The deputy demotes the owner? No -- R7 section M forbids administering
    // the owner at all, which AC-521 pins. Here the *deputy* is made the sole
    // custodian by the owner stepping down, and then somebody tries to remove
    // them.
    await setAccessOk(owner, folderId, owner.id, 'can_edit')
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'the owner may step down while the deputy holds Full control (R5)',
    ).toBe('can_edit')

    const removed = await deputy.browser.api(
      `/folders/${folderId}/members/${deputy.id}`,
      { method: 'DELETE' },
    )
    expectStatus(
      removed,
      409,
      'R5: the last Full-control member cannot be removed either, and a self-addressed removal is a leave',
    )
    expect(
      await storedPreset(app.db, folderId, deputy.id),
      'and the membership is still there',
    ).toBe('full_control')
  })

  test('AC-520 proof 14: the last Full-control member cannot leave', async () => {
    const { owner, deputy, folderId } = await stage('ac490 leave')
    await setAccessOk(owner, folderId, owner.id, 'can_edit')

    const left = await deputy.browser.api(
      `/folders/${folderId}/my-membership`,
      { method: 'DELETE' },
    )
    expectStatus(
      left,
      409,
      'R5: "the last Full-control member cannot be removed, leave, or be demoted until another Full-control member exists"',
    )
    expect(
      await storedPreset(app.db, folderId, deputy.id),
      'and they are still a member',
    ).toBe('full_control')
  })

  test('AC-520 proof 15: the owner may lower their own Access only once somebody else holds Full control', async () => {
    const { owner, deputy, worker, folderId } = await stage('ac490 owner steps down')

    // First, with a second custodian present: permitted, and R5's worked case.
    await setAccessOk(owner, folderId, owner.id, 'can_view')
    expect(
      await storedPreset(app.db, folderId, owner.id),
      'R5: "the owner may reduce their own Access only when another Full-control member exists" -- and one does',
    ).toBe('can_view')
    expect(
      (await owner.browser.api(`/folders/${folderId}`)).json(),
      'and they are still the structural owner: custody and Access are different facts',
    ).toMatchObject({ is_owner: true })

    // Now the other direction, on a second folder where the owner is alone in
    // Full control.
    const alone = await sharedFolder(app, worker, 'ac490 sole custodian', [
      [deputy, 'can_edit'],
    ])
    const refused = await setAccess(worker, alone, worker.id, 'can_comment')
    expectStatus(
      refused,
      409,
      'R5: with no other Full-control member, the owner stepping down would leave the folder with no administrative path at all',
    )
    expect(
      await storedPreset(app.db, alone, worker.id),
      'and the refusal wrote nothing',
    ).toBe('full_control')
  })

  test('AC-520: a member who is not the last custodian leaves freely', async () => {
    // The control. Without it the four refusals above would be satisfied by
    // an implementation that simply refused every leave and every demotion.
    const { owner, deputy, worker, folderId } = await stage('ac490 ordinary leave')

    const left = await worker.browser.api(`/folders/${folderId}/my-membership`, {
      method: 'DELETE',
    })
    expectStatus(
      left,
      204,
      'an ordinary member leaves: the invariant is about custodians, not about membership',
    )

    const demoted = await setAccess(owner, folderId, deputy.id, 'can_comment')
    expectStatus(
      demoted,
      200,
      'and a Full-control member may be demoted while another one remains',
    )
    expect(
      await storedPreset(app.db, folderId, deputy.id),
      'the demotion landed',
    ).toBe('can_comment')
  })

  test('AC-520 adversarial: two custodians cannot both step down at once', async () => {
    /*
    R9 section 16 requires racing Access changes to serialize or refuse. The
    invariant is what makes that matter here: two Full-control members each
    reading "somebody else holds it" and each demoting themselves would leave
    a folder with none, and each would have been right when it looked.

    `changeMemberAccess` takes the folder row `FOR UPDATE` before it reads any
    membership, so the second caller counts after the first has committed.
    This does not assert which of the two wins -- that is the scheduler's --
    only that exactly one does.
    */
    const { owner, deputy, folderId } = await stage('ac490 raced step-down')

    const [first, second] = await Promise.all([
      setAccess(owner, folderId, owner.id, 'can_edit'),
      setAccess(deputy, folderId, deputy.id, 'can_edit'),
    ])
    const statuses = [first.status, second.status].sort((a, b) => a - b)
    expect(
      statuses,
      `exactly one step-down is admitted and the other is refused by the invariant; got ${statuses.join(' and ')}`,
    ).toEqual([200, 409])

    const presets = await Promise.all([
      storedPreset(app.db, folderId, owner.id),
      storedPreset(app.db, folderId, deputy.id),
    ])
    expect(
      presets.filter((preset) => preset === 'full_control').length,
      'and the folder still has exactly one Full-control member afterwards, which is the invariant itself',
    ).toBe(1)
  })
})
