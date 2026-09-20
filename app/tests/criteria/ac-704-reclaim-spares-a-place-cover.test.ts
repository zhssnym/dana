/*
AC-704: the fifth and last of the columns that can hold a file id —
`user_page_covers.file_id` — read against the 11.7 tick's fifth duty.

Given a folder-less picture a built-in place page still wears, then the sweep
spares it at any age and clears the mark it was carrying; given its twin of the
same age that no place wears, then the sweep deletes the row and the object;
and given one day either side of the thirty, then the younger survives with its
mark untouched and the older does not.

**Two things make this the worst one to get wrong.** A place page is one of
4.20's eight built-in pages and has no row anywhere to hang a cover on, so the
cover lives in a table of its own keyed by the viewer — which means the picture
is folder-less, owned by that person, and exactly the shape this sweep takes.
And `user_page_covers_file_id_fkey` is `ON DELETE CASCADE`, not SET NULL: a
sweep that took this picture would destroy the cover row with it, taking the
person's stored focal crop as well as their picture, and leaving nothing behind
that says a cover was ever set.

The cover is set through `PUT /api/v1/place-covers/:place` and the row the
sweep must spare is read back out of `user_page_covers` rather than assumed to
be the uploaded id, 7.19's rule 1 being free to have copied it (AC-384).

Spec 4.16, 4.20, 7.15, 7.19 as amended 2026-09-04, 11.7; migrations 0005 and
0014; issues #116 and #263.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makePlaceCover } from '../support/authorization-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
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

/** One of 4.20's eight, named here so the read below addresses the same row
 * the write made. */
const PLACE = 'important'

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac704')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-704 the reclaim sweep spares a picture a place page wears', () => {
  test(
    `a place cover survives at ${String(OUTSIDE_THE_WINDOW)} days while its unworn twin does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db

      const chosen = await folderlessPicture(owner, 'cover', 'ac704-held.png')
      const inside = await folderlessPicture(owner, 'cover', 'ac704-inside.png')
      const outside = await folderlessPicture(owner, 'cover', 'ac704-outside.png')

      await makePlaceCover(owner, PLACE, chosen)
      const held = await referencedFileId(
        db,
        sql`SELECT file_id FROM user_page_covers
             WHERE user_id = ${owner.id}::uuid AND place = ${PLACE}`,
        `the ${PLACE} place cover`,
      )

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await ageTheMark(db, inside, INSIDE_THE_WINDOW)
      await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      const spared = await expectSpared(
        fixture,
        held,
        `a picture a place page still wears must survive the 11.7 pass at ${String(OUTSIDE_THE_WINDOW)} days`,
      )
      expect(
        spared.marked,
        'the clear arm must take the mark off a picture something references again (domain/files.ts, the `cleared` CTE)',
      ).toBe(false)

      const coverRow = await rows(
        db,
        sql`SELECT file_id FROM user_page_covers
             WHERE user_id = ${owner.id}::uuid AND place = ${PLACE}`,
      )
      expect(
        coverRow.length,
        'and the cover row itself must still be there: user_page_covers_file_id_fkey cascades, so a wrong sweep takes the row and the crop with the bytes and leaves nothing that says a cover was ever set (migration 0005)',
      ).toBe(1)

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

      /* The other direction, through the endpoint a person uses. */
      const removed = await owner.browser.json(
        `/place-covers/${PLACE}`,
        'DELETE',
      )
      expectStatus(
        removed,
        204,
        `DELETE /place-covers/${PLACE} must take the cover off before the sweep may consider its picture (spec 7.19)`,
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
        `once the place page has let go and the mark is ${String(OUTSIDE_THE_WINDOW)} days old, the picture goes with its object`,
      )
    },
    120_000,
  )
})
