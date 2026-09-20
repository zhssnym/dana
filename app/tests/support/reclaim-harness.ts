/*
The 11.7 tick's fifth duty, set up and read: `reclaimUnwornPictures` in
`app/src/server/domain/files.ts`, which permanently deletes a folder-less
picture and its bytes thirty days after the last thing that named it stopped
naming it.

**Why this harness exists rather than five copies of its contents.** Issue
#263: the sweep is the only code path in Dana that destroys a person's data on
a clock rather than on a request, and until AC-700 to AC-704 nothing anywhere
in the suite ran it. Those five files each pin one of the five columns that can
hold a file id, and they differ only in how the reference is made and unmade;
everything else — the application, the store, the picture, the mark, and what
counts as kept or taken — is one shape, and five copies of it would be five
chances for one of them to assert less than it reads.

Three decisions worth the words.

**The window is written here as 30 and is never imported from the server.**
`COVER_RECLAIM_DAYS` is the implementation's own constant, so a criterion that
imported it would move with any edit to it and pin nothing at all. 7.13's Trash
and 8.8's purge draw the same line, and 7.19 as amended 2026-09-04 draws it for
covers; that decision is what the five files assert, one day either side of it.

**A case ages the mark rather than the clock.** `files.unreferenced_since`
(migration 0014) is what the delete arm compares against `now()`, so pushing it
back 29 or 31 days is the whole of what standing either side of the boundary
takes. Nothing here reads a clock in this process: every comparison that needs
one is written as SQL against the database's own `now()`, which is the seam
`CLAUDE.md` records two criteria having been bitten by.

**What a case asserts is the row and the object, never the count the pass
answers.** A sweep that returns four ids while deleting nothing satisfies any
assertion over its return value, and a sweep that deletes a picture whose
`comment_files` row cascades away with it leaves no response anywhere saying
so. So `expectSpared` and `expectReclaimed` below read `files` and the object
store the application was built with, and the pass's own outcome is not
consulted.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { memoryFileStore } from './authorization-harness.js'
import type { MemoryFileStore } from './authorization-harness.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

/**
 * 7.13, 8.8 and 7.19's one line, stated here rather than imported from
 * `COVER_RECLAIM_DAYS`: this is the decision the five criteria pin, and a
 * criterion that read the implementation's constant would agree with whatever
 * that constant became.
 */
export const RECLAIM_WINDOW_DAYS = 30

/** One day inside the window: a picture this old is still the caller's to
 * name again, and the sweep must leave it. */
export const INSIDE_THE_WINDOW = RECLAIM_WINDOW_DAYS - 1

/** One day outside it: the sweep must take this one, row and bytes. */
export const OUTSIDE_THE_WINDOW = RECLAIM_WINDOW_DAYS + 1

export interface ReclaimApp {
  /** The application, its database and its 11.10 sink. */
  app: AuthTestApp
  /** The same store the application and the 11.7 pass were built with, so a
   * removed object is observable. In memory rather than on disk for
   * `memoryFileStore`'s own reason: `.data` is a directory this suite has
   * been bitten by before (CLAUDE.md). */
  store: MemoryFileStore
}

export async function startReclaimApp(): Promise<ReclaimApp> {
  const store = memoryFileStore()
  const app = await startAuthTestApp({ fileStore: store })
  return { app, store }
}

/** `setAvatar` writes this prefix and the new row's id into
 * `users.avatar_url` as one string (`domain/files.ts`), and taking the id back
 * off it is the only way any caller learns which `files` row its avatar is. */
export const AVATAR_PATH = '/api/v1/files/'

/**
 * A picture with no folder, owned by this person: the only shape the sweep
 * considers at all (`kind IN ('cover','image') AND folder_id IS NULL`).
 *
 * Sent with no `folder_id` part rather than an empty one, which is the wire
 * shape 7.15 admits as amended by issues #20, #100 and #167.
 */
