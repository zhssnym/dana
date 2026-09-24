// @vitest-environment jsdom
/*
AC-996 to AC-998: the Task composer's projection and its conflict merge lose
no writing (issue #221, the Task half).
*/
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import { baselineOf, canvasOperations } from './adapters.js'
import { dehydrateTask, hydrateTask, mergeDraft, taskSchema } from './TaskComposer.js'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = id(99)
function block(n: number, kind: string, text: string | null, extra: Partial<PageView['blocks'][number]> = {}): PageView['blocks'][number] {
  return {
    id: id(n), kind: kind as PageView['blocks'][number]['kind'], position: n, page_position: null, section_block_id: null,
    list_parent_block_id: null, checked: null, rich_content: null, text, file_id: null, file_width: null, file_height: null,
    file_reclaimed_at: null, ref_folder_id: null, width_pct: null, updated_at: new Date(0).toISOString(), ...extra,
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
    block(8, 'file', 'report.pdf', { file_id: id(98) }),
    block(9, 'callout', 'careful'),
  ],
  items: Array.from({ length: 9 }, (_, i) => ({ kind: 'block' as const, id: id(i + 1) })),
} as PageView
const editorOf = (page: PageView): typeof taskSchema.BlockNoteEditor =>
  BlockNoteEditor.create({ schema: taskSchema, initialContent: hydrateTask(page, 600) })

describe('Task composer', () => {
  test('AC-996 every stored kind and every character survives an untouched open, and an open writes nothing', () => {
    const editor = editorOf(stored)
    const drawn = dehydrateTask(editor.document, 600)
    const unexpressed = new Set(['callout', 'checklist'])
    const baseline = baselineOf(stored, drawn, unexpressed)
    expect(baseline.blocks.map((b) => [b.block_kind, b.text, b.file_id])).toEqual([
      ['paragraph', 'Legacy line one\nLegacy line two', null], ['heading2', 'Plan', null], ['bullet', 'first', null],
      ['numbered', 'second', null], ['quote', 'said', null], ['code', 'x = 1', null], ['image', 'caption', file],
      ['file', 'report.pdf', id(98)], ['callout', 'careful', null],
    ])
    expect(baseline.blocks[1]?.rich_content?.runs).toEqual([{ text: 'Plan', bold: true }])
    expect(baseline.blocks[6]?.width_pct).toBe(50)
    expect(canvasOperations(baseline, dehydrateTask(editor.document, 600), unexpressed).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('AC-997 converting a drawn kind to text is written, and an indented block is written flat with its words', () => {
    const editor = editorOf(stored)
    const unexpressed = new Set(['callout', 'checklist'])
    const baseline = baselineOf(stored, dehydrateTask(editor.document, 600), unexpressed)
    editor.updateBlock(id(3), { type: 'paragraph' })
    editor.updateBlock(id(5), { children: [{ id: id(20), type: 'paragraph', content: 'nested words' }] })
    const after = dehydrateTask(editor.document, 600)
    const ops = canvasOperations(baseline, after, unexpressed)
    expect(ops.find((op) => op.op === 'put_block' && op.id === id(3))).toMatchObject({ block_kind: 'paragraph', text: 'first' })
    expect(after.items.every((item) => item.list_parent_block_id === null && item.section_block_id === null)).toBe(true)
    expect(after.blocks.find((b) => b.id === id(20))?.text).toBe('nested words')
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
