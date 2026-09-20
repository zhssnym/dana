/*
AC-011: given a member holding Can view, when they rename the folder or set
its icon, colour, cover or description, then 403 to each, and the folder's
identity is unchanged for every member; given a non-member, then 404 rather
than 403.

## What this criterion said, and what moved it

**It read:** "given a non-owner member, when renaming the folder, then 403."
That was the DES-225 split of RFC 0005 -- the folder's *name* was the owner's
and the rest of its 4.3 identity was any member's -- and 5.4's matrix marked
rename owner-only to match.

**It now reads** what the header above says. The split is gone in both
directions: a folder's name and its dressing are one thing, they are ordinary
shared Folder work, and they are changed by Can edit and above and by nobody
below.

**The record that authorises it is accepted #209 R8A**, "Status: ACCEPTED by
owner", which defines Can edit as "plan/change all shared Folder work" and Can
view as "read only". The old rule contradicted it in both directions at once:
a **Can-view** member could repaint a folder they may not otherwise touch, and
a **Full-control member who was not the owner** could not rename it. Hassan's
ruling of 2026-09-20 made the change and corrected the authority the branch had
cited, which was R7 -- marked "(PROPOSED, not accepted)" in #209 and superseded
by R8A. The ruling is
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.

## Why the actor is Can view and not "a non-owner member"

The old actor was a member at no particular standing, which under the flat
model was the only kind there was. Under R8A "a non-owner member" no longer
names one answer: a Full-control one renames, a Can-view one does not. So this
file takes the **lowest** preset, which is the half of the new rule that is a
refusal, and AC-012's file takes a **Full-control non-owner**, which is the
half that is a grant. Between them they distinguish the new rule from the old
one, which neither could do with an actor whose standing was incidental.

The dressing fields are driven here too, and that is the part that is easy to
miss: under the superseded rule a Can-view member could set every one of them
and answer 200. This is the criterion that would have gone on passing while
that stayed true.

7.0's grammar of refusals is asserted around it as before: a member who can
see the folder and may not act gets 403, while a non-member must get 404 and
never 403, so that the response cannot leak the folder's existence.

Spec: 5.4, 7.0, 7.4, 10.2; accepted #209 R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'])

interface Stage {
  owner: Actor
  viewer: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined

const FOLDER_NAME = 'p2 ac011 shared'

/*
Staged lazily, the holder() pattern of the P1 files: a broken setup call
fails under the first test's name with the missing endpoint spelled out,
rather than as one anonymous beforeAll error that hides the criteria.
*/
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, viewer, stranger] = await cast.of(app)
    if (owner === undefined || viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, viewer.id)
    const folderId = await createFolder(owner, FOLDER_NAME)
    await addMemberOk(owner, folderId, viewer.id, 'can_view')
    staged = { owner, viewer, stranger, folderId }
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

describe("AC-011: a folder's identity is refused below Can edit", () => {
  test('AC-011: a Can-view member renaming the folder answers 403', async () => {
    const { viewer, folderId } = await stage()
    const response = await viewer.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac011 renamed by a viewer',
    })
    expectStatus(
      response,
      403,
      'accepted R8A: Can view is read only, and a folder\'s name is shared Folder work (spec 7.4)',
    )
  })

  test('AC-011: and the dressing with it -- icon, colour, cover and description', async () => {
    /* The half the superseded rule allowed. Each field is driven on its own
       so that a partial implementation -- one that gated the name and left
       the rest ungated, which is exactly what DES-225 specified -- fails
       naming the field it let through rather than passing on the first. */
    const { viewer, folderId } = await stage()
    const bodies: readonly [string, Record<string, unknown>][] = [
      ['icon', { icon: 'leaf' }],
      ['color', { color: '#33AA55' }],
      ['description', { description: 'p2 ac011 described by a viewer' }],
      ['cover_preset', { cover_preset: 'dusk' }],
    ]
    for (const [field, body] of bodies) {
      const response = await viewer.browser.json(
        `/folders/${folderId}`,
        'PATCH',
        body,
      )
      expectStatus(
        response,
        403,
        `accepted R8A: a folder's ${field} is ordinary shared Folder work, which Can view may not change (spec 4.3, 7.4)`,
      )
    }
  })

  test('AC-011: the refused writes changed nothing for any member', async () => {
    const { owner, viewer, folderId } = await stage()
    for (const person of [owner, viewer]) {
      const entry = await folderInList(person, folderId)
      expect(
        entry?.name,
        'a 403 rename must leave the name unchanged (accepted R8A)',
      ).toBe(FOLDER_NAME)
      expect(
        entry?.icon,
        'and the refused icon must not have landed either',
      ).toBeNull()
      expect(
        entry?.color,
        'and the refused colour must not have landed either',
      ).toBeNull()
      expect(
        entry?.description,
        'and the refused description must not have landed either',
      ).toBeNull()
    }
  })

  test('AC-011 adversarial: the member still sees the folder after the refusal', async () => {
    // 403 is authenticated, visible, not permitted (7.0); the refusal must
    // not have cost the member anything.
    const { viewer, folderId } = await stage()
    const entry = await folderInList(viewer, folderId)
    expect(
      entry,
      'the refused member must still be a member (spec 5.4)',
    ).toBeDefined()
  })

  test('AC-011 adversarial: a non-member renaming answers 404, never 403', async () => {
    const { stranger, folderId } = await stage()
    const response = await stranger.browser.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac011 renamed by stranger' },
    )
    expectStatus(
      response,
      404,
      'an inaccessible folder must read as nonexistent (spec 7.0, 10.2)',
    )
  })

  test('AC-011 adversarial: no session answers 401', async () => {
    const { folderId } = await stage()
    const anonymous = app.browser()
    const response = await anonymous.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac011 renamed by nobody' },
      { csrf: 'omit' },
    )
    expectStatus(response, 401, 'no valid session must answer 401 (spec 7.0)')
  })

  test('AC-011: invariants hold afterwards', async () => {
    const { owner, viewer, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, viewer.id, stranger.id],
    )
  })
})
