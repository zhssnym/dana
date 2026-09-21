/*
The S5 shelf module (4.18, 7.16): a per-user container whose membership
remains folder_members.shelf_name, unchanged and frozen, and whose page needs a
stable key a rename cannot move. The API holds membership and shelf name in step
in one transaction, both directions: a rename rewrites the viewer's matching
labels, a delete clears them, and the id never changes. Shelves are private
by construction (DES-195/196), so every read below is scoped to the viewer
and the events they record carry no folder scope.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { PatchShelfBody, PostShelvesBody, Shelf } from '../../shared/shelves.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { copyCoverFile, coverFileFor, readableFileScope } from './files.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function shelfFromRow(row: Record<string, unknown>): Shelf {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: nullableString(row.icon),
    color: nullableString(row.color),
    cover_file_id: nullableString(row.cover_file_id),
    cover_preset: nullableString(row.cover_preset),
    cover_focal_y: Number(row.cover_focal_y ?? 50),
    description: nullableString(row.description),
    created_at: toIso(row.created_at),
  }
}

const SHELF_COLUMNS = sql`id, name, icon, color, cover_file_id, cover_preset,
  cover_focal_y, description, created_at`

export async function listShelves(db: Db, viewerId: string): Promise<Shelf[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${SHELF_COLUMNS} FROM shelves
        WHERE user_id = ${viewerId}
        ORDER BY lower(name) ASC, id ASC`,
  )
  return rows.map(shelfFromRow)
}

/** Widened from `Db` to `Executor` for domain/pages.ts, which asks the same
 * question inside a transaction it already holds (issue #35). Every existing
 * caller passes a `Db`, which is an `Executor`. */
export async function shelfView(
  db: Executor,
  viewerId: string,
  shelfId: string,
): Promise<Shelf | null> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${SHELF_COLUMNS} FROM shelves
        WHERE id = ${shelfId} AND user_id = ${viewerId}`,
  )
  const row = rows[0]
  return row === undefined ? null : shelfFromRow(row)
}

/**
 * The shelf a membership names, made if it is not there already (issue #65).
 *
 * 4.18's sentence is that the API "holds membership and shelf name in step in
 * one transaction", and until this function existed it held them in step in
 * two directions out of three: a rename rewrote the matching memberships, a
 * delete cleared them, and a membership written through frozen 7.4 named
 * whatever string it liked. The third direction is the reported defect. 9.1 draws the Library
 * as "the viewer's shelves and folders as one ordered list" and its roles
 * table makes every shelf row a link, so a group heading whose membership no
 * shelves row names has no id to link to and no page to open; the client
 * draws it as plain text and the shelf, in the person's words, "stays only as
 * a sidebar group".
 *
 * Called inside the caller's transaction, so a folder that took a membership
 * and the shelf that membership names commit together or not at all.
 *
 * ON CONFLICT DO NOTHING rather than a SELECT and then an INSERT: two
 * requests filing two folders onto one new shelf race, and 4.18's UNIQUE
 * (user_id, name) is the arbiter.
 *
 * **No event, and it is deliberate rather than an omission.** `createShelf`
 * records one because somebody asked for a shelf; here nobody did. The act
 * was "put this folder on Work", the shelf is the server holding 4.18 in
 * step, and a 'created' line in a history for something no one performed as
 * its own act is the kind of noise `lib/history.ts` exists to keep out: "a
 * history that logged every keystroke as its own line would be a diff". It
 * also keeps the two ways a shelf can appear unasked-for in agreement, since
 * migration 0011's rows cannot carry an event either, a migration having no
 * actor. The consequence is that such a shelf's Activity line does not draw
 * until something happens to it, which is the state that control already has
 * a rule for ("nothing recorded yet means nothing to say", DES-144).
 *
 * The lengths agree by contract and nothing here has to check: 10.3 gives the
 * Shelf membership and the shelf name the same 1 to 40 bound, and
 * `shared/folders.ts` has already refused anything outside it with a 422
 * before this runs.
 */
export async function ensureShelf(
  tx: Executor,
  viewerId: string,
  name: string,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO shelves (user_id, name)
        VALUES (${viewerId}::uuid, ${name})
        ON CONFLICT (user_id, name) DO NOTHING`,
  )
}

