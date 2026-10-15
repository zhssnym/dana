// The legacy page PUT (4.17, 7.16) for folder and shelf pages. The PUT is the whole page: blocks with an id
// edit, without one insert, missing ones are deleted. A stale updated_at or a vanished block is a 409 before
// any write. One PUT is one event. Block files are gated by `fileScopeCondition`.
import { applyDocument, documentMetadata, DocumentRefusal, touchesPageTree } from './page-document.js'
import { lockPageTree } from './page-tree.js'
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  DocumentTransaction,
  PageBlock,
  PageActionBody,
  PageItemRef,
  PageBlockWrite,
  PageView,
} from '../../shared/pages.js'
import { WIDTH_BLOCK_KINDS } from '../../shared/pages.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { readableFileScope } from './files.js'
import { accessOf, mayPerform, visibleFolder } from './folder-access.js'
import { shelfView } from './shelves.js'
import { applyShelfDocument, shelfDocumentMetadata, ShelfDocumentRefusal } from './shelf-document.js'
import { initialKeys } from './fractional-index.js'
import {
  placementKey,
  placementMatchesSection,
  sameItem,
  seededItems,
  writeItemPosition,
} from './page-order.js'
import { createTaskIn } from './tasks.js'
import { fileReclaimedAt } from './document-outline.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** Absent for a block with no file, null for an older file without dimensions; both read as null. */
function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function blockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    page_position: nullableString(row.page_position),
    section_block_id: nullableString(row.section_block_id),
    list_parent_block_id: nullableString(row.list_parent_block_id),
    toggleable: row.toggleable === true ? true : null,
    checked: row.checked === null || row.checked === undefined ? null : Boolean(row.checked),
    rich_content: (row.rich_content ?? null) as PageBlock["rich_content"],
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    file_width: nullableInt(row.file_width),
    file_height: nullableInt(row.file_height),
    file_reclaimed_at: fileReclaimedAt(row),
    file_name: nullableString(row.file_name),
    ref_folder_id: nullableString(row.ref_folder_id),
    width_pct: row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct),
    updated_at: toIso(row.updated_at),
  }
}

export interface PageHome {
  folderId: string | null
  shelfId: string | null
  /** Explicit Facet for a scoped read; omitted for legacy Page content. */
  facetId?: string
}

/*
Qualified with alias `b` because `files` also has a `folder_id`. The viewer is part of the condition, so a
caller that forgets to gate gets nothing. EXISTS, so the scope multiplies no rows.
 */
function homeCondition(home: PageHome, viewerId: string) {
  return home.folderId !== null
    ? sql`b.folder_id = ${home.folderId}
          AND ${home.facetId === undefined ? sql`(b.page_facet_id IS NULL OR b.page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${home.folderId}::uuid))` : sql`b.page_facet_id = ${home.facetId}::uuid`}
          AND ${visibleFolder(sql`b.folder_id`, viewerId)}`
    : sql`b.shelf_id = ${home.shelfId}
          AND EXISTS (SELECT 1 FROM shelves vs
                       WHERE vs.id = b.shelf_id
                         AND vs.user_id = ${viewerId})`
}

/** Uses the same two functions the routes gate with, so "visible" has one definition. */
async function homeIsVisible(
  tx: Executor,
  home: PageHome,
  viewerId: string,
): Promise<boolean> {
  if (home.folderId !== null && home.facetId !== undefined) {
    const belongs = await rowsOf(tx, sql`
      SELECT 1 AS present FROM page_facets pf
       WHERE pf.id = ${home.facetId}::uuid
         AND (pf.content_folder_id = ${home.folderId}::uuid
           OR (pf.content_folder_id IS NULL AND pf.page_id = ${home.folderId}::uuid))
       LIMIT 1`)
    return belongs.length > 0 && (await accessOf(tx, viewerId, home.folderId)) !== null
  }
  return home.folderId !== null
    ? (await accessOf(tx, viewerId, home.folderId)) !== null
    : home.shelfId !== null &&
        (await shelfView(tx, viewerId, home.shelfId)) !== null
}

