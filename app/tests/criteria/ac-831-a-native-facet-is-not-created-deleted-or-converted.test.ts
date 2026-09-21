/*
AC-831: a native facet cannot be created twice, deleted, or converted to
shared, and Main cannot be hidden.

Issue #210 (M1-F), invariant 2 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 7.27.

## Why the last case reads the database directly

The three route refusals above it are the contract. The fourth case writes a
second Main straight into `folder_facets` and asserts that the **database**
refuses it, and that is not belt-and-braces: 4.30 makes "exactly one of each
native" an invariant of the table rather than a rule a handler keeps, and
`folder_facets_folder_native_kind_idx` is what makes it one. A route check
alone would be a rule two members racing a create could both pass.

`expectRejectedBy` names the index rather than reading the message, which every
translation keeps verbatim while the prose is in this cluster's own language.

## The one that is a 409 rather than a 422

Deleting a native answers **409, not 422**. The body was fine and the actor was
permitted; what is wrong is the state of the thing they named, and 7.27's
refusal order puts state last for exactly that reason. Creating one is 422,
because the body named a kind that cannot be created at all.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  deleteFacet,
  facetRowsOf,
  facetsOf,
  folderWithFacets,
  patchFacet,
  postFacet,
  shareFacet,
} from '../support/facets-harness.js'
import { NATIVE_FACET_KINDS } from '../../src/shared/facets.js'
import { expectRejectedBy } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac831')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-831 a native facet is not created twice, deleted or converted', () => {
  test('creating any of the four is 422, and no row is added', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-831 create')

    for (const kind of NATIVE_FACET_KINDS) {
      const refused = await postFacet(owner, folderId, { kind })
      expectStatus(
        refused,
        422,
        `7.27: a native facet exists from the moment the Folder does, so creating ${kind} names a kind that cannot be created`,
      )
      expect(
        JSON.stringify(refused.json()),
        'the refusal names the field it refused (7.0)',
      ).toContain('kind')
    }

    expect(
      (await facetRowsOf(app.db, folderId)).length,
      'four refusals wrote nothing: the Folder still holds exactly its four',
    ).toBe(4)
  })

  test('deleting a native is 409 and converting one is refused, with the row unmoved', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-831 delete')

    for (const facet of facets) {
      const refused = await deleteFacet(owner, folderId, facet.id)
      expectStatus(
        refused,
        409,
        `7.27: ${facet.kind} is hidden rather than deleted. It is 409 and not 422 because the body was fine and the actor was permitted -- what is wrong is the state of the thing they named`,
      )
      const converted = await shareFacet(owner, folderId, facet.id)
      expectStatus(
        converted,
        409,
        `7.27: ${facet.kind} is not private, and there is no conversion for a facet that is already the Folder's`,
      )
    }

    const stored = await facetRowsOf(app.db, folderId)
    expect(
      stored.map((row) => String(row.kind)),
      'eight refusals later, the four are exactly what they were',
    ).toEqual([...NATIVE_FACET_KINDS])
    expect(
      stored.map((row) => row.deleted_at),
      'and none of them is in Trash',
    ).toEqual([null, null, null, null])
    expect(
      stored.map((row) => row.owner_id),
      'and none of them acquired an owner',
    ).toEqual([null, null, null, null])
  })

  test('Main cannot be hidden, while the other three can', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-831 hide')
    const [main, purpose, consultation, results] = facets as [
      typeof facets[number],
      typeof facets[number],
      typeof facets[number],
      typeof facets[number],
    ]

    const refused = await patchFacet(owner, folderId, main.id, { hidden: true })
    expectStatus(
      refused,
      422,
      '#210: Main stays first and is always present, so hiding it is refused',
    )
    expect(
      JSON.stringify(refused.json()),
      'the refusal names `hidden`',
    ).toContain('hidden')

    /* The other side of the same rule, and it is what makes the case above
       measure something: a criterion that only proved Main is refused would be
       satisfied by a route that refused `hidden` on everything. */
    for (const facet of [purpose, consultation, results]) {
      const hidden = await patchFacet(owner, folderId, facet.id, {
        hidden: true,
      })
      expectStatus(
        hidden,
        200,
        `#210: ${facet.kind} may be hidden and restored`,
      )
    }

    const after = await facetsOf(owner, folderId)
    expect(
      after.map((facet) => [facet.kind, facet.hidden]),
      'Main is the one that did not move, and the hidden three are still in the listing so Restore can be drawn (7.27)',
    ).toEqual([
      ['main', false],
      ['purpose', true],
      ['consultation', true],
      ['results', true],
    ])
  })

  test('the database refuses a second native of a kind, whatever a route would have done', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-831 index')

    /* 4.30 makes "exactly one of each" an invariant of the table rather than a
       rule a handler keeps, because two members racing a create would both
       pass a SELECT. The index is what makes it one, and it is named here
       rather than read out of the message: a constraint name survives every
       translation and this cluster's prose is French. */
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO folder_facets (folder_id, kind, position, created_by)
              VALUES (${folderId}::uuid, 'main', 'a9', ${owner.id}::uuid)`,
        ),
      'folder_facets_folder_native_kind_idx',
    )

    /* And the index is partial on `kind` rather than on `deleted_at`, which is
       4.30's own sentence: a native is hidden rather than deleted, so a
       `deleted_at` on the first Main must not open a slot for a second. */
    await app.db.execute(
      sql`UPDATE folder_facets SET deleted_at = now()
           WHERE folder_id = ${folderId}::uuid AND kind = 'main'`,
    )
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO folder_facets (folder_id, kind, position, created_by)
              VALUES (${folderId}::uuid, 'main', 'a9', ${owner.id}::uuid)`,
        ),
      'folder_facets_folder_native_kind_idx',
    )
  })
})