export type CreateShelfResult =
  | { kind: 'created'; shelf: Shelf }
  | { kind: 'name_taken' }

export async function createShelf(
  db: Db,
  viewerId: string,
  body: PostShelvesBody,
): Promise<CreateShelfResult> {
  return inTransaction(db, async (tx) => {
    const taken = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM shelves
          WHERE user_id = ${viewerId} AND name = ${body.name}`,
    )
    if (taken.length > 0) return { kind: 'name_taken' } as const
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO shelves (user_id, name, icon, color, description)
          VALUES (${viewerId}::uuid, ${body.name}, ${body.icon ?? null},
                  ${body.color ?? null}, ${body.description ?? null})
          RETURNING ${SHELF_COLUMNS}`,
    )
    const shelf = shelfFromRow(inserted[0] ?? {})
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'shelf',
      subjectId: shelf.id,
      subjectName: shelf.name,
      folderId: null,
    })
    return { kind: 'created', shelf } as const
  })
}

export type PatchShelfResult =
  | { kind: 'patched'; shelf: Shelf }
  | { kind: 'not_found' }
  | { kind: 'name_taken' }
  /** The named cover is not a picture this caller can reach (issue #100), or
   * its bytes are gone from the store so there is nothing to copy or serve
   * (issue #116). One answer for both: a shelf's 422 is 7.16's shape and the
   * caller learns no more than that the file will not do. */
  | { kind: 'cover_not_readable' }
  /** 10.3's 1 GB, spent by the copy the set makes (issue #116). 413 with
   * section 9's copy, which is what an upload over the quota answers. */
  | { kind: 'quota_exceeded' }

