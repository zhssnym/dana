/*
AC-1511: given a repeating Task on a page's Work, when it is completed then
its next occurrence is stored directly after it in page order, and when it is
uncompleted and completed again the recreated occurrence takes the same place.

The failure this exists for: the next occurrence was placed at the end of the
Task's Section (or of the page), so ticking a weekly task on the Work thread
moved "what is next" to the bottom and the page jumped to find it. The order
is asserted on the stored rows, not on a response.

Spec: 8.5 (generate_successor), 9.6 (the Work thread).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import { asRecord, createTaskOk, seedRecurrence } from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p3')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function pageOrder(folderId: string): Promise<string[]> {
  const found = await rows(app.db, sql`
    SELECT id FROM tasks
     WHERE folder_id = ${folderId}::uuid AND deleted_at IS NULL
     ORDER BY page_position ASC NULLS LAST, id`)
  return found.map((row) => String(row.id))
}

describe('AC-1511: a repeating Task’s next occurrence stands directly after it', () => {
  test('AC-1511: complete places the successor after the completed occurrence, and a re-complete puts it back there', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'p3 ac1511 weekly')
    const make = async (title: string): Promise<string> => (await createTaskOk(
      owner,
      { title, folder_id: folderId, due_date: '2026-09-14' },
      'a dated task must be creatable (spec 7.6)',
    )).id
    const weekly = await make('p3 ac1511 long run')
    const after = await make('p3 ac1511 time trial')
    const last = await make('p3 ac1511 race')
    await seedRecurrence(app.db, weekly)
    expect(await pageOrder(folderId), 'the page holds the three tasks in the order they were made').toEqual([weekly, after, last])

    const complete = async (): Promise<string> => {
      const response = await owner.browser.json(`/tasks/${weekly}/complete?tz=Europe/Stockholm`, 'POST', {})
      expectStatus(response, 200, 'completing a repeating task answers 200 (spec 7.6)')
      const generated = asRecord(asRecord(response.json(), 'the complete body').generated_task, 'generated_task')
      return String(generated.id)
    }

    const successor = await complete()
    expect(await pageOrder(folderId), 'the next occurrence is stored directly after the one just completed').toEqual([weekly, successor, after, last])

    const undone = await owner.browser.json(`/tasks/${weekly}/uncomplete`, 'POST', {})
    expectStatus(undone, 200, 'uncompleting the occurrence answers 200 (spec 7.6)')
    expect(asRecord(undone.json(), 'the uncomplete body').deleted_successor_id, 'the untouched successor is reclaimed (5.1 G-SERIES)').toBe(successor)
    expect(await pageOrder(folderId), 'the reclaimed successor is gone and nothing else moved').toEqual([weekly, after, last])

    const again = await complete()
    expect(again, 'a second completion generates a new successor').not.toBe(successor)
    expect(await pageOrder(folderId), 'the recreated occurrence takes the reclaimed one’s place').toEqual([weekly, again, after, last])
  })
})
