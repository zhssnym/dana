/*
AC-553: purging a Task or a Folder removes exactly the Label rows that belonged
to it, by cascade, leaving Personal **definitions** standing; and deleting an
account removes that account's Personal Labels and every Personal assignment it
made.

## Three cascades and one statement, and the last one is the interesting case

Purging a Task takes its assignment rows through the FK on `tasks.id`. Purging
a Folder takes its Folder Labels through `labels.folder_id`, its Folder-target
Personal assignments through `folder_personal_labels.folder_id`, and its Tasks'
assignments through the Tasks. All four are the database's, and #227 forbids
adding a cleanup loop where FK semantics already do the work.

Account deletion is not one of those cases, and this criterion is where that
becomes visible. `labels_owner_user_id_fkey` is `ON DELETE CASCADE` and would
do the whole job if 8.10 deleted the `users` row — but 8.10 step 7 **scrubs**
it instead, precisely so `tasks.created_by` can keep pointing at something. So
the cascade never fires, and without an explicit statement a deleted account's
Personal Labels would outlive it for ever with their assignments still sitting
on shared work other people can still read. #227 area 7 assumes the cascade;
what makes its sentence true is one DELETE in the deletion transaction, and
this is the case that fails if somebody removes it.

## What must survive is as much of the criterion as what must go

A Personal Label definition is the viewer's, not the target's: purging the Task
it was applied to takes the assignment and leaves the Label. An implementation
that cascaded the other way would delete a person's vocabulary because they
emptied their Trash.

Spec: 7.13, 8.10, 4.3, 4.5. Issue #227 area 7, #208 R4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  createFolderLabel,
  createPersonalLabel,
  putFolderLabel,
  putTaskLabel,
} from '../support/labels-harness.js'
import {
  allTaskPersonalRows,
  deleteFolder,
  deleteTask,
  folderLabelRows,
  personalLabelRows,
  purgeFolder,
  purgeTask,
  taskFolderLabelIds,
  taskPersonalLabelIds,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac533')

/** Rows in one assignment table naming one label, whatever the target: the
 * query that proves a cascade reached them rather than a projection hiding
 * them. */
