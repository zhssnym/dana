/*
AC-462: given the folder canvas, when a document transaction nests list items,
then `list_parent_block_id` records writing structure while `section_block_id`
goes on recording Work grouping, the two are independent, and every invalid
nesting is refused before the first write.

Issue #219, R1 decision 2 and the locked storage direction. The direction is
the part worth restating, because it is the one that is easy to get subtly
wrong: `section_block_id` is *not* overloaded to mean list nesting. A nested
list item carries both parents at once, and this file asserts both on the same
block — that is what "independent" means here and it is what the structure in
the issue body shows.

`list_parent_block_id` is this slice's second request-schema field, so hard
stop 3 is met here: it is declared on `documentOutlineItem`, read by
`applyDocument`'s outline pass, and proved to arrive by the first case, which
reads it back out of a fresh GET.

Every refusal is followed by a read proving the revision did not move, because
"refused before any write" is the claim rather than "refused".
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, DocumentOperation, DocumentOutlineItem, PageView } from '../../src/shared/pages.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac462')
beforeAll(async () => { app = await startAuthTestApp() }, 60000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

const put = (id: string, kind: DocumentBlockKind, text: string, checked: boolean | null = null): DocumentOperation => ({
  op: 'put_block', id, block_kind: kind, text,
  rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked,
})
const at = (id: string, section: string | null = null, listParent: string | null = null): DocumentOutlineItem =>
  ({ kind: 'block', id, section_block_id: section, list_parent_block_id: listParent })

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

test('AC-462 a list nested inside a Section keeps both parents, and neither is the other', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'a list inside a Section')
  const url = `/folders/${folder}/page/actions`
  // Exactly the structure the issue body draws:
  //   Section A
  //     bullet A
  //       numbered B
  //         checklist C [checked]
  const section = randomUUID(), bullet = randomUUID(), numbered = randomUUID(), checklist = randomUUID()
  const outline = [
    at(section),
    at(bullet, section),
    at(numbered, section, bullet),
    at(checklist, section, numbered),
  ]
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [
        put(section, 'section', 'Section A'),
        put(bullet, 'bullet', 'bullet A'),
        put(numbered, 'numbered', 'numbered B'),
        put(checklist, 'checklist', 'checklist C', true),
        { op: 'set_outline', items: outline },
      ],
    }),
    200,
    'three nested list levels inside one Section',
  )

  const stored = await read(owner, folder)
  const of = (id: string) => stored.blocks.find((block) => block.id === id)
  // All three list items belong to the same Section...
  expect(of(bullet)?.section_block_id).toBe(section)
  expect(of(numbered)?.section_block_id).toBe(section)
  expect(of(checklist)?.section_block_id).toBe(section)
  // ...while only the nested ones carry a list parent.
  expect(of(bullet)?.list_parent_block_id).toBeNull()
  expect(of(numbered)?.list_parent_block_id).toBe(bullet)
  expect(of(checklist)?.list_parent_block_id).toBe(numbered)
  expect(of(checklist)?.checked).toBe(true)
  expect(stored.items.map((item) => item.id)).toEqual([section, bullet, numbered, checklist])

  // Re-nesting alone, with no block content changed, is still a structure
  // change and must be written: the checklist item moves up a level.
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: stored.revision!,
      operations: [{ op: 'set_outline', items: [at(section), at(bullet, section), at(numbered, section, bullet), at(checklist, section, bullet)] }],
    }),
    200,
    're-nesting with no content change',
  )
  const moved = await read(owner, folder)
  expect(moved.blocks.find((block) => block.id === checklist)?.list_parent_block_id).toBe(bullet)
  expect(moved.blocks.find((block) => block.id === checklist)?.checked).toBe(true)

  // And a list at the page root needs no Section at all: the two relations do
  // not imply one another in either direction.
  const loose = randomUUID(), looseChild = randomUUID()
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: moved.revision!,
      operations: [
        put(loose, 'bullet', 'root bullet'),
        put(looseChild, 'bullet', 'root bullet child'),
        { op: 'set_outline', items: [at(section), at(bullet, section), at(numbered, section, bullet), at(checklist, section, bullet), at(loose), at(looseChild, null, loose)] },
      ],
    }),
    200,
    'a nested list at the page root',
  )
  const rooted = await read(owner, folder)
  expect(rooted.blocks.find((block) => block.id === looseChild)?.section_block_id).toBeNull()
  expect(rooted.blocks.find((block) => block.id === looseChild)?.list_parent_block_id).toBe(loose)
})

test('AC-462 every invalid list structure is refused before any write', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'refused nesting')
  const url = `/folders/${folder}/page/actions`
  const section = randomUUID(), bullet = randomUUID(), paragraph = randomUUID(), quote = randomUUID(), task = randomUUID()
  const base = [at(section), at(bullet, section), at(paragraph, section), at(quote, section), { kind: 'task' as const, id: task, section_block_id: section, list_parent_block_id: null }]
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [
        put(section, 'section', 'Section A'),
        put(bullet, 'bullet', 'bullet A'),
        put(paragraph, 'paragraph', 'ordinary prose'),
        put(quote, 'quote', 'a quotation'),
        { op: 'create_task', id: task, title: 'Real work' },
        { op: 'set_outline', items: base },
      ],
    }),
    200,
    'the starting page',
  )
  const settled = await read(owner, folder)

  const unknown = randomUUID(), later = randomUUID(), cycleA = randomUUID(), cycleB = randomUUID(), other = randomUUID()
  const refusals: [string, DocumentOperation[]][] = [
    ['a Task is never a nested list item', [{ op: 'set_outline', items: [at(section), at(bullet, section), at(paragraph, section), at(quote, section), { kind: 'task', id: task, section_block_id: section, list_parent_block_id: bullet }] }]],
    ['a paragraph is not a list item', [{ op: 'set_outline', items: [at(section), at(bullet, section), at(paragraph, section, bullet), at(quote, section), { kind: 'task', id: task, section_block_id: section, list_parent_block_id: null }] }]],
    ['a quote is not a list item', [{ op: 'set_outline', items: [at(section), at(bullet, section), at(paragraph, section), at(quote, section, bullet), { kind: 'task', id: task, section_block_id: section, list_parent_block_id: null }] }]],
    ['a Section is not a list parent', [put(later, 'bullet', 'would nest under a heading'), { op: 'set_outline', items: [...base, at(later, section, section)] }]],
    ['a paragraph is not a list parent', [put(later, 'bullet', 'would nest under prose'), { op: 'set_outline', items: [...base, at(later, section, paragraph)] }]],
    ['an unknown list parent is refused', [put(later, 'bullet', 'orphan'), { op: 'set_outline', items: [...base, at(later, section, unknown)] }]],
    ['a list parent that follows its child is refused', [put(later, 'bullet', 'parent comes later'), { op: 'set_outline', items: [at(section), at(bullet, section, later), at(paragraph, section), at(quote, section), { kind: 'task', id: task, section_block_id: section, list_parent_block_id: null }, at(later, section)] }]],
    ['a two-item cycle is refused', [put(cycleA, 'bullet', 'a'), put(cycleB, 'bullet', 'b'), { op: 'set_outline', items: [...base, at(cycleA, section, cycleB), at(cycleB, section, cycleA)] }]],
    ['a self-parent is refused', [put(later, 'bullet', 'its own parent'), { op: 'set_outline', items: [...base, at(later, section, later)] }]],
    ["a child outside its list parent's Section is refused", [put(other, 'section', 'Section B'), put(later, 'bullet', 'elsewhere'), { op: 'set_outline', items: [...base, at(other), at(later, other, bullet)] }]],
  ]
  for (const [why, operations] of refusals) {
    expectStatus(
      await owner.browser.json(url, 'POST', { action: 'document_transaction', mutation_id: randomUUID(), base_revision: settled.revision!, operations }),
      422,
      why,
    )
    const unmoved = await read(owner, folder)
    expect(unmoved.revision, `${why}: the page did not move`).toBe(settled.revision)
    expect(unmoved.items.map((item) => item.id)).toEqual(settled.items.map((item) => item.id))
  }
})

test('AC-462 a list may mix styles and nest under either of them', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'mixed list styles')
  const url = `/folders/${folder}/page/actions`
  const a = randomUUID(), b = randomUUID(), c = randomUUID(), d = randomUUID()
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [
        put(a, 'numbered', 'one'),
        put(b, 'checklist', 'under a number', false),
        put(c, 'bullet', 'under a tick'),
        put(d, 'numbered', 'under a bullet'),
        { op: 'set_outline', items: [at(a), at(b, null, a), at(c, null, b), at(d, null, c)] },
      ],
    }),
    200,
    'mixed styles nest normally',
  )
  const stored = await read(owner, folder)
  expect(stored.blocks.find((block) => block.id === b)?.list_parent_block_id).toBe(a)
  expect(stored.blocks.find((block) => block.id === c)?.list_parent_block_id).toBe(b)
  expect(stored.blocks.find((block) => block.id === d)?.list_parent_block_id).toBe(c)
  expect(stored.blocks.find((block) => block.id === d)?.kind).toBe('numbered')
})
