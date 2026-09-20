/*
AC-781: a workflow file written from a Folder that has both a composed page and
a Label vocabulary carries both, and importing it restores both — the page with
its Section nesting, and the vocabulary with each Task's assignments remapped
onto it.

## The combination this exists for, and why nothing drove it

The **default** file a real folder produces — the folder page every folder has,
plus any vocabulary at all — carries a page and a vocabulary at once. AC-547
drives the vocabulary and passes `undefined` for `pageView`; AC-505 drove the
page before a vocabulary could travel with it. **Neither drives the pair**,
which left the single most likely file this product writes covered by two
criteria that each see half of it.

**It was a coverage note rather than a defect, and that was measured before
this file was written rather than assumed.** The page was never gated on the
version that carried Labels — the version gated `labels` and nothing else — so
a file with both reached the page validator exactly as a file with one did.
This file is here so that a later change to the version rule cannot quietly
stop being true.

## What moved, and what did not (#185)

**The decision this criterion pins has not moved**: a file carrying both
carries both, and the import restores both. What moved underneath it is the
format. Until #185 the writer emitted `version: exportedLabels.length > 0 ? 3 :
pageView === undefined ? 1 : 2` and wrote the page as a `document` of
`put_block` operations keyed by the exporting account's own uuids, beside a
flat `blocks` key that repeated the same writing in a lossier form. It now
emits one version, 4, and one ordered `page` whose every reference is a
position in its own array. So the three assertions that named `version` 3 and
the `document` key name 4 and `page`; every other assertion in this file is
untouched, including the one that catches a page applied twice.

That older shape is still **read** — `importFolder.document` is unchanged and
AC-548 covers it — so nothing about a file written before this date changed.

## Written through the same call the product makes

`FolderPage.tsx` calls `folderToWorkflowFile(name, details, page.blocks, page,
labels)`. This file makes that call with the same arguments read from the same
endpoints, so what is driven is the file a person actually downloads rather
than a fixture assembled to suit the assertion.

**The block count below is asserted rather than only the text**, because it is
what would catch a *quiet* double — a second reading of the same writing whose
extra rows the outline happened to cover. A loud one dies at the import call
instead: measured 2026-09-20 by making `importWorkflow` read `folder.blocks`
beside the typed page, the mutation answered
`422 The outline must retain every Task and undeleted block.`, `applyDocument`
running after the flat blocks were already rows and the outline naming only the
page's. The criterion discriminates either way, which is what it is for.

Spec: 7.16. Issue #227 area 4, #204, #219, #185.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
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
import type { PageView } from '../../src/shared/pages.js'
import type { TaskDetail } from '../../src/shared/tasks.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac781')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The folder page as 7.16 answers it, which is what the folder page hands
 * the writer. */
async function pageOf(actor: Actor, folderId: string): Promise<PageView> {
  const read = await actor.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(read, 200, 'GET /folders/:id/page must answer the page (7.16)')
  return read.json() as PageView
}

