/*
AC-702: the third of the five columns that can hold a file id —
`folders.cover_file_id` — read against the 11.7 tick's fifth duty.

Given a folder-less picture a folder still wears, then the sweep spares it at
any age and clears the mark it was carrying; given its twin of the same age
that no folder wears, then the sweep deletes the row and the object; and given
one day either side of the thirty, then the younger survives with its mark
untouched and the older does not.

**Why the reference is built in SQL, and why the arm still matters.** No route
in section 7 can produce this state today: `patchFolderProfile` in
`app/src/server/domain/folders.ts` gates a folder's cover with
`WHERE id = … AND folder_id = <that folder>`, so a folder can only ever wear a
picture of its own, and a picture with a folder is excluded from this sweep by
`folder_id IS NULL` before the reference query is consulted at all. The clause
is therefore reached only by a legacy row or by the day somebody widens that
gate — and the comment above `patchFolderProfile` says in terms that this is
expected to widen, 7.19 stating the copy rule "for all three page kinds
regardless, against the day this clause widens". This case is what makes that
widening safe rather than merely intended: on the day a folder may wear a
folder-less picture, the sweep already refuses to take it.

`folders_cover_file_id_fkey` is `ON DELETE SET NULL`, so getting this wrong
does not destroy the folder — it blanks its cover, silently, on a Tuesday,
with no act by anybody to point at.

Spec 4.3, 4.16, 7.4, 7.15, 7.19 as amended 2026-09-04, 11.7; migrations 0003,
0006 and 0014; issue #263.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  INSIDE_THE_WINDOW,
  OUTSIDE_THE_WINDOW,
  RECLAIM_WINDOW_DAYS,
  ageTheMark,
  expectReclaimed,
  expectSpared,
  folderlessPicture,
  referencedFileId,
  startReclaimApp,
} from '../support/reclaim-harness.js'
import type { ReclaimApp } from '../support/reclaim-harness.js'
import { runPass } from '../support/reminders-harness.js'

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac702')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-702 the reclaim sweep spares a picture a folder wears', () => {
  test(
    `a folder's cover survives at ${String(OUTSIDE_THE_WINDOW)} days while its unworn twin does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const folderId = await createFolder(owner, 'ac702 reclaim folder cover')

      const held = await folderlessPicture(owner, 'cover', 'ac702-held.png')
      const inside = await folderlessPicture(owner, 'cover', 'ac702-inside.png')
      const outside = await folderlessPicture(owner, 'cover', 'ac702-outside.png')

      await db.execute(
        sql`UPDATE folders
               SET cover_file_id = ${held}::uuid, cover_preset = NULL
             WHERE id = ${folderId}::uuid`,
      )
      const worn = await referencedFileId(
        db,
        sql`SELECT cover_file_id AS file_id FROM folders
             WHERE id = ${folderId}::uuid`,
        "the folder's cover",
      )
      expect(worn, 'the folder must be wearing the picture under test').toBe(held)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await ageTheMark(db, inside, INSIDE_THE_WINDOW)
      await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      const spared = await expectSpared(
        fixture,
        held,
        `a picture a folder still wears must survive the 11.7 pass at ${String(OUTSIDE_THE_WINDOW)} days`,
      )
      expect(
        spared.marked,
        'the clear arm must take the mark off a picture something references again (domain/files.ts, the `cleared` CTE)',
      ).toBe(false)

      const young = await expectSpared(
        fixture,
        inside,
        `a picture nothing wears is still the caller's to name again at ${String(INSIDE_THE_WINDOW)} days and must survive`,
      )
      expect(
        young.marked,
        `a mark ${String(INSIDE_THE_WINDOW)} days old must be left exactly as it was: re-marking it would restart the ${String(RECLAIM_WINDOW_DAYS)} days every tick and nothing would ever be reclaimed`,
      ).toBe(true)
      expect(
        young.markIsFresh,
        'and it must not have been rewritten to now()',
      ).toBe(false)

      await expectReclaimed(
        fixture,
        outside,
        `a picture nothing wears, marked ${String(OUTSIDE_THE_WINDOW)} days ago, must be reclaimed`,
      )

      /* The other direction: the folder takes the cover off, and the window
         runs from that moment. */
      await db.execute(
        sql`UPDATE folders SET cover_file_id = NULL
             WHERE id = ${folderId}::uuid`,
      )
      await runPass(fixture.app)

      const remarked = await expectSpared(
        fixture,
        held,
        'the pass that first finds the picture unworn must not also delete it',
      )
      expect(
        remarked.markIsFresh,
        'the mark must be written when the cover came off, not when the bytes arrived (migration 0014)',
      ).toBe(true)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await runPass(fixture.app)
      await expectReclaimed(
        fixture,
        held,
        `once the folder has let go and the mark is ${String(OUTSIDE_THE_WINDOW)} days old, the picture goes with its object`,
      )

      const after = await rows(
        db,
        sql`SELECT cover_file_id FROM folders WHERE id = ${folderId}::uuid`,
      )
      expect(
        after[0]?.cover_file_id ?? null,
        'and the folder is left wearing nothing rather than a dangling id',
      ).toBeNull()
    },
    120_000,
  )
})
