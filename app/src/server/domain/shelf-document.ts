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
- Since migration 0038 an outline item may carry a `list_parent_block_id`:
  blocks nest on a Shelf like on every other home (`document-outline.ts`).

**A Folder row is a `folder_ref` block naming the folder**, which is how the
legacy Shelf editor stored it. The Folder's
membership of the Shelf stays where it has always lived,
`folder_members.shelf_name`; the block is placement only. So a written
`folder_ref` must name a live folder the viewer is a member of **and has on
this Shelf**, and at most one block may place any one folder. A stored
`folder_ref` whose folder has since left the Shelf is not audited (the rule
`page-document.ts` settled for #220: a write audits what it writes), and a
reader drops it exactly as the legacy screen does.
*/
import { sql } from 'drizzle-orm'

import type { DocumentTransaction } from '../../shared/pages.js'
import { BLOCK_FILE_KINDS, isMediaKind } from '../../shared/page-document.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash, hashableBlocks } from './document-hash.js'
import { applyFlatBody } from './document-body.js'
import type { Refuse } from './document-body.js'
import { readableFileScope } from './files.js'
import { resolveScoped } from './folder-access.js'

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
               checked, page_position, position, list_parent_block_id, toggleable
          FROM page_blocks WHERE shelf_id = ${shelfId}::uuid ORDER BY id`,
  )
  // Both columns are dropped where null, so every Shelf revision stored before
  // 0038 reads the same after it.
  return {
    revision: documentHash({ shelf: shelfId, blocks: hashableBlocks(blocks, ['list_parent_block_id', 'toggleable']) }),
    task_placements: [],
  }
}

const refuse: Refuse = (outcome, message, field) => new ShelfDocumentRefusal(outcome, message, field)

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

  await applyFlatBody(
    tx,
    {
      home: 'shelf',
      scope: { column: 'shelf_id', id: shelfId },
      refuse,
      noTasks: 'a Shelf holds no Tasks; create it in a Folder instead',
      foreignId: 'An inserted identity already exists.',
      audit: async ({ stored, blocks, writes }) => {
        // One placement per Folder row, asked of the final document.
        const storedRef = new Map(
          stored.map((row) => [String(row.id), row.ref_folder_id == null ? null : String(row.ref_folder_id)]),
        )
        const placed = new Map<string, number>()
        for (const id of blocks) {
          const write = writes.get(id)
          const ref =
            write === undefined ? storedRef.get(id) : write.block_kind === 'folder_ref' ? write.ref_folder_id : null
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
            if (file === undefined) throw refuse('invalid', 'must name a file you can reach', 'file_id')
            if (
              isMediaKind(write.block_kind) &&
              !(BLOCK_FILE_KINDS[write.block_kind] as readonly string[]).includes(String(file.kind))
            ) {
              throw refuse(
                'invalid',
                `This ${write.block_kind} block names a file uploaded as ${String(file.kind)}. Upload it again as the kind you mean to insert.`,
                'file_id',
              )
            }
          }
          if (write.ref_folder_id !== null) {
            const onShelf = await resolveScoped(tx, 'folder', write.ref_folder_id, viewerId, {
              where: sql`m.shelf_name = ${shelfName}`,
            })
            if (onShelf === null) throw refuse('invalid', 'must name a Folder on this Shelf', 'ref_folder_id')
            if ((placed.get(write.ref_folder_id) ?? 0) > 1) {
              throw refuse('invalid', 'a Folder is placed on a Shelf once', 'ref_folder_id')
            }
          }
        }
      },
    },
    body.operations,
  )
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
