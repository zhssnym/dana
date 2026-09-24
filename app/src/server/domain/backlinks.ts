/*
"Referenced from" (issue #214): which documents the reader can open hold a
Dana Link to a given target. The contract is `src/shared/backlinks.ts`; this
is the scan.

## How it reads

No backlink is stored (#320), so every call scans. Each query below is scoped
by the reader's access to the **source** document before it looks at any
content, with the same predicate the source's own page read applies:

- a Folder page: a membership of a live Folder (`accessOf`'s join);
- a Shelf page: the Shelf's owner (`shelfView`'s predicate);
- a Facet page: a membership of the facet's live Folder, the facet live, and
  either shared or private *to the reader* (`facetPageGateIn`'s `visibleTo`);
- a Responsibility document: a membership of the live Folder, the document
  active. 7.4's `responsibility.read` is `can_view`, which every member holds;
- a Task document (#221): a membership of the Task's live Folder and the Task
  not trashed (`accessibleTask`'s predicate, which `GET /tasks/:id/document`
  applies).

Inside that scope a cheap `LIKE` on the target's uuid narrows the rows, and
the real match is `parseDanaLink` over every `href` in the stored JSON — the
same parser the client and `resolveReference` use, so a string counts as a
link here exactly when it would count as one anywhere else. The uuid is
validated before it reaches the pattern, so it carries no `%` or `_`.

**The target's own gate is the caller's.** This module answers sources only;
the route resolves the target through `resolveReference` first and 404s a
target the reader cannot open, before anything is scanned.

When a further document home is added, it becomes a source by adding one
scoped query below; nothing else changes.
*/
import { sql } from 'drizzle-orm'

import { BACKLINK_LIMIT } from '../../shared/backlinks.js'
import type {
  Backlink,
  BacklinkHome,
  BacklinkSurface,
  GetBacklinksResponse,
} from '../../shared/backlinks.js'
import { DEFAULT_FACET_NAMES } from '../../shared/facets.js'
import { parseDanaLink } from '../../shared/references.js'
import type { ReferenceTarget } from '../../shared/references.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

/** A safety bound on the rows one source query scans after the uuid prefilter.
 * Far above any real count; it exists so no call is unbounded. */
const SCAN_BOUND = 2000

/** Every string held under an `href` key anywhere in a stored document. The
 * walk is shape-agnostic on purpose: page blocks hold one `RichContent`,
 * Responsibility documents hold a list of blocks each holding one, and a
 * future document shape needs no change here. */
export function hrefsIn(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) hrefsIn(item, into)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'href' && typeof inner === 'string') into.push(inner)
      else hrefsIn(inner, into)
    }
  }
  return into
}

/** Does a stored document hold a Dana Link to `target`? */
export function documentReferences(
  content: unknown,
  target: ReferenceTarget,
  origin?: string,
): boolean {
  return hrefsIn(content).some((href) => {
    const parsed = parseDanaLink(href, origin)
    return parsed !== null && parsed.kind === target.kind && parsed.id === target.id
  })
}

interface Hit {
  surface: BacklinkSurface
  home: BacklinkHome
  homeId: string
  folderId: string | null
  memberId: string | null
  label: string
  blockId: string | null
}

