/*
AC-1380: Given a task the person wrote into a sample folder, when they DELETE
/sample, then that folder and the task stand, the response names the folder in
X-Dana-Sample-Kept, and the register is empty.

Data loss: removal destroys past Trash, and the undo writes a fresh sample,
not what was removed. Before, a person who tried the product by adding a task
to one of Maya's pages lost it for good on one press of Remove.

Asserted on stored rows. Spec: 7.20.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { SAMPLE_KEPT_HEADER } from '../../src/shared/sample.js'

let app: AuthTestApp
const cast = new Cast(['tryer'], 'ac1380')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1380 removing the sample keeps the person’s own work', () => {
  test('a sample folder holding an own task stands, and the other sample folders go', async () => {
    const [tryer] = await cast.of(app)
    if (tryer === undefined) throw new Error('cast must produce one actor')
    expectStatus(await tryer.browser.json('/sample', 'POST', {}), 200, 'the sample workspace is made (7.20)')

    const sampleFolders = await rows(
      app.db,
      sql`SELECT f.id, f.name FROM sample_objects s JOIN folders f ON f.id = s.id
          WHERE s.user_id = ${tryer.id}::uuid AND s.kind = 'folder'
          ORDER BY f.name`,
    )
    expect(sampleFolders.length).toBeGreaterThan(1)
    const target = sampleFolders[0]
    if (target === undefined) throw new Error('the sample must write a folder')

    const made = await tryer.browser.json('/tasks', 'POST', {
      title: 'My own real task',
      folder_id: String(target.id),
    })
    expectStatus(made, 201, 'the own task is created in a sample folder')
    const taskId = (made.json() as { id: string }).id

    const removed = await tryer.browser.json('/sample', 'DELETE')
    expectStatus(removed, 204, 'the sample is removed (7.20)')
    const header = removed.headers[SAMPLE_KEPT_HEADER.toLowerCase()]
    expect(decodeURIComponent(String(header)).split('\n')).toContain(String(target.name))

    const task = await rows(app.db, sql`SELECT folder_id FROM tasks WHERE id = ${taskId}::uuid`)
    expect(task[0]?.folder_id).toBe(String(target.id))
    const folder = await rows(app.db, sql`SELECT id FROM folders WHERE id = ${String(target.id)}::uuid`)
    expect(folder.length).toBe(1)

    // What is removed as well as what is kept: another sample folder is gone.
    const others = sampleFolders.filter((row) => row.id !== target.id).map((row) => String(row.id))
    const survivors = await rows(
      app.db,
      sql`SELECT id FROM folders WHERE id IN (${sql.join(others.map((id) => sql`${id}::uuid`), sql`, `)})`,
    )
    expect(survivors.length).toBe(0)

    const register = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM sample_objects WHERE user_id = ${tryer.id}::uuid`,
    )
    expect(register[0]?.n).toBe(0)
  })
})
