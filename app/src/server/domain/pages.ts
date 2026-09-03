/*
The S5 page module: 4.17's block list under 7.16's PUT-whole contract, for
folder pages and shelf pages alike (the two differ only in which column
holds the page's home, and 4.17's CHECK keeps it exactly one).

The PUT is the page: blocks arriving with an id edit the row they name,
blocks without one insert, and stored blocks the list no longer carries are
deleted, which is how a section dies and its tasks survive (4.5's SET NULL,
AC-199). Concurrency is last-write-wins per block: an edit carries the
updated_at it read, and a mismatch answers 409 before anything in the
request writes, a request being one unit. An edit naming a block that no
longer exists is the same conflict wearing its endpoint state: someone
else's write removed it, and resurrecting it under the old id would be the
lost-update this rule exists to refuse.

One PUT is one mutation and one event (4.13), whatever it did to however
many blocks.

The read joins `files` for one thing only: 4.16's width and height, so that a
reader who did not upload the picture can reserve its space before the bytes
arrive (issue #27). It is a LEFT JOIN on the file's primary key, so a block
with no file, and a file stored before migration 0009, both answer null and
multiply no rows. Nothing about the write path knows these columns exist: the
shape belongs to the file and a PUT that carried it would be a second record
of one fact.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PageBlock,
  PageBlockWrite,
  PageView,
} from '../../shared/pages.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
import { recordEvent } from './events.js'
import { accessOf } from './folders.js'
import { shelfView } from './shelves.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** 4.16's dimensions as the join hands them over: absent for a block with no
 * file, null for a file stored before migration 0009 (issue #27). Both read
 * as null here, and the contract says null means unknown. */
function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function blockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    file_width: nullableInt(row.file_width),
    file_height: nullableInt(row.file_height),
    ref_folder_id: nullableString(row.ref_folder_id),
    width_pct: row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct),
    updated_at: toIso(row.updated_at),
  }
}

export interface PageHome {
  folderId: string | null
  shelfId: string | null
}

/*
Qualified with the block table's alias rather than bare, and the reason is a
column collision rather than taste: the read below joins `files`, which
carries a `folder_id` of its own (4.16's visibility scope), so an unqualified
`folder_id` is ambiguous and the statement fails to parse. Every statement in
this module aliases page_blocks `b` so this fragment reads the same in all
three.

**The viewer is part of the condition, since issue #35.** Until then these
functions took no viewer at all, which made them the one place in this
directory where authorization lived entirely in the caller: everywhere else
the membership check is written inside the `FROM` clause, so a query that
forgets it returns nothing rather than another person's rows, and a page read
could not do that. Every caller had in fact gated — `routes/workshop.ts` calls
`accessOf` before both folder-page routes and `shelfView` before both shelf-page
routes, checked one by one — so this repairs a shape rather than a leak, and
the route gates stay where they are because only they can tell 404 from an
empty page.

EXISTS rather than a join, so the scope multiplies no rows and adds no column
to the ambiguity the paragraph above is about. A folder page is visible to its
members while the folder is not trashed, which is `accessOf`'s own predicate; a
shelf is its owner's alone (4.18).
*/
function homeCondition(home: PageHome, viewerId: string) {
  return home.folderId !== null
    ? sql`b.folder_id = ${home.folderId}
          AND EXISTS (SELECT 1 FROM folders vf
                        JOIN folder_members vm ON vm.folder_id = vf.id
                       WHERE vf.id = b.folder_id
                         AND vm.user_id = ${viewerId}
                         AND vf.deleted_at IS NULL)`
    : sql`b.shelf_id = ${home.shelfId}
          AND EXISTS (SELECT 1 FROM shelves vs
                       WHERE vs.id = b.shelf_id
                         AND vs.user_id = ${viewerId})`
}

/** The page's home as the viewer can see it, by the same two functions the
 * routes gate with, so "visible" has one definition rather than two. */
async function homeIsVisible(
  tx: Executor,
  home: PageHome,
  viewerId: string,
): Promise<boolean> {
  return home.folderId !== null
    ? (await accessOf(tx, viewerId, home.folderId)) !== null
    : home.shelfId !== null &&
        (await shelfView(tx, viewerId, home.shelfId)) !== null
}

