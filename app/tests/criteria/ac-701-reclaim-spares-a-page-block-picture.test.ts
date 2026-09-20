/*
AC-701: the second of the five columns that can hold a file id —
`page_blocks.file_id` — read against the 11.7 tick's fifth duty.

Given a folder-less picture a shelf page's image block still names, then the
sweep spares it at any age and clears the mark it was carrying; given its twin
of the same age that no block names, then the sweep deletes the row and the
object; and given one day either side of the thirty, then the younger survives
with its mark untouched and the older does not.

**This arm is reachable from a browser, which is what makes it the dangerous
one.** A shelf page's blocks have no folder — `page_blocks_one_home_check`
gives a block one home and a shelf page's is the shelf — so the picture on one
is a folder-less `image` of the person's own (migration 0015, issue #167).
That is precisely the shape the sweep takes, so the only thing standing
between a picture somebody is looking at on a shelf page and a background
delete is this one `NOT EXISTS`. The page is written through
`PUT /api/v1/shelves/:id/page` rather than by hand, so the row the sweep
meets is the row the product makes.

**The second case is AC-386's central sentence — "spare it until the last
reference goes" — which had no executable form anywhere until now.** Every
other case in these six files holds a picture through exactly one reference,
so all of them are satisfied by a sweep that takes a picture the moment *a*
reference is removed. This one puts one picture on two shelf pages, takes the
first block off and requires the picture to be **unmarked** as well as
undeleted: the window has not started, because nothing has stopped using it.
Then it takes the second off and requires the mark to be written at that
moment, which is what makes the thirty days run from the last reference
rather than the first.

**Its value is coverage of that sentence rather than a distinct regression
net, and this is worth saying plainly**: no one-line edit to
`fileIsUnreferenced()` fails this case while the first one passes, because any
predicate that lets a picture with one live block be marked also fails the
first. What it catches is the class the predicate's own comment prices and
refuses — a reference *count* kept beside the keys, decremented once per
removal, "free to disagree" with them — which arrives as a rewrite rather than
as a typo and which the single-reference cases cannot see at all.

Spec 4.16, 4.17, 4.18, 7.15, 7.16, 7.19 as amended 2026-09-04, 11.7;
migrations 0003 and 0014; issues #116, #167 and #263.
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
const cast = new Cast(['owner'], 'ac701')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-701 the reclaim sweep spares a picture a page block names', () => {
  test(
    `a shelf page's image survives at ${String(OUTSIDE_THE_WINDOW)} days while its unnamed twin does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const shelfId = await makeShelf(owner, 'ac701 reclaim page blocks')

      const held = await folderlessPicture(owner, 'image', 'ac701-held.png')
      const inside = await folderlessPicture(owner, 'image', 'ac701-inside.png')
      const outside = await folderlessPicture(owner, 'image', 'ac701-outside.png')

      const written = await owner.browser.json(
        `/shelves/${shelfId}/page`,
        'PUT',
        { blocks: [{ kind: 'image', position: 0, file_id: held }] },
      )
      expectStatus(
        written,
        200,
        'a shelf page must take the uploader\'s own folder-less picture on an image block (spec 7.16, migration 0015)',
      )

      const named = await referencedFileId(
        db,
        sql`SELECT file_id FROM page_blocks
             WHERE shelf_id = ${shelfId}::uuid AND file_id IS NOT NULL`,
        'the shelf page block',
      )
      expect(
        named,
        'the block must name the picture that was uploaded; a page write does not copy (spec 7.16)',
      ).toBe(held)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await ageTheMark(db, inside, INSIDE_THE_WINDOW)
      await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      const spared = await expectSpared(
        fixture,
        held,
        `a picture a shelf page still draws must survive the 11.7 pass at ${String(OUTSIDE_THE_WINDOW)} days`,
      )
      expect(
        spared.marked,
        'the clear arm must take the mark off a picture something references again (domain/files.ts, the `cleared` CTE)',
      ).toBe(false)

      const young = await expectSpared(
        fixture,
        inside,
        `a picture nothing names is still the caller's to name again at ${String(INSIDE_THE_WINDOW)} days and must survive`,
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
        `a picture nothing names, marked ${String(OUTSIDE_THE_WINDOW)} days ago, must be reclaimed`,
      )

      /* The other direction for this arm, through the same endpoint a person
         uses: the picture is dropped from the page and the window starts from
         that moment rather than from the upload. */
      const emptied = await owner.browser.json(
        `/shelves/${shelfId}/page`,
        'PUT',
        { blocks: [] },
      )
      expectStatus(
        emptied,
        200,
        'the block must come off the page before the sweep may consider its picture (spec 7.16)',
      )

      await runPass(fixture.app)
      const remarked = await expectSpared(
        fixture,
        held,
        'the pass that first finds the picture unreferenced must not also delete it',
      )
      expect(
        remarked.markIsFresh,
        'the mark must be written when the block let go, not when the bytes arrived (migration 0014)',
      ).toBe(true)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await runPass(fixture.app)
      await expectReclaimed(
        fixture,
        held,
        `once the page has let go and the mark is ${String(OUTSIDE_THE_WINDOW)} days old, the picture goes with its object`,
      )
    },
    120_000,
  )

  test(
    'one picture on two shelf pages is spared and unmarked until the last block lets go',
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const first = await makeShelf(owner, 'ac701 two references, first')
      const second = await makeShelf(owner, 'ac701 two references, second')

      const shared = await folderlessPicture(owner, 'image', 'ac701-shared.png')

      const draw = async (shelfId: string, blocks: unknown[]): Promise<void> => {
        const written = await owner.browser.json(
          `/shelves/${shelfId}/page`,
          'PUT',
          { blocks },
        )
        expectStatus(
          written,
          200,
          `the page of shelf ${shelfId} must take the write (spec 7.16)`,
        )
      }

      await draw(first, [{ kind: 'image', position: 0, file_id: shared }])
      await draw(second, [{ kind: 'image', position: 0, file_id: shared }])

      const naming = await rows(
        db,
        sql`SELECT shelf_id FROM page_blocks WHERE file_id = ${shared}::uuid`,
      )
      expect(
        naming.length,
        'both pages must name the one picture before the sweep can be asked which reference it counts; a page write copies nothing (spec 7.16)',
      ).toBe(2)

      await runPass(fixture.app)
      const held = await expectSpared(
        fixture,
        shared,
        'a picture two pages draw must survive',
      )
      expect(
        held.marked,
        'and must carry no mark while either page names it',
      ).toBe(false)

      /* The first page lets go. One reference remains, so nothing has
         stopped using the picture and the window has not started. */
      await draw(first, [])
      await runPass(fixture.app)

      const stillDrawn = await expectSpared(
        fixture,
        shared,
        'one page dropping its block must not put a picture the other page is still drawing in front of the timer',
      )
      expect(
        stillDrawn.marked,
        'and the mark must not be written on the first reference going: the thirty days run from the last one, or a picture nobody stopped using is deleted a month after somebody stopped using it somewhere else (AC-386)',
      ).toBe(false)

      const survivor = await rows(
        db,
        sql`SELECT file_id FROM page_blocks
             WHERE shelf_id = ${second}::uuid AND file_id IS NOT NULL`,
      )
      expect(
        survivor.map((row) => String(row.file_id)),
        'the second page is still drawing it throughout, which is what makes the sparing observable to a person rather than only to this query',
      ).toEqual([shared])

      /* And the last one. */
      await draw(second, [])
      await runPass(fixture.app)

      const released = await expectSpared(
        fixture,
        shared,
        'the pass that finds the last reference gone marks the picture rather than taking it',
      )
      expect(
        released.markIsFresh,
        'and the mark is written at that moment, so the window runs from the last reference going (migration 0014)',
      ).toBe(true)

      await ageTheMark(db, shared, OUTSIDE_THE_WINDOW)
      await runPass(fixture.app)
      await expectReclaimed(
        fixture,
        shared,
        `and ${String(OUTSIDE_THE_WINDOW)} days after the last page let go, the picture goes with its object`,
      )
    },
    120_000,
  )
})
