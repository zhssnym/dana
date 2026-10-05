// The shared body writer for flat pages (Task and Shelf pages). Each home keeps its own gate,
// receipt, revision and refusals. Every refusal precedes the first write; every write carries the scope column.
import { sql } from 'drizzle-orm'

import { allowedIn } from '../../shared/block-kinds.js'
import type { BlockHome } from '../../shared/block-kinds.js'
import type { DocumentOperation } from '../../shared/pages.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { nestingProblem } from './document-outline.js'
import { initialKeys } from './fractional-index.js'

export type BlockOp = Extract<DocumentOperation, { op: 'put_block' }>
export type FlatHome = Exclude<BlockHome, 'work'>

export interface FlatScope {
  column: 'task_id' | 'shelf_id'
  id: string
}

/** Builds the home's own refusal. `not_found` is 404, `invalid` the 422. */
export type Refuse = (outcome: 'not_found' | 'invalid', message: string, field?: string) => Error

export interface FlatBody {
  stored: Record<string, unknown>[]
  original: Set<string>
  blocks: Set<string>
  writes: Map<string, BlockOp>
  outline: { id: string; listParent: string | null }[]
}

export interface FlatBodyHome {
  home: FlatHome
  scope: FlatScope
  refuse: Refuse
  noTasks: string
  foreignId: string
  /** The home's reference rules, checked before anything is written. */
  audit: (body: FlatBody) => Promise<void>
  /** Runs after the blocks are written and before they are re-keyed. */
  afterWrite?: (writes: Map<string, BlockOp>) => Promise<unknown>
}

const PAGE_HERE = "A page block lives only on a folder's page."

export function refusedKindMessage(kind: string, home: BlockHome): string {
  if (kind === 'page') return PAGE_HERE
  if (kind === 'result') return 'A Result lives on the Results tab.'
  if (kind === 'folder_ref') return 'a folder reference belongs on the Folder page'
  if (kind === 'section') {
    return home === 'task' ? 'a Task document has no Sections; use a heading' : 'a facet document has no Sections'
  }
  return `A ${kind} block does not belong here.`
}

