/*
AC-843: facet trash, restore and purge follow 7.13's window, its
membership-scoped restore and its Full-control permanent delete.

Issue #210 (M1-F), invariant 14 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.13, 7.27, 11.7.

## Four things, and the fourth is the one nothing else watches

The listing row, the restore and the permanent delete are all reachable over
HTTP and are driven here. The **thirty-day purge** is not a route: 11.7's pass
is a plain callable, and `runPass` in the reminders harness is the acceptance
suite's only way into it. A facet arm that was never added to that pass would
leave trashed facets in the table for ever, and no criterion that only drove
routes would notice.

## Two 409s that are state rather than authority

**Restoring a facet whose Folder is itself trashed** is 409: the Folder comes
back as one entry and its facets ride its fate, which is 4.5's rule for a Task
read one table over. And **restoring a Work facet onto a heading somebody has
since made a new Work facet over** is 409, which is where 4.30's partial unique
index raises the collision it deliberately did not pre-empt (AC-834's third
case is the other half of that decision).

## The row's own fields

`is_owner` and `my_access` are on a Trash facet row for the reason 7.13 puts
them on the other two: the permanent delete is not one rule across the three
kinds, so one fact cannot answer for all of them. And `name` is **resolved**,
which is asserted against a Work facet whose heading is renamed *after* it was
trashed — a stored copy would answer the old word.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  ageFacetTrash,
  createFacetOk,
  deleteFacet,
  destroyFacet,
  facetPageOf,
  facetRow,
  facetsOf,
  restoreFacet,
  sharedFolder,
  trashFacetsOf,
  writeFacetParagraph,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { runPass } from '../support/reminders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac843')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-843 facet Trash, restore and purge follow 7.13', () => {
  test('a deleted facet leaves the listing, appears in Trash with its facts, and comes back whole', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-843 trash', [
      [member, 'can_edit'],
    ])
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const blockId = crypto.randomUUID()
    await writeFacetParagraph(owner, folderId, facet.id, blockId, 'kept writing')

    expectStatus(await deleteFacet(owner, folderId, facet.id), 204, '7.27: delete')

    expect(
      (await facetsOf(owner, folderId)).map((each) => each.id),
      'it has left the listing',
    ).not.toContain(facet.id)

    const row = (await trashFacetsOf(member)).find((each) => each.id === facet.id)
    expect(
      row,
      "7.13: access to a trashed row is by membership at read time and never by who deleted, so the member who did not delete it sees it",
    ).toBeDefined()
    expect(
      {
        name: row?.name,
        kind: row?.kind,
        folder_id: row?.folder_id,
        is_owner: row?.is_owner,
        my_access: row?.my_access,
      },
      "the row carries what 7.13's other two carry, and for the same reason: the permanent delete is not one rule across the three kinds",
    ).toEqual({
      name: 'Notes',
      kind: 'shared_blank',
      folder_id: folderId,
      is_owner: false,
      my_access: 'can_edit',
    })
    expect(
      (await trashFacetsOf(stranger)).map((each) => each.id),
      'and a person outside the Folder sees nothing of it',
    ).not.toContain(facet.id)

    const restored = await restoreFacet(member, facet.id)
    expectStatus(
      restored,
      200,
      "7.27: restore is `facet.delete`'s bar, which is #228's own reading for Tasks -- restore sits beside trash",
    )
    expect(
      (await facetsOf(owner, folderId)).map((each) => each.id),
      'and it is back in the listing',
    ).toContain(facet.id)
    expect(
      (await facetPageOf(owner, folderId, facet.id)).blocks.map((b) => b.text),
      'with its document, which is what makes this a restore rather than a re-creation',
    ).toEqual(['kept writing'])
  })

  test("a Trash row's name is resolved, so a Work facet's follows its heading", async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-843 name')
    const heading = await writeFolderHeading(owner, folderId, 'Before')
    const facet = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    await deleteFacet(owner, folderId, facet.id)

    expect(
      (await trashFacetsOf(owner)).find((each) => each.id === facet.id)?.name,
      'the Trash row says what the tab said',
    ).toBe('Before')

    /* Renamed **after** it was trashed. A stored copy taken at delete time
       would answer "Before"; the resolved read answers the heading. */
    await app.db.execute(
      sql`UPDATE page_blocks SET text = 'After' WHERE id = ${heading}::uuid`,
    )
    expect(
      (await trashFacetsOf(owner)).find((each) => each.id === facet.id)?.name,
      "7.27 resolves a Work facet's name at read time, in Trash as everywhere else",
    ).toBe('After')
  })

  test('restoring is 409 while the Folder is trashed, and 409 when the heading is taken', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const trashedFolder = await sharedFolder(app, owner, 'AC-843 folder trashed')
    const inside = await createFacetOk(owner, trashedFolder, {
      kind: 'shared_blank',
      display_name: 'Inside',
    })
    await deleteFacet(owner, trashedFolder, inside.id)
    expectStatus(
      await owner.browser.json(`/folders/${trashedFolder}`, 'DELETE'),
      200,
      '7.4: the Folder goes to Trash',
    )
    expectStatus(
      await restoreFacet(owner, inside.id),
      409,
      "7.27: the Folder comes back as one entry and its facets ride its fate, which is 4.5's rule for a Task read one table over",
    )
    expect(
      (await facetRow(app.db, inside.id))?.deleted_at,
      'and the 409 restored nothing',
    ).not.toBeNull()

    const folderId = await sharedFolder(app, owner, 'AC-843 heading taken')
    const heading = await writeFolderHeading(owner, folderId, 'Contested')
    const first = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    await deleteFacet(owner, folderId, first.id)
    const second = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })
    expectStatus(
      await restoreFacet(owner, first.id),
      409,
      "4.30's partial unique index does not pre-empt the collision, so it is raised here -- on restore -- rather than by reserving the heading for thirty days",
    )
    expect(
      (await facetsOf(owner, folderId)).filter((each) => each.kind === 'work')
        .map((each) => each.id),
      'and the live Work facet is still the second one',
    ).toEqual([second.id])
  })

  test('the permanent delete is Full control with ownership ignored, and takes the document with it', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-843 destroy', [
      [member, 'full_control'],
    ])
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Doomed',
    })
    const blockId = crypto.randomUUID()
    await writeFacetParagraph(owner, folderId, facet.id, blockId, 'goes with it')
    await deleteFacet(owner, folderId, facet.id)

    /* The actor holds Full control and owns nothing, which is the case
       `folder.destroy` would refuse and `task.destroy` admits. */
    expectStatus(
      await destroyFacet(member, facet.id),
      204,
      "7.13's 2026-09-20 correction applied to the third kind: Full control with ownership ignored",
    )
    expect(
      await facetRow(app.db, facet.id),
      'the row is gone',
    ).toBeUndefined()
    const blocks = await rows(
      app.db,
      sql`SELECT id FROM page_blocks WHERE id = ${blockId}::uuid`,
    )
    expect(
      blocks,
      "and its document went with it by `page_blocks_facet_id_fkey`'s CASCADE: a facet's blocks are the facet's",
    ).toEqual([])
    expect(
      (await trashFacetsOf(owner)).map((each) => each.id),
      'and Trash no longer offers it',
    ).not.toContain(facet.id)
  })

  test("the 11.7 pass destroys a facet trashed more than thirty days ago, and spares one trashed today", async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-843 purge')
    const doomed = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Old',
    })
    const recent = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Recent',
    })
    const blockId = crypto.randomUUID()
    await writeFacetParagraph(owner, folderId, doomed.id, blockId, 'goes')
    await deleteFacet(owner, folderId, doomed.id)
    await deleteFacet(owner, folderId, recent.id)

    /* There is no endpoint for the passage of time, so the clock is moved and
       nothing else is: every other fact about the row is what the delete
       endpoint wrote. The same move `reclaim-harness` makes for 7.19. */
    await ageFacetTrash(app.db, doomed.id)

    await runPass(app)

    expect(
      await facetRow(app.db, doomed.id),
      '7.13 destroys a trashed row after thirty days, and 11.7 is the pass that does it. **This is the arm nothing else in the suite watches**, the pass being a callable rather than a route',
    ).toBeUndefined()
    expect(
      await rows(app.db, sql`SELECT id FROM page_blocks WHERE id = ${blockId}::uuid`),
      'and its blocks went with it',
    ).toEqual([])

    expect(
      (await facetRow(app.db, recent.id))?.deleted_at,
      'a facet trashed today is untouched, which is the line the window must not have moved',
    ).not.toBeNull()
    expect(
      (await trashFacetsOf(owner)).map((each) => each.id),
      'and it is still in Trash, still restorable',
    ).toContain(recent.id)

    const natives = await facetsOf(owner, folderId)
    expect(
      natives.map((each) => each.kind),
      "and the pass took no live facet with it: it claims on `deleted_at`, which a native never has",
    ).toEqual(['main', 'purpose', 'consultation', 'results'])
  })
})
