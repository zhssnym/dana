/*
AC-674: `my_access` on the 7.4 Folder object is the **viewer's own**
membership preset, and never the owner's.

Authority: Hassan's Ruling 4 of 2026-09-20 on issue #228,
https://github.com/zhssnym/dana/issues/228#issuecomment-5751449643, which adds
the field and requires in terms that "the criterion must assert the field is
the **viewer's own** row and not the owner's -- that is the mistake this shape
invites". 7.4's dated amendment of the same day carries it into frozen section
7.

## Why this criterion exists rather than a schema test

The field is one column on a query that already joins the viewer's membership
row, and it would be easy to believe that nothing can go wrong with it. Two
things can, and neither shows up on a folder made by the person reading it:

- **the owner's row instead of the viewer's.** `folderSelect` has
  `f.owner_id` two lines above the new column, because `is_owner` is computed
  from it, so a subquery onto the owner's membership is a plausible slip and
  produces a response that is *correct for the owner* and wrong for everybody
  else.
- **the preset inferred rather than read.** #209 R8A's first rule is never to
  infer Access from ownership, and `is_owner` is right beside the new field.

Both are invisible in the case every other folder test uses -- one person who
is owner, sole member and reader at once. So every case here is a **shared**
folder whose owner's preset is *deliberately different from, and lower than*,
the reader's. That is R5's worked case: the founder keeps custody and drops to
an operating preset below the administrator they delegated to.

`forcePreset` is how the owner gets there. The API refuses to leave the owner
demoted by anybody else's hand, which is R5 and the continuity invariant doing
their jobs; the fixture writes the column, and AC-521 and AC-522 are the
criteria that drive that transition through the endpoint that records it.

## What the last case adds

Reading the right column is necessary and not sufficient: the field exists so
a surface can decide what to draw without a second request. So the last case
takes the projection the wire actually carried, asks
`shared/folder-actions.ts` -- the same table the routes resolve against --
what it permits, and compares that against what the route **did**. A
projection that predicts the server for three viewers at three presets is one
a menu can be built on, which is what `shell/app-sidebar.tsx` now does through
`lib/folder-authority.ts`.

Spec: 7.4 as amended 2026-09-20, 7.0's Folder object, 4.4 as widened by
migration 0023; #209 R8A, R5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  forcePreset,
  sharedFolder,
  storedPreset,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { mayPerform } from '../../src/shared/folder-actions.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'admin', 'helper', 'stranger'], 'ac674')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface FolderRow {
  id: string
  is_owner: boolean
  is_default: boolean
  my_access: FolderAccessPreset
}

/** One folder out of this actor's `GET /folders`, by id. */
async function folderFromList(
  actor: Actor,
  folderId: string,
): Promise<FolderRow | undefined> {
  const response = await actor.browser.api('/folders')
  expectStatus(response, 200, 'GET /folders answers the bare array (7.4)')
  const rows = response.json() as FolderRow[]
  return rows.find((row) => row.id === folderId)
}

/** The Folder object of `GET /folders/:id`, with its roster. */
async function folderDetail(
  actor: Actor,
  folderId: string,
): Promise<
  FolderRow & {
    members: { user: { id: string }; access: FolderAccessPreset }[]
  }
> {
  const response = await actor.browser.api(`/folders/${folderId}`)
  expectStatus(response, 200, 'GET /folders/:id answers the folder (7.4)')
  return response.json() as FolderRow & {
    members: { user: { id: string }; access: FolderAccessPreset }[]
  }
}

/**
 * The folder every case reads: the owner demoted to Can view, an
 * administrator at Full control who owns nothing, and a third member at a
 * preset that is neither.
 *
 * Three presets rather than two on purpose. With two, a projection that
 * returned "the other person's" preset would pass; with three, only the
 * reader's own value satisfies every reader.
 */
async function threeWayFolder(
  owner: Actor,
  admin: Actor,
  helper: Actor,
  name: string,
): Promise<string> {
  const folderId = await sharedFolder(app, owner, name, [
    [admin, 'full_control'],
    [helper, 'can_comment'],
  ])
  await forcePreset(app.db, folderId, owner.id, 'can_view')
  return folderId
}

