/*
Notion's marquee (rubber band) block selection, for every BlockNote canvas.
Mount once inside a `BlockNoteView`: `<CanvasMarquee />`.

- Mouse-down in empty page space or the side margins (never in text) and
  drag: a faint rectangle; the blocks it touches become block-selected. The
  page scrolls when the pointer nears its top or bottom edge. Shift-drag adds.
- A plain click in a side margin puts the caret on that line, as the editor
  would have; a click anywhere else clears the selection.
- Shift-click on a block extends a block selection to it.
- Esc in text selects the current block; Esc again clears.
- Cmd/Ctrl+A: first the block's text, then every block.
- With blocks selected: Backspace/Delete removes, Cmd/Ctrl+D duplicates,
  Cmd/Ctrl+/ opens Turn into, Tab/Shift-Tab nest and un-nest, ↑↓ move the
  selection, Enter edits the first block, and dragging any selected block's
  handle moves them all (BlockNote's own drag, see `marquee.ts`).

The state is the editor's selection (`marquee.ts`); this file is only input.
One set of document listeners serves every mounted canvas, and a gesture goes
to the canvas whose page area holds it (the innermost, then the nearest).
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useBlockNoteEditor } from '@blocknote/react'
import { FormattingToolbarExtension, SuggestionMenu } from '@blocknote/core/extensions'
import { Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import {
  beforeBlockSelection, blockPositions, caretIn, clearBlockSelection, duplicateSelected, isBlockSelection, marqueePlugin, nestSelected,
  removeSelected, selectBlocks, selectedIds, turnIntoTargets, turnSelectedInto,
} from './marquee.js'
import type { AnyEditor, TurnIntoTarget } from './marquee.js'
import './marquee.css'

interface Instance {
  readonly editor: AnyEditor
  openTurnInto: () => void
}

const instances = new Set<Instance>()
const MENU = '[data-dana-marquee-menu]'
/* Chrome that owns its own clicks: never a marquee, never a clear. */
const KEEP = `${MENU}, .bn-side-menu, .bn-drag-handle-menu, .bn-suggestion-menu, .bn-formatting-toolbar, [role="menu"], [role="dialog"] [role="menu"], [data-radix-popper-content-wrapper]`
const INTERACTIVE = 'input, textarea, select, button, a[href], label, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="slider"], [contenteditable="true"], [contenteditable=""], [draggable="true"], .bn-side-menu'
const DRAG_THRESHOLD = 4
const EDGE = 48

const toolbarClosers = new WeakMap<AnyEditor, () => void>()

/** The editor's view, once mounted, with its toolbar closer attached (`selectBlocks`). */
function viewOf(editor: AnyEditor): EditorView | undefined {
  let view: EditorView | undefined
  try { view = editor.prosemirrorView ?? undefined } catch { return undefined }
  const close = toolbarClosers.get(editor)
  if (view !== undefined && close !== undefined && !beforeBlockSelection.has(view)) beforeBlockSelection.set(view, close)
  return view
}

function isScroller(element: Element): boolean {
  const style = getComputedStyle(element)
  return /(auto|scroll|overlay)/.test(style.overflowY)
}

/** The page area a canvas answers to: its scroll box, `main`, or its dialog. */
function zoneOf(dom: HTMLElement): HTMLElement {
  for (let node = dom.parentElement; node !== null && node !== document.body; node = node.parentElement) {
    if (node.tagName === 'MAIN' || node.getAttribute('role') === 'dialog' || isScroller(node)) return node
  }
  return document.body
}