/** The composed page read. Items carry identity and order only; payloads stay in `blocks` and TaskCards. */
async function pageItemsIn(
  executor: Executor,
  viewerId: string,
  home: PageHome,
): Promise<PageItemRef[]> {
  const rows =
    home.folderId === null
      ? await rowsOf(
          executor,
          sql`SELECT 'block'::text AS kind, b.id, b.page_position,
                     b.position::bigint AS fallback_position, b.updated_at AS fallback_time
                FROM page_blocks b
               WHERE ${homeCondition(home, viewerId)}
               ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
        )
      : await rowsOf(
          executor,
          sql`SELECT item.kind, item.id
                FROM (
                  SELECT 'block'::text AS kind, b.id, b.page_position,
                         1 AS fallback_kind, b.position::bigint AS fallback_position,
                         b.updated_at AS fallback_time
                    FROM page_blocks b
                   WHERE ${homeCondition(home, viewerId)}
                  UNION ALL
                  SELECT 'task'::text AS kind, t.id, t.page_position,
                         0 AS fallback_kind, 0::bigint AS fallback_position,
                         t.created_at AS fallback_time
                    FROM tasks t
                   WHERE t.folder_id = ${home.folderId}::uuid
                     AND ${home.facetId === undefined ? sql`(t.page_facet_id IS NULL OR t.page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${home.folderId}::uuid))` : sql`t.page_facet_id = ${home.facetId}::uuid`}
                     AND t.deleted_at IS NULL

                     AND ${visibleFolder(sql`t.folder_id`, viewerId)}
                ) item
               ORDER BY item.page_position ASC NULLS LAST,
                        CASE WHEN item.page_position IS NULL THEN item.fallback_kind END,
                        CASE WHEN item.page_position IS NULL THEN item.fallback_position END,
                        CASE WHEN item.page_position IS NULL THEN item.fallback_time END,
                        item.kind, item.id`,
        )
  return rows.map((row) => ({
    kind: String(row.kind) as PageItemRef['kind'],
    id: String(row.id),
  }))
}

export async function pageView(
  db: Db,
  viewerId: string,
  home: PageHome,
): Promise<PageView> {
  return inTransaction(db, async tx => {
    if (!(await homeIsVisible(tx,home,viewerId))) return {blocks:[],items:[]}
    if(home.folderId !== null) await tx.execute(sql`SELECT 1 FROM folders WHERE id=${home.folderId}::uuid FOR SHARE`)
    return pageViewIn(tx,viewerId,home)
  })
}
export type PutPageResult =
  | { kind: 'written'; page: PageView }
  | { kind: 'stale'; blockId: string }
  /** Block indexes whose `file_id` this page cannot reach. Missing and unreachable are one answer (10.2). */
  | { kind: 'file_not_here'; blockIndexes: readonly number[] }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }

/*
A block's `file_id` gate. A folder page scopes to its own folder. A shelf page has no folder_id,
so it scopes with `readableFileScope`. No kind clause: unlike covers, a block may carry any file kind.
 */
function fileScopeCondition(home: PageHome, viewerId: string) {
  return home.folderId !== null
    ? sql`f.folder_id = ${home.folderId}`
    : readableFileScope(viewerId)
}

export async function putPage(
  db: Db,
  viewerId: string,
  home: PageHome,
  blocks: readonly PageBlockWrite[],
): Promise<PutPageResult> {
  return inTransaction(db, async (tx) => {
    /* The insert writes `home.folderId` as given, so check visibility here even though routes gate first. */
    if (!(await homeIsVisible(tx, home, viewerId))) {
      return { kind: 'not_found' } as const
    }

    /* The Access half, for the same reason. A shelf page has no Folder Access; visibility settled it. */
    if (home.folderId !== null) {
      const facts = await accessOf(tx, viewerId, home.folderId)
      if (facts === null) return { kind: 'not_found' } as const
      const decision = mayPerform(facts, 'folder.page.edit')
      if (!decision.allowed) {
        return { kind: 'forbidden', reason: decision.reason } as const
      }
    }

    /* The file gate runs before the row lock. One read for all distinct ids; all or nothing. */
    const wanted = [
      ...new Set(
        blocks.flatMap((block) =>
          block.file_id === undefined || block.file_id === null
            ? []
            : [block.file_id],
        ),
      ),
    ]
    if (wanted.length > 0) {
      const reachable = await rowsOf(
        tx,
        sql`SELECT f.id FROM files f
            WHERE f.id IN (${sql.join(
              wanted.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
              AND ${fileScopeCondition(home, viewerId)}`,
      )
      const found = new Set(reachable.map((row) => String(row.id)))
      if (found.size !== wanted.length) {
        const blockIndexes = blocks.flatMap((block, index) =>
          block.file_id !== undefined &&
          block.file_id !== null &&
          !found.has(block.file_id)
            ? [index]
            : [],
        )
        return { kind: 'file_not_here', blockIndexes } as const
      }
    }

    /* The legacy writer and page actions share the folder's ordering lock, so a PUT cannot reseed during a drag. */
    if (home.folderId !== null) {
      await tx.execute(
        sql`SELECT 1 FROM folders WHERE id = ${home.folderId}::uuid FOR UPDATE`,
      )
    }

    if (home.folderId !== null) {
      const modern = await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE folder_id=${home.folderId}::uuid AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${home.folderId}::uuid)) AND (rich_content IS NOT NULL OR (kind='section' AND section_block_id IS NOT NULL) OR kind NOT IN ('section','paragraph','image','folder_ref') OR EXISTS (SELECT 1 FROM page_document_receipts r WHERE r.folder_id=page_blocks.folder_id AND jsonb_typeof(r.created_task_ids)='array')) LIMIT 1`)
      if(modern.length) return {kind:'stale',blockId:String(modern[0]?.id)} as const
    }
    /* Refuse the legacy writer on a Shelf the composer has written: it would delete blocks it cannot draw. */
    if (home.folderId === null && home.shelfId !== null) {
      await tx.execute(sql`SELECT 1 FROM shelves WHERE id = ${home.shelfId}::uuid FOR UPDATE`)
      const modern = await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE shelf_id=${home.shelfId}::uuid AND (rich_content IS NOT NULL OR kind NOT IN ('section','paragraph','image','folder_ref')) UNION ALL SELECT shelf_id AS id FROM shelf_document_receipts WHERE shelf_id=${home.shelfId}::uuid LIMIT 1`)
      if(modern.length) return {kind:'stale',blockId:String(modern[0]?.id)} as const
    }
    const current = await rowsOf(
      tx,
      sql`SELECT b.id, b.updated_at FROM page_blocks b
          WHERE ${homeCondition(home, viewerId)} FOR UPDATE`,
    )
    const stored = new Map(
      current.map((row) => [String(row.id), toIso(row.updated_at)]),
    )

    // Every stale refusal happens before the first write: a body that fails on any block applies none.
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
                  file_reclaimed_at = CASE
                    WHEN ${block.file_id ?? null}::uuid IS NULL AND kind = ${block.kind}
                    THEN file_reclaimed_at END,
                  updated_at = now()
              WHERE id = ${block.id}::uuid`,
        )
      }
    }

    /* After every write has landed; earlier would leave new blocks keyless and Section membership stale. */
    await reseedLegacyPage(tx, home)

    // The name at act time (4.13), from whichever table is the page's home.
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

/** Re-express a legacy PUT's order in the composed keyspace for old clients. */
async function reseedLegacyPage(tx: Executor, home: PageHome): Promise<void> {
  if (home.folderId === null) {
    const rows = await rowsOf(
      tx,
      sql`SELECT id FROM page_blocks
           WHERE shelf_id = ${home.shelfId}::uuid
           ORDER BY position, id`,
    )
    const keys = initialKeys(rows.length)
    for (const [index, row] of rows.entries()) {
      await writeItemPosition(tx, { kind: 'block', id: String(row.id) }, keys[index] as string)
    }
    return
  }

  const blocks = await rowsOf(
    tx,
    sql`SELECT id, kind, position FROM page_blocks
         WHERE folder_id = ${home.folderId}::uuid
           AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${home.folderId}::uuid))
         ORDER BY position, id`,
  )
  const tasks = await rowsOf(
    tx,
    sql`SELECT t.id, t.section_block_id
          FROM tasks t
         WHERE t.folder_id = ${home.folderId}::uuid
           AND (t.page_facet_id IS NULL OR t.page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${home.folderId}::uuid))
           AND t.deleted_at IS NULL
           AND t.status IN ('pending', 'abandoned')
         ORDER BY t.page_position ASC NULLS LAST, t.created_at, t.id`,
  )
  const sectionIds = new Set(
    blocks.flatMap((block) => String(block.kind) === 'section' ? [String(block.id)] : []),
  )
  let sectionId: string | null = null
  for (const block of blocks) {
    const blockId = String(block.id)
    if (String(block.kind) === 'section') {
      sectionId = blockId
      await tx.execute(
        sql`UPDATE page_blocks SET section_block_id = NULL
              WHERE id = ${blockId}::uuid`,
      )
    } else {
      await tx.execute(
        sql`UPDATE page_blocks SET section_block_id = ${sectionId}
              WHERE id = ${blockId}::uuid`,
      )
    }
  }
  const loose = tasks.filter(
    (task) => task.section_block_id == null || !sectionIds.has(String(task.section_block_id)),
  )
  const ordered: PageItemRef[] = loose.map((task) => ({ kind: 'task', id: String(task.id) }))
  for (const [index, block] of blocks.entries()) {
    const blockId = String(block.id)
    ordered.push({ kind: 'block', id: blockId })
    if (String(block.kind) !== 'section') continue
    const opening = blocks[index + 1]
    if (opening !== undefined && String(opening.kind) === 'paragraph') {
      ordered.push({ kind: 'block', id: String(opening.id) })
    }
    ordered.push(
      ...tasks
        .filter((task) => String(task.section_block_id) === blockId)
        .map((task) => ({ kind: 'task' as const, id: String(task.id) })),
    )
  }
  const unique = [...new Map(ordered.map((item) => [`${item.kind}:${item.id}`, item])).values()]
  const keys = initialKeys(unique.length)
  for (const [index, item] of unique.entries()) {
    await writeItemPosition(tx, item, keys[index] as string)
  }
}

async function sectionBelongsToFolder(
  tx: Executor,
  folderId: string,
  sectionId: string | null,
): Promise<boolean> {
  if (sectionId === null) return true
  const rows = await rowsOf(
    tx,
    sql`SELECT 1 AS present FROM page_blocks
         WHERE id = ${sectionId}::uuid
           AND folder_id = ${folderId}::uuid
           AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid))
           AND kind = 'section'`,
  )
  return rows.length > 0
}

export type PageActionResult =
  | { kind: 'written'; page: PageView }
  | { kind: 'not_found' }
  | { kind: 'stale'; blockId: string }
  | { kind: 'bad_anchor'; field: 'after' | 'before' }
  | { kind: 'section_not_here' }
  | { kind: 'file_not_here' }
  /** The file is reachable but was uploaded as another kind. Unlike `file_not_here`, this may say so. */
  | { kind: 'file_kind_mismatch'; message: string }
  | { kind: 'not_convertible' }
  | { kind: 'forbidden'; reason: string }

/** One user gesture, one folder lock, one durable mixed placement. */
export async function actOnFolderPage(
  db: Db,
  viewerId: string,
  folderId: string,
  body: PageActionBody,
): Promise<PageActionResult> {
  return inTransaction<PageActionResult>(db, async (tx) => {
    const facts = await accessOf(tx, viewerId, folderId)
    if (facts === null) return { kind: 'not_found' }
    const decision = mayPerform(facts, 'folder.section.manage')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    // Creating, trashing or re-homing a sub-page takes the tree lock before the folder row.
    if (body.action === 'document_transaction' && touchesPageTree(body)) await lockPageTree(tx)
    await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`)
    if (body.action === 'document_transaction') {
      const mutation = await applyDocument(tx, viewerId, folderId, body)
      return {kind:'written',page:{...await pageViewIn(tx,viewerId,{folderId,shelfId:null}),mutation}} as const
    }
    const modern = await rowsOf(tx, sql`SELECT id FROM page_blocks WHERE folder_id=${folderId}::uuid AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid)) AND (rich_content IS NOT NULL OR (kind='section' AND section_block_id IS NOT NULL) OR kind NOT IN ('section','paragraph','image','folder_ref') OR EXISTS (SELECT 1 FROM page_document_receipts r WHERE r.folder_id=page_blocks.folder_id AND jsonb_typeof(r.created_task_ids)='array')) LIMIT 1`)
    if (modern.length && body.action !== 'update_block') return {kind:'stale',blockId:folderId} as const
    const items = await seededItems(tx, folderId)

    const anchors = 'after' in body
      ? placementKey(
          items,
          body.action === 'move_item' ? body.item : null,
          body.after,
          body.before,
        )
      : null
    if (anchors?.kind === 'bad_anchor') return anchors

    if (body.action === 'insert_block') {
      if (!(await sectionBelongsToFolder(tx, folderId, body.section_block_id))) {
        return { kind: 'section_not_here' }
      }
      if (body.block_kind === 'section' && body.section_block_id !== null) {
        return { kind: 'section_not_here' }
      }
      if (!placementMatchesSection(
        items,
        null,
        body.after,
        body.before,
        (anchors as { kind: 'key'; value: string }).value,
        body.section_block_id,
      )) {
        return { kind: 'bad_anchor', field: 'after' }
      }
      if (body.file_id != null) {
        const file = await rowsOf(
          tx,
          sql`SELECT f.id FROM files f
               WHERE f.id = ${body.file_id}::uuid
                 AND f.folder_id = ${folderId}::uuid`,
        )
        if (file.length === 0) return { kind: 'file_not_here' }
      }
      const last = await rowsOf(
        tx,
        sql`SELECT COALESCE(max(position), -1) + 1 AS position
              FROM page_blocks WHERE folder_id = ${folderId}::uuid
                AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid))`,
      )
      await tx.execute(
        sql`INSERT INTO page_blocks
              (folder_id, kind, position, page_position, section_block_id,
               text, file_id, width_pct)
            VALUES (${folderId}::uuid, ${body.block_kind},
                    ${Number(last[0]?.position ?? 0)},
                    ${(anchors as { kind: 'key'; value: string }).value},
                    ${body.section_block_id}, ${body.text ?? null},
                    ${body.file_id ?? null}, ${body.width_pct ?? null})`,
      )
    } else if (body.action === 'insert_task') {
      if (!(await sectionBelongsToFolder(tx, folderId, body.section_block_id))) {
        return { kind: 'section_not_here' }
      }
      if (!placementMatchesSection(
        items,
        null,
        body.after,
        body.before,
        (anchors as { kind: 'key'; value: string }).value,
        body.section_block_id,
      )) {
        return { kind: 'bad_anchor', field: 'after' }
      }
      const made = await createTaskIn(
        tx,
        viewerId,
        { title: body.title, folder_id: folderId, section_block_id: body.section_block_id },
        { pagePosition: (anchors as { kind: 'key'; value: string }).value },
      )
      if (made.kind !== 'created') {
        return made.kind === 'section_not_here'
          ? { kind: 'section_not_here' }
          : { kind: 'not_found' }
      }
    } else if (body.action === 'move_item') {
      const current = items.find((item) => sameItem(item, body.item))
      if (current === undefined) return { kind: 'not_found' }
      if (!(await sectionBelongsToFolder(tx, folderId, body.section_block_id))) {
        return { kind: 'section_not_here' }
      }
      if (body.item.kind === 'block') {
        const blocks = await rowsOf(
          tx,
          sql`SELECT kind FROM page_blocks
               WHERE id = ${body.item.id}::uuid AND folder_id = ${folderId}::uuid
                 AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid))`,
        )
        if (blocks.length === 0) return { kind: 'not_found' }
        /* A Section is a span, not one row: moving the heading alone would leave its members behind. */
        if (String(blocks[0]?.kind) === 'section') {
          return { kind: 'not_convertible' }
        }
        if (!placementMatchesSection(
          items,
          body.item,
          body.after,
          body.before,
          (anchors as { kind: 'key'; value: string }).value,
          body.section_block_id,
        )) {
          return { kind: 'bad_anchor', field: 'after' }
        }
        const moved = await rowsOf(
          tx,
          sql`UPDATE page_blocks
                SET page_position = ${(anchors as { kind: 'key'; value: string }).value},
                    section_block_id = ${body.section_block_id},
                    updated_at = now()
              WHERE id = ${body.item.id}::uuid
              RETURNING id`,
        )
        if (moved.length === 0) return { kind: 'not_found' }
      } else {
        if (!placementMatchesSection(
          items,
          body.item,
          body.after,
          body.before,
          (anchors as { kind: 'key'; value: string }).value,
          body.section_block_id,
        )) {
          return { kind: 'bad_anchor', field: 'after' }
        }
        const moved = await rowsOf(
          tx,
          sql`UPDATE tasks
                SET page_position = ${(anchors as { kind: 'key'; value: string }).value},
                    section_block_id = ${body.section_block_id},
                    updated_at = now()
              WHERE id = ${body.item.id}::uuid AND folder_id = ${folderId}::uuid
                AND deleted_at IS NULL AND status IN ('pending', 'abandoned')
              RETURNING id`,
        )
        if (moved.length === 0) return { kind: 'not_found' }
      }
    } else {
      const rows = await rowsOf(
        tx,
        sql`SELECT id, kind, text, rich_content, file_id, width_pct, page_position,
                   section_block_id, updated_at
              FROM page_blocks
             WHERE id = ${body.block_id}::uuid AND folder_id = ${folderId}::uuid
               AND (page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid))
             FOR UPDATE`,
      )
      const block = rows[0]
      if (block === undefined) return { kind: 'not_found' }
      if (toIso(block.updated_at) !== body.updated_at) {
        return { kind: 'stale', blockId: body.block_id }
      }

      if (body.action === 'delete_block') {
        await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${body.block_id}::uuid`)
      } else if (body.action === 'convert_paragraph_to_task') {
        const title = nullableString(block.text)?.trim() ?? ''
        if (String(block.kind) !== 'paragraph' || title.length < 1 || title.length > 300) {
          return { kind: 'not_convertible' }
        }
        const made = await createTaskIn(
          tx,
          viewerId,
          {
            title,
            folder_id: folderId,
            section_block_id: nullableString(block.section_block_id),
          },
          { pagePosition: String(block.page_position) },
        )
        if (made.kind !== 'created') {
          return made.kind === 'section_not_here'
            ? { kind: 'section_not_here' }
            : { kind: 'not_found' }
        }
        await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${body.block_id}::uuid`)
      } else {
        if (body.file_id != null) {
          const file = await rowsOf(
            tx,
            sql`SELECT f.id FROM files f
                 WHERE f.id = ${body.file_id}::uuid
                   AND f.folder_id = ${folderId}::uuid`,
          )
          if (file.length === 0) return { kind: 'file_not_here' }
        }
        // A `page` block is its sub-page's name and nothing else.
        if (String(block.kind) === 'page') return { kind: 'not_convertible' }
        if (
          body.width_pct != null &&
          !(WIDTH_BLOCK_KINDS as readonly string[]).includes(String(block.kind))
        ) {
          return { kind: 'not_convertible' }
        }
        if (String(block.kind) === 'section' && body.text !== undefined) {
          const length = body.text?.length ?? 0
          if (length < 1 || length > 120) return { kind: 'not_convertible' }
        }
        if (block.rich_content != null && body.text !== undefined && body.text !== block.text) return {kind:'stale',blockId:body.block_id}
        const sets: ReturnType<typeof sql>[] = []
        if (body.text !== undefined) sets.push(sql`text = ${body.text}`)
        if (body.file_id !== undefined) sets.push(sql`file_id = ${body.file_id}`)
        // A block given a file again has nothing missing to report.
        if (body.file_id != null) sets.push(sql`file_reclaimed_at = NULL`)
        if (body.width_pct !== undefined) sets.push(sql`width_pct = ${body.width_pct}`)
        sets.push(sql`updated_at = now()`)
        await tx.execute(
          sql`UPDATE page_blocks SET ${sql.join(sets, sql`, `)}
               WHERE id = ${body.block_id}::uuid`,
        )
      }
    }

    if (body.action !== 'insert_task' && body.action !== 'convert_paragraph_to_task') {
      const named = await rowsOf(tx, sql`SELECT name FROM folders WHERE id = ${folderId}::uuid`)
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'edited',
        subjectKind: 'folder',
        subjectId: folderId,
        subjectName: String(named[0]?.name ?? ''),
        folderId,
        detail: body.action === 'move_item' ? 'rearranged the page' : 'edited the page',
      })
    }
    return {
      kind: 'written',
      page: await pageViewIn(tx, viewerId, { folderId, shelfId: null }),
    }
  }).catch((error: unknown) => {
    if (error instanceof DocumentRefusal) {
      if (error.kind === 'stale') return {kind:'stale' as const,blockId:folderId}
      // The mismatch carries its own sentence naming both kinds.
      if (error.kind === 'file_kind_mismatch') return {kind:'file_kind_mismatch' as const,message:error.message}
      return {kind:error.kind} as const
    }
    throw error
  })
}
/** A new Facet uses its parent Page's content folder, without a second Page row.
 * Legacy-backed Facets keep using the original Page writer and receipts. */
export async function actOnIndependentFacetPage(
  db: Db,
  viewerId: string,
  pageId: string,
  facetId: string,
  body: DocumentTransaction,
): Promise<PageActionResult> {
  return inTransaction<PageActionResult>(db, async (tx) => {
    const facts = await accessOf(tx, viewerId, pageId)
    if (facts === null) return { kind: 'not_found' }
    const permission = mayPerform(facts, 'folder.section.manage')
    if (!permission.allowed) return { kind: 'forbidden', reason: permission.reason }
    const existing = await rowsOf(tx, sql`
      SELECT pf.id FROM page_facets pf
        JOIN folders p ON p.id = pf.page_id
       WHERE pf.id = ${facetId}::uuid AND pf.page_id = ${pageId}::uuid
         AND pf.content_folder_id IS NULL AND p.deleted_at IS NULL
         AND p.archived_at IS NULL
    `)
    if (!existing.length) return { kind: 'not_found' }
    if (touchesPageTree(body)) await lockPageTree(tx)
    await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${pageId}::uuid FOR UPDATE`)
    const mutation = await applyDocument(tx, viewerId, pageId, body, facetId)
    const page = await pageViewIn(tx, viewerId, {
      folderId: pageId, shelfId: null, facetId,
    })
    return { kind: 'written', page: { ...page, mutation } }
  }).catch((error: unknown) => {
    if (error instanceof DocumentRefusal) {
      if (error.kind === 'stale') return { kind: 'stale' as const, blockId: pageId }
      if (error.kind === 'file_kind_mismatch') return {
        kind: 'file_kind_mismatch' as const, message: error.message,
      }
      return { kind: error.kind } as PageActionResult
    }
    throw error
  })
}

