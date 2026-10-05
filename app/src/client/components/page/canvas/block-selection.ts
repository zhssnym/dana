// Block selection: whole blocks picked, Notion style. It is BlockNote's own multi-block
// selection (`marquee.ts`), so a handle drag carries them all. The tint is a generated
// stylesheet keyed by `data-id`; attributes in the editor DOM would be redrawn away.
import { createElement, useEffect, useSyncExternalStore } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { clearBlocks, selectBlocks, selectedBlocks } from './marquee.js'
import { simulateNest } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'

// Any BlockNote editor: the canvas's and the task composer's schemas differ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>

const EMPTY: readonly string[] = []
const snapshots = new WeakMap<object, readonly string[]>()

function viewOf(editor: AnyEditor): EditorView | undefined {
  try { return editor.prosemirrorView ?? undefined } catch { return undefined }
}

export function blockSelection(editor: AnyEditor): readonly string[] {
  const view = viewOf(editor)
  const ids = view === undefined ? EMPTY : selectedBlocks(view.state).map((block) => block.id)
  // Return the same array while nothing changed (a `useSyncExternalStore` snapshot).
  const last = snapshots.get(editor) ?? EMPTY
  if (ids.length === last.length && ids.every((id, index) => last[index] === id)) return last
  const next = ids.length === 0 ? EMPTY : ids
  snapshots.set(editor, next)
  return next
}
export function setBlockSelection(editor: AnyEditor, ids: readonly string[]): void {
  const view = viewOf(editor)
  if (view === undefined) return
  if (ids.length === 0) clearBlocks(view)
  else selectBlocks(view, ids)
}
export function clearBlockSelection(editor: AnyEditor): void { setBlockSelection(editor, EMPTY) }
export function onBlockSelection(editor: AnyEditor, listener: () => void): () => void {
  let last = blockSelection(editor)
  const check = (): void => {
    const next = blockSelection(editor)
    if (next !== last) { last = next; listener() }
  }
  const offSelection = editor.onSelectionChange(check)
  const offChange = editor.onChange(check)
  return () => { offSelection(); offChange() }
}
export function useBlockSelection(editor: AnyEditor): readonly string[] {
  return useSyncExternalStore((listener) => onBlockSelection(editor, listener), () => blockSelection(editor))
}

/**
 * The tint, scoped to this editor: one soft layer per block, rounded only at the
 * run's ends, so the run reads as one shape.
 */
export function BlockSelectionStyle({ editor, scope }: { readonly editor: AnyEditor; readonly scope: string }): React.JSX.Element | null {
  const ids = useBlockSelection(editor)
  if (ids.length === 0) return null
  // On the Work thread a block's ::after is its rail badge (thread.css), so the tint
  // goes on the outer box there.
  const block = (id: string): string => `.${scope} .bn-block-outer[data-id="${CSS.escape(id)}"]:not(.dana-thread *) > .bn-block`
  const threaded = (id: string): string => `.dana-thread .${scope} .bn-block-outer[data-id="${CSS.escape(id)}"]`
  const all = ids.flatMap((id) => [block(id), threaded(id)])
  // No caret or text highlight over picked blocks. Row hover is off too: it reaches
  // past its row and would paint over a neighbour's tint.
  return createElement('style', null, `${all.join(', ')} { position: relative; }
/* A rail badge on a picked block sits above the tint, so its halo is the
   tint laid over the page; what a row draws inside its content (a glyph, an
   icon) sits under the tint, so its halo stays the page and takes the tint
   once. No hover halo under a pick either (the hover is off, below). */
.${scope} .bn-block-content { --dana-thread-surface: var(--background) !important; }
${ids.map(threaded).join(', ')} { --dana-thread-surface: var(--dana-block-selection-surface); }
${all.map((selector) => `${selector}::after`).join(', ')} { content: ''; position: absolute; inset: 0 calc(-1 * var(--dana-block-selection-inset-x)); background: var(--dana-block-selection); pointer-events: none; animation: dana-block-selection-in var(--duration-fast) var(--ease-enter); }
${block(ids[0]!)}::after, ${threaded(ids[0]!)}::after { top: calc(-1 * var(--dana-block-selection-inset-y)); border-start-start-radius: var(--dana-block-selection-radius); border-start-end-radius: var(--dana-block-selection-radius); }
${block(ids.at(-1)!)}::after, ${threaded(ids.at(-1)!)}::after { bottom: calc(-1 * var(--dana-block-selection-inset-y)); border-end-start-radius: var(--dana-block-selection-radius); border-end-end-radius: var(--dana-block-selection-radius); }
${hangs(scope, ids)} { inset-inline-start: calc(-1 * (var(--dana-block-selection-inset-x) + var(--dana-block-selection-hang))); }
.${scope} .bn-editor { caret-color: transparent; }
.${scope} .bn-block-content::before { background: transparent !important; }
.${scope} .bn-editor ::selection { background: transparent; }`)
}

