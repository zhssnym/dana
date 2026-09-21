/*
AC-705: the two clauses that decide what the 11.7 sweep may consider at all —
`kind IN ('cover', 'image', 'file', 'audio', 'video')` and `folder_id IS NULL`
— read against the rows they exclude **and against the rows they admit**.

The kind list was `('cover', 'image')` until migration 0024 (issue #220) added
the last three, and this file holds both halves of that clause: the kinds it
must never reach, below, and the kinds it must reach, in the second case. The
second half is not decoration. No page can name a folder-less `file`, `audio`
or `video` yet — 7.15's amendment of the same date is what makes them storable
without a folder — so this sweep is the only thing that will ever remove one,
and until the second case existed both widened lines could be reverted with
the whole suite still green.

AC-700 to AC-704 cover the five `NOT EXISTS` arms of `fileIsUnreferenced()`,
one criterion each. They are the whole of the *reference* question and none of
the *scope* one: every one of them holds a folder-less `cover` or `image`, so
a sweep widened to take a third kind, or to take folder-scoped pictures, is
green across all five. This file is the other half, and it is the half where
being wrong destroys a row no request ever asked about.

**`users.avatar_url` is text and not a foreign key.** `setAvatar` in
`app/src/server/domain/files.ts` writes `'/api/v1/files/' + id` into that
column, so no key into `files(id)` exists for an avatar and
`fileIsUnreferenced()` is **true of every avatar row that has ever existed**.
`createFile` forces `folder_id` null for one. Both of the sweep's other
conditions are therefore already satisfied by every profile picture in the
product, and that kind list is the only thing standing between the background
timer and all of them — in both arms, the mark and the delete. **The list is
widened by naming kinds, one at a time and never by restating it as a
`NOT IN`**, and `avatar` has stayed out of it through every widening.
Add `'avatar'` to it and the whole suite stays green
while pass one marks every avatar, pass two thirty-one days later deletes the
row and the bytes, and `users.avatar_url` points at a dead id forever with no
act by anybody behind it and no down migration.

**The realistic way that happens is not somebody typing `'avatar'`.** It is a
refactor toward what reads as a faithful restatement: `files_folderless_kind_check`
(migration 0015) admits exactly `avatar`, `cover` and `image` without a folder,
so `folder_id IS NULL AND kind NOT IN ('file','voice')` looks like the same
set and quietly contains every avatar.

**And `folder_id IS NULL` is the same sentence with a smaller blast radius.**
A folder-scoped picture is listed by its folder's surfaces and its members can
delete it themselves, so it is somebody's to manage and the timer has no
business with it; drop that clause from both arms and a folder's pictures
become sweepable while every reference arm stays satisfied.

**The control is what makes the four spared rows mean anything.** A sweep that
did nothing whatever would pass every "still there" assertion in this file, so
a folder-less `cover` of exactly the same age, referenced by exactly nothing,
is marked in the first pass and taken in the second beside them. The spared
rows differ from it in their kind or their folder and in nothing else.

Spec 4.3, 4.16, 4.17, 7.15, 7.19 as amended 2026-09-04, 10.3, 11.7; migrations
0014 and 0015; issues #167 and #263.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  AVATAR_PATH,
  INSIDE_THE_WINDOW,
  OUTSIDE_THE_WINDOW,
  RECLAIM_WINDOW_DAYS,
  ageTheMark,
  avatarPicture,
  expectReclaimed,
  expectSpared,
  folderlessPicture,
  startReclaimApp,
} from '../support/reclaim-harness.js'
import type { ReclaimApp } from '../support/reclaim-harness.js'
import { runPass } from '../support/reminders-harness.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadCoverOk,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'

let fixture: ReclaimApp
const cast = new Cast(['owner'], 'ac705')

beforeAll(async () => {
  fixture = await startReclaimApp()
}, 120_000)

afterAll(async () => {
  if ((fixture as ReclaimApp | undefined) === undefined) return
  await cast.cleanup(fixture.app.db)
  await fixture.app.close()
})

describe('AC-705 what the reclaim sweep may consider: the kind list and the folder clause', () => {
  test(
    `an avatar and a folder's own pictures survive a pass and a mark ${String(OUTSIDE_THE_WINDOW)} days old, while an unreferenced folder-less cover does not`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db
      const folderId = await createFolder(owner, 'ac705 reclaim scope')

      const avatar = await avatarPicture(owner, 'ac705-avatar.png')
      const folderCover = await uploadCoverOk(owner, folderId, 'ac705-folder-cover.png')
      const folderImage = await uploadImageOk(owner, folderId, 'ac705-folder-image.png')
      /* The control: same owner, same bytes, same absence of any reference —
         and folder-less, and of a kind the sweep takes. */
      const sweepable = await folderlessPicture(owner, 'cover', 'ac705-sweepable.png')

      /* The premise, read from the database rather than asserted from the
         source: the avatar is exactly the shape the sweep takes but for its
         kind, and the two folder pictures are exactly that shape but for
         their folder. If any of these three stops being true the criterion
         below is measuring something else. */
      const shapes = await rows(
        db,
        sql`SELECT id, kind, folder_id FROM files
             WHERE id IN (${avatar}::uuid, ${folderCover}::uuid,
                          ${folderImage}::uuid, ${sweepable}::uuid)`,
      )
      const shapeOf = (id: string): { kind: string; folderless: boolean } => {
        const row = shapes.find((held) => String(held.id) === id)
        expect(row, `the stored row for ${id} must be readable`).toBeDefined()
        return {
          kind: String(row?.kind),
          folderless: (row?.folder_id ?? null) === null,
        }
      }
      expect(
        shapeOf(avatar),
        'POST /me/avatar stores kind avatar with no folder, which satisfies `folder_id IS NULL` on its own (domain/files.ts, createFile)',
      ).toEqual({ kind: 'avatar', folderless: true })
      expect(
        shapeOf(folderCover),
        'a cover uploaded into a folder keeps that folder (spec 7.15)',
      ).toEqual({ kind: 'cover', folderless: false })
      expect(
        shapeOf(folderImage),
        'and so does an image (spec 7.15 as amended 2026-09-04)',
      ).toEqual({ kind: 'image', folderless: false })
      expect(
        shapeOf(sweepable),
        'the control must be the shape the sweep exists for, or it proves nothing about the pass having run',
      ).toEqual({ kind: 'cover', folderless: true })

      /* And the structural half of the premise: nothing in the schema points
         `users` at `files`, so no arm of `fileIsUnreferenced()` can see an
         avatar and none ever will while the column is text. This is the
         reason the kind clause is load-bearing rather than tidy, and it is
         the case `guard-reclaim-reference-arms.test.ts` cannot reach — that
         guard reads `pg_constraint`, and a reference held as a URL is not
         there to be read. */
      const keysFromUsers = await rows(
        db,
        sql`SELECT att.attname AS column_name
              FROM pg_constraint con
              JOIN pg_class child ON child.oid = con.conrelid
              JOIN pg_class parent ON parent.oid = con.confrelid
              JOIN LATERAL unnest(con.conkey) AS key(attnum) ON true
              JOIN pg_attribute att
                ON att.attrelid = con.conrelid AND att.attnum = key.attnum
             WHERE con.contype = 'f'
               AND parent.relname = 'files'
               AND child.relname = 'users'`,
      )
      expect(
        keysFromUsers.map((row) => String(row.column_name)),
        'users holds its avatar as the text of a serving path, so fileIsUnreferenced() is true of every avatar row. If a key arrives here, an avatar becomes referenceable and this criterion must be re-read before it is trusted',
      ).toEqual([])

      const avatarUrl = await rows(
        db,
        sql`SELECT avatar_url FROM users WHERE id = ${owner.id}::uuid`,
      )
      expect(
        String(avatarUrl[0]?.avatar_url),
        'and the column names the stored row, which is the only record anywhere that the picture is in use',
      ).toBe(`${AVATAR_PATH}${avatar}`)

      /* Pass one. The mark arm's scope clauses, all four rows at once. */
      await runPass(fixture.app)

      const markedAvatar = await expectSpared(
        fixture,
        avatar,
        'an avatar is not a cover or an image and the sweep must not consider it at all',
      )
      expect(
        markedAvatar.marked,
        "the mark arm must never write on an avatar: nothing references it by key, so a mark is the first of the two steps to deleting every profile picture in the product (domain/files.ts, the `marked` CTE's `kind IN ('cover', 'image', 'file', 'audio', 'video')`, which has never admitted an avatar through any widening)",
      ).toBe(false)

      for (const [id, what] of [
        [folderCover, "a folder's own cover"],
        [folderImage, "a folder's own image"],
      ] as const) {
        const seen = await expectSpared(
          fixture,
          id,
          `${what} is listed by that folder and deletable by its members, so the timer must leave it`,
        )
        expect(
          seen.marked,
          `${what} must not be marked: a folder-scoped picture is somebody's to manage, and 8.8's folder deletion is what removes it (domain/files.ts, the \`marked\` CTE's \`folder_id IS NULL\`)`,
        ).toBe(false)
      }

      const control = await expectSpared(
        fixture,
        sweepable,
        'the first pass to find a folder-less cover unreferenced marks it rather than taking it',
      )
      expect(
        control.markIsFresh,
        'and the control must carry a mark from this pass, or the pass did not run and every assertion above it is vacuous',
      ).toBe(true)

      /* Pass two. The delete arm carries its own copy of both clauses, so it
         is reached by handing it a mark the arm above would never have
         written. Every one of the four now stands at the same age on the far
         side of the window, and only the control's kind and folder put it
         inside the sweep. */
      for (const id of [avatar, folderCover, folderImage, sweepable]) {
        await ageTheMark(db, id, OUTSIDE_THE_WINDOW)
      }
      await runPass(fixture.app)

      await expectSpared(
        fixture,
        avatar,
        `an avatar carrying a mark ${String(OUTSIDE_THE_WINDOW)} days old must keep its row and its bytes: the delete arm's kind clause is the whole of what stops it`,
      )
      await expectSpared(
        fixture,
        folderCover,
        `a folder's cover carrying a mark ${String(OUTSIDE_THE_WINDOW)} days old must keep its row and its bytes`,
      )
      await expectSpared(
        fixture,
        folderImage,
        `a folder's image carrying a mark ${String(OUTSIDE_THE_WINDOW)} days old must keep its row and its bytes`,
      )
      await expectReclaimed(
        fixture,
        sweepable,
        `and the folder-less cover of the same age that nothing references is taken, which is what ${String(RECLAIM_WINDOW_DAYS)} days means`,
      )

      const after = await rows(
        db,
        sql`SELECT u.avatar_url, f.id AS file_id
              FROM users u
              LEFT JOIN files f
                ON u.avatar_url = ${AVATAR_PATH}::text || f.id::text
             WHERE u.id = ${owner.id}::uuid`,
      )
      expect(
        String(after[0]?.avatar_url),
        'the person still wears the avatar they uploaded',
      ).toBe(`${AVATAR_PATH}${avatar}`)
      expect(
        after[0]?.file_id ?? null,
        'and that column still resolves to a live files row. A text reference cannot be set null by a foreign key, so a sweep that took the row would leave every avatar_url in the table pointing at nothing, permanently and with nothing to notice',
      ).toBe(avatar)
    },
    120_000,
  )
  /*
  The other half of the same clause, added 2026-09-20 with issue #220.

  **The case above holds the kinds the list must never admit; this one holds
  the three it must.** Migration 0024 widened `kind IN ('cover', 'image')` to
  `('cover', 'image', 'file', 'audio', 'video')` in both arms, and until this
  case existed **both widened lines could be reverted with the whole suite
  still green** — 241 files and 1856 tests, measured. That is the shape of gap
  the reclaim criteria exist to close: the sweep is the one path in Dana that
  destroys data on a clock rather than on a request, so a clause nothing
  exercises is a clause nobody will notice losing.

  **Why it is this sweep or nothing.** 7.15 as amended the same date makes a
  `file`, an `audio` and a `video` storable with no folder, and no page can
  name a folder-less one yet — the composer's picker is the frontend phase's.
  So a folder-less asset of these three kinds is reachable by no surface and
  no route the moment the block that named it is gone, and there is no other
  code path anywhere that will ever remove it. Left out of the list it would
  spend its owner's 10.3 gigabyte for ever.

  The shape is AC-700 to AC-704's: one day either side of the line, an
  identically-aged twin so that only the day separates them, and a folder-less
  `cover` of the same age as the control that proves the pass both marked and
  deleted. Both arms are measured, because the clause is written twice — pass
  one is the `marked` CTE's copy, pass two the delete's — and reverting either
  line alone takes this case red on its own.
  */
  test(
    `a folder-less file, audio and video are marked, then taken at ${String(OUTSIDE_THE_WINDOW)} days and kept at ${String(INSIDE_THE_WINDOW)}`,
    async () => {
      const [owner] = (await cast.of(fixture.app)) as [Actor]
      const db = fixture.app.db

      /* One upload per kind per side of the line, and the (kind, MIME, bytes)
         triples are the ones 7.15's allowlists admit — a `file` is untrusted
         bytes, an `audio` and a `video` went through the container check. */
      const made = {
        file: {
          inside: await uploadKindOk(owner, 'file', null, {
            name: 'ac705-file-inside.q4data',
            type: 'application/octet-stream',
            bytes: ZIP_BYTES,
          }),
          outside: await uploadKindOk(owner, 'file', null, {
            name: 'ac705-file-outside.q4data',
            type: 'application/octet-stream',
            bytes: ZIP_BYTES,
          }),
        },
        audio: {
          inside: await uploadKindOk(owner, 'audio', null, {
            name: 'ac705-audio-inside.mp3',
            type: 'audio/mpeg',
            bytes: MP3_BYTES,
          }),
          outside: await uploadKindOk(owner, 'audio', null, {
            name: 'ac705-audio-outside.mp3',
            type: 'audio/mpeg',
            bytes: MP3_BYTES,
          }),
        },
        video: {
          inside: await uploadKindOk(owner, 'video', null, {
            name: 'ac705-video-inside.mp4',
            type: 'video/mp4',
            bytes: MP4_BYTES,
          }),
          outside: await uploadKindOk(owner, 'video', null, {
            name: 'ac705-video-outside.mp4',
            type: 'video/mp4',
            bytes: MP4_BYTES,
          }),
        },
      } as const
      /* The control, and it is the one row in this case whose treatment did
         not change in 0024: if the pass stops taking *this*, the case is
         measuring a broken pass rather than a narrowed clause. */
      const control = await folderlessPicture(owner, 'cover', 'ac705-control.png')

      const everyNewKind = [
        ['file', made.file.inside, made.file.outside],
        ['audio', made.audio.inside, made.audio.outside],
        ['video', made.video.inside, made.video.outside],
      ] as const

      /* The premise, read from the database rather than asserted from the
         source: each row is exactly the shape the sweep's two scope clauses
         describe. If 0024's `files_folderless_kind_check` ever stopped
         admitting these without a folder, this case would be measuring rows
         that could not exist. */
      for (const [kind, inside, outside] of everyNewKind) {
        for (const id of [inside, outside]) {
          const shape = await rows(
            db,
            sql`SELECT kind, folder_id FROM files WHERE id = ${id}::uuid`,
          )
          expect(
            { kind: String(shape[0]?.kind), folderless: (shape[0]?.folder_id ?? null) === null },
            `a folder-less ${kind} must store as that kind with no folder (spec 7.15 as amended 2026-09-20, migration 0024's files_folderless_kind_check)`,
          ).toEqual({ kind, folderless: true })
        }
      }

      /* Pass one: the `marked` CTE's copy of the kind clause. Nothing
         references any of these seven rows, so every one of them must come
         out of this pass carrying a mark written by it. */
      await runPass(fixture.app)

      for (const [kind, inside, outside] of everyNewKind) {
        for (const id of [inside, outside]) {
          const seen = await expectSpared(
            fixture,
            id,
            `the pass that first finds a folder-less ${kind} unreferenced must mark it rather than take it`,
          )
          expect(
            seen.markIsFresh,
            `a folder-less ${kind} nothing references must be marked by the mark arm: migration 0024 added its kind to that arm's list, and with the list back at ('cover', 'image') this row is never marked, never reclaimed, and spends its owner's 10.3 gigabyte for ever with no route able to delete it (domain/files.ts, the \`marked\` CTE)`,
          ).toBe(true)
        }
      }
      const markedControl = await expectSpared(
        fixture,
        control,
        'and the control is marked on the same pass',
      )
      expect(
        markedControl.markIsFresh,
        'or the pass did not run and every assertion above it is vacuous',
      ).toBe(true)

      /* Pass two: the delete arm's own copy of the same clause, reached by
         standing the six rows one day either side of the line. */
      for (const [, inside, outside] of everyNewKind) {
        await ageTheMark(db, inside, INSIDE_THE_WINDOW)
        await ageTheMark(db, outside, OUTSIDE_THE_WINDOW)
      }
      await ageTheMark(db, control, OUTSIDE_THE_WINDOW)

      await runPass(fixture.app)

      for (const [kind, inside, outside] of everyNewKind) {
        const young = await expectSpared(
          fixture,
          inside,
          `a folder-less ${kind} marked ${String(INSIDE_THE_WINDOW)} days ago is still its owner's to use again and must survive`,
        )
        expect(
          young.marked,
          `and its mark must be left exactly as it was, or the ${String(RECLAIM_WINDOW_DAYS)} days restart every tick and nothing is ever reclaimed`,
        ).toBe(true)
        expect(
          young.markIsFresh,
          'which means it must not have been rewritten to now()',
        ).toBe(false)

        await expectReclaimed(
          fixture,
          outside,
          `a folder-less ${kind} nothing references, marked ${String(OUTSIDE_THE_WINDOW)} days ago, must be taken — row and bytes. Its twin one day inside the line survives, so the day is the only thing separating them, and the delete arm carries its own copy of the kind list (domain/files.ts)`,
        )
      }

      await expectReclaimed(
        fixture,
        control,
        `and the folder-less cover of the same age is taken too, which is what ${String(RECLAIM_WINDOW_DAYS)} days means for the two kinds that were already in the list`,
      )
    },
    120_000,
  )
})
