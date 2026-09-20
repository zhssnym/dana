/*
AC-463: given a folder page holding a nested list inside a Section, when the
folder is duplicated, exported with the account, or written to and read back
from a modern workflow file, then every structured block keeps its kind, its
inline formatting, its checklist state and both of its parents; and removing a
list parent promotes the writing under it rather than destroying it.

Issue #219, R1 decision 7. The transfers are where structure is lost in
practice, because each of the three re-creates every block under a new
identity: duplication and workflow import both remap ids, so a relation that
was remapped through the wrong map, or not remapped at all, reads as a
flattened list rather than as an error. That is why each case asserts the
*new* parent id rather than only that some parent is present.

Legacy formats are deliberately outside this: R1 decision 7 keeps the version 1
workflow file backward-compatible and does not require it to gain the
structured vocabulary, and the last case pins that it still round-trips.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import type { DocumentBlockKind, DocumentOperation, DocumentOutlineItem, PageView } from '../../src/shared/pages.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac463')
beforeAll(async () => { app = await startAuthTestApp() }, 60000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

const put = (id: string, kind: DocumentBlockKind, text: string, checked: boolean | null = null, rich = false): DocumentOperation => ({
  op: 'put_block', id, block_kind: kind, text,
  rich_content: rich ? { version: 1, runs: [{ text, bold: true }] } : null,
  file_id: null, ref_folder_id: null, width_pct: null, checked,
})
const at = (id: string, section: string | null = null, listParent: string | null = null): DocumentOutlineItem =>
  ({ kind: 'block', id, section_block_id: section, list_parent_block_id: listParent })

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

/** Section A / bullet A / numbered B / checklist C [checked], the structure the
 * issue body draws, written into a fresh folder. */
async function seedList(owner: Actor, name: string) {
  const folder = await createFolder(owner, name)
  const section = randomUUID(), bullet = randomUUID(), numbered = randomUUID(), checklist = randomUUID()
  const blocks = [
    put(section, 'section', 'Section A'),
    put(bullet, 'bullet', 'bullet A', null, true),
    put(numbered, 'numbered', 'numbered B'),
    put(checklist, 'checklist', 'checklist C', true),
  ]
  const outline = [at(section), at(bullet, section), at(numbered, section, bullet), at(checklist, section, numbered)]
  const initial = await read(owner, folder)
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!,
      operations: [...blocks, { op: 'set_outline', items: outline }],
    }),
    200,
    'seeded list',
  )
  return { folder, section, bullet, numbered, checklist, blocks, outline }
}

/** The four blocks of `seedList` as they read back, found by their text so the
 * same assertion works on an original and on a copy with fresh identities. */
function expectSeededShape(page: PageView, why: string): void {
  const by = (text: string) => page.blocks.find((block) => block.text === text)
  const section = by('Section A'), bullet = by('bullet A'), numbered = by('numbered B'), checklist = by('checklist C')
  expect(section?.kind, `${why}: Section`).toBe('section')
  expect(bullet?.kind, `${why}: bullet kind`).toBe('bullet')
  expect(numbered?.kind, `${why}: numbered kind`).toBe('numbered')
  expect(checklist?.kind, `${why}: checklist kind`).toBe('checklist')
  expect(bullet?.rich_content?.runs[0]?.bold, `${why}: inline formatting`).toBe(true)
  expect(checklist?.checked, `${why}: the tick`).toBe(true)
  // Work grouping: all three list items are in the Section.
  expect(bullet?.section_block_id, `${why}: bullet Section`).toBe(section?.id)
  expect(numbered?.section_block_id, `${why}: numbered Section`).toBe(section?.id)
  expect(checklist?.section_block_id, `${why}: checklist Section`).toBe(section?.id)
  // Writing structure: only the nested items carry a list parent.
  expect(bullet?.list_parent_block_id, `${why}: bullet is not nested`).toBeNull()
  expect(numbered?.list_parent_block_id, `${why}: numbered nests under the bullet`).toBe(bullet?.id)
  expect(checklist?.list_parent_block_id, `${why}: checklist nests under the number`).toBe(numbered?.id)
}

test('AC-463 folder duplication remaps both parents onto the copy', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const seeded = await seedList(owner, 'duplicate me')
  const duplicate = await owner.browser.json(`/folders/${seeded.folder}/duplicate`, 'POST', {})
  expectStatus(duplicate, 201, 'duplicate')
  const copy = await read(owner, (duplicate.json() as { id: string }).id)
  expectSeededShape(copy, 'the duplicate')
  // Fresh identities throughout, which is what makes the remap load-bearing.
  for (const id of [seeded.section, seeded.bullet, seeded.numbered, seeded.checklist]) {
    expect(copy.blocks.some((block) => block.id === id)).toBe(false)
  }
  // And the original is untouched by its own duplication.
  expectSeededShape(await read(owner, seeded.folder), 'the original')
})

