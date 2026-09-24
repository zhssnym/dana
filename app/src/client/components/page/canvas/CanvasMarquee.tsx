/*
Notion's marquee (rubber band) block selection, for every BlockNote canvas.
Mount once inside a `BlockNoteView`, within its `BlockMenuContext`:
`<CanvasMarquee />`.

- Mouse-down in empty page space or the side margins (never in text) and
  drag: a faint rectangle; the blocks it touches become block-selected. The
  page scrolls when the pointer nears its top or bottom edge. Shift-drag adds.
- A plain click in a side margin puts the caret on that line, as the editor
  would have.
- Shift-click on a block extends a block selection to it.
- Cmd/Ctrl+/ on a selection opens the block menu's Turn into for all of them.

The selection itself, its tint and its keys are `block-selection.ts`; this
file is only the pointer and the Turn into popover. One set of document
listeners serves every mounted canvas, and a gesture goes to the canvas whose
page area holds it (the innermost, then the nearest).
*/
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useBlockNoteEditor } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { FormattingToolbarExtension } from '@blocknote/core/extensions'
import { Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { blockSelection, clearBlockSelection, onTurnIntoRequest, setBlockSelection } from './block-selection.js'
import { BlockMenuContext } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { beforeBlockSelection, blockPositions, isBlockSelection } from './marquee.js'
import { isCurrent } from './turn-into.js'
import type { TreeBlock, TurnTarget } from './turn-into.js'
import { Check } from '../../../lib/icons.js'
import './marquee.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- both canvas schemas pass through here
type AnyEditor = BlockNoteEditor<any, any, any>

interface Instance { readonly editor: AnyEditor }

const instances = new Set<Instance>()
/* Chrome that owns its own clicks: never a marquee. */
const KEEP = '[data-dana-marquee-menu], .bn-side-menu, .bn-drag-handle-menu, .bn-suggestion-menu, .bn-formatting-toolbar, [role="menu"], [data-radix-popper-content-wrapper]'
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
  const end = (): void => { document.body.classList.remove('dana-block-dragging'); window.removeEventListener('dragend', end, true); window.removeEventListener('drop', end, true) }
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

/* ---- Turn into, for the whole selection: the block menu's own kinds and act ---- */

/** The kinds every selected block may become here (the block menu's rules). */
function sharedTargets(editor: AnyEditor, model: BlockMenuModel, ids: readonly string[]): { blocks: TreeBlock[]; targets: readonly TurnTarget[] } {
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block === undefined ? [] : [block] })
  let targets: readonly TurnTarget[] | null = null
  for (const block of blocks) {
    const own = model.targets(block)
    if (own.length === 0) continue // a Task, a Folder row, an image: it stays what it is
    targets = targets === null ? own : targets.filter((target) => own.some((other) => other.key === target.key))
  }
  return { blocks, targets: targets ?? [] }
}

function TurnIntoMenu({ editor, model, ids, at, onClose }: {
  readonly editor: AnyEditor
  readonly model: BlockMenuModel
  readonly ids: readonly string[]
  readonly at: { readonly left: number; readonly top: number }
  readonly onClose: (refocus: boolean) => void
}): React.JSX.Element {
  const { blocks, targets } = useMemo(() => sharedTargets(editor, model, ids), [editor, model, ids])
  const [active, setActive] = useState(0)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => { menu.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const away = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) onClose(false)
    }
    document.addEventListener('mousedown', away, true)
    return () => document.removeEventListener('mousedown', away, true)
  }, [onClose])
  const choose = (target: TurnTarget | undefined): void => {
    if (target === undefined) return
    model.turnInto(ids, target)
    // The blocks stay picked, as they were when the menu opened.
    if (ids.every((id) => editor.getBlock(id) !== undefined)) setBlockSelection(editor, ids)
    onClose(true)
  }
  const text = blocks.filter((block) => model.targets(block).length > 0)
  return (
    <div
      ref={menu}
      data-dana-marquee-menu=""
      role="menu"
      aria-label="Turn into"
      tabIndex={-1}
      className="bn-menu-dropdown dana-block-menu fixed z-50 outline-none"
      style={{ left: at.left, top: at.top }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); onClose(true) }
        else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % targets.length) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index - 1 + targets.length) % targets.length) }
        else if (event.key === 'Enter') { event.preventDefault(); choose(targets[active]) }
      }}
    >
      <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">Turn into</p>
      {targets.map((target, index) => (
        <div
          key={target.key}
          role="menuitem"
          tabIndex={-1}
          data-highlighted={index === active ? '' : undefined}
          className="bn-menu-item flex cursor-default items-center justify-between gap-6 rounded-sm px-2 data-[highlighted]:bg-accent"
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(target)}
        >
          {target.title}
          {text.length > 0 && text.every((block) => isCurrent(block, target)) ? <Check size={14} /> : null}
        </div>
      ))}
    </div>
  )
}

/** Marquee selection and Cmd/Ctrl+/ Turn into for the enclosing `BlockNoteView`'s editor. */
export function CanvasMarquee(): React.JSX.Element | null {
  const editor = useBlockNoteEditor() as unknown as AnyEditor
  const model = useContext(BlockMenuContext)
  const [menu, setMenu] = useState<{ ids: readonly string[]; left: number; top: number } | null>(null)
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
    const offTurnInto = onTurnIntoRequest(editor, () => {
      const view = viewOf(editor)
      const ids = blockSelection(editor)
      const first = ids[0]
      if (view === undefined || first === undefined || model === null) return
      if (sharedTargets(editor, model, ids).targets.length === 0) return
      const found = blockPositions(view.state.doc).get(first)
      const dom = found === undefined ? null : view.nodeDOM(found.pos)
      const content = dom instanceof HTMLElement ? dom.querySelector('.bn-block-content') ?? dom : view.dom
      const box = content.getBoundingClientRect()
      setMenu({ ids, left: Math.max(8, Math.min(box.left, window.innerWidth - 240)), top: Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 380)) })
    })
    return () => {
      offTurnInto()
      toolbarClosers.delete(editor)
      unsubscribe?.()
      instances.delete(instance)
      stop()
    }
  }, [editor, model])
  if (menu === null || model === null) return null
  return createPortal(<TurnIntoMenu editor={editor} model={model} ids={menu.ids} at={menu} onClose={(refocus) => {
    setMenu(null)
    if (refocus) viewOf(editor)?.focus()
  }} />, document.body)
}
