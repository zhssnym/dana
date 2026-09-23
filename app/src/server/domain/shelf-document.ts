/*
The Shelf document (issue #221, Shelf half): 7.16's `document_transaction`
over a Shelf's own `page_blocks`, so the BlockNote composer writes a Shelf
through the same wire contract, revision token and conflict answer as the
Folder canvas and a facet page.

**Nothing moved to get here.** A Shelf's content has always been
`page_blocks` rows keyed by `shelf_id`, ordered by `page_position` (0016), and
its Folder rows are `folder_ref` blocks in that same list. So the document is
those rows read in place: existing content and its order are the first
revision, and no row is converted, copied or re-keyed.

A **sibling** of `page-document.ts`'s `applyDocument` rather than a third home
threaded through it, on the argument `domain/facets.ts` makes for the facet
applier: the folder applier carries Tasks, Sections and a folder file scope a
Shelf has none of. What is here is the subset a Shelf admits, with the
refusals named:

- `create_task` is refused: a Shelf holds no Task rows.
- An outline item with a `section_block_id` is refused: a shelf-homed row may
  not carry one (`page_blocks_section_membership_check`). A `section` block is
  admitted, flat, which is exactly what the legacy Shelf editor has always
  stored.
- An outline item with a `list_parent_block_id` is refused:
  `page_blocks_list_parent_kind_check` admits one only on a folder or facet
  home, and widening it is a `page_blocks` change this issue does not need.

**A Folder row is a `folder_ref` block naming the folder**, which is how the
legacy Shelf editor already stores it (`lib/shelf-layout.ts`). The Folder's
membership of the Shelf stays where it has always lived,
`folder_members.shelf_name`; the block is placement only. So a written
`folder_ref` must name a live folder the viewer is a member of **and has on
this Shelf**, and at most one block may place any one folder. A stored
`folder_ref` whose folder has since left the Shelf is not audited (the rule
`page-document.ts` settled for #220: a write audits what it writes), and a
reader drops it exactly as the legacy screen does.
*/
import { sql } from 'drizzle-orm'

import type { DocumentOperation, DocumentTransaction } from '../../shared/pages.js'
import { BLOCK_FILE_KINDS, isMediaKind } from '../../shared/page-document.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash } from './document-hash.js'
import { readableFileScope } from './files.js'
import { initialKeys } from './fractional-index.js'

type BlockOp = Extract<DocumentOperation, { op: 'put_block' }>

/** Why a Shelf document transaction was refused. `stale` is 7.16's 409,
 * `not_found` its 404, `invalid` the 422 the route addresses at `field`. */
export class ShelfDocumentRefusal extends Error {
  constructor(
    readonly outcome: 'stale' | 'not_found' | 'invalid',
    message: string,
    readonly field: string = 'operations',
  ) {
    super(message)
  }
}

/** The Shelf's revision. The Shelf id is inside the hash so that two Shelves
 * with identical content never share a token. */
