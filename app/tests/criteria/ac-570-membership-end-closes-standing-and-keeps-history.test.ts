/*
AC-570: when membership ends, active Responsibility standing ends in the same
governed operation and the history stays with the Folder; the former member
cannot read that history merely because they are its subject; and rejoining
reactivates neither the old document nor the old grant.

Issue #230 required proofs 14, 15 and 16, plus the account-deletion clause of
its retention section. Product authority: #209 R10 "Leave / removal" and
"Rejoin", 8.10.

## Three things end together and one of them is easy to forget

R10: "current active Responsibility standing ends in the same governed
membership operation ... document/revision history is retained with the Folder
... nothing is transferred to another member". So the end is a stamp rather
than a delete, and the criterion has to check both halves or it proves the
wrong one: a `DELETE` would pass "no longer an active Responsibility" and fail
the folder's memory of it.

**The path that is easy to miss is account deletion**, and it is covered here
rather than left to 8.10's own criteria for a specific reason. 8.10 step 7
*scrubs* the `users` row rather than deleting it, so no `ON DELETE` clause on a
user foreign key ever fires for an account deletion -- a design that leaned on
a cascade would leave a deleted account standing as an active Responsibility
holder in every folder they were in, indefinitely, and nothing would say so.
#227 hit exactly this shape with Personal Labels.

## Proof 15 is about the reader, not about the record

"A former member cannot read Folder history after access ends merely because
they are the subject." The entries about them survive -- that is proof 14 --
and the refusal is the ordinary folder gate: they are not a member, so 10.2
answers 404 and does not confirm the folder exists. Being the subject of a
record is not a route back into a folder.

## Rejoin

Two things must not come back: the content, and the grant. They are kept apart
by two different mechanisms -- a partial unique index on the active document,
and the membership row's own `DEFAULT false` -- so a case that checked only one
would miss the other entirely.

Spec: 5.3, 8.10, 10.2; #209 R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccount } from '../support/sharing-harness.js'
import {
  commitOk,
  documentRows,
  paragraph,
  readResponsibility,
  readResponsibilityHistory,
  recordOf,
  revisionsOf,
  setSelfEditGrantOk,
  standingOf,
  storedGrant,
  transitionsOf,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'leaver', 'stayer'], 'ac570')

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
  leaver: Actor
  stayer: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, leaver, stayer] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [leaver, 'can_view'],
    [stayer, 'can_edit'],
  ])
  await commitOk(owner, folderId, leaver.id, paragraph('Runs the night shift'))
  return { owner, leaver, stayer, folderId }
}

describe('AC-570 membership end closes standing and keeps the history', () => {
  test('AC-570 proof 14: removal ends the standing, records the ending, and deletes nothing', async () => {
    const { owner, leaver, folderId } = await stage('AC-570 removed')
    const before = revisionsOf(await recordOf(app.db, folderId, leaver.id))

    expectStatus(
      await removeMember(owner, folderId, leaver.id),
      204,
      'Full control removes the member',
    )

    const documents = await documentRows(app.db, folderId, leaver.id)
    expect(
      documents.length,
      'R10: the document is retained with the Folder rather than deleted',
    ).toBe(1)
    expect(
      documents[0]?.ended_at,
      'and its active standing is closed in the same governed operation',
    ).not.toBeNull()
    expect(
      (await recordOf(app.db, folderId, leaver.id)).at(-1)?.actor_id,
      'and who ended it is on the entry that records the ending, which is the authority; there is deliberately no second copy of it on the document row',
    ).toBe(owner.id)
    expect(
      documents[0]?.content,
      "and the content is exactly what it was: nothing is transferred and nothing is scrubbed",
    ).toEqual(paragraph('Runs the night shift'))

    expect(
      transitionsOf(await recordOf(app.db, folderId, leaver.id)),
      'the ending is a recorded transition, so History can show that Responsibility standing ended',
    ).toEqual(['responsibility_created', 'responsibility_ended'])
    expect(
      revisionsOf(await recordOf(app.db, folderId, leaver.id)),
      'and every prior revision is untouched',
    ).toEqual(before)

    expect(
      (await standingOf(owner, folderId, leaver.id)).content,
      'a read of the former member\'s Responsibility answers the empty standing: it is no longer an active member Responsibility',
    ).toBeNull()
  })

  test('AC-570 proof 14: a member leaving of their own accord closes it the same way', async () => {
    const { leaver, folderId } = await stage('AC-570 left')
    expectStatus(
      await leaver.browser.json(`/folders/${folderId}/my-membership`, 'DELETE'),
      204,
      'the member leaves',
    )
    const documents = await documentRows(app.db, folderId, leaver.id)
    expect(documents[0]?.ended_at).not.toBeNull()
    expect(
      (await recordOf(app.db, folderId, leaver.id)).at(-1)?.actor_id,
      'a leave is ended by the leaver, which is what distinguishes it from a removal in the record',
    ).toBe(leaver.id)
  })

  test('AC-570 proof 15: the former member cannot read the folder\'s Responsibility history, subject or not', async () => {
    const { owner, leaver, folderId } = await stage('AC-570 former reader')
    await removeMember(owner, folderId, leaver.id)

    expectStatus(
      await readResponsibilityHistory(leaver, folderId, leaver.id),
      404,
      '#230 proof 15: a former member does not retain Folder read access because historical records about them exist. 10.2 makes it 404 rather than 403',
    )
    expectStatus(
      await readResponsibility(leaver, folderId, leaver.id),
      404,
      'nor the current document surface',
    )
    expectStatus(
      await leaver.browser.json(`/folders/${folderId}/members/${leaver.id}`, 'GET'),
      404,
      'nor the member-details projection about themselves',
    )
    expect(
      (await recordOf(app.db, folderId, leaver.id)).length,
      'while the record about them is still on the folder, for the people who are still in it',
    ).toBeGreaterThan(0)
  })

  test('AC-570 proof 16: rejoining reactivates neither the old document nor the old grant', async () => {
    const { owner, leaver, folderId } = await stage('AC-570 rejoin')
    await setSelfEditGrantOk(owner, folderId, leaver.id, true)
    await removeMember(owner, folderId, leaver.id)

    await addMemberOk(owner, folderId, leaver.id, 'can_view')

    const standing = await standingOf(owner, folderId, leaver.id)
    expect(
      standing.content,
      "R10: prior Responsibility content does not silently reactivate. The new membership starts from nothing",
    ).toBeNull()
    expect(standing.responsibility_id, 'and from no document row').toBeNull()
    expect(
      await storedGrant(app.db, folderId, leaver.id),
      "#230: the self-edit grant defaults from the new add contract rather than from the old membership",
    ).toBe(false)

    const documents = await documentRows(app.db, folderId, leaver.id)
    expect(
      documents.length,
      'the old document is still on the folder, ended',
    ).toBe(1)
    expect(documents[0]?.ended_at).not.toBeNull()

    /* And a deliberate reuse is available to Full control, which R10 permits
       explicitly -- it just has to be somebody's decision. It becomes a new
       current document rather than the old one coming back. */
    const reused = await commitOk(
      owner,
      folderId,
      leaver.id,
      paragraph('Runs the night shift'),
    )
    expect(
      reused.responsibility.revision_no,
      'revision 1 of a new document, not revision 2 of the old one',
    ).toBe(1)
    expect(
      (await documentRows(app.db, folderId, leaver.id)).length,
      'two documents now: the ended one and the new current one',
    ).toBe(2)
  })

  test('AC-570: deleting an account closes its Responsibility standing in folders it was only a member of', async () => {
    const [, , stayer] = (await cast.of(app)) as [Actor, Actor, Actor]
    /*
    A folder the deleting account does **not** own, so 8.10 step 4's
    per-membership cleanup is the path rather than step 3's folder delete.
    That step calls `runRClean` directly and never `removeMembership`, which
    is why the standing is closed inside `runRClean` and not in its caller.

    And 8.10 step 7 scrubs the `users` row rather than deleting it, so nothing
    here can lean on a cascade: `ON DELETE` never fires for an account
    deletion at all (#227 met the same shape with Personal Labels).
    */
    const departing = await (async () => {
      const [, leaver] = (await cast.of(app)) as [Actor, Actor, Actor]
      return leaver
    })()
    const folderId = await createFolder(stayer, 'AC-570 account deletion')
    await connect(app.db, stayer.id, departing.id)
    await addMemberOk(stayer, folderId, departing.id, 'can_view')
    await commitOk(
      stayer,
      folderId,
      departing.id,
      paragraph('Covers the Friday close'),
    )

    expectStatus(
      await deleteAccount(departing),
      204,
      '8.10: the account is deleted',
    )

    const documents = await documentRows(app.db, folderId, departing.id)
    expect(
      documents.length,
      "the folder keeps the record of what the person was expected to handle, which R10 retains for as long as the Folder survives",
    ).toBe(1)
    expect(
      documents[0]?.ended_at,
      'and the standing is closed, rather than left open forever by a cascade that never fires',
    ).not.toBeNull()
    expect(
      transitionsOf(await recordOf(app.db, folderId, departing.id)),
      'with the ending recorded like any other',
    ).toEqual(['responsibility_created', 'responsibility_ended'])
    expect(
      (await recordOf(app.db, folderId, departing.id))[0]?.actor_id,
      '#230: anonymization must not fabricate a different historical actor. The revision still names the person who wrote it',
    ).toBe(stayer.id)
  })
})
