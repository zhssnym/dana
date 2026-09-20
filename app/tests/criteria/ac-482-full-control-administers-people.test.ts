/*
AC-482: Full control administers members, Access and invitations; Can edit --
which may change every piece of shared Work in the folder -- may administer
none of it.

Issue #228 required proof 3. Product authority: #209 R8A and R7 section L.

## The line this draws

R8A's ladder has exactly one break in it that is not about *how much* Work a
member may change: the step from Can edit to Full control is the step from
Work to people. Can edit is the most authority a member can hold over the
folder's contents and none at all over who is in it.

That is the widest of the membership-only write paths #228 closes. Before
this change **any member could add any other member**, invite anybody into
the folder, and cancel somebody else's invitation; the only thing ownership
bought was removing people and renaming.

Every refusal here is 403 rather than 404, deliberately: the actor is a
member, so the folder's existence is not a thing a refusal could still be
protecting, and 10.2 wants a refusal that says why (the same grammar #74
moved `DELETE /files/:id` to).

Spec: 5.3, 5.4, 7.4, 7.5, 10.2; #209 R7 section L, R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  sharedFolder,
  setAccess,
  storedPreset,
} from '../support/folder-access-harness.js'
import {
  Cast,
  connect,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { freshEmail, postInvite } from '../support/sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(
  ['owner', 'editor', 'bystander', 'candidate'],
  'ac482',
)

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
  editor: Actor
  bystander: Actor
  candidate: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, editor, bystander, candidate] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [editor, 'can_edit'],
    [bystander, 'can_comment'],
  ])
  // Both the owner and the editor hold a roster connection to the candidate,
  // so a refusal below is about Access and never about 5.3's connection guard.
  await connect(app.db, owner.id, candidate.id)
  await connect(app.db, editor.id, candidate.id)
  return { owner, editor, bystander, candidate, folderId }
}

describe('AC-482 people administration is Full control and nothing below it', () => {
  test('AC-482: Full control adds a member at a chosen preset; Can edit cannot add at all', async () => {
    const { owner, editor, candidate, folderId } = await stage(
      'ac482 adding people',
    )

    const byEditor = await editor.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      { user_id: candidate.id, access: 'can_edit' },
    )
    expectStatus(
      byEditor,
      403,
      'Can edit may change every piece of shared Work and may not administer people (#209 R7 section L)',
    )

    const byOwner = await owner.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      { user_id: candidate.id, access: 'can_contribute' },
    )
    expectStatus(
      byOwner,
      201,
      'Full control adds a member (spec 7.4, 5.3)',
    )
    expect(
      await storedPreset(app.db, folderId, candidate.id),
      'and the preset the body named is the preset the membership holds: R9 section 6 makes the Access explicit on a direct add, with no default',
    ).toBe('can_contribute')
  })

  test('AC-482: the add refuses a body with no Access at all', async () => {
    const { owner, candidate, folderId } = await stage('ac482 no preset')
    const silent = await owner.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      { user_id: candidate.id },
    )
    expectStatus(
      silent,
      422,
      'R9 section 6: a direct add "requires an explicit Access preset". A default would be one person\'s authority chosen by nobody',
    )
    expect(
      await storedPreset(app.db, folderId, candidate.id),
      'and nothing was written',
    ).toBeNull()
  })

  test('AC-482: Full control changes another member\'s Access; Can edit cannot', async () => {
    const { owner, editor, bystander, folderId } = await stage('ac482 access')

    const byEditor = await setAccess(
      editor,
      folderId,
      bystander.id,
      'can_edit',
    )
    expectStatus(
      byEditor,
      403,
      "changing a member's Access is member administration (#209 R7 section L)",
    )
    expect(
      await storedPreset(app.db, folderId, bystander.id),
      'and the refused change wrote nothing',
    ).toBe('can_comment')

    const byOwner = await setAccess(owner, folderId, bystander.id, 'can_edit')
    expectStatus(byOwner, 200, 'Full control administers Access (#209 R7 section L)')
    expect(
      await storedPreset(app.db, folderId, bystander.id),
      'and the grant lands on the column that decides',
    ).toBe('can_edit')
  })

  test('AC-482: Full control removes a non-owner member; Can edit cannot', async () => {
    const { owner, editor, bystander, folderId } = await stage('ac482 removal')

    const byEditor = await removeMember(editor, folderId, bystander.id)
    expectStatus(
      byEditor,
      403,
      'removing a member is member administration (#209 R7 section L)',
    )

    const byOwner = await removeMember(owner, folderId, bystander.id)
    expectStatus(byOwner, 204, 'Full control removes a non-owner member (spec 5.3)')
  })

  test('AC-482: Full control invites into the folder; Can edit cannot', async () => {
    const { owner, editor, folderId } = await stage('ac482 invites')

    const byEditor = await postInvite(editor, {
      email: freshEmail('ac482-editor'),
      folder_id: folderId,
      access: 'can_edit',
    })
    expectStatus(
      byEditor,
      403,
      'inviting somebody into a folder is member administration (#209 R7 section L)',
    )

    const byOwner = await postInvite(owner, {
      email: freshEmail('ac482-owner'),
      folder_id: folderId,
      access: 'can_comment',
    })
    expectStatus(byOwner, 201, 'Full control invites (spec 7.5)')
  })

  test('AC-482: a pending invite is Full control\'s to see, and its preset rides it', async () => {
    const { owner, editor, folderId } = await stage('ac482 invite visibility')
    const email = freshEmail('ac482-pending')
    const parked = await postInvite(owner, {
      email,
      folder_id: folderId,
      access: 'assigned_work',
    })
    expectStatus(parked, 201, 'the invite parks (spec 7.5)')

    const toOwner = (
      await owner.browser.api(`/folders/${folderId}`)
    ).json() as { pending_invites?: { email?: string; access?: string }[] }
    expect(
      toOwner.pending_invites?.length,
      'Full control sees the folder\'s pending invitations (#228: member-administration data)',
    ).toBe(1)
    expect(
      toOwner.pending_invites?.[0]?.access,
      "and each carries the preset it will grant on acceptance (#209 R9 section 5)",
    ).toBe('assigned_work')

    const toEditor = (
      await editor.browser.api(`/folders/${folderId}`)
    ).json() as { pending_invites?: unknown[] }
    expect(
      toEditor.pending_invites,
      'a member below Full control gets the empty array rather than the addresses: an invitee\'s email and intended Access are member administration, not ordinary Work (#209 R7 section B, #228)',
    ).toEqual([])
  })

  test('AC-482 adversarial: Can edit still changes every piece of shared Work', async () => {
    // The control that makes the five refusals above mean what they say. If
    // Can edit were simply refused everything, the criterion would pass while
    // describing a different and much narrower preset.
    const { editor, folderId } = await stage('ac482 work is still theirs')

    const renamed = await editor.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac482 renamed by Can edit',
      description: 'and described by them too',
    })
    expectStatus(
      renamed,
      200,
      "R7 section C: a folder's identity is ordinary shared Work, so Can edit changes all of it",
    )

    const made = await editor.browser.json('/tasks', 'POST', {
      title: 'ac482 planned by Can edit',
      folder_id: folderId,
    })
    expectStatus(made, 201, 'and Can edit plans the folder\'s work (#209 R8A)')
  })
})
