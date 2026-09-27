/*
A facet's page: 7.16's document contract, scoped to one facet (#210, #211, #213).

It sits in the documents brick beside the other body appliers, and reaches
down into facets.ts (projects) for the locked facet read. Moved out of
facets.ts so that the one body writer, `applyFlatBody`, stays in documents
and no lower brick can write page_blocks.

`applyFacetDocument` is a facet-scoped sibling of page-document.ts's
`applyDocument` rather than a parameterization of it: a facet refuses
`create_task`, semantic `section` and `folder_ref`, and admits list nesting
for a facet-homed list item. The **wire contract is 7.16's, unchanged**: the
same `document_transaction` body, the same `base_revision` token, the same
`{revision, blocks, items}` read.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { isBlankFacetKind, isDocumentNativeFacetKind } from '../../shared/facets.js'
import type { DocumentTransaction, PageBlock, PageView } from '../../shared/pages.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { applyFlatBody, folderFileAudit } from './document-body.js'
import type { Refuse } from './document-body.js'
import { documentHash, hashableBlocks } from './document-hash.js'
import { fileReclaimedAt } from './document-outline.js'
import { lockedFacet, visibleTo } from './facets.js'
import type { FacetOutcome, LockedFacet } from './facets.js'
import { mayPerform } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { syncMentions } from './mentions.js'

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

const notFound = { kind: 'not_found' } as const

/**
 * A facet's page, or null when the caller may not see the facet.
 *
 * The shape is 7.16's `PageView` exactly: `revision`, `blocks`, `items`, and
 * an always-empty `task_placements`, because **no Task row ever belongs to a
 * facet** and the absence is #210's core rule rather than a gap. It is sent
 * rather than omitted so that one client reader serves both pages.
 */
function facetBlockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    page_position: nullableString(row.page_position),
    section_block_id: null,
    list_parent_block_id: nullableString(row.list_parent_block_id),
    toggleable: row.toggleable === true ? true : null,
    checked: row.checked === null || row.checked === undefined ? null : Boolean(row.checked),
    rich_content: (row.rich_content ?? null) as PageBlock['rich_content'],
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    file_width: nullableInt(row.file_width),
    file_height: nullableInt(row.file_height),
    file_reclaimed_at: fileReclaimedAt(row),
    file_name: nullableString(row.file_name),
    ref_folder_id: null,
    width_pct: row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct),
    updated_at: toIso(row.updated_at),
  }
}

async function facetDocumentMetadata(
  tx: Executor,
  facetId: string,
): Promise<{ revision: string }> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT id, kind, text, rich_content, file_id, width_pct, checked,
               list_parent_block_id, page_position, position, toggleable
          FROM page_blocks WHERE facet_id = ${facetId}::uuid ORDER BY id`,
  ).then(hashableBlocks)
  /* The facet id is inside the hash, and that is load-bearing rather than
     decorative. `page_document_receipts` is keyed (actor, folder, mutation),
     with no room for a facet, so a client that sent one mutation id to two
     documents of one folder would otherwise be handed the other document's
     receipt and told `replayed: true`. With the id in the hash it is told
     `stale` instead, which is the honest answer to "this retry identity
     already belongs to a different edit". */
  return { revision: documentHash({ facet: facetId, blocks, tasks: [] }) }
}

export async function facetPageView(
  db: Db,
  facetId: string,
): Promise<PageView> {
  return inTransaction(db, async (tx) => {
    const blocks = await rowsOf(
      tx,
      sql`SELECT b.id, b.kind, b.position, b.page_position, b.checked,
                 b.list_parent_block_id, b.toggleable, b.rich_content, b.text, b.file_id, b.width_pct, b.updated_at, b.file_reclaimed_at,
                 f.width AS file_width, f.height AS file_height, f.name AS file_name
            FROM page_blocks b
            LEFT JOIN files f ON f.id = b.file_id
           WHERE b.facet_id = ${facetId}::uuid
           ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
    )
    const metadata = await facetDocumentMetadata(tx, facetId)
    return {
      revision: metadata.revision,
      task_placements: [],
      blocks: blocks.map(facetBlockFromRow),
      items: blocks.map((row) => ({ kind: 'block' as const, id: String(row.id) })),
    }
  })
}

/**
 * A refusal from the facet document applier. The four kinds map onto 7.16's
 * own answers: `stale` is 409, `not_found` is 404, and `invalid` is the 422
 * the route formats with the field name.
 */
