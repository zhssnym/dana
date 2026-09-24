/*
Block selection for the canvases: the state behind the marquee (rubber band),
Esc, Cmd/Ctrl+A and Shift-click in `CanvasMarquee.tsx`.

A block selection is BlockNote's own `MultipleNodeSelection`: a ProseMirror
selection that sits between blocks, just before the first selected block and
just after the last, all of them siblings. It is the selection BlockNote's side
menu already builds when a drag starts over a selected range (`dragStart` in
`@blocknote/core/src/extensions/SideMenu/dragging.ts`), so dragging any
selected block's handle moves them all without anything of ours. The class is
not exported; `multipleNodeSelectionClass` recovers it from the JSON id it
registers ("multiple-node").

What is selected is therefore the editor's selection, never a copy of it: undo,
collaboration of the document, a click in text (which replaces it) and the
drag all see the same thing. The tint is a node decoration
(`data-dana-selected` on each block's outer element, `marquee.css`), so
ProseMirror redraws it and nothing writes attributes into its DOM.
*/
import { Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { BlockNoteEditor } from '@blocknote/core'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEditor = BlockNoteEditor<any, any, any>

export interface SelectedBlock { readonly id: string; readonly pos: number; readonly node: PMNode }

export function isBlockSelection(selection: Selection): boolean {
  return (selection.toJSON() as { type?: string }).type === 'multiple-node'
}

/** The blocks a block selection holds, in document order (siblings). */
export function selectedBlocks(state: EditorState): SelectedBlock[] {
  const { selection, doc } = state
  if (!isBlockSelection(selection)) return []
  const $from = doc.resolve(selection.from)
  const parent = $from.parent
  const blocks: SelectedBlock[] = []
  let pos = selection.from
  for (let index = $from.index(); index < parent.childCount && pos < selection.to; index++) {
    const node = parent.child(index)
    if (typeof node.attrs.id === 'string') blocks.push({ id: node.attrs.id, pos, node })
    pos += node.nodeSize
  }
  return blocks
}

export function selectedIds(editor: AnyEditor): string[] {
  const view = editor.prosemirrorView
  return view === undefined ? [] : selectedBlocks(view.state).map((block) => block.id)
}

/** Every block's position, by id. */
export function blockPositions(doc: PMNode): Map<string, { pos: number; node: PMNode }> {
  const positions = new Map<string, { pos: number; node: PMNode }>()
  doc.descendants((node, pos) => {
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') positions.set(node.attrs.id, { pos, node })
    return true
  })
  return positions
}

/**
 * The sibling range that covers `ids`: every block is lifted to its ancestor
 * under the deepest group holding all of them, and everything between the
 * first and the last is included (a block selection is one contiguous run,
 * as in Notion). Null when none of the ids is in the document.
 */
export function rangeFor(doc: PMNode, ids: Iterable<string>): { from: number; to: number } | null {
  const positions = blockPositions(doc)
  let first = Infinity
  let lastEnd = -Infinity
  for (const id of ids) {
    const found = positions.get(id)
    if (found === undefined) continue
    first = Math.min(first, found.pos)
    lastEnd = Math.max(lastEnd, found.pos + found.node.nodeSize)
  }
  if (first === Infinity) return null
  const $a = doc.resolve(first + 1)
  const $b = doc.resolve(lastEnd - 1)
  let depth = $a.sharedDepth($b.pos)
  while (depth > 0 && $a.node(depth).type.name !== 'blockGroup') depth--
  if ($a.node(depth).type.name !== 'blockGroup') return null
  return { from: $a.before(depth + 1), to: $b.after(depth + 1) }
}

type SelectionClass = { new ($anchor: ResolvedPos, $head: ResolvedPos): Selection }
let multipleNodeSelection: SelectionClass | null | undefined

/*
BlockNote registers MultipleNodeSelection with `Selection.jsonID` but defines
no `fromJSON` of its own, so `Selection.fromJSON` dispatching to it recurses
into itself. That dispatch is `cls.fromJSON(doc, json)`, though, with the class
as `this`: for one call, the base method is swapped for one that reports its
`this` and stops, and the class is ours to construct directly.
*/
function multipleNodeSelectionClass(doc: PMNode): SelectionClass | null {
  if (multipleNodeSelection !== undefined) return multipleNodeSelection
  const base = Selection as unknown as { fromJSON: (this: unknown, doc: PMNode, json: unknown) => Selection }
  const original = base.fromJSON
  const found = Symbol('found')
  let captured: SelectionClass | null = null
  base.fromJSON = function (this: unknown, node: PMNode, json: unknown): Selection {
    if (this !== Selection) { captured = this as SelectionClass; throw found }
    return original.call(this, node, json)
  }
  try { base.fromJSON(doc, { type: 'multiple-node', anchor: 0, head: 0 }) } catch { /* `found`, or no such class */ } finally { base.fromJSON = original }
  multipleNodeSelection = captured
  return captured
}

export function blockSelectionFor(doc: PMNode, ids: Iterable<string>): Selection | null {
  const range = rangeFor(doc, ids)
  const Multiple = multipleNodeSelectionClass(doc)
  if (range === null || Multiple === null) return null
  return new Multiple(doc.resolve(range.from), doc.resolve(range.to))
}

/** Block-select `ids` (normalised to one sibling run). False when none exist. */
/** Called before a view enters block selection (the canvas closes its text toolbar). */
export const beforeBlockSelection = new WeakMap<EditorView, () => void>()

export function selectBlocks(view: EditorView, ids: Iterable<string>): boolean {
  const selection = blockSelectionFor(view.state.doc, ids)
  if (selection === null) return false
  if (selection.eq(view.state.selection)) return true
  if (!isBlockSelection(view.state.selection)) beforeBlockSelection.get(view)?.()
  view.dispatch(view.state.tr.setSelection(selection))
  return true
}

/** Leave block selection for a caret near where it was. */
export function clearBlockSelection(view: EditorView, toEnd = false): void {
  const { selection, doc } = view.state
  if (!isBlockSelection(selection)) return
  const $pos = doc.resolve(toEnd ? selection.to : selection.from)
  const next = Selection.findFrom($pos, toEnd ? -1 : 1, true) ?? Selection.findFrom($pos, toEnd ? 1 : -1, true) ?? Selection.atStart(doc)
  view.dispatch(view.state.tr.setSelection(next))
}

/** A caret at the end (or start) of a block's text, when it has text. */
export function caretIn(view: EditorView, id: string, placement: 'start' | 'end'): boolean {
  const found = blockPositions(view.state.doc).get(id)
  if (found === undefined) return false
  const content = found.node.firstChild
  if (content === null || !content.isTextblock) return false
  const start = found.pos + 2
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, placement === 'start' ? start : start + content.content.size)))
  return true
}

