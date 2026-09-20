/*
AC-543: a Folder duplicate copies the Folder's archived vocabulary **as
archived**, and does not newly attach the duplicator's archived Personal
Labels.

## The one paragraph this criterion exists to keep from collapsing

#227 area 9 says both of these in the same breath, and they pull opposite ways:

> Folder duplicate copies archived Folder **definitions/state** as part of
> duplicating the Folder's taxonomy, but must **not** newly attach archived
> Personal Labels.

The word "archived" is doing two jobs. On the Folder's own taxonomy it is
**state being copied** — a retired category is part of what that Folder is, and
a copy that silently revived it would hand somebody a vocabulary they had
deliberately narrowed. On the duplicator's private classification it is
**permission being withheld** — #208 R5 says an archived Label may not be newly
applied, and every assignment a duplicate writes is a new one.

AC-541 asserts the second reading for a Task duplicate. This file asserts both
readings in one place, because the likeliest defect is an implementation that
picks one of them and applies it to everything.

Spec: 7.16, 7.0. Issue #227 areas 2 and 9, #208 R5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  archivePersonalLabel,
  createFolderLabel,
  createPersonalLabel,
  putFolderLabel,
  putTaskLabel,
} from '../support/labels-harness.js'
import {
  duplicateFolderOk,
  folderLabelRows,
  folderPersonalLabelIds,
  taskFolderLabelIds,
  taskNamed,
  taskPersonalLabelIds,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac523')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-543 archived means two different things and the copy honours both', () => {
  test('the folder vocabulary copies archived; archived personal labels are not attached', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const sourceId = await createFolder(owner, 'ac523 template')

    const live = await createFolderLabel(owner, sourceId, { name: 'Live' })
    const retired = await createFolderLabel(owner, sourceId, {
      name: 'Retired',
    })
    const liveMine = await createPersonalLabel(owner, { name: 'ac523 live' })
    const retiredMine = await createPersonalLabel(owner, {
      name: 'ac523 retired',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac523 work', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    for (const labelId of [live.id, retired.id, liveMine.id, retiredMine.id]) {
      expectStatus(
        await putTaskLabel(owner, task.id, labelId),
        200,
        'every fixture assignment must attach while its label is active (spec 7.0)',
      )
    }
    for (const labelId of [liveMine.id, retiredMine.id]) {
      expectStatus(
        await putFolderLabel(owner, sourceId, labelId),
        200,
        'the personal labels must attach to the folder too (spec 7.0)',
      )
    }
    expectStatus(
      await archiveFolderLabel(owner, sourceId, retired.id),
      200,
      'the folder label must archive (spec 7.0)',
    )
    expectStatus(
      await archivePersonalLabel(owner, retiredMine.id),
      200,
      'the personal label must archive (spec 7.0)',
    )

    const copyId = await duplicateFolderOk(owner, sourceId)

    /* Reading one: the taxonomy, state and all. */
    const copied = await folderLabelRows(app.db, copyId)
    expect(
      copied.map((label) => [label.name, label.archived]),
      'both definitions come across and the retired one arrives retired: a copy that revived it would widen a vocabulary its owner had narrowed (#227 area 9)',
    ).toEqual([
      ['Live', false],
      ['Retired', true],
    ])

    /* And the archived Folder Label's own assignment comes with it, because
       what is being copied is the Folder's classification of its own work
       rather than a fresh application of a retired Label. */
    const copyLive = copied.find((label) => label.name === 'Live') as {
      id: string
    }
    const copyRetired = copied.find((label) => label.name === 'Retired') as {
      id: string
    }
    const copies = await tasksByTitle(app.db, copyId)
    const copyTaskId = taskNamed(copies, 'ac523 work')
    expect(
      (await taskFolderLabelIds(app.db, copyTaskId)).sort(),
      'the copied task wears both, under the copy’s own ids (#227 area 2)',
    ).toEqual([copyLive.id, copyRetired.id].sort())

    /* Reading two: the duplicator's private classification is newly applied,
       and an archived Label may not be. */
    expect(
      await taskPersonalLabelIds(app.db, copyTaskId, owner.id),
      'only the live Personal Label is attached to the copied task (#227 areas 2 and 9)',
    ).toEqual([liveMine.id])
    expect(
      await folderPersonalLabelIds(app.db, copyId, owner.id),
      'and only the live one is attached to the copied Folder',
    ).toEqual([liveMine.id])

    /* The archived Personal Label itself is untouched — not attached here,
       not deleted, not restored. */
    expect(
      await folderPersonalLabelIds(app.db, sourceId, owner.id),
      'the source folder keeps both, archive being non-destructive (#208 R5)',
    ).toHaveLength(2)
  })
})
