/*
AC-552: soft-deleting a Task or a Folder leaves every Label definition and
assignment standing, and restoring brings them all back with no repair step.

## The mechanism is an absence, which is why it needs asserting

Nothing in the trash path touches a Label row. That is the correct
implementation and it is also indistinguishable, from the outside, from an
implementation that has not been written yet — so the way to hold it is a
criterion that deletes, checks the rows survived, restores, and checks the
reads come back. If somebody later adds a well-meaning cleanup pass over
trashed work, this is what goes red.

## The reads go dark and the rows do not, and those are two different facts

While a Task is in the Trash it is out of every section 6 query, so its
projection is not readable at all; while a Folder is in the Trash the Label
projections' own `folders.deleted_at IS NULL` join takes its Tasks' Labels out
of every answer. Both are correct and neither is deletion. So each arm here
asserts the **rows** during the soft delete and the **reads** after the
restore, which is the only pairing that distinguishes "hidden" from "gone".

## Archived labels come too

#227 area 9: archived Labels stay on soft-deleted and restored Work. An
implementation that swept "labels that cannot be newly applied" off trashed
rows would pass a criterion that only used live Labels.

Spec: 7.13, 4.3, 4.5. Issue #227 areas 7 and 9.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  createFolderLabel,
  createPersonalLabel,
  folderLabelsOf,
  putFolderLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  deleteFolder,
  deleteTask,
  folderLabelRows,
  folderPersonalLabelIds,
  restoreTask,
  taskFolderLabelIds,
  taskPersonalLabelIds,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac532')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-552 the Trash holds classification as well as work', () => {
  test('a trashed task keeps its rows and a restored one reads them back', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac532 folder')

    const live = await createFolderLabel(owner, folderId, { name: 'ac532 live' })
    const retired = await createFolderLabel(owner, folderId, {
      name: 'ac532 retired',
    })
    const mine = await createPersonalLabel(owner, { name: 'ac532 mine' })

    const task = await createTaskOk(
      owner,
      { title: 'ac532 the work', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    for (const labelId of [live.id, retired.id, mine.id]) {
      expectStatus(
        await putTaskLabel(owner, task.id, labelId),
        200,
        'every fixture assignment must attach (spec 7.0)',
      )
    }
    expectStatus(
      await archiveFolderLabel(owner, folderId, retired.id),
      200,
      'the folder label archives (spec 7.0)',
    )

    expectStatus(
      await deleteTask(owner, task.id),
      204,
      'the task goes to the Trash (spec 7.6, 7.13)',
    )

    expect(
      (await taskFolderLabelIds(app.db, task.id)).sort(),
      'both Folder assignments are still rows while the task sits in the Trash, archived one included (#227 areas 7 and 9)',
    ).toEqual([live.id, retired.id].sort())
    expect(
      await taskPersonalLabelIds(app.db, task.id, owner.id),
      'and so is the Personal one',
    ).toEqual([mine.id])

    expectStatus(
      await restoreTask(owner, task.id),
      200,
      'the task restores (spec 7.13)',
    )

    const projected = await taskLabelsOf(owner, task.id)
    expect(
      projected.folder.map((label) => label.id).sort(),
      'and the restored task reads both Folder Labels back with no repair step: the rows were never gone, so the restore has nothing to rebuild',
    ).toEqual([live.id, retired.id].sort())
    expect(
      projected.folder.find((label) => label.id === retired.id)?.archived,
      'the archived one arriving archived',
    ).toBe(true)
    expect(
      projected.personal.map((label) => label.id),
      'and the Personal one too',
    ).toEqual([mine.id])
  })

  test('a trashed folder keeps its vocabulary and its personal assignments', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac532 doomed folder')

    const shared = await createFolderLabel(owner, folderId, {
      name: 'ac532 folder scope',
    })
    const mine = await createPersonalLabel(owner, { name: 'ac532 on a folder' })
    const task = await createTaskOk(
      owner,
      { title: 'ac532 inside', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label attaches to the task (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(owner, folderId, mine.id),
      200,
      'and the personal label to the folder (spec 7.0)',
    )

    expectStatus(
      await deleteFolder(owner, folderId),
      200,
      'the folder goes to the Trash (spec 7.4, 7.13)',
    )

    expect(
      (await folderLabelRows(app.db, folderId)).map((label) => label.name),
      'a soft-deleted Folder keeps its Folder Labels: 0022’s cascade hangs off a DELETE, and a soft delete is an UPDATE (#227 area 7, #226)',
    ).toEqual(['ac532 folder scope'])
    expect(
      await taskFolderLabelIds(app.db, task.id),
      'and its tasks keep their assignments',
    ).toEqual([shared.id])
    expect(
      await folderPersonalLabelIds(app.db, folderId, owner.id),
      'and the viewer’s Personal assignment to the Folder itself',
    ).toEqual([mine.id])

    const restored = await owner.browser.json(
      `/folders/${folderId}/restore`,
      'POST',
      {},
    )
    expectStatus(restored, 200, 'the folder restores (spec 7.13)')

    expect(
      (await folderLabelsOf(owner, folderId)).map((label) => label.id),
      'and the restored folder reads its Personal Label back',
    ).toEqual([mine.id])
    expect(
      (await taskLabelsOf(owner, task.id)).folder.map((label) => label.id),
      'and its task reads the Folder Label back',
    ).toEqual([shared.id])
  })
})