export const marqueeKey = new PluginKey('danaMarquee')

/** Draws the selection: a tint on each selected block, and no text highlight. */
export function marqueePlugin(): Plugin {
  return new Plugin({
    key: marqueeKey,
    props: {
      decorations(state) {
        const blocks = selectedBlocks(state)
        if (blocks.length === 0) return null
        return DecorationSet.create(state.doc, blocks.map((block) =>
          Decoration.node(block.pos, block.pos + block.node.nodeSize, { 'data-dana-selected': 'true' })))
      },
      attributes(state): Record<string, string> {
        return isBlockSelection(state.selection) ? { 'data-dana-block-selection': 'true' } : {}
      },
    },
  })
}

/* ---- Acts on the selected blocks (BlockNote's API; the canvas guard still
   reviews every one and may refuse it, e.g. a range holding a Task). ---- */

// Blocks that are records elsewhere; a copy would be a second pointer to one record.
const RECORD_BLOCKS = new Set(['danaTask', 'danaFolder'])

interface LooseBlock { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: LooseBlock[] }

function copyOf(block: LooseBlock): LooseBlock | null {
  if (RECORD_BLOCKS.has(block.type)) return null
  const { id: _id, children, ...rest } = block
  void _id
  return { ...rest, children: (children ?? []).map(copyOf).filter((child): child is LooseBlock => child !== null) }
}

