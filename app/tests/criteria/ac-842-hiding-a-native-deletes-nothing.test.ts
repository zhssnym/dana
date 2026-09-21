/*
AC-842: hiding a native facet deletes nothing, it stays in the listing carrying
`hidden: true` so Restore can be drawn, and restoring it returns the same facet
with the same id and the same document.

Issue #210 (M1-F), invariant 13 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 7.27.

## Hidden is not deleted, and the listing is where that is visible

#210 says Purpose, Consultation and Results may be hidden and restored, and that
hiding does not delete their data. A server that dropped a hidden facet from the
listing would satisfy "hiding works" from a tab strip's point of view and would
leave the client with nothing to draw Restore from — the ruling calls that out
as **(proposed)** and 7.27 carries it, so it is asserted here: the row is still
in the listing, still carrying its id, and carrying `hidden: true`.

## And the document survives, which is the "deletes nothing" half

Purpose and Results get their internals in #211 and #213, so in this slice the
thing a native facet can hold is its **name**. The case therefore renames
Purpose, hides it, restores it, and asserts the name came back — a
hide-and-restore that quietly reset it would be a data loss nobody reported.
Consultation is hidden with the Folder's conversation under it and the
conversation is read afterwards, which is the closest thing this slice has to a
native facet's content.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetRow,
  facetRowsOf,
  facetsOf,
  folderWithFacets,
  patchFacet,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac842')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-842 hiding a native facet deletes nothing', () => {
  test('a hidden native stays in the listing carrying hidden: true', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-842 hide', [
      [member, 'can_edit'],
    ])
    const purpose = facets[1]!

    expectStatus(
      await patchFacet(owner, folderId, purpose.id, { hidden: true }),
      200,
      '#210: Purpose, Consultation and Results may be hidden',
    )

    const listed = await facetsOf(member, folderId)
    const found = listed.find((facet) => facet.id === purpose.id)
    expect(
      found,
      "7.27: hidden natives are carried with `hidden: true` so Restore can be drawn. Dropping them from the listing would leave a client with nothing to restore from",
    ).toBeDefined()
    expect(
      [found?.hidden, found?.kind, found?.id],
      'and it is the same facet, flagged rather than replaced',
    ).toEqual([true, 'purpose', purpose.id])
    expect(
      listed.map((facet) => facet.kind),
      'every facet is still in the listing, in the same order',
    ).toEqual(['main', 'purpose', 'consultation', 'results'])

    const stored = await facetRow(app.db, purpose.id)
    expect(
      stored?.deleted_at,
      "**hidden is not deleted**: `deleted_at` is untouched, which is what makes the row not a Trash row",
    ).toBeNull()
    expect(stored?.hidden, 'the flag is stored').toBe(true)
  })

  test('restoring it returns the same facet with the name it had', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-842 restore')
    const purpose = facets[1]!
    const results = facets[3]!

    /* The name is the only thing a native facet holds in this slice — Purpose
       and Results get their internals in #211 and #213 — so a hide-and-restore
       that reset it would be the data loss #210 forbids, and it would be
       invisible to anyone asserting only the flag. */
    await patchFacet(owner, folderId, purpose.id, { display_name: 'Our aim' })
    await patchFacet(owner, folderId, results.id, { display_name: 'Outcomes' })

    expectStatus(
      await patchFacet(owner, folderId, purpose.id, { hidden: true }),
      200,
      'hidden',
    )
    const restored = await patchFacet(owner, folderId, purpose.id, {
      hidden: false,
    })
    expectStatus(restored, 200, '#210: hiding is reversible')

    expect(
      restored.json(),
      'the same id, the same name, and not hidden any more',
    ).toMatchObject({
      id: purpose.id,
      kind: 'purpose',
      name: 'Our aim',
      display_name: 'Our aim',
      hidden: false,
    })

    const listed = await facetsOf(owner, folderId)
    expect(
      listed.map((facet) => [facet.id, facet.name, facet.hidden]),
      'and the whole listing is what it was before the hide, Results included',
    ).toEqual([
      [facets[0]!.id, 'Main', false],
      [purpose.id, 'Our aim', false],
      [facets[2]!.id, 'Consultation', false],
      [results.id, 'Outcomes', false],
    ])
  })

  test('hiding all three hideables deletes nothing and leaves Main alone', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-842 all')
    const custom = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    for (const facet of facets.slice(1)) {
      expectStatus(
        await patchFacet(owner, folderId, facet.id, { hidden: true }),
        200,
        `${facet.kind} is hideable`,
      )
    }

    const stored = await facetRowsOf(app.db, folderId)
    expect(
      stored.length,
      'five rows before and five after: hiding creates nothing and removes nothing',
    ).toBe(5)
    expect(
      stored.map((row) => row.deleted_at),
      'and none of them is in Trash',
    ).toEqual([null, null, null, null, null])
    expect(
      stored.map((row) => [String(row.kind), row.hidden]),
      'Main is the one that could not be hidden, and the custom facet was never offered the flag',
    ).toEqual([
      ['main', false],
      ['purpose', true],
      ['consultation', true],
      ['results', true],
      ['shared_blank', false],
    ])
    expect(
      (await facetsOf(owner, folderId)).map((facet) => facet.id),
      'and every one of the five is still in the listing',
    ).toContain(custom.id)
  })
})
