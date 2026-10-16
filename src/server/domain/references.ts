// Dana Link resolution: one target by id, and picker search. Stores nothing.
// A viewer must learn nothing about a thing they cannot open, and both doors must agree:
// the search queries repeat resolveReference's access predicates, so change a gate in both.
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { REFERENCE_SEARCH_LIMIT, referencePath } from '../../shared/references.js'
import type {
  GetResultLocationResponse,
  ReferenceKind,
  ReferenceSummary,
  ReferenceTarget,
} from '../../shared/references.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { searchPattern } from '../views/index.js'
import { accessOf, joinVisibleFolder } from './folder-access.js'
import { shelfView } from './shelves.js'
import { accessibleTask } from './tasks.js'

function summary(
  kind: ReferenceKind,
  id: string,
  label: string,
): ReferenceSummary {
  return { kind, id, label, path: referencePath(kind, id) }
}

/* A tab other than the project's own is labelled "Project · Tab", since many projects have a Purpose. `tf` is the page. */
const tabLabel = sql`(CASE WHEN tf.tab_position IS NOT NULL AND tf.id <> tf.project_id
  THEN (SELECT pr.name FROM folders pr WHERE pr.id = tf.project_id) || ' · ' || tf.name
  ELSE tf.name END)`

/* The Discussion not trashed, its Folder live, the viewer a member. `d` is the Discussion. */
const discussionGate = (viewerId: string): SQL =>
  joinVisibleFolder(viewerId, { folderId: sql`d.folder_id` })

/** The most characters of an Outcome statement a chip draws. */
export const OUTCOME_LABEL_MAX = 120

/** One line, cut at a code point (never inside a surrogate pair), with an ellipsis when longer. */
export function outcomeLabel(statement: string): string {
  const flat = statement.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length <= OUTCOME_LABEL_MAX
    ? flat
    : `${chars.slice(0, OUTCOME_LABEL_MAX - 1).join('').trimEnd()}…`
}

/* A `result` block of a live page the viewer is a member of. `pb` is the block, `rf` its page. */
const resultGate = (viewerId: string): SQL => sql`
  ${joinVisibleFolder(viewerId, { folderId: sql`pb.folder_id`, folder: 'rf' })}`

/** Cut as an Outcome's is; an empty statement reads "Untitled result". */
export function resultLabel(text: string | null): string {
  const label = outcomeLabel(text ?? '')
  return label === '' ? 'Untitled result' : label
}

/**
 * One target, or null for both "not there" and "not yours", indistinguishably.
 * The switch is exhaustive, so a new kind fails to compile here.
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
      /* A stored facet link names a page: the facet's id became its tab's. */
      const found = await rowsOf(
        executor,
        sql`SELECT tf.id, ${tabLabel} AS label
              FROM folders tf ${joinVisibleFolder(viewerId, { folder: 'tf' })}
             WHERE tf.id = ${target.id}::uuid`,
      )
      const row = found[0]
      return row === undefined ? null : summary('facet', String(row.id), String(row.label))
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
      /* Any Outcome, current or superseded: an old Outcome's link keeps resolving. */
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
  /** The folder being composed in, already resolved by the caller. */
  folderId?: string
}

