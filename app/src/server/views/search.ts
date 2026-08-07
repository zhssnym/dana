/*
Q8: GET /search.

Three rules of this query are easy to get subtly wrong, and each is written
here rather than assembled at a call site.

**The pattern.** "'%' q '%'", so a match anywhere in the text counts and a
prefix-anchored LIKE finds none of what this is for. ILIKE, so case is not a
filter. title OR notes, so a needle that lives only in the body is found.

**The escaping**, ruled at the P4 mid-package change control on 2026-08-07: a
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
import type { Executor } from '../domain/db.js'

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
    // draw a chip, never a reason to make it unfindable.
    where: sql`(t.title ILIKE ${pattern} OR t.notes ILIKE ${pattern})${resume}`,
    order: Q8_ORDER,
    limit: SEARCH_PAGE_SIZE + 1,
    extra: sql`${utcInstant(sql`t.updated_at`)} AS updated_cursor`,
  })

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

  return { rows: page.map((row) => row.card), next_cursor: next }
}
