/*
A Task's document (issue #221, the Task half of M1-B4).

**Storage.** 4.17's `page_blocks`, homed by `task_id` (migration 0031), the
same store a Folder page, a Shelf page and a facet document use. The write
contract is 7.16's document transaction, unchanged, over the Task's own
blocks; the read is 7.16's `PageView` with an always-empty `task_placements`,
because a Task document holds no Task rows (#221: "do not nest Task rows
inside Task content").

**What a Task document refuses that a Folder page admits**: `create_task`, a
`section` block (Sections are Main's; a Task document uses heading1-3), a
and a `folder_ref` block. Since migration 0038 a Task document nests blocks
like every other home (`document-outline.ts`).

**`notes` and the document, and why nothing is lost between them.** The
deployed client edits `tasks.notes` as one string, so both stay:

- The document is authoritative once it exists, and `tasks.notes` is its
  plain-text projection: every text-bearing block's text, in document order,
  joined with '\n', cut to the column's 10000 characters. Every document write
  rewrites it, so search, cards and the deployed textarea keep reading text.
- A Task with notes and no document (created by a path that writes only
  `notes`: the deployed client's POST, a workflow import, the sample) is given
  one, lazily and under the Task row's lock, the first time its document is
  read or written. `notesParagraphs` is the one conversion; migration 0031's
  backfill runs the same algorithm in SQL.
- A legacy `notes` write (PATCH /tasks/:id) against a Task that has a
  document is `legacyNotesWrite` below. If the document is still a plain
  mirror of `notes` (only paragraphs, no rich content, no files, and its
  whole text, uncut, fits the 10000-character column, so `notes` holds every
  character of it) the write replaces it. Otherwise
  the document keeps every block and the written text is **appended** as new
  paragraphs -- only the part after the stored notes when the write extends
  them, the whole text otherwise. Appending can repeat text; it can never drop
  any, which is the rule.
*/
import { sql } from 'drizzle-orm'
import type {
  DocumentOperation,
  DocumentTransaction,
  PageBlock,
  PageView,
} from '../../shared/pages.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash, hashableBlocks } from './document-hash.js'
import { nestingProblem } from './document-outline.js'
import { fileReclaimedAt } from './pages.js'
import { initialKeys } from './fractional-index.js'

/** 4.17's paragraph ceiling and 4.5's notes ceiling, in code points, which is
 * what Postgres's `char_length` counts. */
const PARAGRAPH_MAX = 4000
const NOTES_MAX = 10000

/**
 * A note as paragraph texts, exactly as migration 0031 converts it.
 *
 * A note of up to 4000 characters is one paragraph whose text is the note,
 * line breaks included as hard breaks. A longer one is cut at the last line
 * break inside each 4000-character window, and that break becomes the
 * boundary, so `texts.join('\n') === notes`. Only a single line over 4000
 * characters is cut mid-line.
 */
export function notesParagraphs(notes: string): string[] {
  let rest = Array.from(notes)
  const pieces: string[] = []
  for (;;) {
    if (rest.length <= PARAGRAPH_MAX) {
      pieces.push(rest.join(''))
      return pieces
    }
    const cut = rest.slice(0, PARAGRAPH_MAX + 1).lastIndexOf('\n')
    if (cut >= 0) {
      pieces.push(rest.slice(0, cut).join(''))
      rest = rest.slice(cut + 1)
    } else {
      pieces.push(rest.slice(0, PARAGRAPH_MAX).join(''))
      rest = rest.slice(PARAGRAPH_MAX)
    }
  }
}

/** The plain-text projection of a document: `tasks.notes` after a write. */
export function notesProjection(texts: readonly (string | null)[]): string | null {
  const joined = texts.filter((text): text is string => text !== null).join('\n')
  if (joined === '') return null
  const points = Array.from(joined)
  return points.length <= NOTES_MAX ? joined : points.slice(0, NOTES_MAX).join('')
}

