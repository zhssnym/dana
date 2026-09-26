import type { CanvasBlock, CanvasEditor } from './schema.js'
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

/** A Task made from this line through the page's own Task act (the same one `[] ` and `/task` use). */
export function createTaskFrom(editor: CanvasEditor, block: CanvasBlock): boolean {
  const command = taskCommands.get(editor)
  if (!command) return false
  command(block)
  return true
}

/** Where the Work thread's last line writes: an empty line to reuse, the block to follow, or the Section to open. */
export type LinePlace = { readonly reuse: string } | { readonly after: string } | { readonly into: string }

const isEmptyLine = (block: CanvasBlock): boolean =>
  block.type === 'paragraph' && Array.isArray(block.content) && block.content.length === 0 && block.children.length === 0

/**
 * The place a line typed in the last line lands. `section` is the Section in
 * view (the phone's pinned line); without it, or when it is gone, the line
 * goes where the page ends: after the last block of the innermost last
 * Section, as clicking below the page writes (`CanvasSurface` `writeBelow`).
 * An empty last line is reused rather than followed by another.
 */
export function lastLinePlace(document: readonly CanvasBlock[], section?: string): LinePlace | null {
  const inView = section === undefined ? undefined : findBlock(document, section)
  let holder: CanvasBlock | undefined = inView !== undefined && isSectionHeading(inView) ? inView : undefined
  let last = holder === undefined ? document.at(-1) : holder.children.at(-1)
  if (holder === undefined) {
    while (last !== undefined && isSectionHeading(last)) {
      holder = last
      last = last.children.at(-1)
    }
  }
  if (last !== undefined) return isEmptyLine(last) ? { reuse: last.id } : { after: last.id }
  return holder === undefined ? null : { into: holder.id }
}

/** A text line at that place, holding `text`; its id, or null where the place is gone. */
export function openLineAt(editor: CanvasEditor, place: LinePlace, text: string): string | null {
  const content = text === '' ? [] : [{ type: 'text' as const, text, styles: {} }]
  if ('reuse' in place) {
    if (editor.getBlock(place.reuse) === undefined) return null
    editor.updateBlock(place.reuse, { type: 'paragraph', content } as never)
    return place.reuse
  }
  if ('after' in place) {
    if (editor.getBlock(place.after) === undefined) return null
    return editor.insertBlocks([{ type: 'paragraph', content } as never], place.after, 'after')[0]?.id ?? null
  }
  const section = editor.getBlock(place.into)
  if (section === undefined) return null
  const id = crypto.randomUUID()
  editor.updateBlock(section, { children: [{ id, type: 'paragraph', content }] } as never)
  return editor.getBlock(id) === undefined ? null : id
}

function findBlock(blocks: readonly CanvasBlock[], id: string): CanvasBlock | undefined {
  for (const block of blocks) {
    if (block.id === id) return block
    const found = findBlock(block.children, id)
    if (found !== undefined) return found
  }
  return undefined
}

export function ancestorsOf(blocks: readonly CanvasBlock[], id: string, parents: CanvasBlock[] = []): CanvasBlock[] | null {
  for (const block of blocks) {
    if (block.id === id) return parents
    const found = ancestorsOf(block.children, id, [...parents, block])
    if (found !== null) return found
  }
  return null
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

/**
 * Mod+Shift+↑/↓ (M4 §2.6, BlockNote's own binding): the blocks move one step
 * as a unit, children and all, and in one undo entry. BlockNote's step drops a
 * block into the previous sibling's children, which the outline refuses for a
 * heading and which walks a Task into a Section a row at a time; here a
 * heading steps past the whole Section beside it, and any other block steps
 * past its sibling, into the end (↑) or the top (↓) of the Section it meets.
 * The canvas guard still refuses a shape the page cannot keep.
 */
export function moveBlocksBy(editor: CanvasEditor, ids: readonly string[], direction: -1 | 1): boolean {
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] })
  const edge = direction === -1 ? blocks[0] : blocks.at(-1)
  if (edge === undefined) return false
  const heading = blocks.some(isSectionHeading)
  const holds = (block: CanvasBlock | undefined): block is CanvasBlock => block !== undefined && isSectionHeading(block) && block.children.length > 0
  // The Section met on the way: its end going up, its top going down; a heading stays at the Section's own level.
  const into = (section: CanvasBlock): { ref: CanvasBlock; placement: 'before' | 'after' } => {
    if (direction === 1) return { ref: section.children[0]!, placement: 'before' }
    let ref = section.children.at(-1)!
    while (!heading && holds(ref)) ref = ref.children.at(-1)!
    return { ref, placement: 'after' }
  }
  const beside = direction === -1 ? editor.getPrevBlock(edge) : editor.getNextBlock(edge)
  const parent = editor.getParentBlock(edge)
  let target: { ref: CanvasBlock; placement: 'before' | 'after' }
  if (beside !== undefined) {
    target = !heading && holds(beside) ? into(beside) : { ref: beside, placement: direction === -1 ? 'before' : 'after' }
  } else if (parent !== undefined) {
    const outer = direction === -1 ? editor.getPrevBlock(parent) : editor.getNextBlock(parent)
    target = holds(outer) ? into(outer) : { ref: parent, placement: direction === -1 ? 'before' : 'after' }
  } else return false
  const before = JSON.stringify(editor.document)
  editor.transact(() => {
    editor.removeBlocks(blocks.map((block) => block.id))
    editor.insertBlocks(blocks as never, target.ref.id, target.placement)
  })
  return JSON.stringify(editor.document) !== before
}
