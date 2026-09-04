/*
AC-387: given a shelf wearing an uploaded picture, when it is duplicated, then
the copy looks the same and the two covers are independent — a different
`cover_file_id`, the same bytes, the same crop — and taking the cover off
either leaves the other drawing.

**Imran's ruling on #117, in his words**: "a duplicated shelf should keep the
same-looking cover, but the two covers must be independent. Changing or
removing the cover on either shelf must not change the other." Both halves are
load-bearing and they pull against each other. Pointing the copy at the same
`cover_file_id` gives the first half for one line, which is what #117 says
the other five fields do; it does not give the second, because
`DELETE /files/:id` and `shelves_cover_file_id_fkey`'s SET NULL would blank
both shelves at once.

**Why the endpoint is new.** The duplicate was `ShelfPage.tsx` POSTing a shelf
and PATCHing five fields onto it, which is where the cover was lost (#117) and
which cannot be made atomic from a browser: two requests have a gap, and a
failure in the gap is the half-duplicated shelf #128 asks not to exist. The
copy also spends quota and writes to the object store, neither of which
belongs in a client. So `POST /shelves/:id/duplicate` does the whole act in
one transaction and answers the new Shelf.

The preset arm is asserted too, because #128 says it explicitly: a gradient
needs no file copied and the key is carried as it stands.

Spec: 4.18, 7.16 as amended 2026-09-04, 10.3; issues #117 and #128.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac387')

const objects = new Map<string, Buffer>()
const memoryStore = {
  put: (id: string, bytes: Buffer): Promise<void> => {
    objects.set(id, bytes)
    return Promise.resolve()
  },
  get: (id: string): Promise<Buffer | null> =>
    Promise.resolve(objects.get(id) ?? null),
  remove: (id: string): Promise<void> => {
    objects.delete(id)
    return Promise.resolve()
  },
}

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: memoryStore })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface ShelfBody extends Record<string, unknown> {
  id?: unknown
  name?: unknown
  icon?: unknown
  color?: unknown
  description?: unknown
  cover_file_id?: unknown
  cover_preset?: unknown
  cover_focal_y?: unknown
}

describe('AC-387 a duplicated shelf wears its own copy of the picture', () => {
  test('same look, different file, and removing one leaves the other', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac387 shelf',
      icon: 'sparkle',
      color: '#123456',
      description: 'the original',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as ShelfBody).id)

    const picture = await uploadCoverOk(owner, null, 'ac387-cover.png')
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: picture,
        cover_focal_y: 73,
      }),
      200,
      'the shelf wears a picture and a crop (spec 7.16)',
    )

    const duplicated = await owner.browser.json(
      `/shelves/${shelfId}/duplicate`,
      'POST',
    )
    expectStatus(duplicated, 201, 'the duplicate is made server-side (#128)')
    const copy = duplicated.json() as ShelfBody
    const copyId = String(copy.id)

    expect(copyId, 'a shelf of its own').not.toBe(shelfId)
    expect(copy.name, '4.18 makes the name unique per person, so it is marked').toBe(
      'ac387 shelf (copy)',
    )
    expect(copy.icon, 'the icon rides along, as it always did (#117)').toBe(
      'sparkle',
    )
    expect(copy.color, 'and the colour').toBe('#123456')
    expect(copy.description, 'and the description').toBe('the original')
    expect(
      copy.cover_focal_y,
      'and the crop, which is a number and needs no copying (#128)',
    ).toBe(73)

    const copyCover = String(copy.cover_file_id)
    expect(
      copyCover,
      'but the picture is a file of its own, which is the whole of Imran’s ruling on #117',
    ).not.toBe(picture)
    expect(copyCover, 'and there is one, which is the defect #117 reported').not.toBe(
      'null',
    )

    // The same bytes: "the duplicate should look the same immediately".
    expect(
      objects.get(copyCover)?.equals(objects.get(picture) as Buffer),
      'the copy holds the same bytes as the original, so both shelves draw the same picture',
    ).toBe(true)
    expectStatus(
      await owner.browser.request(`/api/v1/files/${copyCover}`, {
        method: 'GET',
      }),
      200,
      'and it serves to its owner (spec 7.15)',
    )

    // The independence, in the direction Imran named.
    expectStatus(
      await owner.browser.json(`/shelves/${copyId}`, 'PATCH', {
        cover_file_id: null,
        cover_preset: null,
      }),
      200,
      'the copy’s cover is taken off (spec 7.16)',
    )
    const original = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (original.json() as ShelfBody).cover_file_id,
      'and the original still wears its own, which one shared file id could not have promised',
    ).toBe(picture)
    expectStatus(
      await owner.browser.request(`/api/v1/files/${picture}`, { method: 'GET' }),
      200,
      'and still draws it (spec 7.15)',
    )

    // A preset needs no file copied, which #128 states in as many words.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_preset: 'gradient-dusk',
      }),
      200,
      'the original swaps to a gradient (spec 7.16)',
    )
    const gradientCopy = await owner.browser.json(
      `/shelves/${shelfId}/duplicate`,
      'POST',
    )
    expectStatus(gradientCopy, 201, 'and duplicates again')
    const second = gradientCopy.json() as ShelfBody
    expect(second.cover_preset, 'the preset key is carried as it stands').toBe(
      'gradient-dusk',
    )
    expect(second.cover_file_id, 'and no file was made for it').toBeNull()
    expect(
      second.name,
      'the second copy takes the next free name, 4.18’s UNIQUE (user_id, name) being what forces it',
    ).toBe('ac387 shelf (copy 2)')

    // A shelf is private by construction (4.18), so somebody else's is not
    // there to duplicate: 404 and not 403 (10.2).
    expectStatus(
      await stranger.browser.json(`/shelves/${shelfId}/duplicate`, 'POST'),
      404,
      'another person’s shelf cannot be duplicated and does not exist to them (spec 4.18, 10.2)',
    )
  })
})