describe('AC-674 my_access is the viewer’s own membership row', () => {
  test('AC-674: three members of one folder read three different presets from GET /folders', async () => {
    const [owner, admin, helper] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await threeWayFolder(
      owner,
      admin,
      helper,
      'ac674 three presets',
    )

    const expected: readonly (readonly [Actor, FolderAccessPreset])[] = [
      [owner, 'can_view'],
      [admin, 'full_control'],
      [helper, 'can_comment'],
    ]

    for (const [actor, preset] of expected) {
      // The column is the authority (#209 R9 section 12: the record is
      // authoritative and its renderings are not), so the fixture is checked
      // against it before the projection is asked anything.
      expect(
        await storedPreset(app.db, folderId, actor.id),
        'the fixture put the preset this case is about on the membership row',
      ).toBe(preset)

      const row = await folderFromList(actor, folderId)
      expect(row, 'every member of the folder lists it').toBeDefined()
      expect(
        row?.my_access,
        `GET /folders must answer this reader's own preset (${preset}), not somebody else's`,
      ).toBe(preset)
    }

    /* The failure this criterion exists for, said once more as an inequality
       so that a red names it. If the projection read the owner's membership
       row -- the plausible slip, `f.owner_id` sitting two lines above the new
       column in `folderSelect` -- every reader here would answer `can_view`. */
    const adminRow = await folderFromList(admin, folderId)
    expect(
      adminRow?.my_access,
      "a Full-control member must not be handed the owner's preset",
    ).not.toBe('can_view')
    const helperRow = await folderFromList(helper, folderId)
    expect(
      helperRow?.my_access,
      "a Can-comment member must not be handed the owner's preset either, nor the administrator's",
    ).not.toBe('can_view')
    expect(helperRow?.my_access).not.toBe('full_control')
  })

  test('AC-674: my_access and is_owner are two facts, and neither is read off the other', async () => {
    const [owner, admin, helper] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await threeWayFolder(
      owner,
      admin,
      helper,
      'ac674 custody apart from access',
    )

    const ownerRow = await folderFromList(owner, folderId)
    expect(ownerRow?.is_owner, 'the founder still holds custody').toBe(true)
    expect(
      ownerRow?.my_access,
      'and holds Can view, because R5 lets an owner operate below their custody',
    ).toBe('can_view')

    const adminRow = await folderFromList(admin, folderId)
    expect(adminRow?.is_owner, 'Full control confers no ownership').toBe(false)
    expect(adminRow?.my_access, 'and ownership is not what it reads').toBe(
      'full_control',
    )

    /* Both directions are now pinned on one folder: `is_owner` true with a low
       preset, and `is_owner` false with the highest one. A projection deriving
       either field from the other cannot produce both rows. */
  })

  test('AC-674: the list agrees with the detail, and with the reader’s own members element', async () => {
    const [owner, admin, helper] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await threeWayFolder(
      owner,
      admin,
      helper,
      'ac674 one value two reads',
    )

    for (const actor of [owner, admin, helper]) {
      const row = await folderFromList(actor, folderId)
      const detail = await folderDetail(actor, folderId)
      expect(
        detail.my_access,
        'the detail is the same Folder object the list carries',
      ).toBe(row?.my_access)

      const own = detail.members.find(
        (member) => member.user.id === actor.id,
      )
      expect(own, 'the reader is in the roster they can read').toBeDefined()
      expect(
        detail.my_access,
        "my_access is the reader's own members element, which is what makes it the viewer's",
      ).toBe(own?.access)
    }

    /* And the one comparison that separates "my own element" from "the first
       element": the owner's element is not the administrator's value. */
    const asAdmin = await folderDetail(admin, folderId)
    const ownersElement = asAdmin.members.find(
      (member) => member.user.id === owner.id,
    )
    expect(ownersElement?.access, "the owner's element still reads Can view").toBe(
      'can_view',
    )
    expect(
      asAdmin.my_access,
      "and the administrator's my_access is not that element",
    ).not.toBe(ownersElement?.access)
  })

  test('AC-674: a reader who is not a member is offered no Folder object at all', async () => {
    const [owner, admin, helper, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await threeWayFolder(
      owner,
      admin,
      helper,
      'ac674 nothing leaks',
    )

    expect(
      await folderFromList(stranger, folderId),
      'GET /folders is scoped by the membership join (10.2), so there is no row to carry a preset',
    ).toBeUndefined()
    expectStatus(
      await stranger.browser.api(`/folders/${folderId}`),
      404,
      'and the detail is 404 rather than 403, which is 10.2 and never confirms the folder exists',
    )
  })

  test('AC-674: the preset the wire carried predicts what the route does', async () => {
    const [owner, admin, helper] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await threeWayFolder(
      owner,
      admin,
      helper,
      'ac674 predicts the route',
    )

    /* `mayPerform` wants two fields no projection reads -- the folder's id and
       the actor's, which ride the server's facts because the share-grant email
       renders the name. Spelled once here for the same reason
       `lib/folder-authority.ts` spells them once. */
    const notRead = { folderId: '', actorId: '', name: '' } as const

    // Rename first, because it is the non-destructive half and a success only
    // changes the folder's name.
    for (const actor of [owner, helper, admin]) {
      const row = await folderFromList(actor, folderId)
      expect(row, 'every member lists the folder').toBeDefined()
      const facts = {
        ...notRead,
        access: row?.my_access as FolderAccessPreset,
        isOwner: row?.is_owner === true,
        isDefault: row?.is_default === true,
      }
      const predicted = mayPerform(facts, 'folder.profile.edit').allowed
      const response = await actor.browser.json(
        `/folders/${folderId}`,
        'PATCH',
        { name: `ac674 renamed by ${row?.my_access ?? 'nobody'}` },
      )
      expectStatus(
        response,
        predicted ? 200 : 403,
        `the projection said folder.profile.edit was ${String(predicted)} for ${String(row?.my_access)}; the route must agree (accepted #209 R8A)`,
      )
    }

    // Trash last, because a success ends the folder. The two refusals run
    // first and the permitted one closes the case.
    for (const actor of [owner, helper, admin]) {
      const row = await folderFromList(actor, folderId)
      const facts = {
        ...notRead,
        access: row?.my_access as FolderAccessPreset,
        isOwner: row?.is_owner === true,
        isDefault: row?.is_default === true,
      }
      const predicted = mayPerform(facts, 'folder.trash').allowed
      const response = await actor.browser.api(`/folders/${folderId}`, {
        method: 'DELETE',
      })
      expectStatus(
        response,
        predicted ? 200 : 403,
        `the projection said folder.trash was ${String(predicted)} for ${String(row?.my_access)}; the route must agree (Hassan's ruling of 2026-09-20)`,
      )
    }

    /* What that pair proves together is the whole point of the field. The
       owner was refused both -- custody is not authority -- and the
       Full-control member who owns nothing performed both. Those are exactly
       the two defects the Library row carried while it gated on `is_owner`,
       and they are now decidable from one list response. */
  })
})
