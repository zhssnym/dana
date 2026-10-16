// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import type { PageBlock } from '../../../../shared/pages.js'
import { mirroredBlockInput } from './SyncedBlockMirror.js'

const ID = '00000000-0000-4000-8000-000000000010'
const FILE = '00000000-0000-4000-8000-000000000020'
const PARENT = '00000000-0000-4000-8000-000000000030'

function block(overrides: Partial<PageBlock> = {}): PageBlock {
  return {
    id: ID,
    kind: 'paragraph',
    position: 0,
    page_position: 'a0',
    section_block_id: null,
    list_parent_block_id: null,
    toggleable: null,
    checked: null,
    rich_content: null,
    text: 'Canonical text',
    file_id: null,
    file_width: null,
    file_height: null,
    file_reclaimed_at: null,
    file_name: null,
    ref_folder_id: null,
    width_pct: null,
    updated_at: '2026-10-03T00:00:00.000Z',
    ...overrides,
  }
}

describe('synced block mirror', () => {
  test('renders a canonical File through Dana native file hydration', () => {
    const input = mirroredBlockInput(block({
      kind: 'file',
      text: null,
      file_id: FILE,
      file_name: 'final-package.pdf',
    }), 640)

    expect(input).toMatchObject({
      id: ID,
      type: 'file',
      props: {
        url: `/api/v1/files/${FILE}`,
        name: 'final-package.pdf',
      },
    })
  })

  test('renders a canonical image with its real media identity and width', () => {
    const input = mirroredBlockInput(block({
      kind: 'image',
      text: 'North elevation',
      file_id: FILE,
      file_name: 'elevation.png',
      width_pct: 50,
    }), 800)

    expect(input).toMatchObject({
      id: ID,
      type: 'image',
      props: {
        url: `/api/v1/files/${FILE}`,
        caption: 'North elevation',
        previewWidth: 400,
      },
    })
  })

  test('renders the same paragraph content without depending on its source hierarchy', () => {
    const input = mirroredBlockInput(block({
      section_block_id: PARENT,
      list_parent_block_id: PARENT,
      rich_content: { version: 1, runs: [{ text: 'Approved final design', bold: true }] },
      text: 'Approved final design',
    }), 640)

    expect(input).toMatchObject({
      id: ID,
      type: 'paragraph',
      content: [{ type: 'text', text: 'Approved final design', styles: { bold: true } }],
    })
  })
})
