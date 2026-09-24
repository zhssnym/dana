import type { CanvasBlock, CanvasEditor } from './schema.js'
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import { isSectionHeading, validateCanvasOutline } from './outline.js'

const taskCommands = new WeakMap<CanvasEditor, (block?: CanvasBlock) => void>()
export function bindTaskCommand(editor: CanvasEditor, command: (block?: CanvasBlock) => void): () => void {
  taskCommands.set(editor, command)
  return () => { taskCommands.delete(editor) }
}
export function hasTaskCommand(editor: CanvasEditor): boolean { return taskCommands.has(editor) }
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
    if (previous === undefined || previous.type !== 'heading' || !isSectionHeading(previous)) return 'Put this right after a heading to move it into that section.'
    if (moving.type === 'heading') moving.props.level = previous.props.level + 1
    items.splice(index, 1)
    previous.children.push(moving)
  } else {
    if (!parent || parent.type !== 'heading' || !isSectionHeading(parent)) return 'This is not inside a section.'
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
  if (group?.type !== 'heading' || !isSectionHeading(group) || empty?.type !== 'paragraph' || empty.content.length !== 0 || empty.children.length !== 0) return false
  editor.transact(() => {
    editor.removeBlocks([empty])
    editor.setTextCursorPosition(group, 'start')
  })
  return true
}

/**
 * The Sections around the place a Work Section of `level` would take, or null
 * where none may stand: every block around it is a Section (none under a
 * list, a toggle or a presentation heading), and `level` is at most one below
 * the innermost (a Heading 3 needs a Heading 2 around it). `inside`: the place
 * is the block's first child (a new line under a Section's own heading line).
 * A level at or above the innermost is the same place after stepping out.
 */
export function sectionPlace(document: readonly CanvasBlock[], block: CanvasBlock, level: 1 | 2 | 3, inside = false): CanvasBlock[] | null {
  const ancestors = ancestorsOf(document, block.id)
  if (ancestors === null) return null
  const chain = inside && isSectionHeading(block) ? [...ancestors, block] : ancestors
  if (chain.some((item) => !isSectionHeading(item))) return null
  return level <= chain.length + 1 ? chain : null
}

/**
 * Work's "Heading n", from `/` and from `#`: a Section where the block stands
 * on screen. `convert` turns the block itself into it (its text kept);
 * otherwise an empty one follows the block's line. Where a Section of that
 * level cannot nest there (a Heading 1 inside a Section), it steps out to its
 * level and takes what followed along, so nothing moves on screen. What would
 * not fit under it (a Heading 3 under a new Heading 1) stays where it was.
 * Returns false where no Section of `level` stands here.
 */
export function placeSection(editor: CanvasEditor, block: CanvasBlock, level: 1 | 2 | 3, convert: boolean, content?: CanvasBlock['content']): boolean {
  const inside = !convert && isSectionHeading(block)
  const chain = sectionPlace(editor.document, block, level, inside)
  if (chain === null) return false
  const props = { level, isToggleable: true, presentation: false }
  const id = convert ? block.id : crypto.randomUUID()
  const text = content ?? (convert ? block.content : [])
  if (level === chain.length + 1) {
    editor.transact(() => {
      if (convert) editor.updateBlock(block, { type: 'heading', props, content: text } as never)
      else if (inside && block.children[0] !== undefined) editor.insertBlocks([{ id, type: 'heading', props, content: '' } as never], block.children[0], 'before')
      else if (inside) editor.updateBlock(block, { children: [{ id, type: 'heading', props, content: '' }] } as never)
      else editor.insertBlocks([{ id, type: 'heading', props, content: '' } as never], block, 'after')
      editor.setTextCursorPosition(id, 'end')
    })
    editor.focus()
    return true
  }
  // What followed the place, level by level from the innermost Section out.
  const trailingAt = (from: number, to: number): CanvasBlock[] => {
    const out: CanvasBlock[] = []
    for (let k = from; k >= to; k -= 1) {
      const children = chain[k]!.children
      const after = k === chain.length - 1 ? (inside ? null : block.id) : chain[k + 1]!.id
      out.push(...children.slice(after === null ? 0 : children.findIndex((child) => child.id === after) + 1))
    }
    return out
  }
  const own = convert ? block.children : []
  const anchor = chain[level - 1]!
  const heading = (children: readonly CanvasBlock[]) => ({ id, type: 'heading' as const, props, content: text, children: [...own, ...children] })
  const moved = (children: readonly CanvasBlock[]): CanvasBlock[] => {
    const leaving = new Set([...(convert ? [block.id] : []), ...children.map((child) => child.id)])
    const walk = (items: readonly CanvasBlock[]): CanvasBlock[] => items.flatMap((item) => {
      if (leaving.has(item.id)) return []
      const next = { ...item, children: walk(item.children) }
      return item.id === anchor.id ? [next, heading(children) as unknown as CanvasBlock] : [next]
    })
    return walk(editor.document)
  }
  // Everything that followed, where it fits under the new Section; else only
  // what followed at its own level, which always fits.
  const all = trailingAt(chain.length - 1, level - 1)
  const adopted = validateCanvasOutline(moved(all)) === null ? all : trailingAt(level - 1, level - 1)
  editor.transact(() => {
    const leaving = [...(convert ? [block.id] : []), ...adopted.map((child) => child.id)]
    if (leaving.length > 0) editor.removeBlocks(leaving)
    editor.insertBlocks([heading(adopted) as never], anchor, 'after')
    editor.setTextCursorPosition(id, 'end')
  })
  editor.focus()
  return true
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
