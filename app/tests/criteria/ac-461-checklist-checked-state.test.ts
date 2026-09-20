/*
AC-461: given a checklist item on the folder canvas, when it is checked and
unchecked, then its state round-trips with the block and nothing about Dana's
Work moves; and a `checked` value on any other kind is refused before writes.

Issue #219, R1 decision 3. A checklist item is authored document content, not a
Task and not a Task Step: ticking it completes nothing, assigns nobody, and
moves no Folder or Section progress. That negative is the point of the decision
and so it is what the second case asserts, against a real Task sitting in the
same Section as the checklist.

`checked` is also this slice's request-schema field, so hard stop 3 is met
here: the field is declared in `app/src/shared/page-document.ts`, read by
`applyDocument`, and its value is proved to arrive by the first case below —
`true` in, `true` back out of a fresh read.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, DocumentOperation, PageView } from '../../src/shared/pages.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac461')
beforeAll(async () => { app = await startAuthTestApp() }, 60000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

const put = (id: string, kind: DocumentBlockKind, text: string, checked: boolean | null = null): DocumentOperation => ({
  op: 'put_block', id, block_kind: kind, text,
  rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked,
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

test('AC-461 a checklist item round-trips unchecked, checked and back', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'checklist state')
  const url = `/folders/${folder}/page/actions`
  const id = randomUUID()
  const omitted = randomUUID()
  const outline = [
    { kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null },
    { kind: 'block' as const, id: omitted, section_block_id: null, list_parent_block_id: null },
  ]

  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      // The second item omits `checked` entirely, which is how a client that
      // has not thought about the tick yet writes one: unchecked, never null.
      operations: [put(id, 'checklist', 'Buy milk', false), { op: 'put_block', id: omitted, block_kind: 'checklist', text: 'Buy bread', rich_content: null, file_id: null, ref_folder_id: null, width_pct: null }, { op: 'set_outline', items: outline }],
    }),
    200,
    'unchecked checklist accepted',
  )
  const unchecked = await read(owner, folder)
  expect(unchecked.blocks.find((block) => block.id === id)?.checked).toBe(false)
  expect(unchecked.blocks.find((block) => block.id === omitted)?.checked).toBe(false)

  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: unchecked.revision!,
      operations: [put(id, 'checklist', 'Buy milk', true), { op: 'set_outline', items: outline }],
    }),
    200,
    'checking accepted',
  )
  const checked = await read(owner, folder)
  expect(checked.blocks.find((block) => block.id === id)?.checked).toBe(true)
  expect(checked.blocks.find((block) => block.id === omitted)?.checked).toBe(false)
  // A tick is part of the content, so it changes the document revision: a
  // second person's stale draft must reconcile rather than overwrite it.
  expect(checked.revision).not.toBe(unchecked.revision)

  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: checked.revision!,
      operations: [put(id, 'checklist', 'Buy milk', false), { op: 'set_outline', items: outline }],
    }),
    200,
    'unchecking accepted',
  )
  expect((await read(owner, folder)).blocks.find((block) => block.id === id)?.checked).toBe(false)
})

test('AC-461 checking an item completes no Task and moves no Work', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'a tick is not work')
  const url = `/folders/${folder}/page/actions`
  const section = randomUUID(), item = randomUUID(), task = randomUUID()
  const outline = [
    { kind: 'block' as const, id: section, section_block_id: null, list_parent_block_id: null },
    { kind: 'block' as const, id: item, section_block_id: section, list_parent_block_id: null },
    { kind: 'task' as const, id: task, section_block_id: section, list_parent_block_id: null },
  ]
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [put(section, 'section', 'Errands'), put(item, 'checklist', 'Buy milk', false), { op: 'create_task', id: task, title: 'Real work' }, { op: 'set_outline', items: outline }],
    }),
    200,
    'a Section holding a checklist item and a Task',
  )

  const before = await owner.browser.json(`/tasks/${task}`, 'GET')
  expectStatus(before, 200, 'task before')
  const beforeTask = before.json() as Record<string, unknown>

  const page = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: page.revision!,
      operations: [put(item, 'checklist', 'Buy milk', true), { op: 'set_outline', items: outline }],
    }),
    200,
    'checking the item',
  )

  const after = await owner.browser.json(`/tasks/${task}`, 'GET')
  expectStatus(after, 200, 'task after')
  const afterTask = after.json() as Record<string, unknown>
  expect(afterTask.status).toBe(beforeTask.status)
  expect(afterTask.status).toBe('pending')
  expect(afterTask.completed_at ?? null).toBeNull()
  expect(afterTask.assignee ?? null).toEqual(beforeTask.assignee ?? null)
  expect(afterTask.steps_done ?? null).toEqual(beforeTask.steps_done ?? null)
  expect(afterTask.steps_total ?? null).toEqual(beforeTask.steps_total ?? null)

  // And the Work hierarchy is untouched: the Task still belongs to the Section
  // and the checklist item is still content inside it rather than a sibling
  // piece of work.
  const reloaded = await read(owner, folder)
  expect(reloaded.task_placements).toEqual([{ id: task, section_block_id: section }])
  expect(reloaded.blocks.find((block) => block.id === item)?.section_block_id).toBe(section)
  expect(reloaded.blocks.find((block) => block.id === item)?.checked).toBe(true)
})

test('AC-461 only a checklist item is checked, and the refusal writes nothing', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ticks belong to checklists')
  const url = `/folders/${folder}/page/actions`
  const before = await read(owner, folder)
  for (const kind of ['paragraph', 'bullet', 'numbered', 'quote', 'callout', 'code', 'section'] as const) {
    const id = randomUUID()
    expectStatus(
      await owner.browser.json(url, 'POST', {
        action: 'document_transaction', mutation_id: randomUUID(), base_revision: before.revision!,
        operations: [put(id, kind, 'Something', true), { op: 'set_outline', items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }] }],
      }),
      422,
      `a ${kind} is not checked`,
    )
  }
  const after = await read(owner, folder)
  expect(after.revision).toBe(before.revision)
  expect(after.blocks).toEqual(before.blocks)
})

test('AC-461 a checklist item that becomes another kind loses its tick', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'conversion clears the tick')
  const url = `/folders/${folder}/page/actions`
  const id = randomUUID()
  const outline = [{ kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null }]
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [put(id, 'checklist', 'Was a checklist', true), { op: 'set_outline', items: outline }],
    }),
    200,
    'checked item stored',
  )
  const checked = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: checked.revision!,
      operations: [put(id, 'bullet', 'Was a checklist'), { op: 'set_outline', items: outline }],
    }),
    200,
    'converted to a bullet',
  )
  const converted = await read(owner, folder)
  expect(converted.blocks.find((block) => block.id === id)?.kind).toBe('bullet')
  expect(converted.blocks.find((block) => block.id === id)?.checked).toBeNull()
})
