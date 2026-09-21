/*
AC-845: a facet document transaction reaches no `page_blocks` row that is not
that facet's, whoever sends it and whatever shape the operations take.

Issue #210 (M1-F). **Written from the adversarial review of
`backend/210-folder-facets` at 16ce81b, which found the defect this pins**, and
under the ruling at
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756 as amended by
https://github.com/zhssnym/dana/issues/210#issuecomment-5757696835.
Spec 7.27, 7.16, 4.17, 10.2.

## The defect, because a criterion that does not say what it caught is a
## criterion nobody will understand in six months

`applyFacetDocument` merged the operations into a set seeded from the facet's
own blocks, then derived its deletions from a `deletes` set accumulated **in
the operation loop** and issued `DELETE FROM page_blocks WHERE id = $1` with no
`facet_id` clause. A `put_block` for a foreign id added it to the merged set;
the `delete_block` that followed removed it again, which took it back out of
the collision check — that check read the merged set, and the id was no longer
in it — and put it into `deletes`. The write pass then deleted it.

So **any block in Dana could be deleted by anyone with its id, through a
private facet in their own Desk**, with no membership of the folder it lived
in and no authority over it. The second probe below is the one that matters:
the actor is a member of the victim folder holding Can view, is correctly
refused 403 on that folder's own page, and reached the same rows anyway by a
different door.

## What this file drives

The review's two probes exactly, one per actor:

1. a **non-member** of the victim folder, and
2. a **Can-view member** of it, whose 403 on `/folders/:id/page/actions` is
   asserted first so the refusal they bypassed is on the record,

each sending `[put_block(victimId), delete_block(victimId), set_outline(…)]` to
a private facet in their own default folder. Both must be **422**, and
afterwards the victim's block must be **byte-identical** — id, kind, text,
`folder_id`, `facet_id`, `updated_at` — and the Work facet that hangs off it
must still be there, because `folder_facets_h1_block_id_fkey` cascades and a
deleted heading would have taken it.

The last case is the same argument from the other end: the attacker's own facet
is unchanged too, which is what says the refusal happened **before the first
write** rather than half way through.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  defaultFolderOf,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetPageOf,
  facetsOf,
  postFacetPageAction,
  sharedFolder,
  writeFacetParagraph,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['victim', 'stranger', 'viewer'], 'ac845')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** Every column of one block that a write could move, read from the table
 * rather than from any response: the claim is that nothing happened to it. */
async function blockRow(
  app: AuthTestApp,
  blockId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rows(
    app.db,
    sql`SELECT id, kind, text, folder_id, shelf_id, facet_id, section_block_id,
               page_position, updated_at
          FROM page_blocks WHERE id = ${blockId}::uuid`,
  )
  return found[0]
}

/** The review's payload, verbatim in shape: claim the foreign id with a
 * `put_block`, then delete it in the same transaction. */
