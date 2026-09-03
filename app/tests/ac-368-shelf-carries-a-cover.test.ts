/*
AC-368: given a shelf, when its owner sets a cover through PATCH
/shelves/:id, then the shelf wears it and reads it back; a file and a preset
are one source, so each arriving clears the other; the crop stores; and
clearing both leaves a shelf with no cover.

**This criterion exists because the endpoint answered 200 and did nothing**
(issue #100). `shelves.cover_file_id` has existed since migration 0003 and no
route ever wrote it, while the shipping client has been sending it to this
endpoint since S27; nothing in `app/src/shared/` is `.strict()`, so the field
was parsed away and the person was told it worked. Measured on the wire before
the fix: `PATCH /shelves/:id { cover_file_id: … }` answered 200 with
`cover_file_id: null`, and a later GET was still null.

**So every assertion below reads the value back, and none of them reads a
status.** A criterion that checked for 200 would have passed against the
defect it was written for, which is the whole shape of this class: the silent
drop is invisible to anything that does not compare what went in with what
comes out. AC-149 is the same lesson for a task's reminder.

Spec: 4.18 and 7.16 as widened for issues #20 and #100 (migration 0012), 4.3
and 0006 for the folder rules this transcribes.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac368')

interface ShelfBody {
  id?: unknown
  cover_file_id?: unknown
  cover_preset?: unknown
  cover_focal_y?: unknown
  name?: unknown
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function shelfOf(actor: Actor, shelfId: string): Promise<ShelfBody> {
  const response = await actor.browser.json(`/shelves/${shelfId}`, 'GET')
  expectStatus(response, 200, 'the shelf reads back (spec 7.16)')
  return response.json() as ShelfBody
}

describe('AC-368 a shelf wears a cover the API actually stores', () => {
  test('a picture, a preset, the crop, one source, and removal', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac368 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as ShelfBody).id)

    const fresh = await shelfOf(owner, shelfId)
    expect(fresh.cover_file_id, 'a new shelf wears nothing').toBeNull()
    expect(fresh.cover_preset, 'and no preset either').toBeNull()
    expect(
      fresh.cover_focal_y,
      'the crop defaults to 50, as 4.20 and 0006 both have it',
    ).toBe(50)

    // The picture is folder-less, which is the shape a shelf's cover takes:
    // a shelf is private (4.18), so its cover belongs to the person.
    const pictureId = await uploadCoverOk(owner, null, 'ac368-cover.png')

    const wornAsFile = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: pictureId,
      cover_focal_y: 20,
    })
    expectStatus(wornAsFile, 200, 'the cover writes (spec 7.16 as widened)')
    expect(
      (wornAsFile.json() as ShelfBody).cover_file_id,
      'the PATCH answers the picture it stored, not the null it used to answer (issue #100)',
    ).toBe(pictureId)

    const afterFile = await shelfOf(owner, shelfId)
    expect(
      afterFile.cover_file_id,
      'and a later read still has it, which is the half the defect failed',
    ).toBe(pictureId)
    expect(afterFile.cover_focal_y, 'the crop stored with it').toBe(20)
    expect(afterFile.cover_preset, 'a file alone: no preset').toBeNull()

    const moved = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_focal_y: 80,
    })
    expectStatus(moved, 200, 'the crop moves on its own (spec 7.16)')
    const afterMove = await shelfOf(owner, shelfId)
    expect(afterMove.cover_focal_y, 'the reposition stored').toBe(80)
    expect(
      afterMove.cover_file_id,
      'and moving the crop did not disturb the picture',
    ).toBe(pictureId)

    // One source: the preset arriving clears the file server-side, so the
    // client never has to send the null it means (4.3's rule, one object over).
    const wornAsPreset = await owner.browser.json(
      `/shelves/${shelfId}`,
      'PATCH',
      { cover_preset: 'gradient-dusk' },
    )
    expectStatus(wornAsPreset, 200, 'a gradient replaces the picture')
    const afterPreset = await shelfOf(owner, shelfId)
    expect(afterPreset.cover_preset, 'the preset stored').toBe('gradient-dusk')
    expect(
      afterPreset.cover_file_id,
      'and cleared the file: one source, never two (migration 0012)',
    ).toBeNull()

    // And back the other way, which is the arm a one-directional
    // implementation would drop.
    const backToFile = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: pictureId,
    })
    expectStatus(backToFile, 200, 'the picture replaces the gradient')
    const afterBack = await shelfOf(owner, shelfId)
    expect(afterBack.cover_file_id, 'the file is back').toBe(pictureId)
    expect(afterBack.cover_preset, 'and the preset is gone').toBeNull()

    const cleared = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: null,
      cover_preset: null,
    })
    expectStatus(cleared, 200, 'a shelf may wear nothing (4.18, as 4.3 may)')
    const afterClear = await shelfOf(owner, shelfId)
    expect(afterClear.cover_file_id, 'no picture').toBeNull()
    expect(afterClear.cover_preset, 'no preset').toBeNull()

    // The identity fields the endpoint already honoured are untouched by the
    // widening, which is what a shared base object in `shared/shelves.ts` is
    // supposed to guarantee and is cheap to prove.
    const renamed = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      name: 'ac368 renamed',
    })
    expectStatus(renamed, 200, 'the rename still works (spec 7.16)')
    expect((renamed.json() as ShelfBody).name).toBe('ac368 renamed')
  })
})
