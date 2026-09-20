/*
AC-522: every effective Access change writes one append-only transition with
the exact from, to, actor, kind and time, atomically with the change itself;
membership ending records `preset -> null` and the record survives the
membership; a rejoin is a new grant rather than a restored one; an invitation
records the inviter as the grantor; and an ownership transfer that changes
nobody's Access fabricates no transition.

Issue #228 required proofs 19, 20, 21, 22 and 23. Product authority: #209 R9
sections 3, 5, 7, 9 and 10, accepted by R10B.

## Why these five are one file

They are five readings of one record, and each of the five is a way the record
could be wrong while the other four looked right:

- **19** the record exists and is exact;
- **20** it outlives the membership it describes, or the history is only ever
  a picture of the present;
- **21** a rejoin writes a new grant, or "was a member once" becomes a
  standing;
- **22** the grantor is the inviter and not the recipient, or accepting an
  invitation is self-service;
- **23** nothing is written when nothing changed, or the record fills with
  entries describing no event.

The record is read from `folder_access_history` directly rather than through
`GET /folders/:id/access-history`. R9 section 12 is explicit that the
structured transition is the authority and the renderings are not, so a
criterion about what was recorded asks the table; the route is driven
separately below, which is the different question of who may read it.

Spec: 4.13, 7.4, 7.5; #209 R9, R10B.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  historyOf,
  setAccessOk,
  shapeOf,
  sharedFolder,
  transferOwnership,
  transitionsOf,
} from '../support/folder-access-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createInviteOk,
  freshEmail,
} from '../support/sharing-harness.js'
import { signIn, userForSub } from '../support/auth-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'member'], 'ac492')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-522 the Access record is complete, exact and append-only', () => {
  test('AC-522 proof 19: a change records exact from, to, actor, kind and time', async () => {
    const [owner, , member] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 exact', [
      [member, 'assigned_work'],
    ])

    const before = await historyOf(app.db, folderId, member.id)
    expect(
      before.map(shapeOf),
      'R9 section 6: a direct add records `null -> preset` with the adding administrator as actor',
    ).toEqual(['null -> assigned_work (member_added)'])
    expect(before[0]?.actor_id, 'and the actor is the administrator').toBe(
      owner.id,
    )

    await setAccessOk(owner, folderId, member.id, 'can_contribute')
    await setAccessOk(owner, folderId, member.id, 'can_view')

    const after = await historyOf(app.db, folderId, member.id)
    expect(
      after.map(shapeOf),
      'R9 section 7: "Every promotion/demotion records exact from -> to. No silent overwrite"',
    ).toEqual([
      'null -> assigned_work (member_added)',
      'assigned_work -> can_contribute (access_changed)',
      'can_contribute -> can_view (access_changed)',
    ])
    for (const entry of after.slice(1)) {
      expect(
        entry.actor_id,
        'each carries the administrator who made it',
      ).toBe(owner.id)
    }
    expect(
      new Date(String(after[2]?.effective_at)).getTime(),
      'and the effective times are ordered, so the sequence reconstructs',
    ).toBeGreaterThanOrEqual(
      new Date(String(after[0]?.effective_at)).getTime(),
    )
  })

  test('AC-522 proof 19: a refused change records nothing at all', async () => {
    // Atomicity read from the side that is easy to get wrong: a transition
    // written before the guard, or outside the transaction, would leave a
    // record of a change that did not happen.
    const [owner, deputy] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 refused', [
      [deputy, 'can_edit'],
    ])
    const before = await historyOf(app.db, folderId)

    const refused = await deputy.browser.json(
      `/folders/${folderId}/members/${owner.id}`,
      'PATCH',
      { access: 'can_view' },
    )
    expectStatus(refused, 403, 'Can edit does not administer Access (accepted R8A)')

    expect(
      await historyOf(app.db, folderId),
      'R9 section 3: the Access write and its history row commit together or not at all, so a refusal leaves no trace of a change nobody made',
    ).toEqual(before)
  })

  test('AC-522 proof 19: self-demotion is distinguished from a grant somebody made', async () => {
    const [owner, deputy] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 self', [
      [deputy, 'full_control'],
    ])
    await setAccessOk(owner, folderId, owner.id, 'can_edit')

    const entries = await historyOf(app.db, folderId, owner.id)
    const last = entries[entries.length - 1]
    expect(
      last?.transition,
      'R9 section 8: "transition kind distinguishes self-change where useful" -- "Omar lowered Sarah" and "Sarah lowered herself" are different facts about one row',
    ).toBe('self_demoted')
    expect(last?.actor_id, 'and the actor is the affected member').toBe(owner.id)
  })

  test('AC-522 proof 20: leaving and removal record preset -> null, and the record outlives the membership', async () => {
    const [owner, deputy, member] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'ac492 endings', [
      [deputy, 'can_edit'],
      [member, 'can_comment'],
    ])

    const left = await deputy.browser.api(`/folders/${folderId}/my-membership`, {
      method: 'DELETE',
    })
    expectStatus(left, 204, 'an ordinary member leaves (spec 5.3)')

    const removed = await removeMember(owner, folderId, member.id)
    expectStatus(removed, 204, 'and the owner removes another (spec 5.3)')

    const leaver = await historyOf(app.db, folderId, deputy.id)
    expect(
      leaver.map(shapeOf),
      'R9 section 9: "On voluntary leave, record current preset -> null"',
    ).toEqual([
      'null -> can_edit (member_added)',
      'can_edit -> null (member_left)',
    ])
    expect(
      leaver[1]?.actor_id,
      'with the departing member as actor',
    ).toBe(deputy.id)

    const taken = await historyOf(app.db, folderId, member.id)
    expect(
      transitionsOf(taken),
      'and a removal records the same shape under a different kind, with the administrator as actor',
    ).toEqual(['member_added', 'member_removed'])
    expect(taken[1]?.actor_id, 'the administrator who removed them').toBe(
      owner.id,
    )

    const memberships = await rows(
      app.db,
      sql`SELECT user_id FROM folder_members
          WHERE folder_id = ${folderId}::uuid`,
    )
    expect(
      memberships.map((row) => String(row.user_id)),
      'both memberships are gone',
    ).toEqual([owner.id])
    expect(
      (await historyOf(app.db, folderId)).length,
      'R9 sections 9 and 15: "The history persists after the active membership row is gone", and survives while the Folder does',
    ).toBe(5)
  })

  test('AC-522 proof 21: a rejoin is a new explicit grant, never the old one restored', async () => {
    const [owner, , member] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 rejoin', [
      [member, 'can_edit'],
    ])
    expectStatus(
      await removeMember(owner, folderId, member.id),
      204,
      'they leave the folder',
    )

    await addMemberOk(owner, folderId, member.id, 'can_comment')

    const entries = await historyOf(app.db, folderId, member.id)
    expect(
      entries.map(shapeOf),
      'R9 section 4: "A re-added member receives a new explicit transition... Old Access must not silently reactivate"',
    ).toEqual([
      'null -> can_edit (member_added)',
      'can_edit -> null (member_removed)',
      'null -> can_comment (member_added)',
    ])

    const rename = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac492 renamed on the strength of an old standing',
    })
    expectStatus(
      rename,
      403,
      'and the rejoined standing is the one they were given, not the one they used to hold',
    )
  })

  test('AC-522 proof 22: invite acceptance records the inviter as the grantor', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 invitation')

    // A person who does not exist yet, so the invite genuinely parks rather
    // than converting to an instant share (8.7).
    const email = freshEmail('ac492-recipient').toLowerCase()
    const invite = await createInviteOk(
      owner,
      { email, folder_id: folderId, access: 'can_contribute' },
      'the folder invite parks with the preset it will grant (7.5, R9 section 5)',
    )

    // The recipient signs in for the first time and accepts.
    const sub = `ac492-recipient-${randomUUID()}`
    app.stub.nextIdentity({
      sub,
      email,
      email_verified: true,
      name: 'AC492 Recipient',
    })
    const { browser } = await signIn(app)
    const row = await userForSub(app.db, sub)
    const recipientId = String((row as { id: string }).id)
    cast.trackUser(recipientId)

    const accepted = await browser.json(
      `/invites/${invite.id}/accept`,
      'POST',
      {},
    )
    expectStatus(accepted, 200, 'the recipient accepts (spec 7.5, 8.7)')

    const entries = await historyOf(app.db, folderId, recipientId)
    expect(
      entries.map(shapeOf),
      'R9 section 5: acceptance activates the invited preset and records `null -> preset`',
    ).toEqual(['null -> can_contribute (invite_accepted)'])
    expect(
      entries[0]?.actor_id,
      'R9 section 5: "Do not pretend the invite recipient granted themselves the preset merely because they clicked Accept" -- the actor is the authorized inviter',
    ).toBe(owner.id)
    expect(
      entries[0]?.actor_id === recipientId,
      'and it is emphatically not the recipient',
    ).toBe(false)
  })

  test('AC-522 proof 23: an ownership transfer that changes no Access writes no transition', async () => {
    const [owner, deputy] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac492 transfer', [
      [deputy, 'full_control'],
    ])
    const before = await historyOf(app.db, folderId)

    expectStatus(
      await transferOwnership(owner, folderId, deputy.id),
      200,
      'custody moves to the eligible successor (R6 section 2)',
    )

    expect(
      await historyOf(app.db, folderId),
      'R9 section 10: "ownership transfer alone does not create an Access-history entry unless it actually changes Access" -- the successor was already Full control, so there is no fake `Full control -> Full control`',
    ).toEqual(before)
  })

  test('AC-522: the history is readable by every current member and by nobody else', async () => {
    // R9 section 13's M1 visibility rule, and R9A's boundary: #228 owes the
    // Folder view and a member-specific one, and owes no filter taxonomy.
    const [owner, deputy, member] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'ac492 reading it', [
      [member, 'can_view'],
    ])
    await connect(app.db, owner.id, deputy.id)

    const whole = await member.browser.api(`/folders/${folderId}/access-history`)
    expectStatus(
      whole,
      200,
      'R9 section 13: "effective Access-change history is also visible to current Folder members"',
    )
    const body = whole.json() as { entries: { member_id: string }[] }
    expect(
      body.entries.length,
      'and it carries the folder\'s transitions',
    ).toBeGreaterThanOrEqual(2)

    const mine = await member.browser.api(
      `/folders/${folderId}/members/${member.id}/access-history`,
    )
    expectStatus(mine, 200, 'R9 section 14: a member-specific recent view')
    const slice = mine.json() as { entries: { member_id: string }[] }
    expect(
      slice.entries.every((entry) => entry.member_id === member.id),
      'filtered to the member the path names',
    ).toBe(true)

    const stranger = await deputy.browser.api(
      `/folders/${folderId}/access-history`,
    )
    expectStatus(
      stranger,
      404,
      '10.2: somebody outside the folder is told nothing, not even that the folder exists',
    )
  })
})