// A toggle's ▸ hangs in the left margin, so a run holding one reaches that far too.
function hangs(scope: string, ids: readonly string[]): string {
  const toggle = ids.map((id) => `.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > :not(.bn-block-group) .bn-toggle-button`).join(', ')
  return ids.map((id) => `.${scope}:has(${toggle}) .bn-block-outer[data-id="${CSS.escape(id)}"]:not(.dana-thread *) > .bn-block::after`).join(', ')
}

export interface BlockSelectionActions {
  /** Remove these blocks by the surface's own rule. */
  readonly remove: (ids: readonly string[]) => void
  readonly duplicate: (ids: readonly string[]) => void
  /** Whether a nested shape can be kept; a Tab that would break it does nothing. */
  readonly admits?: (document: readonly TreeBlock[]) => boolean
  /** Move these blocks a step (Mod+Shift+↑/↓); true when the page changed. */
  readonly move?: (ids: readonly string[], direction: -1 | 1) => boolean
}

function isMod(event: KeyboardEvent): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
}

/** A node selection keeps its tint even blurred, so turn it into a text selection first. */
function dropNodeSelection(view: EditorView): void {
  const { selection, doc } = view.state
  if (selection instanceof NodeSelection) {
    // TextSelection.near falls back to a node selection when no text is near: search text only.
    const text = Selection.findFrom(doc.resolve(selection.from), -1, true) ?? Selection.findFrom(doc.resolve(selection.to), 1, true)
    // A page of only atoms has no text, so a collapsed cursor beside the row lets go of it.
    view.dispatch(view.state.tr.setSelection(text ?? TextSelection.create(doc, selection.from)))
  }
  view.dom.blur()
  const active = document.activeElement
  if (active instanceof HTMLElement && view.dom.contains(active)) active.blur()
}

function currentBlockId(view: EditorView): string | null {
  const $from = view.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') return node.attrs.id
  }
  return null
}

/** Where block `id`'s container starts in the document, or -1. */
function blockAt(view: EditorView, id: string): number {
  let at = -1
  view.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.type.name === 'blockContainer' && node.attrs.id === id) { at = pos; return false }
    return true
  })
  return at
}

/** The caret at the `edge` of block `id`'s text; false when the block is a row. */
function caretInto(view: EditorView, id: string, edge: 'start' | 'end'): boolean {
  const { doc } = view.state
  let at = -1
  doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.type.name === 'blockContainer' && node.attrs.id === id) { at = pos; return false }
    return true
  })
  const content = at < 0 ? null : doc.nodeAt(at + 1)
  if (content === null || !content.inlineContent) return false
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, edge === 'start' ? at + 2 : at + 2 + content.content.size)).scrollIntoView())
  view.focus()
  return true
}

