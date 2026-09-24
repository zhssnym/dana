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
edges form a cycle is refused 422 naming the field before anything is written. Its Tasks are
created in the file's order: each takes its own `created_at`, so no list falls
back to a random id to order two Tasks of one import.

The edges are bounded (reviewer finding on the M1 swarm): a file naming more
than 5000 dependencies in all, or one Task naming more than 100, is refused
422 naming `depends_on` before anything is written, and an admitted file's
edges land in one statement rather than one round trip each.

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

  test("the Tasks are created in the file's order, never tied on created_at", async () => {
    const [, reader] = (await cast.of(app)) as [Actor, Actor]
    const titles = Array.from({ length: 12 }, (_, i) => `ac871 order ${String(i).padStart(2, '0')}`)
    const response = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [{ name: 'ac871 order', tasks: titles.map((title) => ({ title })) }],
    })
    expectStatus(response, 201, 'the file imports (7.16)')
    const [made] = (response.json() as { folders: { id: string }[] }).folders
    const found = await rows(
      app.db,
      sql`SELECT title, created_at FROM tasks WHERE folder_id = ${made?.id}::uuid
          ORDER BY created_at, id`,
    )
    expect(found.map((row) => String(row.title))).toEqual(titles)
    expect(new Set(found.map((row) => String(row.created_at))).size, 'no two Tasks share an instant').toBe(titles.length)
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

  test('a file over the dependency caps is refused 422 before anything is written', async () => {
    const [, reader] = (await cast.of(app)) as [Actor, Actor]
    const count = async (name: string) =>
      (
        await rows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE name = ${name}`)
      )[0]?.n
    // 51 Tasks naming 100 blockers each: 5100 in all, over the file cap.
    const blockers = Array.from({ length: 100 }, (_, i) => `b${String(i)}`)
    const tasks = [
      ...blockers.map((key) => ({ title: `ac871 ${key}`, key })),
      ...Array.from({ length: 51 }, (_, i) => ({
        title: `ac871 w${String(i)}`,
        key: `w${String(i)}`,
        depends_on: blockers,
      })),
    ]
    const overFile = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [{ name: 'ac871 too many', tasks }],
    })
    expectStatus(overFile, 422, 'a file naming over 5000 dependencies is refused')
    expect(JSON.stringify(overFile.json())).toContain('depends_on')
    expect(await count('ac871 too many'), 'nothing was written').toBe(0)

    const overTask = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [
        {
          name: 'ac871 one too many',
          tasks: [
            ...blockers.map((key) => ({ title: `ac871 ${key}`, key })),
            { title: 'ac871 extra', key: 'extra' },
            { title: 'ac871 waits', key: 'waits', depends_on: [...blockers, 'extra'] },
          ],
        },
      ],
    })
    expectStatus(overTask, 422, 'one Task naming over 100 blockers is refused')
    expect(JSON.stringify(overTask.json())).toContain('depends_on')
    expect(await count('ac871 one too many'), 'nothing was written').toBe(0)
  })

  test('an admitted file at the per-Task cap writes every edge', async () => {
    const [, reader] = (await cast.of(app)) as [Actor, Actor]
    const blockers = Array.from({ length: 100 }, (_, i) => `b${String(i)}`)
    const response = await importWorkflow(reader, {
      dana: 'workflow',
      version: 1,
      folders: [
        {
          name: 'ac871 at cap',
          tasks: [
            ...blockers.map((key) => ({ title: `ac871 cap ${key}`, key })),
            { title: 'ac871 cap waits', key: 'waits', depends_on: blockers },
          ],
        },
      ],
    })
    expectStatus(response, 201, 'a file at the cap imports')
    const [made] = (response.json() as { folders: { id: string }[] }).folders
    const edges = await edgesIn([made?.id as string])
    expect(edges).toHaveLength(100)
    expect(edges.every((edge) => edge.startsWith('ac871 cap waits <- ac871 cap b'))).toBe(true)
  })
})
