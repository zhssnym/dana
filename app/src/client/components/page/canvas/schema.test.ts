// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { canvasSchema } from './schema.js'
import type { CanvasEditor } from './schema.js'
import { installCanvasGuard } from './guard.js'

const editors: CanvasEditor[] = []
afterEach(() => { for (const editor of editors.splice(0)) editor.unmount() })

function createEditor(): CanvasEditor {
  const editor = BlockNoteEditor.create({ schema: canvasSchema })
  editor.mount(document.createElement('div'))
  editors.push(editor)
  return editor
}

describe('restrained BlockNote integration', () => {
  test('supported before-change hook refuses an entire mixed deletion and allows ordinary prose edits', () => {
    const editor = createEditor()
    editor.replaceBlocks(editor.document, [
      { id: 'before', type: 'paragraph', content: 'Before' },
      { id: 'task-block', type: 'danaTask', props: { taskId: 'real-task-id' } },
      { id: 'after', type: 'paragraph', content: 'After' },
    ])
    const explain = vi.fn()
    const stop = installCanvasGuard(editor, explain)
    const original = editor.document
    editor.removeBlocks(['before', 'task-block'])
    expect(editor.document).toEqual(original)
    expect(explain).toHaveBeenCalledWith(expect.stringContaining('Dana menu'))
    editor.updateBlock('after', { content: 'Still editable' })
    expect(editor.document[2]?.content).toEqual([{ type: 'text', text: 'Still editable', styles: {} }])
    stop()
  })

  test('the same transaction hook rejects invalid depth before it can reach saving', () => {
    const editor = createEditor()
    const explain = vi.fn()
    const stop = installCanvasGuard(editor, explain)
    const original = editor.document
    editor.updateBlock(original[0]!, { type: 'heading', props: { level: 2 } })
    expect(editor.document).toEqual(original)
    expect(explain).toHaveBeenCalledWith(expect.stringContaining('Only two levels'))
    stop()
  })

  test('upstream HTML parsing keeps text and labelled links while dropping unsupported inline styling', () => {
    const blocks = createEditor().tryParseHTMLToBlocks(
      '<p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <code>code</code> <a href="https://example.com/plan">the plan</a></p>',
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: 'Bold', styles: { bold: true } }),
      expect.objectContaining({ type: 'text', text: 'italic', styles: { italic: true } }),
      expect.objectContaining({ type: 'link', href: 'https://example.com/plan', content: [
        { type: 'text', text: 'the plan', styles: {} },
      ] }),
    ]))
    const serialized = JSON.stringify(blocks)
    expect(serialized).toContain('underline')
    expect(serialized).not.toContain('"underline":true')
    expect(serialized).not.toContain('"strike":true')
    expect(serialized).not.toContain('"code":true')
  })

  test('Task content contains identity only while upstream editing can retain its position', () => {
    const editor = createEditor()
    editor.replaceBlocks(editor.document, [
      { id: 'before', type: 'paragraph', content: 'Before' },
      { id: 'task-block', type: 'danaTask', props: { taskId: 'real-task-id' } },
      { id: 'after', type: 'paragraph', content: 'After' },
    ])
    editor.updateBlock('before', { content: 'Updated context' })
    expect(editor.document[1]).toMatchObject({ id: 'task-block', type: 'danaTask', props: { taskId: 'real-task-id' } })
    expect(editor.document[1]?.content).toBeUndefined()
    expect(Object.keys(editor.document[1]?.props ?? {})).toEqual(['taskId'])
  })
})
