/*
AC-374: given a built-in place page, then the file it may wear is a picture
the caller can read — `kind` in (`cover`, `image`) — so another person's
avatar and the caller's own voice note are both refused, with one sentence
between them, and neither writes a row.

**This is the clause 7.16's shelf gate had and 7.19's place-cover gate did
not, and the gap is a defect of consistency rather than of confidentiality.**
`readableFileScope` deliberately admits every avatar to every signed-in
account, because a member list renders other people's pictures (7.15); place
covers are per viewer (4.20). So before this change a second account could
`PUT /place-covers/today { file_id: <someone else's avatar> }` and be answered
200, and the same PATCH against a shelf was 422 — measured on the wire, both
ways round. Nobody learned anything they could not already `GET`: the two real
faults are that a page could store a file it may not draw, and that the branch
claiming "a folder-less file is its owner's alone" left the one folder-less
kind that is not.

**The second arm is the one the shelf gate's own comment gives its reason
for**: "without it a `voice` note's id would be storable as one and drawn as a
broken image". A place cover had no such protection, so Today could be given a
voice note and would draw a broken picture, with the wrong mime, until
somebody removed it.

**And the refusal is 404, not the shelf's 422, which is deliberate.** 7.19
answers one sentence for every file it will not take — absent, unreadable, and
now not a picture — because that endpoint has always refused a file it cannot
use as not-found (10.2), and a second refusal shape would be a change to a
frozen section rather than a correction to it.

The last two cases are the guard against over-narrowing: the caller's own
folder-less `cover`, which is #20's headline, and an `image` from a folder
they are a member of, which is the shape a picture uploaded onto a folder page
already has. Both still land.

Spec: 4.16 and 7.15 as widened for issues #20 and #100, 4.20, 7.16, 7.19, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  ONE_PIXEL_PNG,
  upload,
  uploadCoverOk,
  uploadImageOk,
} from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac374')

interface CoversBody {
  covers?: Array<{ place?: unknown; file_id?: unknown }>
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-374 a place cover is a picture the caller can read', () => {
  test('another person’s avatar and one’s own voice note are refused; one’s own picture is not', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]

    const todayOf = async (
      actor: Actor,
    ): Promise<{ place?: unknown; file_id?: unknown } | undefined> => {
      const covers = await actor.browser.json('/place-covers', 'GET')
      expectStatus(covers, 200, 'a caller reads their own covers (spec 7.19)')
      return (covers.json() as CoversBody).covers?.find(
        (entry) => entry.place === 'today',
      )
    }

    // 1. Another person's avatar. `readableFileScope` admits it on purpose, so
    //    the read below is a 200 and the cover write must still be a 404: the
    //    two questions are "may this person see these bytes" and "may this
    //    page wear this file", and only the first one avatars answer yes to.
    const stored = await upload(
      stranger,
      '/me/avatar',
      {},
      { name: 'ac374-face.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(stored, 200, 'the avatar stores (spec 7.15)')
    const avatarUrl = String(
      (stored.json() as { avatar_url?: unknown }).avatar_url,
    )
    // Parsed rather than used as given, unlike AC-371's read of the same URL,
    // because what is under test here is the id in a request body rather than
    // a serving path. 7.15 publishes it as `/api/v1/files/:id`.
    const avatarId = avatarUrl.slice(avatarUrl.lastIndexOf('/') + 1)
    expect(
      avatarId,
      'the avatar URL 7.15 publishes ends in the file id this case needs',
    ).toMatch(/^[0-9a-f-]{36}$/)

    expectStatus(
      await owner.browser.request(avatarUrl, { method: 'GET' }),
      200,
      'another person’s avatar serves to any signed-in account, which is 7.15’s rule and is not what this criterion narrows',
    )

    const wearsAnAvatar = await owner.browser.json(
      '/place-covers/today',
      'PUT',
      { file_id: avatarId },
    )
    expectStatus(
      wearsAnAvatar,
      404,
      'and it is still not a cover: a place page wears a picture chosen as one, kind in (cover, image), which is 7.16’s clause for a shelf. This answered 200 before',
    )
    expect(
      await todayOf(owner),
      'a refused cover writes no row at all (4.20 admits none with neither a file nor a preset)',
    ).toBeUndefined()

    // The same file against a shelf, so that "the three cover gates agree" is
    // asserted rather than asserted about. The refusal shapes differ — 422
    // there, 404 here — because 7.16 faults a field of a shelf it found and
    // 7.19 refuses a file it will not take; what must not differ is which
    // files each will take.
    const madeShelf = await owner.browser.json('/shelves', 'POST', {
      name: 'ac374 shelf',
    })
    expectStatus(madeShelf, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((madeShelf.json() as { id?: unknown }).id)
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: avatarId,
      }),
      422,
      'a shelf has refused another person’s avatar all along, which is the clause 7.19 was missing (7.16)',
    )

    // 2. A file of the caller's own that is not a picture. The readable half
    //    of the predicate says yes to this one — it is their own upload — so
    //    only the kind clause can refuse it.
    const ownFolder = await createFolder(owner, 'ac374 own folder')
    const note = await upload(
      owner,
      '/files',
      { kind: 'voice', folder_id: ownFolder, duration_ms: '1200' },
      { name: 'ac374.webm', type: 'audio/webm', bytes: Buffer.from('sound') },
    )
    expectStatus(note, 201, 'the voice note stores (spec 7.15)')
    const noteId = String((note.json() as { id?: unknown }).id)
    const wearsANote = await owner.browser.json('/place-covers/today', 'PUT', {
      file_id: noteId,
    })
    expectStatus(
      wearsANote,
      404,
      'a voice note is not a cover: stored as one it would draw as a broken image with the wrong mime, which is the reason 7.16’s gate gives for the same clause',
    )
    const sentenceOf = (response: { json: () => unknown }): unknown =>
      (response.json() as { error?: { message?: unknown } }).error?.message
    expect(
      sentenceOf(wearsANote),
      'and both refusals are one sentence, so no shape of request tells a prober which fault it hit (10.2)',
    ).toBe(sentenceOf(wearsAnAvatar))
    expect(
      await todayOf(owner),
      'and Today is still bare after the second refusal',
    ).toBeUndefined()

    // 3. The caller's own folder-less cover, which is issue #20's headline and
    //    must survive the narrowing.
    const mine = await uploadCoverOk(owner, null, 'ac374-mine.png')
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', { file_id: mine }),
      200,
      'a picture of the person’s own, belonging to no folder, dresses Today (7.19 as widened by issues #20 and #100)',
    )
    expect((await todayOf(owner))?.file_id, 'and reads back').toBe(mine)

    // 4. An `image` from a folder the caller is in. The kind clause is
    //    7.16's pair rather than 'cover' alone, so a picture uploaded onto a
    //    folder page can dress a place page too.
    const fromAPage = await uploadImageOk(owner, ownFolder, 'ac374-page.png')
    expectStatus(
      await owner.browser.json('/place-covers/scheduled', 'PUT', {
        file_id: fromAPage,
      }),
      200,
      'an image the caller can read is a cover too: the clause is kind in (cover, image), exactly as a shelf’s and a folder’s are',
    )
  })
})
