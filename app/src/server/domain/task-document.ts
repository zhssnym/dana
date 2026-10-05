// A Task's document: page_blocks homed by task_id. It refuses tasks, sections and folder_ref blocks.
// `tasks.notes` is its plain-text projection, rewritten on every write. A Task with notes but no document gets one
// lazily. A legacy notes write replaces a plain mirror, otherwise appends: it may repeat text, never drop any.
import { sql } from 'drizzle-orm'
import type {
  DocumentTransaction,
  PageBlock,
  PageView,
} from '../../shared/pages.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash, hashableBlocks } from './document-hash.js'
import { applyFlatBody, folderFileAudit } from './document-body.js'
import type { Refuse } from './document-body.js'
import { fileReclaimedAt } from './document-outline.js'
import { initialKeys, keyBetween } from './fractional-index.js'
import { syncMentions } from './mentions.js'

/** Ceilings in code points, which is what Postgres's `char_length` counts. */
const PARAGRAPH_MAX = 4000
const NOTES_MAX = 10000

/**
 * A note as paragraph texts, matching migration 0031. Up to 4000 characters is one paragraph; a longer note
 * is cut at the last line break in each window, so `texts.join('\n') === notes`.
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

/** `tasks.notes` after a write. Checklist items are skipped: they are the task's subtasks. */
export function notesProjection(
  blocks: readonly { readonly kind?: unknown; readonly text?: unknown }[],
): string | null {
  const joined = blocks
    .filter((block) => block.kind !== 'checklist')
    .map((block) => str(block.text))
    .filter((text): text is string => text !== null)
    .join('\n')
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

/** The Task id is hashed in: a mutation id reused across two documents of one folder must read as `stale`. */
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
  // `position` carries the order to `relayout`; these rows share one `updated_at` and would sort by random id.
  for (const [index, text] of texts.entries()) {
    await tx.execute(
      sql`INSERT INTO page_blocks (task_id, kind, position, text)
          VALUES (${taskId}::uuid, 'paragraph', ${index}, ${text})`,
    )
  }
}

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

/** Gives a Task with notes and no document its document. The caller holds the Task row FOR UPDATE. Idempotent. */
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

export async function needsMaterializing(tx: Executor, taskId: string): Promise<boolean> {
  const rows = await rowsOf(
    tx,
    sql`SELECT (t.notes IS NOT NULL AND t.notes <> ''
                AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = t.id)) AS needed
          FROM tasks t WHERE t.id = ${taskId}::uuid`,
  )
  return rows[0]?.needed === true
}

/** A legacy `notes` write, under the Task row's lock. Returns what the `notes` column should hold. */
export async function legacyNotesWrite(
  tx: Executor,
  taskId: string,
  next: string | null,
): Promise<string | null> {
  const rows = await rowsOf(tx, sql`SELECT notes FROM tasks WHERE id = ${taskId}::uuid`)
  const storedText = str(rows[0]?.notes) ?? ''
  const nextText = next ?? ''
  const blocks = await blockRows(tx, taskId)
  // No document yet: it is made from `notes` when first asked for.
  if (blocks.length === 0) return next
  if (nextText === storedText) return next
  const texts = blocks.map((b) => str(b.text))
  // Replace only when `notes` holds every character of the document: plain paragraphs whose uncut text fits.
  // A longer document's `notes` is cut, so replacing would erase the tail.
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
  return notesProjection([
    ...blocks,
    ...notesParagraphs(added).map((text) => ({ kind: 'paragraph', text })),
  ])
}

