/*
AC-703: the fourth of the five columns that can hold a file id —
`shelves.cover_file_id` — read against the 11.7 tick's fifth duty.

Given a folder-less picture a shelf still wears, then the sweep spares it at
any age and clears the mark it was carrying; given its twin of the same age
that no shelf wears, then the sweep deletes the row and the object; and given
one day either side of the thirty, then the younger survives with its mark
untouched and the older does not.

**This is the arm the sweep was written for, and the one a person can reach in
two clicks.** A shelf is private and is not a folder (4.18), so the picture it
wears is a folder-less `cover` of its owner's — the exact shape
`reclaimUnwornPictures` takes. Issue #116 put the sweep here because a replaced
shelf cover was reachable by no route and spent its owner's gigabyte forever;
the risk that came with it is that the shelf cover somebody is *still* looking
at has nothing but this one `NOT EXISTS` between it and a background delete.

The cover is set through `PATCH /api/v1/shelves/:id` and the row the sweep must
spare is then read back out of `shelves.cover_file_id` rather than assumed to
be the uploaded id: 7.19's rule 1 copies a picture that is not already the
setter's own folder-less `cover`, and which row a page ends up naming is
AC-384's question, not this one's.

Spec 4.16, 4.18, 7.15, 7.16, 7.19 as amended 2026-09-04, 11.7; migrations
0003, 0012 and 0014; issues #116, #118 and #263.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makeShelf } from '../support/authorization-harness.js'
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

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac703')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-703 the reclaim sweep spares a picture a shelf wears', () => {
  test(
    `a shelf's cover survives at ${String(OUTSIDE_THE_WINDOW)} days while its unworn twin does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const shelfId = await makeShelf(owner, 'ac703 reclaim shelf cover')

      const chosen = await folderlessPicture(owner, 'cover', 'ac703-held.png')
      const inside = await folderlessPicture(owner, 'cover', 'ac703-inside.png')
      const outside = await folderlessPicture(owner, 'cover', 'ac703-outside.png')

      const dressed = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: chosen,
      })
      expectStatus(
        dressed,
        200,
        'a shelf must take a folder-less cover of its owner\'s (spec 7.16, 7.19 rule 1)',
      )
      const held = await referencedFileId(
        db,
        sql`SELECT cover_file_id AS file_id FROM shelves
             WHERE id = ${shelfId}::uuid`,
        "the shelf's cover",
      )

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await ageTheMark(db, inside, INSIDE_THE_WINDOW)
      await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      const spared = await expectSpared(
        fixture,
        held,
        `a picture a shelf still wears must survive the 11.7 pass at ${String(OUTSIDE_THE_WINDOW)} days`,
      )
      expect(
        spared.marked,
        'the clear arm must take the mark off a picture something references again (domain/files.ts, the `cleared` CTE)',
      ).toBe(false)

      const young = await expectSpared(
        fixture,
        inside,
        `a picture nothing wears is still the caller's to name again at ${String(INSIDE_THE_WINDOW)} days and must survive — a cover picker setting the same picture back is an ordinary thing to do (issue #116, AC-368)`,
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

      /* The other direction, through the endpoint a person uses: the shelf
         takes a gallery preset instead, which is the replacement #116
         describes, and the window runs from that moment. */
      const replaced = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: null,
      })
      expectStatus(
        replaced,
        200,
        'a shelf must let its cover go (spec 7.16)',
      )
      const bare = await rows(
        db,
        sql`SELECT cover_file_id FROM shelves WHERE id = ${shelfId}::uuid`,
      )
      expect(
        bare[0]?.cover_file_id ?? null,
        'the shelf must be wearing nothing before the sweep may consider the picture',
      ).toBeNull()

      await runPass(fixture.app)
      const remarked = await expectSpared(
        fixture,
        held,
        'the pass that first finds the picture unworn must not also delete it — the caller is still holding its id',
      )
      expect(
        remarked.markIsFresh,
        'the mark must be written when the cover came off, not when the bytes arrived: a cover worn since June is unreferenced and four months old on the same afternoon (migration 0014)',
      ).toBe(true)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await runPass(fixture.app)
      await expectReclaimed(
        fixture,
        held,
        `once the shelf has let go and the mark is ${String(OUTSIDE_THE_WINDOW)} days old, the picture goes with its object`,
      )
    },
    120_000,
  )
})
