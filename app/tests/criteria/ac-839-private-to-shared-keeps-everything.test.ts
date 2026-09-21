/*
AC-839: private → shared preserves the id, the document and the position; a
member who is not the owner cannot do it; and shared → private is 409.

Issue #210 (M1-F), invariant 10 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.27.

## Why "keeps the id" is the assertion rather than "the content appears"

A conversion that created a new shared facet, copied the blocks into it and
deleted the private one would look identical from the tab strip. It would break
every `page_blocks.facet_id` under it, every link anybody had, and Trash's idea
of what was deleted. The whole reason 7.27 makes this a conversion rather than a
copy is that the id survives, so the id is what this pins — beside the block
ids, which is the other half: a copy would preserve the id of the *facet* and
still mint new blocks if somebody implemented it halfway.

## The two conditions on the act, and the one that cannot answer 403

7.27 requires `facet.convert_to_shared` **and** actor = owner, neither alone.
The preset half is driveable: a Can-contribute member is refused 403. The
ownership half **cannot produce a 403 over HTTP**, because the only facet with
an owner is a private one and a private facet is invisible to every non-owner —
so a non-owner is answered 404 by the visibility scope first. That is asserted
here as 404 rather than papered over, and `ac-397`'s row for this route carries
the same reading.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetPageOf,
  facetRow,
  facetsOf,
  forcePreset,
  putMyFacetOrder,
  shareFacet,
  sharedFolder,
  writeFacetParagraph,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'author', 'colleague'], 'ac839')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-839 private to shared keeps the id, the document and the place', () => {
  test('the same row, the same blocks and the same position come out the other side', async () => {
    const [owner, author] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-839 convert', [
      [author, 'can_edit'],
    ])
    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Draft',
    })

    const first = crypto.randomUUID()
    const second = crypto.randomUUID()
    await writeFacetParagraph(author, folderId, facet.id, first, 'one')
    await writeFacetParagraph(author, folderId, facet.id, second, 'two')

    /* Moved somewhere deliberate first, so "keeps the position" is a claim
       about a value rather than about a default. */
    expectStatus(
      await putMyFacetOrder(author, folderId, [
        { facet_id: facet.id, after_facet_id: null },
      ]),
      200,
      "7.27: a private facet's place is its owner's",
    )
    const before = await facetRow(app.db, facet.id)
    const documentBefore = await facetPageOf(author, folderId, facet.id)

    const shared = await shareFacet(author, folderId, facet.id)
    expectStatus(shared, 200, '7.27: its owner may share it with the Folder')

    const body = shared.json() as {
      id: string
      kind: string
      private: boolean
      owner_id: string | null
      position: string
      display_name: string | null
    }
    expect(
      body,
      '**the same id**, which is the whole reason this is a conversion and not a copy: every `page_blocks.facet_id` under it still resolves',
    ).toMatchObject({
      id: facet.id,
      kind: 'shared_blank',
      private: false,
      owner_id: null,
      display_name: 'Draft',
    })
    expect(
      body.position,
      'and the same position: it keeps its place rather than being appended somewhere new',
    ).toBe(String(before?.position))

    const after = await facetRow(app.db, facet.id)
    expect(
      [String(after?.id), String(after?.kind), after?.owner_id],
      'the stored row is the same row, converted rather than replaced',
    ).toEqual([facet.id, 'shared_blank', null])

    const documentAfter = await facetPageOf(author, folderId, facet.id)
    expect(
      documentAfter.blocks.map((block) => [block.id, block.text]),
      "**the same block ids**, not a copy with the same words: a halfway implementation that minted new blocks would pass a text comparison",
    ).toEqual(documentBefore.blocks.map((block) => [block.id, block.text]))
    expect(
      documentAfter.blocks.map((block) => block.id).sort(),
      'and both blocks are there',
    ).toEqual([first, second].sort())

    /* And now every member reads it, which is what "shared" means and is the
       fact the confirmation was asked for. */
    const asOwner = await facetsOf(owner, folderId)
    expect(
      asOwner.map((each) => each.id),
      "the Folder's owner, who could not see it a moment ago, reads it now",
    ).toContain(facet.id)
    expect(
      (await facetPageOf(owner, folderId, facet.id)).blocks.map((b) => b.text),
      'and reads its writing',
    ).toEqual(['one', 'two'])
  })

  test('the confirmation is required, and a refusal shares nothing', async () => {
    const [owner, author] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-839 confirm', [
      [author, 'can_edit'],
    ])
    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Unconfirmed',
    })

    for (const body of [{}, { confirm: false }]) {
      const refused = await shareFacet(author, folderId, facet.id, body)
      expectStatus(
        refused,
        422,
        "#210 asks for a clear confirmation before exposing the content, so `confirm: true` is required and `false` is a refusal rather than a no-op",
      )
    }
    expect(
      (await facetRow(app.db, facet.id))?.owner_id,
      'and nothing was exposed',
    ).toBe(author.id)
    expect(
      (await facetsOf(owner, folderId)).map((each) => each.id),
      "the Folder's owner still cannot see it",
    ).not.toContain(facet.id)
  })

  test('a member who is not the owner cannot share it, whatever their preset', async () => {
    const [owner, author, colleague] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-839 not yours', [
      [author, 'can_edit'],
      [colleague, 'full_control'],
    ])
    const facet = await createFacetOk(author, folderId, {
      kind: 'private_blank',
      display_name: 'Not theirs',
    })

    /* **404 rather than 403, and that is the honest answer rather than a
       weakening.** 7.27 asks for the preset *and* the owner, and the owner
       half can never produce a 403 over HTTP: the only facet with an owner is
       a private one, and a private facet is invisible to every non-owner, so
       the visibility scope answers first. `ac-397`'s row for this route
       carries the same reading and points here. */
    for (const actor of [owner, colleague]) {
      const refused = await shareFacet(actor, folderId, facet.id)
      expectStatus(
        refused,
        404,
        'the ownership condition is unreachable behind the privacy scope, which answers 404 to anybody but the owner',
      )
    }

    /* The preset half **is** driveable, on a facet the actor can see: an
       actor's own private facet, at a preset below Can edit. The
       `whenOwnPrivateFacet` escape is what admits it, and removing that escape
       is what this line would catch. */
    await forcePreset(app.db, folderId, author.id, 'can_view')
    const byOwnerAtCanView = await shareFacet(author, folderId, facet.id)
    expectStatus(
      byOwnerAtCanView,
      200,
      "7.27 and the ruling's section 2: `facet.convert_to_shared` carries whenOwnPrivateFacet, so a member's own private facet is theirs to share at any preset",
    )
  })

  test('there is no inverse: sharing an already-shared facet is 409', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-839 inverse')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Already shared',
    })

    const refused = await shareFacet(owner, folderId, facet.id)
    expectStatus(
      refused,
      409,
      '#210: shared to private is not a conversion. Create a private copy instead, and that copy is out of this slice',
    )
    expect(
      (await facetRow(app.db, facet.id))?.owner_id,
      'and the facet is still shared: a 409 wrote nothing',
    ).toBeNull()

    /* The same applies to a facet that started private and has already been
       converted, which is where a client will actually hit it: pressing Share
       twice. */
    const wasPrivate = await createFacetOk(owner, folderId, {
      kind: 'private_blank',
      display_name: 'Converted once',
    })
    expectStatus(await shareFacet(owner, folderId, wasPrivate.id), 200, 'the first conversion')
    expectStatus(
      await shareFacet(owner, folderId, wasPrivate.id),
      409,
      'and the second is a conflict rather than a second success or a silent no-op',
    )
  })
})
