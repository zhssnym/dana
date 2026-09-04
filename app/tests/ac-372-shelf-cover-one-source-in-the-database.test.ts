/*
AC-372: given migration 0012's shelf cover columns, when a row is written
carrying a picture and a preset at once, or a preset that is not a key, or a
crop outside 0 to 100, then the database refuses it by name; and a row wearing
one source, or none at all, is admitted. And given a file with no folder whose
kind is none of avatar, cover and image, the database refuses that too.

**That last clause read "neither avatar nor cover" until 2026-09-04, when
issue #167 added `image` to it (migration 0015).** A shelf page's picture has
no folder to take its visibility from, so it belongs to the person exactly as
that page's cover does, and the schema's sentence about which kinds may stand
outside a folder moved with the server's. The arm below therefore *stores* a
folder-less image where it used to be refused one, and keeps `voice` as the
kind that proves the constraint still has teeth. Nothing about why this case
exists changes: AC-001 asserts the constraint by name and by columns, both of
which 0015 leaves alone, so only a row tried against the database can tell a
widened CHECK from a dropped one.

**This case exists because AC-001 cannot see what a CHECK does.** The catalog
test asserts every constraint by name and by which columns it mentions, and a
toothless CHECK carrying the right name over the right columns is green across
the entire suite. `docs/workflow/backend/README.md`'s fifth bullet is that
lesson, learned on issue #27: the obvious spelling of a both-or-neither rule,
`((a IS NULL AND b IS NULL) OR (a > 0 AND b > 0))`, admits exactly the row it
forbids, because a CHECK fails only on FALSE and `NULL > 0` is NULL. So a
migration that adds a CHECK owes a behavioural case that tries the bad row,
and this is it.

**The refusals are asserted against the database rather than through the
route**, for AC-362's reason one object over: `domain/shelves.ts` clears the
other source on every write, so nothing reachable through 7.16 can produce a
row wearing two covers today. The constraint is there so that nothing can
produce one tomorrow either, and a criterion that only drove the endpoint
would stay green on a schema that had lost it.

Spec: 4.18 as widened by migration 0012, 4.16, 12.1. Issues #20 and #100.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectRejectedBy, rows } from './helpers.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac372')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-372 the database itself refuses a shelf wearing two covers', () => {
  test('both sources, a malformed preset, a crop out of range, and a folder-less kind that may not be one', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac372 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)
    const pictureId = await uploadCoverOk(owner, null, 'ac372-cover.png')

    // The row this constraint exists for. Written directly, because the
    // endpoint refuses it two layers earlier.
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`UPDATE shelves
              SET cover_file_id = ${pictureId}::uuid,
                  cover_preset = 'gradient-dusk'
              WHERE id = ${shelfId}::uuid`,
        ),
      'shelves_cover_one_source_check',
    )

    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`UPDATE shelves SET cover_preset = 'Gradient Dusk!'
              WHERE id = ${shelfId}::uuid`,
        ),
      'shelves_cover_preset_format_check',
    )

    for (const crop of [-1, 101]) {
      await expectRejectedBy(
        () =>
          app.db.execute(
            sql`UPDATE shelves SET cover_focal_y = ${crop}
                WHERE id = ${shelfId}::uuid`,
          ),
        'shelves_cover_focal_y_range_check',
      )
    }

    // And the three states the rule admits, so the constraint is proved to
    // refuse the row rather than to refuse everything.
    await app.db.execute(
      sql`UPDATE shelves SET cover_file_id = ${pictureId}::uuid,
                             cover_preset = NULL, cover_focal_y = 0
          WHERE id = ${shelfId}::uuid`,
    )
    await app.db.execute(
      sql`UPDATE shelves SET cover_file_id = NULL,
                             cover_preset = 'gradient-dusk', cover_focal_y = 100
          WHERE id = ${shelfId}::uuid`,
    )
    await app.db.execute(
      sql`UPDATE shelves SET cover_file_id = NULL, cover_preset = NULL
          WHERE id = ${shelfId}::uuid`,
    )
    const after = await rows(
      app.db,
      sql`SELECT cover_file_id, cover_preset, cover_focal_y FROM shelves
          WHERE id = ${shelfId}::uuid`,
    )
    const row = after[0] as Record<string, unknown> | undefined
    expect(
      row?.cover_file_id,
      'a shelf may wear no cover at all, as 4.3 admits for a folder and 4.20 does not for a place',
    ).toBeNull()
    expect(row?.cover_preset, 'neither half').toBeNull()
    expect(Number(row?.cover_focal_y), 'and the crop survives as written').toBe(
      100,
    )

    // files_folderless_kind_check: which kinds may stand outside a folder is
    // now the schema's rule and not only the server's.
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
              VALUES (${randomUUID()}::uuid, ${owner.id}::uuid, NULL, 'voice',
                      'ac372-loose.webm', 'audio/webm', 64)`,
        ),
      'files_folderless_kind_check',
    )
    // The three kinds it admits, which are the three 4.16 says may belong to a
    // person rather than to a folder: an avatar, a cover, and — since issue
    // #167 and migration 0015 — a page image, which is a shelf page's picture
    // and has no folder to be scoped by.
    for (const kind of ['cover', 'avatar', 'image'] as const) {
      await app.db.execute(
        sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
            VALUES (${randomUUID()}::uuid, ${owner.id}::uuid, NULL, ${kind},
                    ${`ac372-${kind}.png`}, 'image/png', 64)`,
      )
    }
  })
})
