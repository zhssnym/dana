/*
Notion's marquee (rubber band) block selection, for every BlockNote canvas.
Mount once inside a `BlockNoteView`:
`<CanvasMarquee />`.

- Mouse-down in empty page space or the side margins (never in text) and
  drag: a faint rectangle; the blocks it touches become block-selected. The
  page scrolls when the pointer nears its top or bottom edge. Shift-drag adds.
- A plain click in a side margin puts the caret on that line, as the editor
  would have.
- Shift-click on a block extends a block selection to it.

The selection itself, its tint and its keys are `block-selection.ts`; this
file is only the pointer. One set of document
listeners serves every mounted canvas, and a gesture goes to the canvas whose
page area holds it (the innermost, then the nearest).
*/
import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useBlockNoteEditor } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { FormattingToolbarExtension } from '@blocknote/core/extensions'
import { Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { blockSelection, clearBlockSelection, setBlockSelection } from './block-selection.js'
import { beforeBlockSelection, isBlockSelection } from './marquee.js'
import './marquee.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- both canvas schemas pass through here
type AnyEditor = BlockNoteEditor<any, any, any>

interface Instance { readonly editor: AnyEditor }

const instances = new Set<Instance>()
/* Chrome that owns its own clicks: never a marquee. */
const KEEP = '.bn-side-menu, .bn-drag-handle-menu, .bn-suggestion-menu, .bn-formatting-toolbar, [role="menu"], [data-radix-popper-content-wrapper]'
const INTERACTIVE = 'input, textarea, select, button, a[href], label, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="slider"], [contenteditable="true"], [contenteditable=""], [draggable="true"]'
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
  return /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)
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

/* ---- The band ---- */

interface Gesture {
  readonly instance: Instance
  readonly view: EditorView
  readonly scroller: HTMLElement
  readonly startX: number
  readonly startY: number // in scroller content coordinates
  readonly base: readonly string[]
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
  const anchorY = current.startY - scrollTopOf(scroller)
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
    setBlockSelection(current.instance.editor, ids)
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
    // The keys act on the picked blocks from here (Backspace, Cmd/Ctrl+D, Tab…).
    if (isBlockSelection(view.state.selection)) view.focus()
    return
  }
  // A plain click in a side margin: the caret on that line, as the editor would have put it.
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
  if (target === null || target.closest(KEEP) !== null) return
  const candidate = candidateFor(target, event.clientY)
  if (candidate === null) return
  const { instance, view, inEditor } = candidate
  const picked = blockSelection(instance.editor)
  if (inEditor && target.closest('.bn-block-content') !== null) {
    // In a block's own row: text belongs to the editor, unless Shift extends a block selection.
    const id = event.shiftKey && picked.length > 0 ? blockIdAt(target, view) : null
    if (id !== null) {
      event.preventDefault()
      event.stopPropagation()
      setBlockSelection(instance.editor, [...picked, id])
      view.focus()
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
  const base = event.shiftKey ? picked : []
  if (!event.shiftKey) clearBlockSelection(instance.editor)
  gesture = {
    instance, view, scroller, base,
    startX: event.clientX,
    startY: event.clientY + scrollTopOf(scroller),
    pointerX: event.clientX,
    pointerY: event.clientY,
    started: false,
    frame: 0,
    rect: null,
    lastKey: base.join(' '),
  }
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
  window.addEventListener('blur', onCancel)
}

/* BlockNote's handle menu opens on press; once the press becomes a drag the
   menu has nothing to offer, so the drag closes it. */
function onDragStart(event: DragEvent): void {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.bn-side-menu') === null || target === null) return
  document.body.classList.add('dana-block-dragging')
  /* Hidden while the drag lasts (closing it then would unfreeze the gutter
     and cancel the drag), and closed for real once it ends: the menu
     dismisses on Escape, which the selection's keys ignore as untrusted. */
  const end = (): void => {
    window.removeEventListener('dragend', end, true)
    window.removeEventListener('drop', end, true)
    window.setTimeout(() => {
      for (const menu of document.querySelectorAll<HTMLElement>('.dana-block-menu')) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      document.body.classList.remove('dana-block-dragging')
    }, 0)
  }
  window.addEventListener('dragend', end, true)
  window.addEventListener('drop', end, true)
}

let listening = 0
function listen(): () => void {
  if (listening++ === 0) {
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('touchstart', onTouch, { capture: true, passive: true })
    document.addEventListener('dragstart', onDragStart, true)
  }
  return () => {
    if (--listening === 0) {
      endGesture()
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('touchstart', onTouch, { capture: true })
      document.removeEventListener('dragstart', onDragStart, true)
    }
  }
}

/** Marquee selection for the enclosing `BlockNoteView`'s editor. */
export function CanvasMarquee(): null {
  const editor = useBlockNoteEditor() as unknown as AnyEditor
  useEffect(() => {
    const instance: Instance = { editor }
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
    }
  }, [editor])
  return null
}