// The row the arrow keys are passing through, while it is the one picked block.
// A pick made by Esc, the handle or the marquee keeps the block keys.
const rowSteps = new WeakMap<object, string>()

/**
 * ↑/↓ from a row to the visible block beside it. A row reached this way is picked,
 * not ProseMirror-selected: Chrome moves the DOM selection off a row's node view and
 * the caret jumped to the first line.
 */
function stepFromRow(editor: AnyEditor, view: EditorView, id: string, direction: -1 | 1): boolean {
  const next = neighbour(view, id, direction, false)?.getAttribute('data-id')
  if ((next === null || next === undefined) && direction === 1 && toLineBelow(editor, view)) return true
  if (next === null || next === undefined) return false
  if (caretInto(view, next, direction === 1 ? 'start' : 'end')) { rowSteps.delete(editor); return true }
  pickRow(editor, view, next)
  return true
}

/**
 * Whether ↑/↓ off the edge of the text is ours: the next visible block is a row,
 * there is none, or hidden blocks lie between.
 */
function takesStep(view: EditorView, id: string, direction: -1 | 1): boolean {
  const next = neighbour(view, id, direction, false)
  if (next === null) return direction === 1
  const nextId = next.getAttribute('data-id')
  if (nextId !== null && isRow(view, nextId)) return true
  const all = [...view.dom.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
  const own = outerOf(view, id)
  return own !== null && Math.abs(all.indexOf(next) - all.indexOf(own)) > 1
}

/** Pick one row as the arrow keys reach it. */
function pickRow(editor: AnyEditor, view: EditorView, next: string): void {
  setBlockSelection(editor, [next])
  rowSteps.set(editor, next)
  // Leave the text: Chrome would move the DOM selection off the row, and ProseMirror
  // would read it back.
  view.dom.blur()
  anchors.set(editor, next)
  reveal(view, [next], 'first')
}

// ↓ from the last block goes into Work's "Add a task…" line, and ↑ comes back.
function lineBelow(view: EditorView): HTMLInputElement | null {
  return view.dom.closest('.dana-writing-canvas')?.querySelector<HTMLInputElement>('.dana-add-task-line input') ?? null
}
function toLineBelow(editor: AnyEditor, view: EditorView): boolean {
  const line = lineBelow(view)
  if (line === null) return false
  clearBlockSelection(editor)
  rowSteps.delete(editor)
  line.focus()
  return true
}
/** ↑ from the last line: the caret at the end of the last visible block, or that row picked. */
export function enterFromBelow(editor: AnyEditor): boolean {
  const view = viewOf(editor)
  const last = view === undefined ? undefined : visibleBlocks(view).at(-1)?.getAttribute('data-id')
  return last !== null && last !== undefined && landOn(editor, last)
}
export function blockAbove(editor: AnyEditor, id: string): string | null {
  const view = viewOf(editor)
  return view === undefined ? null : neighbour(view, id, -1, false)?.getAttribute('data-id') ?? null
}
/** The caret at the end of the block's text, or the block picked when it is a row. */
export function landOn(editor: AnyEditor, id: string): boolean {
  const view = viewOf(editor)
  if (view === undefined || outerOf(view, id) === null) return false
  if (caretInto(view, id, 'end')) return true
  pickRow(editor, view, id)
  return true
}

/** Tab / Shift-Tab for the whole selection, which stays selected. */
function nestSelection(editor: AnyEditor, view: EditorView, ids: readonly string[], direction: 'in' | 'out', admits?: (document: readonly TreeBlock[]) => boolean): void {
  if (direction === 'in') {
    let document = editor.document as unknown as TreeBlock[]
    for (const id of ids) {
      const next = simulateNest(document, id)
      if (next === null) return
      document = next
    }
    if (admits !== undefined && !admits(document)) return
    editor.nestBlock()
  } else {
    editor.unnestBlock()
  }
  selectBlocks(view, ids)
}

/** Where a Shift+arrow run started: the end that stays put. */
const anchors = new WeakMap<object, string>()

/** A block's own row, never the children nested under it. */
const OWN_ROW = ':scope > .bn-block > .bn-block-content, :scope > .bn-block > .react-renderer > .bn-block-content'

/** A block with no text of its own to put a caret in. */
function isRow(view: EditorView, id: string): boolean {
  const own = outerOf(view, id)?.querySelector(OWN_ROW)
  return own !== null && own !== undefined && own.querySelector('.bn-inline-content') === null
}

function outerOf(view: EditorView, id: string): HTMLElement | null {
  return view.dom.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(id)}"]`)
}

