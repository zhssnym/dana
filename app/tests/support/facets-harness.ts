/*
Fixtures for AC-830 to AC-844, the fifteen proofs of issue #210's Folder facet
framework (Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756).

**Why a harness rather than per-file setup.** Nearly every one of those fifteen
needs the same shape: a Folder with people in it at chosen presets, its four
native facets read back, and often an H1 on its page to hang a Work facet from.
Written per file that is fifteen copies of the same dance, and a difference
between two copies would read as a difference between two criteria.

**Setup goes through the API wherever the API is the thing under test**, which
is the `folders-harness` rule and the `folder-access-harness` rule one file
over. Facets arrive through `POST /folders/:id/facets`, presets through #228's
own surface, and the Folder page through 7.16's document transaction -- so a
broken create fails the criterion that is about creating rather than silently
producing a row no endpoint would write.

The two exceptions say at their own definitions why they must exist:
`facetRow`, which reads the table directly because a criterion about what is
*stored* must not be satisfied by a handler that echoes its own request, and
`ageFacetTrash`, which moves a clock a test cannot wait out.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { Facet } from '../../src/shared/facets.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'
import type { AuthTestApp } from './auth-harness.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { sharedFolder } from './folder-access-harness.js'
import { rows } from './helpers.js'
import type { RawResponse } from './http-client.js'

export { sharedFolder, forcePreset } from './folder-access-harness.js'

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** `GET /folders/:id/facets`, unjudged. */
export function getFacets(
  actor: Actor,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/folders/${folderId}/facets`)
}

/** `GET /folders/:id/facets`, asserted, as the array it answers. */
export async function facetsOf(
  actor: Actor,
  folderId: string,
): Promise<Facet[]> {
  const response = await getFacets(actor, folderId)
  expectStatus(
    response,
    200,
    'GET /folders/:id/facets must answer any member of the Folder (spec 7.27)',
  )
  return (response.json() as { facets: Facet[] }).facets
}

/** The one facet of a kind, or undefined. Natives are unique per Folder by
 * `folder_facets_folder_native_kind_idx`, so this is total for the four. */
export async function facetOfKind(
  actor: Actor,
  folderId: string,
  kind: Facet['kind'],
): Promise<Facet | undefined> {
  return (await facetsOf(actor, folderId)).find((facet) => facet.kind === kind)
}

/**
 * The stored row, read straight out of the table.
 *
 * **Every criterion that is about what was *written* reads this** rather than
 * the response alone: a handler that echoes the body it was sent while storing
 * nothing satisfies any assertion made against its own reply, which is the
 * failure `docs/workflow/hard-stops.md` records having cost this project four
 * packages. It is deliberately unscoped by viewer, because a criterion about
 * privacy has to be able to see the row it is proving nobody can read.
 */
export async function facetRow(
  db: Db,
  facetId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rows(
    db,
    sql`SELECT id, folder_id, kind, owner_id, display_name, hidden, position,
               h1_block_id, created_by, deleted_at
          FROM folder_facets WHERE id = ${facetId}::uuid`,
  )
  return found[0]
}

/** Every facet row of one Folder, trashed ones included, in stored order. */
export async function facetRowsOf(
  db: Db,
  folderId: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    db,
    sql`SELECT id, kind, owner_id, display_name, hidden, position, h1_block_id,
               deleted_at
          FROM folder_facets WHERE folder_id = ${folderId}::uuid
         ORDER BY position ASC, id ASC`,
  )
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface CreateFacet {
  kind: string
  h1_block_id?: string
  display_name?: string
  after_facet_id?: string | null
}

/** `POST /folders/:id/facets`, unjudged. */
export function postFacet(
  actor: Actor,
  folderId: string,
  body: CreateFacet,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/facets`, 'POST', body)
}

export async function createFacetOk(
  actor: Actor,
  folderId: string,
  body: CreateFacet,
): Promise<Facet> {
  const response = await postFacet(actor, folderId, body)
  expectStatus(
    response,
    201,
    `POST /folders/:id/facets must create a ${body.kind} facet (spec 7.27)`,
  )
  return response.json() as Facet
}

