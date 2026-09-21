/*
AC-846: a private facet does not outlive its owner's membership. Removal,
leaving and account deletion each delete it permanently, with its blocks, in
the same transaction; shared facets are untouched by all three.

Issue #210, **Ruling 6 of the addendum of 2026-09-21**,
https://github.com/zhssnym/dana/issues/210#issuecomment-5757696835, taken after
the adversarial review of 16ce81b found the orphan. Spec 4.30, 7.27, 8.10.

## What the orphan was

A private facet is writing no other member may ever read: `facet.read` admits
no preset at all, so Full control and the Folder's structural owner are refused
it along with everybody else. When the owner's membership ended, the row simply
stayed. Nobody could read it — its owner was no longer a member, so it was
absent from their Trash and from their listing, and every other member was
refused — and nobody could remove it, because both routes that could need a
membership that had ended. `folder_facets.owner_id` is `ON DELETE RESTRICT`
and 8.10 scrubs the `users` row rather than deleting it, so no clause anywhere
was ever going to fire.

## Why "permanently" rather than "to Trash"

The ruling's word, and the reason is the paragraph above one step later: a
trashed row here is unreadable and unrestorable by exactly the same people, and
has a thirty-day clock on it instead of none. Each case below therefore asserts
the row is **gone from the table**, not that `deleted_at` is set.

## The three paths, and why the third is the one that could have been missed

Removal and leaving both go through `removeMembership`. **Account deletion does
not**: 8.10 step 4 calls `runRClean` once per surviving membership, so a hook
on the caller would have covered two paths and silently missed the third. That
is the same argument `endResponsibilityStanding`'s own comment records, and it
is why the sweep is in `runRClean`. The third case drives `DELETE /me`.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus, signInActor } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetRow,
  facetsOf,
  sharedFolder,
  writeFacetParagraph,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac846')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  folderId: string
  member: Actor
  privateFacet: string
  privateBlock: string
  sharedFacet: string
  sharedBlock: string
}

/** One folder, one other member, one private facet of theirs with writing in
 * it, and one shared facet with writing in it. The shared one is the control:
 * a membership ending takes the first and not the second. */
async function stage(owner: Actor, slug: string): Promise<Stage> {
  const member = await signInActor(app, slug, 'ac846')
  cast.trackUser(member.id)
  const folderId = await sharedFolder(app, owner, `AC-846 ${slug}`, [
    [member, 'can_edit'],
  ])

  const privateFacet = (
    await createFacetOk(member, folderId, {
      kind: 'private_blank',
      display_name: 'Mine alone',
    })
  ).id
  const privateBlock = crypto.randomUUID()
  expectStatus(
    await writeFacetParagraph(member, folderId, privateFacet, privateBlock, 'my own writing'),
    200,
    'the member writes their own private facet',
  )

  const sharedFacet = (
    await createFacetOk(member, folderId, {
      kind: 'shared_blank',
      display_name: 'The Folder’s',
    })
  ).id
  const sharedBlock = crypto.randomUUID()
  expectStatus(
    await writeFacetParagraph(member, folderId, sharedFacet, sharedBlock, 'shared writing'),
    200,
    'and a shared one beside it',
  )

  return { folderId, member, privateFacet, privateBlock, sharedFacet, sharedBlock }
}

async function blockExists(blockId: string): Promise<boolean> {
  const found = await rows(
    app.db,
    sql`SELECT id FROM page_blocks WHERE id = ${blockId}::uuid`,
  )
  return found.length > 0
}

/** Both halves of the ruling, asserted together because either alone is
 * satisfiable by a wrong implementation: one that deletes nothing, and one
 * that deletes the folder's shared facets with the leaver. */
async function assertSwept(where: string, at: Stage): Promise<void> {
  expect(
    await facetRow(app.db, at.privateFacet),
    `${where}: the private facet is gone from the table. **Permanently, not to Trash** -- a trashed row here is unreadable by its former owner, who is no longer a member, unreadable by every other member, \`facet.read\` admitting no preset, and unrestorable by either`,
  ).toBeUndefined()
  expect(
    await blockExists(at.privateBlock),
    `${where}: and its blocks went with it, by page_blocks_facet_id_fkey`,
  ).toBe(false)

  const shared = await facetRow(app.db, at.sharedFacet)
  expect(
    shared,
    `${where}: the shared facet is Folder data and is untouched -- the same rule R-CLEAN keeps two statements away, where a leaver's Tasks are unassigned rather than deleted`,
  ).toBeDefined()
  expect(
    shared?.deleted_at,
    `${where}: and it is not in Trash either`,
  ).toBeNull()
  expect(
    await blockExists(at.sharedBlock),
    `${where}: with its writing still in it`,
  ).toBe(true)
}

describe("AC-846 a private facet does not outlive its owner's membership", () => {
  test('removal by an administrator takes it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const at = await stage(owner, 'removed')

    /* It is there first, which is what makes the sweep a sweep. */
    expect(
      (await facetsOf(at.member, at.folderId)).map((each) => each.id),
      'the member reads their own private facet while they are a member',
    ).toContain(at.privateFacet)

    const removed = await owner.browser.json(
      `/folders/${at.folderId}/members/${at.member.id}`,
      'DELETE',
    )
    expectStatus(removed, 204, '7.4: Full control removes a member')

    await assertSwept('after removal', at)
  })

  test('leaving takes it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const at = await stage(owner, 'left')

    const left = await at.member.browser.json(
      `/folders/${at.folderId}/my-membership`,
      'DELETE',
    )
    expectStatus(left, 204, '7.4: a member leaves')

    await assertSwept('after leaving', at)
  })

  test('account deletion takes it, and that is the path a hook on the caller would have missed', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const at = await stage(owner, 'deleted')

    /* 8.10 does not call `removeMembership`: it calls `runRClean` once per
       surviving membership. The sweep is in `runRClean` for exactly that
       reason, and this case is what says so. */
    const deleted = await at.member.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expectStatus(deleted, 204, '8.10: the account deletes itself')

    await assertSwept('after account deletion', at)

    expect(
      (await facetsOf(owner, at.folderId)).map((each) => each.id),
      "and the Folder's owner still reads the shared facet the departed member made",
    ).toContain(at.sharedFacet)
  })

  test('a private facet in the leaver’s own Folder goes with the Folder rather than with this sweep', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const at = await stage(owner, 'their-own')

    /* The owner's own private facet in their own Folder: the sweep is scoped
       to (folder, member), so this one is not the leaver's to take -- it is
       the Folder's owner's, and it survives the other member leaving. Asserted
       because a sweep written on `owner_id` alone would take every private
       facet that person has anywhere. */
    const theirs = (
      await createFacetOk(owner, at.folderId, {
        kind: 'private_blank',
        display_name: 'The owner’s own',
      })
    ).id

    await at.member.browser.json(`/folders/${at.folderId}/my-membership`, 'DELETE')

    expect(
      await facetRow(app.db, theirs),
      "the Folder owner's own private facet is untouched by another member leaving: the sweep is scoped to one membership, not to one person",
    ).toBeDefined()
    expect(
      (await facetsOf(owner, at.folderId)).map((each) => each.id),
      'and they still read it',
    ).toContain(theirs)
  })
})
