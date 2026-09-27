/*
AC-1019: a sub-page and its `page` block travel together (wave 2, pages in
pages). The document transaction's `create_page` makes the sub-page -- parent
stored, its people its project's (step 8) -- and its block where the person typed it;
`trash_page` with the block's deletion moves the page (and the sub-pages that
went with it) to Trash; re-putting the same block (the editor's Undo) restores
the page in place. Outside the document, every writer keeps the home block:
the sidebar "+" appends one at the end of the parent's document, a move takes
it from the old parent's document to the end of the new one's (none at the
top level), the route DELETE removes it, and a restore appends it again.

Each step reads the stored rows as well as the page, because a block the read
shows and a folder row the transaction never wrote would both pass a read.

Spec: wave 2 plan (pages in pages), 4.17, 7.4, 7.13, 7.16.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus, seedMembership } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac1019')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const at = (id: string) => ({
  kind: 'block' as const,
  id,
  section_block_id: null,
  list_parent_block_id: null,
})

const paragraph = (id: string, text: string): DocumentOperation => ({
  op: 'put_block',
  id,
  block_kind: 'paragraph',
  text,
  rich_content: null,
  file_id: null,
  ref_folder_id: null,
  width_pct: null,
  checked: null,
})

const pageBlock = (id: string, ref: string): DocumentOperation => ({
  op: 'put_block',
  id,
  block_kind: 'page',
  text: null,
  rich_content: null,
  file_id: null,
  ref_folder_id: ref,
  width_pct: null,
  checked: null,
})

async function read(actor: Actor, folderId: string): Promise<PageView> {
  const response = await actor.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

async function transact(
  actor: Actor,
  folderId: string,
  operations: DocumentOperation[],
  why: string,
): Promise<PageView> {
  const base = await read(actor, folderId)
  const response = await actor.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base.revision,
    operations,
  })
  expectStatus(response, 200, why)
  return response.json() as PageView
}

async function subPage(actor: Actor, parentId: string, name: string): Promise<string> {
  const response = await actor.browser.json('/folders', 'POST', { name, parent_folder_id: parentId })
  expectStatus(response, 201, `sidebar sub-page ${name}`)
  return (response.json() as { id: string }).id
}

/** Where `folderId`'s home block is: [block id, document folder id], or none. */
async function homeOf(folderId: string): Promise<[string, string][]> {
  return (
    await rows(
      app.db,
      sql`SELECT id, folder_id FROM page_blocks
           WHERE kind = 'page' AND ref_folder_id = ${folderId}::uuid`,
    )
  ).map((row) => [String(row.id), String(row.folder_id)])
}

async function folderRow(id: string): Promise<Record<string, unknown> | undefined> {
  return (
    await rows(
      app.db,
      sql`SELECT name, parent_folder_id, deleted_at, trashed_with_folder_id
            FROM folders WHERE id = ${id}::uuid`,
    )
  )[0]
}

/** The last item of `folderId`'s document, as the page read orders it. */
async function lastItem(actor: Actor, folderId: string): Promise<string | undefined> {
  return (await read(actor, folderId)).items.at(-1)?.id
}

