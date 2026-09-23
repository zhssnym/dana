/*
AC-847: Purpose is the native shared authored document of a Folder. Every
member may read it; folder.page.edit governs writes; presentation headings,
lists and checklist state are authored content; Tasks, Main Sections and
folder_ref blocks remain outside Purpose; and list ancestry never crosses a
facet boundary.

Issue #211, R1-R3 and Hassan's technical ruling:
https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetPageOf,
  folderWithFacets,
  getFacetPage,
  postFacetPageAction,
  sharedFolder,
} from '../support/facets-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'editor'], 'ac847')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const item = (id: string, parent: string | null = null) => ({
  kind: 'block' as const,
  id,
  section_block_id: null,
  list_parent_block_id: parent,
})

const block = (
  id: string,
  kind: string,
  text: string,
  checked: boolean | null = null,
) => ({
  op: 'put_block' as const,
  id,
  block_kind: kind,
  text,
  rich_content: null,
  file_id: null,
  ref_folder_id: null,
  width_pct: null,
  checked,
})

describe('AC-847 Purpose is one shared authored document, not another Work hierarchy', () => {
  test('every member reads Purpose and folder.page.edit is the write boundary', async () => {
    const [owner, viewer, editor] = (await cast.of(app)) as [Actor, Actor, Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-847 authority', [
      [viewer, 'can_view'],
      [editor, 'can_edit'],
    ])
    const purpose = facets.find((facet) => facet.kind === 'purpose')!

    expectStatus(
      await getFacetPage(viewer, folderId, purpose.id),
      200,
      'Purpose is shared authored Folder context, so a current member may read it',
    )
    const page = await facetPageOf(viewer, folderId, purpose.id)
    const denied = await postFacetPageAction(viewer, folderId, purpose.id, {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        block(crypto.randomUUID(), 'paragraph', 'viewer cannot write this'),
        { op: 'set_outline', items: [] },
      ],
    })
    expectStatus(
      denied,
      403,
      'Can view does not satisfy folder.page.edit',
    )

    const editorPage = await facetPageOf(editor, folderId, purpose.id)
    const paragraph = crypto.randomUUID()
    expectStatus(
      await postFacetPageAction(editor, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: editorPage.revision,
        operations: [
          block(paragraph, 'paragraph', 'shared direction'),
          { op: 'set_outline', items: [item(paragraph)] },
        ],
      }),
      200,
      'Can edit writes shared Folder content',
    )
    expect(
      (await facetPageOf(owner, folderId, purpose.id)).blocks.map((row) => row.text),
      'the owner reads the same shared document the editor wrote',
    ).toEqual(['shared direction'])
  })

  test('presentation headings, nested lists and checklist ticks persist without Work semantics', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-847 writing')
    const purpose = facets.find((facet) => facet.kind === 'purpose')!
    const before = await facetPageOf(owner, folderId, purpose.id)
    const h1 = crypto.randomUUID()
    const h2 = crypto.randomUUID()
    const parent = crypto.randomUUID()
    const child = crypto.randomUUID()
    const check = crypto.randomUUID()

    expectStatus(
      await postFacetPageAction(owner, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: before.revision,
        operations: [
          block(h1, 'heading1', 'Why this exists'),
          block(h2, 'heading2', 'Boundaries'),
          block(parent, 'bullet', 'Respect the boundary'),
          block(child, 'numbered', 'Explain the trade-off'),
          block(check, 'checklist', 'Reviewed', true),
          {
            op: 'set_outline',
            items: [item(h1), item(h2), item(parent), item(child, parent), item(check)],
          },
        ],
      }),
      200,
      'Purpose accepts authored headings and writing hierarchy',
    )

    const stored = await rows(
      app.db,
      sql`SELECT id, kind, section_block_id, list_parent_block_id, checked
            FROM page_blocks
           WHERE facet_id = ${purpose.id}::uuid
           ORDER BY position ASC`,
    )
    expect(
      stored.map((row) => [
        String(row.kind),
        row.section_block_id,
        row.list_parent_block_id === null ? null : String(row.list_parent_block_id),
        row.checked,
      ]),
      'headings create no Work Section relation, while list ancestry and checklist state are authored data',
    ).toEqual([
      ['heading1', null, null, null],
      ['heading2', null, null, null],
      ['bullet', null, null, null],
      ['numbered', null, parent, null],
      ['checklist', null, null, true],
    ])
    expect(
      await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ).then((found) => Number(found[0]?.n ?? 0)),
      'Purpose authored structure created no Task row',
    ).toBe(0)
  })

  test('Purpose refuses operational kinds and list ancestry cannot cross documents', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await sharedFolder(app, owner, 'AC-847 refusals')
    const facets = await owner.browser.api(`/folders/${folderId}/facets`)
    expectStatus(facets, 200, 'facet list stages')
    const purpose = (facets.json() as { facets: { id: string; kind: string }[] }).facets.find(
      (facet) => facet.kind === 'purpose',
    )!
    const other = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Other document',
    })

    const otherPage = await facetPageOf(owner, folderId, other.id)
    const foreignParent = crypto.randomUUID()
    expectStatus(
      await postFacetPageAction(owner, folderId, other.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: otherPage.revision,
        operations: [
          block(foreignParent, 'bullet', 'elsewhere'),
          { op: 'set_outline', items: [item(foreignParent)] },
        ],
      }),
      200,
      'the foreign list parent exists in another facet',
    )

    for (const [what, operation] of [
      ['Task', { op: 'create_task', id: crypto.randomUUID(), title: 'not Purpose work' }],
      [
        'Main Section',
        block(crypto.randomUUID(), 'section', 'not a Work Section'),
      ],
      [
        'folder reference block',
        {
          ...block(crypto.randomUUID(), 'folder_ref', ''),
          ref_folder_id: folderId,
        },
      ],
    ] as const) {
      const page = await facetPageOf(owner, folderId, purpose.id)
      const id = 'id' in operation ? operation.id : crypto.randomUUID()
      const answer = await postFacetPageAction(owner, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: page.revision,
        operations: [
          operation,
          { op: 'set_outline', items: operation.op === 'put_block' ? [item(id)] : [] },
        ],
      })
      expectStatus(answer, 422, `${what} is outside the Purpose document`)
    }

    const page = await facetPageOf(owner, folderId, purpose.id)
    const child = crypto.randomUUID()
    const cross = await postFacetPageAction(owner, folderId, purpose.id, {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        block(child, 'bullet', 'cannot cross'),
        { op: 'set_outline', items: [item(child, foreignParent)] },
      ],
    })
    expectStatus(cross, 422, 'a list parent in another facet is not this document')
    expect(JSON.stringify(cross.json())).toContain('list_parent_block_id')
  })

  test('presentation headings are refused on Main, whose headings remain Work Sections', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId } = await folderWithFacets(app, owner, 'AC-847 Main')
    const read = await owner.browser.api(`/folders/${folderId}/page`)
    expectStatus(read, 200, 'Main page reads')
    const page = read.json() as { revision: string }
    const heading = crypto.randomUUID()
    const answer = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: page.revision,
      operations: [
        block(heading, 'heading1', 'presentation only'),
        { op: 'set_outline', items: [item(heading)] },
      ],
    })
    expectStatus(answer, 422, 'Main refuses presentation-only headings')
  })
})
