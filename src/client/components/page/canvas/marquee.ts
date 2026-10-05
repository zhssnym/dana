// The block selection is BlockNote's `MultipleNodeSelection`, so undo, clicks and
// handle drags all see it. The class is not exported; it is recovered from its JSON id.
import { Selection } from 'prosemirror-state'
import type { EditorState, SelectionBookmark } from 'prosemirror-state'
import type { Mappable } from 'prosemirror-transform'
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

export interface SelectedBlock { readonly id: string; readonly pos: number; readonly node: PMNode }

export function isBlockSelection(selection: Selection): boolean {
  return (selection.toJSON() as { type?: string }).type === 'multiple-node'
}

/** The blocks a block selection holds, in document order. */
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

export function blockPositions(doc: PMNode): Map<string, { pos: number; node: PMNode }> {
  const positions = new Map<string, { pos: number; node: PMNode }>()
  doc.descendants((node, pos) => {
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') positions.set(node.attrs.id, { pos, node })
    return true
  })
  return positions
}

/**
 * The sibling range covering `ids`: each block is lifted to the deepest group holding
 * all of them, and everything between is included. Null when none is present.
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

// BlockNote's class has no `fromJSON`, so `Selection.fromJSON` would recurse. Swap the
// base method for one call to capture the class from `this`.
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
  if (captured !== null) keepOnUndo(captured)
  return captured
}

// So undo restores the picked blocks: BlockNote's class only has the caret bookmark.
class BlockRunBookmark implements SelectionBookmark {
  constructor(readonly Multiple: SelectionClass, readonly from: number, readonly to: number) {}
  map(mapping: Mappable): SelectionBookmark {
    return new BlockRunBookmark(this.Multiple, mapping.map(this.from, 1), mapping.map(this.to, -1))
  }
  resolve(doc: PMNode): Selection {
    if (this.from < this.to && this.to <= doc.content.size) {
      const $from = doc.resolve(this.from)
      const $to = doc.resolve(this.to)
      if ($from.parent === $to.parent && $from.parent.type.name === 'blockGroup') return new this.Multiple($from, $to)
    }
    return Selection.near(doc.resolve(Math.min(this.from, doc.content.size)))
  }
}
function keepOnUndo(Multiple: SelectionClass): void {
  (Multiple.prototype as { getBookmark: () => SelectionBookmark }).getBookmark = function (this: Selection) {
    return new BlockRunBookmark(Multiple, this.from, this.to)
  }
}

export function blockSelectionFor(doc: PMNode, ids: Iterable<string>): Selection | null {
  const range = rangeFor(doc, ids)
  const Multiple = multipleNodeSelectionClass(doc)
  if (range === null || Multiple === null) return null
  return new Multiple(doc.resolve(range.from), doc.resolve(range.to))
}

/** Called before a view enters block selection (the canvas closes its text toolbar). */
export const beforeBlockSelection = new WeakMap<EditorView, () => void>()

/** Block-select `ids` as one sibling run. False when none exist. */
export function selectBlocks(view: EditorView, ids: Iterable<string>): boolean {
  const selection = blockSelectionFor(view.state.doc, ids)
  if (selection === null) return false
  if (selection.eq(view.state.selection)) return true
  if (!isBlockSelection(view.state.selection)) beforeBlockSelection.get(view)?.()
  view.dispatch(view.state.tr.setSelection(selection))
  return true
}

/** Leave block selection for a caret near where it was. */
export function clearBlocks(view: EditorView): void {
  const { selection, doc } = view.state
  if (!isBlockSelection(selection)) return
  const $pos = doc.resolve(selection.from)
  const next = Selection.findFrom($pos, 1, true) ?? Selection.findFrom($pos, -1, true) ?? Selection.atStart(doc)
  view.dispatch(view.state.tr.setSelection(next))
}