async function blockRows(tx: Executor, taskId: string) {
  return rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.position, b.page_position, b.checked,
               b.list_parent_block_id, b.toggleable, b.rich_content, b.text, b.file_id,
               b.width_pct, b.updated_at, b.file_reclaimed_at,
               f.width AS file_width, f.height AS file_height, f.name AS file_name
          FROM page_blocks b
          LEFT JOIN files f ON f.id = b.file_id
         WHERE b.task_id = ${taskId}::uuid
         ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
  )
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function blockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    page_position: str(row.page_position),
    section_block_id: null,
    list_parent_block_id: str(row.list_parent_block_id),
    toggleable: row.toggleable === true ? true : null,
    checked: row.checked === null || row.checked === undefined ? null : Boolean(row.checked),
    rich_content: (row.rich_content ?? null) as PageBlock['rich_content'],
    text: str(row.text),
    file_id: str(row.file_id),
    file_width: row.file_width === null || row.file_width === undefined ? null : Number(row.file_width),
    file_height: row.file_height === null || row.file_height === undefined ? null : Number(row.file_height),
    file_reclaimed_at: fileReclaimedAt(row),
    file_name: row.file_name === null || row.file_name === undefined ? null : String(row.file_name),
    ref_folder_id: null,
    width_pct: row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(String(row.updated_at)).toISOString(),
  }
}

/** The revision. The Task id is inside the hash for the facet's reason: the
 * receipts table is keyed (actor, folder, mutation), so a mutation id reused
 * across two documents of one folder must read as `stale`, never `replayed`. */
async function revisionOf(tx: Executor, taskId: string): Promise<string> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT id, kind, text, rich_content, file_id, width_pct, checked,
               list_parent_block_id, page_position, position, toggleable
          FROM page_blocks WHERE task_id = ${taskId}::uuid ORDER BY id`,
  )
  return documentHash({ task: taskId, blocks: hashableBlocks(blocks), tasks: [] })
}

/** The read, for a caller that has already gated and holds a transaction. */
export async function taskDocumentViewIn(tx: Executor, taskId: string): Promise<PageView> {
  const rows = await blockRows(tx, taskId)
  return {
    revision: await revisionOf(tx, taskId),
    task_placements: [],
    blocks: rows.map(blockFromRow),
    items: rows.map((row) => ({ kind: 'block' as const, id: String(row.id) })),
  }
}

async function appendParagraphs(
  tx: Executor,
  taskId: string,
  texts: readonly string[],
): Promise<void> {
  if (texts.length === 0) return
  // `position` carries the order to `relayout`: these rows have no
  // page_position yet and share one `updated_at`, so without it they would be
  // ordered by their random ids.
  for (const [index, text] of texts.entries()) {
    await tx.execute(
      sql`INSERT INTO page_blocks (task_id, kind, position, text)
          VALUES (${taskId}::uuid, 'paragraph', ${index}, ${text})`,
    )
  }
}

/** Re-keys the whole document in its current order after an insert. */
async function relayout(tx: Executor, taskId: string): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM page_blocks WHERE task_id = ${taskId}::uuid
         ORDER BY page_position ASC NULLS LAST, position, updated_at, id`,
  )
  const keys = initialKeys(rows.length)
  for (const [index, row] of rows.entries()) {
    await tx.execute(
      sql`UPDATE page_blocks SET page_position = ${keys[index] as string}, position = ${index}
           WHERE id = ${String(row.id)}::uuid AND task_id = ${taskId}::uuid`,
    )
  }
}

/**
 * Gives a Task with notes and no document its document. **The caller holds
 * the Task row `FOR UPDATE`**, which is what keeps two first reads from
 * writing the paragraphs twice. Idempotent: a Task with any block, or with no
 * notes, is left alone.
 */
