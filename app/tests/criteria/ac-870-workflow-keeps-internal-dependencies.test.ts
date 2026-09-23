/*
AC-870: a workflow keeps the dependencies between the Tasks it carries (#207),
and only those.

Given a folder whose work waits on itself (B on A, C on B) and on one Task
outside it, "Save as workflow" writes the two internal edges as file-local keys
and the external one not at all; importing that file into another account
creates both edges between the Tasks it minted and no third. The rows are what
is judged: `task_dependencies` is read directly, because the loss this guards
is exactly an import that answers 201 with the ordering silently gone.

AC-871: a hand-written file is read by the same rule. An edge naming a key
the file does not declare is skipped (external dependencies are excluded, not
refused), an edge between two folders of one file travels, and a file whose
edges form a cycle is refused 422 naming the field before anything is written.

Spec: 7.16. Issue #207.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { rows } from '../support/helpers.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import {
  asFile,
  importWorkflow,
  importWorkflowOk,
  savedWorkflow,
} from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac870')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** Every edge whose dependent is in one of these folders, as title pairs. */
async function edgesIn(folderIds: string[]): Promise<string[]> {
  const found = await rows(
    app.db,
    sql`SELECT dependent.title AS dependent, blocker.title AS blocker
          FROM task_dependencies d
          JOIN tasks dependent ON dependent.id = d.dependent_task_id
          JOIN tasks blocker ON blocker.id = d.blocking_task_id
         WHERE dependent.folder_id IN (${sql.join(
           folderIds.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})`,
  )
  return found.map((row) => `${String(row.dependent)} <- ${String(row.blocker)}`).sort()
}

async function waitOn(actor: Actor, dependent: string, blocker: string): Promise<void> {
  expectStatus(
    await actor.browser.json(`/tasks/${dependent}/dependencies`, 'POST', {
      blocking_task_id: blocker,
    }),
    201,
    'the fixture dependency must stage (#224)',
  )
}

describe('AC-870 a workflow round trip keeps its internal dependencies', () => {
  test('internal edges are written and recreated; the external one is not', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac870 launch')
    const elsewhereId = await createFolder(author, 'ac870 elsewhere')
    const make = (title: string, folderId: string) =>
      createTaskOk(author, { title, folder_id: folderId }, 'the fixture task must stage (7.6)')
    const a = await make('ac870 A', sourceId)
    const b = await make('ac870 B', sourceId)
    const c = await make('ac870 C', sourceId)
    const outside = await make('ac870 outside', elsewhereId)
    await waitOn(author, b.id, a.id)
    await waitOn(author, c.id, b.id)
    await waitOn(author, a.id, outside.id)

    const saved = await savedWorkflow(author, sourceId, 'ac870 launch')
    const written = JSON.stringify(saved.file)
    expect(written, 'the file carries no live id (7.16)').not.toContain(a.id)
    expect(written, 'nor the external blocker').not.toContain(outside.id)

    const madeId = await importWorkflowOk(reader, asFile(saved))
    expect(
      await edgesIn([madeId]),
      'both internal edges arrive between the minted Tasks, and the external one does not (#207)',
    ).toEqual(['ac870 B <- ac870 A', 'ac870 C <- ac870 B'])
  })
})

describe('AC-871 a hand-written file is read by the same rule', () => {
  test('cross-folder edges travel and undeclared keys are skipped', async () => {
    const [, reader] = (await cast.of(app)) as [Actor, Actor]
    const response = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [
        {
          name: 'ac871 first',
          tasks: [
            { title: 'ac871 A', key: 'a' },
            { title: 'ac871 B', key: 'b', depends_on: ['a', 'nowhere'] },
          ],
        },
        {
          name: 'ac871 second',
          tasks: [{ title: 'ac871 C', depends_on: ['b'], key: 'c' }],
        },
      ],
    })
    expectStatus(response, 201, 'the file imports (7.16)')
    const made = (response.json() as { folders: { id: string }[] }).folders.map(
      (folder) => folder.id,
    )
    expect(await edgesIn(made)).toEqual(['ac871 B <- ac871 A', 'ac871 C <- ac871 B'])
  })

  test('a cycle is refused 422 before anything is written', async () => {
    const [, reader] = (await cast.of(app)) as [Actor, Actor]
    const before = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders WHERE name = 'ac871 loop'`,
    )
    const response = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [
        {
          name: 'ac871 loop',
          tasks: [
            { title: 'ac871 X', key: 'x', depends_on: ['y'] },
            { title: 'ac871 Y', key: 'y', depends_on: ['x'] },
          ],
        },
      ],
    })
    expectStatus(response, 422, 'a cycle is refused as the live endpoint refuses it (#207)')
    expect(JSON.stringify(response.json())).toContain('depends_on')
    const after = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders WHERE name = 'ac871 loop'`,
    )
    expect(after[0]?.n).toBe(before[0]?.n)
  })
})