async function assignmentCount(
  table: 'task_personal_labels' | 'folder_personal_labels' | 'task_folder_labels',
  labelId: string,
): Promise<number> {
  const found = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM ${sql.raw(table)}
         WHERE label_id = ${labelId}::uuid`,
  )
  return Number(found[0]?.n ?? 0)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-553 purge takes the assignments and leaves the vocabulary that outlives the target', () => {
  test('purging a task removes its assignments and keeps both definitions', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac533 task purge')
    const shared = await createFolderLabel(owner, folderId, {
      name: 'ac533 shared',
    })
    const mine = await createPersonalLabel(owner, { name: 'ac533 mine' })

    const task = await createTaskOk(
      owner,
      { title: 'ac533 doomed task', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    for (const labelId of [shared.id, mine.id]) {
      expectStatus(
        await putTaskLabel(owner, task.id, labelId),
        200,
        'the fixture assignments must attach (spec 7.0)',
      )
    }
    expectStatus(await deleteTask(owner, task.id), 204, 'the task is trashed')
    expectStatus(
      await purgeTask(owner, task.id),
      204,
      'and then purged (spec 7.13, item 38)',
    )

    expect(
      await taskFolderLabelIds(app.db, task.id),
      'the Folder assignment went with the row, by the FK on tasks.id',
    ).toEqual([])
    expect(
      await taskPersonalLabelIds(app.db, task.id, owner.id),
      'and the Personal one',
    ).toEqual([])
    expect(
      (await folderLabelRows(app.db, folderId)).map((label) => label.id),
      'the Folder Label definition survives its Task: it belongs to the Folder',
    ).toEqual([shared.id])
    expect(
      (await personalLabelRows(app.db, owner.id)).map((label) => label.id),
      'and the Personal Label definition survives: it is the person’s vocabulary, not the task’s (#227 area 7)',
    ).toContain(mine.id)
  })

  test('purging a folder takes its vocabulary and every assignment into it', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac533 folder purge')
    await addMemberOk(owner, folderId, member.id)

    const shared = await createFolderLabel(owner, folderId, {
      name: 'ac533 folder scope',
    })
    const ownersOwn = await createPersonalLabel(owner, {
      name: 'ac533 owner personal',
    })
    const membersOwn = await createPersonalLabel(member, {
      name: 'ac533 member personal',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac533 doomed work', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label attaches (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(member, task.id, membersOwn.id),
      200,
      'the member classifies the task privately (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(owner, folderId, ownersOwn.id),
      200,
      'and the owner classifies the folder privately (spec 7.0)',
    )

    expectStatus(
      await deleteFolder(owner, folderId),
      200,
      'the folder is trashed',
    )
    expectStatus(
      await purgeFolder(owner, folderId),
      204,
      'and then purged (spec 7.13, item 38)',
    )

    expect(
      await folderLabelRows(app.db, folderId),
      'the Folder’s own Labels went with it, by labels.folder_id (#227 area 7)',
    ).toEqual([])
    expect(
      await assignmentCount('task_folder_labels', shared.id),
      'and every assignment of them',
    ).toBe(0)
    expect(
      await assignmentCount('folder_personal_labels', ownersOwn.id),
      'the owner’s Personal assignment **to the folder** went by folder_personal_labels.folder_id',
    ).toBe(0)
    expect(
      await assignmentCount('task_personal_labels', membersOwn.id),
      'and the member’s Personal assignment to a task inside it went through the task',
    ).toBe(0)

    expect(
      (await personalLabelRows(app.db, owner.id)).map((label) => label.id),
      'both Personal **definitions** survive the purge of the target they were applied to',
    ).toContain(ownersOwn.id)
    expect(
      (await personalLabelRows(app.db, member.id)).map((label) => label.id),
      'including the member’s, who did not purge anything',
    ).toContain(membersOwn.id)
  })

  test('deleting an account removes its personal labels and every assignment it made', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    /* A third person, made for this case, because the account is destroyed.
       They keep a folder of their own and classify work in the owner's
       folder, so the assertion reaches both sides of the rule. */
    const leaver = await (async () => {
      const [made] = await new Cast(['leaver'], 'ac533x').of(app)
      return made as Actor
    })()
    cast.trackUser(leaver.id)
    await connect(app.db, owner.id, leaver.id)

    const shared = await createFolder(owner, 'ac533 shared with the leaver')
    await addMemberOk(owner, shared, leaver.id)
    const survivingTask = await createTaskOk(
      owner,
      { title: 'ac533 surviving work', folder_id: shared },
      'the task must stage (spec 7.6)',
    )

    const theirs = await createPersonalLabel(leaver, { name: 'ac533 leaving' })
    expectStatus(
      await putTaskLabel(leaver, survivingTask.id, theirs.id),
      200,
      'the leaver classifies shared work privately (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(leaver, shared, theirs.id),
      200,
      'and the shared folder too (spec 7.0)',
    )

    const gone = await leaver.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expectStatus(gone, 204, 'the account deletes (spec 8.10)')

    expect(
      await personalLabelRows(app.db, leaver.id),
      'the deleted account holds no Personal Label: 8.10 scrubs the users row rather than deleting it, so labels_owner_user_id_fkey never fires and the deletion transaction has to say so itself (#227 area 7)',
    ).toEqual([])
    expect(
      await allTaskPersonalRows(app.db, survivingTask.id),
      'and the assignment it left on work that survives it is gone, by 0022’s composite cascade off the definition',
    ).toEqual([])
    expect(
      await assignmentCount('folder_personal_labels', theirs.id),
      'as is the one on the folder',
    ).toBe(0)

    /* The work itself survives, which is 8.10 unchanged: what left is the
       person's private classification of it, not the shared rows. */
    expect(
      (await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${survivingTask.id}::uuid`,
      ))[0]?.n,
      'the shared task is still there',
    ).toBe(1)
  })
})