export async function patchShelf(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  shelfId: string,
  patch: PatchShelfBody,
): Promise<PatchShelfResult> {
  /** Bytes a copy wrote inside the transaction. If it throws, the row went
   * with it and these index nothing, so they are removed (issue #116). */
  const copied: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      const current = await rowsOf(
        tx,
        sql`SELECT name FROM shelves
            WHERE id = ${shelfId} AND user_id = ${viewerId}
            FOR UPDATE`,
      )
      const row = current[0]
      if (row === undefined) return { kind: 'not_found' } as const
      const oldName = String(row.name)

      const renaming = patch.name !== undefined && patch.name !== oldName
      if (renaming) {
        const taken = await rowsOf(
          tx,
          sql`SELECT 1 AS present FROM shelves
              WHERE user_id = ${viewerId} AND name = ${patch.name}
                AND id <> ${shelfId}::uuid`,
        )
        if (taken.length > 0) return { kind: 'name_taken' } as const
      }

      /*
      The cover's gate, and it is this module's to write: there is no
      authorization chokepoint, so a route that takes a file id and does not
      scope it is issue #107's shape, where a member of one folder can plant
      another folder's id and learn that it exists. `createComment` is the
      pattern and this is it one object over, with two clauses rather than one.

      **Readable, by `readableFileScope`** — the same predicate `serveFile`
      answers with, so a shelf can never point at a picture the person who set
      it would then be refused the bytes of. A shelf is private (4.18), so in
      practice this is the caller's own folder-less upload; a file from a folder
      they are a member of is admitted too, exactly as 7.19 admits one for a
      place cover, because refusing it would make the shelf the one page kind
      with a narrower rule than the other two, which is the inconsistency #20
      exists to end.

      **And image-kinded**, which is `patchFolderProfile`'s second clause
      verbatim: a cover is a picture, and without it a `voice` note's id would
      be storable as one and drawn as a broken image. `putPlaceCover` (7.19) is
      the third gate that takes a cover's file id, and it lacked this clause
      until AC-374; the three now agree on which files they take. `serveFile`
      shares the predicate above with this gate and carries no kind clause,
      correctly: it serves voice notes too.

      **#107 was taken on 2026-09-04 and this note is what it was written
      for**, kept because the reasoning it corrects is the reasoning anyone
      reading the deferral would repeat. That deferral said "`readableFileScope`
      would be the wrong gate for `putPage`, because a page block wants folder
      scope, which is `createComment`'s `AND folder_id = $folder`". True of a
      **folder-homed** page and false of a **shelf-homed** one: `page_blocks`
      carries exactly one home, `page_blocks_one_home_check` being
      `(folder_id IS NULL) <> (shelf_id IS NULL)`, so on a shelf page there is
      no folder id for such a clause to compare against and this predicate is
      the right gate rather than the wrong one. A fix written from the deferral
      sentence alone would have gated folder pages and left shelf pages ungated
      — where the folder-less pictures this change introduces live. `putPage`
      carries both halves; AC-375 states both, and states rather than checks
      them, its test file having gone in the 2026-09-20 cut.
      */
      let coverFileId = patch.cover_file_id
      if (patch.cover_file_id !== undefined && patch.cover_file_id !== null) {
        const cover = await rowsOf(
          tx,
          sql`SELECT 1 AS present FROM files f
              WHERE f.id = ${patch.cover_file_id}
                AND f.kind IN ('cover', 'image')
                AND ${readableFileScope(viewerId)}`,
        )
        if (cover.length === 0) return { kind: 'cover_not_readable' } as const

        /*
        **And then the file is made this person's, if it is not already
        (issue #116, 2026-09-04).** The gate above admits a picture from a
        folder the caller is a member of — deliberately, so a shelf is not the
        one page kind with a narrower rule — and that is a cover which stops
        drawing the day they leave that folder, with no row cleaned up and
        nothing said. `coverFileFor` stores a folder-less `cover` of their own
        as it stands and copies anything else, so after this a shelf's cover is
        always a file its owner holds outright. The reasoning, and why the
        *same* picture on two of their own pages is not copied, is at the foot
        of `domain/files.ts`.
        */
        const held = await coverFileFor(
          tx,
          store,
          viewerId,
          patch.cover_file_id,
          null,
        )
        if (held.kind === 'bytes_missing') {
          return { kind: 'cover_not_readable' } as const
        }
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') copied.push(held.id)
        coverFileId = held.id
      }

      const sets = []
      if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
      if (patch.icon !== undefined) sets.push(sql`icon = ${patch.icon}`)
      if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
      /* One source (4.18 as widened by issues #20 and #100, migration 0012):
         a file arriving clears the preset and a preset arriving clears the
         file, so the client never has to send the null it means. It is
         `patchFolderProfile`'s rule transcribed, because it is the same rule,
         and migration 0012's shelves_cover_one_source_check is what makes a
         transcription that ever drifts a refusal rather than a wrong row. */
      if (coverFileId !== undefined) {
        sets.push(sql`cover_file_id = ${coverFileId}`)
        if (coverFileId !== null) sets.push(sql`cover_preset = NULL`)
      }
      if (patch.cover_preset !== undefined) {
        sets.push(sql`cover_preset = ${patch.cover_preset}`)
        if (patch.cover_preset !== null) sets.push(sql`cover_file_id = NULL`)
      }
      if (patch.cover_focal_y !== undefined) {
        sets.push(sql`cover_focal_y = ${patch.cover_focal_y}`)
      }
      if (patch.description !== undefined) {
        sets.push(sql`description = ${patch.description}`)
      }
      if (sets.length > 0) {
        await tx.execute(
          sql`UPDATE shelves SET ${sql.join(sets, sql`, `)}
              WHERE id = ${shelfId}::uuid`,
        )
      }
      // 4.18: membership and shelf name held in step, one transaction. The
      // memberships are the viewer's own; nobody else's arrangement moves.
      //
      // One column written, since issue #247 contracted migration 0022's
      // expand half: `label` was written beside `shelf_name` only for as long
      // as an instance Render had not drained yet was reading it. The column
      // is still in the table and stops being written here; the migration
      // that drops it is #247's second release, which is 11.5's rule.
      if (renaming) {
        await tx.execute(
          sql`UPDATE folder_members SET shelf_name = ${patch.name}
              WHERE user_id = ${viewerId} AND shelf_name = ${oldName}`,
        )
      }
      if (sets.length > 0) {
        await recordEvent(tx, {
          actorId: viewerId,
          verb: renaming ? 'renamed' : 'edited',
          subjectKind: 'shelf',
          subjectId: shelfId,
          subjectName: patch.name ?? oldName,
          folderId: null,
        })
      }
      const after = await rowsOf(
        tx,
        sql`SELECT ${SHELF_COLUMNS} FROM shelves WHERE id = ${shelfId}::uuid`,
      )
      return { kind: 'patched', shelf: shelfFromRow(after[0] ?? {}) } as const
    })
  } catch (error: unknown) {
    for (const id of copied) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes; they must not replace the real error below.
      }
    }
    throw error
  }
}

