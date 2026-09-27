/*
Q8: GET /search.

Three rules of this query are easy to get subtly wrong, and each is written
here rather than assembled at a call site.

**The pattern.** "'%' q '%'", so a match anywhere in the text counts and a
prefix-anchored LIKE finds none of what this is for. ILIKE, so case is not a
filter. title OR notes, so a needle that lives only in the body is found.

**The escaping**: a
backslash, percent or underscore inside q is escaped before it is
interpolated, so a search for "50%" matches text containing those three
characters rather than everything containing "50". Without it the pattern
syntax leaks into the search box, where nothing tells a user it is there. The
backslash is the sharp one: unescaped, Postgres reads it as LIKE's own escape
character, so a query for "a\b" quietly means "ab" and misses the row the
user typed while finding one they did not. The escape costs nothing at the
index, which sees trigrams either way.

**The keyset.** "status_rank over all three ranks the preamble defines,
updated_at descending, id descending. Keyset pagination, page size 20." The
leading key ascends while the other two descend, so the resumption cannot be
one row-wise comparison the way Q6's is: it is the rank strictly past the
cursor's, or the same rank and a position strictly past it. The cursor
carries the row's own status rather than its rank, so the mapping from status
to rank stays in this query's ORDER BY where section 6 put it, and no client
holds a number the specification has already revised once.
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

/** Q8's order. */
const Q8_ORDER = sql`${STATUS_RANK} ASC, t.updated_at DESC, t.id DESC`

/**
 * The literal reading of what the user typed, as a LIKE pattern.
 *
 * The backslash goes first, and it has to: escaping the wildcards first
 * would then escape the backslashes this step just added, turning every
 * wildcard back into a literal backslash followed by a live wildcard.
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
    // All three statuses: a task being completed or abandoned is a reason to
    // draw a chip, never a reason to make it unfindable. A checklist item
    // (a subtask) reaches its task (7.18): the item is not a result of its
    // own, the task it belongs to is. Notes leave checklist text out.
    where: sql`(t.title ILIKE ${pattern} OR t.notes ILIKE ${pattern}
                OR EXISTS (SELECT 1 FROM page_blocks s
                            WHERE s.task_id = t.id AND s.kind = 'checklist'
                              AND s.text ILIKE ${pattern}))${resume}`,
    order: Q8_ORDER,
    limit: SEARCH_PAGE_SIZE + 1,
    extra: sql`${utcInstant(sql`t.updated_at`)} AS updated_cursor`,
  })

  /*
  7.18's additive kinds, each its own scoped query under the same pattern:
  folders and shelves on name and description, pages on block text. The
  page read joins the block's home both ways, a folder page being its
  members' and a shelf page its owner's, and the section 6 trash guard
  rides each join. Capped at the page size apiece; the 1000-row list cap of
  10.3 is nowhere near.
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

  /* Wave 2: each folder hit's and page hit's place in the page tree, as
     this viewer may see it -- one depth-capped upward walk for the whole
     batch, cut at the first ancestor the viewer is not a member of or that
     is trashed, so a hidden parent's name never reaches the results. Every
     starting folder here is already one the viewer is a member of. */
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
      /* The page's folder's ancestors, then the folder itself (which the
         membership join above already admitted). A shelf page has none. */
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