function scrollerOf(dom: HTMLElement): HTMLElement {
  for (let node = dom.parentElement; node !== null && node !== document.body; node = node.parentElement) {
    if (isScroller(node) && node.scrollHeight > node.clientHeight) return node
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

function hasOwnText(element: Element): boolean {
  for (const child of element.childNodes) if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '') return true
  return false
}

function blockIdAt(target: Element, view: EditorView): string | null {
  const outer = target.closest<HTMLElement>('.bn-block-outer[data-id]')
  return outer !== null && view.dom.contains(outer) ? outer.getAttribute('data-id') : null
}

/* ---- The drag ---- */

interface Gesture {
  readonly instance: Instance
  readonly view: EditorView
  readonly scroller: HTMLElement
  readonly startX: number
  readonly startY: number // in scroller content coordinates
  readonly base: readonly string[]
  readonly target: Element
  readonly inEditor: boolean
  pointerX: number
  pointerY: number
  started: boolean
  frame: number
  rect: HTMLDivElement | null
  lastKey: string
}

let gesture: Gesture | null = null

function scrollTopOf(scroller: HTMLElement): number {
  return scroller === document.scrollingElement ? window.scrollY : scroller.scrollTop
}

function scrollerBox(scroller: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  if (scroller === document.scrollingElement || scroller === document.documentElement) return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  return scroller.getBoundingClientRect()
}

/** Blocks whose own row (not their children's) meets the band vertically. */
function hitIds(view: EditorView, top: number, bottom: number): string[] {
  const hits: string[] = []
  for (const outer of view.dom.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')) {
    const box = outer.getBoundingClientRect()
    if (box.height === 0) continue // inside a closed toggle
    const group = outer.querySelector<HTMLElement>(':scope > .bn-block > .bn-block-group')
    const rowBottom = group !== null && group.getBoundingClientRect().height > 0 ? group.getBoundingClientRect().top : box.bottom
    if (box.top < bottom && rowBottom > top) hits.push(outer.getAttribute('data-id')!)
  }
  return hits
}

function tick(): void {
  const current = gesture
  if (current === null || !current.started) return
  const { scroller, view } = current
  // Auto-scroll near the page's top and bottom edges.
  const box = scrollerBox(scroller)
  const nearTop = current.pointerY - Math.max(box.top, 0)
  const nearBottom = Math.min(box.bottom, window.innerHeight) - current.pointerY
  const pace = (distance: number): number => Math.min(24, Math.ceil((EDGE - distance) / 3))
  const speed = nearTop < EDGE ? -pace(nearTop) : nearBottom < EDGE ? pace(nearBottom) : 0
  if (speed !== 0) {
    if (scroller === document.scrollingElement) window.scrollBy(0, speed)
    else scroller.scrollTop += speed
  }
  const scrollTop = scrollTopOf(scroller)
  const anchorY = current.startY - scrollTop
  const top = Math.max(Math.min(anchorY, current.pointerY), box.top)
  const bottom = Math.min(Math.max(anchorY, current.pointerY), box.bottom)
  const left = Math.max(Math.min(current.startX, current.pointerX), box.left)
  const right = Math.min(Math.max(current.startX, current.pointerX), box.right)
  if (current.rect !== null) {
    current.rect.style.transform = `translate(${left}px, ${top}px)`
    current.rect.style.width = `${Math.max(0, right - left)}px`
    current.rect.style.height = `${Math.max(0, bottom - top)}px`
  }
  const hits = hitIds(view, Math.min(anchorY, current.pointerY), Math.max(anchorY, current.pointerY))
  const ids = [...new Set([...current.base, ...hits])]
  const key = ids.join(' ')
  if (key !== current.lastKey) {
    current.lastKey = key
    if (ids.length > 0) selectBlocks(view, ids)
    else clearBlockSelection(view)
  }
  current.frame = requestAnimationFrame(tick)
}

function onMove(event: MouseEvent): void {
  const current = gesture
  if (current === null) return
  current.pointerX = event.clientX
  current.pointerY = event.clientY
  if (!current.started) {
    const dy = event.clientY - (current.startY - scrollTopOf(current.scroller))
    if (Math.hypot(event.clientX - current.startX, dy) < DRAG_THRESHOLD) return
    current.started = true
    const rect = document.createElement('div')
    rect.className = 'dana-marquee-rect'
    rect.setAttribute('aria-hidden', 'true')
    document.body.appendChild(rect)
    current.rect = rect
    document.body.classList.add('dana-marquee-dragging')
    window.getSelection()?.removeAllRanges()
    current.frame = requestAnimationFrame(tick)
  }
  event.preventDefault()
}

function endGesture(): Gesture | null {
  const current = gesture
  gesture = null
  window.removeEventListener('mousemove', onMove, true)
  window.removeEventListener('mouseup', onUp, true)
  window.removeEventListener('blur', onCancel)
  if (current === null) return null
  cancelAnimationFrame(current.frame)
  current.rect?.remove()
  document.body.classList.remove('dana-marquee-dragging')
  return current
}

function onCancel(): void { endGesture() }

function onUp(event: MouseEvent): void {
  const current = endGesture()
  if (current === null) return
  const { view } = current
  if (current.started) {
    if (isBlockSelection(view.state.selection)) view.focus()
    return
  }
  // A plain click: what the editor would have done, without the band.
  if (isBlockSelection(view.state.selection)) clearBlockSelection(view)
  const box = view.dom.getBoundingClientRect()
  if (event.clientY < box.top || event.clientY > box.bottom) return
  const x = Math.min(Math.max(event.clientX, box.left + 1), box.right - 1)
  const found = view.posAtCoords({ left: x, top: event.clientY })
  if (found === null) return
  const $pos = view.state.doc.resolve(found.pos)
  const selection = $pos.parent.inlineContent ? TextSelection.create(view.state.doc, found.pos) : Selection.near($pos)
  view.dispatch(view.state.tr.setSelection(selection))
  view.focus()
}

function candidateFor(target: Element, y: number): { instance: Instance; view: EditorView; inEditor: boolean } | null {
  let best: { instance: Instance; view: EditorView; zone: HTMLElement; distance: number } | null = null
  for (const instance of instances) {
    const view = viewOf(instance.editor)
    if (view === undefined || !view.editable || !view.dom.isConnected) continue
    if (view.dom.contains(target)) return { instance, view, inEditor: true }
    if (target.closest('.ProseMirror') !== null) continue // another canvas's text
    const zone = zoneOf(view.dom)
    if (!zone.contains(target)) continue
    const box = view.dom.getBoundingClientRect()
    const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    // The innermost page area wins; within one, the nearest canvas.
    if (best === null || (best.zone !== zone && best.zone.contains(zone)) || (best.zone === zone && distance < best.distance)) {
      best = { instance, view, zone, distance }
    }
  }
  return best === null ? null : { instance: best.instance, view: best.view, inEditor: false }
}

/* A touch screen scrolls and places the caret with its own gestures; the
   mouse events it synthesises after a tap are not a marquee. */
let lastTouch = 0
function onTouch(): void { lastTouch = performance.now() }

function onPointerDown(event: MouseEvent): void {
  if (event.button !== 0 || gesture !== null || performance.now() - lastTouch < 1000) return
  const target = event.target instanceof Element ? event.target : null
  if (target === null) return
  if (target.closest(KEEP) !== null) return
  const candidate = candidateFor(target, event.clientY)
  if (candidate === null) {
    // Elsewhere in the app: a click there ends any block selection.
    for (const instance of instances) {
      const view = viewOf(instance.editor)
      if (view !== undefined && isBlockSelection(view.state.selection) && !view.dom.contains(target)) clearBlockSelection(view)
    }
    return
  }
  const { instance, view, inEditor } = candidate
  if (inEditor && target.closest('.bn-block-content') !== null) {
    // In a block's own row: text belongs to the editor, unless Shift extends a block selection.
    if (event.shiftKey && isBlockSelection(view.state.selection)) {
      const id = blockIdAt(target, view)
      if (id !== null) {
        event.preventDefault()
        event.stopPropagation()
        selectBlocks(view, [...selectedIds(instance.editor), id])
        view.focus()
      }
    }
    return
  }
  if (!inEditor && (target.closest(INTERACTIVE) !== null || hasOwnText(target))) return
  // Empty space: no native text selection, no editor click; the band decides.
  event.preventDefault()
  if (inEditor) event.stopPropagation()
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== view.dom && !view.dom.contains(active) && active !== document.body) active.blur()
  const scroller = scrollerOf(view.dom)
  const extending = event.shiftKey && isBlockSelection(view.state.selection)
  gesture = {
    instance, view, scroller, target, inEditor,
    startX: event.clientX,
    startY: event.clientY + scrollTopOf(scroller),
    base: extending ? selectedIds(instance.editor) : [],
    pointerX: event.clientX,
    pointerY: event.clientY,
    started: false,
    frame: 0,
    rect: null,
    lastKey: '',
  }
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
  window.addEventListener('blur', onCancel)
}

