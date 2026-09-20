/*
AC-542: a duplicated Folder is a new Folder-Label scope. Its vocabulary is
re-created under **new ids**, and the copied Tasks' assignments point at those
new ids rather than at the source's.

## What could go wrong, and which half of it the database already refuses

Pointing the copy's `task_folder_labels` at the source's `label_id` is a row
migration 0022 will not store: `task_folder_labels_label_scope_fkey` is
composite against `(folder_id, id)`, and the copy's folder_id does not pair
with the source's label. So the *sharing* failure is loud.

The failure that is **not** loud is losing the classification altogether: a
duplicate that copies the definitions and forgets the assignments, or copies
neither, answers 201 and looks like a working duplicate until somebody opens
the copy. That is what this file is mostly about, and it is why every
assertion here names a task and the ids on it rather than counting rows.

## The two-label, two-task shape

One Label on one Task would pass under a remap that pairs everything with
everything. Two of each, crossed, is the smallest fixture where a wrong pairing
is visible: "Urgent" is on the first task only and "Later" on the second only,
so a copy that put both on both, or swapped them, fails.

Spec: 7.16 (`POST /folders/:id/duplicate`), 4.15's composite-scope shape.
Issue #227 area 2, #208 R4 and R6A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFolderLabel,
  namesOf,
  putTaskLabel,
} from '../support/labels-harness.js'
import {
  duplicateFolderOk,
  folderLabelRows,
  taskFolderLabelIds,
  taskNamed,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac522')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-542 a folder copy gets its own vocabulary', () => {
  test('new ids, the same names and colours, and the assignments remapped', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const sourceId = await createFolder(owner, 'ac522 template')

    const urgent = await createFolderLabel(owner, sourceId, {
      name: 'Urgent',
      color: '#AA1122',
      description: 'do this first',
    })
    const later = await createFolderLabel(owner, sourceId, {
      name: 'Later',
      color: '#2211AA',
    })

    const first = await createTaskOk(
      owner,
      { title: 'ac522 first', folder_id: sourceId },
      'the first task must stage (spec 7.6)',
    )
    const second = await createTaskOk(
      owner,
      { title: 'ac522 second', folder_id: sourceId },
      'the second task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, first.id, urgent.id),
      200,
      'Urgent attaches to the first task (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(owner, second.id, later.id),
      200,
      'Later attaches to the second task (spec 7.0)',
    )

    const copyId = await duplicateFolderOk(owner, sourceId)

    const copied = await folderLabelRows(app.db, copyId)
    expect(
      namesOf(copied),
      'the whole vocabulary comes across, in #208’s order',
    ).toEqual(['Later', 'Urgent'])
    expect(
      copied.map((label) => ({
        color: label.color,
        description: label.description,
      })),
      'with their colours and descriptions, which is what makes the copy usable',
    ).toEqual([
      { color: '#2211AA', description: null },
      { color: '#AA1122', description: 'do this first' },
    ])

    const sourceIds = new Set([urgent.id, later.id])
    for (const label of copied) {
      expect(
        sourceIds.has(label.id),
        `the copy’s ${label.name} is a new identity, never the source’s (#227 area 2)`,
      ).toBe(false)
    }
    /* And the source is untouched: a "duplicate" that moved the vocabulary
       rather than copying it would leave the template empty. */
    expect(
      (await folderLabelRows(app.db, sourceId)).map((label) => label.id).sort(),
      'the source keeps its own vocabulary',
    ).toEqual([urgent.id, later.id].sort())

    const copyUrgent = copied.find((label) => label.name === 'Urgent') as {
      id: string
    }
    const copyLater = copied.find((label) => label.name === 'Later') as {
      id: string
    }
    const copies = await tasksByTitle(app.db, copyId)
    expect(
      await taskFolderLabelIds(app.db, taskNamed(copies, 'ac522 first')),
      'the first task’s copy wears the copy’s Urgent and nothing else: the remap is by row, not by name and not by everything-on-everything (#227 area 2)',
    ).toEqual([copyUrgent.id])
    expect(
      await taskFolderLabelIds(app.db, taskNamed(copies, 'ac522 second')),
      'and the second task’s copy wears the copy’s Later',
    ).toEqual([copyLater.id])
  })
})
