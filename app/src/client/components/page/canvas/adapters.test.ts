// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'
import type { PageBlock, PageView } from '../../../../shared/pages.js'
import { canvasSchema } from './schema.js'
import { canvasOperations, dehydrateCanvas, hydrateCanvas } from './adapters.js'

function block(id: string, kind: PageBlock['kind'], parent: string | null = null): PageBlock {
  return { id, kind, section_block_id: parent, position: 0, page_position: null, text: id, file_id: null, file_width: null, file_height: null, width_pct: null, ref_folder_id: null, updated_at: '2026-09-13T00:00:00Z' }
}
describe('page and editor adapters', () => {
  test('round-trips explicit ancestry, root prose, rich labels and durable image width', () => {
    const page: PageView = { blocks: [block('h1', 'section'), block('h2', 'section', 'h1'), { ...block('prose', 'paragraph', 'h2'), text: 'Read this', rich_content: { version: 1, runs: [{ text: 'Read ', bold: true }, { text: 'this', italic: true, href: 'https://example.com' }] } }, block('root', 'paragraph'), { ...block('image', 'image', 'h1'), file_id: '00000000-0000-4000-8000-000000000001', width_pct: 50 }], items: ['h1', 'h2', 'prose', 'task', 'image', 'root'].map((id) => ({ kind: id === 'task' ? 'task' : 'block', id })), task_placements: [{ id: 'task', section_block_id: 'h2' }] }
    const input = hydrateCanvas(page, 600)
    expect(input.map((item) => item.id)).toEqual(['h1', 'root'])
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: input })
    const document = dehydrateCanvas(editor.document, 600)
    expect(document.items.find((item) => item.id === 'task')?.section_block_id).toBe('h2')
    expect(document.items.find((item) => item.id === 'root')?.section_block_id).toBeNull()
    expect(document.blocks.find((item) => item.id === 'prose')?.rich_content).toEqual(page.blocks[2]?.rich_content)
    expect(document.blocks.find((item) => item.id === 'image')).toMatchObject({ file_id: page.blocks[4]?.file_id, width_pct: 50 })
    editor.unmount()
  })
  test('heading level is ancestry depth, so a third Section level hydrates as H3 while a legacy page keeps H1/H2', () => {
    const level = (node: { props?: unknown } | undefined): number | undefined => (node?.props as { level?: number } | undefined)?.level
    const deep: PageView = {
      blocks: [block('h1', 'section'), block('h2', 'section', 'h1'), block('h3', 'section', 'h2'), block('prose', 'paragraph', 'h3')],
      items: ['h1', 'h2', 'h3', 'prose', 'task'].map((id) => ({ kind: id === 'task' ? 'task' : 'block', id })),
      task_placements: [{ id: 'task', section_block_id: 'h3' }],
    }
    const input = hydrateCanvas(deep, 600)
    expect(input.map((item) => item.id)).toEqual(['h1'])
    const one = input[0]!, two = one.children![0]!, three = two.children![0]!
    expect([two.id, three.id]).toEqual(['h2', 'h3'])
    expect([level(one), level(two), level(three)]).toEqual([1, 2, 3])
    // The Task and its prose hang off the H3 itself, not off either ancestor.
    expect(three.children!.map((child) => child.id)).toEqual(['prose', 'task'])
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: input })
    expect(dehydrateCanvas(editor.document, 600).items).toEqual([
      { kind: 'block', id: 'h1', section_block_id: null },
      { kind: 'block', id: 'h2', section_block_id: 'h1' },
      { kind: 'block', id: 'h3', section_block_id: 'h2' },
      { kind: 'block', id: 'prose', section_block_id: 'h3' },
      { kind: 'task', id: 'task', section_block_id: 'h3' },
    ])
    editor.unmount()
    // A page that only ever had two levels hydrates exactly as it did before.
    const legacy = hydrateCanvas({ blocks: [block('a', 'section'), block('b', 'section', 'a')], items: [{ kind: 'block', id: 'a' }, { kind: 'block', id: 'b' }], task_placements: [] }, 600)
    expect(level(legacy[0])).toBe(1)
    expect(level(legacy[0]!.children![0])).toBe(2)
  })
  test('one multi-block edit emits only changed records and one complete outline', () => {
    const before = { blocks: [], items: [] }
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: [{ id: 'p1', type: 'paragraph', content: 'One' }, { id: 'p2', type: 'paragraph', content: 'Two' }] })
    const after = dehydrateCanvas(editor.document, 600)
    expect(canvasOperations(before, after).map((op) => op.op)).toEqual(['put_block', 'put_block', 'set_outline'])
    expect(canvasOperations(after, after).map((op) => op.op)).toEqual(['set_outline'])
    editor.unmount()
  })
})
