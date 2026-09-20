/*
AC-554: losing membership of a Folder does not delete the leaver's Personal
Label assignments to the Work inside it. They become unreadable while access is
gone, they leak nothing through any Label surface, and they read again if
access is restored.

## The rule is "hidden, not deleted", and both halves fail differently

Deleting on access loss is the obvious implementation and it is wrong: access
comes back — a person is re-added, a temporary removal is undone — and #208's
access-loss rule says the association *may become visible again* with no repair
step, which it cannot if the rows were destroyed. So the row must survive.

But a surviving row that any read can still see is a leak of exactly the kind
this model exists to prevent: the Work is no longer the leaver's to see, and a
Label surface that answered "you have three things tagged Reading" — without
saying what they are — would still be telling them the Work is still there.

So this file asserts **both** at once, at every stage: the row is present in
`task_personal_labels`, and every read the leaver still has shows them nothing.

## Which reads count as "any Label read or filter"

`GET /labels` is the definition surface: the leaver's catalog is theirs and
survives, which is correct and is not a leak, because a definition says nothing
about what wears it. The leak would be in a projection, so the criterion drives
`GET /tasks/:id` and `GET /folders` and asserts 404 and absence — and it names
`GET /labels?folder_id=` too, which is the one Label gate `ac-397` cannot see,
its id being in the query string rather than in the path.

## Folder Labels are unaffected by who left

They belong to the Folder. The criterion asserts they are still there and still
on the Task for the members who remain, so that a removal implemented as "clean
up the departing member's classification" cannot take the Folder's with it.

Spec: 5.3 (R-CLEAN), 7.4, 10.2. Issue #227 area 8, #208 R4 access-loss rule.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFolderLabel,
  createPersonalLabel,
  getLabels,
  listLabels,
  putFolderLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  folderPersonalLabelIds,
  taskFolderLabelIds,
  taskPersonalLabelIds,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk, getTask } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'leaver'], 'ac534')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-554 access loss hides a private assignment and destroys nothing', () => {
  test('the row survives removal, leaks nothing, and reads again on return', async () => {
    const [owner, leaver] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, leaver.id)
    const folderId = await createFolder(owner, 'ac534 shared folder')
    await addMemberOk(owner, folderId, leaver.id)

    const shared = await createFolderLabel(owner, folderId, {
      name: 'ac534 the folder’s own',
    })
    const theirs = await createPersonalLabel(leaver, { name: 'ac534 reading' })

    const task = await createTaskOk(
      owner,
      { title: 'ac534 the shared work', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label attaches (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(leaver, task.id, theirs.id),
      200,
      'and the leaver classifies it privately (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(leaver, folderId, theirs.id),
      200,
      'and the folder too (spec 7.0)',
    )
    expect(
      (await taskLabelsOf(leaver, task.id)).personal.map((label) => label.id),
      'the fixture is honest: while they are a member, they read their own Label on the task',
    ).toEqual([theirs.id])

    /* The removal. */
    expectStatus(
      await removeMember(owner, folderId, leaver.id),
      204,
      'the owner removes the member (spec 7.4, 5.3)',
    )

    /* Half one: the rows are still there. */
    expect(
      await taskPersonalLabelIds(app.db, task.id, leaver.id),
      'the retained assignment is still a row after the removal: access loss is not deletion, and a destroyed row could never "become visible again if access is restored" (#208 R4, #227 area 8)',
    ).toEqual([theirs.id])
    expect(
      await folderPersonalLabelIds(app.db, folderId, leaver.id),
      'and so is the one on the folder',
    ).toEqual([theirs.id])

    /* Half two: nothing reads them, on any surface. */
    const refused = await getTask(leaver, task.id)
    expect(
      refused.status,
      'the task itself is 404 to them, which is 10.2 unchanged',
    ).toBe(404)
    const folders = await leaver.browser.api('/folders')
    expectStatus(folders, 200, 'their folder list still reads')
    expect(
      JSON.stringify(folders.json()).includes(folderId),
      'and the folder they left is not in it, so no `personal_labels` array can carry the retained assignment either',
    ).toBe(false)

    const catalog = await listLabels(leaver, { scope: 'personal' })
    expect(
      catalog.map((label) => label.id),
      'their own definition survives and still lists: a definition says nothing about what wears it, so keeping it is not the leak (#208 R4)',
    ).toContain(theirs.id)

    const narrowed = await getLabels(leaver, {
      scope: 'folder',
      folder_id: folderId,
    })
    expect(
      narrowed.status,
      'and narrowing the listing to the folder they left is 404 rather than 403 or an empty 200 — the one Label gate `ac-397` cannot see, its id being in the query string (10.2, AC-473)',
    ).toBe(404)

    /* And the Folder's own classification is untouched by who left. */
    expect(
      await taskFolderLabelIds(app.db, task.id),
      'the Folder Label is still on the task: it belongs to the Folder, not to any member (#227 area 8)',
    ).toEqual([shared.id])
    expect(
      (await taskLabelsOf(owner, task.id)).folder.map((label) => label.id),
      'and the owner still reads it',
    ).toEqual([shared.id])
    expect(
      (await taskLabelsOf(owner, task.id)).personal,
      'while the owner never sees the leaver’s Personal one, before or after',
    ).toEqual([])

    /* Access restored: the association comes back with no repair step. */
    await addMemberOk(owner, folderId, leaver.id)
    expect(
      (await taskLabelsOf(leaver, task.id)).personal.map((label) => label.id),
      'the retained assignment reads again on return, which is the whole reason it was kept (#208 R4, #227 area 8)',
    ).toEqual([theirs.id])
    const back = await leaver.browser.api('/folders')
    const row = (back.json() as { id: string; personal_labels: { id: string }[] }[]).find(
      (entry) => entry.id === folderId,
    )
    expect(
      row?.personal_labels.map((label) => label.id),
      'and so does the one on the folder',
    ).toEqual([theirs.id])
  })
})
