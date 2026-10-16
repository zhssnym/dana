import { randomUUID } from 'node:crypto'

import { expect, test } from 'vitest'

import type { PageBlock, PageView } from '../../src/shared/pages.js'
import { folderToWorkflowFile, importWorkflowBody } from '../../src/shared/workflows.js'

test('workflow export reports synced omissions without leaking source identifiers', () => {
  const source = randomUUID()
  const block: PageBlock = {
    id: randomUUID(), kind: 'synced', text: source, position: 0,
    page_position: 'a0', section_block_id: null, list_parent_block_id: null,
    checked: null, rich_content: null, file_id: null, ref_folder_id: null,
    file_width: null, file_height: null, width_pct: null, updated_at: '2026-10-16T00:00:00Z',
  }
  const page: PageView = { blocks: [block], items: [{ kind: 'block', id: block.id }] }
  const saved = folderToWorkflowFile('Page', [], [], page, [], { display_name: 'Purpose', page })
  expect(saved.omitted).toBe(2)
  expect(saved.file.folders[0]?.page?.blocks).toEqual([{ kind: 'omitted', was: 'synced' }])
  expect(saved.file.folders[0]?.purpose?.blocks).toEqual([{ kind: 'omitted', was: 'synced' }])
  expect(JSON.stringify(saved.file)).not.toContain(source)
  expect(importWorkflowBody.safeParse(saved.file).success).toBe(true)
})
