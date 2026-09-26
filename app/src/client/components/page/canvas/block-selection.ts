/*
Block selection: the Notion-style "these whole blocks are picked" state.
Clicking a block's ⋮⋮ handle selects it; the marquee (`CanvasMarquee.tsx`),
Esc and Cmd/Ctrl+A select through the same calls.

There is one selection, and it is the editor's own: BlockNote's multi-block
selection (`marquee.ts`), which is also what its handle drag moves, so a drag
by any selected block's handle carries them all. The calls below are thin
reads and writes of it.

The tint is drawn by `BlockSelectionStyle` as a generated stylesheet keyed by
the blocks' `data-id`, never as an attribute written into the editor's DOM,
which ProseMirror would observe and redraw away. It is a soft layer a little
larger than the blocks, one shape for the whole run, from canvas.css's
`--dana-block-selection*` (spec: rgba(35,131,226,.14) light / .24 dark), no
border or outline.

API for other units:
  setBlockSelection(editor, ids)   select these blocks (one sibling run)
  blockSelection(editor)           the selected ids, in document order
  clearBlockSelection(editor)
  onBlockSelection(editor, fn)     subscribe; returns the unsubscribe
*/
import { createElement, useEffect, useSyncExternalStore } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { clearBlocks, selectBlocks, selectedBlocks } from './marquee.js'
import { simulateNest } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'

// Any BlockNote editor: the canvas's and the Task composer's schemas differ.
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
  // The same array while nothing changed (a `useSyncExternalStore` snapshot).
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
 * The tint for the selected blocks, scoped to this editor's own root: one
 * soft layer per block that reaches a little past it on every side, rounded
 * only at the run's top and bottom, so a run of blocks (always one sibling
 * run) reads as one calm shape. canvas.css holds its measures and fade.
 */
export function BlockSelectionStyle({ editor, scope }: { readonly editor: AnyEditor; readonly scope: string }): React.JSX.Element | null {
  const ids = useBlockSelection(editor)
  if (ids.length === 0) return null
  /* On the Work thread a block's own ::after is its rail badge (thread.css),
     so the tint is drawn on the block's outer box there instead. */
  const block = (id: string): string => `.${scope} .bn-block-outer[data-id="${CSS.escape(id)}"]:not(.dana-thread *) > .bn-block`
  const threaded = (id: string): string => `.dana-thread .${scope} .bn-block-outer[data-id="${CSS.escape(id)}"]`
  const all = ids.flatMap((id) => [block(id), threaded(id)])
  // No caret, and no text highlight over the picked blocks: they are picked whole.
  // No row hover either (canvas.css m3-hover): it reaches past its row, so it
  // would paint over a neighbour's tint and show through a picked row's.
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

/* A toggle's ▸ hangs in the margin left of its text (canvas.css), so a run
   holding one reaches that far left too, the whole run alike (`:has`, so a
   block turned into a toggle while picked widens it as well). */
function hangs(scope: string, ids: readonly string[]): string {
  const toggle = ids.map((id) => `.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > :not(.bn-block-group) .bn-toggle-button`).join(', ')
  return ids.map((id) => `.${scope}:has(${toggle}) .bn-block-outer[data-id="${CSS.escape(id)}"]:not(.dana-thread *) > .bn-block::after`).join(', ')
}

export interface BlockSelectionActions {
  /** Remove these blocks (the surface's own rule, e.g. a Task stays). */
  readonly remove: (ids: readonly string[]) => void
  readonly duplicate: (ids: readonly string[]) => void
  /** Whether a nested shape can be kept; Tab that would break it does nothing. */
  readonly admits?: (document: readonly TreeBlock[]) => boolean
  /** Move these blocks a step (Mod+Shift+↑/↓); true when the page changed. */
  readonly move?: (ids: readonly string[], direction: -1 | 1) => boolean
}

function isMod(event: KeyboardEvent): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
}

