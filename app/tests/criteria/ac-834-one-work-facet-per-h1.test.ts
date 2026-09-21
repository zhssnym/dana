/*
AC-834: a second Work facet on one H1 is 409, two creates fired together over
one heading produce exactly one 201 and one 409, and a trashed Work facet stops
blocking the heading it named.

Issue #210 (M1-F), invariant 5 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 7.27.

## Why the concurrent case is the one that matters

The sequential 409 is satisfied by a `SELECT` before the `INSERT`, and a
`SELECT` before an `INSERT` is exactly what two simultaneous creates both pass.
4.30 puts the rule in `folder_facets_h1_block_id_idx` so that the database
decides it in the transaction that writes, and 7.27 says the 409 comes from
there. The second case fires both creates without awaiting either, so the
answer is the index's or it is nothing.

**It asserts one 201 and one 409 rather than "at least one refusal"**, and it
asserts the row count afterwards, because a race that produced two rows and
answered 409 to a third caller would satisfy a weaker reading.

## Why the trashed case is here rather than in AC-843

The index is partial on `deleted_at IS NULL`, which is a decision about this
invariant rather than about Trash: 4.30 takes 4.28's leave-and-rejoin reasoning,
that a trashed Work facet must not permanently reserve a heading nobody can see
it holding. The collision is raised on **restore** instead, which is AC-843's.
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
  facetRowsOf,
  folderWithFacets,
  postFacet,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac834')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function workFacetsOver(
  app: AuthTestApp,
  blockId: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    app.db,
    sql`SELECT id, deleted_at FROM folder_facets
         WHERE h1_block_id = ${blockId}::uuid ORDER BY id`,
  )
}

describe('AC-834 one H1 carries at most one live Work facet', () => {
  test('a second create over the same heading is 409 and writes nothing', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-834 second')
    const heading = await writeFolderHeading(owner, folderId, 'One heading')
    const first = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    const refused = await postFacet(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    expectStatus(
      refused,
      409,
      '#210: one H1 has at most one Work facet, and the body and the actor were both fine, so it is state rather than shape or authority',
    )

    const over = await workFacetsOver(app, heading)
    expect(
      over.map((row) => String(row.id)),
      'exactly the one row, and it is the first one',
    ).toEqual([first.id])
  })

  test('two creates fired together give one 201 and one 409, and leave one row', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-834 race', [
      [member, 'can_edit'],
    ])
    const heading = await writeFolderHeading(owner, folderId, 'Contested')

    /* **Not awaited in turn**, which is the whole case: a read-then-write gate
       is passed by both of these, and only 4.30's partial unique index --
       enforced in the transaction that writes -- can decide between them. Two
       different actors, so nothing about one caller's own serialisation
       answers it either. */
    const [a, b] = await Promise.all([
      postFacet(owner, folderId, { kind: 'work', h1_block_id: heading }),
      postFacet(member, folderId, { kind: 'work', h1_block_id: heading }),
    ])

    expect(
      [a.status, b.status].sort((x, y) => x - y),
      'exactly one 201 and one 409: the index decided it, not a SELECT both callers passed',
    ).toEqual([201, 409])

    const over = await workFacetsOver(app, heading)
    expect(
      over.length,
      'and one row came out of the pair, which is what "at least one refusal" would not have proved',
    ).toBe(1)
  })

  test('a trashed Work facet stops reserving its heading, and the new one is a different row', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-834 trashed')
    const heading = await writeFolderHeading(owner, folderId, 'Reusable')
    const first = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    const trashed = await deleteFacet(owner, folderId, first.id)
    expectStatus(trashed, 204, '7.27: a custom facet is deleted to Trash')

    const second = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    expect(
      second.id,
      "4.30's index is partial on `deleted_at IS NULL`, on 4.28's leave-and-rejoin reasoning: a facet waiting in Trash must not reserve a heading for thirty days",
    ).not.toBe(first.id)

    const over = await workFacetsOver(app, heading)
    expect(
      over.length,
      'both rows exist -- the trashed one was not destroyed to make room, which would have made Restore a lie',
    ).toBe(2)
    expect(
      over.filter((row) => row.deleted_at === null).map((row) => String(row.id)),
      'and exactly one of the two is live',
    ).toEqual([second.id])
  })

  test('a Work facet names an H1 of this Folder and nothing else', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-834 scope')
    const elsewhere = await folderWithFacets(app, owner, 'AC-834 elsewhere')
    const foreign = await writeFolderHeading(owner, elsewhere.folderId, 'Theirs')

    const refused = await postFacet(owner, folderId, {
      kind: 'work',
      h1_block_id: foreign,
    })
    expectStatus(
      refused,
      422,
      "7.27: the block must be a depth-1 Section of **this** Folder's own page, and a block from another Folder answers the same refusal a block that does not exist does (10.2)",
    )

    const missing = await postFacet(owner, folderId, {
      kind: 'work',
      h1_block_id: '00000000-0000-4000-8000-000000000834',
    })
    expectStatus(
      missing,
      422,
      'and a block that does not exist is the same answer, so the refusal discloses nothing either way',
    )

    expect(
      (await facetRowsOf(app.db, folderId)).length,
      'neither refusal created a facet',
    ).toBe(4)
  })
})
