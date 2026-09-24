// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import { blockSelectionFor, isBlockSelection, rangeFor, selectedBlocks } from './marquee.js'

function editorWith(): BlockNoteEditor {
  return BlockNoteEditor.create({
    initialContent: [
      { id: 'a', type: 'paragraph', content: 'A' },
      { id: 'b', type: 'paragraph', content: 'B', children: [
        { id: 'b1', type: 'paragraph', content: 'B1' },
        { id: 'b2', type: 'paragraph', content: 'B2' },
      ] },
      { id: 'c', type: 'paragraph', content: 'C' },
      { id: 'd', type: 'paragraph', content: 'D' },
    ],
  })
}

function selectedAfter(editor: BlockNoteEditor, ids: string[]): string[] {
  const state = editor.prosemirrorState
  const selection = blockSelectionFor(state.doc, ids)
  expect(selection).not.toBeNull()
  const next = state.apply(state.tr.setSelection(selection!))
  expect(isBlockSelection(next.selection)).toBe(true)
  return selectedBlocks(next).map((block) => block.id)
}

describe('block selection ranges', () => {
  test('a run of siblings is selected whole, in document order', () => {
    const editor = editorWith()
    expect(selectedAfter(editor, ['d', 'a'])).toEqual(['a', 'b', 'c', 'd'])
    expect(selectedAfter(editor, ['c'])).toEqual(['c'])
  })

  test('children of one block stay a nested run', () => {
    expect(selectedAfter(editorWith(), ['b2', 'b1'])).toEqual(['b1', 'b2'])
  })

  test('a child and a block outside its parent lift to the parent', () => {
    expect(selectedAfter(editorWith(), ['b2', 'c'])).toEqual(['b', 'c'])
  })

  test('unknown ids select nothing', () => {
    const editor = editorWith()
    expect(rangeFor(editor.prosemirrorState.doc, ['missing'])).toBeNull()
  })
})
