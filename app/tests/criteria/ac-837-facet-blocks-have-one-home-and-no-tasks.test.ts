/*
AC-837: a blank facet's blocks carry `facet_id` and never `folder_id`, the
Folder page holds none of them, no `tasks` row belongs to a facet by any
column, and the database refuses a block with two homes.

Issue #210 (M1-F), invariant 8 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.17 as amended 2026-09-21, 4.30, 7.27.

## The two halves, and why the second is a schema assertion

**A facet's blocks are the facet's.** A write to a facet that quietly landed on
the Folder page would be invisible on the facet's own read — the blocks would
come back — and visible only to somebody looking at Main, which is the worst
shape a defect can have. So the case reads both documents after one write.

**"No Task row ever belongs to a facet" has no behaviour to drive**, because
the absence *is* the rule: 4.30 says no column on `tasks` names a facet, and
that is #210's "not another Task database" written where it cannot be edited
out. It is asserted over `information_schema` rather than over a response,
because the day somebody adds `tasks.facet_id` every behavioural test in this
suite would still pass.

## `page_blocks_one_home_check`, in both directions

4.17's amended CHECK is `num_nonnulls(folder_id, shelf_id, facet_id) = 1`. The
interesting direction is **two homes**, not zero: the old two-column form was
`(folder_id IS NULL) <> (shelf_id IS NULL)`, and a widening that got the
arithmetic wrong would admit a block belonging to a facet *and* to the Folder
page — which would read correctly on both surfaces and be one row. Both
directions are driven, by name.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetPageOf,
  folderWithFacets,
  writeFacetParagraph,
} from '../support/facets-harness.js'
import { expectRejectedBy, rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac837')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe("AC-837 a facet's blocks are the facet's, and no Task is a facet's", () => {
  test('a block written to a facet carries facet_id, a null folder_id, and is absent from the Folder page', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-837 blocks')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    const blockId = crypto.randomUUID()
    const written = await writeFacetParagraph(
      owner,
      folderId,
      facet.id,
      blockId,
      'writing in the facet',
    )
    expectStatus(written, 200, "7.27: 7.16's transaction over a facet's document")

    const stored = await rows(
      app.db,
      sql`SELECT facet_id, folder_id, shelf_id, section_block_id,
                 list_parent_block_id, kind, text
            FROM page_blocks WHERE id = ${blockId}::uuid`,
    )
    expect(stored.length, 'the block was stored').toBe(1)
    const row = stored[0] as Record<string, unknown>
    expect(String(row.facet_id), "it is the facet's").toBe(facet.id)
    expect(
      [row.folder_id, row.shelf_id],
      "and neither of 4.17's older two homes: `page_blocks_one_home_check` admits exactly one",
    ).toEqual([null, null])
    expect(
      [row.section_block_id, row.list_parent_block_id],
      'a facet document has no Sections and nests no list items, which the two untouched CHECKs of 4.17 say by requiring a non-null `folder_id` for either',
    ).toEqual([null, null])
    expect(row.text, 'and the text arrived').toBe('writing in the facet')

    /* Both reads, because a write that landed on the Folder page would come
       back correctly on the facet's own read and would be visible on Main. */
    const facetPage = await facetPageOf(owner, folderId, facet.id)
    expect(
      facetPage.blocks.map((block) => block.id),
      "the facet's document holds it",
    ).toEqual([blockId])
    expect(
      facetPage.task_placements,
      'and carries no Task placements at all, which is the response half of "no Task belongs to a facet"',
    ).toEqual([])

    const folderPage = await owner.browser.api(`/folders/${folderId}/page`)
    expectStatus(folderPage, 200, 'GET /folders/:id/page (spec 7.16)')
    expect(
      (folderPage.json() as { blocks: { id: string }[] }).blocks.map(
        (block) => block.id,
      ),
      "and the Folder page holds none of it: a facet's document is not Main's",
    ).not.toContain(blockId)
  })

  test('the database refuses a block with two homes, and one with none', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-837 homes')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    /* **Two homes is the direction a wrong widening produces.** The old CHECK
       was a two-column exclusive-or; `num_nonnulls(...) = 1` is the three-column
       form, and an arithmetic slip here would admit a block that is both the
       facet's and the Folder page's -- one row reading correctly on two
       surfaces. */
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO page_blocks (facet_id, folder_id, kind, position, text)
              VALUES (${facet.id}::uuid, ${folderId}::uuid, 'paragraph', 0, 'two homes')`,
        ),
      'page_blocks_one_home_check',
    )
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO page_blocks (kind, position, text)
              VALUES ('paragraph', 0, 'no home')`,
        ),
      'page_blocks_one_home_check',
    )

    /* And the widening is a widening: a block with only the facet is admitted,
       which is the thing the re-added CHECK exists to allow. */
    await app.db.execute(
      sql`INSERT INTO page_blocks (facet_id, kind, position, text)
          VALUES (${facet.id}::uuid, 'paragraph', 0, 'one home')`,
    )
    const admitted = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE facet_id = ${facet.id}::uuid`,
    )
    expect(Number(admitted[0]?.n), 'the one-home row was stored').toBe(1)
  })

  test('no column on tasks names a facet', async () => {
    /* There is no behaviour to drive here, because the rule **is** the
       absence: #210's "not another Task database", written into the schema
       where it cannot be edited out. A behavioural test would still pass the
       day somebody adds `tasks.facet_id`, which is precisely why this reads
       the catalog. */
    const columns = await rows(
      app.db,
      sql`SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'tasks'`,
    )
    const names = columns.map((row) => String(row.column_name))
    expect(
      names.filter((name) => name.includes('facet')),
      '#210 core rule: a Work facet is another way into part of Main, not another Task database, and a blank facet holds no Task rows. No column on `tasks` may name a facet',
    ).toEqual([])

    const keys = await rows(
      app.db,
      sql`SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_class r ON r.oid = c.confrelid
           WHERE c.contype = 'f' AND t.relname = 'tasks'
             AND r.relname = 'folder_facets'`,
    )
    expect(
      keys.map((row) => String(row.conname)),
      'and no foreign key from `tasks` reaches `folder_facets` by any spelling',
    ).toEqual([])
  })
})
