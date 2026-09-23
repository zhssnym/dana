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
  test('structured Purpose writing round-trips kind, rich content, ticks and list ancestry', () => {
    const bullet = {
      ...block('bullet', 'bullet'),
      text: 'First',
      rich_content: { version: 1 as const, runs: [{ text: 'First', bold: true }] },
    }
    const numbered = {
      ...block('numbered', 'numbered'),
      text: 'Second',
      rich_content: { version: 1 as const, runs: [{ text: 'Second' }] },
      list_parent_block_id: 'bullet',
    }
    const checklist = {
      ...block('check', 'checklist'),
      text: 'Confirm',
      rich_content: { version: 1 as const, runs: [{ text: 'Confirm', italic: true }] },
      list_parent_block_id: 'numbered',
      checked: true,
    }
    const quote = {
      ...block('quote', 'quote'),
      text: 'A reason',
      rich_content: { version: 1 as const, runs: [{ text: 'A reason' }] },
    }
    const callout = {
      ...block('callout', 'callout'),
      text: 'Keep this visible',
      rich_content: { version: 1 as const, runs: [{ text: 'Keep this visible' }] },
    }
    const code = {
      ...block('code', 'code'),
      text: 'npm run gate',
      rich_content: null,
    }
    const page: PageView = {
      blocks: [bullet, numbered, checklist, quote, callout, code],
      items: ['bullet', 'numbered', 'check', 'quote', 'callout', 'code'].map(
        (id) => ({ kind: 'block' as const, id }),
      ),
      task_placements: [],
    }

    const input = hydrateCanvas(page, 600)
    expect(input.map((item) => item.id)).toEqual([
      'bullet',
      'quote',
      'callout',
      'code',
    ])
    expect(input[0]?.children?.[0]?.id).toBe('numbered')
    expect(input[0]?.children?.[0]?.children?.[0]?.id).toBe('check')

    const editor = BlockNoteEditor.create({
      schema: canvasSchema,
      initialContent: input,
    })
    const saved = dehydrateCanvas(editor.document, 600, folderRefsOf(page))
    expect(
      saved.blocks.map((item) => [
        item.id,
        item.block_kind,
        item.checked,
      ]),
    ).toEqual([
      ['bullet', 'bullet', null],
      ['numbered', 'numbered', null],
      ['check', 'checklist', true],
      ['quote', 'quote', null],
      ['callout', 'callout', null],
      ['code', 'code', null],
    ])
    expect(saved.blocks.find((item) => item.id === 'bullet')?.rich_content)
      .toEqual(bullet.rich_content)
    expect(saved.blocks.find((item) => item.id === 'check')?.rich_content)
      .toEqual(checklist.rich_content)
    expect(saved.blocks.find((item) => item.id === 'code')?.rich_content)
      .toBeNull()
    expect(
      saved.items.map((item) => [
        item.id,
        item.section_block_id,
        item.list_parent_block_id,
      ]),
    ).toEqual([
      ['bullet', null, null],
      ['numbered', null, 'bullet'],
      ['check', null, 'numbered'],
      ['quote', null, null],
      ['callout', null, null],
      ['code', null, null],
    ])
    editor.unmount()
  })

  test('Purpose media round-trips exact block kind, file id and video width', () => {
    const fileId = '00000000-0000-4000-8000-000000000011'
    const audioId = '00000000-0000-4000-8000-000000000012'
    const videoId = '00000000-0000-4000-8000-000000000013'
    const page: PageView = {
      blocks: [
        { ...block('file', 'file'), text: null, file_id: fileId },
        { ...block('audio', 'audio'), text: null, file_id: audioId },
        {
          ...block('video', 'video'),
          text: null,
          file_id: videoId,
          width_pct: 50,
        },
      ],
      items: ['file', 'audio', 'video'].map((id) => ({
        kind: 'block' as const,
        id,
      })),
      task_placements: [],
    }

    const editor = BlockNoteEditor.create({
      schema: canvasSchema,
      initialContent: hydrateCanvas(page, 600),
    })
    const saved = dehydrateCanvas(editor.document, 600, folderRefsOf(page))
    expect(saved.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'file',
          block_kind: 'file',
          file_id: fileId,
        }),
        expect.objectContaining({
          id: 'audio',
          block_kind: 'audio',
          file_id: audioId,
        }),
        expect.objectContaining({
          id: 'video',
          block_kind: 'video',
          file_id: videoId,
          width_pct: 50,
        }),
      ]),
    )
    editor.unmount()
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