export async function pageView(
  db: Db,
  viewerId: string,
  home: PageHome,
): Promise<PageView> {
  const rows = await rowsOf(
    db,
    sql`SELECT b.id, b.kind, b.position, b.text, b.file_id, b.ref_folder_id,
               b.width_pct, b.updated_at,
               f.width AS file_width, f.height AS file_height
        FROM page_blocks b
        LEFT JOIN files f ON f.id = b.file_id
        WHERE ${homeCondition(home, viewerId)}
        ORDER BY b.position ASC, b.id ASC`,
  )
  return { blocks: rows.map(blockFromRow) }
}

export type PutPageResult =
  | { kind: 'written'; page: PageView }
  | { kind: 'stale'; blockId: string }
  | { kind: 'not_found' }

export async function putPage(
  db: Db,
  viewerId: string,
  home: PageHome,
  blocks: readonly PageBlockWrite[],
): Promise<PutPageResult> {
  return inTransaction(db, async (tx) => {
    /* The insert below writes `home.folderId` as it was handed over, so the
       scoped read alone would not stop a write into a folder the viewer
       cannot see: an ungated caller would find no stored blocks, refuse
       nothing, and insert. This is the check that makes that impossible, and
       it is why the viewer had to be threaded rather than only joined. The
       routes gate before they call, so this answers nobody today; it is here
       so that a caller which forgets is refused rather than obeyed. */
    if (!(await homeIsVisible(tx, home, viewerId))) {
      return { kind: 'not_found' } as const
    }
    const current = await rowsOf(
      tx,
      sql`SELECT b.id, b.updated_at FROM page_blocks b
          WHERE ${homeCondition(home, viewerId)} FOR UPDATE`,
    )
    const stored = new Map(
      current.map((row) => [String(row.id), toIso(row.updated_at)]),
    )

    // Every stale refusal happens before the first write: a request is one
    // unit, so a body that fails on any block applies none of itself.
    for (const block of blocks) {
      if (block.id === undefined) continue
      const known = stored.get(block.id)
      if (known === undefined || known !== block.updated_at) {
        return { kind: 'stale', blockId: block.id } as const
      }
    }

    const keep = new Set(
      blocks.flatMap((block) => (block.id === undefined ? [] : [block.id])),
    )
    for (const id of stored.keys()) {
      if (!keep.has(id)) {
        await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${id}::uuid`)
      }
    }

    for (const block of blocks) {
      if (block.id === undefined) {
        await tx.execute(
          sql`INSERT INTO page_blocks
                (folder_id, shelf_id, kind, position, text, file_id,
                 ref_folder_id, width_pct)
              VALUES (${home.folderId}, ${home.shelfId}, ${block.kind},
                      ${block.position}, ${block.text ?? null},
                      ${block.file_id ?? null},
                      ${block.ref_folder_id ?? null},
                      ${block.width_pct ?? null})`,
        )
      } else {
        await tx.execute(
          sql`UPDATE page_blocks
              SET kind = ${block.kind}, position = ${block.position},
                  text = ${block.text ?? null},
                  file_id = ${block.file_id ?? null},
                  ref_folder_id = ${block.ref_folder_id ?? null},
                  width_pct = ${block.width_pct ?? null},
                  updated_at = now()
              WHERE id = ${block.id}::uuid`,
        )
      }
    }

    // The name at act time (4.13), read from whichever table is the page's
    // home.
    const named = await rowsOf(
      tx,
      home.folderId !== null
        ? sql`SELECT name FROM folders WHERE id = ${home.folderId}`
        : sql`SELECT name FROM shelves WHERE id = ${home.shelfId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: home.folderId !== null ? 'folder' : 'shelf',
      subjectId: home.folderId ?? home.shelfId ?? '',
      subjectName: String(named[0]?.name ?? ''),
      folderId: home.folderId,
      detail: 'edited the page',
    })

    return {
      kind: 'written',
      page: await pageViewIn(tx, viewerId, home),
    } as const
  })
}

/** The read again, on the transaction's own snapshot, so the response can
 * never describe blocks the write did not leave. */
async function pageViewIn(
  tx: Executor,
  viewerId: string,
  home: PageHome,
): Promise<PageView> {
  const rows = await rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.position, b.text, b.file_id, b.ref_folder_id,
               b.width_pct, b.updated_at,
               f.width AS file_width, f.height AS file_height
        FROM page_blocks b
        LEFT JOIN files f ON f.id = b.file_id
        WHERE ${homeCondition(home, viewerId)}
        ORDER BY b.position ASC, b.id ASC`,
  )
  return { blocks: rows.map(blockFromRow) }
}
