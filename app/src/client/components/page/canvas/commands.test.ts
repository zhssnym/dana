// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core'
import { afterEach, describe, expect, test } from 'vitest'
import { canvasSchema } from './schema.js'
import type { CanvasEditor } from './schema.js'
import { installCanvasGuard } from './guard.js'
import { continueAfterGroup, insertCanvasHeading, removeHeadingKeepingContent } from './commands.js'

const editors: CanvasEditor[] = []
afterEach(() => { for (const editor of editors.splice(0)) editor.unmount(); window.localStorage.clear() })
function setup(): CanvasEditor {
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: [
    { id: 'group', type: 'heading', props: { level: 1 }, content: 'Group', children: [
      { id: 'direct', type: 'paragraph', content: 'Direct' },
      { id: 'subgroup', type: 'heading', props: { level: 2 }, content: 'Subgroup', children: [
        { id: 'task', type: 'danaTask', props: { taskId: 'original-task' } },
      ] },
    ] },
    { id: 'root', type: 'paragraph', content: 'Loose' },
  ] })
  editor.mount(document.createElement('div'))
  installCanvasGuard(editor, (message) => { throw new Error(message) })
  editors.push(editor)
  return editor
}
describe('heading commands preserve explicit membership', () => {
  test.each(['Backspace', 'Delete'] as const)('%s removes an empty line before a group without changing its children', (key) => {
    const editor = setup()
    editor.insertBlocks([{ id: 'empty-before', type: 'paragraph' }], 'group', 'before')
    editor.setTextCursorPosition(key === 'Backspace' ? 'group' : 'empty-before', 'start')
    editor.domElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    expect(editor.getBlock('empty-before')).toBeUndefined()
    expect(editor.getBlock('group')?.children.map((block) => block.id)).toEqual(['direct', 'subgroup'])
    expect(editor.getBlock('task')?.props).toEqual({ taskId: 'original-task' })
  })
  test('slash insertion reuses an empty root paragraph through the upstream helper', () => {
    const editor = setup()
    editor.updateBlock('root', { content: [] })
    editor.setTextCursorPosition('root')
    insertCanvasHeading(editor, 1)
    expect(editor.document.slice(0, 2).map((block) => block.id)).toEqual(['group', 'root'])
    expect(editor.getBlock('root')?.type).toBe('heading')
  })
  test('slash insertion reuses an empty direct child for Heading 2', () => {
    const editor = setup()
    editor.updateBlock('direct', { content: [] })
    editor.setTextCursorPosition('direct')
    insertCanvasHeading(editor, 2)
    expect(editor.getBlock('group')?.children.map((block) => block.id)).toEqual(['direct', 'subgroup'])
    expect(editor.getBlock('direct')?.props).toMatchObject({ level: 2 })
  })
  test('Enter after a collapsed heading preserves its hidden subtree', () => {
    const editor = setup()
    window.localStorage.setItem('toggle-group', 'false')
    editor.setTextCursorPosition('group', 'end')
    editor.domElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(editor.document.map((block) => block.type)).toEqual(['heading', 'paragraph', 'paragraph'])
    expect(editor.getBlock('group')?.children.map((block) => block.id)).toEqual(['direct', 'subgroup'])
  })
  test('Enter at the end of a heading creates its first child without adopting loose content', () => {
    const editor = setup()
    editor.setTextCursorPosition('group', 'end')
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    editor.domElement!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getBlock('group')?.children.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'heading'])
    expect(editor.document.map((block) => block.id)).toEqual(['group', 'root'])
    expect(editor.getTextCursorPosition().block.id).toBe(editor.getBlock('group')?.children[0]?.id)
  })
  test('removing a top-level heading lifts content, promotes its subgroup and preserves Task identity', () => {
    const editor = setup()
    removeHeadingKeepingContent(editor, editor.getBlock('group')!)
    expect(editor.document.map((block) => block.id)).toEqual(['direct', 'subgroup', 'root'])
    expect(editor.getBlock('subgroup')?.props).toMatchObject({ level: 1 })
    expect(editor.getBlock('task')?.props).toEqual({ taskId: 'original-task' })
  })
  test('continuing after a subgroup lands in its parent, and after Heading 1 lands at root', () => {
    const editor = setup()
    continueAfterGroup(editor, editor.getBlock('subgroup')!)
    expect(editor.getBlock('group')?.children.map((block) => block.id)).toHaveLength(3)
    expect(editor.getBlock('subgroup')?.children.map((block) => block.id)).toEqual(['task'])
    continueAfterGroup(editor, editor.getBlock('group')!)
    expect(editor.document.map((block) => block.type)).toEqual(['heading', 'paragraph', 'paragraph'])
    expect(editor.document.at(-1)?.id).toBe('root')
  })
  test('inserting Heading 1 from a subgroup leaves all existing membership intact', () => {
    const editor = setup()
    editor.setTextCursorPosition('task')
    insertCanvasHeading(editor, 1)
    expect(editor.document.map((block) => block.type)).toEqual(['heading', 'heading', 'paragraph'])
    expect(editor.getBlock('subgroup')?.children.map((block) => block.id)).toEqual(['task'])
  })
})
