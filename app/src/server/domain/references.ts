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
the resolver refuses to be. So both doors below are built from the same four
gates and neither has an ungated read of its own:

- a task through `accessibleTask`, whose membership join is the scope;
- a folder through `accessOf`, the same;
- a shelf through `shelfView`, which is scoped to its owner because 4.18 makes
  a shelf private by construction;
- a Purpose (#211) or Results (#213) facet through a membership join on its
  Folder, hidden state
  deliberately irrelevant because hide is presentation rather than access;
- a Discussion or an Outcome (#320) through a membership join on the
  Discussion's live Folder, the Discussion not trashed. Consultation is shared
  by construction, so membership is the whole gate, and a trashed Discussion
  takes every one of its Outcomes with it: both answer as a missing target
  until it is restored.

`resolveReference` applies those gates. The search queries below
repeat their access predicates rather than resolving them per row, which is the one
place the two doors are written twice; each query carries the same membership
join in the same position. Nothing but this paragraph holds the two doors
together, so a change to one gate's predicate must be made in both.

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
  GetResultLocationResponse,
  ReferenceKind,
  ReferenceSummary,
  ReferenceTarget,
} from '../../shared/references.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { searchPattern } from '../views/index.js'
import { accessOf, resolveScoped } from './folder-access.js'
import { shelfView } from './shelves.js'
import { accessibleTask } from './tasks.js'

function summary(
  kind: ReferenceKind,
  id: string,
  label: string,
): ReferenceSummary {
  return { kind, id, label, path: referencePath(kind, id) }
}

/* The facets a `facet` reference may name: the document-bearing natives,
   Purpose (#211) and Results (#213). Both are shared by construction
   (`folder_facets_owner_kind_check`), so folder membership is the whole access
   join. The label is the Page's name and the tab's (its stored override or
   that kind's default name), "Half marathon · Purpose": every Page has a
   Purpose, so the tab's name alone would be one of many identical rows in the
   picker and an ambiguous chip. Every query using it joins `folders fo`. */
const documentNativeFacet = sql`ff.kind IN ('purpose', 'results')`
const facetLabel = sql`(fo.name || ' · ' || COALESCE(ff.display_name,
  CASE ff.kind WHEN 'results' THEN ${DEFAULT_FACET_NAMES.results}
               ELSE ${DEFAULT_FACET_NAMES.purpose} END))`

/* A Discussion or an Outcome the viewer may open (#320): the Discussion not
   trashed, its Folder live, the viewer a member of it. `d` is the Discussion. */
const discussionGate = (viewerId: string): SQL => sql`
  JOIN folders fo ON fo.id = d.folder_id AND fo.deleted_at IS NULL
  JOIN folder_members m ON m.folder_id = d.folder_id AND m.user_id = ${viewerId}`

/** The most characters of an Outcome statement a chip draws. A statement may
 * run to 4000 characters and a chip is one line; the full text is the
 * Discussion's to show. */
export const OUTCOME_LABEL_MAX = 120

/** An Outcome's label: its statement on one line, cut at a code point (never
 * inside a surrogate pair) with an ellipsis when it was longer. */
export function outcomeLabel(statement: string): string {
  const flat = statement.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length <= OUTCOME_LABEL_MAX
    ? flat
    : `${chars.slice(0, OUTCOME_LABEL_MAX - 1).join('').trimEnd()}…`
}

/* A native Result (#213) the viewer may open: a `result` block of a live
   Results facet of a live Folder the viewer is a member of. Results are
   shared by construction, so membership is the whole gate, as for the facet
   itself. `pb` is the block. */
const resultGate = (viewerId: string): SQL => sql`
  JOIN folder_facets ff
    ON ff.id = pb.facet_id AND ff.kind = 'results' AND ff.deleted_at IS NULL
  JOIN folders fo ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
  JOIN folder_members m ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}`

/** A Result's label: its statement on one line, cut as an Outcome's is; an
 * empty statement reads "Untitled result". */
export function resultLabel(text: string | null): string {
  const label = outcomeLabel(text ?? '')
  return label === '' ? 'Untitled result' : label
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
      const found = await resolveScoped(executor, 'facet', target.id, viewerId, {
        columns: sql`ff.id, ${facetLabel} AS label`,
        where: documentNativeFacet,
      })
      return found === null
        ? null
        : summary('facet', String(found.row.id), String(found.row.label))
    }
    case 'discussion': {
      const found = await rowsOf(
        executor,
        sql`SELECT d.id, d.title
              FROM discussions d ${discussionGate(viewerId)}
             WHERE d.id = ${target.id}::uuid AND d.trashed_at IS NULL`,
      )
      const row = found[0]
      return row === undefined
        ? null
        : summary('discussion', String(row.id), String(row.title))
    }
    case 'outcome': {
      /* Any Outcome of the Discussion, current or superseded: an old
         Outcome's link keeps resolving to what it said (#320). */
      const found = await rowsOf(
        executor,
        sql`SELECT o.id, o.statement
              FROM discussion_outcomes o
              JOIN discussions d
                ON d.id = o.discussion_id AND d.trashed_at IS NULL
              ${discussionGate(viewerId)}
             WHERE o.id = ${target.id}::uuid`,
      )
      const row = found[0]
      return row === undefined
        ? null
        : summary('outcome', String(row.id), outcomeLabel(String(row.statement)))
    }
    case 'result': {
      const found = await rowsOf(
        executor,
        sql`SELECT pb.id, pb.text
              FROM page_blocks pb ${resultGate(viewerId)}
             WHERE pb.id = ${target.id}::uuid AND pb.kind = 'result'`,
      )
      const row = found[0]
      return row === undefined
        ? null
        : summary('result', String(row.id), resultLabel(row.text as string | null))
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

/** Native Purpose (#211) and Results (#213) facets only. Hidden is
 * intentionally absent from the predicate: hiding a facet is presentation
 * state, not revocation (#211). */
function purposeQuery(viewerId: string, pattern: string, scope: SQL): SQL {
  return sql`
    SELECT ff.id, ${facetLabel} AS label
    FROM folder_facets ff
    JOIN folders fo
      ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
    JOIN folder_members m
      ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
    WHERE ${documentNativeFacet}
      AND ff.deleted_at IS NULL
      AND ${facetLabel} ILIKE ${pattern}
      ${scope}
    ORDER BY lower(${facetLabel}) ASC, ff.id ASC
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
  /* Discussions matched on title, the composing Folder's first. Outcomes
     matched on statement, and only each Discussion's current one: a
     superseded Outcome stays resolvable by its link, but offering every
     superseded statement to a picker would bury the answer under its drafts. */
  /* A bare `false` would be a constant in ORDER BY, which Postgres refuses;
     with no context the ordering simply starts at activity. */
  const inContext =
    folderId === undefined ? sql`` : sql`(d.folder_id = ${folderId}) DESC, `
  const discussionRows = await rowsOf(
    executor,
    sql`SELECT d.id, d.title
        FROM discussions d ${discussionGate(viewerId)}
        WHERE d.trashed_at IS NULL AND d.title ILIKE ${pattern}
        ORDER BY ${inContext}d.last_activity_at DESC, d.id DESC
        LIMIT ${REFERENCE_SEARCH_LIMIT}`,
  )
  const outcomeRows = await rowsOf(
    executor,
    sql`SELECT o.id, o.statement
        FROM discussions d
        JOIN discussion_outcomes o ON o.id = d.current_outcome_id
        ${discussionGate(viewerId)}
        WHERE d.trashed_at IS NULL AND o.statement ILIKE ${pattern}
        ORDER BY ${inContext}o.created_at DESC, o.id DESC
        LIMIT ${REFERENCE_SEARCH_LIMIT}`,
  )

  /* Results (#213) matched on their statement, the composing Folder's first. */
  const resultRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.text, ff.folder_id
        FROM page_blocks pb ${resultGate(viewerId)}
        WHERE pb.kind = 'result' AND pb.text ILIKE ${pattern}
        ORDER BY ${folderId === undefined ? sql`` : sql`(ff.folder_id = ${folderId}) DESC, `}pb.updated_at DESC, pb.id DESC
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

  /* The composing Folder's Results sit with its Tasks and tabs, ahead of
     every other Page's rows; the rest keep their place near the end. */
  const isContextResult = (row: Record<string, unknown>): boolean =>
    folderId !== undefined && String(row.folder_id) === folderId
  const resultSummary = (row: Record<string, unknown>): ReferenceSummary =>
    summary('result', String(row.id), resultLabel(row.text as string | null))

  const results: ReferenceSummary[] = [
    ...contextRows.map((row) =>
      summary('task', String(row.id), String(row.title)),
    ),
    ...contextPurposeRows.map((row) =>
      summary('facet', String(row.id), String(row.label)),
    ),
    ...resultRows.filter(isContextResult).map(resultSummary),
    ...otherRows.map((row) =>
      summary('task', String(row.id), String(row.title)),
    ),
    ...folderRows.map((row) =>
      summary('folder', String(row.id), String(row.name)),
    ),
    ...otherPurposeRows.map((row) =>
      summary('facet', String(row.id), String(row.label)),
    ),
    ...discussionRows.map((row) =>
      summary('discussion', String(row.id), String(row.title)),
    ),
    ...outcomeRows.map((row) =>
      summary('outcome', String(row.id), outcomeLabel(String(row.statement))),
    ),
    ...resultRows.filter((row) => !isContextResult(row)).map(resultSummary),
    ...shelfRows.map((row) =>
      summary('shelf', String(row.id), String(row.name)),
    ),
  ]
  return results.slice(0, REFERENCE_SEARCH_LIMIT)
}

/** Where a native Result lives (#213), through the resolver's own gate. */
export async function resultLocation(
  executor: Executor,
  viewerId: string,
  resultId: string,
): Promise<GetResultLocationResponse | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.text, ff.id AS facet_id, ff.folder_id
          FROM page_blocks pb ${resultGate(viewerId)}
         WHERE pb.id = ${resultId}::uuid AND pb.kind = 'result'`,
  )
  const row = found[0]
  return row === undefined
    ? null
    : {
        id: String(row.id),
        folder_id: String(row.folder_id),
        facet_id: String(row.facet_id),
        label: resultLabel(row.text as string | null),
      }
}
