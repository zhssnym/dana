// @vitest-environment jsdom
/*
AC-996 to AC-998: the Task composer's projection and its conflict merge lose
no writing (issue #221, the Task half).
*/
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import { documentOperation } from '../../../../shared/page-document.js'
import { baselineOf, canvasOperations } from './adapters.js'
import { dehydrateTask, hydrateTask, mergeDraft, taskSchema } from './TaskComposer.js'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = id(99)
function block(n: number, kind: string, text: string | null, extra: Partial<PageView['blocks'][number]> = {}): PageView['blocks'][number] {
  return {
    id: id(n), kind: kind as PageView['blocks'][number]['kind'], position: n, page_position: null, section_block_id: null,
    list_parent_block_id: null, checked: null, rich_content: null, text, file_id: null, file_width: null, file_height: null,
    file_reclaimed_at: null, file_name: null, ref_folder_id: null, width_pct: null, updated_at: new Date(0).toISOString(), ...extra,
  }
}
const stored: PageView = {
  revision: 'r1', task_placements: [],
  blocks: [
    block(1, 'paragraph', 'Legacy line one\nLegacy line two'),
    block(2, 'heading2', 'Plan', { rich_content: { version: 1, runs: [{ text: 'Plan', bold: true }] } }),
    block(3, 'bullet', 'first'),
    block(4, 'numbered', 'second'),
    block(5, 'quote', 'said'),
    block(6, 'code', 'x = 1'),
    block(7, 'image', 'caption', { file_id: file, width_pct: 50 }),
    block(8, 'file', null, { file_id: id(98), file_name: 'report.pdf' }),
    block(9, 'callout', 'careful'),
    block(10, 'checklist', 'ticked', { checked: true }),
    block(11, 'divider', null),
  ],
  items: Array.from({ length: 11 }, (_, i) => ({ kind: 'block' as const, id: id(i + 1) })),
} as PageView
const editorOf = (page: PageView): typeof taskSchema.BlockNoteEditor =>
  BlockNoteEditor.create({ schema: taskSchema, initialContent: hydrateTask(page, 600) })

