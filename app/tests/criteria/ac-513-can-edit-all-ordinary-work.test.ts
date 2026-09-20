/*
AC-513: Can edit changes every piece of ordinary shared Work in the folder --
its identity, its page, its Sections, and every Task in it whoever holds them
-- and stops exactly at the acts the accepted records reserve.

Issue #228 required proof 4. Product authority: accepted #209 R8A -- "Can
edit -- plan/change all shared Folder work" -- with #228's Can-edit list,
which names "Folder name/description/icon/color/cover" and the "Folder
page/composer" inside it. The folder's own identity is ordinary Work rather
than people administration.

## Two decisions moved here and both are named

**The rename was the owner's.** `PATCH /folders/:id` split the body by role:
the name was the owner's and the rest of the 4.3 identity was any member's
(the DES-225 split of RFC 0005). Accepted R8A replaces both halves with one
rule -- the folder's identity is ordinary shared Work -- which *narrows* the
dressing and *widens* the rename. AC-011, AC-012 and AC-193 were rewritten
against that record on 2026-09-20 under Hassan's ruling,
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.

**Trashing the folder was the owner's too.** Hassan's ruling of 2026-09-20
makes recoverable administrative deletion Full control's -- accepted R8A does
not settle it either way -- so Can edit is refused it here, and AC-015 carries
that ruling. That is the boundary this criterion is about: broad authority
over the contents is not authority over the container.

Spec: 4.3, 4.17, 7.4, 7.6, 7.16; accepted #209 R8A, #228's capability
boundaries, and Hassan's ruling of 2026-09-20 for the folder's own Trash.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'editor'], 'ac483')

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
  editor: Actor
  folderId: string
}> {
  const [owner, editor] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [[editor, 'can_edit']])
  return { owner, editor, folderId }
}

describe('AC-513 Can edit owns the Work and not the container', () => {
  test("AC-513: the folder's whole identity, the rename included", async () => {
    const { editor, folderId } = await stage('ac483 identity')
    const patched = await editor.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac483 renamed',
      description: 'ac483 described',
      icon: 'leaf',
      color: '#33AA55',
    })
    expectStatus(
      patched,
      200,
      "accepted R8A: a folder's name, description, icon, colour and cover are ordinary shared Work, and the DES-225 owner-only rename is superseded (AC-011, AC-012, AC-193)",
    )
    const body = patched.json() as { name?: string; description?: string }
    expect(body.name, 'the rename landed').toBe('ac483 renamed')
    expect(body.description, 'and so did the sentence').toBe('ac483 described')
  })

  test("AC-513: the folder page and its Sections", async () => {
    const { editor, folderId } = await stage('ac483 page')
    const written = await editor.browser.json(
      `/folders/${folderId}/page`,
      'PUT',
      {
        blocks: [
          { kind: 'paragraph', position: 0, text: 'ac483 wrote the page' },
        ],
      },
    )
    expectStatus(
      written,
      200,
      "#228's Can-edit list: the folder page and composer are ordinary shared Work",
    )

    /* A folder of its own, because `insert_block` takes an anchor and an
       anchorless insert is only legal onto an empty page -- the page above
       now holds a paragraph. The placement rule is `page-order.ts`'s and is
       not what this criterion is about. */
    const emptyPage = await stage('ac483 sections')
    const sectioned = await emptyPage.editor.browser.json(
      `/folders/${emptyPage.folderId}/page/actions`,
      'POST',
      {
        action: 'insert_block',
        block_kind: 'section',
        text: 'ac483 section',
        section_block_id: null,
        after: null,
        before: null,
      },
    )
    expectStatus(
      sectioned,
      200,
      "creating a Section is Can edit's, and it is the authority #228's Can-contribute list keeps away from them: they may place their own Task among existing Sections and may not make one (accepted #209 R8A)",
    )
  })

  test("AC-513: every Task in the folder, including another member's", async () => {
    const { owner, editor, folderId } = await stage('ac483 tasks')
    const ownersTask = await taskIn(
      owner,
      folderId,
      'ac483 the owner holds this',
      owner.id,
    )

    const renamed = await editor.browser.json(`/tasks/${ownersTask}`, 'PATCH', {
      title: 'ac483 replanned by Can edit',
      due_date: '2026-12-01',
      important: true,
    })
    expectStatus(
      renamed,
      200,
      "accepted #209 R8A: Can edit plans and changes *all* shared Folder work, not only their own",
    )

    const reassigned = await editor.browser.json(
      `/tasks/${ownersTask}`,
      'PATCH',
      { assignee_id: editor.id },
    )
    expectStatus(
      reassigned,
      200,
      "#228's Can-edit list: assign, reassign and unassign are planning authority and Can edit has it",
    )

    const trashed = await editor.browser.api(`/tasks/${ownersTask}`, {
      method: 'DELETE',
    })
    expectStatus(
      trashed,
      204,
      "#228's Can-edit list: trashing a Task is Can edit's; only the permanent delete is held back",
    )
  })

  test('AC-513: and stops at the three acts the accepted records reserve', async () => {
    const { owner, editor, folderId } = await stage('ac483 the boundary')

    const trashedFolder = await editor.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      trashedFolder,
      403,
      "Hassan's ruling of 2026-09-20 on #228: moving the folder itself to Trash is recoverable administrative deletion, which is Full control's",
    )

    const taskId = await taskIn(owner, folderId, 'ac483 to be destroyed', owner.id)
    await owner.browser.api(`/tasks/${taskId}`, { method: 'DELETE' })
    const destroyed = await editor.browser.api(`/trash/tasks/${taskId}`, {
      method: 'DELETE',
    })
    expectStatus(
      destroyed,
      403,
      "#228's Full-control list: permanent deletion is an irreversible administrative act and stays with Full control even though soft Task editing is Can edit's",
    )

    const handed = await editor.browser.json(
      `/folders/${folderId}/transfer-ownership`,
      'POST',
      { to: editor.id },
    )
    expectStatus(
      handed,
      403,
      "governing R5 and R6: transferring ownership is the owner's alone, and even Full control does not confer it -- let alone Can edit",
    )
  })
})