/** Nothing selected and the caret gone: a node selection keeps its tint even blurred, so it becomes a text one first. */
function dropNodeSelection(view: EditorView): void {
  const { selection, doc } = view.state
  if (selection instanceof NodeSelection) {
    /* TextSelection.near falls back to a node selection when no text is near,
       which kept the tint: search text only. */
    const text = Selection.findFrom(doc.resolve(selection.from), -1, true) ?? Selection.findFrom(doc.resolve(selection.to), 1, true)
    /* A page of nothing but atoms (sub-page rows) has no text anywhere: a
       collapsed cursor beside the row is the only way to let go of it. */
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

/** The caret at the `edge` of block `id`'s text; false when the block has no text (a row). */
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

/* The row the arrow keys are passing through (below), while it is the one
   block picked: ↑/↓ from it go on into text as from any row. A pick made by
   Esc, the handle or the marquee is not one, and keeps Notion's block keys. */
const rowSteps = new WeakMap<object, string>()

/**
 * ↑/↓ from a row (a Task, sub-page, divider or image) to the visible block
 * beside it, as from text: into its text at the near edge, or onto it when it
 * is a row too. A row reached this way is picked as Esc picks a block (its
 * tint, Enter opens it, Backspace removes it), not ProseMirror-selected:
 * Chrome moves the DOM selection off a row's node view, ProseMirror reads it
 * back at the next key, and the caret landed at the page's first line.
 * Read in the window's capture phase, before ProseMirror sees the key.
 */
function stepFromRow(editor: AnyEditor, view: EditorView, id: string, direction: -1 | 1): void {
  const next = neighbour(view, id, direction, false)?.getAttribute('data-id')
  if ((next === null || next === undefined) && direction === 1 && toLineBelow(editor, view)) return
  if (next === null || next === undefined) return
  if (caretInto(view, next, direction === 1 ? 'start' : 'end')) { rowSteps.delete(editor); return }
  pickRow(editor, view, next)
}

/** Pick one row out of the text, as the arrow keys reach it; ↑/↓ then step on from it (`stepFromRow`). */
function pickRow(editor: AnyEditor, view: EditorView, next: string): void {
  setBlockSelection(editor, [next])
  rowSteps.set(editor, next)
  // Out of the text: Chrome would move the DOM selection off the row, and ProseMirror read it back. The picked row keeps the keys (`ownsKeys`).
  view.dom.blur()
  anchors.set(editor, next)
  reveal(view, [next], 'first')
}

/* Work's thread ends in its last line, "Add a task…" (`AddTaskLine`), drawn
   after the editor: ↓ from the page's last block goes on into it, and ↑ from
   it comes back up to that block, so the page and its last line are one
   stretch to the keyboard. */
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
/** ↑ from the last line: the caret at the end of the page's last visible block, or that block picked when it is a row. */
export function enterFromBelow(editor: AnyEditor): boolean {
  const view = viewOf(editor)
  const last = view === undefined ? undefined : visibleBlocks(view).at(-1)?.getAttribute('data-id')
  return last !== null && last !== undefined && landOn(editor, last)
}
/** The visible block just above block `id` in reading order, or null. */
export function blockAbove(editor: AnyEditor, id: string): string | null {
  const view = viewOf(editor)
  return view === undefined ? null : neighbour(view, id, -1, false)?.getAttribute('data-id') ?? null
}
/** The caret at the end of block `id`'s text, or that block picked when it is a row (a Task). */
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

/** Where a Shift+arrow run started: the end of the selection that stays put. */
const anchors = new WeakMap<object, string>()

/** A block's own row: its content line, never the children nested under it. */
const OWN_ROW = ':scope > .bn-block > .bn-block-content, :scope > .bn-block > .react-renderer > .bn-block-content'

/** A block with no text of its own to put a caret in. */
function isRow(view: EditorView, id: string): boolean {
  const own = outerOf(view, id)?.querySelector(OWN_ROW)
  return own !== null && own !== undefined && own.querySelector('.bn-inline-content') === null
}

function outerOf(view: EditorView, id: string): HTMLElement | null {
  return view.dom.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(id)}"]`)
}

/** Every block a reader can see, in reading order (children after their parent; a closed toggle's are skipped). */
function visibleBlocks(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
    .filter((outer) => (outer.querySelector(OWN_ROW)?.getBoundingClientRect().height ?? 0) > 0)
}

/** The visible block before `id`, or the first one after it (past its children when `pastChildren`). */
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
    /* A row (a Task, sub-page, divider or image) is picked as the arrow keys
       pick it from text (`pickRow`): out of the editor's DOM selection, which
       Chrome would otherwise move off the row and ProseMirror read back as
       the page's first line. */
    if (isRow(view, next)) { pickRow(editor, view, next); return }
    anchors.set(editor, next)
    setBlockSelection(editor, [next])
    reveal(view, [next], 'first')
    return
  }
  const stored = anchors.get(editor)
  const anchor = stored !== undefined && ids.includes(stored) ? stored : direction === 1 ? ids[0]! : ids.at(-1)!
  anchors.set(editor, anchor)
  // The moving end is the one away from the anchor; toward the anchor it shrinks.
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