/** The folders survive their shelf (4.18): only the shelf row, its page
 * (the 4.17 cascade), and the viewer's matching memberships go. */
export async function deleteShelf(
  db: Db,
  viewerId: string,
  shelfId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM shelves
          WHERE id = ${shelfId} AND user_id = ${viewerId}
          RETURNING name`,
    )
    const row = removed[0]
    if (row === undefined) return 'not_found' as const
    await tx.execute(
      sql`UPDATE folder_members SET shelf_name = NULL
          WHERE user_id = ${viewerId} AND shelf_name = ${String(row.name)}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'shelf',
      subjectId: shelfId,
      subjectName: String(row.name),
      folderId: null,
    })
    return 'deleted' as const
  })
}

/* ------------------------------------------------------------------ *
 * POST /shelves/:id/duplicate (7.16, issues #117 and #128)
 * ------------------------------------------------------------------ */

/*
Duplicating a shelf, server-side and in one transaction.

**Why this is a route at all, when the client already had one that worked.**
`ShelfPage.tsx` duplicated a shelf by POSTing a new one and PATCHing the
other five fields onto it, which #117 found dropping the cover. The obvious
repair is a sixth field in that PATCH, and it does not hold: Imran ruled on
#117 that the two shelves must be independent — "changing or removing the
cover on either shelf must not change the other" — and two shelves pointing
at one `cover_file_id` are not, because `DELETE /files/:id` blanks both
through 0003's SET NULL. So the duplicate needs its own file, which needs the
bytes copied, which is 10.3 quota arithmetic and object-store work no browser
should be doing (#128 says so in as many words: not by downloading and
re-uploading the picture). And two requests cannot be atomic, so a failure
between them is exactly the half-duplicated shelf #128 asks not to exist.

**What it carries**: the five identity fields the client already copied, plus
the cover — `cover_preset` and `cover_focal_y` verbatim, since a preset needs
no file and a crop is a number, and `cover_file_id` as a copy of the source's
picture made by `coverFileFor`. What it does not carry is the shelf's *page*
(4.17's blocks), for `duplicateFolder`'s reason: a page is the document, and
DES-198's copy rules are about structure rather than about the words on it —
folder duplication carries a page because a folder's page holds its sections,
and a shelf's page holds prose. Nothing in #117 or #128 asks for it, and it
would be a decision by omission in the other direction.

**Atomicity, both ways.** The bytes are written inside the transaction that
inserts the shelf row, so a failure anywhere in it rolls the shelf back; and
because a rollback cannot un-write a file, the catch removes the object the
copy put in the store. No half-duplicated shelf, and no unattached copy.
*/