export async function folderlessPicture(
  actor: Actor,
  kind: 'cover' | 'image',
  name: string,
): Promise<string> {
  const stored = await upload(
    actor,
    '/files',
    { kind },
    { name, type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  expectStatus(
    stored,
    201,
    `a folder-less ${kind} must be stored before the 11.7 sweep can be measured over it (spec 7.15 as amended 2026-09-04)`,
  )
  const id = (stored.json() as { id?: unknown }).id
  expect(typeof id, 'the stored row answers with its id (spec 7.0)').toBe(
    'string',
  )
  return id as string
}

/**
 * One stored avatar, through `POST /me/avatar`, answering its `files` row id.
 *
 * **This is the shape the sweep's `kind` clause is the only defence against,
 * which is why it lives here and not in `uploads-harness.ts` beside the other
 * three.** An avatar is folder-less by force — `createFile` refuses one that
 * names a folder — and `users.avatar_url` holds it as the **text** of a
 * serving path rather than as a foreign key, so `fileIsUnreferenced()` is true
 * of every avatar row that has ever existed. `POST /files` cannot make one
 * either: its `kind` enum is `image | file | voice | cover`, so this endpoint
 * is the only way in, which is why this is a helper of its own rather than a
 * `folderlessPicture(actor, 'avatar', …)` call.
 *
 * The id is taken from the answer's own `avatar_url` rather than from the
 * database, so a case that then reads `users.avatar_url` is comparing the
 * column against what the caller was told rather than against itself.
 */
export async function avatarPicture(
  actor: Actor,
  name: string,
): Promise<string> {
  const stored = await upload(
    actor,
    '/me/avatar',
    {},
    { name, type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  expectStatus(
    stored,
    200,
    'the avatar must be stored before the 11.7 sweep can be measured over it (spec 7.15)',
  )
  const url = (stored.json() as { avatar_url?: unknown }).avatar_url
  expect(
    typeof url === 'string' && url.startsWith(AVATAR_PATH),
    `POST /me/avatar answers the serving path of the stored row (spec 7.15); read ${String(url)}`,
  ).toBe(true)
  return String(url).slice(AVATAR_PATH.length)
}

/**
 * Push `files.unreferenced_since` back by whole days, so a case can stand one
 * day either side of the 30-day line without waiting a month.
 *
 * The arithmetic is the database's, against the same `now()` the sweep's own
 * delete arm reads. Asserting that exactly one row moved is not ceremony: a
 * uuid that names nothing would otherwise leave the case measuring a picture
 * that was never aged, which reads as the sweep sparing it.
 *
 * **On a row carrying no mark this writes one**, which is not a side effect
 * but the second thing it is for. The sweep tests its scope clauses twice —
 * once in the mark arm and once in the delete arm — so a case that only ever
 * watched a picture go unmarked would leave the delete arm's copy of those
 * clauses unmeasured. AC-705 hands the delete arm a mark the mark arm would
 * never have written, which is the only way to stand in front of it.
 */
export async function ageTheMark(
  db: Db,
  fileId: string,
  days: number,
): Promise<void> {
  const moved = await rows(
    db,
    sql`UPDATE files
           SET unreferenced_since = now() - ${days}::int * interval '1 day'
         WHERE id = ${fileId}::uuid
        RETURNING id`,
  )
  expect(
    moved.length,
    `ageTheMark must move exactly one files row; ${fileId} matched ${String(moved.length)}`,
  ).toBe(1)
}

/** The two drivers of 11.10 render a boolean differently often enough that
 * reading one by identity is a defect waiting for the other leg; this is
 * `isTrue` in `scheduler/pass.ts`, for the same reason. */
function isTrue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true'
}

export interface StoredPicture {
  /** Whether the `files` row is still there. */
  row: boolean
  /** Whether the object is still in the store the application holds. */
  bytes: boolean
  /** Whether `unreferenced_since` carries a mark at all. */
  marked: boolean
  /**
   * Whether that mark was written by a pass that has just run, rather than
   * being the aged one a case wrote.
   *
   * Computed in SQL against the database's own clock rather than against a
   * timestamp this process read, which is the class of red `CLAUDE.md`
   * records AC-277 and AC-200 costing two evenings: two clocks in two zones
   * read as a midnight race and are not one. One hour is wide enough that no
   * machine's mood can fail it and narrow enough that the aged marks this
   * harness writes — 29 and 31 days — can never satisfy it.
   */
  markIsFresh: boolean
}

export async function readPicture(
  fixture: ReclaimApp,
  fileId: string,
): Promise<StoredPicture> {
  const found = await rows(
    fixture.app.db,
    sql`SELECT unreferenced_since IS NOT NULL AS marked,
               unreferenced_since > now() - interval '1 hour' AS fresh
          FROM files WHERE id = ${fileId}::uuid`,
  )
  const object = await fixture.store.get(fileId)
  const row = found[0]
  return {
    row: row !== undefined,
    bytes: object !== null,
    marked: row !== undefined && isTrue(row.marked),
    markIsFresh: row !== undefined && isTrue(row.fresh),
  }
}

/**
 * The picture is still a picture: the row is there and so are the bytes.
 *
 * Both halves, always, because they fail apart. A sweep that deletes the row
 * and cannot reach the store leaves bytes nothing indexes, and one that
 * removes the object while the row survives leaves a file that serves 404 to
 * its owner forever; either alone reads as the other having worked.
 */
export async function expectSpared(
  fixture: ReclaimApp,
  fileId: string,
  why: string,
): Promise<StoredPicture> {
  const seen = await readPicture(fixture, fileId)
  expect(seen.row, `${why}: the files row must still be there`).toBe(true)
  expect(
    seen.bytes,
    `${why}: the object must still be in the store (spec 7.15's order — the bytes leave only after the row does)`,
  ).toBe(true)
  return seen
}

/** The picture is gone: the row and the object both, which is what 11.7's
 * fifth duty means by reclaiming one. */
export async function expectReclaimed(
  fixture: ReclaimApp,
  fileId: string,
  why: string,
): Promise<void> {
  const seen = await readPicture(fixture, fileId)
  expect(seen.row, `${why}: the files row must be gone`).toBe(false)
  expect(
    seen.bytes,
    `${why}: the object must be gone from the store, or the person's 10.3 gigabyte pays for bytes nothing indexes`,
  ).toBe(false)
}

/**
 * The one column under test, read straight out of the database after the act
 * that set it.
 *
 * Read rather than assumed because 7.19's rule 1 may have *copied* the
 * picture instead of keeping it (`coverFileFor` in `domain/files.ts`, and
 * AC-384 is where that decision is pinned). Whichever row the page ended up
 * naming is the row the sweep must spare, and asking the database which one
 * that is keeps these five criteria about the sweep rather than about the
 * copy rule.
 */
export async function referencedFileId(
  db: Db,
  query: ReturnType<typeof sql>,
  what: string,
): Promise<string> {
  const found = await rows(db, query)
  const id = found[0]?.file_id
  expect(
    typeof id === 'string' && id !== '',
    `${what} must name a file before the sweep can be asked to spare it; read ${String(id)}`,
  ).toBe(true)
  return String(id)
}
