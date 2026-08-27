/*
AC-270: a place page's cover is the caller's own, may be a preset or a stored
file, repositions, is removed by deleting it, disappears with the file behind
it, and refuses a body naming both sources or neither.

Item 44's B1 is the reason this table exists at all: `folders` and `shelves`
carry a `cover_file_id` because they have a row, and Today, Scheduled and the
rest have no row anywhere to hang a cover on. The ruling adds "per viewer",
which is the clause with teeth here: two members of one workspace setting a
cover on the same place must not see each other's, because a place page is
Dana's own furniture rather than a shared object.

**The one-source rule is asserted from both sides.** 4.20's CHECK is
`(file_id IS NULL) <> (preset IS NULL)`, so a row exists exactly when a cover
was chosen and removal is the row's deletion. A body naming both is as wrong
as a body naming neither, and an implementation that validated only the
"neither" half would leave the database to catch the other, which is a 500
where 422 is owed.

**The file's disappearance is the adversarial case.** A folder's cover column
may go null and leave a folder with no cover; here a null file with a null
preset is a row the CHECK forbids, so the file's deletion has to take the
cover row with it. An implementation that copied `folders`' ON DELETE SET
NULL would fail at the constraint on the first deleted cover.

Spec: 4.20, 7.19, 10.2 (the not-found rule for a file the caller cannot
read), RFC 0005 change control item 44 B1.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { seedCoverFile } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'partner'], 's22a')

interface CoverEntry {
  place?: unknown
  file_id?: unknown
  preset?: unknown
  focal_y?: unknown
}

async function coversOf(actor: Actor): Promise<CoverEntry[]> {
  const response = await actor.browser.json('/place-covers', 'GET')
  expectStatus(response, 200, 'the caller reads their own covers (spec 7.19)')
  const body = response.json() as { covers?: CoverEntry[] }
  return body.covers ?? []
}

function coverFor(entries: CoverEntry[], place: string): CoverEntry | undefined {
  return entries.find((entry) => entry.place === place)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-270 a place page carries a cover, per viewer', () => {
  test('preset, reposition, file, removal, the deleted file, and the one-source refusals', async () => {
    const [owner, partner] = (await cast.of(app)) as [Actor, Actor]

    expect(
      await coversOf(owner),
      'a fresh account has chosen no cover anywhere',
    ).toEqual([])

    const asPreset = await owner.browser.json('/place-covers/today', 'PUT', {
      preset: 'gradient-dusk',
      focal_y: 30,
    })
    expectStatus(asPreset, 200, 'a preset cover is written (spec 7.19)')
    const first = coverFor(await coversOf(owner), 'today')
    expect(first?.preset, 'the preset reads back').toBe('gradient-dusk')
    expect(first?.focal_y, 'the reposition reads back').toBe(30)
    expect(first?.file_id, 'a preset cover names no file').toBeNull()

    const fileId = await seedCoverFile(app.db, owner.id)
    const asFile = await owner.browser.json('/place-covers/today', 'PUT', {
      file_id: fileId,
    })
    expectStatus(asFile, 200, 'a stored file replaces the preset')
    const second = coverFor(await coversOf(owner), 'today')
    expect(second?.file_id, 'the file reads back').toBe(fileId)
    expect(second?.preset, 'the preset is gone: one source, not two').toBeNull()
    expect(second?.focal_y, 'an unnamed reposition takes 4.20’s default').toBe(
      50,
    )

    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', {
        preset: 'gradient-dusk',
        file_id: fileId,
      }),
      422,
      'both sources at once is refused (4.20’s one-source CHECK)',
    )
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', { focal_y: 10 }),
      422,
      'neither source is refused the same way',
    )
    expectStatus(
      await owner.browser.json('/place-covers/desk', 'PUT', {
        preset: 'gradient-dusk',
      }),
      404,
      'Desk is a folder and carries 4.3’s cover; it is not one of 4.20’s places',
    )

    // Per viewer, which is the clause the table exists for.
    expectStatus(
      await partner.browser.json('/place-covers/today', 'PUT', {
        preset: 'ribbon-two',
      }),
      200,
      'the partner sets their own cover on the same place',
    )
    expect(
      coverFor(await coversOf(partner), 'today')?.preset,
      'the partner reads their own',
    ).toBe('ribbon-two')
    expect(
      coverFor(await coversOf(owner), 'today')?.file_id,
      'and the owner’s is untouched by it',
    ).toBe(fileId)

    // The file goes; the cover goes with it, rather than becoming a row with
    // neither source.
    await app.db.execute(sql`DELETE FROM files WHERE id = ${fileId}::uuid`)
    expect(
      coverFor(await coversOf(owner), 'today'),
      'a cover whose picture is gone is no cover, not a half-set one',
    ).toBeUndefined()

    expectStatus(
      await owner.browser.json('/place-covers/scheduled', 'PUT', {
        preset: 'gradient-dusk',
      }),
      200,
      'a second place takes a cover of its own',
    )
    expectStatus(
      await owner.browser.api('/place-covers/scheduled', { method: 'DELETE' }),
      204,
      'removal is the row’s deletion (spec 7.19)',
    )
    expectStatus(
      await owner.browser.api('/place-covers/scheduled', { method: 'DELETE' }),
      204,
      'and it is idempotent',
    )
    expect(
      await coversOf(owner),
      'nothing of this account’s covers survives',
    ).toEqual([])
  })
})
