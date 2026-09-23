/*
Dana Link resolution (issue #223, M1-C1).

**This module stores nothing and this is the whole design.** It owns two
reads: one target by id, and a short list of targets a person is typing
towards. Both answer `ReferenceSummary`, both reach the database only through
the gate that already governs the kind they are asking about, and neither
writes a row, an event or a membership.

## The one property to preserve

A viewer who cannot open a thing cannot learn anything about it here, and
cannot even learn that it is a thing. That is 10.2's rule and 7.0's status
grammar, and it has a second half this feature adds: **the two doors must
agree**. A person who pastes an exact URL and a person who types a word must
be told the same story about the same row, or the picker becomes the oracle
the resolver refuses to be. So both doors below are built from the same three
gates and neither has a read of its own:

- a task through `accessibleTask`, whose membership join is the scope;
- a folder through `accessOf`, the same;
- a shelf through `shelfView`, which is scoped to its owner because 4.18 makes
  a shelf private by construction.

`resolveReference` calls those three functions. The search queries below
repeat their `FROM` clauses rather than calling them per row, which is the one
place the two doors are written twice; each query carries the same membership
join in the same position. **AC-429 was named here as the criterion that would check
that agreement behaviourally, and no such criterion was ever written**: issue #223
landed AC-424 to AC-428 and the number 429 belongs to no bullet in section 12, no file
under `app/tests/` and no row in the registry (found by
`app/tests/guards/guard-criterion-citations.test.ts`, issue #257). What holds the two
doors together is this paragraph and `ac-428-reference-doors-agree-and-grant-nothing`,
which reaches the same verdict from both doors without reading these `FROM` clauses.

## Ordering, and why there is no cursor

The picker shows one short list. Context first — the tasks in the folder the
person is composing in — then everything else that matched, then folders, then
shelves, and the whole thing cut to `REFERENCE_SEARCH_LIMIT`. There is no
paging because there is no page two: a person who does not see what they meant
types another letter. That is also what keeps requirement 4's "never a flat
dump" true by construction rather than by care.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { REFERENCE_SEARCH_LIMIT, referencePath } from '../../shared/references.js'
import { DEFAULT_FACET_NAMES } from '../../shared/facets.js'
import type {
  ReferenceKind,
  ReferenceSummary,
  ReferenceTarget,
} from '../../shared/references.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { searchPattern } from '../views/index.js'
import { accessOf } from './folders.js'
import { shelfView } from './shelves.js'
import { accessibleTask } from './tasks.js'

function summary(
  kind: ReferenceKind,
  id: string,
  label: string,
): ReferenceSummary {
  return { kind, id, label, path: referencePath(kind, id) }
}

/**
 * One target, or null when the viewer cannot have it — which covers both "it
 * is not there" and "it is not yours", deliberately indistinguishably.
 *
 * The switch is exhaustive over `ReferenceKind`, so a kind added to that
 * union fails to compile here rather than falling through to a null that
 * would read as an ordinary refusal.
 */
export async function resolveReference(
  executor: Executor,
  viewerId: string,
  target: ReferenceTarget,
): Promise<ReferenceSummary | null> {
  switch (target.kind) {
    case 'task': {
      const task = await accessibleTask(executor, viewerId, target.id)
      return task === null ? null : summary('task', task.id, task.title)
    }
    case 'folder': {
      const folder = await accessOf(executor, viewerId, target.id)
      return folder === null ? null : summary('folder', target.id, folder.name)
    }
    case 'shelf': {
      const shelf = await shelfView(executor, viewerId, target.id)
      return shelf === null ? null : summary('shelf', shelf.id, shelf.name)
    }
    case 'facet': {
      const found = await rowsOf(
        executor,
        sql`SELECT ff.id,
                   COALESCE(ff.display_name, ${DEFAULT_FACET_NAMES.purpose}) AS label
              FROM folder_facets ff
              JOIN folders fo
                ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
              JOIN folder_members m
                ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
             WHERE ff.id = ${target.id}::uuid
               AND ff.kind = 'purpose'
               AND ff.deleted_at IS NULL`,
      )
      const row = found[0]
      return row === undefined
        ? null
        : summary('facet', String(row.id), String(row.label))
    }
  }
}

export interface ReferenceSearchInput {
  q: string
  /** The folder the person is composing in, already resolved by the caller:
   * this module never decides whether the viewer may name it, because a
   * refusal has to be an HTTP status and that is the route's to send. */
  folderId?: string
}

