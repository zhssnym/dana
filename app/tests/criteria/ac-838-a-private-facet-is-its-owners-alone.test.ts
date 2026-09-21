/*
AC-838: a private facet is absent from every other member's reads — a member
holding Full control and the Folder's structural owner included — and its
document is refused to all of them at every preset.

Issue #210 (M1-F), invariant 9 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.27, 10.2; accepted #209 R8A.

## This is the criterion the ruling calls "the one place it bites"

`facet.read` is the only rule in the whole action table with **no preset bar at
all**: no preset qualifies, and the only thing that admits it is
`whenOwnPrivateFacet`. That is #209's custody-is-not-authority carried to its
uncomfortable end — Full control administers everything in the Folder and
cannot read one member's private facet, and neither can the person who owns the
Folder.

So the two actors this file cares most about are the ones every other
authorization criterion treats as the answer: **the structural owner**, and a
**Full-control** member. `ac-397`'s sweep cannot reach either, because it drives
a stranger and a Can-edit member; its row for the share route says so and points
here.

## 404 rather than 403, and why that is asserted rather than assumed

10.2's grammar: a refusal must not confirm that a row exists. A private facet
answered 403 to the Folder's owner would tell them there is one, which is
exactly the fact it is private about. Every refusal below is checked for the
status **and** for the absence of the facet's id in the body.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  deleteFacet,
  destroyFacet,
  facetRow,
  facetsOf,
  forcePreset,
  getFacetPage,
  patchFacet,
  postFacetPageAction,
  restoreFacet,
  shareFacet,
  sharedFolder,
  trashFacetsOf,
  writeFacetParagraph,
} from '../support/facets-harness.js'
import { FOLDER_ACCESS_PRESETS } from '../../src/shared/folder-access.js'
import type { RawResponse } from '../support/http-client.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'author', 'administrator'], 'ac838')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function refusesWithoutNaming(
  response: RawResponse,
  facetId: string,
  why: string,
): void {
  expectStatus(response, 404, why)
  expect(
    response.body,
    "10.2: the refusal must not carry the id it is refusing, or the refusal is the disclosure",
  ).not.toContain(facetId)
}

describe("AC-838 a private facet is its owner's alone", () => {
  test('the Folder owner and a Full-control member read no private facet of another member', async () => {
    const [owner, author, administrator] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-838 private', [
      [author, 'can_edit'],
      [administrator, 'full_control'],
    ])

    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'My own notes',
    })
    expect(
      [facet.private, facet.owner_id],
      "4.30: `owner_id IS NOT NULL` is exactly `kind = 'private_blank'`, and the projection says so on the wire",
    ).toEqual([true, author.id])

    const blockId = crypto.randomUUID()
    expectStatus(
      await writeFacetParagraph(author, folderId, facet.id, blockId, 'private writing'),
      200,
      "its owner writes its document (`facet.read` through whenOwnPrivateFacet)",
    )

    /* The author reads it, which is what makes every refusal below a refusal
       rather than a row that was never there. */
    expect(
      (await facetsOf(author, folderId)).map((each) => each.id),
      'the author sees their own facet in the listing',
    ).toContain(facet.id)

    for (const [who, actor] of [
      ['the structural owner of the Folder', owner],
      ['a member holding Full control', administrator],
    ] as const) {
      expect(
        (await facetsOf(actor, folderId)).map((each) => each.id),
        `#209 custody is not authority: ${who} reads no member's private facet`,
      ).not.toContain(facet.id)

      refusesWithoutNaming(
        await getFacetPage(actor, folderId, facet.id),
        facet.id,
        `7.27: the document is refused to ${who}, and with 404 rather than 403 so the refusal does not confirm that it exists`,
      )
    }

    /* The document is genuinely there, which is the fact all of the above is
       about: these are refusals and not an empty facet. */
    expect(
      (await facetRow(app.db, facet.id))?.owner_id,
      'the row exists and names its owner',
    ).toBe(author.id)
  })

  test('every preset is refused the document, the reads and the writes alike', async () => {
    const [owner, author, administrator] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-838 presets', [
      [author, 'can_edit'],
      [administrator, 'full_control'],
    ])
    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Still mine',
    })
    const blockId = crypto.randomUUID()
    await writeFacetParagraph(author, folderId, facet.id, blockId, 'mine')

    /*
    A second private facet, **trashed**, so that the two Trash routes can be
    driven at something whose `deleted_at` is set.

    Without it those two routes answer 404 for the wrong reason -- the row is
    not in Trash -- and the criterion would be green with the visibility clause
    deleted. The adversarial review of 16ce81b measured exactly that: removing
    `visibleTo` from `destroyFacet` and `restoreFacet` left AC-830 to AC-844,
    `ac-397` and `ac-523` all green, because nothing drove a member at
    somebody else's *trashed* private facet. `ac-397` cannot: its trashed
    fixture is deliberately a **shared** facet, so that its `member` row
    measures the preset rather than the privacy scope.
    */
    const trashed = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Mine, and in Trash',
    })
    expectStatus(
      await deleteFacet(author, folderId, trashed.id),
      204,
      'its owner deletes their own private facet',
    )

    /* **Driven at all six**, because `facet.read` is the one rule in the table
       with no bar: there is no preset that admits it, so "a higher preset"
       must not be the answer anywhere on the ladder. `forcePreset` is the
       folder-access harness's own escape for putting an actor somewhere the
       API would not leave them -- it writes the column and no history, which
       AC-522 is the criterion about. */
    for (const preset of FOLDER_ACCESS_PRESETS) {
      await forcePreset(app.db, folderId, administrator.id, preset)

      expect(
        (await facetsOf(administrator, folderId)).map((each) => each.id),
        `at ${preset}, the listing carries no other member's private facet`,
      ).not.toContain(facet.id)

      refusesWithoutNaming(
        await getFacetPage(administrator, folderId, facet.id),
        facet.id,
        `at ${preset}, the document read is refused`,
      )
      refusesWithoutNaming(
        await postFacetPageAction(administrator, folderId, facet.id, {
          action: 'document_transaction',
          mutation_id: crypto.randomUUID(),
          base_revision: 'anything',
          operations: [{ op: 'set_outline', items: [] }],
        }),
        facet.id,
        `at ${preset}, the document write is refused`,
      )
      refusesWithoutNaming(
        await patchFacet(administrator, folderId, facet.id, {
          display_name: 'not yours',
        }),
        facet.id,
        `at ${preset}, renaming it is refused`,
      )
      refusesWithoutNaming(
        await deleteFacet(administrator, folderId, facet.id),
        facet.id,
        `at ${preset}, deleting it is refused`,
      )
      refusesWithoutNaming(
        await shareFacet(administrator, folderId, facet.id),
        facet.id,
        `at ${preset}, publishing it to the Folder is refused -- which is the worst of these to get wrong`,
      )

      /* **The two Trash routes, and they are the pair no other criterion
         reached.** Both resolve the folder through `trashedFacetFacts`, which
         joins `folder_members` and so admits every member of the folder; the
         only thing between this actor and another member's private facet is
         `visibleTo`. `DELETE /trash/facets/:id` is the one with teeth: it is
         `task.destroy`, which **Full control satisfies**, so with the
         visibility clause gone a Full-control administrator would permanently
         destroy writing they were never allowed to read. */
      refusesWithoutNaming(
        await destroyFacet(administrator, trashed.id),
        trashed.id,
        `at ${preset}, destroying another member's trashed private facet permanently is refused`,
      )
      refusesWithoutNaming(
        await restoreFacet(administrator, trashed.id),
        trashed.id,
        `at ${preset}, restoring another member's trashed private facet is refused`,
      )
    }

    /* And the structural owner, who is not on the ladder at all: ownership is
       custody and never authority (#209), and it buys no sight of this row
       either. */
    refusesWithoutNaming(
      await restoreFacet(owner, trashed.id),
      trashed.id,
      "the Folder's structural owner restores no member's private facet",
    )
    refusesWithoutNaming(
      await destroyFacet(owner, trashed.id),
      trashed.id,
      "nor destroys one",
    )

    /*
    **Both halves, and the first is the one a status assertion cannot give
    you.** With `visibleTo` removed from those two routes the *status* is still
    404 on the restore -- `readOne` re-reads through the privacy-scoped select
    and finds nothing to answer with -- while the UPDATE has already run. So
    the refusal looks right and the write happened. The row is therefore read
    from the table: it must still exist, and it must still be in Trash.
    */
    const stillThere = await facetRow(app.db, trashed.id)
    expect(
      stillThere,
      "the trashed private facet still exists: `DELETE /trash/facets/:id` is `task.destroy`, which Full control satisfies, so the visibility clause is the only thing standing between an administrator and permanently destroying writing they may not read",
    ).toBeDefined()
    expect(
      stillThere?.deleted_at,
      'and it is still in Trash rather than restored -- a 404 answered after the UPDATE ran would be a refusal that refused nothing',
    ).not.toBeNull()
    expect(
      (await trashFacetsOf(author)).map((each) => each.id),
      'still waiting for the one person who may see it',
    ).toContain(trashed.id)

    /* Nothing survived any of that: the facet is still private, still the
       author's, and still holds exactly what they wrote. */
    const after = await facetRow(app.db, facet.id)
    expect(
      [String(after?.kind), String(after?.owner_id), after?.deleted_at],
      'forty-four refusals later the live row is untouched',
    ).toEqual(['private_blank', author.id, null])
  })

  test("a trashed private facet is its owner's alone too", async () => {
    const [owner, author] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-838 trash', [
      [author, 'can_edit'],
    ])
    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Deleted but private',
    })
    expectStatus(
      await deleteFacet(author, folderId, facet.id),
      204,
      'its owner may delete it (`facet.delete` through whenOwnPrivateFacet)',
    )

    expect(
      (await trashFacetsOf(author)).map((each) => each.id),
      "7.13's access is by membership at read time, and privacy rides on top of it: the author sees their own trashed facet",
    ).toContain(facet.id)
    expect(
      (await trashFacetsOf(owner)).map((each) => each.id),
      "and the Folder's owner does not. Privacy is not something a delete gives away",
    ).not.toContain(facet.id)
  })
})