/** `PATCH /folders/:id/facets/:facetId`, unjudged. */
export function patchFacet(
  actor: Actor,
  folderId: string,
  facetId: string,
  body: Record<string, unknown>,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/facets/${facetId}`,
    'PATCH',
    body,
  )
}

/** `DELETE /folders/:id/facets/:facetId`, unjudged. */
export function deleteFacet(
  actor: Actor,
  folderId: string,
  facetId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/facets/${facetId}`, 'DELETE')
}

/** `PUT /folders/:id/facets/order`, unjudged. */
export function putFacetOrder(
  actor: Actor,
  folderId: string,
  order: readonly string[],
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/facets/order`, 'PUT', {
    order,
  })
}

/** `PUT /folders/:id/facets/my-order`, unjudged. */
export function putMyFacetOrder(
  actor: Actor,
  folderId: string,
  placements: readonly { facet_id: string; after_facet_id: string | null }[],
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/facets/my-order`, 'PUT', {
    placements,
  })
}

/** `POST /folders/:id/facets/:facetId/share`, unjudged. */
export function shareFacet(
  actor: Actor,
  folderId: string,
  facetId: string,
  body: Record<string, unknown> = { confirm: true },
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/facets/${facetId}/share`,
    'POST',
    body,
  )
}

/** `POST /api/v1/facets/:id/restore`, unjudged. */
export function restoreFacet(
  actor: Actor,
  facetId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/facets/${facetId}/restore`, 'POST')
}

/** `DELETE /api/v1/trash/facets/:id`, unjudged. */
export function destroyFacet(
  actor: Actor,
  facetId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/trash/facets/${facetId}`, 'DELETE')
}

/* ------------------------------------------------------------------ *
 * The facet document (7.16's transaction, facet-scoped)
 * ------------------------------------------------------------------ */

/** `GET /folders/:id/facets/:facetId/page`, unjudged. */
export function getFacetPage(
  actor: Actor,
  folderId: string,
  facetId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/folders/${folderId}/facets/${facetId}/page`)
}

export interface FacetPage {
  revision: string
  task_placements: unknown[]
  blocks: { id: string; kind: string; text: string | null }[]
  items: { kind: string; id: string }[]
  mutation?: { committed_revision: string; replayed: boolean }
}

export async function facetPageOf(
  actor: Actor,
  folderId: string,
  facetId: string,
): Promise<FacetPage> {
  const response = await getFacetPage(actor, folderId, facetId)
  expectStatus(
    response,
    200,
    "GET /folders/:id/facets/:facetId/page must answer a member the facet's document (spec 7.27, 7.16)",
  )
  return response.json() as FacetPage
}

