/*
AC-700: the first of the five columns that can hold a file id —
`comment_files.file_id` — read against the 11.7 tick's fifth duty.

Given a folder-less picture a comment still carries, then the sweep spares it
at any age and clears the mark it was carrying; given its twin of the same age
that nothing carries, then the sweep deletes the row and the object; and given
one day either side of the thirty, then the younger survives with its mark
untouched and the older does not.

**Why this arm gets a file of its own, and why the reference is built in SQL.**
No route in section 7 can produce this state. Both halves of the comment
contract scope an attachment to the comment's own folder — `createComment` and
`updateComment` in `app/src/server/domain/comments.ts` each read
`FROM files WHERE folder_id = <the comment's folder>` — so a `comment_files`
row naming a picture with no folder can only be a legacy row or the first row
after somebody widens that clause. The `NOT EXISTS (... comment_files ...)`
arm of `fileIsUnreferenced()` is therefore defensive today, which is exactly
why it is worth a case: a regression that dropped it would be invisible in
production until the day it destroyed somebody's attachment, and
`comment_files_file_id_fkey` is `ON DELETE CASCADE`, so the row recording that
the attachment ever existed goes with the bytes and nothing anywhere logs it.
The insert below is written by hand for that reason and not for convenience.

Spec 4.16, 7.14, 7.15, 7.19 as amended 2026-09-04, 11.7; migrations 0003 and
0014; issue #263.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makeComment } from '../support/authorization-harness.js'
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
  startReclaimApp,
} from '../support/reclaim-harness.js'
import type { ReclaimApp } from '../support/reclaim-harness.js'
import { runPass } from '../support/reminders-harness.js'

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac700')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-700 the reclaim sweep spares a picture a comment carries', () => {
  test(
    `a comment's attachment survives at ${String(OUTSIDE_THE_WINDOW)} days while its unheld twin does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const folderId = await createFolder(owner, 'ac700 reclaim comments')
      const commentId = await makeComment(owner, folderId, 'ac700 with a picture')

      /* Three pictures of one shape, so that what separates them is the
         reference and the day and nothing else. */
      const held = await folderlessPicture(owner, 'cover', 'ac700-held.png')
      const inside = await folderlessPicture(owner, 'cover', 'ac700-inside.png')
      const outside = await folderlessPicture(owner, 'cover', 'ac700-outside.png')

      await db.execute(
        sql`INSERT INTO comment_files (comment_id, file_id)
            VALUES (${commentId}::uuid, ${held}::uuid)`,
      )

      /* `held` and `outside` are aged identically. Everything the sweep may
         do to one and not the other is the comment_files arm. */
      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await ageTheMark(db, inside, INSIDE_THE_WINDOW)
      await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      const spared = await expectSpared(
        fixture,
        held,
        `a picture a comment still carries must survive the 11.7 pass at ${String(OUTSIDE_THE_WINDOW)} days`,
      )
      expect(
        spared.marked,
        "the clear arm must take the mark off a picture something references again, or a month-old mark is all that stands between a carried picture and its deletion (domain/files.ts, the `cleared` CTE)",
      ).toBe(false)

      const young = await expectSpared(
        fixture,
        inside,
        `a picture nothing references is still the caller's to name again at ${String(INSIDE_THE_WINDOW)} days and must survive`,
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
        `a picture nothing references, marked ${String(OUTSIDE_THE_WINDOW)} days ago, must be reclaimed`,
      )

      /* The other direction for this arm: the guard is a reference check and
         not a blanket amnesty for anything that was ever referenced. */
      await db.execute(
        sql`DELETE FROM comment_files WHERE file_id = ${held}::uuid`,
      )
      await runPass(fixture.app)

      const remarked = await expectSpared(
        fixture,
        held,
        'the pass that first finds a picture unreferenced must not also delete it',
      )
      expect(
        remarked.markIsFresh,
        `the mark must be written when the last reference goes, not when the bytes arrived: a picture carried for a year is unreferenced and old on the same day, and ageing from created_at would take it with no window at all (migration 0014)`,
      ).toBe(true)

      await ageTheMark(db, held, OUTSIDE_THE_WINDOW)
      await runPass(fixture.app)
      await expectReclaimed(
        fixture,
        held,
        `once the comment has let go and the mark is ${String(OUTSIDE_THE_WINDOW)} days old, the picture goes with its object`,
      )

      const orphanRows = await rows(
        db,
        sql`SELECT file_id FROM comment_files WHERE comment_id = ${commentId}::uuid`,
      )
      expect(
        orphanRows.length,
        'and the comment is left carrying nothing rather than a row naming a file that no longer exists',
      ).toBe(0)
    },
    120_000,
  )
})