/* ---- Keys ---- */

/* Only keys typed into the editing host itself: a field inside a block (a
   diagram's source, a Task's title) keeps its own keys. */
function instanceForKey(event: KeyboardEvent): { instance: Instance; view: EditorView } | null {
  for (const instance of instances) {
    const view = viewOf(instance.editor)
    if (view !== undefined && event.target === view.dom) return { instance, view }
  }
  return null
}

function currentBlockId(view: EditorView): string | null {
  const $from = view.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') return node.attrs.id
  }
  const after = $from.nodeAfter
  return after !== null && typeof after.attrs.id === 'string' ? after.attrs.id : null
}

function siblingIds(view: EditorView, direction: -1 | 1): string | null {
  const { selection, doc } = view.state
  const $edge = doc.resolve(direction === -1 ? selection.from : selection.to)
  const node = direction === -1 ? $edge.nodeBefore : $edge.nodeAfter
  if (node !== null && typeof node.attrs.id === 'string') return node.attrs.id
  // At the edge of a nested run: step out to the parent block.
  if (direction === -1 && $edge.depth >= 2) {
    const parent = $edge.node($edge.depth - 1)
    if (typeof parent.attrs.id === 'string') return parent.attrs.id
  }
  return null
}

/** Capture phase: a block selection owns the keyboard; Cmd/Ctrl+A everywhere in the canvas. */
function onKeyCapture(event: KeyboardEvent): void {
  if (event.isComposing) return
  const found = instanceForKey(event)
  if (found === null) return
  const { instance, view } = found
  const editor = instance.editor
  if (!view.editable) return
  const mod = event.metaKey || event.ctrlKey
  const key = event.key
  const blocks = isBlockSelection(view.state.selection)

  if (mod && !event.altKey && !event.shiftKey && key.toLowerCase() === 'a') {
    const all = editor.document.map((block) => block.id)
    if (!blocks) {
      const { selection, doc } = view.state
      const $from = selection.$from
      const sameBlock = $from.parent.inlineContent && $from.sameParent(selection.$to)
      const whole = sameBlock && selection.from === $from.start() && selection.to === $from.end()
      if (sameBlock && !whole && $from.parent.content.size > 0) {
        event.preventDefault()
        event.stopPropagation()
        view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, $from.start(), $from.end())))
        return
      }
    }
    event.preventDefault()
    event.stopPropagation()
    selectBlocks(view, all)
    return
  }
  const stop = (): void => { event.preventDefault(); event.stopPropagation() }
  if (!blocks) {
    /* Esc in text selects the block (before BlockNote's own Escape, which
       blurs), unless a suggestion menu is open and Esc is its to close. */
    if (key !== 'Escape' || event.shiftKey || mod || editor.getExtension(SuggestionMenu)?.shown()) return
    const id = currentBlockId(view)
    if (id === null) return
    stop()
    selectBlocks(view, [id])
    return
  }

  /* Esc clears and leaves the editor, so the next Esc reaches whatever holds
     the canvas (a peek closes), as BlockNote's own Escape intends. */
  if (key === 'Escape') { stop(); clearBlockSelection(view); view.dom.blur(); return }
  if (key === 'Backspace' || key === 'Delete') { stop(); removeSelected(editor); return }
  if (key === 'Tab') { stop(); nestSelected(editor, event.shiftKey ? 'out' : 'in'); return }
  if (mod && key.toLowerCase() === 'd') { stop(); duplicateSelected(editor); return }
  if (mod && (key === '/' || event.code === 'Slash')) { stop(); instance.openTurnInto(); return }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    stop()
    const ids = selectedIds(editor)
    const next = siblingIds(view, key === 'ArrowUp' ? -1 : 1)
    if (next === null) return
    selectBlocks(view, event.shiftKey ? [...ids, next] : [next])
    return
  }
  if (key === 'Enter') {
    stop()
    const [first] = selectedIds(editor)
    if (first !== undefined && !caretIn(view, first, 'end')) clearBlockSelection(view)
    return
  }
  // Copy, cut, paste, undo and the other shortcuts keep their meaning; a
  // typed character does not replace the blocks.
  if (!mod && key.length === 1) stop()
}

