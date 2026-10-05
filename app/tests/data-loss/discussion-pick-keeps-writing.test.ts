/*
an unpicked project root that already holds a sub-page or a task is
never picked as a Discussion, which draws threads only and refuses writing:
`POST /folders/:id/tabs {kind:'discussion'}` answers 409 and the root stays
unpicked with its home block and task. An empty root may still be picked as
a Discussion. Asserted on the stored rows (spec 7.4).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1525')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function unpicked(owner: Actor, name: string): Promise<string> {
  const made = await owner.browser.json('/folders', 'POST', { name, kind: null })
  expectStatus(made, 201, 'an unpicked project')
  return (made.json() as { id: string }).id
}

async function rootKind(id: string): Promise<unknown> {
  return (await rows(app.db, sql`SELECT kind FROM folders WHERE id = ${id}::uuid`))[0]?.kind
}

describe('a Discussion pick never hides writing', () => {
  test('a root holding a sub-page or a task refuses Discussion and keeps both', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const withPage = await unpicked(owner, 'ac1525 page')
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1525 sub', parent_folder_id: withPage })
    expectStatus(sub, 201, 'a sub-page on an unpicked root')
    const subId = (sub.json() as { id: string }).id
    expectStatus(
      await owner.browser.json(`/folders/${withPage}/tabs`, 'POST', { kind: 'discussion' }),
      409,
      'Discussion over a sub-page link',
    )
    expect(await rootKind(withPage)).toBeNull()
    expect(
      await rows(app.db, sql`SELECT kind, ref_folder_id FROM page_blocks WHERE folder_id = ${withPage}::uuid`),
    ).toEqual([{ kind: 'page', ref_folder_id: subId }])
    expect(
      await rows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE project_id = ${withPage}::uuid AND kind = 'discussion'`),
    ).toEqual([{ n: 0 }])

    const withTask = await unpicked(owner, 'ac1525 task')
    const task = await owner.browser.json('/tasks', 'POST', { title: 'ac1525 task', folder_id: withTask })
    expectStatus(task, 201, 'a task on an unpicked root')
    const taskId = (task.json() as { id: string }).id
    expectStatus(
      await owner.browser.json(`/folders/${withTask}/tabs`, 'POST', { kind: 'discussion' }),
      409,
      'Discussion over a task',
    )
    expect(await rootKind(withTask)).toBeNull()
    expect(
      await rows(app.db, sql`SELECT folder_id, deleted_at FROM tasks WHERE id = ${taskId}::uuid`),
    ).toEqual([{ folder_id: withTask, deleted_at: null }])

    // Work still picks over the same content.
    expectStatus(await owner.browser.json(`/folders/${withTask}/tabs`, 'POST', { kind: 'work' }), 201, 'Work over a task')
    expect(await rootKind(withTask)).toBe('work')

    const empty = await unpicked(owner, 'ac1525 empty')
    expectStatus(await owner.browser.json(`/folders/${empty}/tabs`, 'POST', { kind: 'discussion' }), 201, 'Discussion on an empty root')
    expect(await rootKind(empty)).toBe('discussion')
  }, 60_000)
})