function theAttack(baseRevision: string, victimId: string, keep: string[]) {
  return {
    action: 'document_transaction',
    mutation_id: crypto.randomUUID(),
    base_revision: baseRevision,
    operations: [
      {
        op: 'put_block',
        id: victimId,
        block_kind: 'paragraph',
        text: 'mine now',
        rich_content: null,
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      { op: 'delete_block', id: victimId },
      {
        op: 'set_outline',
        items: keep.map((id) => ({
          kind: 'block',
          id,
          section_block_id: null,
          list_parent_block_id: null,
        })),
      },
    ],
  }
}

describe("AC-845 a facet document touches only its own blocks", () => {
  test('a non-member cannot delete a block of a folder they are not in', async () => {
    const [victim, stranger] = (await cast.of(app)) as [Actor, Actor]
    const victimFolder = await sharedFolder(app, victim, 'AC-845 the victim')
    const heading = await writeFolderHeading(victim, victimFolder, 'Load bearing')
    const work = await createFacetOk(victim, victimFolder, {
      kind: 'work',
      h1_block_id: heading,
    })
    const before = await blockRow(app, heading)

    const ownDesk = await defaultFolderOf(app.db, stranger.id)
    const facet = await createFacetOk(stranger, ownDesk, {
      kind: 'private_blank',
      display_name: 'AC-845 the door',
    })
    const own = crypto.randomUUID()
    expectStatus(
      await writeFacetParagraph(stranger, ownDesk, facet.id, own, 'my own writing'),
      200,
      'the attacker writes their own facet normally first',
    )
    const mine = await facetPageOf(stranger, ownDesk, facet.id)

    const refused = await postFacetPageAction(
      stranger,
      ownDesk,
      facet.id,
      theAttack(mine.revision, heading, [own]),
    )
    expectStatus(
      refused,
      422,
      "7.27: a facet document transaction names blocks of that facet and nothing else. A `put_block` claiming a foreign id is refused before the first write, whether or not a `delete_block` follows it",
    )

    expect(
      await blockRow(app, heading),
      "**the victim's block is byte-identical**, which is the assertion the defect failed: the id, the kind, the text, the home and the updated_at are all what they were",
    ).toEqual(before)
    expect(
      (await facetsOf(victim, victimFolder)).map((each) => each.id),
      'and its Work facet is still there, which it would not be: `folder_facets_h1_block_id_fkey` cascades, so deleting the heading destroys the facet hanging off it',
    ).toContain(work.id)

    expect(
      (await facetPageOf(stranger, ownDesk, facet.id)).blocks.map((b) => [b.id, b.text]),
      "and the attacker's own facet is untouched, which is what says the refusal preceded the first write rather than landing half way through",
    ).toEqual([[own, 'my own writing']])
  })

  test('a Can-view member, refused the folder page, cannot reach it through a facet either', async () => {
    const [victim, , viewer] = (await cast.of(app)) as [Actor, Actor, Actor]
    const victimFolder = await sharedFolder(app, victim, 'AC-845 the shared victim', [
      [viewer, 'can_view'],
    ])
    const heading = await writeFolderHeading(victim, victimFolder, 'Also load bearing')
    const work = await createFacetOk(victim, victimFolder, {
      kind: 'work',
      h1_block_id: heading,
    })
    const before = await blockRow(app, heading)

    /* The refusal they are about to go around, on the record. #228 gives the
       Folder page to Can edit and above, so this actor may read this heading
       and may not write it. */
    const page = await viewer.browser.api(`/folders/${victimFolder}/page`)
    expectStatus(page, 200, 'a Can-view member reads the Folder page (spec 7.16)')
    const direct = await viewer.browser.json(
      `/folders/${victimFolder}/page/actions`,
      'POST',
      {
        action: 'delete_block',
        block_id: heading,
        updated_at: String((page.json() as { blocks: { id: string; updated_at: string }[] })
          .blocks.find((block) => block.id === heading)?.updated_at),
      },
    )
    expectStatus(
      direct,
      403,
      "#228's Can-edit list: the Folder page and composer are ordinary shared Work, and Can view is refused them",
    )

    const ownDesk = await defaultFolderOf(app.db, viewer.id)
    const facet = await createFacetOk(viewer, ownDesk, {
      kind: 'private_blank',
      display_name: 'AC-845 the other door',
    })
    const own = crypto.randomUUID()
    await writeFacetParagraph(viewer, ownDesk, facet.id, own, 'my own writing')
    const mine = await facetPageOf(viewer, ownDesk, facet.id)

    const refused = await postFacetPageAction(
      viewer,
      ownDesk,
      facet.id,
      theAttack(mine.revision, heading, [own]),
    )
    expectStatus(
      refused,
      422,
      'the second door answers the same as the first: a facet document reaches no block that is not the facet\'s, and the 403 above is not bypassable by changing route',
    )

    expect(
      await blockRow(app, heading),
      'the heading is byte-identical',
    ).toEqual(before)
    expect(
      (await facetsOf(victim, victimFolder)).map((each) => each.id),
      'and its Work facet survives',
    ).toContain(work.id)
  })

  test('the same refusal holds for a foreign block named by a put_block alone, and for a shelf block', async () => {
    const [victim, stranger] = (await cast.of(app)) as [Actor, Actor]
    const victimFolder = await sharedFolder(app, victim, 'AC-845 more doors')
    const heading = await writeFolderHeading(victim, victimFolder, 'Third')
    const before = await blockRow(app, heading)

    const shelf = await victim.browser.json('/shelves', 'POST', {
      name: `AC-845 ${crypto.randomUUID().slice(0, 8)}`,
    })
    expectStatus(shelf, 201, '4.18: a shelf of the victim\'s own')
    const shelfId = String((shelf.json() as { id: string }).id)
    const shelfPage = await victim.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
      blocks: [{ kind: 'paragraph', position: 0, text: 'shelf writing' }],
    })
    expectStatus(shelfPage, 200, '7.16: the shelf page')
    const shelfBlockId = String(
      (shelfPage.json() as { blocks: { id: string }[] }).blocks[0]?.id,
    )
    const shelfBefore = await blockRow(app, shelfBlockId)

    const ownDesk = await defaultFolderOf(app.db, stranger.id)
    const facet = await createFacetOk(stranger, ownDesk, {
      kind: 'private_blank',
      display_name: 'AC-845 the third door',
    })
    const own = crypto.randomUUID()
    await writeFacetParagraph(stranger, ownDesk, facet.id, own, 'my own writing')

    for (const [what, victimId, wasBefore] of [
      ['a folder page block', heading, before],
      ["another person's shelf block", shelfBlockId, shelfBefore],
    ] as const) {
      const mine = await facetPageOf(stranger, ownDesk, facet.id)
      const claimed = await postFacetPageAction(stranger, ownDesk, facet.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: mine.revision,
        operations: [
          {
            op: 'put_block',
            id: victimId,
            block_kind: 'paragraph',
            text: 'mine now',
            rich_content: null,
            file_id: null,
            ref_folder_id: null,
            width_pct: null,
            checked: null,
          },
          {
            op: 'set_outline',
            items: [own, victimId].map((id) => ({
              kind: 'block',
              id,
              section_block_id: null,
              list_parent_block_id: null,
            })),
          },
        ],
      })
      expectStatus(
        claimed,
        422,
        `a put_block alone claiming ${what} is refused: an id this facet does not hold is not this facet's to write, whatever home it actually has`,
      )
      expect(
        await blockRow(app, victimId),
        `and ${what} is byte-identical afterwards`,
      ).toEqual(wasBefore)
    }

    /* A bare `delete_block` for a foreign id stays **404 rather than 422**,
       and the difference is 10.2 rather than an inconsistency: with no
       `put_block` beside it the caller has named a block this document does
       not hold, and "Block not found" is the answer that discloses nothing
       about whether it exists somewhere else. The 422 above fires only where
       the caller also tried to *write* the id, which is the case 7.16's own
       folder-page applier already answers with a refusal naming the clash. */
    const mine = await facetPageOf(stranger, ownDesk, facet.id)
    const bare = await postFacetPageAction(stranger, ownDesk, facet.id, {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: mine.revision,
      operations: [
        { op: 'delete_block', id: heading },
        {
          op: 'set_outline',
          items: [{ kind: 'block', id: own, section_block_id: null, list_parent_block_id: null }],
        },
      ],
    })
    expectStatus(
      bare,
      404,
      '10.2: a delete naming a block this document does not hold is Not found, which says nothing about whether the id exists anywhere',
    )
    expect(await blockRow(app, heading), 'and it deleted nothing').toEqual(before)
  })
})
