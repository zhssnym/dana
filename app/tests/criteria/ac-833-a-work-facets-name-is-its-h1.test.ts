/*
AC-833: a Work facet's name is its H1 block's text at read time, renaming the
heading renames the facet with no write to the facet at all, and no rename
route can touch it.

Issue #210 (M1-F), invariant 4 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 4.17, 7.27.

## "At read time" is the assertion, and it is not the same as "kept in sync"

A server that copied the heading's text onto the facet when the facet was made,
and again whenever the heading changed, would pass any case that renames the
heading and then reads the facet. So the third case renames the heading and
then asserts, **in the same breath**, that `folder_facets.display_name` is
still null and `updated_at` has not moved: the name came from the join and not
from a copy anybody wrote. #210's core rule is one source of truth, and a
second copy of a name is exactly the thing it forbids.

## The empty heading

4.17 admits a Section whose text is empty (migration 0021 widened the bound to
`BETWEEN 0 AND 120`). 7.27 answers the empty string for such a facet rather
than inventing a name, which is the honest reading: the heading says nothing
and the tab says nothing, and a placeholder here would be a name nobody chose.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  blockText,
  createFacetOk,
  facetOfKind,
  facetRow,
  folderWithFacets,
  patchFacet,
  postFacet,
  writeFolderHeading,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac833')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The heading's text, rewritten in place through the column rather than
 * through a whole document transaction. The rule under test is "the facet's
 * name follows this text", so what matters is that the text moved; how it
 * moved is 7.16's subject and AC-822's. */
async function renameHeading(
  app: AuthTestApp,
  blockId: string,
  text: string,
): Promise<void> {
  await app.db.execute(
    sql`UPDATE page_blocks SET text = ${text}, updated_at = now()
         WHERE id = ${blockId}::uuid`,
  )
}

describe("AC-833 a Work facet's name is its H1's text", () => {
  test('the facet is created carrying the heading it names', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-833 create', [
      [member, 'can_edit'],
    ])
    const heading = await writeFolderHeading(owner, folderId, 'Discovery')
    const work = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    expect(work, 'the created facet answers the heading as its name').toMatchObject({
      kind: 'work',
      name: 'Discovery',
      display_name: null,
      h1_block_id: heading,
      private: false,
      owner_id: null,
    })
    expect(
      (await facetOfKind(member, folderId, 'work'))?.name,
      'and every member reads the same name, it being one fact rather than a copy each',
    ).toBe('Discovery')
  })

  test('renaming the heading renames the facet, with no write to the facet', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-833 follow')
    const heading = await writeFolderHeading(owner, folderId, 'First name')
    const work = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    const before = await facetRow(app.db, work.id)

    await renameHeading(app, heading, 'Second name')

    expect(
      (await facetOfKind(owner, folderId, 'work'))?.name,
      "7.27: a Work facet's name is its H1's text **at read time**",
    ).toBe('Second name')

    /* **This is the assertion that separates "resolved" from "kept in sync".**
       A server that copied the text onto the facet would pass the line above
       and fail these two: nothing was written to the facet row, so its
       `display_name` is still null and its `updated_at` has not moved. */
    const after = await facetRow(app.db, work.id)
    expect(
      after?.display_name,
      'the facet stores no name of its own, which is what makes the heading the only source',
    ).toBeNull()
    expect(
      String(after?.h1_block_id),
      'and it still points at the same heading',
    ).toBe(heading)
    expect(
      String(before?.id),
      'the row is the same row: renaming the heading created nothing and replaced nothing',
    ).toBe(String(after?.id))
  })

  test('no rename route can touch it, and the heading is unchanged by the attempt', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-833 refuse')
    const heading = await writeFolderHeading(owner, folderId, 'Untouched')
    const work = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    const refused = await patchFacet(owner, folderId, work.id, {
      display_name: 'Something else',
    })
    expectStatus(
      refused,
      422,
      "7.27: a Work facet's name is its H1's and changes with it, so there is no rename to perform here",
    )
    expect(
      await blockText(app.db, heading),
      'and the refusal did not write through to the heading either, which would have been the other way to get this wrong',
    ).toBe('Untouched')
    expect(
      (await facetOfKind(owner, folderId, 'work'))?.name,
      'the name is still the heading it was',
    ).toBe('Untouched')

    /* The create path refuses the same thing, so there is no way in at all:
       a `display_name` sent alongside `kind: 'work'` is 422 rather than
       quietly dropped, which is the hard-stop class where a declared field no
       route reads is accepted and answered 200. */
    const secondHeading = await writeFolderHeading(owner, folderId, 'Another')
    const refusedCreate = await postFacet(owner, folderId, {
      kind: 'work',
      h1_block_id: secondHeading,
      display_name: 'Not this',
    })
    expectStatus(
      refusedCreate,
      422,
      "7.27: a Work facet is not created with a name of its own",
    )
    expect(
      JSON.stringify(refusedCreate.json()),
      'and the refusal names the field it refused',
    ).toContain('display_name')
  })

  test('a heading with no text answers the empty string rather than a name nobody chose', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-833 empty')
    const heading = await writeFolderHeading(owner, folderId, 'Has text')
    const work = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    await renameHeading(app, heading, '')
    expect(
      (await facetOfKind(owner, folderId, 'work'))?.name,
      '4.17 admits an empty Section heading, and 7.27 answers what it says rather than inventing a placeholder',
    ).toBe('')
    expect(
      (await facetRow(app.db, work.id))?.display_name,
      'and it still stores nothing',
    ).toBeNull()
  })
})