describe('AC-781 a canvas and a vocabulary travel in one file', () => {
  test('the default shape of a saved folder round trips whole', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac781 launch canvas')

    const urgent = await createFolderLabel(author, sourceId, {
      name: 'Urgent',
      color: '#AA1122',
      description: 'before the rest',
    })
    /* A category nothing wears, for AC-547's reason: it is the half a
       vocabulary read off the tasks would lose, and it has to survive the
       document half too. */
    await createFolderLabel(author, sourceId, { name: 'Someday' })

    const first = await createTaskOk(
      author,
      { title: 'ac781 book the room', folder_id: sourceId },
      'the first task must stage (spec 7.6)',
    )
    const second = await createTaskOk(
      author,
      { title: 'ac781 send the invite', folder_id: sourceId },
      'the second task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(author, first.id, urgent.id),
      200,
      'Urgent attaches to the first task (spec 7.0)',
    )

    /* A section with a paragraph under it, so the nesting #219 carries is in
       the file and has somewhere to be lost. */
    expectStatus(
      await author.browser.json(`/folders/${sourceId}/page`, 'PUT', {
        blocks: [
          { kind: 'section', position: 0, text: 'ac781 before the day' },
          { kind: 'paragraph', position: 1, text: 'ac781 read this first.' },
        ],
      }),
      200,
      'PUT /folders/:id/page must write the page (spec 7.16)',
    )
    const page = await pageOf(author, sourceId)
    const sectionId = page.blocks.find((block) => block.kind === 'section')?.id
    expect(
      page.blocks.find((block) => block.kind === 'paragraph')?.section_block_id,
      'the fixture must actually nest the paragraph under the section, or the nesting assertion below proves nothing',
    ).toBe(sectionId)

    const details = (await Promise.all(
      [first.id, second.id].map((id) => readTask(author, id)),
    )) as unknown as TaskDetail[]
    const vocabulary = await listLabels(author, {
      scope: 'folder',
      folder_id: sourceId,
      state: 'all',
    })

    /* The call `FolderPage.tsx` makes, argument for argument. */
    const saved = folderToWorkflowFile(
      'ac781 launch canvas',
      details,
      page.blocks,
      page,
      vocabulary,
    )
    const file = saved.file

    expect(
      file.version,
      'a folder with both says 4 (#185): the writer emits one version, and it is the one whose reader understands both the page and the vocabulary (#227 area 4)',
    ).toBe(4)
    expect(
      file.folders[0]?.page === undefined,
      'and the page is in the file beside the vocabulary — this is the file a real folder produces, and until this criterion nothing drove the two together',
    ).toBe(false)
    expect(
      (file.folders[0]?.labels ?? []).map((label) => label.name),
      'the whole active vocabulary is there, the unused category included',
    ).toEqual(['Someday', 'Urgent'])

    const imported = await importWorkflowOk(reader, asFile(file))
    expect(imported, 'the import makes one folder').toHaveLength(1)
    const madeId = String(imported[0]?.id)

    const madeLabels = await folderLabelRows(app.db, madeId)
    expect(
      namesOf(madeLabels),
      'the vocabulary arrives whole in a file that also carried a document, which is the combination the version rule makes the common one (#227 area 4)',
    ).toEqual(['Someday', 'Urgent'])

    const madeTasks = await tasksByTitle(app.db, madeId)
    expect(
      [...madeTasks.keys()].sort(),
      'and so does the work',
    ).toEqual(['ac781 book the room', 'ac781 send the invite'])
    const madeUrgent = madeLabels.find(
      (label) => label.name === 'Urgent',
    ) as { id: string }
    expect(
      await taskFolderLabelIds(
        app.db,
        taskNamed(madeTasks, 'ac781 book the room'),
      ),
      'with the assignment remapped onto the new identity, the document half having done nothing to the key join (#227 area 4)',
    ).toEqual([madeUrgent.id])
    expect(
      await taskFolderLabelIds(
        app.db,
        taskNamed(madeTasks, 'ac781 send the invite'),
      ),
      'and the task that wore nothing wears nothing',
    ).toEqual([])

    const madePage = await pageOf(reader, madeId)
    expect(
      madePage.blocks.map((block) => [block.kind, block.text]),
      'the page arrives once and in order, and the count is what would catch a quiet double — a second reading of the same writing, applied beside the first (spec 7.16)',
    ).toEqual([
      ['section', 'ac781 before the day'],
      ['paragraph', 'ac781 read this first.'],
    ])
    const madeSection = madePage.blocks.find(
      (block) => block.kind === 'section',
    )
    expect(
      madePage.blocks.find((block) => block.kind === 'paragraph')
        ?.section_block_id,
      'and the paragraph is still under the section, remapped onto the block id this import minted rather than pointing at the author’s (#219)',
    ).toBe(madeSection?.id)
    expect(
      madeSection?.id === sectionId,
      'which is a new id: a template carries no row of the account that wrote it',
    ).toBe(false)
    expect(
      madePage.items.filter((item) => item.kind === 'task').length,
      'both tasks are placed on the imported page, the outline’s task references having resolved through the file’s own task_ids',
    ).toBe(2)
  })
})
