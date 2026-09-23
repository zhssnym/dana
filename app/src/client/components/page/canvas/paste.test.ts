// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { afterEach, describe, expect, test } from 'vitest'

import { canvasSchema } from './schema.js'
import type { CanvasEditor } from './schema.js'
import { normalizeCanvasPaste } from './paste.js'

const editors: CanvasEditor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.unmount()
})

function editorWith(
  blocks: Parameters<typeof BlockNoteEditor.create>[0] extends infer _T
    ? never
    : never,
): never {
  throw new Error(String(blocks))
}

function create(blocks: Parameters<CanvasEditor['replaceBlocks']>[1]): CanvasEditor {
  const editor = BlockNoteEditor.create({ schema: canvasSchema })
  editors.push(editor)
  editor.replaceBlocks(editor.document, blocks)
  return editor
}

describe('canvas paste normalization', () => {
  test('Purpose keeps supported authored kinds and nested-list structure', () => {
    const editor = create([
      {
        id: 'bullet',
        type: 'bulletListItem',
        content: 'One',
        children: [
          {
            id: 'numbered',
            type: 'numberedListItem',
            content: 'Two',
            children: [
              {
                id: 'check',
                type: 'checkListItem',
                props: { checked: true },
                content: 'Three',
              },
            ],
          },
        ],
      },
      { id: 'quote', type: 'quote', content: 'Quoted' },
      { id: 'callout', type: 'callout', content: 'Remember' },
      { id: 'code', type: 'codeBlock', content: 'npm run gate' },
    ])

    const normalized = normalizeCanvasPaste(editor.document, 0, true)
    expect(normalized.map((item) => item.type)).toEqual([
      'bulletListItem',
      'quote',
      'callout',
      'codeBlock',
    ])
    expect(normalized[0]?.children?.[0]?.type).toBe('numberedListItem')
    expect(normalized[0]?.children?.[0]?.children?.[0]?.type).toBe(
      'checkListItem',
    )
    expect(
      (
        normalized[0]?.children?.[0]?.children?.[0]?.props as
          | { checked?: boolean }
          | undefined
      )?.checked,
    ).toBe(true)
  })

  test('Purpose flattens pasted Work headings into presentation headings', () => {
    const editor = create([
      {
        id: 'work',
        type: 'heading',
        props: { level: 1, isToggleable: true },
        content: 'Direction',
        children: [{ id: 'copy', type: 'paragraph', content: 'Because.' }],
      },
    ])
    const normalized = normalizeCanvasPaste(editor.document, 0, true)
    expect(normalized).toHaveLength(2)
    expect(normalized[0]).toMatchObject({
      type: 'heading',
      props: { level: 1, isToggleable: false },
    })
    expect(normalized[1]).toMatchObject({ type: 'paragraph' })
  })
})
