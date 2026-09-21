/*
AC-836: deleting a Work facet through its own route changes no block, no Task
and no Section.

Issue #210 (M1-F), invariant 7 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.27, 4.17.

## The direction this asserts, and why it is not AC-835 twice

AC-835 goes one way: deleting the **H1** destroys its facet. This goes the
other: deleting the **facet** touches the H1 and everything under it not at
all. The two are independent — a cascade in the wrong direction, or an
over-eager handler that tidied up "the facet's content", would pass one and
fail the other — and #210 names both in its Delete/restore section as separate
sentences.

## What is measured

The whole Folder page before and after, block for block and Task for Task,
rather than a spot check on the heading. A handler that removed the section's
*contents* while leaving the heading would pass "the heading is still there",
and that is exactly the mistake the rule exists to prevent: a Work facet is a
way into part of Main, and what it shows belongs to Main.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  deleteFacet,
  facetRow,
  facetsOf,
  folderWithFacets,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac836')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface PageShape {
  revision: string
  blocks: { id: string; kind: string; text: string | null }[]
  items: { kind: string; id: string }[]
  task_placements: { id: string; section_block_id: string | null }[]
}

async function pageOf(actor: Actor, folderId: string): Promise<PageShape> {
  const read = await actor.browser.api(`/folders/${folderId}/page`)
  expectStatus(read, 200, 'GET /folders/:id/page (spec 7.16)')
  return read.json() as PageShape
}

describe('AC-836 deleting a Work facet leaves Main exactly as it was', () => {
  test('the heading, the writing under it, the Section membership and the Tasks all survive', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-836 delete')
    const heading = await writeFolderHeading(owner, folderId, 'The section')

    /* A paragraph and a Task, both inside the Section, so that the case reads
       the section's *contents* rather than only its heading. A handler that
       tidied up "the facet's content" on delete would leave the heading and
       take these. */
    const paragraph = crypto.randomUUID()
    const page = await pageOf(owner, folderId)
    const created = await owner.browser.json('/tasks', 'POST', {
      folder_id: folderId,
      title: 'AC-836 work in the section',
    })
    expectStatus(created, 201, '7.6: a Task in the Folder')
    const taskId = String((created.json() as { id: string }).id)

    const withContent = await owner.browser.json(
      `/folders/${folderId}/page/actions`,
      'POST',
      {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: (await pageOf(owner, folderId)).revision,
        operations: [
          {
            op: 'put_block',
            id: paragraph,
            block_kind: 'paragraph',
            text: 'writing under the heading',
            rich_content: null,
            file_id: null,
            ref_folder_id: null,
            width_pct: null,
            checked: null,
          },
          {
            op: 'set_outline',
            items: [
              ...page.items
                .filter((item) => item.id !== heading)
                .map((item) => ({
                  kind: item.kind,
                  id: item.id,
                  section_block_id: null,
                  list_parent_block_id: null,
                })),
              {
                kind: 'block',
                id: heading,
                section_block_id: null,
                list_parent_block_id: null,
              },
              {
                kind: 'block',
                id: paragraph,
                section_block_id: heading,
                list_parent_block_id: null,
              },
              { kind: 'task', id: taskId, section_block_id: heading, list_parent_block_id: null },
            ],
          },
        ],
      },
    )
    expectStatus(withContent, 200, '7.16: the page carries a Section with content in it')

    const facet = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    const before = await pageOf(owner, folderId)

    const deleted = await deleteFacet(owner, folderId, facet.id)
    expectStatus(
      deleted,
      204,
      '7.27: deleting a custom facet stamps `deleted_at` and nothing else',
    )

    const after = await pageOf(owner, folderId)
    expect(
      after.blocks.map((block) => [block.id, block.kind, block.text]),
      "#210: deleting a Work facet removes the facet but does not delete its H1 section or Tasks from Main",
    ).toEqual(before.blocks.map((block) => [block.id, block.kind, block.text]))
    expect(
      after.items,
      'the page order is the same order, block for block and Task for Task',
    ).toEqual(before.items)
    expect(
      after.task_placements,
      "and every Task is still in the Section it was in, which is the half a spot check on the heading would have missed",
    ).toEqual(before.task_placements)
    expect(
      after.revision,
      "7.16's revision is a hash of the document, so an unchanged document is an unchanged token: nothing about the page moved at all",
    ).toBe(before.revision)

    const sections = await rows(
      app.db,
      sql`SELECT id FROM page_blocks
           WHERE folder_id = ${folderId}::uuid AND kind = 'section'`,
    )
    expect(
      sections.map((row) => String(row.id)),
      'the Section itself is still a Section of this Folder',
    ).toEqual([heading])

    const live = await rows(
      app.db,
      sql`SELECT id FROM tasks
           WHERE folder_id = ${folderId}::uuid AND deleted_at IS NULL`,
    )
    expect(
      live.map((row) => String(row.id)),
      'and the Task is neither deleted nor trashed',
    ).toEqual([taskId])
  })

  test('the facet went to Trash rather than being destroyed, which is the other direction from AC-835', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-836 trash')
    const heading = await writeFolderHeading(owner, folderId, 'Still here')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    await deleteFacet(owner, folderId, facet.id)

    expect(
      (await facetsOf(owner, folderId)).some((each) => each.id === facet.id),
      'it has left the listing',
    ).toBe(false)
    const row = await facetRow(app.db, facet.id)
    expect(
      row?.deleted_at,
      '**and the row is still there with a `deleted_at`**, which is what makes it restorable -- the destroy is the H1 deleting it, never this route',
    ).not.toBeNull()
    expect(
      String(row?.h1_block_id),
      'it still points at its heading, so a restore knows what it was a view of',
    ).toBe(heading)
  })
})