test('AC-463 the account export carries the exact structured state', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const seeded = await seedList(owner, 'export me')
  const exported = await owner.browser.json('/me/export', 'GET')
  expectStatus(exported, 200, 'account export')
  const data = exported.json() as { folders: { id: string; blocks: Record<string, unknown>[] }[] }
  const blocks = data.folders.find((folder) => folder.id === seeded.folder)?.blocks ?? []
  const by = (id: string) => blocks.find((block) => block.id === id)
  expect(by(seeded.bullet)?.kind).toBe('bullet')
  expect(by(seeded.numbered)?.kind).toBe('numbered')
  expect(by(seeded.checklist)?.kind).toBe('checklist')
  expect(by(seeded.checklist)?.checked).toBe(true)
  expect(by(seeded.bullet)?.checked ?? null).toBeNull()
  expect(by(seeded.numbered)?.list_parent_block_id).toBe(seeded.bullet)
  expect(by(seeded.checklist)?.list_parent_block_id).toBe(seeded.numbered)
  expect(by(seeded.bullet)?.list_parent_block_id ?? null).toBeNull()
  expect(by(seeded.checklist)?.section_block_id).toBe(seeded.section)
})

test('AC-463 a modern workflow file round-trips the nested list under fresh identities', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const seeded = await seedList(owner, 'workflow me')
  const imported = await owner.browser.json('/workflows/import', 'POST', {
    dana: 'workflow', version: 2,
    folders: [{ name: 'Imported list', tasks: [], document: { blocks: seeded.blocks, outline: seeded.outline, task_ids: [] } }],
  })
  expectStatus(imported, 201, 'version 2 workflow import')
  const page = await read(owner, (imported.json() as { folders: { id: string }[] }).folders[0]!.id)
  expectSeededShape(page, 'the imported folder')
  for (const id of [seeded.section, seeded.bullet, seeded.numbered, seeded.checklist]) {
    expect(page.blocks.some((block) => block.id === id)).toBe(false)
  }
})

test('AC-463 a version 1 workflow file is unchanged by the structured vocabulary', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const imported = await owner.browser.json('/workflows/import', 'POST', {
    dana: 'workflow', version: 1,
    folders: [{ name: 'Legacy import', blocks: [{ kind: 'section', text: 'Old heading' }, { kind: 'paragraph', text: 'Old prose' }] }],
  })
  expectStatus(imported, 201, 'version 1 workflow import')
  const page = await read(owner, (imported.json() as { folders: { id: string }[] }).folders[0]!.id)
  expect(page.blocks.map((block) => block.kind)).toEqual(['section', 'paragraph'])
  expect(page.blocks.every((block) => block.list_parent_block_id === null)).toBe(true)
  expect(page.blocks.every((block) => block.checked === null)).toBe(true)
})

test('AC-463 removing a list parent promotes the writing under it', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const seeded = await seedList(owner, 'remove the parent')
  const before = await read(owner, seeded.folder)
  expectStatus(
    await owner.browser.json(`/folders/${seeded.folder}/page/actions`, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: before.revision!,
      operations: [
        { op: 'delete_block', id: seeded.numbered },
        { op: 'set_outline', items: [at(seeded.section), at(seeded.bullet, seeded.section), at(seeded.checklist, seeded.section, seeded.bullet)] },
      ],
    }),
    200,
    'the middle list item is removed',
  )
  const after = await read(owner, seeded.folder)
  expect(after.blocks.some((block) => block.id === seeded.numbered)).toBe(false)
  const checklist = after.blocks.find((block) => block.id === seeded.checklist)
  expect(checklist?.kind).toBe('checklist')
  expect(checklist?.checked).toBe(true)
  expect(checklist?.list_parent_block_id).toBe(seeded.bullet)
  expect(checklist?.section_block_id).toBe(seeded.section)

  /* And the database says the same thing on its own, which is the half no
     request can show: `page_blocks_list_parent_block_id_fkey` is ON DELETE SET
     NULL, so a parent row that goes away leaves the child standing with no
     list parent rather than taking it along. Read directly, because the only
     way to delete a block without also rewriting the outline is to do it
     underneath the application. */
  await app.db.execute(sql`DELETE FROM page_blocks WHERE id = ${seeded.bullet}::uuid`)
  const orphan = await rows(app.db, sql`SELECT kind, checked, list_parent_block_id FROM page_blocks WHERE id = ${seeded.checklist}::uuid`)
  expect(orphan).toHaveLength(1)
  expect(orphan[0]?.kind).toBe('checklist')
  expect(orphan[0]?.checked).toBe(true)
  expect(orphan[0]?.list_parent_block_id ?? null).toBeNull()
})
