/*
AC-389: given an account at its 1 GB, when setting or duplicating a cover
would copy a picture, then 413 with section 9's copy and nothing is stored;
and given the same account setting a cover that copies nothing, then it still
succeeds, because nothing was spent.

**The second half is the one worth writing down.** 10.3's storage row is the
one limit that answers 413 rather than 422, and a copy is a new `files` row
with real bytes, so it has to be charged: an account otherwise doubles its
storage by dressing pages, and quietly, since a folder-less cover is listed by
no surface. But the charge belongs to the *copy* and not to the act. Setting a
shelf's cover to a folder-less picture the person already owns writes no
bytes, and refusing it at the quota would mean a full account could not
rearrange the pictures it has already paid for — which is not what 10.3 says
and not what anyone would expect.

The refusal reuses `createFile`'s own path deliberately: same status, same
`quota_exceeded` code, same sentence out of section 9. A copy that failed on
storage is the same event to the person as an upload that did, and a second
wording for it would be a second thing to keep in step.

**The folder duplicate is the fourth door and it was added on 2026-09-04
after review**, with the arm below asserting one thing the other three cannot:
that no *folder* row survives the refusal. `duplicateFolder` inserted the copy
and its membership row and only then copied the picture, and a `return` out of
an `inTransaction` callback resolves it, so drizzle committed — 413 to the
caller and an empty "(copy)" folder left behind, counting against the 200 cap.
Nothing in the three arms above could see it: they refuse before any row of
their own act exists. So this arm counts folders as well as files, which is
the assertion the fix is answerable to.

Spec: 10.3, 7.15, 7.16 and 7.19 as amended 2026-09-04, 9; issues #116, #128.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadCoverOk, uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac389')

/** 10.3 (D5), restated here rather than imported so the criterion asserts
 * the number the specification carries and not the server's own constant. */
const QUOTA_BYTES = 1024 * 1024 * 1024

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function spent(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
        FROM files WHERE owner_id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ used: unknown }> }
  return Number(found.rows[0]?.used ?? 0)
}

async function countFiles(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT count(*)::int AS n FROM files WHERE owner_id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ n: unknown }> }
  return Number(found.rows[0]?.n ?? 0)
}

async function countFolders(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${userId}::uuid AND deleted_at IS NULL`,
  )) as unknown as { rows: Array<{ n: unknown }> }
  return Number(found.rows[0]?.n ?? 0)
}

/** Fills the account to one byte under the gigabyte with a row of the size
 * that leaves it there, so any copy at all is over. A planted row rather
 * than a real upload: 10.3's quota is arithmetic over `bytes` and a real
 * gigabyte on the wire would prove the same thing an hour later. */
async function fillTo(userId: string, headroom: number): Promise<void> {
  const ballast = QUOTA_BYTES - (await spent(userId)) - headroom
  expect(ballast, 'the ballast must be a positive size').toBeGreaterThan(0)
  await app.db.execute(
    sql`INSERT INTO files (owner_id, folder_id, kind, name, mime, bytes)
        VALUES (${userId}::uuid, NULL, 'cover', 'ac389-ballast.png',
                'image/png', ${ballast})`,
  )
}

describe('AC-389 a copied cover is charged to the person who set it', () => {
  test('413 when the copy will not fit, and no refusal when nothing is copied', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const folderId = await createFolder(owner, 'ac389 folder')
    const fromFolder = await uploadImageOk(owner, folderId, 'ac389-folder.png')
    const mine = await uploadCoverOk(owner, null, 'ac389-mine.png')

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac389 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    // Dressed before the account fills, so the duplicate below has a picture
    // to copy and the shelf has a cover to keep.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: mine,
      }),
      200,
      'the shelf wears the person’s own picture (spec 7.16)',
    )

    // And the folder wears one too, so its duplicate has a picture to copy.
    expectStatus(
      await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
        cover_file_id: fromFolder,
      }),
      200,
      'the folder wears a picture of its own (spec 7.4)',
    )

    await fillTo(owner.id, 1)
    const filesAtFull = await countFiles(owner.id)
    const spentAtFull = await spent(owner.id)
    const foldersAtFull = await countFolders(owner.id)

    // 1. A set that must copy, because the source lives in a folder.
    const setOverQuota = await owner.browser.json(
      `/shelves/${shelfId}`,
      'PATCH',
      { cover_file_id: fromFolder },
    )
    expectStatus(
      setOverQuota,
      413,
      'a shelf cover copied out of a folder is charged, and 10.3 answers 413 rather than 422 for storage alone',
    )
    expect(
      (setOverQuota.json() as { error?: { code?: unknown } }).error?.code,
      'with the same code an upload over the quota answers (spec 7.0, 10.3)',
    ).toBe('quota_exceeded')

    // 2. The same act on a built-in place page.
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', {
        file_id: fromFolder,
      }),
      413,
      'and a place cover copied out of a folder the same way (spec 7.19)',
    )

    // 3. And a duplicate, which always copies (#128).
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}/duplicate`, 'POST'),
      413,
      'a duplicate’s independent picture is a new file and is charged for one',
    )

    // 4. And a folder duplicate, which copies the folder's own picture.
    const folderOverQuota = await owner.browser.json(
      // The zone is named because the endpoint refuses a copy that would
      // re-anchor a date without one (8.1, AC-376), and this criterion is
      // about the quota rather than about that refusal.
      `/folders/${folderId}/duplicate?tz=UTC`,
      'POST',
    )
    expectStatus(
      folderOverQuota,
      413,
      'a duplicated folder carries its cover, so it is charged for one (spec 7.16 as amended)',
    )
    expect(
      (folderOverQuota.json() as { error?: { code?: unknown } }).error?.code,
      'with the same code the other three answer (spec 7.0, 10.3)',
    ).toBe('quota_exceeded')
    expect(
      await countFolders(owner.id),
      'and no folder row survives it: the refusal is the whole request, not the last step of one, so nothing half-made is left counting against the 200 of 7.4',
    ).toBe(foldersAtFull)

    expect(
      await countFiles(owner.id),
      'and none of the four stored anything: a refusal writes no row',
    ).toBe(filesAtFull)
    expect(await spent(owner.id), 'nor spent anything').toBe(spentAtFull)

    // The other half: a set that copies nothing is not a storage act, so a
    // full account may still rearrange the pictures it already owns.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: null,
        cover_preset: null,
      }),
      200,
      'taking a cover off spends nothing (spec 7.16)',
    )
    const backOn = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: mine,
    })
    expectStatus(
      backOn,
      200,
      'and putting back a folder-less picture of their own copies nothing, so the quota has no say in it',
    )
    expect(
      (backOn.json() as { cover_file_id?: unknown }).cover_file_id,
      'it is stored as it stands, the same id',
    ).toBe(mine)
    expect(
      await countFiles(owner.id),
      'and still no new row anywhere',
    ).toBe(filesAtFull)

    // And the shelf that could not be duplicated is untouched by the refusal.
    const after = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (after.json() as { cover_file_id?: unknown }).cover_file_id,
      'the shelf still wears what it wore',
    ).toBe(mine)
  })
})
