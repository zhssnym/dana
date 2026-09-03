/*
AC-371: given a picture stored with no folder, when its owner asks for it,
then the bytes; when anybody else does, then the 10.2 not-found shape; and an
avatar, which is also folder-less, stays readable by any signed-in account.
The same three arms decide which file id a person may point a cover at.

**This is the definition issue #20 actually turns on, and it did not exist
before this change.** Imran ruled that "pictures should belong to the user
instead of only a folder"; that is a product statement, and the question it
leaves open is who may then *see* one. `serveFile`'s answer used to be a
single clause — `f.folder_id IS NULL` — admitting every folder-less row to
every signed-in account, with a comment giving avatars as the reason: "profile
pictures being what member lists render". That was true while avatars were the
only folder-less rows there could be. It stops being true the moment a person
can upload a cover of their own, and it fails **open**: every personal cover
picture in Dana would be readable by anyone holding a uuid. Measured before the
fix, on the PGlite leg, a second account's `GET /api/v1/files/:id` against a
folder-less `cover` row with real bytes answered **200**.

**So the rule is: a folder-scoped file is its members', an avatar is
everybody's, and every other folder-less file is its owner's alone.** All three
arms are asserted below, because the middle one is a behaviour that must
*survive* the narrowing and the third is the narrowing itself.

**And the same predicate decides a cover's target, which is the second half.**
A gate that refused the bytes but let the id be stored would leave a person
wearing a cover that draws as a broken image forever, and would confirm to
them that a file with that id exists. `readableFileScope` in
`domain/files.ts` is one definition imported by `serveFile`, `putPlaceCover`
and `patchShelf`, rather than the three transcriptions that had already
drifted — `domain/covers.ts` carried a copy under a comment claiming it was
"restated as a scope rather than re-derived", and the copy admitted anyone's
folder-less file to anyone. Measured before the fix: a second account's
`PUT /place-covers/today { file_id: <the first's folder-less file> }` answered
**200**.

Spec: 4.16 and 7.15 as widened for issues #20 and #100, 7.19, 10.2.
*/
import { afterAll, beforeAll, describe, test } from 'vitest'

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
import { ONE_PIXEL_PNG, upload, uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac371')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-371 a picture with no folder belongs to one person', () => {
  test('owner reads it, nobody else does, an avatar stays everybody’s, and the cover gate agrees', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]

    const loose = await uploadCoverOk(owner, null, 'ac371-loose.png')

    const asOwner = await owner.browser.request(`/api/v1/files/${loose}`, {
      method: 'GET',
    })
    expectStatus(
      asOwner,
      200,
      'the person whose picture it is reads it (spec 7.15)',
    )

    const asStranger = await stranger.browser.request(
      `/api/v1/files/${loose}`,
      { method: 'GET' },
    )
    expectStatus(
      asStranger,
      404,
      'and nobody else does: a picture that belongs to a person is that person’s (10.2). This answered 200 before issues #20 and #100',
    )

    // Sharing a folder with the owner buys nothing here, which is the point of
    // "belongs to the person" rather than "belongs to a folder".
    await connect(app.db, owner.id, member.id)
    const shared = await createFolder(owner, 'ac371 shared folder')
    await addMemberOk(owner, shared, member.id)
    const asFellowMember = await member.browser.request(
      `/api/v1/files/${loose}`,
      { method: 'GET' },
    )
    expectStatus(
      asFellowMember,
      404,
      'a folder in common does not reach a picture that is in no folder',
    )

    // The avatar arm, unchanged and load-bearing: a member list renders other
    // people's pictures, so an avatar is readable by any signed-in account.
    const avatar = await upload(
      owner,
      '/me/avatar',
      {},
      { name: 'ac371-face.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(avatar, 200, 'the avatar stores (spec 7.15)')
    const avatarUrl = String(
      (avatar.json() as { avatar_url?: unknown }).avatar_url,
    )
    // 7.15 publishes the avatar as its own serving path, so the URL is used
    // as given rather than rebuilt from an id this test would have to parse.
    const asStrangerAvatar = await stranger.browser.request(avatarUrl, {
      method: 'GET',
    })
    expectStatus(
      asStrangerAvatar,
      200,
      'another person’s avatar still serves, which is the behaviour the narrowing had to preserve (7.15)',
    )

    // A file inside a folder is still its members', which is the third arm and
    // is what a folder's shared cover depends on (4.3, one look for every
    // member).
    const inFolder = await uploadCoverOk(owner, shared, 'ac371-in-folder.png')
    expectStatus(
      await member.browser.request(`/api/v1/files/${inFolder}`, { method: 'GET' }),
      200,
      'a folder-scoped picture is its members’ (4.16)',
    )
    expectStatus(
      await stranger.browser.request(`/api/v1/files/${inFolder}`, { method: 'GET' }),
      404,
      'and no one else’s (AC-195, unchanged)',
    )

    // The cover gate answers with the same predicate, both ways round.
    const strangerWears = await stranger.browser.json(
      '/place-covers/today',
      'PUT',
      { file_id: loose },
    )
    expectStatus(
      strangerWears,
      404,
      'a place cover cannot name a picture the caller cannot read (7.19). This answered 200 before issues #20 and #100',
    )

    const ownerWears = await owner.browser.json('/place-covers/today', 'PUT', {
      file_id: loose,
    })
    expectStatus(
      ownerWears,
      200,
      'while the picture’s own person wears it on Today, which is #20’s headline: a built-in page can hold a photograph',
    )
  })
})
