/*
AC-369: given a shelf, when its owner names a cover they cannot reach, or one
that is not a picture, or a file and a preset at once, then 422 and the shelf
is unchanged.

**The gate is the point and nothing structural would have caught its
absence.** There is no authorization chokepoint in this codebase: about twenty
hand-written `accessOf(...)` gates do that job, and
`ac-236-structural-guard-sweep` checks that a mutating route has a session and
a CSRF token and never checks what it does with the ids in its body. A
`PATCH /shelves/:id` that took any uuid it was handed would pass the entire
suite. Issue #107 is that shape live in `putPage`, and `createComment`, which
scopes its file by folder, is the pattern this follows.

**What it would leak is existence rather than bytes**, exactly as #107
records: `serveFile` scopes independently, so an ungated shelf cover would
never serve another person's picture — it would confirm that a picture with
that id exists, and would hand the person a cover that draws as a broken
image forever. Both are refusals worth writing.

The refusal is 422 rather than 404 because the shelf itself was found and the
fault is in one value of the body, which is the answer 7.4 already gives for
the same field on a folder. It leaks nothing either way: a file that does not
exist and a file the caller cannot reach get the same sentence (10.2).

Spec: 4.18 and 7.16 as widened for issues #20 and #100, 10.2, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { randomUUID } from 'node:crypto'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { upload, uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac369')

interface ShelfBody {
  id?: unknown
  cover_file_id?: unknown
  cover_preset?: unknown
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-369 a shelf cover must be a picture its owner can reach', () => {
  test('another person’s file, a folder they are not in, a voice note, a uuid nobody owns, and two sources at once', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac369 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as ShelfBody).id)

    const unchanged = async (why: string): Promise<void> => {
      const read = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
      expectStatus(read, 200, 'the shelf reads back (spec 7.16)')
      const body = read.json() as ShelfBody
      expect(body.cover_file_id, why).toBeNull()
      expect(body.cover_preset, why).toBeNull()
    }

    // 1. A picture belonging to somebody else, with no folder of its own.
    //    Before this change the same predicate in `putPlaceCover` admitted
    //    every folder-less file to everybody, and a second account could wear
    //    the first's picture; measured at 200 on the wire.
    const theirs = await uploadCoverOk(stranger, null, 'ac369-theirs.png')
    const borrowed = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: theirs,
    })
    expectStatus(
      borrowed,
      422,
      'another person’s folder-less picture is not this caller’s to wear (10.2)',
    )
    await unchanged('a refused cover leaves the shelf as it was')

    // 2. A picture inside a folder the caller is not a member of. The
    //    membership half of the same predicate.
    const theirFolder = await createFolder(stranger, 'ac369 their folder')
    const inTheirFolder = await uploadCoverOk(
      stranger,
      theirFolder,
      'ac369-in-folder.png',
    )
    const trespass = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: inTheirFolder,
    })
    expectStatus(
      trespass,
      422,
      'a picture in a folder the caller is not in is refused (10.2)',
    )
    await unchanged('and that one leaves the shelf alone too')

    // 3. A file of the caller's own that is not a picture. `patchFolderProfile`
    //    has always required kind in (cover, image); without the same clause a
    //    shelf could store a voice note's id and draw a broken image.
    const ownFolder = await createFolder(owner, 'ac369 own folder')
    const note = await upload(
      owner,
      '/files',
      { kind: 'voice', folder_id: ownFolder, duration_ms: '1200' },
      { name: 'ac369.webm', type: 'audio/webm', bytes: Buffer.from('sound') },
    )
    expectStatus(note, 201, 'the voice note stores (spec 7.15)')
    const noteId = String((note.json() as { id?: unknown }).id)
    const notAPicture = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: noteId,
    })
    expectStatus(
      notAPicture,
      422,
      'a cover is a picture: kind in (cover, image), as 4.3 has always required',
    )
    await unchanged('a voice note never becomes a cover')

    // 4. A uuid naming nothing. The same sentence as an unreachable one,
    //    which is what keeps the refusal from being an existence oracle.
    const nothing = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: randomUUID(),
    })
    expectStatus(
      nothing,
      422,
      'a uuid nobody owns is refused with the same sentence as one somebody else does (10.2)',
    )
    const sentenceOf = (response: { json: () => unknown }): unknown =>
      (response.json() as { error?: { message?: unknown } }).error?.message
    expect(
      sentenceOf(nothing),
      'and it is the same sentence, so the refusal tells a prober nothing',
    ).toBe(sentenceOf(borrowed))

    // 5. Both sources in one body. Refused by the schema before the database
    //    has to answer migration 0012's CHECK as a 500.
    const both = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: await uploadCoverOk(owner, null, 'ac369-mine.png'),
      cover_preset: 'gradient-dusk',
    })
    expectStatus(
      both,
      422,
      'a cover is a file or a preset, never both (migration 0012, 4.3’s rule one object over)',
    )
    await unchanged('and the refused pair wrote neither half')

    // 6. Creation declines the cover out loud rather than dropping it, which
    //    is the #40 ruling's `z.never().optional()` and the direct answer to
    //    the failure mode #100 is about.
    const madeWithCover = await owner.browser.json('/shelves', 'POST', {
      name: 'ac369 made with a cover',
      cover_file_id: await uploadCoverOk(owner, null, 'ac369-at-birth.png'),
    })
    expectStatus(
      madeWithCover,
      422,
      'POST /shelves refuses a cover rather than accepting and discarding it (11.14, ruling on issue #40)',
    )
  })
})
