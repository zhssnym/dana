/*
AC-549: a workflow file carries no Personal Label, and a file that smuggles
one creates none.

## Two halves, and the second is the one that matters

The write half is easy to state and easy to check: `folderToWorkflowFile` is
handed a Folder's vocabulary and a set of TaskDetails, each of which carries
the author's own Personal Labels in `labels.personal`, and none of it reaches
the file. The fixture therefore gives the author Personal Labels on the folder
and on every task, so a writer that wrote `task.labels` wholesale rather than
`task.labels.folder` is caught.

The write half alone is not enough, because **a file is a thing a person can
edit**. So the second half hands the endpoint a hand-written file carrying
`personal_labels`, a `scope: 'personal'` definition, and an `owner_user_id`,
and asserts that the import creates a folder holding none of it. The schema
strips what it does not declare (11.14), which means the refusal here is an
absence rather than an error — and an absence is exactly the thing that has to
be asserted rather than assumed, because nothing on the wire says it happened.

## Why the rule exists at all

A workflow file is handed to other people. #208 R4 makes a Personal Label
private to its owner with no sharing mechanism of any kind; a file that carried
one would be that mechanism, arriving by the back door and owned by whoever
imported it.

Spec: 7.16, 11.14. Issue #227 areas 4 and 5, #208 R4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  createFolderLabel,
  createPersonalLabel,
  listLabels,
  putFolderLabel,
  putTaskLabel,
} from '../support/labels-harness.js'
import {
  asFile,
  folderLabelRows,
  importWorkflowOk,
  personalLabelRows,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk, readTask } from '../support/tasks-harness.js'
import { folderToWorkflowFile } from '../../src/shared/workflows.js'
import type { TaskDetail } from '../../src/shared/tasks.js'

let app: AuthTestApp
const cast = new Cast(['author', 'importer'], 'ac529')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-549 no private classification reaches a file that is handed to other people', () => {
  test('the writer leaves every personal label out', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'ac529 template')

    const shared = await createFolderLabel(author, folderId, {
      name: 'ac529 shared',
    })
    const privateOne = await createPersonalLabel(author, {
      name: 'ac529 private',
      description: 'nobody else’s business',
    })

    const task = await createTaskOk(
      author,
      { title: 'ac529 the work', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(author, task.id, shared.id),
      200,
      'the folder label attaches (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(author, task.id, privateOne.id),
      200,
      'the personal label attaches to the task (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(author, folderId, privateOne.id),
      200,
      'and to the folder (spec 7.0)',
    )

    const detail = (await readTask(author, task.id)) as unknown as TaskDetail
    expect(
      detail.labels.personal.map((label) => label.id),
      'the fixture is honest: the detail the writer is handed really does carry the Personal Label',
    ).toEqual([privateOne.id])

    const vocabulary = await listLabels(author, {
      scope: 'folder',
      folder_id: folderId,
    })
    const file = folderToWorkflowFile(
      'ac529 template',
      [detail],
      [],
      undefined,
      vocabulary,
    ).file
    const bytes = JSON.stringify(file)

    expect(
      bytes.includes('ac529 private'),
      'the Personal Label’s name is not in the file (#227 area 4)',
    ).toBe(false)
    expect(
      bytes.includes('nobody else’s business'),
      'nor its description',
    ).toBe(false)
    expect(
      bytes.includes(privateOne.id),
      'nor its id',
    ).toBe(false)
    expect(
      bytes.includes(author.id),
      'nor the author’s account id, which is the only thing an assignment row could name them by',
    ).toBe(false)
    expect(
      file.folders[0]?.labels?.map((label) => label.name),
      'and the vocabulary is the Folder’s alone',
    ).toEqual(['ac529 shared'])
  })

  test('a hand-edited file carrying personal label data creates none of it', async () => {
    const [author, importer] = (await cast.of(app)) as [Actor, Actor]
    const before = await personalLabelRows(app.db, importer.id)

    /* Everything a hostile or merely confused file might try: a top-level
       personal catalog, a personal-scoped definition inside the folder's
       vocabulary, an owner named on it, and a task naming it. */
    const smuggled = {
      dana: 'workflow',
      version: 3,
      name: 'ac529 smuggler',
      personal_labels: [
        { id: 'not-a-uuid', name: 'ac529 smuggled top level', color: '#111111' },
      ],
      folders: [
        {
          name: 'ac529 smuggler',
          labels: [
            { key: 'a', name: 'ac529 legitimate', color: '#222222' },
            {
              key: 'b',
              name: 'ac529 smuggled inline',
              color: '#333333',
              scope: 'personal',
              owner_user_id: author.id,
            },
          ],
          tasks: [
            {
              title: 'ac529 smuggled work',
              labels: ['a', 'b'],
              personal_labels: ['ac529 smuggled on the task'],
            },
          ],
        },
      ],
    }

    const made = await importWorkflowOk(importer, asFile(smuggled as never))
    const folderId = String(made[0]?.id)

    expect(
      await personalLabelRows(app.db, importer.id),
      'the importer gains no Personal Label: the top-level catalog is a key the schema does not declare, so it is stripped rather than read (11.14)',
    ).toEqual(before)
    expect(
      await personalLabelRows(app.db, author.id),
      'and nothing was created in the author’s catalog either — a file cannot write into an account that did not import it',
    ).not.toContainEqual(
      expect.objectContaining({ name: 'ac529 smuggled top level' }),
    )

    const created = await folderLabelRows(app.db, folderId)
    expect(
      created.map((label) => label.name),
      'both declared definitions arrive as **Folder** Labels: `scope` is not a field of this format, so naming one changes nothing rather than choosing a scope (#227 area 4)',
    ).toEqual(['ac529 legitimate', 'ac529 smuggled inline'])

    const scopes = await rows(
      app.db,
      sql`SELECT DISTINCT scope, (owner_user_id IS NULL) AS unowned
            FROM labels WHERE folder_id = ${folderId}::uuid`,
    )
    expect(
      scopes,
      'and the rows say so: folder scope, no owner, whatever the file claimed',
    ).toEqual([{ scope: 'folder', unowned: true }])

    const tasks = await tasksByTitle(app.db, folderId)
    expect(
      [...tasks.keys()],
      'the work arrives, the smuggling having been ignored rather than fatal',
    ).toEqual(['ac529 smuggled work'])
  })
})