export type DuplicateShelfResult =
  | { kind: 'duplicated'; shelf: Shelf }
  | { kind: 'not_found' }
  /** Fifty names of the form "X (copy n)" were all taken, which needs 50
   * duplicates of one shelf; 4.18's UNIQUE (user_id, name) is what makes it
   * a refusal rather than a constraint violation answered as a 500. */
  | { kind: 'name_taken' }
  /** 10.3's 1 GB, spent by the copied picture. */
  | { kind: 'quota_exceeded' }

/** 10.3 bounds a shelf name at 40 characters and 4.18 makes it unique per
 * person, so the suffix is fitted inside the bound rather than added past
 * it: the base is cut to leave room, never the suffix. */
async function freeCopyName(
  tx: Executor,
  viewerId: string,
  sourceName: string,
): Promise<string | null> {
  for (let n = 1; n <= 50; n += 1) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${String(n)})`
    const base = sourceName.slice(0, Math.max(1, 40 - suffix.length)).trimEnd()
    const candidate = `${base}${suffix}`
    const taken = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM shelves
          WHERE user_id = ${viewerId} AND name = ${candidate}`,
    )
    if (taken.length === 0) return candidate
  }
  return null
}

export async function duplicateShelf(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  shelfId: string,
): Promise<DuplicateShelfResult> {
  const copied: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      const found = await rowsOf(
        tx,
        sql`SELECT name, icon, color, description, cover_file_id,
                   cover_preset, cover_focal_y
            FROM shelves
            WHERE id = ${shelfId} AND user_id = ${viewerId}`,
      )
      const source = found[0]
      if (source === undefined) return { kind: 'not_found' } as const

      const name = await freeCopyName(tx, viewerId, String(source.name))
      if (name === null) return { kind: 'name_taken' } as const

      /* The picture, if there is one. **`copyCoverFile` and not
         `coverFileFor`**, which is the whole difference between a set and a
         duplicate: the source is a folder-less cover of this person's own,
         which is exactly the shape a *set* keeps rather than copies, and
         keeping it here would hand two shelves one `cover_file_id` and make
         Imran's ruling on #117 unkeepable. The scope is null because a shelf
         is private (4.18) and its cover belongs to the person.

         **A source whose bytes have gone from the store carries no file at
         all**: the copy would be a row that can never serve, and the source
         does not draw either, so the two shelves still look the same — which
         is the product rule — and nothing unservable is created to spend the
         quota. */
      let coverFileId: string | null = null
      if (source.cover_file_id !== null && source.cover_file_id !== undefined) {
        const held = await copyCoverFile(
          tx,
          store,
          viewerId,
          String(source.cover_file_id),
          null,
        )
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') {
          copied.push(held.id)
          coverFileId = held.id
        }
      }

      const made = await rowsOf(
        tx,
        sql`INSERT INTO shelves (user_id, name, icon, color, description,
                                 cover_file_id, cover_preset, cover_focal_y)
            VALUES (${viewerId}::uuid, ${name},
                    ${source.icon === null ? null : String(source.icon)},
                    ${source.color === null ? null : String(source.color)},
                    ${source.description === null ? null : String(source.description)},
                    ${coverFileId}::uuid,
                    ${coverFileId === null && source.cover_preset !== null ? String(source.cover_preset) : null},
                    ${Number(source.cover_focal_y ?? 50)})
            RETURNING ${SHELF_COLUMNS}`,
      )
      const shelf = shelfFromRow(made[0] ?? {})
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'duplicated',
        subjectKind: 'shelf',
        subjectId: shelf.id,
        subjectName: shelf.name,
        folderId: null,
        detail: `from ${String(source.name)}`,
      })
      return { kind: 'duplicated', shelf } as const
    })
  } catch (error: unknown) {
    for (const id of copied) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes; they must not replace the real error below.
      }
    }
    throw error
  }
}
