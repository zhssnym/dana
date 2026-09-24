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
import { TextSelection } from 'prosemirror-state'
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
  const block = (id: string): string => `.${scope} .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block`
  const all = ids.map(block)
  // No caret, and no text highlight over the picked blocks: they are picked whole.
  return createElement('style', null, `${all.join(', ')} { position: relative; }
${all.map((selector) => `${selector}::after`).join(', ')} { content: ''; position: absolute; inset: 0 calc(-1 * var(--dana-block-selection-inset-x)); background: var(--dana-block-selection); pointer-events: none; animation: dana-block-selection-in var(--duration-fast) var(--ease-enter); }
${block(ids[0]!)}::after { top: calc(-1 * var(--dana-block-selection-inset-y)); border-start-start-radius: var(--dana-block-selection-radius); border-start-end-radius: var(--dana-block-selection-radius); }
${block(ids.at(-1)!)}::after { bottom: calc(-1 * var(--dana-block-selection-inset-y)); border-end-start-radius: var(--dana-block-selection-radius); border-end-end-radius: var(--dana-block-selection-radius); }
${hangs(scope, ids)} { inset-inline-start: calc(-1 * (var(--dana-block-selection-inset-x) + var(--dana-block-selection-hang))); }
.${scope} .bn-editor { caret-color: transparent; }
.${scope} .bn-editor ::selection { background: transparent; }`)
}

/* A toggle's ▸ hangs in the margin left of its text (canvas.css), so a run
   holding one reaches that far left too, the whole run alike (`:has`, so a
   block turned into a toggle while picked widens it as well). */
function hangs(scope: string, ids: readonly string[]): string {
  const toggle = ids.map((id) => `.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > :not(.bn-block-group) .bn-toggle-button`).join(', ')
  return ids.map((id) => `.${scope}:has(${toggle}) .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block::after`).join(', ')
}

export interface BlockSelectionActions {
  /** Remove these blocks (the surface's own rule, e.g. a Task stays). */
  readonly remove: (ids: readonly string[]) => void
  readonly duplicate: (ids: readonly string[]) => void
  /** Whether a nested shape can be kept; Tab that would break it does nothing. */
  readonly admits?: (document: readonly TreeBlock[]) => boolean
}

function isMod(event: KeyboardEvent): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
}

function currentBlockId(view: EditorView): string | null {
  const $from = view.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') return node.attrs.id
  }
  return null
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
      if (ids.length === 0) {
        // Only keys typed into the text itself (a field inside a block keeps its own).
        if (!onHost) return
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
      if (key === 'Escape') { stop(); clearBlockSelection(editor); view.dom.blur(); return }
      if (key === 'Backspace' || key === 'Delete') {
        stop()
        // Removed while still picked, so Undo gives the picked blocks back (the selection's bookmark, `marquee.ts`).
        actions.remove(ids)
        // Refused (the canvas guard says why): the blocks stay picked.
        if (ids.every((id) => editor.getBlock(id) !== undefined)) setBlockSelection(editor, ids)
        else clearBlockSelection(editor)
        return
      }
      if ((key === 'ArrowUp' || key === 'ArrowDown') && !mod && !event.altKey) { stop(); arrowSelection(editor, view, ids, key === 'ArrowUp' ? -1 : 1, event.shiftKey); return }
      if (key === 'Enter' && !mod && !event.shiftKey && !event.altKey) { stop(); editSelection(editor, view, ids); return }
      if (key === '/' && mod && !event.shiftKey && !event.altKey) { stop(); openBlockMenu(view, ids[0]!); return }
      if (mod && key.toLowerCase() === 'a' && !event.shiftKey) { stop(); setBlockSelection(editor, editor.document.map((block) => block.id)); return }
      if (key === 'Tab' && !mod && !event.altKey) { stop(); nestSelection(editor, view, ids, event.shiftKey ? 'out' : 'in', actions.admits); return }
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
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    window.addEventListener('keydown', onKeyUnclaimed)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
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