let listening = 0
function listen(): () => void {
  if (listening++ === 0) {
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('touchstart', onTouch, { capture: true, passive: true })
    document.addEventListener('keydown', onKeyCapture, true)
  }
  return () => {
    if (--listening === 0) {
      endGesture()
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('touchstart', onTouch, { capture: true })
      document.removeEventListener('keydown', onKeyCapture, true)
    }
  }
}

/* ---- Turn into, for the whole selection ---- */

function TurnIntoMenu({ editor, at, onClose }: {
  readonly editor: AnyEditor
  readonly at: { readonly left: number; readonly top: number }
  readonly onClose: (refocus: boolean) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const menu = useRef<HTMLDivElement>(null)
  const targets = useMemo(() => turnIntoTargets(editor), [editor])
  const shown = targets.filter((target) => query === '' ||
    [target.label, ...target.aliases].some((word) => word.toLowerCase().includes(query.toLowerCase())))
  useEffect(() => { menu.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    const away = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) onClose(false)
    }
    document.addEventListener('mousedown', away, true)
    return () => document.removeEventListener('mousedown', away, true)
  }, [onClose])
  const choose = (target: TurnIntoTarget | undefined): void => {
    if (target === undefined) return
    turnSelectedInto(editor, target)
    onClose(true)
  }
  return (
    <div
      ref={menu}
      data-dana-marquee-menu=""
      role="menu"
      aria-label="Turn into"
      tabIndex={-1}
      className="dana-marquee-menu fixed z-50 w-56 rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none"
      style={{ left: at.left, top: at.top }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); onClose(true) }
        else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % Math.max(shown.length, 1)) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index - 1 + shown.length) % Math.max(shown.length, 1)) }
        else if (event.key === 'Enter') { event.preventDefault(); choose(shown[active]) }
        else if (event.key === 'Backspace') { event.preventDefault(); setQuery((text) => text.slice(0, -1)) }
        else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setQuery((text) => text + event.key) }
      }}
    >
      <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{query === '' ? 'Turn into' : query}</p>
      {shown.length === 0 ? <p className="px-2 py-1.5 text-muted-foreground">No results</p> : shown.map((target, index) => (
        <button
          key={target.key}
          type="button"
          role="menuitem"
          data-active={index === active ? '' : undefined}
          className="flex h-7 w-full items-center rounded-sm px-2 text-left data-[active]:bg-accent"
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(target)}
        >{target.label}</button>
      ))}
    </div>
  )
}

