/*
The one block selection every canvas has: the editor's own multi-block
selection. `block-selection.ts` (the API the block menu, the keys and the
marquee use) reads and writes it through the helpers here.

A block selection is BlockNote's `MultipleNodeSelection`: a ProseMirror
selection that sits between blocks, just before the first selected block and
just after the last, all of them siblings. It is the selection BlockNote's side
menu builds when a drag starts over a selected range (`dragStart` in
`@blocknote/core/src/extensions/SideMenu/dragging.ts`), so dragging any
selected block's handle moves them all, with nothing of ours. The class is not
exported; `multipleNodeSelectionClass` recovers it from the JSON id it
registers ("multiple-node").

Being the editor's selection, it is what undo, a click in text (which replaces
it) and the drag all see; there is no second copy to fall out of step.
*/
import { Selection } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

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

/** Called before a view enters block selection (the canvas closes its text toolbar). */
export const beforeBlockSelection = new WeakMap<EditorView, () => void>()

/** Block-select `ids` (normalised to one sibling run). False when none exist. */
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