/** Enter: back to writing, the caret at the end of the block's text; a sub-page row or a Task opens. */
function editSelection(editor: AnyEditor, view: EditorView, ids: readonly string[]): void {
  const id = ids[0]!
  const block = editor.getBlock(id)
  if (block === undefined) return
  // The row's own opener, as a click on it (a Task opens where the person chose: peek or page).
  const opens = outerOf(view, id)?.querySelector<HTMLElement>(':scope > .bn-block a[data-canvas-page-id], :scope > .bn-block [data-canvas-task-id][tabindex]')
  if (opens !== null && opens !== undefined) { clearBlockSelection(editor); opens.click(); return }
  if (!Array.isArray(block.content)) return
  editor.setTextCursorPosition(id, 'end')
  view.focus()
}

/*
Mod+/: the block's ⋮⋮ menu (Turn into first), from the keyboard. BlockNote
shows its gutter for the block under the pointer, so it is pointed at the
selected block, and the handle opens its menu as it does for ↓.
*/
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

/*
The canvas's key handler for block selection (window, capture phase, so it
runs before the editor's own keys), in Notion's three modes:
- writing: Esc selects the current block (unless the / menu is open, or
  something inside the page takes Esc for itself, as a draft Task line does:
  the pick happens only if the key comes back up to the window unclaimed).
  Mod+A picks the block's text and then every block, Mod+D duplicates the
  block;
- blocks selected: ↑/↓ move the selection, Shift+↑/↓ extend it, Enter writes
  in it again, Backspace/Delete remove, Mod+D duplicates, Mod+/ opens its
  menu, Tab/Shift-Tab nest, Mod+A picks every block, Esc clears and leaves the
  editor (the next Esc reaches a peek), a typed character is swallowed, and
  any other plain key drops the selection;
- nothing: the keys are the page's.
A click anywhere but a menu, the gutter or a Shift-click drops the selection.
*/
/*
The keys are this editor's only while the person is in it: focus in its text
or its gutter, or on nothing at all (Esc leaves the editor with the blocks
still picked) with no dialog open over it. Anywhere else (search, a peek, a
dialog, any field) the keys are that place's, and focus arriving there drops
the selection, so a Backspace typed into a search box never deletes picked
blocks behind it.
*/
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
      // Mod+Shift+↑/↓ moves the picked blocks, or the caret's block, a step as a unit (`moveBlocksBy`).
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
        /* A row (a Task) stays picked, as the arrow keys pick one (`stepFromRow`),
           out of the text: a node selection on its redrawn node view does not
           survive, the caret fell to the page's first line, and the next press
           moved that block instead. */
        pickRow(editor, view, own)
        return
      }
      if (ids.length === 0) {
        /* A Task row, sub-page row, image or divider (a node selection) is
           already wearing the selection tint, whether it was reached by the
           keys or by a click that then moved focus onto the row or off the
           editor: Esc there is the second Esc, and lets go of it. */
        if (key === 'Escape' && !mod && !event.shiftKey && view.state.selection instanceof NodeSelection && view.state.selection.node.isBlock && ownsKeys(view)) {
          stop()
          dropNodeSelection(view)
          return
        }
        /* A row ProseMirror selected (↓ from text onto a Task): its keys are
           read here, before ProseMirror, which would act at the page's first
           line (`stepFromRow`). ↑/↓ step on; the rest are a picked block's:
           Enter opens a Task or sub-page, Space ticks a Task, Backspace/Delete remove it by the
           surface's rule, a letter does nothing. */
        const row = onHost && !mod && !event.altKey && view.state.selection instanceof NodeSelection && view.state.selection.node.isBlock ? currentBlockId(view) : null
        if (row !== null) {
          if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey) { stop(); stepFromRow(editor, view, row, key === 'ArrowUp' ? -1 : 1); return }
          if (key === 'Enter' && !event.shiftKey) { stop(); editSelection(editor, view, [row]); return }
          // Space ticks a Task row, as its glyph does (M4 §2.7).
          if (key === ' ' && !event.shiftKey) { stop(); outerOf(view, row)?.querySelector<HTMLElement>(':scope > .bn-block [data-canvas-task-id] [role="checkbox"]')?.click(); return }
          if (key === 'Backspace' || key === 'Delete') { stop(); actions.remove([row]); return }
          if (key.length === 1) { stop(); return }
        }
        // Only keys typed into the text itself (a field inside a block keeps its own).
        if (!onHost) return
        // ↓ on the last line of the page's last block goes on into Work's last line.
        if (key === 'ArrowDown' && !mod && !event.shiftKey && !event.altKey && view.state.selection.empty && editor.getExtension(SuggestionMenu)?.shown() !== true
          && view.endOfTextblock('down') && visibleBlocks(view).at(-1)?.getAttribute('data-id') === currentBlockId(view) && toLineBelow(editor, view)) { stop(); return }
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
          // Claimed (a handler that yields to a claimed Esc does), and decided on the way back up.
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
        // Removed while still picked, so Undo gives the picked blocks back (the selection's bookmark, `marquee.ts`).
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
      // Space ticks one picked Task, as on a row reached from text (above).
      if (key === ' ' && ids.length === 1 && !mod && !event.shiftKey && !event.altKey) {
        const tick = outerOf(view, ids[0]!)?.querySelector<HTMLElement>(':scope > .bn-block [data-canvas-task-id] [role="checkbox"]')
        if (tick !== null && tick !== undefined) { stop(); tick.click(); return }
      }
      if (key === '/' && mod && !event.shiftKey && !event.altKey) { stop(); openBlockMenu(view, ids[0]!); return }
      if (mod && key.toLowerCase() === 'a' && !event.shiftKey) { stop(); setBlockSelection(editor, editor.document.map((block) => block.id)); return }
      if (key === 'Tab' && !mod && !event.altKey) { stop(); nestSelection(editor, view, ids, event.shiftKey ? 'out' : 'in', actions.admits); return }
      /* Undo and redo while blocks are picked from outside the text (the arrow
         keys or the marquee leave the editor unfocused) are the editor's, so a
         Mod+Shift+↑/↓ move comes back in one step, as a drag does. */
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
    /* A drag by the handle drops with focus left on nothing, where no undo
       reaches the editor: focus goes back to the page, so the next Mod+Z
       takes the whole move back (one entry), as it does after a keyboard move. */
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

/** `#block-<id>` (Copy link to block) scrolls to that block and selects it. */
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