/** Tasks the viewer is a member of the folder of, matched on title.
 *
 * Title only, and notes deliberately not: a picker row draws a title, and a
 * match a person cannot see in the row they are offered reads as a bug in the
 * picker. `GET /search` matches notes and steps too and is unchanged. */
function taskQuery(viewerId: string, pattern: string, scope: SQL): SQL {
  return sql`
    SELECT t.id, t.title
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
    JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
    WHERE t.deleted_at IS NULL AND t.title ILIKE ${pattern}${scope}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT ${REFERENCE_SEARCH_LIMIT}`
}

/** Native Purpose facets only. Hidden is intentionally absent from the
 * predicate: hiding a facet is presentation state, not revocation (#211). */
function purposeQuery(viewerId: string, pattern: string, scope: SQL): SQL {
  return sql`
    SELECT ff.id,
           COALESCE(ff.display_name, ${DEFAULT_FACET_NAMES.purpose}) AS label
    FROM folder_facets ff
    JOIN folders fo
      ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
    JOIN folder_members m
      ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
    WHERE ff.kind = 'purpose'
      AND ff.deleted_at IS NULL
      AND COALESCE(ff.display_name, ${DEFAULT_FACET_NAMES.purpose}) ILIKE ${pattern}
      ${scope}
    ORDER BY lower(COALESCE(ff.display_name, ${DEFAULT_FACET_NAMES.purpose})) ASC,
             ff.id ASC
    LIMIT ${REFERENCE_SEARCH_LIMIT}`
}

export async function searchReferences(
  executor: Executor,
  viewerId: string,
  input: ReferenceSearchInput,
): Promise<ReferenceSummary[]> {
  const pattern = searchPattern(input.q)
  const { folderId } = input

  /* Context first. Two queries rather than one ordered by a CASE, because
     the priority is "this folder's, then the rest" and writing it as two
     scopes is the shape a third context would extend. */
  const contextRows =
    folderId === undefined
      ? []
      : await rowsOf(
          executor,
          taskQuery(viewerId, pattern, sql` AND t.folder_id = ${folderId}`),
        )
  const contextPurposeRows =
    folderId === undefined
      ? []
      : await rowsOf(
          executor,
          purposeQuery(
            viewerId,
            pattern,
            sql` AND ff.folder_id = ${folderId}`,
          ),
        )
  const otherRows = await rowsOf(
    executor,
    taskQuery(
      viewerId,
      pattern,
      folderId === undefined ? sql`` : sql` AND t.folder_id <> ${folderId}`,
    ),
  )
  const otherPurposeRows = await rowsOf(
    executor,
    purposeQuery(
      viewerId,
      pattern,
      folderId === undefined ? sql`` : sql` AND ff.folder_id <> ${folderId}`,
    ),
  )

  /* Folders and shelves, each on its own scope: membership for one, ownership
     for the other. Matched on name alone, for the task query's reason. */
  const folderRows = await rowsOf(
    executor,
    sql`SELECT f.id, f.name
        FROM folders f
        JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = ${viewerId}
        WHERE f.deleted_at IS NULL AND f.name ILIKE ${pattern}
        ORDER BY lower(f.name) ASC, f.id ASC
        LIMIT ${REFERENCE_SEARCH_LIMIT}`,
  )
  const shelfRows = await rowsOf(
    executor,
    sql`SELECT s.id, s.name
        FROM shelves s
        WHERE s.user_id = ${viewerId} AND s.name ILIKE ${pattern}
        ORDER BY lower(s.name) ASC, s.id ASC
        LIMIT ${REFERENCE_SEARCH_LIMIT}`,
  )

  const results: ReferenceSummary[] = [
    ...contextRows.map((row) =>
      summary('task', String(row.id), String(row.title)),
    ),
    ...contextPurposeRows.map((row) =>
      summary('facet', String(row.id), String(row.label)),
    ),
    ...otherRows.map((row) =>
      summary('task', String(row.id), String(row.title)),
    ),
    ...folderRows.map((row) =>
      summary('folder', String(row.id), String(row.name)),
    ),
    ...otherPurposeRows.map((row) =>
      summary('facet', String(row.id), String(row.label)),
    ),
    ...shelfRows.map((row) =>
      summary('shelf', String(row.id), String(row.name)),
    ),
  ]
  return results.slice(0, REFERENCE_SEARCH_LIMIT)
}
