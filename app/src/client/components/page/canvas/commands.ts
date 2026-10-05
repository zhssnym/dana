import type { CanvasBlock, CanvasEditor } from './schema.js'
import { isSectionHeading, validateCanvasOutline } from './outline.js'
import { blockAbove, landOn } from './block-selection.js'

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

/**
 * Lines "Add a task…" wrote into the page to become tasks, by block id. If the page
 * refuses the task, the title goes back to that line.
 */
export const lineTitles = new Map<string, { readonly reused: boolean; readonly giveBack: (title: string) => void }>()

/** Through the page's own task act, the same one `[] ` and `/task` use. */
export function createTaskFrom(editor: CanvasEditor, block: CanvasBlock): boolean {
  const command = taskCommands.get(editor)
  if (!command) return false
  command(block)
  return true
}

/** Where the last line writes: an empty line to reuse, a block to follow, or a section to open. */
export type LinePlace = { readonly reuse: string } | { readonly after: string } | { readonly into: string }

const isEmptyLine = (block: CanvasBlock): boolean =>
  block.type === 'paragraph' && Array.isArray(block.content) && block.content.length === 0 && block.children.length === 0

/**
 * Where the last line's text lands: the section in view (a phone's pinned line), else
 * after the innermost last section's last block. An empty last line is reused.
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

/** A text line at that place holding `text`; its id, or null where the place is gone. */
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

/**
 * Enter on an empty line removes it; the caret goes to the block before, or to the
 * thread's last line. The page's only line cannot go.
 */
export function dropEmptyLine(editor: CanvasEditor, toLast: () => boolean): boolean {
  const { selection } = editor.prosemirrorState
  if (!selection.empty) return false
  const block = editor.getTextCursorPosition().block
  if (!isEmptyLine(block)) return false
  let final = true
  for (let at: CanvasBlock | undefined = block; at !== undefined && final; at = editor.getParentBlock(at)) {
    if (editor.getNextBlock(at) !== undefined) final = false
  }
  const before = blockAbove(editor, block.id)
  if (before === null) return final && toLast()
  editor.removeBlocks([block.id])
  if (final && toLast()) return true
  landOn(editor, before)
  return true
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
 * The sections around where a Work section of `level` would stand, or null: every
 * ancestor must be a section and `level` at most one below the innermost.
 */
export function sectionPlace(document: readonly CanvasBlock[], block: CanvasBlock, level: 1 | 2 | 3, inside = false): CanvasBlock[] | null {
  const ancestors = ancestorsOf(document, block.id)
  if (ancestors === null) return null
  const chain = inside && isSectionHeading(block) ? [...ancestors, block] : ancestors
  if (chain.some((item) => !isSectionHeading(item))) return null
  return level <= chain.length + 1 ? chain : null
}

/**
 * Work's "Heading n": a section where the block stands. Where that level cannot
 * nest, it steps out and takes what followed along, so nothing moves on screen.
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
  // What followed the place, level by level from the innermost section out.
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
  // Everything that followed, where it fits; else only what followed at its own level.
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

/**
 * BlockNote refills an emptied page with the schema's first block, a toggle heading,
 * which saves as an empty section. Leave an empty paragraph instead.
 */
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
 * Mod+Shift+↑/↓ moves blocks one step as a unit in one undo entry. Unlike BlockNote's
 * step, a heading passes the whole section beside it and other blocks enter it.
 */
export function moveBlocksBy(editor: CanvasEditor, ids: readonly string[], direction: -1 | 1): boolean {
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] })
  const edge = direction === -1 ? blocks[0] : blocks.at(-1)
  if (edge === undefined) return false
  const heading = blocks.some(isSectionHeading)
  const holds = (block: CanvasBlock | undefined): block is CanvasBlock => block !== undefined && isSectionHeading(block) && block.children.length > 0
  // The section met on the way: its end going up, its top going down.
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
