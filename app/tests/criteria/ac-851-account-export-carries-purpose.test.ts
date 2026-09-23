/*
AC-851: account export needs no new collection or version for Purpose because
#210 already exports reachable shared facets and their page_blocks. A non-empty
native Purpose, including its custom display name and authored heading/list
structure, appears through that existing boundary.

Issue #211 R3; #210 Ruling 7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  Cast,
  exportOf,
  startAuthTestApp,
} from '../support/export-harness.js'
import type { Actor, AuthTestApp } from '../support/export-harness.js'
import { expectStatus } from '../support/folders-harness.js'
import {
  facetPageOf,
  folderWithFacets,
  patchFacet,
  postFacetPageAction,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac851')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-851 account export carries Purpose through the existing facet boundary', () => {
  test('name, heading, list ancestry and checklist state are exported', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-851 export')
    const purpose = facets.find((facet) => facet.kind === 'purpose')!
    expectStatus(
      await patchFacet(owner, folderId, purpose.id, { display_name: 'Direction' }),
      200,
      'Purpose rename stages',
    )
    const page = await facetPageOf(owner, folderId, purpose.id)
    const heading = crypto.randomUUID()
    const parent = crypto.randomUUID()
    const child = crypto.randomUUID()
    const put = (
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
    expectStatus(
      await postFacetPageAction(owner, folderId, purpose.id, {
        action: 'document_transaction',
        mutation_id: crypto.randomUUID(),
        base_revision: page.revision,
        operations: [
          put(heading, 'heading1', 'Why'),
          put(parent, 'bullet', 'Principle'),
          put(child, 'checklist', 'Verified', true),
          {
            op: 'set_outline',
            items: [
              { kind: 'block', id: heading, section_block_id: null, list_parent_block_id: null },
              { kind: 'block', id: parent, section_block_id: null, list_parent_block_id: null },
              { kind: 'block', id: child, section_block_id: null, list_parent_block_id: parent },
            ],
          },
        ],
      }),
      200,
      'Purpose document stages',
    )

    const document = await exportOf(owner)
    const exported = document.facets.find((facet) => facet.id === purpose.id)
    expect(exported, 'the existing facets collection carries native Purpose').toBeDefined()
    expect(exported).toMatchObject({
      folder_id: folderId,
      kind: 'purpose',
      name: 'Direction',
      display_name: 'Direction',
      private: false,
    })
    expect(
      exported?.blocks.map((block) => [
        block.kind,
        block.list_parent_block_id,
        block.checked,
      ]),
      '4.17 storage structure travels unchanged through the existing export shape',
    ).toEqual([
      ['heading1', null, null],
      ['bullet', null, null],
      ['checklist', parent, true],
    ])
  })
})