test('AC-1019 a page block and its sub-page are created, trashed, restored and moved together', async () => {
  const [owner, member] = await cast.of(app)
  if (owner === undefined || member === undefined) throw new Error('two actors')
  const parent = await createFolder(owner, 'ac1019 parent', 'doc')
  await seedMembership(app.db, parent, member.id, { access: 'can_edit' })

  // create_page: the folder row, the copied member, the block where it was typed.
  const intro = randomUUID()
  const outro = randomUUID()
  const child = randomUUID()
  const home = randomUUID()
  const written = await transact(
    owner,
    parent,
    [
      paragraph(intro, 'Before'),
      { op: 'create_page', id: child, block_id: home, title: 'Child page' },
      paragraph(outro, 'After'),
      { op: 'set_outline', items: [at(intro), at(home), at(outro)] },
    ],
    'create_page',
  )
  expect(written.items.map((item) => item.id)).toEqual([intro, home, outro])
  expect(written.blocks.find((block) => block.id === home)).toMatchObject({
    kind: 'page',
    ref_folder_id: child,
  })
  expect(await folderRow(child)).toMatchObject({
    name: 'Child page',
    parent_folder_id: parent,
    deleted_at: null,
  })
  // Step 8: its people are the project's; it stores none of its own.
  expect(await rows(app.db, sql`SELECT user_id FROM folder_members WHERE folder_id = ${child}::uuid`)).toEqual([])
  expect(await rows(app.db, sql`SELECT project_id FROM folders WHERE id = ${child}::uuid`)).toEqual([
    { project_id: (await rows(app.db, sql`SELECT project_id FROM folders WHERE id = ${parent}::uuid`))[0]?.project_id },
  ])
  expect((await member.browser.json(`/folders/${child}`, 'GET')).status).toBe(200)
  expect(await homeOf(child)).toEqual([[home, parent]])
  expect((await read(owner, parent)).items.map((item) => item.id)).toEqual([intro, home, outro])

  // A grandchild from the sidebar: its home block lands last in the child's document.
  const grandchild = await subPage(owner, child, 'Grandchild')
  const [grandHome] = await homeOf(grandchild)
  expect(grandHome?.[1]).toBe(child)
  expect(await lastItem(owner, child)).toBe(grandHome?.[0])

  // trash_page with the block's deletion: the page and its sub-page go to Trash.
  const trashed = await transact(
    owner,
    parent,
    [
      { op: 'trash_page', folder_id: child },
      { op: 'delete_block', id: home },
      { op: 'set_outline', items: [at(intro), at(outro)] },
    ],
    'trash_page',
  )
  expect(trashed.blocks.some((block) => block.id === home)).toBe(false)
  expect((await folderRow(child))?.deleted_at).not.toBeNull()
  expect((await folderRow(child))?.trashed_with_folder_id).toBeNull()
  expect(await folderRow(grandchild)).toMatchObject({ trashed_with_folder_id: child })
  expect(await homeOf(child)).toEqual([])
  // The grandchild keeps its block, inside the trashed document.
  expect(await homeOf(grandchild)).toEqual([grandHome])

  // Undo: the same block put back restores the page (and its set) in place.
  const restored = await transact(
    owner,
    parent,
    [pageBlock(home, child), { op: 'set_outline', items: [at(intro), at(home), at(outro)] }],
    'undo re-puts the page block',
  )
  expect(restored.items.map((item) => item.id)).toEqual([intro, home, outro])
  expect(await folderRow(child)).toMatchObject({ deleted_at: null, trashed_with_folder_id: null })
  expect(await folderRow(grandchild)).toMatchObject({ deleted_at: null, trashed_with_folder_id: null })
  expect(await homeOf(child)).toEqual([[home, parent]])

  // The sidebar "+": appended at the end of the parent's document.
  const sidebar = await subPage(owner, parent, 'From the sidebar')
  const [sidebarHome] = await homeOf(sidebar)
  expect(sidebarHome?.[1]).toBe(parent)
  expect(await lastItem(owner, parent)).toBe(sidebarHome?.[0])

  // A move takes the block from the old parent's document to the new one's end.
  expectStatus(
    await owner.browser.json(`/folders/${sidebar}/location`, 'PATCH', { parent_folder_id: child }),
    200,
    'move under the child',
  )
  const [movedHome] = await homeOf(sidebar)
  expect(movedHome?.[1]).toBe(child)
  expect(await lastItem(owner, child)).toBe(movedHome?.[0])
  expect((await read(owner, parent)).items.map((item) => item.id)).toEqual([intro, home, outro])
  // A reorder under the same parent keeps the block where it is.
  expectStatus(
    await owner.browser.json(`/folders/${sidebar}/location`, 'PATCH', {
      parent_folder_id: child,
      after_id: null,
    }),
    200,
    'reorder under the same parent',
  )
  expect(await homeOf(sidebar)).toEqual([movedHome])
  // The top level has no document to hold one.
  expectStatus(
    await owner.browser.json(`/folders/${sidebar}/location`, 'PATCH', { parent_folder_id: null }),
    200,
    'move to the top level',
  )
  expect(await homeOf(sidebar)).toEqual([])

  // The route DELETE removes the block; a restore appends it again at the end.
  expectStatus(await owner.browser.json(`/folders/${grandchild}`, 'DELETE'), 200, 'trash the grandchild')
  expect(await homeOf(grandchild)).toEqual([])
  expectStatus(
    await owner.browser.json(`/folders/${grandchild}/restore`, 'POST'),
    200,
    'restore the grandchild',
  )
  const [restoredHome] = await homeOf(grandchild)
  expect(restoredHome?.[1]).toBe(child)
  expect(await lastItem(owner, child)).toBe(restoredHome?.[0])

  // Duplicating a page copies the page alone: its sub-pages keep one home.
  const duplicate = await owner.browser.json(`/folders/${child}/duplicate`, 'POST', {})
  expectStatus(duplicate, 201, 'duplicate a page with a sub-page')
  const copy = await read(owner, (duplicate.json() as { id: string }).id)
  expect(copy.blocks.some((block) => block.kind === 'page')).toBe(false)
  expect(await homeOf(grandchild)).toEqual([restoredHome])

  // The export (version 8) carries the block naming the page it exports.
  const exported = await owner.browser.json('/me/export', 'GET')
  expectStatus(exported, 200, 'account export')
  const data = exported.json() as {
    folders: { id: string; blocks: { id: string; kind: string; ref_folder_id: string | null; toggleable: boolean | null }[] }[]
  }
  expect(
    data.folders.find((folder) => folder.id === parent)?.blocks.find((block) => block.id === home),
  ).toMatchObject({ kind: 'page', ref_folder_id: child, toggleable: null })
})
