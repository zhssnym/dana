/*
AC-823: given a folder page holding a picture, when it is saved as a workflow
file, then the file carries an explicit placeholder where the picture was, the
writer answers how many it wrote, and importing the file creates the writing
around it and no picture at all.

## The placeholder is the criterion, not the absence

A workflow file carries no bytes. 7.16 admits no upload path inside an import,
and a picture on a page is a `files` row of the exporting account — a row the
importing account may not read (10.2) rather than a picture. That was true
before #185 and stays true. What was wrong is what the file *said* about it:
nothing. The page had an image, the file had a gap, and the person who saved it
was told neither.

So the rule this pins is #185's own: **the file records what it dropped**. A
placeholder is in the bytes, with the kind it stood for and whatever the
exporter knew to call it, and it creates nothing on the way back in. An
implementation that simply skipped the block would pass an assertion about the
imported page and fail this one at the file.

## And the export surface says so

`folderToWorkflowFile` answers a count beside the file, and `FolderPage.tsx`
puts it in the toast. The count is asserted here at its source, which is the
only place a criterion can reach it: the toast is a browser fact and `npm test`
proves nothing about a screen.

## Three absences worth naming

The file carries no `file_id`, no `files` row id and no `folder_id` of the
source. Each is asserted against the bytes, because a placeholder that quietly
kept the id would look identical in every other assertion here and would be the
exact defect #185 says not to reintroduce: "use a portable representation
rather than exporting a source account's `file_id`".

Spec: 7.16, 7.15, 4.16, 4.17, 10.2. Issue #185.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, countRows, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { uploadImageOk } from '../support/uploads-harness.js'
import {
  asFile,
  at,
  compose,
  importWorkflowOk,
  pageRows,
  put,
  savedWorkflow,
  shapeOf,
  task,
} from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac823')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-823 the file says what did not come with it', () => {
  test('a picture becomes a placeholder, the writer counts it, and the import makes none', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac823 the room')
    const fileId = await uploadImageOk(author, sourceId, 'ac823-room.png')

    const heading = randomUUID()
    const picture = randomUUID()
    const caption = randomUUID()
    const work = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(heading, 'section', 'ac823 the room'),
        put(picture, 'image', 'ac823 the big table', { file_id: fileId, width_pct: 50 }),
        put(caption, 'paragraph', 'ac823 it seats twelve'),
        { op: 'create_task', id: work, title: 'ac823 book the room' },
        {
          op: 'set_outline',
          items: [at(heading), at(picture, heading), at(caption, heading), task(work, heading)],
        },
      ],
      'the fixture page must compose with a real picture on it (7.16)',
    )

    const saved = await savedWorkflow(author, sourceId, 'ac823 the room')
    const blocks = saved.file.folders[0]?.page?.blocks ?? []

    expect(
      blocks[1],
      'the picture is an explicit placeholder at the position it held, naming the kind it stood for and the caption it carried (#185)',
    ).toEqual({ kind: 'omitted', was: 'image', name: 'ac823 the big table' })
    expect(
      saved.omitted,
      'and the writer answers how many it wrote, which is what the export surface says before anybody saves (#185 acceptance)',
    ).toBe(1)

    const bytes = JSON.stringify(saved.file)
    expect(
      bytes.includes(fileId),
      'the stored file’s id is not in the bytes: it is a row of the exporting account and not a picture (10.2, #185)',
    ).toBe(false)
    expect(bytes.includes('file_id'), 'nor the key it would sit under').toBe(false)
    expect(
      bytes.includes(sourceId),
      'nor the source folder’s id, which a `files` row is scoped by',
    ).toBe(false)

    const madeId = await importWorkflowOk(reader, asFile(saved))
    const made = await pageRows(app.db, madeId)
    expect(
      made.some((row) => row.kind === 'image'),
      'the placeholder creates nothing: there is no image block on the imported page (#185)',
    ).toBe(false)
    expect(
      shapeOf(made),
      'and the writing around it keeps its order and its heading, the gap closing rather than leaving a hole (spec 4.17)',
    ).toEqual([
      { kind: 'section', text: 'ac823 the room', under: null, nested_under: null },
      { kind: 'paragraph', text: 'ac823 it seats twelve', under: 'ac823 the room', nested_under: null },
      { kind: 'task', text: 'ac823 book the room', under: 'ac823 the room', nested_under: null },
    ])

    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM files WHERE folder_id = ${madeId}::uuid`,
      ),
      'and no `files` row was made either: an import that copied bytes would be 7.15’s upload path inside 7.16, which is a widening nobody ruled (10.2)',
    ).toBe(0)
  })

  /*
  A link to another folder, which is the placeholder's other half — and the
  case where the old file did not merely lose something, it could not be
  imported at all.

  **A `folder_ref` block names a `folders` row of the exporting account.** It is
  the same argument as a picture's `file_id` one relation over: the thing named
  is a row, not content, and an importing account has no business resolving it.
  What made it worse than a picture is what the old format did with it. AC-662
  records the reading: a version 2 file carried the reference verbatim, and
  `applyDocument` requires the referenced folder to be one the **importer** is a
  member of, so the whole import was refused with `not_found` — a folder with a
  folder link on its page produced a file nobody else could import.

  Under format 4 it is a placeholder, which imports as nothing and takes nothing
  else with it. Both halves are asserted: the file says what it dropped, and the
  file imports.
  */
  test('a folder link is a placeholder too, and the file still imports elsewhere', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac823 the plan')
    const elsewhere = await createFolder(author, 'ac823 the other folder')

    const heading = randomUUID()
    const link = randomUUID()
    const note = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(heading, 'section', 'ac823 see also'),
        put(link, 'folder_ref', null, { ref_folder_id: elsewhere }),
        put(note, 'paragraph', 'ac823 the details are there'),
        {
          op: 'set_outline',
          items: [at(heading), at(link, heading), at(note, heading)],
        },
      ],
      'the fixture page must compose with a folder link on it (7.16)',
    )

    const saved = await savedWorkflow(author, sourceId, 'ac823 the plan')
    expect(
      saved.file.folders[0]?.page?.blocks[1],
      'the link is a placeholder naming the kind it stood for, and carries no folder id',
    ).toEqual({ kind: 'omitted', was: 'folder_ref' })
    expect(saved.omitted, 'and it is in the count the export surface says').toBe(1)
    expect(
      JSON.stringify(saved.file).includes(elsewhere),
      'the referenced folder’s id is nowhere in the bytes (10.2)',
    ).toBe(false)

    const madeId = await importWorkflowOk(
      reader,
      asFile(saved),
      'the file imports into an account that is no member of the folder it linked to — which a version 2 file could not, the reference being carried verbatim and refused whole (AC-662, #185)',
    )
    expect(
      shapeOf(await pageRows(app.db, madeId)),
      'and what is left is the writing around it, in order',
    ).toEqual([
      { kind: 'section', text: 'ac823 see also', under: null, nested_under: null },
      { kind: 'paragraph', text: 'ac823 the details are there', under: 'ac823 see also', nested_under: null },
    ])
  })
})
