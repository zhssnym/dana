/*
The S5 shelf module (4.18, 7.16): a per-user container whose membership
remains folder_members.label, unchanged and frozen, and whose page needs a
stable key a rename cannot move. The API holds label and shelf name in step
in one transaction, both directions: a rename rewrites the viewer's matching
labels, a delete clears them, and the id never changes. Shelves are private
by construction (DES-195/196), so every read below is scoped to the viewer
and the events they record carry no folder scope.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { PatchShelfBody, PostShelvesBody, Shelf } from '../../shared/shelves.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { readableFileScope } from './files.js'

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
 * The shelf a label names, made if it is not there already (issue #65).
 *
 * 4.18's sentence is that the API "holds label and shelf name in step in one
 * transaction", and until this function existed it held them in step in two
 * directions out of three: a rename rewrote the matching labels, a delete
 * cleared them, and a label written through frozen 7.4 named whatever string
 * it liked. The third direction is the reported defect. 9.1 draws the Library
 * as "the viewer's shelves and folders as one ordered list" and its roles
 * table makes every shelf row a link, so a group heading whose label no
 * shelves row names has no id to link to and no page to open; the client
 * draws it as plain text and the shelf, in the person's words, "stays only as
 * a sidebar group".
 *
 * Called inside the caller's transaction, so a folder that took a label and
 * the shelf that label names commit together or not at all.
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
 * personal label and the shelf name the same 1 to 40 bound, and
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
  /** The named cover is not a picture this caller can reach (issue #100). */
  | { kind: 'cover_not_readable' }

export async function patchShelf(
  db: Db,
  viewerId: string,
  shelfId: string,
  patch: PatchShelfBody,
): Promise<PatchShelfResult> {
  return inTransaction(db, async (tx) => {
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
    carries both halves; AC-375 asserts both.
    */
    if (patch.cover_file_id !== undefined && patch.cover_file_id !== null) {
      const cover = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM files f
            WHERE f.id = ${patch.cover_file_id}
              AND f.kind IN ('cover', 'image')
              AND ${readableFileScope(viewerId)}`,
      )
      if (cover.length === 0) return { kind: 'cover_not_readable' } as const
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
    if (patch.cover_file_id !== undefined) {
      sets.push(sql`cover_file_id = ${patch.cover_file_id}`)
      if (patch.cover_file_id !== null) sets.push(sql`cover_preset = NULL`)
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
    // 4.18: label and shelf name held in step, one transaction. The labels
    // are the viewer's own; nobody else's arrangement moves.
    if (renaming) {
      await tx.execute(
        sql`UPDATE folder_members SET label = ${patch.name}
            WHERE user_id = ${viewerId} AND label = ${oldName}`,
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
}

/** The folders survive their shelf (4.18): only the shelf row, its page
 * (the 4.17 cascade), and the viewer's matching labels go. */
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
      sql`UPDATE folder_members SET label = NULL
          WHERE user_id = ${viewerId} AND label = ${String(row.name)}`,
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
