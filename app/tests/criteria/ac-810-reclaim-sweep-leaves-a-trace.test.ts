/*
AC-810: the 11.7 tick's fifth duty writes down what it destroyed, and it is
bounded.

**What was wrong.** Issue #276, found by the agent writing #263's coverage.
`reclaimUnwornPictures` permanently deletes a person's uploaded picture — the
`files` row and the object in the store — thirty days after the last reference
to it goes. It answered the deleted ids, `pass.ts` put the count in
`ReminderPassOutcome.reclaimedPictures`, and `interval.ts` then discarded the
outcome: `void pass().catch(…)` wrote a line for a throw and nothing at all
for the path that deletes things. Two of the five reference arms cascade —
`comment_files.file_id` and `user_page_covers.file_id` — so the row that
recorded the reference goes with the file. A person saying "my cover has
vanished" left nobody anything to check: no count, no id, no date, and no row
saying the picture was ever used. The only evidence Dana had deleted it was
the absence of the thing.

**AC-700 to AC-705 cannot see this, which is why the number is spent.** Every
one of them asserts the `files` row and the object, which is right and is the
rule that harness was written on — a sweep that reports four deletions while
deleting nothing satisfies any assertion over its return value. But a sweep
that deletes correctly and says nothing satisfies all six of them too. This is
the criterion over what is left behind rather than over what is taken.

**Three things are pinned here and they are one decision each.**

1. **A reclaimed file writes one line of its own**, carrying the id, the owner
   whose 10.3 gigabyte just got smaller, the kind, the bytes and the mark the
   thirty days were counted from. The filename is *not* on it and this file
   asserts its absence: it is a name somebody typed, which is user content of
   the sort 10.5's never-log list is about.
2. **A quiet pass writes nothing.** The tick is sixty seconds, so an
   unconditional line is 1,440 a day of zeroes and the one that mattered is
   lost in them. The silence is asserted against the *same* pass that then
   speaks the moment it takes a picture, so it cannot pass by the pass never
   having run — which is the only interesting way a "nothing was written"
   assertion goes wrong. The other arm of the condition, a pass that did
   nothing but took too long, is reached by composing a pass whose threshold
   is zero.
3. **The claim is capped.** One `DELETE` with no `LIMIT` followed by a serial,
   awaited `store.remove(id)` per row is a tick of unbounded length, and
   `interval.ts` answers a long pass by *skipping* the next one rather than
   queueing it — so an unbounded sweep does not merely run long, it eats ticks
   for as long as it takes. `RECLAIM_BATCH + 1` aged pictures are seeded, one
   pass takes `RECLAIM_BATCH` of them and the next takes the rest.

Every assertion reads the `files` rows and the object store, never the count
the pass answers, on the reclaim harness's own standing rule.

Spec 4.16, 7.15, 7.19 as amended 2026-09-04, 10.3, 10.5 as amended
2026-09-20, 11.7; migration 0014; issues #116, #263 and #276.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  OUTSIDE_THE_WINDOW,
  RECLAIM_BATCH,
  expectReclaimed,
  folderlessPicture,
  seedAgedPictures,
  startReclaimApp,
  survivorsOf,
} from '../support/reclaim-harness.js'
import type { ReclaimApp } from '../support/reclaim-harness.js'
import { ageTheMark } from '../support/reclaim-harness.js'
import { passCapturingLogs } from '../support/reminders-harness.js'
import { ONE_PIXEL_PNG } from '../support/uploads-harness.js'

/** The shape `files.unreferenced_since` reaches a log line in: one instant,
 * to the second, in UTC. Asserted as well as compared, because 10.5's
 * whitelist writes `other` for anything outside it and a mangled field would
 * otherwise still equal whatever the database was asked to render. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac810')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-810 the 11.7 reclaim says what it destroyed, and is bounded', () => {
  test(
    'a pass that did nothing but took too long says so anyway',
    async () => {
      await cast.of(fixture.app)
      /* Threshold zero, so every pass is over it. The production number is
         half of 11.7's sixty seconds — the warning before
         `reminder_pass_overlapped`, which fires only once a whole tick has
         already been lost — and a case that waited for it would take half a
         minute to assert one line. */
      const pass = await passCapturingLogs(fixture.app, { slowPassMs: 0 })

      await pass.run()

      expect(
        pass.of('file_reclaimed'),
        'nothing was reclaimed, so nothing is written down about a file',
      ).toEqual([])
      const completed = pass.of('reminder_pass_completed')
      expect(
        completed.length,
        'but the pass itself is: a tick that takes longer than its threshold is an operational fact whether or not it found work, and it is the one that precedes the loop starting to skip',
      ).toBe(1)
      expect(
        {
          reclaimed_pictures: completed[0]?.reclaimed_pictures,
          purged_trash: completed[0]?.purged_trash,
          purged_events: completed[0]?.purged_events,
          pruned_sessions: completed[0]?.pruned_sessions,
        },
        'carrying four honest zeroes rather than being suppressed for having them',
      ).toEqual({
        reclaimed_pictures: 0,
        purged_trash: 0,
        purged_events: 0,
        pruned_sessions: 0,
      })
    },
    120_000,
  )

  test(
    'a quiet pass writes nothing, and the same pass writes the file down when it takes one',
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const pass = await passCapturingLogs(fixture.app)

      /* The silence, first, and with the same pass that speaks below. A
         separate quiet pass would prove only that some pass wrote nothing,
         which a pass that never ran also does. */
      await pass.run()
      expect(
        pass.of('file_reclaimed'),
        'a tick with nothing to reclaim must write no file line: at sixty seconds, a line per tick is 1,440 a day of zeroes',
      ).toEqual([])
      expect(
        pass.of('reminder_pass_completed'),
        'and no outcome line either, for the same reason — the condition is that the pass did something or took too long, and this one did neither',
      ).toEqual([])

      /* One picture, uploaded through the write path so that what is deleted
         is a row the product made rather than one this file invented, and
         named with a word 10.5 must never let out. */
      const secret = 'ac810-private-holiday-photo.png'
      const fileId = await folderlessPicture(owner, 'cover', secret)
      await ageTheMark(db, fileId, OUTSIDE_THE_WINDOW)

      /* The mark as the database renders it, read while the row still
         exists: after the pass there is nothing left to compare against,
         which is the whole complaint issue #276 makes. */
      const before = await rows(
        db,
        sql`SELECT to_char(unreferenced_since AT TIME ZONE 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS mark,
                   bytes
              FROM files WHERE id = ${fileId}::uuid`,
      )
      const mark = String(before[0]?.mark)
      expect(mark, 'the seeded mark must be readable before the sweep takes the row').toMatch(
        INSTANT,
      )

      await pass.run()

      await expectReclaimed(
        fixture,
        fileId,
        `a folder-less cover carrying a mark ${String(OUTSIDE_THE_WINDOW)} days old is taken`,
      )

      const written = pass.of('file_reclaimed')
      expect(
        written.length,
        'one line per reclaimed file, which is the answer to "my cover vanished and there is nothing to check"',
      ).toBe(1)
      expect(
        written[0]?.file_id,
        'the id is the only handle anybody has on a row that no longer exists',
      ).toBe(fileId)
      expect(
        written[0]?.owner_id,
        "the owner, because it is their 10.3 gigabyte that just got smaller and they are who would ask",
      ).toBe(owner.id)
      expect(
        written[0]?.kind,
        'the kind, which says what the sweep believed it was taking — its two scope clauses are `RECLAIMABLE_KINDS` (`cover`, `image`, `file`, `audio` and `video`, read by all three arms from that one constant) and `folder_id IS NULL`, so this field is the only thing on the line that distinguishes a reclaimed cover from a reclaimed composer asset',
      ).toBe('cover')
      expect(
        written[0]?.bytes,
        'the size, the only measure left of what was lost',
      ).toBe(ONE_PIXEL_PNG.byteLength)
      expect(
        written[0]?.unreferenced_since,
        'and the mark the thirty days were counted from, as the database rendered it rather than as this process would have',
      ).toBe(mark)
      expect(
        String(written[0]?.unreferenced_since),
        "in 10.5's own shape: a value outside it is written as `other` by the whitelist, which would compare equal to nothing and must not pass unnoticed",
      ).toMatch(INSTANT)

      const completed = pass.of('reminder_pass_completed')
      expect(
        completed.length,
        'and one outcome line for the pass, now that it has something to say',
      ).toBe(1)
      expect(
        {
          reclaimed_pictures: completed[0]?.reclaimed_pictures,
          purged_trash: completed[0]?.purged_trash,
          purged_events: completed[0]?.purged_events,
          pruned_sessions: completed[0]?.pruned_sessions,
        },
        'carrying all four sweep counts, because the other three are as silent as the reclaim was and the fix is one fix',
      ).toEqual({
        reclaimed_pictures: 1,
        purged_trash: 0,
        purged_events: 0,
        pruned_sessions: 0,
      })
      expect(
        typeof completed[0]?.duration_ms,
        'and how long it took, which is what says whether the tick is drifting toward the overlap guard',
      ).toBe('number')

      expect(
        JSON.stringify(pass.lines).includes('private-holiday-photo'),
        '10.5 keeps user content out of every line, and a filename is a name somebody typed. The line carries the kind and the bytes and has no parameter the name could arrive through',
      ).toBe(false)
    },
    120_000,
  )

  test(
    `one pass reclaims at most ${String(RECLAIM_BATCH)} pictures and the next takes the rest`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const seeded = await seedAgedPictures(
        fixture,
        owner.id,
        RECLAIM_BATCH + 1,
        OUTSIDE_THE_WINDOW,
      )
      const pass = await passCapturingLogs(fixture.app)

      await pass.run()

      const afterFirst = await survivorsOf(fixture, seeded)
      expect(
        afterFirst.rows.length,
        `the delete arm claims at most ${String(RECLAIM_BATCH)} rows in a pass. Without a cap, one DELETE with no LIMIT is followed by a serial awaited store.remove per row, and interval.ts answers a pass that outruns its minute by skipping the next tick rather than queueing it`,
      ).toBe(1)
      expect(
        afterFirst.bytes,
        'and the bytes go with the rows: a cap that took two hundred rows and removed no objects would satisfy any count over files alone',
      ).toEqual(afterFirst.rows)
      expect(
        pass.of('file_reclaimed').length,
        'every one of them says so, which is what makes a bulk reclaim readable after the fact rather than merely survivable',
      ).toBe(RECLAIM_BATCH)
      expect(
        pass.of('reminder_pass_completed')[0]?.reclaimed_pictures,
        'and the outcome line counts the pass rather than the backlog',
      ).toBe(RECLAIM_BATCH)

      await pass.run()

      const afterSecond = await survivorsOf(fixture, seeded)
      expect(
        afterSecond.rows,
        'the next tick takes the rest: truncating a pass is safe only because every duty is idempotent, and a row that waits one more minute has already waited thirty days (spec 11.7)',
      ).toEqual([])
      expect(afterSecond.bytes, 'bytes and rows leave together').toEqual([])
      expect(
        pass.of('file_reclaimed').length,
        'and the last one is written down like the other two hundred',
      ).toBe(RECLAIM_BATCH + 1)
    },
    120_000,
  )
})
