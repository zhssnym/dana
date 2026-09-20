/*
AC-571: changing a member's Access, transferring ownership, and recovering
custody each leave every Responsibility document exactly as it was.

Issue #230 required proof 17. Product authority: #209 R10 "Ownership / Access
change", R8A's governing distinction.

## Why this needs saying at all

R8A's whole point is that Ownership, Access, Responsibility and Assignment are
four independent facts, and #230 restates the consequence: "Responsibility
changes only when an authorized actor edits it, the membership activation
creates initial content, or membership ends."

The temptation this refuses is a helpful one. A member demoted from Can edit to
Can view plainly cannot do most of what their Responsibility says any more, and
an implementation that trimmed the document to match would feel tidy and would
be a fourth fact derived from a second -- which is the coupling #209 spent R2
to R8 removing. The same goes the other way for a promotion, and for a new
owner inheriting the old one's scope.

So this drives the three standing-changing acts #228 owns and asserts that the
Responsibility side is byte-identical afterwards: same content, same revision
number, same content hash, same `updated_at`, same `updated_by`, and **no new
entry in the record**. The last one matters on its own: a no-op write that
produced a revision saying nothing changed would pass every content assertion
and pollute the history a person reads.

Spec: 7.4, 8.9; #209 R8A, R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  forcePreset,
  recoverOwnership,
  setAccessOk,
  sharedFolder,
  transferOwnership,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  documentRows,
  paragraph,
  recordOf,
  setSelfEditGrantOk,
  storedGrant,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'subject'], 'ac571')

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
  subject: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, deputy, subject] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [subject, 'can_edit'],
  ])
  await commitOk(
    owner,
    folderId,
    subject.id,
    paragraph('Owns the weekly walk-round and the tag renewals'),
  )
  await commitOk(owner, folderId, deputy.id, paragraph('Runs the office'))
  return { owner, deputy, subject, folderId }
}

/** Everything about the Responsibility side of a folder, in one comparable
 * value, so a case can say "nothing moved" rather than listing fields. */
async function snapshot(folderId: string): Promise<unknown> {
  return {
    documents: await documentRows(app.db, folderId),
    record: await recordOf(app.db, folderId),
  }
}

describe('AC-571 Access and ownership changes rewrite no Responsibility', () => {
  test('AC-571 proof 17: demoting and promoting a member changes nothing about their Responsibility', async () => {
    const { owner, subject, folderId } = await stage('AC-571 access change')
    const before = await snapshot(folderId)

    await setAccessOk(owner, folderId, subject.id, 'can_view')
    await setAccessOk(owner, folderId, subject.id, 'can_contribute')
    await setAccessOk(owner, folderId, subject.id, 'assigned_work')

    expect(
      await snapshot(folderId),
      'R10: "Ownership transfer or Access change does not rewrite the Responsibility document automatically." Three Access changes later, every document and every entry is what it was',
    ).toEqual(before)
  })

  test('AC-571 proof 17: transferring ownership rewrites neither the old owner\'s Responsibility nor the new one\'s', async () => {
    const { owner, deputy, folderId } = await stage('AC-571 transfer')
    await commitOk(owner, folderId, owner.id, paragraph('Holds the contract'))
    const before = await snapshot(folderId)

    expectStatus(
      await transferOwnership(owner, folderId, deputy.id),
      200,
      '8.9: the owner transfers custody to an eligible Full-control successor',
    )

    expect(
      await snapshot(folderId),
      'custody moved and no Responsibility did. The new owner does not inherit the old one\'s scope and the old one does not lose theirs',
    ).toEqual(before)
  })

  test('AC-571 proof 17: owner custody recovery rewrites nothing either', async () => {
    const { owner, deputy, folderId } = await stage('AC-571 recovery')
    /* The owner lowers themselves -- which R5 permits while another human
       Full control exists -- and then recovers. `forcePreset` is not used:
       this is the act being measured, so it goes through the endpoint. */
    await setAccessOk(owner, folderId, owner.id, 'can_view')
    const before = await snapshot(folderId)

    expectStatus(
      await recoverOwnership(owner, folderId),
      200,
      'R9 section 8: the structural owner recovers Full control',
    )
    expect(
      await snapshot(folderId),
      'a custody act is not an edit of anybody\'s Responsibility',
    ).toEqual(before)
    void deputy
  })

  test('AC-571 proof 17: the self-edit grant survives an Access change, because it is a different fact', async () => {
    const { owner, subject, folderId } = await stage('AC-571 grant survives')
    await setSelfEditGrantOk(owner, folderId, subject.id, true)
    const before = await snapshot(folderId)

    await setAccessOk(owner, folderId, subject.id, 'can_view')
    expect(
      await storedGrant(app.db, folderId, subject.id),
      'R7 section O: the grant is independent of the ladder, so moving somebody down it neither grants nor revokes',
    ).toBe(true)
    expect(
      await snapshot(folderId),
      'and the Access change recorded no Responsibility entry of its own',
    ).toEqual(before)
  })

  test('AC-571 proof 17: a Responsibility is not derived from Task assignment or activity', async () => {
    const { owner, subject, folderId } = await stage('AC-571 not derived')
    const before = await snapshot(folderId)

    const made = await owner.browser.json('/tasks', 'POST', {
      title: 'AC-571 a task assigned to the subject',
      folder_id: folderId,
      assignee_id: subject.id,
    })
    expectStatus(made, 201, 'the owner assigns work to the subject')
    const taskId = (made.json() as { id: string }).id
    expectStatus(
      await owner.browser.json(`/tasks/${taskId}`, 'PATCH', {
        assignee_id: null,
      }),
      200,
      'and then unassigns it',
    )

    expect(
      await snapshot(folderId),
      '#230: "Do not derive Responsibility from Task assignments or activity." Assigning and unassigning wrote nothing',
    ).toEqual(before)
    void forcePreset
  })
})
