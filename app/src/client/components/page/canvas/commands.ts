import type { CanvasBlock, CanvasEditor } from './schema.js'
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import { validateCanvasOutline } from './outline.js'

const taskCommands = new WeakMap<CanvasEditor, (block?: CanvasBlock) => void>()
export function bindTaskCommand(editor: CanvasEditor, command: (block?: CanvasBlock) => void): () => void {
  taskCommands.set(editor, command)
  return () => { taskCommands.delete(editor) }
}
export function createTaskAtCursor(editor: CanvasEditor): boolean {
  const command = taskCommands.get(editor)
  if (!command) return false
  command()
  return true
}

/** Keyboard/touch movement uses one supported editor transaction and keeps subtrees. */
export function moveCanvasBlock(editor: CanvasEditor, block: CanvasBlock, direction: 'up' | 'down' | 'out' | 'in'): string | null {
  const document = structuredClone(editor.document)
  function locate(items: CanvasBlock[], parent: CanvasBlock | null = null): { items: CanvasBlock[]; index: number; parent: CanvasBlock | null } | null {
    const index = items.findIndex((item) => item.id === block.id)
    if (index >= 0) return { items, index, parent }
    for (const item of items) { const found = locate(item.children, item); if (found) return found }
    return null
  }
  const found = locate(document)
  if (!found) return 'This item is no longer available.'
  const { items, index, parent } = found
  const moving = items[index]!
  if (direction === 'up' || direction === 'down') {
    const target = index + (direction === 'up' ? -1 : 1)
    if (target < 0 || target >= items.length) return 'This is already at the edge of its section.'
    items.splice(index, 1)
    items.splice(target, 0, moving)
  } else if (direction === 'in') {
    const previous = items[index - 1]
    if (previous?.type !== 'heading' || previous.props.isToggleable === false) return 'Put this right after a heading to move it into that section.'
    if (moving.type === 'heading') moving.props.level = previous.props.level + 1
    items.splice(index, 1)
    previous.children.push(moving)
  } else {
    if (!parent || parent.type !== 'heading' || parent.props.isToggleable === false) return 'This is not inside a section.'
    const ancestors = ancestorsOf(document, parent.id) ?? []
    const destination = ancestors.at(-1)?.children ?? document
    if (moving.type === 'heading') moving.props.level = parent.props.level
    items.splice(index, 1)
    destination.splice(destination.findIndex((item) => item.id === parent.id) + 1, 0, moving)
  }
  const failure = validateCanvasOutline(document)
  if (failure) return failure
  editor.replaceBlocks(editor.document, document)
  editor.setTextCursorPosition(block.id, 'start')
  editor.focus()
  return null
}

export function ancestorsOf(blocks: readonly CanvasBlock[], id: string, parents: CanvasBlock[] = []): CanvasBlock[] | null {
  for (const block of blocks) {
    if (block.id === id) return parents
    const found = ancestorsOf(block.children, id, [...parents, block])
    if (found !== null) return found
  }
  return null
}

export function headingOneContext(editor: CanvasEditor): CanvasBlock | undefined {
  const current = editor.getTextCursorPosition().block
  return [...ancestorsOf(editor.document, current.id) ?? [], current]
    .find((block) => block.type === 'heading' && block.props.level === 1)
}

/** Remove an empty sibling without converting the adjacent group to prose. */
export function removeEmptyBeforeHeading(editor: CanvasEditor, key: 'Backspace' | 'Delete'): boolean {
  const { selection } = editor.prosemirrorState
  if (!selection.empty || selection.$from.parentOffset !== 0) return false
  const current = editor.getTextCursorPosition().block
  const parent = ancestorsOf(editor.document, current.id)?.at(-1)
  const siblings = parent?.children ?? editor.document
  const index = siblings.findIndex((block) => block.id === current.id)
  const empty = key === 'Backspace' ? siblings[index - 1] : current
  const group = key === 'Backspace' ? current : siblings[index + 1]
  if (group?.type !== 'heading' || group.props.isToggleable === false || empty?.type !== 'paragraph' || empty.content.length !== 0 || empty.children.length !== 0) return false
  editor.transact(() => {
    editor.removeBlocks([empty])
    editor.setTextCursorPosition(group, 'start')
  })
  return true
}

/** Only insert new children; never adopt existing following content by proximity. */
export function insertCanvasHeading(editor: CanvasEditor, level: 1 | 2): void {
  const current = editor.getTextCursorPosition().block
  const parents = ancestorsOf(editor.document, current.id) ?? []
  const group = headingOneContext(editor)
  if (level === 2 && group === undefined) return
  const id = crypto.randomUUID()
  const created = { id, type: 'heading' as const, props: { level, isToggleable: true }, content: '' }
  // At a valid destination inherit upstream empty-line replacement and cursor handling.
  // Only crossing a Dana group boundary needs the structural path below.
  const parent = parents.at(-1)
  if ((level === 1 && parent === undefined) ||
    (level === 2 && parent?.type === 'heading' && parent.props.level === 1)) {
    insertOrUpdateBlockForSlashMenu(editor, { type: 'heading', props: { level, isToggleable: true } })
    editor.focus()
    return
  }
  editor.transact(() => {
    if (level === 2 && group !== undefined) {
      if (current.id === group.id) {
        editor.updateBlock(group, { children: [created, ...group.children] })
      } else {
        const subgroup = parents.find((block) => block.type === 'heading' && block.props.level === 2)
        editor.insertBlocks([created], subgroup ?? current, 'after')
      }
    } else {
      editor.insertBlocks([created], parents[0] ?? current, 'after')
    }
    editor.setTextCursorPosition(id)
  })
  editor.focus()
}

/** A presentation heading changes typography only. It never opens a Work group. */
export function insertDocumentHeading(editor: CanvasEditor, level: 1 | 2 | 3): void {
  insertOrUpdateBlockForSlashMenu(editor, {
    type: 'heading',
    props: { level, isToggleable: false },
  })
  editor.focus()
}

/** Explicit touch/keyboard route after a complete subtree, including hidden children. */
export function continueAfterGroup(editor: CanvasEditor, group: CanvasBlock): void {
  const [paragraph] = editor.insertBlocks([{ type: 'paragraph', content: '' }], group, 'after')
  if (paragraph !== undefined) editor.setTextCursorPosition(paragraph)
  editor.focus()
}

export function removeHeadingKeepingContent(editor: CanvasEditor, group: CanvasBlock): void {
  if (group.type !== 'heading') return
  const children = group.children.map((child) => group.props.level === 1 && child.type === 'heading'
    ? { ...child, props: { ...child.props, level: 1 } }
    : child)
  editor.replaceBlocks([group], children.length > 0 ? children : [{ type: 'paragraph' }])
  editor.focus()
}

/** Remove blocks without letting BlockNote refill an emptied page: it fills
 * with the schema's first block type, a toggle heading, which saved as an
 * empty Section. Removing everything leaves the empty paragraph instead. */
export function removeCanvasBlocks(editor: CanvasEditor, blocks: readonly CanvasBlock[]): void {
  const ids = new Set(blocks.map((block) => block.id))
  const first = editor.document[0]
  editor.transact(() => {
    if (first !== undefined && editor.document.every((block) => ids.has(block.id))) {
      editor.insertBlocks([{ type: 'paragraph' }], first, 'before')
    }
    editor.removeBlocks([...ids])
  })
}
