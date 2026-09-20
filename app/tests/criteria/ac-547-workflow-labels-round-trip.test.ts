/*
AC-547: a workflow file written from a Folder carries that Folder's active
Label vocabulary and each Task's assignments by a file-local key, and importing
it creates new Label identities inside the new Folder with the assignments
remapped onto them.

## The round trip is the assertion, and it is written through both halves

`folderToWorkflowFile` writes the file and `POST /workflows/import` reads it.
They live in two directories and are one format, which is the standing risk
`shared/workflows.ts` was created to manage. So this file exports a real
Folder's real rows through the writer, hands the result to the endpoint, and
asserts the result against the source — rather than asserting each half against
a fixture that only this test believes in.

## Three things the file must not carry, asserted on the file itself

Ids, because a template imported into another account would otherwise name
rows that account cannot read. Personal Labels, because the file is handed to
other people. Archived definitions, because an archived Label may not be newly
applied and every Label in an imported Folder is applied immediately.

AC-549 asserts the Personal half in full. This file asserts that the keys are
keys and that the ids are nowhere in the bytes.

## And the vocabulary is the Folder's, not the Tasks'

#227 asks for the Folder's *reusable* vocabulary, "including definitions not
currently assigned to a Task". The fixture therefore holds a Label nothing
wears, and the round trip has to produce it on the other side — which an
implementation that gathered the vocabulary off the task projections would
lose, silently, and only in the case a template is most for.

Spec: 7.16. Issue #227 area 4, #208 R4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  createFolderLabel,
  listLabels,
  namesOf,
  putTaskLabel,
} from '../support/labels-harness.js'
import {
  asFile,
  folderLabelRows,
  importWorkflowOk,
  taskFolderLabelIds,
  taskNamed,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk, readTask } from '../support/tasks-harness.js'
import { folderToWorkflowFile } from '../../src/shared/workflows.js'
import type { TaskDetail } from '../../src/shared/tasks.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac527')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-547 the workflow file carries a portable taxonomy', () => {
  test('write, read back into another account, and the classification survives with new ids', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac527 launch template')

    const urgent = await createFolderLabel(author, sourceId, {
      name: 'Urgent',
      color: '#AA1122',
      description: 'before the rest',
    })
    const later = await createFolderLabel(author, sourceId, { name: 'Later' })
    /* A category nothing wears, which is the half a vocabulary read off the
       tasks would lose. */
    await createFolderLabel(author, sourceId, { name: 'Someday' })
    const retired = await createFolderLabel(author, sourceId, {
      name: 'Retired',
    })

    const first = await createTaskOk(
      author,
      { title: 'ac527 book the room', folder_id: sourceId },
      'the first task must stage (spec 7.6)',
    )
    const second = await createTaskOk(
      author,
      { title: 'ac527 send the invite', folder_id: sourceId },
      'the second task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(author, first.id, urgent.id),
      200,
      'Urgent attaches to the first task (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(author, second.id, later.id),
      200,
      'Later attaches to the second task (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(author, second.id, retired.id),
      200,
      'Retired attaches while it is still active (spec 7.0)',
    )
    expectStatus(
      await archiveFolderLabel(author, sourceId, retired.id),
      200,
      'and is then archived (spec 7.0)',
    )

    /* The write half, through the same function the folder page calls, over
       the same rows the API answers. */
    const details = (await Promise.all(
      [first.id, second.id].map((id) => readTask(author, id)),
    )) as unknown as TaskDetail[]
    /*
    `state: 'all'`, deliberately, so the archived definition **is** handed to
    the writer and the writer's own exclusion is what the next assertion
    measures. Asking the endpoint for active only would leave the file right
    for a reason that has nothing to do with `folderToWorkflowFile`, and a
    caller that passed a wider read — a future "Save with archived
    categories" control, or a test fixture — would find the rule was never
    there. Caught by mutation: filtering `() => true` in the writer left this
    criterion green until this line changed.
    */
    const vocabulary = await listLabels(author, {
      scope: 'folder',
      folder_id: sourceId,
      state: 'all',
    })
    const file = folderToWorkflowFile(
      'ac527 launch template',
      details,
      [],
      undefined,
      vocabulary,
    ).file

    expect(
      file.version,
      'a file carrying a Label vocabulary says a version whose reader knows what a Label is, so a reader that does not refuses rather than importing a folder with its classification quietly missing (#227 area 4; 4 rather than 3 since #185, the writer now emitting one version)',
    ).toBe(4)
    const written = file.folders[0]?.labels ?? []
    expect(
      written.map((label) => label.name),
      'the whole active vocabulary travels, the unused category included, and the archived one does not (#227 areas 4 and 9)',
    ).toEqual(['Later', 'Someday', 'Urgent'])
    expect(
      written.find((label) => label.name === 'Urgent'),
      'with its colour and description, so the copy is usable rather than merely named',
    ).toEqual({
      key: written.find((label) => label.name === 'Urgent')?.key,
      name: 'Urgent',
      color: '#AA1122',
      description: 'before the rest',
    })

    const bytes = JSON.stringify(file)
    for (const [name, id] of [
      ['Urgent', urgent.id],
      ['Later', later.id],
      ['Someday', ''],
      ['Retired', retired.id],
    ] as const) {
      if (id === '') continue
      expect(
        bytes.includes(id),
        `no database id is in the file: ${name} is named by a file-local key (#227 area 4)`,
      ).toBe(false)
    }
    expect(
      bytes.includes(sourceId),
      'nor the source folder’s id',
    ).toBe(false)
    expect(
      bytes.includes(first.id) || bytes.includes(second.id),
      'nor any task’s',
    ).toBe(false)

    /* Format 4 writes each Task as a block of the page at its own position
       (#185), so the file's work is read off `page.blocks` rather than off a
       `tasks` collection. What is asserted below is unchanged. */
    const secondWritten = (file.folders[0]?.page?.blocks ?? []).find(
      (block): block is Extract<typeof block, { kind: 'task' }> =>
        block.kind === 'task' && block.title === 'ac527 send the invite',
    )
    expect(
      secondWritten?.labels,
      'the second task carries Later by key and not the archived Retired: an assignment whose definition is not in the file has no key to be written under (#227 area 9)',
    ).toEqual([written.find((label) => label.name === 'Later')?.key])

    /* The read half, into a **different account**, which is what a template
       is for and is the case in which a carried id would be a row the reader
       cannot resolve. */
    const made = await importWorkflowOk(reader, asFile(file))
    expect(made, 'the import makes one folder').toHaveLength(1)
    const importedId = String(made[0]?.id)

    const importedLabels = await folderLabelRows(app.db, importedId)
    expect(
      namesOf(importedLabels),
      'the imported folder holds the file’s vocabulary',
    ).toEqual(['Later', 'Someday', 'Urgent'])
    expect(
      importedLabels.every((label) => !label.archived),
      'and every one of them is active: an imported Label is applied to work made in the same transaction, so archived would be a state it could not be in (#227 area 4)',
    ).toBe(true)
    for (const label of importedLabels) {
      expect(
        [urgent.id, later.id, retired.id].includes(label.id),
        `${label.name} is a new identity inside the importing account (#227 area 4)`,
      ).toBe(false)
    }

    const importedTasks = await tasksByTitle(app.db, importedId)
    const importedUrgent = importedLabels.find(
      (label) => label.name === 'Urgent',
    ) as { id: string }
    const importedLater = importedLabels.find(
      (label) => label.name === 'Later',
    ) as { id: string }
    expect(
      await taskFolderLabelIds(
        app.db,
        taskNamed(importedTasks, 'ac527 book the room'),
      ),
      'the first imported task wears the imported Urgent (#227 area 4)',
    ).toEqual([importedUrgent.id])
    expect(
      await taskFolderLabelIds(
        app.db,
        taskNamed(importedTasks, 'ac527 send the invite'),
      ),
      'and the second wears the imported Later and nothing else, the archived one having never travelled',
    ).toEqual([importedLater.id])

    /* The source is untouched by somebody else importing a file made from
       it, which is the property a template has to have. */
    expect(
      (await folderLabelRows(app.db, sourceId)).length,
      'the author’s own folder still holds all four of its definitions',
    ).toBe(4)
  })

  /*
  **This case moved with the format and it still pins the same decision.** It
  read "a folder with no labels writes the file it wrote before #227" and
  asserted version 1, on the rule that the version says what a reader must
  understand and a folder with no vocabulary needs no reader that knows one.
  #185 moved that decision one step: the writer now emits one version, 4,
  because every file it writes carries the ordered page and a second output
  format would be a second thing to keep in step. What is asserted here is what
  was always the point of the case — **no vocabulary means no `labels` key
  anywhere in the file**, on the folder or on the work.
  */
  test('a folder with no labels writes no vocabulary at all', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const plainId = await createFolder(author, 'ac527 plain')
    const task = await createTaskOk(
      author,
      { title: 'ac527 unlabelled', folder_id: plainId },
      'the task must stage (spec 7.6)',
    )
    const detail = (await readTask(author, task.id)) as unknown as TaskDetail

    const file = folderToWorkflowFile('ac527 plain', [detail], [], undefined, []).file
    expect(
      file.version,
      'the writer emits one version and it is 4 (#185); what the number means is unchanged — it says what a reader must understand (#227 area 4)',
    ).toBe(4)
    expect(file.folders[0]?.labels, 'and there is no labels key at all').toBeUndefined()
    const written = file.folders[0]?.page?.blocks?.[0]
    expect(
      written?.kind === 'task' ? written.labels : 'the work is not on the page',
      'nor on the task',
    ).toBeUndefined()
  })
})
