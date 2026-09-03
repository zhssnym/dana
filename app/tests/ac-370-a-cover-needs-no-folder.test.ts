/*
AC-370: given the upload surface, when a picture is stored as a `cover` with
no `folder_id`, then it stores and belongs to the person; when any other kind
omits `folder_id`, then 422 naming the field; and the folder-less row is the
same row in every other respect — re-encoded, measured, and counted against
the same quota.

**This is the sentence issue #20 rests on, and the issue's own diagnosis of it
is wrong in a way worth writing down.** #20 says "Dana can only store an
uploaded picture if the picture belongs to a folder", and reads that as the
schema's doing. It never was: `files.folder_id` has been nullable since
migration 0003, and 4.16 describes it as "null for avatars", so the schema had
always admitted a folder-less row. What forbade one were two lines of
TypeScript — `domain/files.ts` refusing a null folder for every kind but
avatar, and `routes/files.ts` declaring `folder_id: z.uuid()` as required —
and the fix was therefore on the server rather than in a migration. Migration
0012 adds `files_folderless_kind_check` so the *new* rule is enforced rather
than remembered, which is the opposite direction from the one the issue
predicted.

**The quota assertion is made against the arithmetic rather than by filling a
gigabyte.** `createFile` sums `bytes` where `owner_id = <the caller>` with no
mention of the folder, so a folder-less row is counted by construction; what
this case checks is the fact that makes that true, which is that the row
carries the caller as its owner and a positive byte count. A criterion that
uploaded 1 GB to prove it would measure the machine.

Spec: 4.16 and 7.15 as widened for issues #20 and #100 (migration 0012), 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { ONE_PIXEL_PNG, imagePng, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac370')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-370 a cover is the one kind that needs no folder', () => {
  test('cover stores without one; image, file and voice do not; the row is otherwise the same row', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    // A picture large enough that the 2048px downscale has something to do,
    // so the folder-less arm is proved to run the same sharp pass.
    const oversized = await imagePng(2600, 1300)
    const stored = await upload(
      owner,
      '/files',
      { kind: 'cover' },
      { name: 'ac370-cover.png', type: 'image/png', bytes: oversized },
    )
    expectStatus(
      stored,
      201,
      'a cover stores with no folder_id at all (spec 7.15 as widened by issues #20 and #100)',
    )
    const body = stored.json() as {
      id?: unknown
      bytes?: unknown
      width?: unknown
      height?: unknown
    }
    const fileId = String(body.id)
    expect(
      body.width,
      'the same 2048px downscale ran: 2600 by 1300 comes back bounded on its longest edge (7.15)',
    ).toBe(2048)
    expect(body.height, 'and the ratio is kept').toBe(1024)
    expect(
      Number(body.bytes),
      'and the stored size is the re-encoded one, which the quota then counts',
    ).toBeGreaterThan(0)

    const row = await rows(
      app.db,
      sql`SELECT folder_id, owner_id, kind, bytes, width, height
          FROM files WHERE id = ${fileId}::uuid`,
    )
    const record = row[0] as Record<string, unknown> | undefined
    expect(record, 'the row exists').toBeDefined()
    expect(
      record?.folder_id,
      'it has no folder: the picture belongs to the person (issue #20, Imran’s ruling)',
    ).toBeNull()
    expect(
      String(record?.owner_id),
      'and it names the caller as its owner, which is the column the 1 GB quota sums (10.3)',
    ).toBe(owner.id)
    expect(String(record?.kind), 'stored as 4.16’s cover kind').toBe('cover')
    expect(
      Number(record?.bytes),
      'with a positive byte count, so the quota arithmetic sees it',
    ).toBeGreaterThan(0)
    expect(
      Number(record?.width),
      '4.16’s dimensions are recorded for a folder-less cover as for any other (issue #27)',
    ).toBe(2048)

    // The three kinds that hang on something living in a folder still require
    // one, and the refusal is a shape refusal naming the field rather than the
    // 404 an unreachable folder gets.
    for (const kind of ['image', 'file', 'voice'] as const) {
      const refused = await upload(
        owner,
        '/files',
        { kind },
        { name: `ac370-${kind}.png`, type: 'image/png', bytes: ONE_PIXEL_PNG },
      )
      expectStatus(
        refused,
        422,
        `kind ${kind} still requires a folder_id, its visibility being its folder's (4.16)`,
      )
      expect(
        (refused.json() as { error?: { message?: unknown } }).error?.message,
        'and the sentence names the field a caller has to fix',
      ).toContain('folder_id')
    }

    // A folder_id that is present is still honoured and still scoped: the
    // widening added an arm, it did not remove the membership check.
    const folderId = await createFolder(owner, 'ac370 folder')
    const inFolder = await upload(
      owner,
      '/files',
      { kind: 'cover', folder_id: folderId },
      { name: 'ac370-in-folder.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(inFolder, 201, 'a folder-scoped cover still stores (7.15)')
    const scoped = await rows(
      app.db,
      sql`SELECT folder_id FROM files
          WHERE id = ${String((inFolder.json() as { id?: unknown }).id)}::uuid`,
    )
    expect(
      String((scoped[0] as Record<string, unknown> | undefined)?.folder_id),
      'and it kept the folder it named, which is what a folder’s shared cover needs (4.3)',
    ).toBe(folderId)
  })
})
