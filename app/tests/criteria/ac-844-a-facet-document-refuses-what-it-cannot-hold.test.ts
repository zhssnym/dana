/*
AC-844: a facet document refuses `create_task`, a semantic `section`
block and a `folder_ref` block, each 422 naming its field and each writing
nothing; ordinary authored writing, including nested lists, commits.

Issue #210 (M1-F), invariant 15 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756, amended by
#211 on Hassan's 2026-09-23 ruling:
https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721.
Spec 7.27, 7.16, 4.17.

## Three operational refusals; nested lists are now authored structure

`create_task`, semantic `section` and `folder_ref` remain the three
refusals from #210. #211 deliberately supersedes #210's temporary
implementation-time nested-list refusal: migration 0028 widens
`page_blocks_list_parent_kind_check` for facet-homed list rows and the facet
transaction now proves that the parent is an earlier list item in the same
document. This criterion moves with that accepted decision rather than keeping
the old limitation green.

## "Writes nothing" is the assertion that matters

Every one of the three refused transactions below also carries a perfectly ordinary
paragraph. A handler that refused the offending operation and committed the
rest would answer 422 and leave the document changed, which is the worst
available outcome: the caller believes nothing happened. So each case reads the
document back and asserts it is byte-for-byte what it was, revision token
included.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetPageOf,
  postFacetPageAction,
  sharedFolder,
  writeFacetParagraph,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'
import { sql } from 'drizzle-orm'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac844')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const paragraph = (id: string, text: string) => ({
  op: 'put_block' as const,
  id,
  block_kind: 'paragraph' as const,
  text,
  rich_content: null,
  file_id: null,
  ref_folder_id: null,
  width_pct: null,
  checked: null,
})

const item = (id: string, listParent: string | null = null) => ({
  kind: 'block' as const,
  id,
  section_block_id: null,
  list_parent_block_id: listParent,
})

describe('AC-844 a facet document refuses what a facet cannot hold', () => {
  test('the three operational refusals, each 422 naming its field and each writing nothing', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-844 refusals')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    const existing = crypto.randomUUID()
    expectStatus(
      await writeFacetParagraph(owner, folderId, facet.id, existing, 'already here'),
      200,
      'a facet document takes ordinary writing',
    )
    const before = await facetPageOf(owner, folderId, facet.id)

    /* Every offending transaction also carries a perfectly ordinary
       paragraph, so a handler that refused the bad operation and committed the
       rest would be caught: it would answer 422 and change the document. */
    const innocent = crypto.randomUUID()

    const attempts: [string, string, unknown][] = [
      [
        'create_task',
        'a facet holds no Tasks',
        {
          operations: [
            paragraph(innocent, 'and this should not land'),
            { op: 'create_task', id: crypto.randomUUID(), title: 'Not here' },
            { op: 'set_outline', items: [item(existing), item(innocent)] },
          ],
        },
      ],
      [
        'a section block',
        'a facet document has no Sections',
        {
          operations: [
            paragraph(innocent, 'and this should not land'),
            {
              op: 'put_block',
              id: crypto.randomUUID(),
              block_kind: 'section',
              text: 'A heading',
              rich_content: null,
              file_id: null,
              ref_folder_id: null,
              width_pct: null,
              checked: null,
            },
            { op: 'set_outline', items: [item(existing), item(innocent)] },
          ],
        },
      ],
      [
        'a folder_ref block',
        'a folder reference belongs on the Folder page',
        {
          operations: [
            paragraph(innocent, 'and this should not land'),
            {
              op: 'put_block',
              id: crypto.randomUUID(),
              block_kind: 'folder_ref',
              text: null,
              rich_content: null,
              file_id: null,
              ref_folder_id: folderId,
              width_pct: null,
              checked: null,
            },
            { op: 'set_outline', items: [item(existing), item(innocent)] },
          ],
        },
      ],
    ]

    for (const [what, why, shape] of attempts) {
      const body = shape as { operations: unknown[] }

      const refused = await postFacetPageAction(owner, folderId, facet.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: before.revision,
        ...body,
      })
      expectStatus(refused, 422, `7.27: ${what} is refused because ${why}`)
      expect(
        JSON.stringify(refused.json()),
        `and the refusal names a field, so a client can say which operation it was (7.0)`,
      ).toMatch(/operations|list_parent_block_id/)

      const after = await facetPageOf(owner, folderId, facet.id)
      expect(
        after.blocks.map((block) => [block.id, block.text]),
        `and ${what} wrote nothing: every refusal precedes the first write, so the innocent paragraph in the same transaction did not land either`,
      ).toEqual(before.blocks.map((block) => [block.id, block.text]))
      expect(
        after.revision,
        'the revision token is unmoved, which is the same statement said in one value',
      ).toBe(before.revision)
    }

    expect(
      await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ).then((found) => Number(found[0]?.n)),
      'and no Task was created in the Folder by any of them',
    ).toBe(0)
  })

  test('the same transaction with those removed commits, and the blocks are the facet\'s', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-844 commits')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const page = await facetPageOf(owner, folderId, facet.id)

    /* The positive half, and it is what makes the three refusals refusals
       rather than a route that rejects everything. Every kind here is authored
       writing; #211 additionally nests the second list item under the first. */
    const ids = {
      para: crypto.randomUUID(),
      bulletA: crypto.randomUUID(),
      bulletB: crypto.randomUUID(),
      check: crypto.randomUUID(),
      quote: crypto.randomUUID(),
      callout: crypto.randomUUID(),
      code: crypto.randomUUID(),
    }
    const block = (id: string, kind: string, text: string, checked: boolean | null = null) => ({
      op: 'put_block' as const,
      id,
      block_kind: kind,
      text,
      rich_content: null,
      file_id: null,
      ref_folder_id: null,
      width_pct: null,
      checked,
    })

    const committed = await postFacetPageAction(owner, folderId, facet.id, {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        block(ids.para, 'paragraph', 'writing'),
        block(ids.bulletA, 'bullet', 'first'),
        block(ids.bulletB, 'bullet', 'second'),
        block(ids.check, 'checklist', 'ticked', true),
        block(ids.quote, 'quote', 'quoted'),
        block(ids.callout, 'callout', 'called out'),
        block(ids.code, 'code', 'const x = 1'),
        {
          op: 'set_outline',
          items: Object.values(ids).map((id) =>
            item(id, id === ids.bulletB ? ids.bulletA : null),
          ),
        },
      ],
    })
    expectStatus(
      committed,
      200,
      "7.27: 7.16's contract is unchanged for everything a facet can hold",
    )

    const after = await facetPageOf(owner, folderId, facet.id)
    expect(
      after.blocks.map((b) => b.kind),
      'every kind arrived, in the order the outline gave',
    ).toEqual([
      'paragraph',
      'bullet',
      'bullet',
      'checklist',
      'quote',
      'callout',
      'code',
    ])
    expect(
      after.task_placements,
      'and the document carries no Task placements, because a facet holds no Tasks',
    ).toEqual([])

    const stored = await rows(
      app.db,
      sql`SELECT facet_id, folder_id, list_parent_block_id, section_block_id, checked
            FROM page_blocks WHERE facet_id = ${facet.id}::uuid ORDER BY position`,
    )
    expect(stored.length, 'seven rows were stored').toBe(7)
    for (const row of stored) {
      expect(String(row.facet_id), "every one is the facet's").toBe(facet.id)
      expect(row.folder_id, 'and none is the Folder page\'s').toBeNull()
      expect(
        row.section_block_id,
        'facet-authored structure never becomes Main Work Section membership',
      ).toBeNull()
    }
    expect(
      stored.map((row) =>
        row.list_parent_block_id === null
          ? null
          : String(row.list_parent_block_id),
      ),
      '#211 persists list ancestry inside the facet and nowhere else',
    ).toEqual([null, null, ids.bulletA, null, null, null, null])
    expect(
      stored.map((row) => row.checked),
      'the tick travelled on the checklist item and on nothing else, which is 4.17\'s own rule unchanged',
    ).toEqual([null, null, null, true, null, null, null])
  })

  test('a stale base_revision is 409 and not a 422, because it is state', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-844 stale')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const page = await facetPageOf(owner, folderId, facet.id)
    await writeFacetParagraph(owner, folderId, facet.id, crypto.randomUUID(), 'first')

    const stale = await postFacetPageAction(owner, folderId, facet.id, {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        paragraph(crypto.randomUUID(), 'from an old draft'),
        { op: 'set_outline', items: [] },
      ],
    })
    expectStatus(
      stale,
      409,
      "7.16's own answer for a lost last-write-wins race, unchanged by 7.27",
    )
    expect(
      (await facetPageOf(owner, folderId, facet.id)).blocks.map((b) => b.text),
      'and the winner of the race is still what the document holds',
    ).toEqual(['first'])
  })
})
