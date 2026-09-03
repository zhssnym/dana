/*
AC-373: given the three kinds of page Dana lets a person decorate, then each
can wear an uploaded picture, and the picture's scope matches the page's: a
shelf's and a place page's cover is a folder-less file of the person's own,
and a folder's cover is a file of that folder, readable by every member.

**This is issue #20's headline, and the rule under it is the part that is not
obvious.** Imran ruled that folders, shelves and the built-in pages get the
same cover options and that pictures belong to the person. It does not follow
that one uploaded picture can serve all three, and it must not: a folder's
cover is "one look for every member" (4.3, pricing decision D1), so a
folder-scoped file is the only kind its members can read; a shelf is private
by construction (4.18, DES-195/196) and a place cover is per viewer (4.20), so
theirs belong to the person. **A folder cover made from a person's private
picture would draw for its author and be broken for everybody else in the
folder**, which is why `patchFolderProfile` refuses one and why that refusal
is asserted here rather than left as an accident of an older rule.

So the wire rule, which is the thing a picker has to know: **upload with a
`folder_id` when the page is a folder, and without one when it is a shelf or a
place.**

Two of the three arms were reachable before this change and one was not, which
is worth stating precisely because #20's own account of it is wrong. A place
page could already hold a picture — `PUT /place-covers/:place { file_id }` has
taken one since 4.20 was built, measured at 200 on the wire before any of this
work — it just had no picture to hold that was not some folder's. A shelf could
hold nothing at all: no route wrote `shelves.cover_file_id` (issue #100) and
the table had no preset column.

Spec: 4.3, 4.18, 4.20, 7.4, 7.15, 7.16, 7.19, all as widened by issues #20 and
#100 (migration 0012).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac373')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-373 every page kind wears a picture, scoped as the page is', () => {
  test('one folder-less picture dresses a shelf and Today; a folder needs its own', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]

    const mine = await uploadCoverOk(owner, null, 'ac373-mine.png')

    // 1. A shelf. Nothing could do this at all before issue #100.
    const madeShelf = await owner.browser.json('/shelves', 'POST', {
      name: 'ac373 shelf',
    })
    expectStatus(madeShelf, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((madeShelf.json() as { id?: unknown }).id)
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: mine,
      }),
      200,
      'the shelf wears the person’s own picture (7.16 as widened)',
    )
    const shelfRead = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (shelfRead.json() as { cover_file_id?: unknown }).cover_file_id,
      'and reads it back',
    ).toBe(mine)

    // 2. A built-in place page, from the same upload.
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', { file_id: mine }),
      200,
      'Today wears the same picture (7.19)',
    )
    const covers = await owner.browser.json('/place-covers', 'GET')
    expectStatus(covers, 200, 'the caller reads their own covers (7.19)')
    const today = (
      covers.json() as { covers?: Array<{ place?: unknown; file_id?: unknown }> }
    ).covers?.find((entry) => entry.place === 'today')
    expect(today?.file_id, 'and Today reads it back').toBe(mine)

    // And the bytes serve, so both pages draw rather than merely storing an id.
    expectStatus(
      await owner.browser.request(`/api/v1/files/${mine}`, { method: 'GET' }),
      200,
      'the picture both pages point at serves to the person (7.15)',
    )

    // 3. A folder. The same folder-less picture is refused, because a folder's
    //    cover is every member's to see and this one is nobody's but its
    //    owner's.
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac373 folder')
    await addMemberOk(owner, folderId, member.id)

    const refused = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      cover_file_id: mine,
    })
    expectStatus(
      refused,
      422,
      'a private picture cannot become a folder’s shared cover (4.3, D1): it would draw for its author and be broken for every other member',
    )

    const theFolders = await uploadCoverOk(owner, folderId, 'ac373-shared.png')
    expectStatus(
      await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
        cover_file_id: theFolders,
      }),
      200,
      'a picture uploaded into the folder becomes its cover (7.4)',
    )
    expectStatus(
      await member.browser.request(`/api/v1/files/${theFolders}`, {
        method: 'GET',
      }),
      200,
      'and every member can read it, which is what "one look for every member" needs',
    )

    // The gallery tier, which #20 says every page already had and which a
    // shelf in fact did not: a shelf can now wear a gradient too.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_preset: 'gradient-dusk',
      }),
      200,
      'a shelf wears a built-in cover (migration 0012)',
    )
    const asGradient = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (asGradient.json() as { cover_preset?: unknown }).cover_preset,
      'so all four page-dressing tiers now have a column behind them on every page kind',
    ).toBe('gradient-dusk')
  })
})
