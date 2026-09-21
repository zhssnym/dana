/*
AC-830: every Folder has exactly four native facets with stable ids from the
moment it is created, migration 0027 gave the same four to every Folder that
already existed, and the positions the migration wrote are the positions the
server writes.

Issue #210 (M1-F), invariant 1 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 7.4, 7.27.

## What this is for

**"Created with the Folder, not lazily" is the whole of it**, and the ruling
gives three reasons a lazy read would be wrong: a GET would write, two members
would race `folder_facets_folder_native_kind_idx`, and a Can-view member's read
would either create rows or answer differently from a Can-edit member's. So the
cases below read the facets as somebody who **cannot write anything** and
assert that the rows were already there, and they read them twice and assert
the ids did not move.

**The migration's four literals and `initialKeys(4)` are compared against each
other rather than either against a constant.** A migration cannot call
TypeScript, so 0027 writes `a0`, `a1`, `a2`, `a3` by hand while
`createNativeFacets` calls the function; the day the function's output changes,
every Folder made before the change and every Folder made after it would sit in
two different key spaces and nothing else in the suite would notice.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  facetRowsOf,
  facetsOf,
  folderWithFacets,
} from '../support/facets-harness.js'
import { initialKeys } from '../../src/server/domain/fractional-index.js'
import { NATIVE_FACET_KINDS } from '../../src/shared/facets.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer'], 'ac830')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-830 every Folder carries its four native facets from creation', () => {
  test('a new Folder holds one of each native, with ids that do not move', async () => {
    const [owner, viewer] = (await cast.of(app)) as [Actor, Actor]
    const { folderId, facets } = await folderWithFacets(
      app,
      owner,
      'AC-830 natives',
      [[viewer, 'can_view']],
    )

    expect(
      facets.map((facet) => facet.kind),
      '4.30: exactly one of each native, and 7.27 answers Main first',
      ).toEqual([...NATIVE_FACET_KINDS])
    expect(
      facets.map((facet) => facet.name),
      "7.27 resolves a native's name on the read; none of the four stores one",
    ).toEqual(['Main', 'Purpose', 'Consultation', 'Results'])
    for (const facet of facets) {
      expect(facet.display_name, `${facet.kind} stores no name`).toBeNull()
      expect(facet.hidden, `${facet.kind} is not hidden on creation`).toBe(false)
      expect(facet.private, `${facet.kind} is shared`).toBe(false)
      expect(facet.owner_id, `${facet.kind} has no owner`).toBeNull()
      expect(facet.h1_block_id, `${facet.kind} is not a Work facet`).toBeNull()
    }

    /* **Read by somebody who can write nothing**, which is the lazy-creation
       argument stated as a case: a Can-view member reads the same four ids the
       owner reads, and a second read returns the same ids again, so nothing
       about the listing is creating rows. */
    const asViewer = await facetsOf(viewer, folderId)
    expect(
      asViewer.map((facet) => facet.id),
      'a Can-view member reads the same facets, and reading creates nothing',
    ).toEqual(facets.map((facet) => facet.id))
    const again = await facetsOf(owner, folderId)
    expect(
      again.map((facet) => facet.id),
      'the ids are stable across reads (#210: a stable internal identity)',
    ).toEqual(facets.map((facet) => facet.id))

    const stored = await facetRowsOf(app.db, folderId)
    expect(
      stored.length,
      'four rows and no more: the read is not the thing that made them',
    ).toBe(4)
  })

  test('the positions are initialKeys(4), which is what migration 0027 wrote by hand', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'AC-830 positions')
    const stored = await facetRowsOf(app.db, folderId)

    /* A migration cannot call TypeScript, so 0027 carries `a0`, `a1`, `a2`,
       `a3` as literals while `createNativeFacets` calls this function. The two
       are pinned against each other here rather than either against a written
       constant: if `initialKeys` ever changes, this goes red and says that
       every pre-0027 Folder and every Folder made afterwards are in two key
       spaces. */
    expect(
      stored.map((row) => String(row.position)),
      "the server's own key arithmetic, and the literals 0027 backfilled with",
    ).toEqual(initialKeys(4))
    expect(
      initialKeys(4),
      'and those literals are these, which is the half a migration cannot assert for itself',
    ).toEqual(['a0', 'a1', 'a2', 'a3'])
  })

  test('every Folder in the database has its four, trashed ones included', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const doomed = await createFolder(owner, 'AC-830 trashed')
    const trashed = await owner.browser.json(`/folders/${doomed}`, 'DELETE')
    expect(
      trashed.status,
      'DELETE /folders/:id trashes it (spec 7.4, 7.13)',
    ).toBe(200)

    const stored = await facetRowsOf(app.db, doomed)
    expect(
      stored.map((row) => String(row.kind)),
      "a trashed Folder keeps its facets: it may still be restored, and 0027 backfilled trashed Folders for exactly that reason",
    ).toEqual([...NATIVE_FACET_KINDS])

    /* The migration's own claim, asserted over the whole database rather than
       over one fixture: **no Folder anywhere is missing a native.** Every
       Folder in this worker's database was either backfilled by 0027 -- the
       seed's, and any another file left behind -- or written by
       `createNativeFacets`, and the two must agree. */
    const short = await rows(
      app.db,
      sql`SELECT f.id
            FROM folders f
           WHERE (SELECT count(*)::int FROM folder_facets ff
                   WHERE ff.folder_id = f.id
                     AND ff.kind IN ('main','purpose','consultation','results')) <> 4`,
    )
    expect(
      short.map((row) => String(row.id)),
      'every Folder in the database carries exactly four natives (migration 0027 plus POST /folders)',
    ).toEqual([])
  })
})