export class FacetDocumentRefusal extends Error {
  constructor(
    /** `forbidden` joined the three on 2026-09-21: the page gate now runs
     * inside this function's own transaction, so its 403 has to leave by the
     * same door its 404 does. */
    readonly outcome: 'stale' | 'not_found' | 'invalid' | 'forbidden',
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

/**
 * 7.16's document transaction over a facet's own blocks.
 *
 * **Three operational things are refused here that the folder page admits**:
 *
 * - `create_task`, because no Task row ever belongs to a facet (#210's core
 *   rule, and the reason no column on `tasks` names one);
 * - a `section` block, because a facet document has no Sections --
 *   `page_blocks_section_membership_check` says the same thing in the database
 *   and was already exactly right before #210 touched anything;
 * - a `folder_ref` block, because a facet is a view of one Folder and a
 *   reference out of it is Main's to carry.
 *
 * #211 supersedes #210's temporary no-nested-list limitation: a nested list
 * item is admitted only when both ends are list items of this same facet and
 * the parent occurs earlier in the final outline. Migration 0028 widens the
 * database CHECK in the same direction.
 *
 * A media block's `file_id` is scoped to the facet's **folder**, which is
 * `domain/pages.ts`'s `fileScopeCondition` for a folder-homed page: a facet
 * belongs to one folder and its pictures are that folder's.
 */
export async function applyFacetDocument(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
  body: DocumentTransaction,
): Promise<PageView> {
  const viewerId = facts.actorId
  const folderId = facts.folderId
  return inTransaction(db, async (tx) => {
    /*
    **The gate runs here, inside the transaction that writes**, and that is a
    correction rather than a tidy-up (adversarial review of 16ce81b). It used
    to run in `facetPageGate`, which opened a transaction of its own and
    committed before this one started: the `FOR UPDATE` it took was released
    before the first statement of the write, so a conversion landing in that
    window was authorized by a row this function never saw. #228's
    Assigned-work rule -- the fact a gate reads must be the fact the mutation
    sees, in one snapshot under one lock -- is what `whenOwnPrivateFacet`
    inherits, and it was not being kept.

    Everything below therefore runs against a facet row this transaction holds
    a lock on until it commits.
    */
    const gated = await facetPageGateIn(tx, facts, facetId, true)
    if (gated.kind === 'not_found') {
      throw new FacetDocumentRefusal('not_found', 'Not found.')
    }
    if (gated.kind === 'forbidden') {
      throw new FacetDocumentRefusal('forbidden', gated.reason)
    }
    /* `facetPageGateIn` answers only those three and `ok`, so this arm is
       unreachable; it exists because a discriminated union with an unhandled
       member is a defect waiting for the day somebody adds one. */
    if (gated.kind !== 'ok') {
      throw new FacetDocumentRefusal('invalid', gated.message, 'operations')
    }

    const hash = documentHash({ facet: facetId, body })
    const receipts = await rowsOf(
      tx,
      sql`SELECT payload_hash, committed_revision FROM page_document_receipts
           WHERE actor_id = ${viewerId}::uuid AND folder_id = ${folderId}::uuid
             AND mutation_id = ${body.mutation_id}::uuid`,
    )
    const receipt = receipts[0]
    if (receipt !== undefined) {
      if (receipt.payload_hash !== hash) {
        throw new FacetDocumentRefusal(
          'stale',
          'This retry identity already belongs to a different edit.',
        )
      }
      const replayed = await facetPageViewIn(tx, facetId)
      return {
        ...replayed,
        mutation: {
          mutation_id: body.mutation_id,
          committed_revision: String(receipt.committed_revision),
          replayed: true,
          created_task_ids: [],
        },
      }
    }

    const before = await facetDocumentMetadata(tx, facetId)
    if (before.revision !== body.base_revision) {
      throw new FacetDocumentRefusal(
        'stale',
        'The page changed. Your draft is retained; reconcile it with the current page.',
      )
    }

    const refuse: Refuse = (outcome, message, field) => new FacetDocumentRefusal(outcome, message, field)
    /* #213: a native Result belongs to the Results facet alone, so the
       Results facet is its own home in the registry. */
    await applyFlatBody(
      tx,
      {
        home: gated.value.kind === 'results' ? 'results' : 'doc',
        scope: { column: 'facet_id', id: facetId },
        refuse,
        noTasks: 'a facet holds no Tasks; create it on the Folder page instead',
        foreignId:
          "names a block this facet does not hold; an identity that already exists elsewhere is not this facet's to write",
        audit: folderFileAudit(tx, folderId, refuse),
        afterWrite: (writes) => syncMentions(tx, { pageFolderId: folderId, actorId: viewerId, blockIds: writes.keys(), refuse: (m) => refuse('invalid', m, 'rich_content') }),
      },
      body.operations,
    )
    const committed = await facetDocumentMetadata(tx, facetId)
    // An object, not an array: only an array-valued receipt marks the Folder
    // page itself as on the document path (pages.ts), and a facet document's
    // write must not shut the deployed client's legacy Folder page writer.
    await tx.execute(
      sql`INSERT INTO page_document_receipts
            (actor_id, folder_id, mutation_id, payload_hash, committed_revision, created_task_ids)
          VALUES (${viewerId}::uuid, ${folderId}::uuid, ${body.mutation_id}::uuid,
                  ${hash}, ${committed.revision}, ${JSON.stringify({ facet_id: facetId })}::jsonb)`,
    )
    const view = await facetPageViewIn(tx, facetId)
    return {
      ...view,
      mutation: {
        mutation_id: body.mutation_id,
        committed_revision: committed.revision,
        replayed: false,
        created_task_ids: [],
      },
    }
  })
}

/** `facetPageView`'s body, for a caller that already has a transaction. */
async function facetPageViewIn(tx: Executor, facetId: string): Promise<PageView> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.position, b.page_position, b.checked,
               b.list_parent_block_id, b.toggleable, b.rich_content, b.text, b.file_id, b.width_pct, b.updated_at, b.file_reclaimed_at,
               f.width AS file_width, f.height AS file_height, f.name AS file_name
          FROM page_blocks b
          LEFT JOIN files f ON f.id = b.file_id
         WHERE b.facet_id = ${facetId}::uuid
         ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
  )
  const metadata = await facetDocumentMetadata(tx, facetId)
  return {
    revision: metadata.revision,
    task_placements: [],
    blocks: blocks.map(facetBlockFromRow),
    items: blocks.map((row) => ({ kind: 'block' as const, id: String(row.id) })),
  }
}

