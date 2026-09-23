/*
AC-849: Folder duplication gives Purpose a fresh native identity and fresh
blocks, preserves authored content/name/list structure, and rewrites only Dana
Links whose targets travelled in the same copy.

Issue #211 R3; Hassan ruling:
https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  facetPageOf,
  folderWithFacets,
  patchFacet,
  postFacetPageAction,
} from '../support/facets-harness.js'
import { duplicateFolderOk } from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac849')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-849 duplicate carries Purpose as independent authored context', () => {
  test('fresh ids, copied name/list structure, and finite Dana-Link remapping', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-849 source')
    const purpose = facets.find((facet) => facet.kind === 'purpose')!
    expectStatus(
      await patchFacet(owner, folderId, purpose.id, { display_name: 'Intent' }),
      200,
      'Purpose name stages',
    )
    const task = await createTaskOk(
      owner,
      { title: 'AC-849 travelled task', folder_id: folderId },
      'the task must be part of the duplicate',
    )
    const outside = await folderWithFacets(app, owner, 'AC-849 outside')
    const outsidePurpose = outside.facets.find((facet) => facet.kind === 'purpose')!

    const page = await facetPageOf(owner, folderId, purpose.id)
    const parent = crypto.randomUUID()
    const child = crypto.randomUUID()
    const linked = crypto.randomUUID()
    const put = (
      id: string,
      kind: string,
      text: string,
      href?: string,
    ) => ({
      op: 'put_block' as const,
      id,
      block_kind: kind,
      text,
      rich_content:
        href === undefined
          ? null
          : { version: 1 as const, runs: [{ text, href }] },
      file_id: null,
      ref_folder_id: null,
      width_pct: null,
      checked: kind === 'checklist' ? false : null,
    })
    expectStatus(
      await postFacetPageAction(owner, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: page.revision,
        operations: [
          put(parent, 'bullet', 'parent'),
          put(child, 'numbered', 'child'),
          put(linked, 'paragraph', 'folder', `/app/folders/${folderId}`),
          put(crypto.randomUUID(), 'paragraph', 'purpose', `/app/facets/${purpose.id}`),
          put(crypto.randomUUID(), 'paragraph', 'task', `/app/tasks/${task.id}`),
          put(
            crypto.randomUUID(),
            'paragraph',
            'outside',
            `/app/facets/${outsidePurpose.id}`,
          ),
          {
            op: 'set_outline',
            items: [
              { kind: 'block', id: parent, section_block_id: null, list_parent_block_id: null },
              { kind: 'block', id: child, section_block_id: null, list_parent_block_id: parent },
              { kind: 'block', id: linked, section_block_id: null, list_parent_block_id: null },
              ...[],
            ],
          },
        ],
      }),
      422,
      'the incomplete outline proves Purpose still requires the whole document',
    )

    /* Write the complete document after the deliberate refusal above. */
    const fresh = await facetPageOf(owner, folderId, purpose.id)
    const ids = [parent, child, linked, crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const ops = [
      put(ids[0]!, 'bullet', 'parent'),
      put(ids[1]!, 'numbered', 'child'),
      put(ids[2]!, 'paragraph', 'folder', `/app/folders/${folderId}`),
      put(ids[3]!, 'paragraph', 'purpose', `/app/facets/${purpose.id}`),
      put(ids[4]!, 'paragraph', 'task', `/app/tasks/${task.id}`),
      put(ids[5]!, 'paragraph', 'outside', `/app/facets/${outsidePurpose.id}`),
    ]
    expectStatus(
      await postFacetPageAction(owner, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: fresh.revision,
        operations: [
          ...ops,
          {
            op: 'set_outline',
            items: ids.map((id, index) => ({
              kind: 'block' as const,
              id,
              section_block_id: null,
              list_parent_block_id: index === 1 ? ids[0]! : null,
            })),
          },
        ],
      }),
      200,
      'the source Purpose is written',
    )

    const copyId = await duplicateFolderOk(owner, folderId)
    const copiedPurposeRows = await rows(
      app.db,
      sql`SELECT id, display_name FROM folder_facets
            WHERE folder_id=${copyId}::uuid AND kind='purpose'`,
    )
    expect(copiedPurposeRows).toHaveLength(1)
    const copiedPurposeId = String(copiedPurposeRows[0]?.id)
    expect(copiedPurposeId, 'the copy has a fresh native Purpose id').not.toBe(purpose.id)
    expect(copiedPurposeRows[0]?.display_name).toBe('Intent')

    const copiedTask = await rows(
      app.db,
      sql`SELECT id FROM tasks
            WHERE folder_id=${copyId}::uuid AND title='AC-849 travelled task'`,
    )
    const copiedTaskId = String(copiedTask[0]?.id)
    const copiedBlocks = await rows(
      app.db,
      sql`SELECT id, kind, rich_content, list_parent_block_id
            FROM page_blocks
            WHERE facet_id=${copiedPurposeId}::uuid
            ORDER BY position ASC`,
    )
    expect(copiedBlocks).toHaveLength(6)
    expect(
      copiedBlocks.every((row) => !ids.includes(String(row.id))),
      'every Purpose block identity is fresh',
    ).toBe(true)
    expect(
      String(copiedBlocks[1]?.list_parent_block_id),
      'list ancestry points at the copied parent rather than the source parent',
    ).toBe(String(copiedBlocks[0]?.id))

    const hrefs = copiedBlocks
      .flatMap((row) => {
        const rich = row.rich_content as { runs?: { href?: string }[] } | null
        return rich?.runs?.flatMap((run) => (run.href === undefined ? [] : [run.href])) ?? []
      })
    expect(hrefs).toContain(`/app/folders/${copyId}`)
    expect(hrefs).toContain(`/app/facets/${copiedPurposeId}`)
    expect(hrefs).toContain(`/app/tasks/${copiedTaskId}`)
    expect(
      hrefs,
      'a target that did not travel remains the authored external-to-copy reference',
    ).toContain(`/app/facets/${outsidePurpose.id}`)

    expect(
      await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM page_blocks WHERE facet_id=${purpose.id}::uuid`,
      ).then((found) => Number(found[0]?.n ?? 0)),
      'the source Purpose is still independently editable and still owns its rows',
    ).toBe(6)
  })
})
