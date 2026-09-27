/*
The page module: 4.17's block list under 7.16's PUT-whole contract, for
folder pages and shelf pages alike (the two differ only in which column
holds the page's home, and 4.17's CHECK keeps it exactly one).

The PUT is the page: blocks arriving with an id edit the row they name,
blocks without one insert, and stored blocks the list no longer carries are
deleted, which is how a section dies and its tasks survive (4.5's SET NULL). Concurrency is last-write-wins per block: an edit carries the
updated_at it read, and a mismatch answers 409 before anything in the
request writes, a request being one unit. An edit naming a block that no
longer exists is the same conflict wearing its endpoint state: someone
else's write removed it, and resurrecting it under the old id would be the
lost-update this rule exists to refuse.

One PUT is one mutation and one event (4.13), whatever it did to however
many blocks.

A block naming a file names one the page's own home can reach, and which
predicate that is depends on the home (issue #107, 2026-09-04). See
`fileScopeCondition` below: this is a gate written by hand, in the module that
takes the id, because nothing in this build adds one for you.

The read joins `files` for one thing only: 4.16's width and height, so that a
reader who did not upload the picture can reserve its space before the bytes
arrive (issue #27). It is a LEFT JOIN on the file's primary key, so a block
with no file, and a file stored before migration 0009, both answer null and
multiply no rows. Nothing about the write path knows these columns exist: the
shape belongs to the file and a PUT that carried it would be a second record
of one fact.
*/
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
import { mayPerform } from './folder-access.js'
import { accessOf } from './folders.js'
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

/** The composed page read. The item list carries identity and order only;
 * block payloads remain in `blocks`, while task payloads remain the
 * TaskCards returned by Q7. That keeps one task shape across every view. */
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
                     AND t.deleted_at IS NULL

                     AND EXISTS (
                       SELECT 1 FROM folders vf
                       JOIN folder_members vm ON vm.folder_id = vf.id
                      WHERE vf.id = t.folder_id
                        AND vm.user_id = ${viewerId}
                        AND vf.deleted_at IS NULL
                     )
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
  /** The blocks, by their index in the request, whose `file_id` names a file
   * this page cannot reach. Indexes rather than field names because naming a
   * field is the route's job (`http/errors.ts`), and a missing file and an
   * unreachable one are one outcome here so that the answer discloses
   * nothing either way (10.2). */
  | { kind: 'file_not_here'; blockIndexes: readonly number[] }
  | { kind: 'not_found' }
  /** Visible, and not this member's to write (issue #228). */
  | { kind: 'forbidden'; reason: string }

/*
The gate on a block's `file_id`, and it is two clauses because `page_blocks`
has two homes and `page_blocks_one_home_check` (migration 0003) keeps it to
exactly one.

**A folder-homed page scopes to its own folder**, which is `createComment`'s
`AND folder_id = $folderId` one object over. Until issue #107 there was no clause
at all and no composite foreign key either, so a member of folder A could
plant a file id from folder B and everyone in A learned that a file with that
id exists — and, since #106 put the picture's shape on the block read, what
shape it is. The bytes were never served: `serveFile` scopes independently.
Disclosure of existence, which is why this is a defect rather than an
incident.

**A shelf-homed page scopes with `readableFileScope`**, and the reasoning that
deferred #107 got this half backwards. `page_blocks.folder_id` is NULL for a
shelf page, so `AND folder_id = NULL` matches nothing at all rather than
gating anything, and it would refuse the shelf its own pictures. The predicate
`serveFile` answers with is the right one here: a shelf is private (4.18), so
in practice that is the caller's own folder-less upload, plus anything in a
folder they are a member of — the same rule `PATCH /shelves/:id` applies to a
shelf cover.

**No kind clause, unlike the three cover gates.** A cover is a picture by
definition and a `voice` note stored as one would be drawn as a broken image;
a page block's file is whatever 4.17 lets a block carry, and narrowing it here
would refuse rows this endpoint has always accepted for a reason no criterion
states. The scope is the defect; the kind is not.

A composite foreign key `(file_id, folder_id)` → `files (id, folder_id)` would
make the folder half structural rather than remembered, which is #74's whole
argument. It is a section 4 change and needs a unique index on the referenced
pair, and it cannot express the shelf half at all, so the WHERE is the fix and
the FK is priced rather than taken.
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

    /* And the Access half of the same argument (issue #228). The route gates
       before it calls, so this answers nobody today either; it is here for
       the same reason the visibility check above is, and it is the reason
       `mayPerform` is a pure function over facts rather than a middleware --
       a future non-HTTP caller reaches the same answer through the same
       door. A shelf page has no Folder and no Folder Access: it is one
       person's own page (4.18), which `homeIsVisible` has already settled. */
    if (home.folderId !== null) {
      const facts = await accessOf(tx, viewerId, home.folderId)
      if (facts === null) return { kind: 'not_found' } as const
      const decision = mayPerform(facts, 'folder.page.edit')
      if (!decision.allowed) {
        return { kind: 'forbidden', reason: decision.reason } as const
      }
    }

    /* The file gate (issue #107), before the row lock rather than after it:
       a body naming a file this page cannot reach is refused whatever the
       stored blocks say, so it never has to hold anything to be answered.
       One read for every distinct id, the way `createComment` resolves its
       attachments, and all or nothing — a request is one unit. */
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

    /* The legacy whole-page writer and #184's page actions share the same
       folder ordering domain during rolling deployment, so they share its
       lock too. Without this, a PUT could reseed the list while a drag was
       computing a key from the old sequence. Shelf pages have no tasks and
       keep their existing block-row lock. */
    if (home.folderId !== null) {
      await tx.execute(
        sql`SELECT 1 FROM folders WHERE id = ${home.folderId}::uuid FOR UPDATE`,
      )
    }

    if (home.folderId !== null) {
      const modern = await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE folder_id=${home.folderId}::uuid AND (rich_content IS NOT NULL OR (kind='section' AND section_block_id IS NOT NULL) OR kind NOT IN ('section','paragraph','image','folder_ref') OR EXISTS (SELECT 1 FROM page_document_receipts r WHERE r.folder_id=page_blocks.folder_id AND jsonb_typeof(r.created_task_ids)='array')) LIMIT 1`)
      if(modern.length) return {kind:'stale',blockId:String(modern[0]?.id)} as const
    }
    /* #221, the Shelf half of the same rule. Once a Shelf has been written
       through the document transaction, or holds a block the legacy editor
       cannot draw, the legacy whole-page writer is refused: it would read
       only the four kinds it knows and write the rest back as deletions. A
       Shelf the composer has never touched keeps the legacy PUT exactly. */
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
                  file_reclaimed_at = CASE
                    WHEN ${block.file_id ?? null}::uuid IS NULL AND kind = ${block.kind}
                    THEN file_reclaimed_at END,
                  updated_at = now()
              WHERE id = ${block.id}::uuid`,
        )
      }
    }

    /* Re-express the result after every insert, edit, delete and reorder has
       landed. Running this before the writes leaves newly inserted legacy
       blocks with a null key and preserves stale Section membership. */
    await reseedLegacyPage(tx, home)

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

