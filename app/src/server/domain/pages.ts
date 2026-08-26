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

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function blockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    ref_folder_id: nullableString(row.ref_folder_id),
    updated_at: toIso(row.updated_at),
  }
}

export interface PageHome {
  folderId: string | null
  shelfId: string | null
}

function homeCondition(home: PageHome) {
  return home.folderId !== null
    ? sql`folder_id = ${home.folderId}`
    : sql`shelf_id = ${home.shelfId}`
}

export async function pageView(db: Db, home: PageHome): Promise<PageView> {
  const rows = await rowsOf(
    db,
    sql`SELECT id, kind, position, text, file_id, ref_folder_id, updated_at
        FROM page_blocks WHERE ${homeCondition(home)}
        ORDER BY position ASC, id ASC`,
  )
  return { blocks: rows.map(blockFromRow) }
}

export type PutPageResult =
  | { kind: 'written'; page: PageView }
  | { kind: 'stale'; blockId: string }

export async function putPage(
  db: Db,
  home: PageHome,
  viewerId: string,
  blocks: readonly PageBlockWrite[],
): Promise<PutPageResult> {
  return inTransaction(db, async (tx) => {
    const current = await rowsOf(
      tx,
      sql`SELECT id, updated_at FROM page_blocks
          WHERE ${homeCondition(home)} FOR UPDATE`,
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
                 ref_folder_id)
              VALUES (${home.folderId}, ${home.shelfId}, ${block.kind},
                      ${block.position}, ${block.text ?? null},
                      ${block.file_id ?? null},
                      ${block.ref_folder_id ?? null})`,
        )
      } else {
        await tx.execute(
          sql`UPDATE page_blocks
              SET kind = ${block.kind}, position = ${block.position},
                  text = ${block.text ?? null},
                  file_id = ${block.file_id ?? null},
                  ref_folder_id = ${block.ref_folder_id ?? null},
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

    return { kind: 'written', page: await pageViewIn(tx, home) } as const
  })
}

/** The read again, on the transaction's own snapshot, so the response can
 * never describe blocks the write did not leave. */
async function pageViewIn(tx: Executor, home: PageHome): Promise<PageView> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, kind, position, text, file_id, ref_folder_id, updated_at
        FROM page_blocks WHERE ${homeCondition(home)}
        ORDER BY position ASC, id ASC`,
  )
  return { blocks: rows.map(blockFromRow) }
}
