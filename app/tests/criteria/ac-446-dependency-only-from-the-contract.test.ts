/*
AC-446: given an ordinary link or mention between two tasks, then no
dependency exists; and given a folder exported to a workflow file and imported
again, then the imported work carries no dependency, because the portable
contract carries no task identity to remap one onto.

**Two halves of one boundary: a dependency is made on purpose or not at all.**

The first half is the issue's rule that nothing infers a relation from a Dana
Link, an `@Task` mention or a pasted URL. A page that talks about a task is
prose; a person writing "after the walls are up" has said something about the
order of their work and has not asked the product to enforce it, and a product
that turned that into an enforced relation would be putting words in their
mouth. The page here carries a task's own URL, its id, its title and a folder
reference, which is every shape the inference would have had to come from.

The second half is where #185 meets this slice, and it is written as what is
true now rather than as a wish. The workflow file is DES-206's and 7.16's, and
it carries **no ids at all** — "a folder's page blocks and each task's title,
notes, star, repeat, reminder and step titles, never ids, people, due dates or
states". So there is no identity for a dependency to be expressed against, and
a round trip through it cannot preserve one. That is asserted in both
directions here: the file carries no task id, and the import creates no
relation.

**This criterion moves when #185's portable contract carries both tasks**, and
not before. At that point the round trip must preserve internal dependencies
and the second test here becomes the assertion of that, in the same change as
the contract that makes it possible. Until then a test claiming the round trip
preserves dependencies would be green only because the fixture has none, which
is the false green this file exists to refuse.

Spec: 7.16, 4.17, DES-206. Issues #224 and #185.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk, readTask } from '../support/tasks-harness.js'
import {
  createDependencyOk,
  storedEdges,
  tasksByTitle,
} from '../support/task-dependencies-harness.js'
/* The product's own serialiser, used here as the *producer* of the round
   trip rather than as a judge of it: "export then import" means the file the
   application writes, and writing a second one in this file would be a round
   trip through something nobody ships. What is judged is the rows afterwards,
   read from the database. */
import { folderToWorkflowFile } from '../../src/shared/workflows.js'
import type { TaskDetail } from '../../src/shared/tasks.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac446')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-446 a dependency is made on purpose or not at all', () => {
  test('a page that links to and mentions a task creates no dependency', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac446 the talkative page')
    const other = await createFolder(owner, 'ac446 the referenced folder')

    const writer = await createTaskOk(
      owner,
      { title: 'ac446 write the copy', folder_id: folderId },
      'a task must stage (spec 7.6)',
    )
    const designer = await createTaskOk(
      owner,
      { title: 'ac446 draw the layout', folder_id: folderId },
      'a second task must stage (spec 7.6)',
    )

    const written = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        {
          kind: 'paragraph',
          position: 0,
          // Every shape an inference could have come from: the task's own
          // URL, its bare id, and its title written as a mention.
          text: `Do this after @${designer.title} — https://dana.so/app/tasks/${designer.id} (${designer.id})`,
        },
        { kind: 'folder_ref', position: 1, ref_folder_id: other },
      ],
    })
    expectStatus(written, 200, 'the page is written (spec 7.16, 4.17)')

    expect(
      await storedEdges(app.db, [writer.id, designer.id]),
      'and no relation was inferred: prose about an order is prose, and the only thing that makes a dependency is somebody asking for one',
    ).toEqual([])

    // And the deliberate act still works on the same pair, so the assertion
    // above is about inference rather than about these two tasks.
    await createDependencyOk(
      owner,
      writer.id,
      designer.id,
      'asking for the relation makes it (issue #224)',
    )
    expect(
      (await storedEdges(app.db, [writer.id, designer.id])).length,
      'one relation, made by the request that asked for one',
    ).toBe(1)
  })

  test('a workflow round trip carries no dependency, the file carrying no task identity', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac446 the template')
    const second = await createTaskOk(
      owner,
      { title: 'ac446 second step', folder_id: folderId },
      'a task must stage (spec 7.6)',
    )
    const first = await createTaskOk(
      owner,
      { title: 'ac446 first step', folder_id: folderId },
      'a task must stage (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      second.id,
      first.id,
      'the second step waits on the first (issue #224)',
    )

    const file = folderToWorkflowFile('ac446 the template', [
      (await readTask(owner, second.id)) as unknown as TaskDetail,
      (await readTask(owner, first.id)) as unknown as TaskDetail,
    ])

    const serialized = JSON.stringify(file)
    expect(
      serialized,
      'the file names neither task, 7.16 carrying titles and never ids; this is the precondition #185 has to change before a dependency can travel in one',
    ).not.toContain(second.id)
    expect(serialized, 'nor the other one').not.toContain(first.id)

    const imported = await owner.browser.json('/workflows/import', 'POST', file)
    expectStatus(imported, 201, 'the file imports (spec 7.16)')
    const body = imported.json() as { folders?: { id?: unknown }[] }
    const importedFolderId = String(body.folders?.[0]?.id)

    const arrived = await tasksByTitle(app.db, importedFolderId)
    expect(
      [...arrived.keys()].sort(),
      'the work arrived, so the round trip is a real one',
    ).toEqual(['ac446 first step', 'ac446 second step'])

    expect(
      await storedEdges(app.db, [...arrived.values()]),
      'and it arrived unrelated: with no identity in the file, there is nothing for a dependency to be expressed against, so the round trip preserves none. When #185 gives the contract both tasks, this assertion becomes its opposite, in the same change',
    ).toEqual([])
  })
})
