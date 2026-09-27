/*
AC-1517: repeating or duplicating a task whose checklist has ticked items
gives the same items, in order, unticked (spec 8.5; migration 0060 made the
checklist the task's subtasks, and 8.5 has always reset them). Asserted on
the stored rows of the copy, with the source left as it was.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import { asRecord, createTaskOk, seedRecurrence } from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1517')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function checklist(taskId: string): Promise<[unknown, unknown][]> {
  const found = await rows(app.db, sql`
    SELECT text, checked FROM page_blocks
     WHERE task_id = ${taskId}::uuid AND kind = 'checklist'
     ORDER BY page_position, id`)
  return found.map((row) => [row.text, row.checked])
}

describe('AC-1517 a repeat or a duplicate starts with its checklist unticked', () => {
  test('duplicate and the next occurrence carry the items, unticked; the source keeps its ticks', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac1517 weekly')
    const task = await createTaskOk(
      owner,
      { title: 'ac1517 long run', folder_id: folderId, due_date: '2026-09-14', steps: ['Warm up', 'Run', 'Stretch'] },
      'a dated task with steps must be creatable (spec 7.6)',
    )
    await seedRecurrence(app.db, task.id)

    // Tick the first two through the document, as the composer does.
    const read = await owner.browser.api(`/tasks/${task.id}/document`)
    expectStatus(read, 200, 'the owner reads the task document')
    const doc = read.json() as { revision: string; blocks: { id: string; text: string; list_parent_block_id: string | null }[] }
    const ticked = await owner.browser.json(`/tasks/${task.id}/document`, 'PUT', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: doc.revision,
      operations: [
        ...doc.blocks.slice(0, 2).map((b) => ({
          op: 'put_block', id: b.id, block_kind: 'checklist', text: b.text, rich_content: null,
          file_id: null, ref_folder_id: null, width_pct: null, checked: true,
        })),
        { op: 'set_outline', items: doc.blocks.map((b) => ({ kind: 'block', id: b.id, section_block_id: null, list_parent_block_id: null })) },
      ],
    })
    expectStatus(ticked, 200, 'the owner ticks two items')
    const source = [['Warm up', true], ['Run', true], ['Stretch', false]]
    expect(await checklist(task.id)).toEqual(source)

    const duplicated = await owner.browser.json(`/tasks/${task.id}/duplicate?tz=UTC`, 'POST', {})
    expectStatus(duplicated, 201, 'duplicating the task answers 201 (spec 7.16)')
    const copyId = String(asRecord(duplicated.json(), 'the duplicate body').id)
    expect(await checklist(copyId), 'the duplicate carries the items, unticked').toEqual([
      ['Warm up', false], ['Run', false], ['Stretch', false],
    ])

    const completed = await owner.browser.json(`/tasks/${task.id}/complete?tz=UTC`, 'POST', {})
    expectStatus(completed, 200, 'completing a repeating task answers 200 (spec 7.6)')
    const nextId = String(asRecord(asRecord(completed.json(), 'the complete body').generated_task, 'generated_task').id)
    expect(await checklist(nextId), 'the next occurrence carries the items, unticked').toEqual([
      ['Warm up', false], ['Run', false], ['Stretch', false],
    ])
    expect(await checklist(task.id), 'the source keeps its ticks').toEqual(source)
  })
})