/** Visible blocks in reading order; a closed toggle's children are skipped. */
function visibleBlocks(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
    .filter((outer) => (outer.querySelector(OWN_ROW)?.getBoundingClientRect().height ?? 0) > 0)
}

function neighbour(view: EditorView, id: string, direction: -1 | 1, pastChildren: boolean): HTMLElement | null {
  const outer = outerOf(view, id)
  if (outer === null) return null
  const blocks = visibleBlocks(view)
  const at = blocks.indexOf(outer)
  if (at < 0) return null
  if (direction === -1) return blocks[at - 1] ?? null
  return blocks.slice(at + 1).find((next) => !(pastChildren && outer.contains(next))) ?? null
}

function reveal(view: EditorView, ids: readonly string[], edge: 'first' | 'last'): void {
  const id = edge === 'first' ? ids[0] : ids.at(-1)
  if (id !== undefined) outerOf(view, id)?.querySelector(OWN_ROW)?.scrollIntoView({ block: 'nearest' })
}

/** ↑/↓ move the selection a block; with Shift they extend or shrink it from its anchor. */
function arrowSelection(editor: AnyEditor, view: EditorView, ids: readonly string[], direction: -1 | 1, extend: boolean): void {
  if (!extend) {
    const next = neighbour(view, direction === -1 ? ids[0]! : ids.at(-1)!, direction, false)?.getAttribute('data-id')
    if (next === null || next === undefined) return
    // A row is picked out of the DOM selection, as from text (`pickRow`).
    if (isRow(view, next)) { pickRow(editor, view, next); return }
    anchors.set(editor, next)
    setBlockSelection(editor, [next])
    reveal(view, [next], 'first')
    return
  }
  const stored = anchors.get(editor)
  const anchor = stored !== undefined && ids.includes(stored) ? stored : direction === 1 ? ids[0]! : ids.at(-1)!
  anchors.set(editor, anchor)
  // The moving end is the one away from the anchor; toward it the selection shrinks.
  const growing = ids.length === 1 || (direction === 1 ? anchor === ids[0] : anchor === ids.at(-1))
  if (!growing) {
    setBlockSelection(editor, direction === 1 ? ids.slice(1) : ids.slice(0, -1))
    reveal(view, blockSelection(editor), direction === 1 ? 'first' : 'last')
    return
  }
  const next = neighbour(view, direction === 1 ? ids.at(-1)! : ids[0]!, direction, true)?.getAttribute('data-id')
  if (next === null || next === undefined) return
  setBlockSelection(editor, direction === 1 ? [...ids, next] : [next, ...ids])
  reveal(view, blockSelection(editor), direction === 1 ? 'last' : 'first')
}

/** Enter: back to writing at the end of the text; a sub-page or task row opens. */
function editSelection(editor: AnyEditor, view: EditorView, ids: readonly string[]): void {
  const id = ids[0]!
  const block = editor.getBlock(id)
  if (block === undefined) return
  // The row's own opener, as a click on it.
  const opens = outerOf(view, id)?.querySelector<HTMLElement>(':scope > .bn-block a[data-canvas-page-id], :scope > .bn-block [data-canvas-task-id][tabindex]')
  if (opens !== null && opens !== undefined) { clearBlockSelection(editor); opens.click(); return }
  if (!Array.isArray(block.content)) return
  editor.setTextCursorPosition(id, 'end')
  view.focus()
}