export async function materializeNotesLocked(tx: Executor, taskId: string): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT t.notes,
               EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = t.id) AS has_document
          FROM tasks t WHERE t.id = ${taskId}::uuid`,
  )
  const row = rows[0]
  if (row === undefined || row.has_document === true) return
  const notes = str(row.notes)
  if (notes === null || notes === '') return
  await appendParagraphs(tx, taskId, notesParagraphs(notes))
  await relayout(tx, taskId)
}

/** Whether the read path must take the Task row lock to materialize. */
export async function needsMaterializing(tx: Executor, taskId: string): Promise<boolean> {
  const rows = await rowsOf(
    tx,
    sql`SELECT (t.notes IS NOT NULL AND t.notes <> ''
                AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = t.id)) AS needed
          FROM tasks t WHERE t.id = ${taskId}::uuid`,
  )
  return rows[0]?.needed === true
}

/**
 * A legacy `notes` write against a Task, called by PATCH /tasks/:id before it
 * writes the row and **under the Task row's lock**. Returns the value the
 * `notes` column is to hold. See the header for the rule.
 */
export async function legacyNotesWrite(
  tx: Executor,
  taskId: string,
  next: string | null,
): Promise<string | null> {
  const rows = await rowsOf(tx, sql`SELECT notes FROM tasks WHERE id = ${taskId}::uuid`)
  const storedText = str(rows[0]?.notes) ?? ''
  const nextText = next ?? ''
  const blocks = await blockRows(tx, taskId)
  // No document yet: `notes` is still the only home, and the document is
  // made from it when it is first asked for.
  if (blocks.length === 0) return next
  if (nextText === storedText) return next
  const texts = blocks.map((b) => str(b.text))
  // Replaceable only when `notes` holds every character of the document: all
  // plain paragraphs whose UNCUT text fits the column. A longer document's
  // `notes` is a cut projection, so replacing it would erase the tail; and a
  // short plain document whose text differs from `notes` is one the deploy
  // overlap left behind (the old server wrote `notes` alone), so `notes` is
  // the newer copy and replacing loses nothing.
  const plainMirror =
    blocks.every(
      (b) =>
        b.kind === 'paragraph' &&
        (b.rich_content === null || b.rich_content === undefined) &&
        (b.file_id === null || b.file_id === undefined) &&
        (b.list_parent_block_id === null || b.list_parent_block_id === undefined),
    ) &&
    Array.from(texts.filter((text): text is string => text !== null).join('\n')).length <= NOTES_MAX
  if (plainMirror) {
    await tx.execute(sql`DELETE FROM page_blocks WHERE task_id = ${taskId}::uuid`)
    if (nextText !== '') {
      await appendParagraphs(tx, taskId, notesParagraphs(nextText))
      await relayout(tx, taskId)
    }
    return next
  }
  let added = nextText.startsWith(storedText) ? nextText.slice(storedText.length) : nextText
  if (added.startsWith('\n')) added = added.slice(1)
  if (added === '') return str(rows[0]?.notes)
  await appendParagraphs(tx, taskId, notesParagraphs(added))
  await relayout(tx, taskId)
  return notesProjection([...texts, ...notesParagraphs(added)])
}

/**
 * Copies one Task's document onto another (duplicate, the folder duplicate,
 * recurrence). `mapFile` rewrites a media block's file for a copy that lands
 * in another folder; without it the copy names the same file, which is right
 * inside one folder (a file read twice is one row, as the folder duplicate
 * already does for a picture placed twice).
 */
export async function copyTaskDocument(
  tx: Executor,
  fromTaskId: string,
  toTaskId: string,
  mapFile?: (fileId: string) => Promise<string | null>,
): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, kind, position, page_position, text, rich_content, file_id,
               width_pct, checked, list_parent_block_id, toggleable
          FROM page_blocks WHERE task_id = ${fromTaskId}::uuid
         ORDER BY page_position ASC NULLS LAST, position, updated_at, id`,
  )
  if (rows.length === 0) return
  const ids = new Map<string, string>()
  for (const row of rows) {
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO page_blocks
            (task_id, kind, position, page_position, text, rich_content, file_id, width_pct, checked, toggleable)
          VALUES (${toTaskId}::uuid, ${String(row.kind)}, ${Number(row.position)},
                  ${str(row.page_position)}, ${str(row.text)},
                  ${row.rich_content === null || row.rich_content === undefined ? null : JSON.stringify(row.rich_content)}::jsonb,
                  ${row.file_id === null || row.file_id === undefined ? null : mapFile === undefined ? String(row.file_id) : await mapFile(String(row.file_id))}::uuid,
                  ${row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct)},
                  ${row.checked === null || row.checked === undefined ? null : Boolean(row.checked)},
                  ${row.toggleable === true ? true : null})
          RETURNING id`,
    )
    ids.set(String(row.id), String(inserted[0]?.id))
  }
  for (const row of rows) {
    if (row.list_parent_block_id === null || row.list_parent_block_id === undefined) continue
    await tx.execute(
      sql`UPDATE page_blocks SET list_parent_block_id = ${ids.get(String(row.list_parent_block_id)) ?? null}::uuid
           WHERE id = ${ids.get(String(row.id)) as string}::uuid`,
    )
  }
}

/** A refusal from the Task document applier: `stale` is 409, `not_found`
 * 404, `forbidden` 403 and `invalid` the 422 naming `field`. */
export class TaskDocumentRefusal extends Error {
  constructor(
    readonly outcome: 'stale' | 'not_found' | 'invalid' | 'forbidden',
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

/**
 * 7.16's document transaction over one Task's blocks. **The caller has
 * gated, holds the folder then the Task row `FOR UPDATE`, and passes the
 * Task's current folder** (the receipt key and the file scope). This is the
 * facet applier's shape (`domain/facets.ts`), including the three defences
 * its adversarial review added: the scope check reads every id the operations
 * name, deletions are derived from the Task's own rows, and every statement
 * that writes carries `AND task_id`.
 */
export async function applyTaskDocumentLocked(
  tx: Executor,
  viewerId: string,
  folderId: string,
  taskId: string,
  body: DocumentTransaction,
): Promise<{ view: PageView; changed: boolean }> {
  await materializeNotesLocked(tx, taskId)
  const hash = documentHash({ task: taskId, body })
  const receipts = await rowsOf(
    tx,
    sql`SELECT payload_hash, committed_revision FROM page_document_receipts
         WHERE actor_id = ${viewerId}::uuid AND folder_id = ${folderId}::uuid
           AND mutation_id = ${body.mutation_id}::uuid`,
  )
  const receipt = receipts[0]
  if (receipt !== undefined) {
    if (receipt.payload_hash !== hash) {
      throw new TaskDocumentRefusal('stale', 'This retry identity already belongs to a different edit.')
    }
    const replayed = await taskDocumentViewIn(tx, taskId)
    return {
      changed: false,
      view: {
        ...replayed,
        mutation: {
          mutation_id: body.mutation_id,
          committed_revision: String(receipt.committed_revision),
          replayed: true,
          created_task_ids: [],
        },
      },
    }
  }
  if ((await revisionOf(tx, taskId)) !== body.base_revision) {
    throw new TaskDocumentRefusal(
      'stale',
      'The page changed. Your draft is retained; reconcile it with the current page.',
    )
  }

  const stored = await rowsOf(
    tx,
    sql`SELECT id, kind FROM page_blocks WHERE task_id = ${taskId}::uuid FOR UPDATE`,
  )
  const original = new Set(stored.map((row) => String(row.id)))
  const storedKinds = new Map(stored.map((row) => [String(row.id), String(row.kind)]))
  const blocks = new Set(original)
  const writes = new Map<string, Extract<DocumentOperation, { op: 'put_block' }>>()
  const named = new Set<string>()
  let outline: { id: string; kind: 'block' | 'task'; listParent: string | null }[] = []

  for (const op of body.operations) {
    if (op.op === 'create_task') {
      throw new TaskDocumentRefusal('invalid', 'a Task document holds no Tasks; use Steps', 'operations')
    }
    if (op.op === 'put_block') {
      if (op.block_kind === 'section') {
        throw new TaskDocumentRefusal('invalid', 'a Task document has no Sections; use a heading', 'operations')
      }
      if (op.block_kind === 'folder_ref') {
        throw new TaskDocumentRefusal('invalid', 'a folder reference belongs on the Folder page', 'operations')
      }
      writes.set(op.id, op)
      blocks.add(op.id)
      named.add(op.id)
      continue
    }
    if (op.op === 'delete_block') {
      if (!blocks.delete(op.id)) throw new TaskDocumentRefusal('not_found', 'Block not found.')
      named.add(op.id)
      continue
    }
    outline = op.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      listParent: item.list_parent_block_id,
    }))
  }

  if (blocks.size > 500) {
    throw new TaskDocumentRefusal('invalid', 'A page holds at most 500 blocks.', 'operations')
  }
  const seen = new Set<string>()
  for (const item of outline) {
    if (item.kind !== 'block' || !blocks.has(item.id) || seen.has(item.id)) {
      throw new TaskDocumentRefusal('invalid', 'The outline has unknown or repeated identities.', 'operations')
    }
    seen.add(item.id)
  }
  if (seen.size !== blocks.size) {
    throw new TaskDocumentRefusal('invalid', 'The outline must retain every undeleted block.', 'operations')
  }
  // Block nesting (0038), the rule every document home shares.
  const nesting = nestingProblem(
    outline.map((item) => ({
      kind: item.kind,
      id: item.id,
      section_block_id: null,
      list_parent_block_id: item.listParent,
    })),
    (id) => (blocks.has(id) ? (writes.get(id)?.block_kind ?? storedKinds.get(id)) : undefined),
  )
  if (nesting !== null) {
    throw new TaskDocumentRefusal('invalid', nesting, 'list_parent_block_id')
  }

  // A file must be in the Task's folder; elsewhere and nonexistent answer
  // alike (10.2). Asked of the blocks this transaction writes only.
  for (const write of writes.values()) {
    if (write.file_id === null) continue
    const files = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM files WHERE id = ${write.file_id}::uuid AND folder_id = ${folderId}::uuid`,
    )
    if (files.length === 0) {
      throw new TaskDocumentRefusal('invalid', 'must name a file you can reach', 'file_id')
    }
  }

  // An id this Task does not hold that exists anywhere else is not its to
  // write (the facet applier's scope check, for the same attack).
  const foreign = [...named].filter((id) => !original.has(id))
  if (foreign.length > 0) {
    const ids = sql.join(foreign.map((id) => sql`${id}::uuid`), sql`, `)
    const clashes = await rowsOf(
      tx,
      sql`SELECT id FROM page_blocks WHERE id IN (${ids})
          UNION ALL
          SELECT id FROM tasks WHERE id IN (${ids})`,
    )
    if (clashes.length > 0) {
      throw new TaskDocumentRefusal(
        'invalid',
        "names a block this Task does not hold; an identity that already exists elsewhere is not this Task's to write",
        'operations',
      )
    }
  }

  const removed = [...original].filter((id) => !blocks.has(id))
  for (const id of [...writes.keys()]) if (!blocks.has(id)) writes.delete(id)
  for (const id of removed) {
    await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${id}::uuid AND task_id = ${taskId}::uuid`)
  }
  for (const write of writes.values()) {
    await tx.execute(
      sql`INSERT INTO page_blocks
            (id, task_id, kind, position, text, rich_content, file_id, width_pct, checked, toggleable)
          VALUES (${write.id}::uuid, ${taskId}::uuid, ${write.block_kind}, 0,
                  ${write.text},
                  ${write.rich_content === null ? null : JSON.stringify(write.rich_content)}::jsonb,
                  ${write.file_id}::uuid, ${write.width_pct},
                  ${write.block_kind === 'checklist' ? (write.checked ?? false) : null},
                  ${write.toggleable === true ? true : null})
          ON CONFLICT (id) DO UPDATE
             SET kind = EXCLUDED.kind, text = EXCLUDED.text,
                 rich_content = EXCLUDED.rich_content,
                 file_id = EXCLUDED.file_id, width_pct = EXCLUDED.width_pct,
                 checked = EXCLUDED.checked, toggleable = EXCLUDED.toggleable,
                 -- Issue #267's rule, as in every other block writer: the
                 -- mark survives a same-kind rewrite with no file and clears
                 -- once the block gets a file or changes kind.
                 file_reclaimed_at = CASE
                   WHEN EXCLUDED.file_id IS NULL AND EXCLUDED.kind = page_blocks.kind
                   THEN page_blocks.file_reclaimed_at END,
                 updated_at = now()
           WHERE page_blocks.task_id = ${taskId}::uuid`,
    )
  }
  const keys = initialKeys(outline.length)
  for (const [index, item] of outline.entries()) {
    await tx.execute(
      sql`UPDATE page_blocks
             SET page_position = ${keys[index] as string}, position = ${index},
                 list_parent_block_id = ${item.listParent}::uuid
           WHERE id = ${item.id}::uuid AND task_id = ${taskId}::uuid`,
    )
  }

  const texts = (await blockRows(tx, taskId)).map((row) => str(row.text))
  await tx.execute(
    sql`UPDATE tasks SET notes = ${notesProjection(texts)}, updated_at = now()
         WHERE id = ${taskId}::uuid`,
  )
  const committed = await revisionOf(tx, taskId)
  // `created_task_ids` holds an object, not an array, on a Task document's
  // receipt. pages.ts reads an array-valued receipt on a folder as "the
  // Folder page itself is on the document path" and shuts the deployed
  // client's legacy block writer; a Task document's write says nothing about
  // the Folder page, so its receipt must not count (no scope column exists).
  await tx.execute(
    sql`INSERT INTO page_document_receipts
          (actor_id, folder_id, mutation_id, payload_hash, committed_revision, created_task_ids)
        VALUES (${viewerId}::uuid, ${folderId}::uuid, ${body.mutation_id}::uuid,
                ${hash}, ${committed}, ${JSON.stringify({ task_id: taskId })}::jsonb)`,
  )
  const view = await taskDocumentViewIn(tx, taskId)
  return {
    changed: true,
    view: {
      ...view,
      mutation: {
        mutation_id: body.mutation_id,
        committed_revision: committed,
        replayed: false,
        created_task_ids: [],
      },
    },
  }
}