/** A Shelf's `document_transaction`, resolved and locked in the writing transaction. Not the viewer's: not_found. */
export async function actOnShelfPage(
  db: Db,
  viewerId: string,
  shelfId: string,
  body: DocumentTransaction,
): Promise<PageView> {
  return inTransaction(db, async (tx) => {
    const shelves = await rowsOf(
      tx,
      sql`SELECT name FROM shelves
           WHERE id = ${shelfId}::uuid AND user_id = ${viewerId}::uuid FOR UPDATE`,
    )
    const shelf = shelves[0]
    if (shelf === undefined) throw new ShelfDocumentRefusal('not_found', 'Not found.')
    const name = String(shelf.name)
    const mutation = await applyShelfDocument(tx, viewerId, shelfId, name, body)
    if (!mutation.replayed) {
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'edited',
        subjectKind: 'shelf',
        subjectId: shelfId,
        subjectName: name,
        folderId: null,
        detail: 'edited the page',
      })
    }
    return { ...(await pageViewIn(tx, viewerId, { folderId: null, shelfId })), mutation }
  })
}

/** Read again on the transaction's snapshot, so the response matches what the write left. */
async function pageViewIn(
  tx: Executor,
  viewerId: string,
  home: PageHome,
): Promise<PageView> {
  const rows = await rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.position, b.page_position,
               b.section_block_id, b.list_parent_block_id, b.toggleable, b.checked,
               b.text, b.rich_content, b.file_id, b.ref_folder_id,
               b.width_pct, b.updated_at, b.file_reclaimed_at,
               f.width AS file_width, f.height AS file_height, f.name AS file_name
        FROM page_blocks b
        LEFT JOIN files f ON f.id = b.file_id
        WHERE ${homeCondition(home, viewerId)}
        ORDER BY b.page_position ASC NULLS LAST, b.position ASC, b.id ASC`,
  )
  return {
    /* A Shelf reads its own revision. */
    ...(home.folderId === null && home.shelfId !== null
      ? await shelfDocumentMetadata(tx, home.shelfId)
      : await documentMetadata(tx, home.folderId, home.facetId)),
    blocks: rows.map(blockFromRow),
    items: await pageItemsIn(tx, viewerId, home),
  }
}
