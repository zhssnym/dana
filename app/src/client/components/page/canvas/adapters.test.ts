// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'
import type { PageBlock, PageView } from '../../../../shared/pages.js'
import { canvasSchema } from './schema.js'
import { canvasOperations, dehydrateCanvas, folderRefsOf, hydrateCanvas, mergeWorkDocument, workPageOf } from './adapters.js'

function block(id: string, kind: PageBlock['kind'], parent: string | null = null): PageBlock {
  return { id, kind, section_block_id: parent, list_parent_block_id: null, checked: null, position: 0, page_position: null, text: id, file_id: null, file_width: null, file_height: null, width_pct: null, ref_folder_id: null, updated_at: '2026-09-13T00:00:00Z' }
}
describe('page and editor adapters', () => {
  test('a Work facet edits one H1 subtree without replacing Main siblings', () => {
    const page: PageView = {
      revision: 'r1',
      blocks: [
        block('h1-a', 'section'),
        block('a-copy', 'paragraph', 'h1-a'),
        block('h1-b', 'section'),
        block('b-copy', 'paragraph', 'h1-b'),
      ],
      items: ['h1-a', 'a-copy', 'h1-b', 'b-copy'].map((id) => ({ kind: 'block', id })),
      task_placements: [],
    }
    const focused = workPageOf(page, 'h1-a')
    expect(focused.items.map((item) => item.id)).toEqual(['a-copy'])
    expect(focused.blocks[0]?.section_block_id).toBeNull()

    const edited = {
      blocks: [{
        id: 'a-copy', block_kind: 'paragraph' as const, text: 'Changed',
        rich_content: { version: 1 as const, runs: [{ text: 'Changed' }] },
        file_id: null, ref_folder_id: null, width_pct: null, checked: null,
      }],
      items: [{ kind: 'block' as const, id: 'a-copy', section_block_id: null, list_parent_block_id: null }],
    }
    const merged = mergeWorkDocument(page, 'h1-a', edited)
    expect(merged.items.map((item) => item.id)).toEqual(['h1-a', 'a-copy', 'h1-b', 'b-copy'])
    expect(merged.items.find((item) => item.id === 'a-copy')?.section_block_id).toBe('h1-a')
    expect(merged.blocks.find((item) => item.id === 'b-copy')?.text).toBe('b-copy')
  })
  test('round-trips explicit ancestry, root prose, rich labels and durable image width', () => {
    const page: PageView = { blocks: [block('h1', 'section'), block('h2', 'section', 'h1'), { ...block('prose', 'paragraph', 'h2'), text: 'Read this', rich_content: { version: 1, runs: [{ text: 'Read ', bold: true }, { text: 'this', italic: true, href: 'https://example.com' }] } }, block('root', 'paragraph'), { ...block('image', 'image', 'h1'), file_id: '00000000-0000-4000-8000-000000000001', width_pct: 50 }], items: ['h1', 'h2', 'prose', 'task', 'image', 'root'].map((id) => ({ kind: id === 'task' ? 'task' : 'block', id })), task_placements: [{ id: 'task', section_block_id: 'h2' }] }
    const input = hydrateCanvas(page, 600)
    expect(input.map((item) => item.id)).toEqual(['h1', 'root'])
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: input })
    const document = dehydrateCanvas(editor.document, 600, folderRefsOf(page))
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
    expect(dehydrateCanvas(editor.document, 600, folderRefsOf(deep)).items).toEqual([
      // #219 gave every placement a second, independent parent. This editor
      // expresses no list nesting yet, so every one of them is null here; what
      // the field must never do is stand in for the Section beside it.
      { kind: 'block', id: 'h1', section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: 'h2', section_block_id: 'h1', list_parent_block_id: null },
      { kind: 'block', id: 'h3', section_block_id: 'h2', list_parent_block_id: null },
      { kind: 'block', id: 'prose', section_block_id: 'h3', list_parent_block_id: null },
      { kind: 'task', id: 'task', section_block_id: 'h3', list_parent_block_id: null },
    ])
    editor.unmount()
    // A page that only ever had two levels hydrates exactly as it did before.
    const legacy = hydrateCanvas({ blocks: [block('a', 'section'), block('b', 'section', 'a')], items: [{ kind: 'block', id: 'a' }, { kind: 'block', id: 'b' }], task_placements: [] }, 600)
    expect(level(legacy[0])).toBe(1)
    expect(level(legacy[0]!.children![0])).toBe(2)
  })
  /*
  #219's backend phase landed six structured kinds that this editor cannot draw
  yet, so it hydrates each of them as a paragraph. Without the guard in
  canvasOperations the next save would read that rendering as a conversion and
  flatten the page: the kinds gone, the ticks gone, the nesting gone, silently.
  These two cases are that guard in both directions.

  **They are not evidence that a save keeps any of it, and this file is where
  that was believed.** Both hand `before` the true kinds; the caller built it
  with `dehydrateCanvas`, which knows three kinds and no nesting, so the branch
  they exercise could not fire in the composition these assertions were read as
  covering, and every save flattened the page for a release with this test
  green (issue #250). The criteria that measure the composition are AC-464 to
  AC-466, which drive `FolderCanvas` itself, and AC-580, which sends what it
  emits through the server. Read these two as unit cases over one function and
  take no comfort from them about the save path.
  */
  test('a kind this editor cannot express is preserved across a save, and a dangling list parent is dropped', () => {
    const record = (id: string, kind: PageBlock['kind'], checked: boolean | null = null) =>
      ({ id, block_kind: kind, text: id, rich_content: { version: 1 as const, runs: [{ text: id }] }, file_id: null, ref_folder_id: null, width_pct: null, checked })
    const before = {
      blocks: [record('bullet', 'bullet'), record('tick', 'checklist', true)],
      items: [
        { kind: 'block' as const, id: 'bullet', section_block_id: null, list_parent_block_id: null },
        { kind: 'block' as const, id: 'tick', section_block_id: null, list_parent_block_id: 'bullet' },
      ],
    }
    // What this build's dehydrateCanvas produces from that page: paragraphs,
    // no ticks, no nesting.
    const flattened = {
      blocks: [record('bullet', 'paragraph'), record('tick', 'paragraph')],
      items: [
        { kind: 'block' as const, id: 'bullet', section_block_id: null, list_parent_block_id: null },
        { kind: 'block' as const, id: 'tick', section_block_id: null, list_parent_block_id: null },
      ],
    }
    const unchanged = canvasOperations(before, flattened)
    expect(unchanged.map((op) => op.op)).toEqual(['set_outline'])
    expect(unchanged.at(-1)).toEqual({ op: 'set_outline', items: before.items })

    // Delete the parent and the child is promoted rather than left naming a
    // block the save no longer carries, which the server would refuse forever.
    const removed = canvasOperations(before, { blocks: [flattened.blocks[1]!], items: [flattened.items[1]!] })
    expect(removed.map((op) => op.op)).toEqual(['delete_block', 'set_outline'])
    expect(removed.at(-1)).toEqual({ op: 'set_outline', items: [{ kind: 'block', id: 'tick', section_block_id: null, list_parent_block_id: null }] })
  })
  test('presentation headings round-trip as flat document headings rather than Work Sections', () => {
    const page: PageView = {
      blocks: [
        { ...block('purpose-h1', 'heading1'), text: 'Why this exists' },
        { ...block('purpose-copy', 'paragraph'), text: 'Keep the intent visible.' },
      ],
      items: [
        { kind: 'block', id: 'purpose-h1' },
        { kind: 'block', id: 'purpose-copy' },
      ],
      task_placements: [],
    }
    const input = hydrateCanvas(page, 600)
    expect(input.map((item) => item.id)).toEqual(['purpose-h1', 'purpose-copy'])
    expect(input[0]?.type).toBe('heading')
    expect((input[0]?.props as { level?: number; isToggleable?: boolean } | undefined)).toMatchObject({
      level: 1,
      isToggleable: false,
    })

    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: input })
    const unchanged = dehydrateCanvas(editor.document, 600, folderRefsOf(page))
    expect(unchanged.blocks.find((item) => item.id === 'purpose-h1')?.block_kind).toBe('heading1')
    expect(unchanged.items).toEqual([
      { kind: 'block', id: 'purpose-h1', section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: 'purpose-copy', section_block_id: null, list_parent_block_id: null },
    ])

    editor.updateBlock('purpose-h1', { props: { level: 3, isToggleable: false } })
    const changed = dehydrateCanvas(editor.document, 600, folderRefsOf(page))
    expect(changed.blocks.find((item) => item.id === 'purpose-h1')?.block_kind).toBe('heading3')
    expect(changed.items.find((item) => item.id === 'purpose-copy')?.section_block_id).toBeNull()
    editor.unmount()
  })

  test('one multi-block edit emits only changed records and one complete outline', () => {
    const before = { blocks: [], items: [] }
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: [{ id: 'p1', type: 'paragraph', content: 'One' }, { id: 'p2', type: 'paragraph', content: 'Two' }] })
    const after = dehydrateCanvas(editor.document, 600, new Map())
    expect(canvasOperations(before, after).map((op) => op.op)).toEqual(['put_block', 'put_block', 'set_outline'])
    expect(canvasOperations(after, after).map((op) => op.op)).toEqual(['set_outline'])
    editor.unmount()
  })
})