describe('Task composer', () => {
  test('AC-996 every stored kind and every character survives an untouched open, and an open writes nothing', () => {
    const editor = editorOf(stored)
    const drawn = dehydrateTask(editor.document, 600)
    const baseline = baselineOf(stored, drawn)
    expect(editor.getBlock(id(8))?.props).toMatchObject({ name: 'report.pdf' })
    expect(baseline.blocks.map((b) => [b.block_kind, b.text, b.file_id])).toEqual([
      ['paragraph', 'Legacy line one\nLegacy line two', null], ['heading2', 'Plan', null], ['bullet', 'first', null],
      ['numbered', 'second', null], ['quote', 'said', null], ['code', 'x = 1', null], ['image', 'caption', file],
      ['file', null, id(98)], ['callout', 'careful', null], ['checklist', 'ticked', null],
      ['divider', null, null],
    ])
    expect(baseline.blocks[9]?.checked).toBe(true)
    expect(baseline.blocks[1]?.rich_content?.runs).toEqual([{ text: 'Plan', bold: true }])
    expect(baseline.blocks[6]?.width_pct).toBe(50)
    expect(canvasOperations(baseline, dehydrateTask(editor.document, 600)).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('AC-997 converting a drawn kind to text is written, and an indented block is written nested under the block above it', () => {
    const editor = editorOf(stored)
    const baseline = baselineOf(stored, dehydrateTask(editor.document, 600))
    editor.updateBlock(id(3), { type: 'paragraph' })
    editor.updateBlock(id(5), { children: [{ id: id(20), type: 'paragraph', content: 'nested words' }] })
    const after = dehydrateTask(editor.document, 600)
    const ops = canvasOperations(baseline, after)
    expect(ops.find((op) => op.op === 'put_block' && op.id === id(3))).toMatchObject({ block_kind: 'paragraph', text: 'first' })
    expect(after.items.find((item) => item.id === id(20))).toMatchObject({ list_parent_block_id: id(5), section_block_id: null })
    expect(after.items.filter((item) => item.id !== id(20)).every((item) => item.list_parent_block_id === null && item.section_block_id === null)).toBe(true)
    expect(after.blocks.find((b) => b.id === id(20))?.text).toBe('nested words')
    // It reopens where it was written.
    const reopened = editorOf({ ...stored, blocks: [...stored.blocks, block(20, 'paragraph', 'nested words', { list_parent_block_id: id(5) })], items: after.items.map((item) => ({ kind: 'block' as const, id: item.id })) } as PageView)
    expect(reopened.getBlock(id(5))?.children.map((child) => child.id)).toEqual([id(20)])
  })

  test('AC-1082 an empty File block (the picker placeholder) is not written, so the rest of the note still saves', () => {
    const page = { ...stored, blocks: [block(1, 'paragraph', 'kept')], items: [{ kind: 'block' as const, id: id(1) }] } as PageView
    const editor = editorOf(page)
    editor.insertBlocks([{ type: 'file' }], editor.document[0]!, 'after')
    const drawn = dehydrateTask(editor.document, 600)
    expect(drawn.blocks.map((b) => b.block_kind)).toEqual(['paragraph'])
  })

  test('an uploaded Task File keeps its filename for display but writes only the file relation', () => {
    const page = { ...stored, blocks: [block(1, 'paragraph', 'kept')], items: [{ kind: 'block' as const, id: id(1) }] } as PageView
    const editor = editorOf(page)
    const fileId = id(97)
    const inserted = editor.insertBlocks([{ id: id(20), type: 'file', props: { url: `/api/v1/files/${fileId}`, name: 'spec.pdf' } }], editor.document[0]!, 'after')[0]
    expect(inserted?.props).toMatchObject({ name: 'spec.pdf' })
    const record = dehydrateTask(editor.document, 600).blocks.find((candidate) => candidate.id === id(20))
    expect(record).toMatchObject({ block_kind: 'file', text: null, rich_content: null, file_id: fileId })
    expect(documentOperation.safeParse({ op: 'put_block', ...record }).success).toBe(true)
  })

  test('a toggle heading keeps its fold and its children across a save and a reload', () => {
    const page = { ...stored, blocks: [block(1, 'heading2', 'Folded', { toggleable: true }), block(2, 'bullet', 'inside', { list_parent_block_id: id(1) })], items: [{ kind: 'block' as const, id: id(1) }, { kind: 'block' as const, id: id(2) }] } as PageView
    const editor = editorOf(page)
    expect(editor.document[0]?.props).toMatchObject({ level: 2, isToggleable: true })
    const drawn = dehydrateTask(editor.document, 600)
    expect(drawn.blocks[0]).toMatchObject({ block_kind: 'heading2', toggleable: true })
    expect(drawn.items.map((item) => item.list_parent_block_id)).toEqual([null, id(1)])
    expect(canvasOperations(baselineOf(page, drawn), dehydrateTask(editor.document, 600)).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('a toggle and a diagram in Task writing survive save and reload', () => {
    const page = { ...stored,
      blocks: [block(1, 'toggle', 'Steps'), block(2, 'paragraph', 'First step', { list_parent_block_id: id(1) }), block(3, 'diagram', 'Start -> Finish')],
      items: [1, 2, 3].map((n) => ({ kind: 'block' as const, id: id(n) })),
    } as PageView
    const editor = editorOf(page)
    const baseline = baselineOf(page, dehydrateTask(editor.document, 600))
    editor.updateBlock(id(1), { content: 'Updated steps' })
    editor.updateBlock(id(3), { props: { source: 'Start -> Check\nCheck -> Finish' } })
    const drawn = dehydrateTask(editor.document, 600)
    expect(drawn.blocks.map((entry) => [entry.block_kind, entry.text])).toEqual([
      ['toggle', 'Updated steps'], ['paragraph', 'First step'], ['diagram', 'Start -> Check\nCheck -> Finish'],
    ])
    expect(drawn.items[1]?.list_parent_block_id).toBe(id(1))
    expect(canvasOperations(baseline, drawn).filter((op) => op.op === 'put_block').map((op) => [op.block_kind, op.text])).toEqual([
      ['toggle', 'Updated steps'], ['diagram', 'Start -> Check\nCheck -> Finish'],
    ])
    const saved = { ...page, blocks: page.blocks.map((entry) => {
      const record = drawn.blocks.find((candidate) => candidate.id === entry.id)!
      const item = drawn.items.find((candidate) => candidate.id === entry.id)!
      return { ...entry, kind: record.block_kind, text: record.text, rich_content: record.rich_content, list_parent_block_id: item.list_parent_block_id }
    }) } as PageView
    expect(dehydrateTask(editorOf(saved).document, 600)).toEqual(drawn)
  })

  test('AC-998 merging a conflicted draft into the latest copy removes nothing from either', () => {
    const latest = editorOf(stored)
    latest.updateBlock(id(5), { content: 'said by tab A' })
    const draft = editorOf(stored)
    draft.updateBlock(id(1), { content: 'Tab B rewrote this' })
    draft.insertBlocks([{ id: id(30), type: 'paragraph', content: 'Tab B new line' }], id(2), 'after')
    draft.removeBlocks([id(4)])
    const merged = BlockNoteEditor.create({ schema: taskSchema, initialContent: mergeDraft(latest.document, draft.document) })
    const texts = dehydrateTask(merged.document, 600).blocks.map((b) => b.text)
    for (const text of ['Legacy line one\nLegacy line two', 'Tab B rewrote this', 'Tab B new line', 'second', 'said by tab A', 'said', 'careful']) {
      expect(texts).toContain(text)
    }
    expect(texts.indexOf('Tab B rewrote this')).toBe(texts.indexOf('Legacy line one\nLegacy line two') + 1)
  })
})