/** Marquee and block selection for the enclosing `BlockNoteView`'s editor. */
export function CanvasMarquee(): React.JSX.Element | null {
  const editor = useBlockNoteEditor() as unknown as AnyEditor
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    const extension = { key: 'danaMarquee', prosemirrorPlugins: [marqueePlugin()] }
    editor.registerExtension(extension)
    const instance: Instance = {
      editor,
      openTurnInto: () => {
        const view = viewOf(editor)
        const [first] = selectedIds(editor)
        if (view === undefined || first === undefined) return
        const found = blockPositions(view.state.doc).get(first)
        const dom = found === undefined ? null : view.nodeDOM(found.pos)
        const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : view.dom.getBoundingClientRect()
        const top = Math.min(box.bottom + 4, window.innerHeight - 340)
        setMenuAt({ left: Math.max(8, Math.min(box.left, window.innerWidth - 232)), top: Math.max(8, top) })
      },
    }
    instances.add(instance)
    const stop = listen()
    /* BlockNote shows its text toolbar for any non-text selection; a block
       selection has no text to format, so it stays closed. */
    const toolbar = editor.getExtension(FormattingToolbarExtension)?.store
    const unsubscribe = toolbar?.subscribe(({ currentVal }) => {
      const view = viewOf(editor)
      if (currentVal && view !== undefined && isBlockSelection(view.state.selection)) toolbar.setState(false)
    })
    // Closed and unmounted before the selection changes, so its buttons never
    // read a block selection as text.
    if (toolbar !== undefined) toolbarClosers.set(editor, () => { if (toolbar.state) flushSync(() => toolbar.setState(false)) })
    return () => {
      toolbarClosers.delete(editor)
      unsubscribe?.()
      instances.delete(instance)
      stop()
      editor.unregisterExtension(extension)
    }
  }, [editor])
  if (menuAt === null) return null
  return createPortal(<TurnIntoMenu editor={editor} at={menuAt} onClose={(refocus) => {
    setMenuAt(null)
    if (refocus) viewOf(editor)?.focus()
  }} />, document.body)
}