/**
 * The gate the two facet page routes share, and the one place the two
 * different answers live.
 *
 * A **shared** blank facet's document is ordinary shared Work and is governed
 * by the existing `folder.page.edit`. A **private** one is governed by
 * `facet.read` alone, which no preset satisfies -- so Full control and the
 * structural owner are refused by the same line that refuses everybody else.
 *
 * A **Work facet has no page of its own**: it reads and writes
 * `/folders/:id/page`, and asking for its page is 404 rather than an empty
 * document, because an empty document would be a second place to write that
 * nothing ever reads back.
 */
async function facetPageGateIn(
  tx: Executor,
  facts: FolderActorFacts,
  facetId: string,
  writing: boolean,
): Promise<FacetOutcome<LockedFacet>> {
  const facet = await lockedFacet(tx, facts.folderId, facetId, writing)
  if (
    facet === null ||
    !visibleTo(facet, facts.actorId) ||
    facet.deletedAt !== null ||
    !(isBlankFacetKind(facet.kind) || isDocumentNativeFacetKind(facet.kind))
  ) {
    return notFound
  }
  const action = facet.ownerId === null ? 'folder.page.edit' : 'facet.read'
  /* A shared facet's *read* is any member's, which is `folder.read`; only
     the write takes `folder.page.edit`. A private facet's read and write are
     the same question, because the only person who may read it is the only
     person who may write it. */
  const asked = facet.ownerId === null && !writing ? 'folder.read' : action
  const decision = mayPerform(facts, asked, { facetOwnerId: facet.ownerId })
  if (!decision.allowed) {
    return { kind: 'forbidden', reason: decision.reason } as const
  }
  return { kind: 'ok', value: facet } as const
}

/** The **read** gate, for `GET /folders/:id/facets/:facetId/page` and nothing
 * else. It locks nothing, because a read has no write to serialise against;
 * the write path reaches the same rule through `facetPageGateIn` inside its
 * own transaction, which is what keeps the answer and the write together. */
export async function facetPageGate(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
): Promise<FacetOutcome<{ facetId: string }>> {
  return inTransaction(db, async (tx) => {
    const gated = await facetPageGateIn(tx, facts, facetId, false)
    if (gated.kind !== 'ok') return gated
    return { kind: 'ok', value: { facetId: gated.value.id } } as const
  })
}
