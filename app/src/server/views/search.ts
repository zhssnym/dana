/*
Q8, GET /search: '%q%' ILIKE over title, notes and checklist text. Backslash,
% and _ in q are escaped, so "50%" is literal and "a\b" is not read as "ab".
Keyset order: status_rank ascending, then updated_at and id descending, so
resuming is "a later rank, or the same rank and an earlier position". The
cursor holds the status, not the rank.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { GetSearchResponse, SearchCursor } from '../../shared/views.js'
import { encodeSearchCursor } from '../../shared/views.js'
import { rowsOf } from '../database.js'
import { joinVisibleFolder, visibleFolder } from '../domain/folder-access.js'
import { visibleAncestors } from '../domain/page-tree.js'
import type { Executor } from '../database.js'

import {
  SEARCH_PAGE_SIZE,
  STATUS_RANK,
  readCards,
  statusRank,
  utcInstant,
} from './cards.js'
import type { TaskStatus } from '../../shared/tasks.js'

const Q8_ORDER = sql`${STATUS_RANK} ASC, t.updated_at DESC, t.id DESC`

/**
 * What the user typed, as a literal LIKE pattern. Escape the backslash first,
 * or the wildcard escapes would themselves be escaped.
 */
export function searchPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

export async function searchView(
  executor: Executor,
  viewerId: string,
  q: string,
  cursor: SearchCursor | undefined,
): Promise<GetSearchResponse> {
  const pattern = searchPattern(q)
  const resume: SQL =
    cursor === undefined
      ? sql``
      : sql` AND (${STATUS_RANK} > ${statusRank(sql`${cursor.status}::text`)}
                  OR (${STATUS_RANK} = ${statusRank(sql`${cursor.status}::text`)}
                      AND (t.updated_at, t.id)
                          < (${cursor.updated_at}::timestamptz, ${cursor.id}::uuid)))`

  const rows = await readCards(executor, {
    viewerId,
    // All statuses are searchable. A checklist item matches its task, not itself.
    where: sql`(t.title ILIKE ${pattern} OR t.notes ILIKE ${pattern}
                OR EXISTS (SELECT 1 FROM page_blocks s
                            WHERE s.task_id = t.id AND s.kind = 'checklist'
                              AND s.text ILIKE ${pattern}))${resume}`,
    order: Q8_ORDER,
    limit: SEARCH_PAGE_SIZE + 1,
    extra: sql`${utcInstant(sql`t.updated_at`)} AS updated_cursor`,
  })

  /*
  Folder, shelf and page hits, each scoped (folder members, shelf owner) and
  capped at the page size.
  */
  const folderHits = await rowsOf(
    executor,
    sql`SELECT f.id, f.name FROM folders f
        ${joinVisibleFolder(viewerId, { folder: 'f' })}
        WHERE (f.name ILIKE ${pattern} OR f.description ILIKE ${pattern})
        ORDER BY lower(f.name) ASC, f.id ASC
        LIMIT ${SEARCH_PAGE_SIZE}`,
  )
  const shelfHits = await rowsOf(
    executor,
    sql`SELECT s.id, s.name FROM shelves s
        WHERE s.user_id = ${viewerId}
          AND (s.name ILIKE ${pattern} OR s.description ILIKE ${pattern})
        ORDER BY lower(s.name) ASC, s.id ASC
        LIMIT ${SEARCH_PAGE_SIZE}`,
  )
  const pageHits = await rowsOf(
    executor,
    sql`SELECT b.id AS block_id, b.folder_id, b.shelf_id, b.text,
               f.name AS folder_name
        FROM page_blocks b
        LEFT JOIN folders f ON f.id = b.folder_id
        LEFT JOIN shelves sh ON sh.id = b.shelf_id
        WHERE b.text ILIKE ${pattern}
          /* Every text-bearing kind, #219 included: the text column is the one
             plain-text projection of a block whatever its kind, so a bullet,
             a checklist item, a quote, a callout and a code block are found by
             the same search that finds a paragraph. An image and a folder
             reference carry a caption and a label rather than writing. */
          AND b.kind IN ('section', 'paragraph', 'bullet', 'numbered',
                         'checklist', 'toggle', 'quote', 'callout', 'code',
                         'diagram')
          AND (
            (b.folder_id IS NOT NULL
             AND ${visibleFolder(sql`b.folder_id`, viewerId)})
            OR (b.shelf_id IS NOT NULL AND sh.user_id = ${viewerId})
          )
        ORDER BY b.id ASC
        LIMIT ${SEARCH_PAGE_SIZE}`,
  )

  /* Breadcrumbs in one walk, cut at the first ancestor the viewer cannot see,
     so a hidden parent's name never appears. */
  const trail = await visibleAncestors(executor, viewerId, [
    ...folderHits.map((row) => String(row.id)),
    ...pageHits.flatMap((row) =>
      row.folder_id === null ? [] : [String(row.folder_id)],
    ),
  ])
  const crumbsOf = (folderId: string) =>
    (trail.get(folderId) ?? []).map((crumb) => ({ id: crumb.id, name: crumb.name }))

  const page = rows.slice(0, SEARCH_PAGE_SIZE)
  const last = page[page.length - 1]
  const next =
    rows.length > SEARCH_PAGE_SIZE && last !== undefined
      ? encodeSearchCursor({
          status: last.card.status as TaskStatus,
          updated_at: String(last.raw.updated_cursor),
          id: last.card.id,
        })
      : null

  return {
    rows: page.map((row) => row.card),
    next_cursor: next,
    folders: folderHits.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      breadcrumbs: crumbsOf(String(row.id)),
    })),
    shelves: shelfHits.map((row) => ({
      id: String(row.id),
      name: String(row.name),
    })),
    pages: pageHits.map((row) => ({
      block_id: String(row.block_id),
      folder_id: row.folder_id === null ? null : String(row.folder_id),
      shelf_id: row.shelf_id === null ? null : String(row.shelf_id),
      text: String(row.text ?? ''),
      /* The folder's ancestors, then the folder itself. A shelf page has none. */
      breadcrumbs:
        row.folder_id === null
          ? []
          : [
              ...crumbsOf(String(row.folder_id)),
              {
                id: String(row.folder_id),
                name: String(row.folder_name ?? ''),
              },
            ],
    })),
  }
}
