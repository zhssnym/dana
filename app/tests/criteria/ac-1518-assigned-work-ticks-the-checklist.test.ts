/*
AC-1518: an assignee with Assigned work may tick or untick a checklist item of
their task's body; the same person adding, renaming or removing one is
refused 403 and nothing is stored (spec 5.4, `step.toggle` against
`task.edit`).

Security: the task document writer admits a checked-only transaction under
`step.toggle` (`isChecklistTickOnly`). Everything else still needs
`task.edit`, which Assigned work does not have. Asserted on the stored rows.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, addMemberOk, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'worker'], 'ac1518')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface StoredBlock {
  id: string
  kind: string
  text: string | null
  rich_content: unknown
  file_id: string | null
  width_pct: number | null
  checked: boolean | null
  list_parent_block_id: string | null
}

async function documentOf(actor: Actor, taskId: string): Promise<{ revision: string; blocks: StoredBlock[] }> {
  const read = await actor.browser.api(`/tasks/${taskId}/document`)
  expectStatus(read, 200, 'the assignee reads the task document (spec 7.16)')
  return read.json() as { revision: string; blocks: StoredBlock[] }
}

function put(block: StoredBlock, changes: Partial<StoredBlock> = {}): Record<string, unknown> {
  const next = { ...block, ...changes }
  return {
    op: 'put_block', id: next.id, block_kind: next.kind, text: next.text, rich_content: next.rich_content,
    file_id: next.file_id, ref_folder_id: null, width_pct: next.width_pct, checked: next.checked, toggleable: null,
  }
}

function outline(blocks: readonly StoredBlock[]): Record<string, unknown> {
  return {
    op: 'set_outline',
    items: blocks.map((b) => ({ kind: 'block', id: b.id, section_block_id: null, list_parent_block_id: b.list_parent_block_id })),
  }
}

function write(actor: Actor, taskId: string, revision: string, operations: unknown[]) {
  return actor.browser.json(`/tasks/${taskId}/document`, 'PUT', {
    action: 'document_transaction', mutation_id: randomUUID(), base_revision: revision, operations,
  })
}

async function stored(taskId: string): Promise<Record<string, unknown>[]> {
  return rows(app.db, sql`
    SELECT id, kind, text, checked FROM page_blocks WHERE task_id = ${taskId}::uuid
     ORDER BY page_position, id`)
}

describe('AC-1518 Assigned work ticks its own task\'s checklist and changes nothing else', () => {
  test('a tick and an untick are stored; an add, a rename and a removal are 403 and store nothing', async () => {
    const [owner, worker] = await cast.of(app)
    if (owner === undefined || worker === undefined) throw new Error('cast must produce two actors')
    const folderId = await createFolder(owner, 'ac1518 trip')
    await connect(app.db, owner.id, worker.id)
    await addMemberOk(owner, folderId, worker.id, 'assigned_work')
    const task = await createTaskOk(
      owner,
      { title: 'ac1518 pack', folder_id: folderId, assignee_id: worker.id, steps: ['Tent', 'Stove'] },
      'the owner creates a task assigned to the worker, with two steps (spec 7.6)',
    )

    let doc = await documentOf(worker, task.id)
    const [tent, stove] = doc.blocks
    if (tent === undefined || stove === undefined) throw new Error('the steps are the body\'s checklist')
    expect(doc.blocks.map((b) => [b.kind, b.text, b.checked])).toEqual([
      ['checklist', 'Tent', false],
      ['checklist', 'Stove', false],
    ])

    expectStatus(
      await write(worker, task.id, doc.revision, [put(tent, { checked: true }), outline(doc.blocks)]),
      200,
      'Assigned work ticks an item of its own task (step.toggle)',
    )
    expect(await stored(task.id)).toEqual([
      { id: tent.id, kind: 'checklist', text: 'Tent', checked: true },
      { id: stove.id, kind: 'checklist', text: 'Stove', checked: false },
    ])
    doc = await documentOf(worker, task.id)
    expectStatus(
      await write(worker, task.id, doc.revision, [put({ ...tent, checked: true }, { checked: false }), outline(doc.blocks)]),
      200,
      'and unticks it',
    )
    // A missing tick is stored as false, so it is an untick with a history row.
    doc = await documentOf(worker, task.id)
    expectStatus(await write(worker, task.id, doc.revision, [put(tent, { checked: true }), outline(doc.blocks)]), 200, 'ticks again')
    doc = await documentOf(worker, task.id)
    expectStatus(
      await write(worker, task.id, doc.revision, [put(tent, { checked: null }), outline(doc.blocks)]),
      200,
      'unticks with a null tick',
    )
    doc = await documentOf(worker, task.id)
    const settled = await stored(task.id)
    expect(settled).toEqual([
      { id: tent.id, kind: 'checklist', text: 'Tent', checked: false },
      { id: stove.id, kind: 'checklist', text: 'Stove', checked: false },
    ])

    // The history names each tick, never a description edit the worker cannot make.
    expect(await rows(app.db, sql`
      SELECT detail FROM events
       WHERE subject_kind = 'task' AND subject_id = ${task.id}::uuid AND actor_id = ${worker.id}::uuid
       ORDER BY created_at, id`)).toEqual([
      { detail: "completed the step 'Tent'" },
      { detail: "reopened the step 'Tent'" },
      { detail: "completed the step 'Tent'" },
      { detail: "reopened the step 'Tent'" },
    ])

    const added: StoredBlock ={ ...stove, id: randomUUID(), text: 'Map', checked: false }
    const refusals: [string, unknown[]][] = [
      ['adding an item', [put(added), outline([...doc.blocks, added])]],
      ['renaming an item', [put(stove, { text: 'Two stoves', rich_content: null }), outline(doc.blocks)]],
      ['removing an item', [{ op: 'delete_block', id: stove.id }, outline([tent])]],
      ['a rename riding with a tick', [put(tent, { checked: true }), put(stove, { text: 'Gas' }), outline(doc.blocks)]],
    ]
    for (const [what, operations] of refusals) {
      expectStatus(await write(worker, task.id, doc.revision, operations), 403, `${what} is task.edit, which Assigned work lacks`)
      expect(await stored(task.id), `${what} stored nothing`).toEqual(settled)
    }
  })
})

describe('AC-1518 an old client\'s 7.7 calls land on the checklist, under the same gates', () => {
  test('add, tick, rename and delete are stored on the body; Assigned work only ticks', async () => {
    const [owner, worker] = await cast.of(app)
    if (owner === undefined || worker === undefined) throw new Error('cast must produce two actors')
    const folderId = await createFolder(owner, 'ac1518 old client')
    await connect(app.db, owner.id, worker.id)
    await addMemberOk(owner, folderId, worker.id, 'assigned_work')
    const task = await createTaskOk(
      owner,
      { title: 'ac1518 legacy', folder_id: folderId, assignee_id: worker.id, steps: ['Tent'] },
      'the owner creates a task with one step (spec 7.6)',
    )
    const [tent] = await stored(task.id)
    if (tent === undefined) throw new Error('the step is the body\'s checklist')

    expectStatus(await owner.browser.json(`/tasks/${task.id}/steps`, 'POST', { title: 'Stove', position: 2 }), 201, 'the old add appends an item')
    const [, stove] = await stored(task.id)
    if (stove === undefined) throw new Error('the added item is stored')
    expect(await stored(task.id)).toEqual([
      { id: tent.id, kind: 'checklist', text: 'Tent', checked: false },
      { id: stove.id, kind: 'checklist', text: 'Stove', checked: false },
    ])

    expectStatus(await worker.browser.json(`/steps/${String(tent.id)}`, 'PATCH', { done: true }), 200, 'Assigned work ticks through the old call')
    expectStatus(await worker.browser.json(`/steps/${String(tent.id)}`, 'PATCH', { title: 'Tarp' }), 403, 'but may not rename')
    expectStatus(await worker.browser.json(`/tasks/${task.id}/steps`, 'POST', { title: 'Map' }), 403, 'or add')
    expectStatus(await worker.browser.json(`/steps/${String(stove.id)}`, 'DELETE'), 403, 'or delete')
    expectStatus(await owner.browser.json(`/steps/${String(stove.id)}`, 'PATCH', { title: 'Two stoves' }), 200, 'the owner renames')
    expect(await stored(task.id)).toEqual([
      { id: tent.id, kind: 'checklist', text: 'Tent', checked: true },
      { id: stove.id, kind: 'checklist', text: 'Two stoves', checked: false },
    ])
    expectStatus(await owner.browser.json(`/steps/${String(stove.id)}`, 'DELETE'), 204, 'the owner deletes')
    expect(await stored(task.id)).toEqual([{ id: tent.id, kind: 'checklist', text: 'Tent', checked: true }])
  })
})

describe('AC-1518 a body over 500 blocks (0060 can make one) still takes a tick', () => {
  test('the tick is stored; only growth past the cap is refused', async () => {
    const [owner, worker] = await cast.of(app)
    if (owner === undefined || worker === undefined) throw new Error('cast must produce two actors')
    const folderId = await createFolder(owner, 'ac1518 long body')
    await connect(app.db, owner.id, worker.id)
    await addMemberOk(owner, folderId, worker.id, 'assigned_work')
    const task = await createTaskOk(
      owner,
      { title: 'ac1518 long', folder_id: folderId, assignee_id: worker.id, steps: ['Tent'] },
      'the owner creates a task with one step (spec 7.6)',
    )
    await app.db.execute(sql`
      INSERT INTO page_blocks (task_id, kind, position, page_position, text)
      SELECT ${task.id}::uuid, 'paragraph', n, 'Z' || lpad(n::text, 3, '0'), 'line'
        FROM generate_series(1, 500) AS n`)
    const doc = await documentOf(worker, task.id)
    expect(doc.blocks).toHaveLength(501)
    const tent = doc.blocks.find((b) => b.kind === 'checklist')
    if (tent === undefined) throw new Error('the step is in the body')
    expectStatus(await write(worker, task.id, doc.revision, [put(tent, { checked: true }), outline(doc.blocks)]), 200, 'a tick on a long body')
    expect((await stored(task.id)).find((b) => b.id === tent.id)).toEqual({ id: tent.id, kind: 'checklist', text: 'Tent', checked: true })
    const extra: StoredBlock = { ...tent, id: randomUUID(), text: 'More', checked: false }
    const after = await documentOf(owner, task.id)
    expectStatus(await write(owner, task.id, after.revision, [put(extra), outline([...after.blocks, extra])]), 422, 'growing it is refused')
  })
})
