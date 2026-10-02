/*
AC-1540: Desk is the private Work project. It starts with Work and Docs,
accepts additional Doc tabs only, and refuses both Discussion entry points.
This is the server-side product boundary behind issue #509; the client also
omits Discussion from Desk tabs and Task properties (spec 9.6, 9.3).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1540')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function deskOf(owner: Actor): Promise<string> {
  const found = await rows(
    app.db,
    sql`SELECT id FROM folders WHERE owner_id = ${owner.id}::uuid AND is_default LIMIT 1`,
  )
  const id = found[0]?.id
  if (id === undefined) throw new Error('provisioned actor has no Desk')
  return String(id)
}

async function tabsOf(deskId: string): Promise<Record<string, unknown>[]> {
  return rows(
    app.db,
    sql`SELECT name, kind, (id = project_id) AS root
          FROM folders
         WHERE project_id = ${deskId}::uuid
           AND tab_position IS NOT NULL
           AND deleted_at IS NULL
           AND archived_at IS NULL
         ORDER BY tab_position, id`,
  )
}

describe('AC-1540 Desk is Work plus documentation', () => {
  test('AC-1540: Docs is default, plus adds Docs only, and Discussion cannot be created', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const deskId = await deskOf(owner)

    expect(await tabsOf(deskId)).toEqual([
      { name: 'Desk', kind: 'work', root: true },
      { name: 'Docs', kind: 'doc', root: false },
    ])

    const added = await owner.browser.json(`/folders/${deskId}/tabs`, 'POST', { kind: 'doc' })
    expectStatus(added, 201, 'Desk adds a documentation page')
    expect((await tabsOf(deskId)).map((tab) => [tab.name, tab.kind])).toEqual([
      ['Desk', 'work'],
      ['Docs', 'doc'],
      ['Doc', 'doc'],
    ])

    for (const kind of ['work', 'discussion', 'usual'] as const) {
      const refused = await owner.browser.json(`/folders/${deskId}/tabs`, 'POST', { kind })
      expectStatus(refused, 422, `Desk refuses a ${kind} tab`)
    }

    expectStatus(
      await owner.browser.json(`/folders/${deskId}/discussions`, 'POST', { title: 'No team here' }),
      409,
      'Desk refuses a new Discussion',
    )

    const madeTask = await owner.browser.json('/tasks', 'POST', {
      title: 'Private task',
      folder_id: deskId,
    })
    expectStatus(madeTask, 201, 'a Desk task')
    const taskId = String((madeTask.json() as { id?: unknown }).id)
    expectStatus(
      await owner.browser.json(`/tasks/${taskId}/discussion`, 'POST'),
      409,
      'a Desk task refuses Start a discussion',
    )

    expect(
      await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM discussions WHERE folder_id = ${deskId}::uuid`,
      ),
    ).toEqual([{ n: 0 }])
  }, 60_000)
})