export async function backlinksOf(
  executor: Executor,
  viewerId: string,
  target: ReferenceTarget,
  origin?: string,
): Promise<GetBacklinksResponse> {
  const pattern = `%${target.id}%`
  const folderRef =
    target.kind === 'folder'
      ? sql`(pb.kind = 'folder_ref' AND pb.ref_folder_id = ${target.id}::uuid)`
      : sql`false`
  const hits: Hit[] = []

  const pageBlock = (row: Record<string, unknown>): boolean =>
    (target.kind === 'folder' &&
      row.kind === 'folder_ref' &&
      String(row.ref_folder_id) === target.id) ||
    documentReferences(row.rich_content, target, origin)

  const folderRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.kind, pb.ref_folder_id, pb.rich_content,
               f.id AS home_id, f.name AS label
          FROM page_blocks pb
          JOIN folders f ON f.id = pb.folder_id AND f.deleted_at IS NULL
          JOIN folder_members m
            ON m.folder_id = f.id AND m.user_id = ${viewerId}
         WHERE (pb.rich_content::text LIKE ${pattern} OR ${folderRef})
         ORDER BY pb.page_position ASC NULLS LAST, pb.position ASC, pb.id ASC
         LIMIT ${SCAN_BOUND}`,
  )
  for (const row of folderRows) {
    if (!pageBlock(row)) continue
    hits.push({
      surface: 'page',
      home: 'folder',
      homeId: String(row.home_id),
      folderId: String(row.home_id),
      memberId: null,
      label: String(row.label),
      blockId: String(row.id),
    })
  }

  const shelfRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.kind, pb.ref_folder_id, pb.rich_content,
               s.id AS home_id, s.name AS label
          FROM page_blocks pb
          JOIN shelves s ON s.id = pb.shelf_id AND s.user_id = ${viewerId}
         WHERE (pb.rich_content::text LIKE ${pattern} OR ${folderRef})
         ORDER BY pb.page_position ASC NULLS LAST, pb.position ASC, pb.id ASC
         LIMIT ${SCAN_BOUND}`,
  )
  for (const row of shelfRows) {
    if (!pageBlock(row)) continue
    hits.push({
      surface: 'page',
      home: 'shelf',
      homeId: String(row.home_id),
      folderId: null,
      memberId: null,
      label: String(row.label),
      blockId: String(row.id),
    })
  }

  const facetRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.kind, pb.ref_folder_id, pb.rich_content,
               ff.id AS home_id, ff.folder_id,
               COALESCE(ff.display_name, CASE ff.kind
                 WHEN 'main' THEN ${DEFAULT_FACET_NAMES.main}
                 WHEN 'purpose' THEN ${DEFAULT_FACET_NAMES.purpose}
                 WHEN 'consultation' THEN ${DEFAULT_FACET_NAMES.consultation}
                 WHEN 'results' THEN ${DEFAULT_FACET_NAMES.results}
                 ELSE ${DEFAULT_FACET_NAMES.main} END) AS label
          FROM page_blocks pb
          JOIN folder_facets ff
            ON ff.id = pb.facet_id AND ff.deleted_at IS NULL
           AND (ff.owner_id IS NULL OR ff.owner_id = ${viewerId})
          JOIN folders fo ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
          JOIN folder_members m
            ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
         WHERE (pb.rich_content::text LIKE ${pattern} OR ${folderRef})
         ORDER BY pb.page_position ASC NULLS LAST, pb.position ASC, pb.id ASC
         LIMIT ${SCAN_BOUND}`,
  )
  for (const row of facetRows) {
    if (!pageBlock(row)) continue
    hits.push({
      surface: 'page',
      home: 'facet',
      homeId: String(row.home_id),
      folderId: String(row.folder_id),
      memberId: null,
      label: String(row.label),
      blockId: String(row.id),
    })
  }

  const taskRows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.kind, pb.ref_folder_id, pb.rich_content,
               t.id AS home_id, t.folder_id, t.title AS label
          FROM page_blocks pb
          JOIN tasks t ON t.id = pb.task_id AND t.deleted_at IS NULL
          JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
         WHERE pb.rich_content::text LIKE ${pattern}
         ORDER BY pb.page_position ASC NULLS LAST, pb.position ASC, pb.id ASC
         LIMIT ${SCAN_BOUND}`,
  )
  for (const row of taskRows) {
    if (!documentReferences(row.rich_content, target, origin)) continue
    hits.push({
      surface: 'page',
      home: 'task',
      homeId: String(row.home_id),
      folderId: String(row.folder_id),
      memberId: null,
      label: String(row.label),
      blockId: String(row.id),
    })
  }

  const responsibilityRows = await rowsOf(
    executor,
    sql`SELECT r.content, r.member_id, f.id AS home_id, f.name AS label
          FROM folder_responsibilities r
          JOIN folders f ON f.id = r.folder_id AND f.deleted_at IS NULL
          JOIN folder_members m
            ON m.folder_id = r.folder_id AND m.user_id = ${viewerId}
         WHERE r.ended_at IS NULL AND r.content::text LIKE ${pattern}
         ORDER BY r.created_at ASC, r.id ASC
         LIMIT ${SCAN_BOUND}`,
  )
  for (const row of responsibilityRows) {
    if (!documentReferences(row.content, target, origin)) continue
    hits.push({
      surface: 'responsibility',
      home: 'folder',
      homeId: String(row.home_id),
      folderId: String(row.home_id),
      memberId: String(row.member_id),
      label: String(row.label),
      blockId: null,
    })
  }

  /* One row per document, its blocks in document order. */
  const byDocument = new Map<string, Backlink>()
  for (const hit of hits) {
    const key = `${hit.surface}:${hit.home}:${hit.homeId}:${hit.memberId ?? ''}`
    let entry = byDocument.get(key)
    if (entry === undefined) {
      entry = {
        surface: hit.surface,
        home: hit.home,
        home_id: hit.homeId,
        folder_id: hit.folderId,
        member_id: hit.memberId,
        label: hit.label,
        block_ids: [],
      }
      byDocument.set(key, entry)
    }
    if (hit.blockId !== null) entry.block_ids.push(hit.blockId)
  }
  const all = [...byDocument.values()].sort(
    (a, b) =>
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.home_id.localeCompare(b.home_id) ||
      (a.member_id ?? '').localeCompare(b.member_id ?? ''),
  )
  return {
    results: all.slice(0, BACKLINK_LIMIT),
    truncated: all.length > BACKLINK_LIMIT,
  }
}