// Mod+/ opens the block's menu: point BlockNote's gutter at the block, then press
// the handle as ↓ does.
function openBlockMenu(view: EditorView, id: string): void {
  const row = outerOf(view, id)?.querySelector<HTMLElement>(OWN_ROW)
  if (row === null || row === undefined) return
  const box = row.getBoundingClientRect()
  row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: box.left + 1, clientY: box.top + Math.min(box.height / 2, 8) }))
  let frames = 0
  const press = (): void => {
    const container = view.dom.closest('.bn-container') ?? document
    const handle = container.querySelector<HTMLElement>('.dana-drag-handle')
    if (handle === null) { if (++frames < 10) requestAnimationFrame(press); return }
    handle.focus()
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  }
  requestAnimationFrame(press)
}

// Block-selection keys, in the window's capture phase before the editor's. The keys
// belong to this editor only while focus is in its text or gutter, or on nothing
// with no dialog over it, so a Backspace in a search box never deletes blocks.
function ownsKeys(view: EditorView): boolean {
  const active = document.activeElement
  if (active !== null && active !== document.body) return view.dom.contains(active) || isGutter(view, active)
  return ![...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((dialog) => !dialog.contains(view.dom))
}
function isGutter(view: EditorView, element: Element): boolean {
  const gutter = element.closest('.bn-side-menu')
  return gutter !== null && (view.dom.closest('.bn-container')?.contains(gutter) ?? false)
}

export function useBlockSelectionKeys(editor: AnyEditor, actions: BlockSelectionActions): void {
  useEffect(() => {
    let escape: KeyboardEvent | null = null
    function onKey(event: KeyboardEvent): void {
      // A synthetic key (the drag closing the handle menu) is not the user's.
      if (event.isComposing || !event.isTrusted) return
      const view = viewOf(editor)
      if (view === undefined || !view.editable) return
      const ids = blockSelection(editor)
      const key = event.key
      const mod = isMod(event)
      const stop = (): void => { event.preventDefault(); event.stopPropagation() }
      const inEditor = document.activeElement !== null && view.dom.contains(document.activeElement)
      const onHost = event.target === view.dom
      if (ids.length > 0 && !ownsKeys(view)) return
      if (key.toLowerCase() === 'd' && mod && !event.shiftKey && !event.altKey) {
        if (ids.length > 0) { stop(); actions.duplicate(ids); return }
        if (inEditor) { stop(); actions.duplicate([editor.getTextCursorPosition().block.id]) }
        return
      }
      // Mod+Shift+↑/↓ moves the picked blocks, or the caret's block, one step as a unit.
      if ((key === 'ArrowUp' || key === 'ArrowDown') && mod && event.shiftKey && !event.altKey && actions.move !== undefined) {
        const own = ids.length === 0 && onHost ? currentBlockId(view) : null
        const moving = ids.length > 0 ? ids : own === null ? EMPTY : [own]
        if (moving.length === 0) return
        stop()
        const { anchor, head } = view.state.selection
        const text = view.state.selection instanceof TextSelection
        const from = own === null ? -1 : blockAt(view, own)
        if (!actions.move(moving, key === 'ArrowUp' ? -1 : 1)) return
        if (ids.length > 0) { setBlockSelection(editor, ids); reveal(view, ids, key === 'ArrowUp' ? 'first' : 'last'); return }
        const to = own === null ? -1 : blockAt(view, own)
        if (to < 0 || from < 0 || own === null) return
        // The caret stays where it was in its block.
        if (text) { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to + anchor - from, to + head - from)).scrollIntoView()); return }
        // A row stays picked out of the text: a node selection does not survive the redraw.
        pickRow(editor, view, own)
        return
      }
      if (ids.length === 0) {
        // A node-selected row already wears the tint, so Esc there lets go of it.
        if (key === 'Escape' && !mod && !event.shiftKey && view.state.selection instanceof NodeSelection && view.state.selection.node.isBlock && ownsKeys(view)) {
          stop()
          dropNodeSelection(view)
          return
        }
        // A row ProseMirror selected: read its keys before ProseMirror, which would act at
        // the page's first line.
        const row = onHost && !mod && !event.altKey && view.state.selection instanceof NodeSelection && view.state.selection.node.isBlock ? currentBlockId(view) : null
        if (row !== null) {
          if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey) { stop(); stepFromRow(editor, view, row, key === 'ArrowUp' ? -1 : 1); return }
          if (key === 'Enter' && !event.shiftKey) { stop(); editSelection(editor, view, [row]); return }
          // Space ticks a task row, as its glyph does.
          if (key === ' ' && !event.shiftKey) { stop(); outerOf(view, row)?.querySelector<HTMLElement>(':scope > .bn-block [data-canvas-task-id] [role="checkbox"]')?.click(); return }
          if (key === 'Backspace' || key === 'Delete') { stop(); actions.remove([row]); return }
          if (key.length === 1) { stop(); return }
        }
        // Only keys typed into the text itself; a field inside a block keeps its own.
        if (!onHost) return
        // ↑/↓ off the edge of the text skip hidden blocks and pick rows; text-to-text moves
        // stay ProseMirror's, which keeps the column.
        if ((key === 'ArrowDown' || key === 'ArrowUp') && !mod && !event.shiftKey && !event.altKey && view.state.selection.empty && editor.getExtension(SuggestionMenu)?.shown() !== true
          && view.endOfTextblock(key === 'ArrowDown' ? 'down' : 'up')) {
          const direction = key === 'ArrowDown' ? 1 : -1
          const own = currentBlockId(view)
          if (own !== null && takesStep(view, own, direction) && stepFromRow(editor, view, own, direction)) { stop(); return }
        }
        if (mod && key.toLowerCase() === 'a' && !event.shiftKey && !event.altKey) {
          const { selection, doc } = view.state
          const $from = selection.$from
          const oneBlock = $from.parent.inlineContent && $from.sameParent(selection.$to)
          const whole = oneBlock && selection.from === $from.start() && selection.to === $from.end()
          stop()
          if (oneBlock && !whole && $from.parent.content.size > 0) {
            view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, $from.start(), $from.end())))
          } else setBlockSelection(editor, editor.document.map((block) => block.id))
          return
        }
        if (key === 'Escape' && !mod && !event.shiftKey && !editor.getExtension(SuggestionMenu)?.shown() && currentBlockId(view) !== null) {
          // Claim Esc now and decide on the way back up, so an inner handler can take it first.
          event.preventDefault()
          escape = event
        }
        return
      }
      // A key inside an open menu belongs to the menu.
      if (document.activeElement?.closest('[role="menu"]')) return
      if (key === 'Escape') { stop(); clearBlockSelection(editor); dropNodeSelection(view); return }
      if (key === 'Backspace' || key === 'Delete') {
        stop()
        // Removed while still picked, so Undo gives the picked blocks back.
        actions.remove(ids)
        // Refused (the canvas guard says why): the blocks stay picked.
        if (ids.every((id) => editor.getBlock(id) !== undefined)) setBlockSelection(editor, ids)
        else clearBlockSelection(editor)
        return
      }
      if ((key === 'ArrowUp' || key === 'ArrowDown') && !mod && !event.altKey && !event.shiftKey && ids.length === 1 && rowSteps.get(editor) === ids[0]) {
        stop(); stepFromRow(editor, view, ids[0]!, key === 'ArrowUp' ? -1 : 1); return
      }
      if ((key === 'ArrowUp' || key === 'ArrowDown') && !mod && !event.altKey) { stop(); arrowSelection(editor, view, ids, key === 'ArrowUp' ? -1 : 1, event.shiftKey); return }
      if (key === 'Enter' && !mod && !event.shiftKey && !event.altKey) { stop(); editSelection(editor, view, ids); return }
      // Space ticks one picked task.
      if (key === ' ' && ids.length === 1 && !mod && !event.shiftKey && !event.altKey) {
        const tick = outerOf(view, ids[0]!)?.querySelector<HTMLElement>(':scope > .bn-block [data-canvas-task-id] [role="checkbox"]')
        if (tick !== null && tick !== undefined) { stop(); tick.click(); return }
      }
      if (key === '/' && mod && !event.shiftKey && !event.altKey) { stop(); openBlockMenu(view, ids[0]!); return }
      if (mod && key.toLowerCase() === 'a' && !event.shiftKey) { stop(); setBlockSelection(editor, editor.document.map((block) => block.id)); return }
      if (key === 'Tab' && !mod && !event.altKey) { stop(); nestSelection(editor, view, ids, event.shiftKey ? 'out' : 'in', actions.admits); return }
      // Undo and redo with blocks picked outside the text go to the editor, so a move
      // undoes in one step.
      if (mod && !event.altKey && !inEditor && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
        stop()
        if (key.toLowerCase() === 'y' || event.shiftKey) editor.redo()
        else editor.undo()
        const kept = ids.filter((id) => editor.getBlock(id) !== undefined)
        if (kept.length > 0) setBlockSelection(editor, kept)
        return
      }
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(key) || mod) return // copy, cut, undo keep their meaning
      if (key.length === 1) { stop(); return } // a typed character does not replace the blocks
      clearBlockSelection(editor)
    }
    function onKeyUnclaimed(event: KeyboardEvent): void {
      if (event !== escape) return
      escape = null
      const view = viewOf(editor)
      const id = view === undefined ? null : currentBlockId(view)
      if (id === null) return
      event.stopPropagation()
      anchors.set(editor, id)
      setBlockSelection(editor, [id])
    }
    function onPointer(event: PointerEvent): void {
      if (event.shiftKey || blockSelection(editor).length === 0) return
      const target = event.target as Element | null
      if (target?.closest('[role="menu"], .bn-side-menu')) return
      clearBlockSelection(editor)
    }
    function onFocus(event: FocusEvent): void {
      const view = viewOf(editor)
      const target = event.target as Element | null
      if (view === undefined || target === null || blockSelection(editor).length === 0) return
      if (view.dom.contains(target) || isGutter(view, target) || target.closest('[role="menu"]')) return
      clearBlockSelection(editor)
    }
    // After a handle drag focus is on nothing, so return it to the page for the next Mod+Z.
    function onDrop(event: DragEvent): void {
      const view = viewOf(editor)
      if (view === undefined || !(event.target instanceof Node) || !view.dom.contains(event.target)) return
      window.setTimeout(() => {
        const active = document.activeElement
        if (!view.dom.isConnected || (active !== null && active !== document.body && !isGutter(view, active))) return
        view.focus()
      }, 0)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    window.addEventListener('keydown', onKeyUnclaimed)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onKeyUnclaimed)
      window.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [editor, actions])
}

/** `#block-<id>` scrolls to that block and selects it. */
export function blockLink(id: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#block-${id}`
}
export function useBlockAnchor(editor: AnyEditor, ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    function follow(): void {
      const match = /^#block-(.+)$/.exec(window.location.hash)
      if (match === null) return
      const id = decodeURIComponent(match[1]!)
      const element = editor.domElement?.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"]`)
      if (!element) return
      element.scrollIntoView({ block: 'center' })
      setBlockSelection(editor, [id])
    }
    const timer = window.setTimeout(follow, 0)
    window.addEventListener('hashchange', follow)
    return () => { window.clearTimeout(timer); window.removeEventListener('hashchange', follow) }
  }, [editor, ready])
}