/** Delete the selected blocks; the caret goes to the block before them. */
export function removeSelected(editor: AnyEditor): void {
  const view = editor.prosemirrorView
  if (view === undefined) return
  const ids = selectedIds(editor)
  if (ids.length === 0) return
  const first = ids[0]!
  const before = editor.getPrevBlock(first) ?? editor.getParentBlock(first)
  const after = editor.getNextBlock(ids.at(-1)!)
  const idSet = new Set(ids)
  editor.transact(() => {
    // Removing everything would let BlockNote refill the page with the
    // schema's first block type; an empty paragraph is what an empty page is.
    const top = editor.document
    if (top.length > 0 && top.every((block) => idSet.has(block.id))) editor.insertBlocks([{ type: 'paragraph' }], top[0]!, 'before')
    editor.removeBlocks(ids)
  })
  if (ids.every((id) => editor.getBlock(id) !== undefined)) {
    selectBlocks(view, ids) // refused (the guard said why); keep the selection
    return
  }
  const landing = before ?? after ?? editor.document[0]
  if (landing !== undefined && !caretIn(view, landing.id, before ? 'end' : 'start')) selectBlocks(view, [landing.id])
}

/** Duplicate the selected blocks after the last one, and select the copies. */
export function duplicateSelected(editor: AnyEditor): void {
  const view = editor.prosemirrorView
  if (view === undefined) return
  const ids = selectedIds(editor)
  const copies = ids.map((id) => editor.getBlock(id) as LooseBlock | undefined)
    .filter((block): block is LooseBlock => block !== undefined)
    .map(copyOf).filter((block): block is LooseBlock => block !== null)
  if (copies.length === 0) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = editor.insertBlocks(copies as any, ids.at(-1)!, 'after')
  selectBlocks(view, inserted.map((block) => block.id))
}

/** Tab / Shift-Tab for the whole selection, which stays selected. */
export function nestSelected(editor: AnyEditor, direction: 'in' | 'out'): void {
  const view = editor.prosemirrorView
  if (view === undefined) return
  const ids = selectedIds(editor)
  if (ids.length === 0) return
  if (direction === 'in') editor.nestBlock()
  else editor.unnestBlock()
  selectBlocks(view, ids)
}

export interface TurnIntoTarget { readonly key: string; readonly label: string; readonly type: string; readonly props?: Record<string, unknown>; readonly aliases: readonly string[] }

const TARGETS: readonly TurnIntoTarget[] = [
  { key: 'paragraph', label: 'Text', type: 'paragraph', aliases: ['text', 'paragraph', 'plain'] },
  { key: 'h1', label: 'Heading 1', type: 'heading', props: { level: 1 }, aliases: ['h1', 'heading', 'title'] },
  { key: 'h2', label: 'Heading 2', type: 'heading', props: { level: 2 }, aliases: ['h2', 'heading', 'subheading'] },
  { key: 'h3', label: 'Heading 3', type: 'heading', props: { level: 3 }, aliases: ['h3', 'heading'] },
  { key: 'bullet', label: 'Bulleted list', type: 'bulletListItem', aliases: ['bullet', 'ul', 'list'] },
  { key: 'numbered', label: 'Numbered list', type: 'numberedListItem', aliases: ['numbered', 'ol', 'list'] },
  { key: 'todo', label: 'To-do list', type: 'checkListItem', aliases: ['todo', 'to-do', 'check', 'checkbox'] },
  { key: 'toggle', label: 'Toggle list', type: 'toggleListItem', aliases: ['toggle', 'collapse'] },
  { key: 'quote', label: 'Quote', type: 'quote', aliases: ['quote', 'blockquote'] },
]

/** What this editor's schema can turn writing into. */
export function turnIntoTargets(editor: AnyEditor): TurnIntoTarget[] {
  const schema = editor.schema.blockSchema as Record<string, unknown>
  return TARGETS.filter((target) => target.type in schema)
}

/** Turn every selected writing block into `target`, keeping text and children. */
export function turnSelectedInto(editor: AnyEditor, target: TurnIntoTarget): void {
  const view = editor.prosemirrorView
  if (view === undefined) return
  const ids = selectedIds(editor)
  editor.transact(() => {
    for (const id of ids) {
      const block = editor.getBlock(id) as LooseBlock | undefined
      // Only writing turns into writing: a Task, Folder, image or diagram stays.
      if (block === undefined || !Array.isArray(block.content)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(id, { type: target.type, props: target.props ?? {} } as any)
    }
  })
  selectBlocks(view, ids)
}
