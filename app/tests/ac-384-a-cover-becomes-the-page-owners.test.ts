/*
AC-384: given a page whose cover is set from a file living in a folder, then
the page stores a copy the setter owns, and leaving that folder afterwards
does not blank the cover.

**This is #116's second half, and it was true of a place cover since 7.19 was
written.** Both cover gates admit `kind IN ('cover','image')` and both admit a
file the caller can read, which includes every picture in every folder they
are a member of — deliberately, so that a picture on a folder page can dress
Today and a shelf is not the one page kind with a narrower rule. What nobody
had written down is what happens next: `readableFileScope` is membership, so
the day the wearer leaves that folder the server correctly refuses them their
own cover's bytes, 4.20's row goes on naming a file they cannot read, and the
page draws the flat fallback with nothing said and nothing cleaned up.

The fix is a copy at set-time, and the criterion is written to show both
halves of the wire fact rather than only the good one: after the removal the
**source** picture answers 404 to the person, which is the fault this closes,
while the **cover** answers 200, which is the page still drawing. If the copy
were ever dropped those two assertions swap places, and the second one is the
one a person would notice.

The copy is folder-less, `kind = 'cover'`, and owned by whoever set it, which
is 4.16's rule that a cover file's scope matches its page's: a shelf is
private (4.18) and a place cover is per viewer (4.20), so theirs belong to the
person. A folder's own cover is not copied and must not be — it has to stay
folder-scoped so every member can read it (4.3, D1) — and AC-373 asserts that
refusal from the other side.

Spec: 4.16, 4.18, 4.20, 7.15, 7.16, 7.19 as amended 2026-09-04; issue #116.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  removeMember,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac384')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface FileRow {
  folder_id: unknown
  owner_id: unknown
  kind: unknown
}

async function fileRow(fileId: string): Promise<FileRow | undefined> {
  const found = (await app.db.execute(
    sql`SELECT folder_id, owner_id, kind FROM files WHERE id = ${fileId}::uuid`,
  )) as unknown as { rows: FileRow[] }
  return found.rows[0]
}

describe('AC-384 a cover set from a folder becomes the page owner’s own file', () => {
  test('the shelf and the place page both keep drawing after the member leaves', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac384 shared')
    await addMemberOk(owner, folderId, member.id)

    // A picture on the shared folder's page. The member can read it today,
    // which is the whole reason both cover gates admit it.
    const shared = await uploadImageOk(owner, folderId, 'ac384-shared.png')
    expectStatus(
      await member.browser.request(`/api/v1/files/${shared}`, { method: 'GET' }),
      200,
      'the member reads the folder’s picture while they are in it (spec 7.15)',
    )

    const made = await member.browser.json('/shelves', 'POST', {
      name: 'ac384 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    const worn = await member.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: shared,
    })
    expectStatus(worn, 200, 'the shelf takes the folder’s picture (spec 7.16)')
    const shelfCover = String(
      (worn.json() as { cover_file_id?: unknown }).cover_file_id,
    )
    expect(
      shelfCover,
      'the shelf stores a copy rather than the folder’s own file, which is the whole of the fix (#116)',
    ).not.toBe(shared)

    const copy = await fileRow(shelfCover)
    expect(copy?.folder_id, 'the copy belongs to no folder (4.16)').toBeNull()
    expect(String(copy?.owner_id), 'and to the person who set it').toBe(
      member.id,
    )
    expect(String(copy?.kind), 'and it is a cover, whatever the source was').toBe(
      'cover',
    )

    // The same act on a built-in place page, from the same folder picture.
    expectStatus(
      await member.browser.json('/place-covers/today', 'PUT', {
        file_id: shared,
      }),
      200,
      'Today takes it too (spec 7.19)',
    )
    const covers = await member.browser.json('/place-covers', 'GET')
    const today = (
      covers.json() as { covers?: Array<{ place?: unknown; file_id?: unknown }> }
    ).covers?.find((entry) => entry.place === 'today')
    const todayCover = String(today?.file_id)
    expect(todayCover, 'Today stores a copy as well').not.toBe(shared)
    expect(
      todayCover,
      'and its own copy, not the shelf’s: two pages set separately are two files',
    ).not.toBe(shelfCover)

    // Both copies serve before the removal, so the assertions after it are
    // measuring the removal and not a picture that never drew.
    for (const [what, id] of [
      ['the shelf’s', shelfCover],
      ['Today’s', todayCover],
    ] as const) {
      expectStatus(
        await member.browser.request(`/api/v1/files/${id}`, { method: 'GET' }),
        200,
        `${what} cover serves to its person before anything changes (spec 7.15)`,
      )
    }

    expectStatus(
      await removeMember(owner, folderId, member.id),
      204,
      'the owner removes the member (spec 7.4, 8.8)',
    )

    // The fault, on the wire: the source picture is not theirs to read any
    // more. Before this change that id was what both pages held.
    expectStatus(
      await member.browser.request(`/api/v1/files/${shared}`, { method: 'GET' }),
      404,
      'the folder’s picture is refused once the membership ends (spec 7.15), which is what used to blank the cover',
    )

    for (const [what, id] of [
      ['the shelf’s', shelfCover],
      ['Today’s', todayCover],
    ] as const) {
      expectStatus(
        await member.browser.request(`/api/v1/files/${id}`, { method: 'GET' }),
        200,
        `${what} cover still serves, because it is the person’s own file and never the folder’s (#116)`,
      )
    }

    const after = await member.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (after.json() as { cover_file_id?: unknown }).cover_file_id,
      'and the shelf still names it: nothing was cleared and nothing needed to be',
    ).toBe(shelfCover)
  })
})