/** A file must be in this folder; elsewhere and nonexistent answer alike (10.2). */
export function folderFileAudit(tx: Executor, folderId: string, refuse: Refuse) {
  return async (body: FlatBody): Promise<void> => {
    for (const write of body.writes.values()) {
      if (write.file_id === null) continue
      const files = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM files WHERE id = ${write.file_id}::uuid AND folder_id = ${folderId}::uuid`,
      )
      if (files.length === 0) throw refuse('invalid', 'must name a file you can reach', 'file_id')
    }
  }
}

/** Applies the operations inside the caller's transaction, after the caller gated and checked receipt and revision. */
export async function applyFlatBody(
  tx: Executor,
  home: FlatBodyHome,
  operations: readonly DocumentOperation[],
): Promise<Map<string, BlockOp>> {
  const { refuse, scope } = home
  const column = sql.raw(scope.column)
  const stored = await rowsOf(
    tx,
    sql`SELECT id, kind, ref_folder_id FROM page_blocks WHERE ${column} = ${scope.id}::uuid FOR UPDATE`,
  )
  const original = new Set(stored.map((row) => String(row.id)))
  const storedKinds = new Map(stored.map((row) => [String(row.id), String(row.kind)]))
  const blocks = new Set(original)
  const writes = new Map<string, BlockOp>()
  /* Audit every id the operations mention, even ones the merge drops: a put then delete of someone else's block. */
  const named = new Set<string>()
  let items: { id: string; kind: 'block' | 'task'; section: string | null; listParent: string | null }[] = []

  for (const op of operations) {
    if (op.op === 'create_task') throw refuse('invalid', home.noTasks, 'operations')
    if (op.op === 'create_page' || op.op === 'trash_page') throw refuse('invalid', PAGE_HERE, 'operations')
    if (op.op === 'put_block') {
      if (!allowedIn(op.block_kind, home.home)) {
        throw refuse('invalid', refusedKindMessage(op.block_kind, home.home), 'operations')
      }
      writes.set(op.id, {
        ...op,
        checked: op.block_kind === 'checklist' ? (op.checked ?? false) : null,
        toggleable: op.toggleable === true ? true : null,
      })
      blocks.add(op.id)
      named.add(op.id)
      continue
    }
    if (op.op === 'delete_block') {
      if (!blocks.delete(op.id)) throw refuse('not_found', 'Block not found.')
      // A block put then deleted is checked only by the identity check below.
      writes.delete(op.id)
      named.add(op.id)
      continue
    }
    items = op.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      section: item.section_block_id,
      listParent: item.list_parent_block_id,
    }))
  }

  // Only growth past the cap is refused, so a body already over it can still shrink.
  if (blocks.size > 500 && blocks.size > original.size) {
    throw refuse('invalid', 'A page holds at most 500 blocks.', 'operations')
  }

  const seen = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'block' || !blocks.has(item.id) || seen.has(item.id)) {
      throw refuse('invalid', 'The outline has unknown or repeated identities.', 'operations')
    }
    // A shelf-homed row may carry no Section (`page_blocks_section_membership_check`).
    if (home.home === 'shelf' && item.section !== null) {
      throw refuse('invalid', 'a Shelf document has no Section membership', 'section_block_id')
    }
    seen.add(item.id)
  }
  if (seen.size !== blocks.size) {
    throw refuse('invalid', 'The outline must retain every undeleted block.', 'operations')
  }
  const nesting = nestingProblem(
    items.map((item) => ({
      kind: item.kind,
      id: item.id,
      section_block_id: null,
      list_parent_block_id: item.listParent,
    })),
    (id) => (blocks.has(id) ? (writes.get(id)?.block_kind ?? storedKinds.get(id)) : undefined),
  )
  if (nesting !== null) throw refuse('invalid', nesting, 'list_parent_block_id')

  const outline = items.map((item) => ({ id: item.id, listParent: item.listParent }))
  await home.audit({ stored, original, blocks, writes, outline })

  // Ids share one space across page_blocks and tasks: an id held elsewhere is not this home's to write.
  const foreign = [...named].filter((id) => !original.has(id))
  if (foreign.length > 0) {
    const ids = sql.join(foreign.map((id) => sql`${id}::uuid`), sql`, `)
    const clashes = await rowsOf(
      tx,
      sql`SELECT id FROM page_blocks WHERE id IN (${ids})
          UNION ALL
          SELECT id FROM tasks WHERE id IN (${ids})`,
    )
    if (clashes.length > 0) throw refuse('invalid', home.foreignId, 'operations')
  }

  // Deletions are this home's own rows minus the final set, never a set the operations built.
  for (const id of original) {
    if (!blocks.has(id)) {
      await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${id}::uuid AND ${column} = ${scope.id}::uuid`)
    }
  }
  /* A home without folder references never writes the column, so stored rows keep their value. */
  const holdsRefs = allowedIn('folder_ref', home.home)
  const refOnUpdate = holdsRefs ? sql`EXCLUDED.ref_folder_id` : sql`page_blocks.ref_folder_id`
  for (const write of writes.values()) {
    await tx.execute(
      sql`INSERT INTO page_blocks
            (id, ${column}, kind, position, text, rich_content, file_id, ref_folder_id, width_pct, checked, toggleable)
          VALUES (${write.id}::uuid, ${scope.id}::uuid, ${write.block_kind}, 0, ${write.text},
                  ${write.rich_content === null ? null : JSON.stringify(write.rich_content)}::jsonb,
                  ${write.file_id}::uuid, ${holdsRefs ? write.ref_folder_id : null}::uuid,
                  ${write.width_pct}, ${write.checked}, ${write.toggleable})
          ON CONFLICT (id) DO UPDATE
             SET kind = EXCLUDED.kind, text = EXCLUDED.text,
                 rich_content = EXCLUDED.rich_content, file_id = EXCLUDED.file_id,
                 ref_folder_id = ${refOnUpdate}, width_pct = EXCLUDED.width_pct,
                 checked = EXCLUDED.checked, toggleable = EXCLUDED.toggleable,
                 list_parent_block_id = CASE WHEN EXCLUDED.kind <> 'section'
                   THEN page_blocks.list_parent_block_id END,
                 -- Issue #267: the mark survives a same-kind rewrite with no
                 -- file and clears once the block gets a file or changes kind.
                 file_reclaimed_at = CASE
                   WHEN EXCLUDED.file_id IS NULL AND EXCLUDED.kind = page_blocks.kind
                   THEN page_blocks.file_reclaimed_at END,
                 updated_at = now()
           WHERE page_blocks.${column} = ${scope.id}::uuid`,
    )
  }
  if (home.afterWrite !== undefined) await home.afterWrite(writes)
  // `position` is rewritten too, because the legacy reader orders by it.
  const keys = initialKeys(outline.length)
  for (const [index, item] of outline.entries()) {
    await tx.execute(
      sql`UPDATE page_blocks
             SET page_position = ${keys[index] as string}, position = ${index},
                 list_parent_block_id = ${item.listParent}::uuid
           WHERE id = ${item.id}::uuid AND ${column} = ${scope.id}::uuid`,
    )
  }
  return writes
}
