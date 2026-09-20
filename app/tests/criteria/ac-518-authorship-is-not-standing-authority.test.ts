/*
AC-518: a member reduced to Can view keeps the comments they wrote and the
files they uploaded, and loses every power to change either.

Issue #228 required proof 12. Product authority: #209's accepted cross-cutting
rule -- "Authorship is provenance, not standing authority" -- read against
accepted R8A's ladder and #228's own Can-comment and Full-control lists.

## The two rules this replaces, both by name

**Comments.** `PATCH /comments/:id` and `DELETE /comments/:id` gated on
`access.isAuthor`, full stop. A person downgraded to Can view could still
rewrite or delete anything they had ever said in the folder, which is exactly
the hidden mutation authority the accepted rule names. #228: "If a
prior commenter is later downgraded to Can view, they can still read their old
comment but may no longer mutate it."

**Files.** `DELETE /files/:id` gated on "the uploader **or** the folder
owner". #228 says in terms that this is superseded: "Uploader
authorship alone must not survive a downgrade as hidden mutation authority",
and direct permanent deletion of a Folder-scoped file is Full control's.

## The shape of the proof

Each case does the same three things: act while the standing is there, take
the standing away, then try the same act again and read that the row did not
move. The middle step is an ordinary `PATCH
/folders/:id/members/:userId`, so the criterion is also driving the
administration surface a second time, which is deliberate -- a downgrade that
did not actually land would make every refusal below meaningless.

Spec: 7.14, 7.15, 10.2; #228's authorship rule and its Full-control list.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  setAccessOk,
  sharedFolder,
  storedPreset,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { ONE_PIXEL_PNG, upload } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'author'], 'ac488')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function stage(name: string): Promise<{
  owner: Actor
  author: Actor
  folderId: string
}> {
  const [owner, author] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [[author, 'can_edit']])
  return { owner, author, folderId }
}

/** 7.15's upload, through the uploads harness, answering the status and the
 * id: this criterion needs the refused case as well as the granted one, so it
 * cannot use `uploadImageOk`, which asserts 201. */
async function uploadInto(
  actor: Actor,
  folderId: string,
): Promise<{ status: number; id: string | null }> {
  const stored = await upload(
    actor,
    '/files',
    { kind: 'image', folder_id: folderId },
    { name: 'ac488.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  return {
    status: stored.status,
    id:
      stored.status === 201
        ? String((stored.json() as { id: string }).id)
        : null,
  }
}

describe('AC-518 the words and the bytes stay; the power to change them does not', () => {
  test('AC-518: a downgraded author can read their comment and no longer edit or delete it', async () => {
    const { owner, author, folderId } = await stage('ac488 comments')

    const said = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'ac488 said while they could' },
    )
    expectStatus(said, 201, 'the author writes it while they hold Can edit')
    const commentId = String((said.json() as { id: string }).id)

    const edited = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      body: 'ac488 edited while they could',
    })
    expectStatus(edited, 200, 'and edits it while they hold Can edit')

    await setAccessOk(owner, folderId, author.id, 'can_view')
    expect(
      await storedPreset(app.db, folderId, author.id),
      'the downgrade landed, which is what makes the refusals below mean anything',
    ).toBe('can_view')

    const stillThere = await author.browser.api(
      `/folders/${folderId}/comments`,
    )
    expectStatus(
      stillThere,
      200,
      "#228's authorship rule: a downgraded member still reads their old comment",
    )
    expect(
      stillThere.body,
      'and the words are still theirs to read -- nothing about a downgrade removes what was said',
    ).toContain('ac488 edited while they could')

    const afterwards = await author.browser.json(
      `/comments/${commentId}`,
      'PATCH',
      { body: 'ac488 rewritten after the downgrade' },
    )
    expectStatus(
      afterwards,
      403,
      "#228's authorship rule: ...and may no longer mutate it. Authorship is provenance, not standing authority",
    )

    const removed = await author.browser.api(`/comments/${commentId}`, {
      method: 'DELETE',
    })
    expectStatus(
      removed,
      403,
      'and deleting it is the same authority read the other way round',
    )

    const readBack = await owner.browser.api(`/folders/${folderId}/comments`)
    expect(
      readBack.body,
      'the refused edit and the refused delete both wrote nothing',
    ).toContain('ac488 edited while they could')
  })

  test('AC-518: a downgraded uploader can still read their file and no longer delete it', async () => {
    const { owner, author, folderId } = await stage('ac488 files')

    const uploaded = await uploadInto(author, folderId)
    expect(
      uploaded.status,
      "#228's Can-edit list: a picture for the folder page is ordinary shared Work, which Can edit uploads",
    ).toBe(201)
    const fileId = uploaded.id as string

    await setAccessOk(owner, folderId, author.id, 'can_view')

    expectStatus(
      await author.browser.api(`/files/${fileId}`),
      200,
      'accepted R8A: Can view is read only and reads everything Folder-visible, the uploader included',
    )

    const deleted = await author.browser.api(`/files/${fileId}`, {
      method: 'DELETE',
    })
    expectStatus(
      deleted,
      403,
      "#228's authorship rule -- a member reduced to Can view must not retain mutation power over a file merely because they uploaded it -- and the refusal is 403 rather than 404 because they demonstrably read the same bytes at 200",
    )
    expectStatus(
      await owner.browser.api(`/files/${fileId}`),
      200,
      'and the file is still there',
    )
  })

  test('AC-518: the uploader rule is superseded outright, not merely narrowed', async () => {
    // The other half of #228's Full-control list, and the part that is easy to miss: a
    // Can-edit member who uploaded the file still cannot delete it, because
    // the rule is no longer about who uploaded anything. Only Full control
    // deletes a Folder-scoped file.
    const { owner, author, folderId } = await stage('ac488 uploader rule')
    const uploaded = await uploadInto(author, folderId)
    expect(uploaded.status, 'the upload succeeds at Can edit').toBe(201)
    const fileId = uploaded.id as string

    const byUploader = await author.browser.api(`/files/${fileId}`, {
      method: 'DELETE',
    })
    expectStatus(
      byUploader,
      403,
      "#228's Full-control list: direct permanent deletion of a Folder-scoped file is Full control's, and Can edit is not it however the file got there",
    )

    const byFullControl = await owner.browser.api(`/files/${fileId}`, {
      method: 'DELETE',
    })
    expectStatus(
      byFullControl,
      204,
      'while Full control deletes it, whoever uploaded it',
    )
  })

  test('AC-518: a downgraded member keeps their own Task history and loses the Task', async () => {
    // The same rule at the third place it could have hidden: `tasks.created_by`.
    const { owner, author, folderId } = await stage('ac488 authored tasks')
    const made = await author.browser.json('/tasks', 'POST', {
      title: 'ac488 planned while they could',
      folder_id: folderId,
      assignee_id: author.id,
    })
    expectStatus(made, 201, 'the author creates it at Can edit')
    const taskId = String((made.json() as { id: string }).id)

    await setAccessOk(owner, folderId, author.id, 'can_view')

    expectStatus(
      await author.browser.api(`/tasks/${taskId}`),
      200,
      'they still read the Task they wrote',
    )
    expectStatus(
      await author.browser.json(`/tasks/${taskId}`, 'PATCH', {
        title: 'ac488 rewritten after the downgrade',
      }),
      403,
      'and created_by confers nothing: ongoing authority is the preset and the current assignment, neither of which they now have',
    )
  })
})