/** `POST /folders/:id/facets/:facetId/page/actions`, unjudged. */
export function postFacetPageAction(
  actor: Actor,
  folderId: string,
  facetId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/facets/${facetId}/page/actions`,
    'POST',
    body,
  )
}

/**
 * One paragraph written into a facet's document, as a whole 7.16 transaction
 * built against the revision the facet currently reports.
 *
 * It reads the revision itself rather than taking one, because
 * `base_revision` is a token the server minted and a test that guessed it
 * would be asserting its own arithmetic.
 */
export async function writeFacetParagraph(
  actor: Actor,
  folderId: string,
  facetId: string,
  id: string,
  text: string,
): Promise<RawResponse> {
  const page = await facetPageOf(actor, folderId, facetId)
  const keep = page.blocks.map((block) => ({
    kind: 'block' as const,
    id: block.id,
    section_block_id: null,
    list_parent_block_id: null,
  }))
  return postFacetPageAction(actor, folderId, facetId, {
    action: 'document_transaction',
    mutation_id: crypto.randomUUID(),
    base_revision: page.revision,
    operations: [
      {
        op: 'put_block',
        id,
        block_kind: 'paragraph',
        text,
        rich_content: null,
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [
          ...keep,
          {
            kind: 'block',
            id,
            section_block_id: null,
            list_parent_block_id: null,
          },
        ],
      },
    ],
  })
}

/* ------------------------------------------------------------------ *
 * The Folder page, for the Work facet's H1
 * ------------------------------------------------------------------ */

/**
 * One H1 Section on the Folder's own page, written through 7.16's document
 * transaction, answering the block id.
 *
 * A depth-1 Section is a `section` block whose `section_block_id` is null
 * (4.17: a Section's level is its depth in that relation and nothing else), so
 * the outline below places it at the root deliberately rather than by default.
 */
export async function writeFolderHeading(
  actor: Actor,
  folderId: string,
  text: string,
): Promise<string> {
  const read = await actor.browser.api(`/folders/${folderId}/page`)
  expectStatus(read, 200, 'GET /folders/:id/page must answer a member (spec 7.16)')
  const page = read.json() as {
    revision: string
    blocks: { id: string }[]
    items: { kind: string; id: string }[]
    task_placements: { id: string; section_block_id: string | null }[]
  }
  const id = crypto.randomUUID()
  const keep = page.items.map((item) => ({
    kind: item.kind as 'block' | 'task',
    id: item.id,
    section_block_id: null,
    list_parent_block_id: null,
  }))
  const written = await actor.browser.json(
    `/folders/${folderId}/page/actions`,
    'POST',
    {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        {
          op: 'put_block',
          id,
          block_kind: 'section',
          text,
          rich_content: null,
          file_id: null,
          ref_folder_id: null,
          width_pct: null,
          checked: null,
        },
        { op: 'set_outline', items: [...keep, { kind: 'block', id, section_block_id: null, list_parent_block_id: null }] },
      ],
    },
  )
  expectStatus(
    written,
    200,
    'POST /folders/:id/page/actions must write an H1 Section (spec 7.16)',
  )
  return id
}

/** The current text of one Folder page block, read from the table. */
export async function blockText(
  db: Db,
  blockId: string,
): Promise<string | null> {
  const found = await rows(
    db,
    sql`SELECT text FROM page_blocks WHERE id = ${blockId}::uuid`,
  )
  const row = found[0]
  return row === undefined ? null : (row.text as string | null)
}

/* ------------------------------------------------------------------ *
 * Trash
 * ------------------------------------------------------------------ */

export interface TrashedFacetRow {
  id: string
  name: string
  kind: string
  folder_id: string
  folder_name: string
  deleted_at: string
  is_owner: boolean
  my_access: FolderAccessPreset
}

export async function trashFacetsOf(actor: Actor): Promise<TrashedFacetRow[]> {
  const response = await actor.browser.api('/trash')
  expectStatus(response, 200, 'GET /trash must answer any signed-in person (spec 7.13)')
  return (response.json() as { facets: TrashedFacetRow[] }).facets
}

/**
 * Moves one trashed facet's `deleted_at` past 7.13's thirty-day window.
 *
 * Written straight to the column because there is no endpoint for the passage
 * of time and a test cannot wait thirty days. It is the same move
 * `reclaim-harness` makes for 7.19's window, and it changes only the clock:
 * every other fact about the row is whatever the endpoint that trashed it
 * wrote.
 */
export async function ageFacetTrash(db: Db, facetId: string): Promise<void> {
  await db.execute(
    sql`UPDATE folder_facets SET deleted_at = now() - interval '31 days'
         WHERE id = ${facetId}::uuid`,
  )
}

/* ------------------------------------------------------------------ *
 * A folder with people in it
 * ------------------------------------------------------------------ */

/**
 * `sharedFolder` with its four natives read back, which is what most of these
 * criteria actually want: the ids exist from creation and every case that
 * names Main or Purpose needs theirs.
 */
export async function folderWithFacets(
  app: AuthTestApp,
  owner: Actor,
  name: string,
  members: readonly (readonly [Actor, FolderAccessPreset])[] = [],
): Promise<{ folderId: string; facets: Facet[] }> {
  const folderId = await sharedFolder(app, owner, name, members)
  const facets = await facetsOf(owner, folderId)
  expect(
    facets.map((facet) => facet.kind),
    'a Folder is created with exactly its four native facets, in 7.27 order (spec 4.30, 7.4)',
  ).toEqual(['main', 'purpose', 'consultation', 'results'])
  return { folderId, facets }
}
