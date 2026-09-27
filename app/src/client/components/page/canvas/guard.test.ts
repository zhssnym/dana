// @vitest-environment jsdom
/*
Wave 2: a sub-page leaves a document only by its own act ("Move page to
Trash"); a gesture that would drop one by the way is refused like a Task's.
A `/page` placement no save has created yet is still just a line.
*/
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test, vi } from 'vitest'

import { installCanvasGuard, removingPages } from './guard.js'
import { canvasSchema } from './schema.js'
import type { CanvasEditor } from './schema.js'

const BLOCK = '44444444-4444-4444-8444-444444444444'
const CHILD = '55555555-5555-4555-8555-555555555555'

function editorWithPage(): { editor: CanvasEditor; explain: ReturnType<typeof vi.fn> } {
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: [
    { id: BLOCK, type: 'danaPage', props: { folderId: CHILD } },
    { type: 'paragraph', content: 'after' },
  ] as never }) as unknown as CanvasEditor
  // The guard is a transaction hook, which runs on a mounted editor.
  editor.mount(document.createElement('div'))
  const explain = vi.fn()
  installCanvasGuard(editor, explain)
  return { editor, explain }
}

describe('the canvas guard and sub-pages', () => {
  test('removing a page block is refused with the way to trash it', () => {
    const { editor, explain } = editorWithPage()
    editor.removeBlocks([BLOCK])
    expect(editor.getBlock(BLOCK)).toBeDefined()
    expect(explain).toHaveBeenCalledWith('This selection contains a page. Move it to Trash from its ⋮⋮ menu.')
  })

  test('the explicit act removes it', () => {
    const { editor, explain } = editorWithPage()
    removingPages([CHILD], () => { editor.removeBlocks([BLOCK]) })
    expect(editor.getBlock(BLOCK)).toBeUndefined()
    expect(explain).not.toHaveBeenCalled()
    // The bypass is over once the act is.
    editor.insertBlocks([{ id: BLOCK, type: 'danaPage', props: { folderId: CHILD } }], editor.document[0]!, 'before')
    editor.removeBlocks([BLOCK])
    expect(editor.getBlock(BLOCK)).toBeDefined()
  })

})