/** Tasks in the viewer's folders, matched on title only: a picker row shows only the title. */
function taskQuery(viewerId: string, pattern: string, scope: SQL): SQL {
  return sql`
    SELECT t.id, t.title
    FROM tasks t
    ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id` })}
    WHERE t.deleted_at IS NULL AND t.title ILIKE ${pattern}${scope}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT ${REFERENCE_SEARCH_LIMIT}`
}

/** A project's Doc tabs other than its own, labelled with the project's name. */
function purposeQuery(viewerId: string, pattern: string, scope: SQL): SQL {
  return sql`
    SELECT tf.id, ${tabLabel} AS label
    FROM folders tf
    ${joinVisibleFolder(viewerId, { folder: 'tf' })}
    WHERE tf.kind = 'doc' AND tf.tab_position IS NOT NULL AND tf.id <> tf.project_id
      AND ${tabLabel} ILIKE ${pattern}
      ${scope}
    ORDER BY lower(${tabLabel}) ASC, tf.id ASC
    LIMIT ${REFERENCE_SEARCH_LIMIT}`
}

const projectOfPage = (folderId: string): SQL =>
  sql`(SELECT cp.project_id FROM folders cp WHERE cp.id = ${folderId}::uuid)`

export async function searchReferences(
  executor: Executor,
  viewerId: string,
  input: ReferenceSearchInput,
): Promise<ReferenceSummary[]> {
  const pattern = searchPattern(input.q)
  const { folderId } = input

  /* Context first, as two queries: this folder's tasks, then the rest. */
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
            sql` AND tf.project_id = ${projectOfPage(folderId)}`,
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
      folderId === undefined ? sql`` : sql` AND tf.project_id <> ${projectOfPage(folderId)}`,
    ),
  )

  /* Folders by membership, shelves by ownership, matched on name. */
  const folderRows = await rowsOf(
    executor,
    sql`SELECT f.id, f.name
        FROM folders f
        ${joinVisibleFolder(viewerId, { folder: 'f' })}
        WHERE f.name ILIKE ${pattern}
          -- Step 7: a project's other tabs are offered by purposeQuery.
          AND (f.tab_position IS NULL OR f.id = f.project_id)
        ORDER BY lower(f.name) ASC, f.id ASC
        LIMIT ${REFERENCE_SEARCH_LIMIT}`,
  )
  /* Outcomes match only each Discussion's current one, so drafts do not bury the answer.
  A bare `false` in ORDER BY is a constant, which Postgres refuses. */
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

  const resultRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.text, rf.project_id,
               ${folderId === undefined ? sql`false` : sql`(rf.project_id = ${projectOfPage(folderId)})`} AS in_context
        FROM page_blocks pb ${resultGate(viewerId)}
        WHERE pb.kind = 'result' AND pb.text ILIKE ${pattern}
        ORDER BY ${folderId === undefined ? sql`` : sql`(rf.project_id = ${projectOfPage(folderId)}) DESC, `}pb.updated_at DESC, pb.id DESC
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

  /* The composing Folder's Results sit with its Tasks and tabs, ahead of other Pages' rows. */
  const isContextResult = (row: Record<string, unknown>): boolean =>
    row.in_context === true
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

/** Where a native Result lives, through the resolver's own gate. */
export async function resultLocation(
  executor: Executor,
  viewerId: string,
  resultId: string,
): Promise<GetResultLocationResponse | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.text, rf.id AS page_id
          FROM page_blocks pb ${resultGate(viewerId)}
         WHERE pb.id = ${resultId}::uuid AND pb.kind = 'result'`,
  )
  const row = found[0]
  return row === undefined
    ? null
    : {
        id: String(row.id),
        /* `facet_id` names the same page for older clients. */
        folder_id: String(row.page_id),
        facet_id: String(row.page_id),
        label: resultLabel(row.text as string | null),
      }
}
/** The project's Doc tabs that `pageId` may link to as facets, or null when the viewer cannot open `pageId`. */
export async function projectFacetOptions(
  executor: Executor,
  viewerId: string,
  pageId: string,
): Promise<{ id: string; name: string }[] | null> {
  if ((await accessOf(executor, viewerId, pageId)) === null) return null
  const rows = await rowsOf(
    executor,
    sql`SELECT tf.id, tf.name
          FROM folders p
          JOIN folders tf ON tf.project_id = p.project_id
         WHERE p.id = ${pageId}::uuid
           AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND tf.kind = 'doc' AND tf.tab_position IS NOT NULL
           AND tf.id <> tf.project_id
           AND tf.deleted_at IS NULL AND tf.archived_at IS NULL
         ORDER BY tf.tab_position, tf.id`,
  )
  return rows.map((row) => ({ id: String(row.id), name: String(row.name) }))
}