export async function shelfDocumentMetadata(
  tx: Executor,
  shelfId: string,
): Promise<{ revision: string; task_placements: [] }> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT id, kind, text, rich_content, file_id, ref_folder_id, width_pct,
               checked, page_position, position
          FROM page_blocks WHERE shelf_id = ${shelfId}::uuid ORDER BY id`,
  )
  return { revision: documentHash({ shelf: shelfId, blocks }), task_placements: [] }
}

export interface ShelfMutation {
  mutation_id: string
  committed_revision: string
  replayed: boolean
  created_task_ids: string[]
}

/**
 * Applies one transaction to a Shelf the caller has already resolved as the
 * viewer's own, inside the caller's transaction and after the caller has
 * locked the `shelves` row. Every refusal precedes the first write.
 */
export async function applyShelfDocument(
  tx: Executor,
  viewerId: string,
  shelfId: string,
  shelfName: string,
  body: DocumentTransaction,
): Promise<ShelfMutation> {
  const hash = documentHash({ shelf: shelfId, body })
  const receipts = await rowsOf(
    tx,
    sql`SELECT payload_hash, committed_revision FROM shelf_document_receipts
         WHERE shelf_id = ${shelfId}::uuid AND mutation_id = ${body.mutation_id}::uuid`,
  )
  const receipt = receipts[0]
  if (receipt !== undefined) {
    if (receipt.payload_hash !== hash) {
      throw new ShelfDocumentRefusal('stale', 'This retry identity already belongs to a different edit.')
    }
    return {
      mutation_id: body.mutation_id,
      committed_revision: String(receipt.committed_revision),
      replayed: true,
      created_task_ids: [],
    }
  }

  const before = await shelfDocumentMetadata(tx, shelfId)
  if (before.revision !== body.base_revision) {
    throw new ShelfDocumentRefusal(
      'stale',
      'The page changed. Your draft is retained; reconcile it with the current page.',
    )
  }

  const stored = await rowsOf(
    tx,
    sql`SELECT id, kind, ref_folder_id FROM page_blocks
         WHERE shelf_id = ${shelfId}::uuid FOR UPDATE`,
  )
  const original = new Set(stored.map((row) => String(row.id)))
  const blocks = new Set(original)
  const refOf = new Map(
    stored.map((row) => [String(row.id), row.ref_folder_id == null ? null : String(row.ref_folder_id)]),
  )
  const writes = new Map<string, BlockOp>()
  /* Every id the operations mention, audited against the rest of Dana below
     whether or not it survives the merge -- the hole the adversarial review of
     16ce81b found in the facet applier, closed here the same way. */
  const named = new Set<string>()
  let outline: { id: string; kind: 'block' | 'task'; section: string | null; listParent: string | null }[] = []

  for (const op of body.operations) {
    if (op.op === 'create_task') {
      throw new ShelfDocumentRefusal('invalid', 'a Shelf holds no Tasks; create it in a Folder instead')
    }
    if (op.op === 'put_block') {
      writes.set(op.id, { ...op, checked: op.block_kind === 'checklist' ? (op.checked ?? false) : null })
      blocks.add(op.id)
      named.add(op.id)
      refOf.set(op.id, op.block_kind === 'folder_ref' ? op.ref_folder_id : null)
      continue
    }
    if (op.op === 'delete_block') {
      if (!blocks.delete(op.id)) throw new ShelfDocumentRefusal('not_found', 'Block not found.')
      writes.delete(op.id)
      named.add(op.id)
      continue
    }
    outline = op.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      section: item.section_block_id,
      listParent: item.list_parent_block_id,
    }))
  }

  if (blocks.size > 500) {
    throw new ShelfDocumentRefusal('invalid', 'A page holds at most 500 blocks.')
  }

  const seen = new Set<string>()
  for (const item of outline) {
    if (item.kind !== 'block' || !blocks.has(item.id) || seen.has(item.id)) {
      throw new ShelfDocumentRefusal('invalid', 'The outline has unknown or repeated identities.')
    }
    if (item.section !== null) {
      throw new ShelfDocumentRefusal('invalid', 'a Shelf document has no Section membership', 'section_block_id')
    }
    if (item.listParent !== null) {
      throw new ShelfDocumentRefusal('invalid', 'a Shelf document has no nested list items', 'list_parent_block_id')
    }
    seen.add(item.id)
  }
  if (seen.size !== blocks.size) {
    throw new ShelfDocumentRefusal('invalid', 'The outline must retain every undeleted block.')
  }

  // One placement per Folder row, asked of the final document.
  const placed = new Map<string, number>()
  for (const id of blocks) {
    const ref = refOf.get(id)
    if (ref != null) placed.set(ref, (placed.get(ref) ?? 0) + 1)
  }

  for (const write of writes.values()) {
    /* A file: the scope a shelf page has always used (`fileScopeCondition`'s
       shelf clause, 7.15's serving predicate), then #220's treatment rule. A
       file elsewhere and a file that does not exist answer alike (10.2). */
    if (write.file_id !== null) {
      const files = await rowsOf(
        tx,
        sql`SELECT f.kind FROM files f
             WHERE f.id = ${write.file_id}::uuid AND ${readableFileScope(viewerId)}`,
      )
      const file = files[0]
      if (file === undefined) throw new ShelfDocumentRefusal('invalid', 'must name a file you can reach', 'file_id')
      if (
        isMediaKind(write.block_kind) &&
        !(BLOCK_FILE_KINDS[write.block_kind] as readonly string[]).includes(String(file.kind))
      ) {
        throw new ShelfDocumentRefusal(
          'invalid',
          `This ${write.block_kind} block names a file uploaded as ${String(file.kind)}. Upload it again as the kind you mean to insert.`,
          'file_id',
        )
      }
    }
    if (write.ref_folder_id !== null) {
      const onShelf = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM folders f
              JOIN folder_members m ON m.folder_id = f.id
             WHERE f.id = ${write.ref_folder_id}::uuid
               AND f.deleted_at IS NULL
               AND m.user_id = ${viewerId}::uuid
               AND m.shelf_name = ${shelfName}`,
      )
      if (onShelf.length === 0) {
        throw new ShelfDocumentRefusal('invalid', 'must name a Folder on this Shelf', 'ref_folder_id')
      }
      if ((placed.get(write.ref_folder_id) ?? 0) > 1) {
        throw new ShelfDocumentRefusal('invalid', 'a Folder is placed on a Shelf once', 'ref_folder_id')
      }
    }
  }

  // Ids are one space across page_blocks and tasks (7.16's applier's rule).
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
      throw new ShelfDocumentRefusal('invalid', 'An inserted identity already exists.')
    }
  }

  // Writes. Every statement carries `shelf_id`, belt and braces over the merge.
  for (const id of original) {
    if (!blocks.has(id)) {
      await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${id}::uuid AND shelf_id = ${shelfId}::uuid`)
    }
  }
  for (const write of writes.values()) {
    const rich = write.rich_content === null ? null : JSON.stringify(write.rich_content)
    if (original.has(write.id)) {
      await tx.execute(
        sql`UPDATE page_blocks
               SET kind = ${write.block_kind}, text = ${write.text},
                   rich_content = ${rich}::jsonb, file_id = ${write.file_id}::uuid,
                   ref_folder_id = ${write.ref_folder_id}::uuid, width_pct = ${write.width_pct},
                   checked = ${write.checked}, updated_at = now()
             WHERE id = ${write.id}::uuid AND shelf_id = ${shelfId}::uuid`,
      )
    } else {
      await tx.execute(
        sql`INSERT INTO page_blocks
              (id, shelf_id, kind, position, text, rich_content, file_id, ref_folder_id, width_pct, checked)
            VALUES (${write.id}::uuid, ${shelfId}::uuid, ${write.block_kind}, 0, ${write.text},
                    ${rich}::jsonb, ${write.file_id}::uuid, ${write.ref_folder_id}::uuid,
                    ${write.width_pct}, ${write.checked})`,
      )
    }
  }
  // `position` is rewritten with the key so the legacy reader, which orders
  // by it, keeps agreeing with the document.
  const keys = initialKeys(outline.length)
  for (const [index, item] of outline.entries()) {
    await tx.execute(
      sql`UPDATE page_blocks SET page_position = ${keys[index] as string}, position = ${index}
           WHERE id = ${item.id}::uuid AND shelf_id = ${shelfId}::uuid`,
    )
  }

  const committed = await shelfDocumentMetadata(tx, shelfId)
  await tx.execute(
    sql`INSERT INTO shelf_document_receipts (shelf_id, mutation_id, payload_hash, committed_revision)
        VALUES (${shelfId}::uuid, ${body.mutation_id}::uuid, ${hash}, ${committed.revision})`,
  )
  return {
    mutation_id: body.mutation_id,
    committed_revision: committed.revision,
    replayed: false,
    created_task_ids: [],
  }
}
