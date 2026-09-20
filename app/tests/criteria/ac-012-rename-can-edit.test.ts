/*
AC-012: given a member holding Can edit or above -- the owner, and equally a
member holding Full control who is not the owner -- when renaming, then 200
and every member reads the new name.

## What this criterion said, and what moved it

**It read:** "given the owner, when renaming, then 200 and every member reads
the new name." Its actor was the structural owner, so it held after the rule
moved for a reason that had nothing to do with the rule: the owner holds
custody *and*, since migration 0023, Full control. **It passed by luck**, and
a criterion that passes for the wrong reason proves nothing about the decision
it is supposed to pin.

**It now reads** what the header above says, and the actor that carries it is
a **Full-control member who is not the owner** -- the actor the superseded
rule refused. AC-011's file takes the other side with a **Can-view** member.
Between them the two files distinguish the new rule from the old one; neither
could do it alone.

**The record that authorises it is accepted #209 R8A**, "Status: ACCEPTED by
owner": Can edit may "plan/change all shared Folder work", and a folder's name
is shared Folder work. The old DES-225 split made the name the owner's and the
dressing any member's, which contradicted R8A in both directions at once.
Hassan's ruling of 2026-09-20 made the change and corrected the authority the
branch had cited -- R7, marked "(PROPOSED, not accepted)" in #209 and
superseded by R8A. The ruling is
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.

## What else is here

Around the criterion sit the rules that make the endpoint honest, each with
its own way of failing silently: the 10.3 length limits (1 to 100), the
amended 7.0 taxonomy (wrong-typed fields answer 422 naming the field, while
a body that is not a JSON object answers 400, the mapping the P1 merge ruled
and the P2 row holds at this package's gate), the tolerance of unknown
fields, the rename of a default folder that 7.4 explicitly allows, and the
7.4 list order (is_default first, then lower(name), then id), which a rename
must re-rank. Those are the owner's own folders and are unaffected by the
Access change; they stay with the owner.

Spec: 7.0, 7.4, 10.3; accepted #209 R8A; RFC 0001 P2 row for the held 400
mapping.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  listFolders,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'reader'])

interface Stage {
  owner: Actor
  /** Full control, and owns nothing. The actor the superseded rule refused. */
  deputy: Actor
  /** Can view, so that "every member reads the new name" is read by somebody
   * who could not have written it. */
  reader: Actor
  folderId: string
  secondFolderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, deputy, reader] = await cast.of(app)
    if (owner === undefined || deputy === undefined || reader === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, deputy.id)
    await connect(app.db, owner.id, reader.id)
    const folderId = await createFolder(owner, 'p2 ac012 bbb')
    const secondFolderId = await createFolder(owner, 'p2 ac012 mmm')
    await addMemberOk(owner, folderId, deputy.id, 'full_control')
    await addMemberOk(owner, folderId, reader.id, 'can_view')
    staged = { owner, deputy, reader, folderId, secondFolderId }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-012: Can edit and above rename, and every member reads it', () => {
  test('AC-012: a Full-control member who is not the owner renames, 200', async () => {
    /* The case the criterion turns on. Under the superseded DES-225 split
       this actor -- every bit of authority over the folder except custody --
       answered 403 here, which is the contradiction with accepted R8A the
       ruling names. */
    const { deputy, folderId } = await stage()
    const entry = await folderInList(deputy, folderId)
    expect(
      entry?.is_owner,
      'the actor must not be the owner, or this case proves the old rule (accepted R8A)',
    ).toBe(false)

    const response = await deputy.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac012 renamed by the deputy',
    })
    expectStatus(
      response,
      200,
      'accepted R8A: Full control plans and changes all shared Folder work, the name included, and confers no ownership (spec 7.4)',
    )
    expect(
      (await folderInList(deputy, folderId))?.is_owner,
      'and the rename moved no custody: Access is not ownership (accepted R8A)',
    ).toBe(false)
  })

  test('AC-012: the owner renames too, and the body is what a fresh GET reads', async () => {
    const { owner, folderId } = await stage()
    const response = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac012 renamed',
    })
    expectStatus(
      response,
      200,
      'PATCH /folders/:id by the owner must answer 200 (spec 7.4)',
    )
    // Ruled at the shape review into frozen 7.4: mutations answer what a
    // fresh GET would, so the PATCH body is the Folder object as the list
    // then reads it, the PATCH /me convention carried over.
    const fresh = await folderInList(owner, folderId)
    expect(
      response.json(),
      'the rename body must equal the folder entry a fresh GET answers (7.4 as ruled at the shape review)',
    ).toEqual(fresh)
  })

  test('AC-012: every member reads the new name, Can view included', async () => {
    const { owner, deputy, reader, folderId } = await stage()
    for (const viewer of [owner, deputy, reader]) {
      const entry = await folderInList(viewer, folderId)
      expect(
        entry?.name,
        'every member must read the renamed folder whatever their Access (spec 7.4)',
      ).toBe('p2 ac012 renamed')
    }
  })

  test('AC-012 adversarial: the rename re-ranks the 7.4 list order', async () => {
    // Sort is is_default first, then lower(name), then id. The renamed
    // folder ("renamed") must now sort after "mmm", and the comparison must
    // be case-insensitive, which an ORDER BY name gets wrong.
    const { owner, folderId, secondFolderId } = await stage()
    const upper = await owner.browser.json(
      `/folders/${secondFolderId}`,
      'PATCH',
      { name: 'P2 AC012 MMM' },
    )
    expectStatus(upper, 200, 'the case-only rename must answer 200 (spec 7.4)')

    const defaultId = await defaultFolderOf(app.db, owner.id)
    const list = await listFolders(owner)
    const ranks = new Map(list.map((entry, index) => [entry.id, index]))
    const rankOf = (id: string): number => {
      const rank = ranks.get(id)
      expect(rank, `folder ${id} must appear in the owner list`).toBeDefined()
      return rank ?? -1
    }
    expect(
      rankOf(defaultId),
      'the default folder sorts first (spec 7.4)',
    ).toBeLessThan(rankOf(secondFolderId))
    expect(
      rankOf(secondFolderId),
      'lower(name) ordering must rank "P2 AC012 MMM" before "p2 ac012 renamed" (spec 7.4)',
    ).toBeLessThan(rankOf(folderId))
  })

  test('AC-012 adversarial: the default folder renames too', async () => {
    const { owner } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    const response = await owner.browser.json(`/folders/${defaultId}`, 'PATCH', {
      name: 'p2 ac012 inbox renamed',
    })
    expectStatus(
      response,
      200,
      'renaming the default folder is allowed (spec 7.4: works for the default folder too)',
    )
    const entry = await folderInList(owner, defaultId)
    expect(entry?.name).toBe('p2 ac012 inbox renamed')
    expect(
      entry?.is_default,
      'a renamed default folder keeps is_default (INV-2)',
    ).toBe(true)
  })

  test('AC-012 adversarial: name length limits answer 422 at both edges', async () => {
    const { owner, folderId } = await stage()
    for (const name of ['', 'x'.repeat(101)]) {
      const response = await owner.browser.json(
        `/folders/${folderId}`,
        'PATCH',
        { name },
      )
      expectStatus(
        response,
        422,
        `a folder name of length ${String(name.length)} is outside 1 to 100 and must answer 422 (spec 10.3)`,
      )
    }
    const hundred = 'p2 ac012 '.concat('y'.repeat(91))
    expect(hundred.length, 'the boundary probe must be exactly 100').toBe(100)
    const response = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: hundred,
    })
    expectStatus(
      response,
      200,
      'a 100-character name is inside the limit and must answer 200 (spec 10.3)',
    )
  })

  test('AC-012 adversarial: a wrong-typed name answers 422, unknown fields are tolerated', async () => {
    const { owner, reader, folderId } = await stage()
    const wrongType = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 123,
    })
    expectStatus(
      wrongType,
      422,
      'a wrong-typed field on a parsed object is a validation failure (spec 7.0)',
    )

    const tolerated = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac012 final',
      unknown_field: 'ignored',
    })
    expectStatus(
      tolerated,
      200,
      'unknown fields on a parsed object are tolerated (spec 7.0)',
    )
    const entry = await folderInList(reader, folderId)
    expect(entry?.name).toBe('p2 ac012 final')
  })

  test('AC-012 adversarial: bodies that are not JSON objects answer 400', async () => {
    // The mapping the P1 merge ruled and this package's gate holds: a body
    // that does not parse, and one that parses to a non-object, are both
    // malformed (7.0; RFC 0001 P2 row).
    const { owner, folderId } = await stage()
    const cases: readonly [string, string][] = [
      ['not json {', 'a body that does not parse as JSON'],
      ['["p2 ac012"]', 'a body that parses to an array'],
      ['"p2 ac012"', 'a body that parses to a string'],
    ]
    for (const [body, what] of cases) {
      const response = await owner.browser.api(`/folders/${folderId}`, {
        method: 'PATCH',
        body,
        headers: { 'content-type': 'application/json' },
      })
      expectStatus(
        response,
        400,
        `${what} is malformed and must answer 400 (spec 7.0)`,
      )
    }
    const entry = await folderInList(owner, folderId)
    expect(
      entry?.name,
      'a malformed body must change nothing (spec 7.0)',
    ).toBe('p2 ac012 final')
  })

  test('AC-012 adversarial: an over-limit body answers 400', async () => {
    // The other held edge of the ruling: a body over the parse limit is a
    // body that did not parse, 400 and never 413. The name inside is
    // invalid, so if the limit were missing this would answer 422 and the
    // report would name the mapping instead of passing vacuously. The
    // limit is 10.3's 3 MB row since RFC 0005 change control item 18; the
    // padding sits above it.
    const { owner, folderId } = await stage()
    const oversized = JSON.stringify({
      name: '',
      padding: 'p'.repeat(3 * 1024 * 1024 + 1024),
    })
    const response = await owner.browser.api(`/folders/${folderId}`, {
      method: 'PATCH',
      body: oversized,
      headers: { 'content-type': 'application/json' },
    })
    expectStatus(
      response,
      400,
      'an over-limit body is a body that did not parse and must answer 400, not 413 (spec 7.0; RFC 0001 P2 row)',
    )
  })

  test('AC-012: invariants hold afterwards', async () => {
    const { owner, deputy, reader, folderId, secondFolderId } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    await expectFolderInvariants(
      app.db,
      [folderId, secondFolderId, defaultId],
      [owner.id, deputy.id, reader.id],
    )
  })
})