/** Copies a Task's document onto another. `mapFile` rewrites media files for a copy into another folder. */
export async function copyTaskDocument(
  tx: Executor,
  fromTaskId: string,
  toTaskId: string,
  mapFile?: (fileId: string) => Promise<string | null>,
  options: { readonly uncheck?: boolean } = {},
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
                  ${row.checked === null || row.checked === undefined ? null : options.uncheck === true ? false : Boolean(row.checked)},
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

export class ChecklistCapRefusal extends Error {
  constructor() {
    super('A task holds at most 500 blocks, its notes and checklist items together.')
    this.name = 'ChecklistCapRefusal'
  }
}

/**
 * Appends checklist items after the last block, then rewrites `notes`. Materializes notes first so they are not lost.
 * The caller holds the Task row. Throws `ChecklistCapRefusal` before writing when the body would pass 500 blocks.
 */
export async function appendChecklist(
  tx: Executor,
  taskId: string,
  items: readonly { readonly title: string; readonly done?: boolean }[],
): Promise<void> {
  if (items.length === 0) return
  await materializeNotesLocked(tx, taskId)
  const existing = await blockRows(tx, taskId)
  const keyed = existing.filter((row) => row.page_position !== null && row.page_position !== undefined)
  if (keyed.length !== existing.length) await relayout(tx, taskId)
  const current = keyed.length === existing.length ? existing : await blockRows(tx, taskId)
  if (current.length + items.length > 500) throw new ChecklistCapRefusal()
  let last = current.length === 0 ? null : str(current[current.length - 1]?.page_position)
  let position = current.reduce((max, row) => Math.max(max, Number(row.position)), -1)
  for (const item of items) {
    last = keyBetween(last, null)
    position += 1
    await tx.execute(
      sql`INSERT INTO page_blocks (task_id, kind, position, page_position, text, checked)
          VALUES (${taskId}::uuid, 'checklist', ${position}, ${last}, ${item.title}, ${item.done === true})`,
    )
  }
  await tx.execute(
    sql`UPDATE tasks SET notes = ${notesProjection(await blockRows(tx, taskId))}
         WHERE id = ${taskId}::uuid`,
  )
}

/** Checklist items in reader order: 7.6's `steps`, a read-only projection. `position` is the index. */
export async function taskChecklist(
  executor: Executor,
  taskId: string,
): Promise<{ id: string; title: string; done: boolean; position: number }[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT id, text, checked FROM page_blocks
         WHERE task_id = ${taskId}::uuid AND kind = 'checklist'
         ORDER BY page_position ASC NULLS LAST, position, updated_at, id`,
  )
  return found.map((row, index) => ({
    id: String(row.id),
    title: str(row.text) ?? '',
    done: row.checked === true,
    position: index,
  }))
}

/** JSON with sorted keys: jsonb comes back in its own key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner,
  )
}

/**
 * Whether a transaction only ticks or unticks existing checklist items. `step.toggle` admits this when `task.edit`
 * is refused. Rich content counts as unchanged when equal, or when stored as none and sent as plain runs.
 */
export async function isChecklistTickOnly(
  tx: Executor,
  taskId: string,
  body: DocumentTransaction,
): Promise<boolean> {
  return (await checklistTicks(tx, taskId, body)) !== null
}

export interface ChecklistTick {
  readonly text: string
  readonly checked: boolean
}

/** The ticks a tick-only transaction changes, in order, or null when it does anything else. */
export async function checklistTicks(
  tx: Executor,
  taskId: string,
  body: DocumentTransaction,
): Promise<ChecklistTick[] | null> {
  const stored = await blockRows(tx, taskId)
  const ticks: ChecklistTick[] = []
  const byId = new Map(stored.map((row) => [String(row.id), row]))
  let outlines = 0
  for (const op of body.operations) {
    if (op.op === 'set_outline') {
      outlines += 1
      const current = stored.map((row) => ({
        kind: 'block',
        id: String(row.id),
        section_block_id: null,
        list_parent_block_id: str(row.list_parent_block_id),
      }))
      const sent = op.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        section_block_id: item.section_block_id,
        list_parent_block_id: item.list_parent_block_id,
      }))
      if (JSON.stringify(sent) !== JSON.stringify(current)) return null
      continue
    }
    if (op.op !== 'put_block' || op.block_kind !== 'checklist') return null
    const row = byId.get(op.id)
    if (row === undefined || row.kind !== 'checklist') return null
    if (str(row.text) !== op.text) return null
    if (str(row.file_id) !== op.file_id || op.ref_folder_id !== null) return null
    if ((row.width_pct ?? null) !== op.width_pct) return null
    if ((op.toggleable ?? null) !== null) return null
    const rich = (row.rich_content ?? null) as unknown
    const sameRich =
      canonical(rich) === canonical(op.rich_content) ||
      (rich === null &&
        (op.rich_content === null ||
          op.rich_content.runs.every((run) => Object.keys(run).length === 1) &&
            op.rich_content.runs.map((run) => run.text).join('') === op.text))
    if (!sameRich) return null
    // `applyFlatBody` stores a missing tick as false, so null is an untick.
    const was = row.checked === true
    const next = op.checked ?? false
    if (next !== was) ticks.push({ text: op.text ?? '', checked: next })
  }
  return outlines === 1 ? ticks : null
}

/** `stale` is 409, `not_found` 404, `forbidden` 403 and `invalid` the 422 naming `field`. */
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
 * 7.16's document transaction over one Task's blocks. The caller has gated, holds the folder then the Task row
 * FOR UPDATE, and passes the Task's current folder.
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

  const refuse: Refuse = (outcome, message, field) => new TaskDocumentRefusal(outcome, message, field)
  await applyFlatBody(
    tx,
    {
      home: 'task',
      scope: { column: 'task_id', id: taskId },
      refuse,
      noTasks: 'a Task document holds no Tasks; use a checklist',
      foreignId:
        "names a block this Task does not hold; an identity that already exists elsewhere is not this Task's to write",
      audit: folderFileAudit(tx, folderId, refuse),
      afterWrite: (writes) => syncMentions(tx, { pageFolderId: folderId, actorId: viewerId, blockIds: writes.keys(), refuse: (m) => refuse('invalid', m, 'rich_content') }),
    },
    body.operations,
  )
  await tx.execute(
    sql`UPDATE tasks SET notes = ${notesProjection(await blockRows(tx, taskId))}, updated_at = now()
         WHERE id = ${taskId}::uuid`,
  )
  const committed = await revisionOf(tx, taskId)
  // An object, not an array: pages.ts reads an array-valued folder receipt as "the Folder page uses
  // the document path" and shuts the legacy block writer. This receipt says nothing about the Folder page.
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