/** Old PUT clients still arrange page blocks. Re-express that legacy result
 * in the composed keyspace so shelf reorder and the pre-#184 folder API keep
 * their behavior during a rolling deployment. */
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
         ORDER BY position, id`,
  )
  const tasks = await rowsOf(
    tx,
    sql`SELECT t.id, t.section_block_id
          FROM tasks t
         WHERE t.folder_id = ${home.folderId}::uuid
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
  /** #220: the file is here and it was uploaded as a different kind from the
   * one this block declares. Distinct from `file_not_here` on purpose — that
   * one must disclose nothing about a row the caller cannot reach, and this
   * one is about a row they demonstrably can. */
  | { kind: 'file_kind_mismatch'; message: string }
  | { kind: 'not_convertible' }
  | { kind: 'forbidden'; reason: string }

/** #184's narrow transactional boundary: one user gesture, one folder lock,
 * one durable mixed placement. */
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
    // A transaction that creates, trashes or re-homes a sub-page takes the
    // tree lock before the folder row (page-tree.ts's lock order).
    if (body.action === 'document_transaction' && touchesPageTree(body)) await lockPageTree(tx)
    await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`)
    if (body.action === 'document_transaction') {
      const mutation = await applyDocument(tx, viewerId, folderId, body)
      return {kind:'written',page:{...await pageViewIn(tx,viewerId,{folderId,shelfId:null}),mutation}} as const
    }
    const modern = await rowsOf(tx, sql`SELECT id FROM page_blocks WHERE folder_id=${folderId}::uuid AND (rich_content IS NOT NULL OR (kind='section' AND section_block_id IS NOT NULL) OR kind NOT IN ('section','paragraph','image','folder_ref') OR EXISTS (SELECT 1 FROM page_document_receipts r WHERE r.folder_id=page_blocks.folder_id AND jsonb_typeof(r.created_task_ids)='array')) LIMIT 1`)
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
              FROM page_blocks WHERE folder_id = ${folderId}::uuid`,
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
               WHERE id = ${body.item.id}::uuid AND folder_id = ${folderId}::uuid`,
        )
        if (blocks.length === 0) return { kind: 'not_found' }
        /* A Section is a semantic span, not one draggable row. #184's
           production canvas does not offer heading drag; accepting it here
           would move only the heading while leaving every member behind and
           make the persisted order contradict collapse. */
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
        /* 4.17's width, read off the shared constant rather than repeated as a
           literal. This said `!== 'image'` until #220's adversarial review:
           migration 0024 widened `page_blocks_width_pct_kind_check` to image
           **and** video and `WIDTH_BLOCK_KINDS` says the same for the document
           contract, so a width dragged onto a video through the incremental
           path was refused by a server whose database, whose shared constant
           and whose `document_transaction` all admitted it. It failed closed,
           which made it a gap rather than a hazard, and it existed because the
           rule was written down in three places and this was a fourth spelling
           of it. */
        // A `page` block is its sub-page's name and nothing else (wave 2).
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
        // Issue #267: a block given a file again has nothing missing to report.
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
      // #220's mismatch carries its own sentence, which names the block kind
      // and the kind the file was actually uploaded as; a generic 422 here
      // would leave the caller guessing which of the two to change.
      if (error.kind === 'file_kind_mismatch') return {kind:'file_kind_mismatch' as const,message:error.message}
      return {kind:error.kind} as const
    }
    throw error
  })
}
/**
 * #221: a Shelf's `document_transaction`. The Shelf is resolved and locked in
 * the transaction that writes, so the owner check and the write read one
 * snapshot. Refusals leave as `ShelfDocumentRefusal`; a Shelf that is not the
 * viewer's is `not_found`, never 403 (4.18, 10.2).
 */
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

/** The read again, on the transaction's own snapshot, so the response can
 * never describe blocks the write did not leave. */
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
    /* #221: a Shelf reads its own revision now, where it used to read the
       empty document's constant. Old clients never read it on a Shelf. */
    ...(home.folderId === null && home.shelfId !== null
      ? await shelfDocumentMetadata(tx, home.shelfId)
      : await documentMetadata(tx, home.folderId)),
    blocks: rows.map(blockFromRow),
    items: await pageItemsIn(tx, viewerId, home),
  }
}
