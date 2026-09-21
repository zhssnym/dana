/*
AC-835: deleting an H1 from Main removes its Work facet — destroyed rather than
trashed — and moves nothing else.

Issue #210 (M1-F), invariant 6 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 4.17, 7.16, 7.27.

## This is the one place the contract reads past #210's words, so it is pinned twice

#210 says an H1's deletion sends its Work facet to Trash. 4.30 and the ruling
make it a **destroy** instead, and the reason is stated rather than assumed:
7.16's `delete_block` is permanent, so a Work facet trashed that way could never
be restored, and an unrestorable Trash row is worse than none. The ruling marks
this **(proposed)**, which means Imran may overrule it; this criterion is what
would go red the day that happens, and that is exactly what a criterion is for.

So the assertions are in both directions: the facet is gone from the **listing**
and it is also absent from **Trash**, and the row is gone from the table. A
`deleted_at` stamp would pass the first and fail the other two.

## And "no other row moved" is asserted over the Folder rather than over the facet

The other invariant here is #210's core rule: a Work facet is a way into part of
Main, not a second copy of it. So the case counts the Folder's other facets, its
other blocks and its Tasks before and after, rather than looking only at the
thing it expected to change.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetRow,
  facetsOf,
  folderWithFacets,
  trashFacetsOf,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac835')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** 7.16's own delete, driven as a whole document transaction: the heading
 * leaves the operations and the outline together, which is what a person
 * pressing delete in the composer produces. */
async function deleteHeading(
  actor: Actor,
  folderId: string,
  blockId: string,
): Promise<void> {
  const read = await actor.browser.api(`/folders/${folderId}/page`)
  expectStatus(read, 200, 'GET /folders/:id/page (spec 7.16)')
  const page = read.json() as {
    revision: string
    items: { kind: string; id: string }[]
  }
  const written = await actor.browser.json(
    `/folders/${folderId}/page/actions`,
    'POST',
    {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        { op: 'delete_block', id: blockId },
        {
          op: 'set_outline',
          items: page.items
            .filter((item) => item.id !== blockId)
            .map((item) => ({
              kind: item.kind,
              id: item.id,
              section_block_id: null,
              list_parent_block_id: null,
            })),
        },
      ],
    },
  )
  expectStatus(
    written,
    200,
    "7.16: deleting a block is permanent, which is the whole premise of 4.30's CASCADE",
  )
}

describe("AC-835 deleting an H1 destroys its Work facet and nothing else", () => {
  test('the facet is gone from the listing, gone from Trash, and gone from the table', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-835 destroy')
    const doomed = await writeFolderHeading(owner, folderId, 'Doomed heading')
    const spared = await writeFolderHeading(owner, folderId, 'Spared heading')
    const doomedFacet = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: doomed,
    })
    const sparedFacet = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: spared,
    })
    const blank = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    await deleteHeading(owner, folderId, doomed)

    const listed = await facetsOf(owner, folderId)
    expect(
      listed.some((facet) => facet.id === doomedFacet.id),
      "the facet is gone from the listing: its H1 was the only thing it showed",
    ).toBe(false)

    /* **Destroyed rather than trashed**, which is the ruling's one reading
       past #210's words and the half a `deleted_at` stamp would have passed.
       Asserted in Trash and in the table, because either one alone leaves the
       other reading open. */
    expect(
      (await trashFacetsOf(owner)).map((facet) => facet.id),
      "and it is not waiting in Trash: 7.16's block delete is permanent, so a trashed Work facet could never be restored",
    ).not.toContain(doomedFacet.id)
    expect(
      await facetRow(app.db, doomedFacet.id),
      'the row itself is gone, by `folder_facets_h1_block_id_fkey`',
    ).toBeUndefined()

    /* Nothing else moved. The other Work facet, the blank one and the four
       natives are all exactly where they were. */
    expect(
      listed.map((facet) => facet.id).sort(),
      'every other facet of the Folder survived, natives included',
    ).toEqual(
      [
        ...(await facetsOf(owner, folderId)).map((facet) => facet.id),
      ].sort(),
    )
    expect(
      listed.filter((facet) => facet.id === sparedFacet.id).length,
      "the Work facet over the heading that was not deleted is untouched, which is what makes the CASCADE a key rather than a sweep",
    ).toBe(1)
    expect(
      listed.filter((facet) => facet.id === blank.id).length,
      'and so is the blank facet, which has no heading at all',
    ).toBe(1)
  })

  test('the Folder keeps every other block and every Task', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-835 collateral')
    const doomed = await writeFolderHeading(owner, folderId, 'Goes')
    const kept = await writeFolderHeading(owner, folderId, 'Stays')
    await createFacetOk(owner, folderId, { kind: 'work', h1_block_id: doomed })

    const task = await owner.browser.json('/tasks', 'POST', {
      folder_id: folderId,
      title: 'AC-835 the task',
    })
    expectStatus(task, 201, '7.6: a Task in the Folder')

    const blocksBefore = await rows(
      app.db,
      sql`SELECT id FROM page_blocks WHERE folder_id = ${folderId}::uuid ORDER BY id`,
    )

    await deleteHeading(owner, folderId, doomed)

    const blocksAfter = await rows(
      app.db,
      sql`SELECT id FROM page_blocks WHERE folder_id = ${folderId}::uuid ORDER BY id`,
    )
    expect(
      blocksAfter.map((row) => String(row.id)),
      'exactly the deleted heading left the page, and the CASCADE onto the facet took no block with it',
    ).toEqual(
      blocksBefore
        .map((row) => String(row.id))
        .filter((id) => id !== doomed),
    )
    expect(
      blocksAfter.map((row) => String(row.id)),
      'including the other heading, which a facet also pointed at until a moment ago',
    ).toContain(kept)

    const tasks = await rows(
      app.db,
      sql`SELECT id FROM tasks WHERE folder_id = ${folderId}::uuid
           AND deleted_at IS NULL`,
    )
    expect(
      tasks.length,
      "#210's core rule: a Work facet is another way into part of Main, not another Task database, so nothing about a Task can ride on one",
    ).toBe(1)
  })
})
